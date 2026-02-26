import { createServiceSupabaseClient } from '../supabase/admin';
import { extractPdfText } from './pdf';
import { extractStatusCert } from './extract';
import { generateReview } from './generate';
import { DEFAULT_TEMPLATE } from './templates';
import { canGenerateReview, consumeEntitlement } from './entitlements';
import { buildStatusCertDocxBuffer } from './docx';
import { CrossCheckItem, ExtractedJson, FlagItem, ReviewSection, TemplateJson } from './types';
import { reviewTextToSections, sectionsToReviewText } from './editor';

export type JobProgressUpdate = {
  stage?: string;
  progress?: number;
  status?: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  error_message?: string | null;
  result?: Record<string, unknown> | null;
};
const PARSE_CONCURRENCY = Math.max(1, Number(process.env.STATUSCERT_PARSE_CONCURRENCY || 3));

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<void>
) {
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async (_, workerIndex) => {
    for (let i = workerIndex; i < items.length; i += concurrency) {
      await handler(items[i], i);
    }
  });
  await Promise.all(workers);
}

function htmlFromSections(sections: { title: string; content?: string }[]) {
  return sections
    .map((section) => `<h2>${section.title}</h2><p>${(section.content || '').replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

function isPlaceholderTitle(title?: string | null) {
  return !title || /^untitled status certificate/i.test(title.trim());
}

function formatTimestampForTitle(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function cleanTitlePart(value?: string | null) {
  if (!value) return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/,\s*during normal business hours.*$/i, '')
    .replace(/\bprovided a request is in writing.*$/i, '')
    .trim();
}

function buildAutoReviewTitle(extracted: ExtractedJson) {
  const cleanUnit = cleanTitlePart(extracted.unit);
  const cleanAddress = cleanTitlePart(extracted.property_address);
  const subject =
    (cleanUnit && cleanAddress && `${cleanUnit} - ${cleanAddress}`) ||
    cleanAddress ||
    cleanUnit ||
    cleanTitlePart(extracted.corporation_name) ||
    'Status Certificate';
  return `${subject.slice(0, 120)} - ${formatTimestampForTitle(new Date())}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function extractFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const captured = match?.[1] || match?.[0];
    if (captured && String(captured).trim()) {
      return String(captured).replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

function reconcileExtractedFacts(rawText: string, extracted: ExtractedJson) {
  const text = rawText || '';
  const normalized = { ...extracted };
  const conflicts: Array<{ field: string; ai_value: string | null; source_value: string | null }> = [];

  const sourceCorporation = extractFirstMatch(text, [
    /Toronto\s+Standard\s+Condominium\s+Corporation\s+No\.?\s*\d+/i,
    /TSCC\s*\d+/i
  ]);
  const sourceAddress = extractFirstMatch(text, [
    /(\d+\s+ST\.?\s+NICHOLAS\s+ST(?:REET)?(?:,\s*UNIT\s*\d+)?\s*,\s*TORONTO(?:,\s*ONTARIO)?(?:,\s*[A-Z]\d[A-Z]\s*\d[A-Z]\d)?)/i,
    /(\d+\s+[A-Z0-9.\s]{3,80}\s*,\s*Toronto(?:,\s*Ontario)?(?:,\s*[A-Z]\d[A-Z]\s*\d[A-Z]\d)?)/i
  ]);
  const sourceUnit = extractFirstMatch(text, [
    /(UNIT\s+\d{2,4}\b)/i,
    /UNIT\s+\d+\s*,?\s*LEVEL\s+\d+/i,
    /(UNIT\s+\d+)/i
  ]);
  const sourceCommonExpenses = extractFirstMatch(text, [
    /common expenses[^$\n]*\$\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    /amount of \$\s*([0-9,]+(?:\.[0-9]{2})?)/i
  ]);
  const sourceReserveFund = extractFirstMatch(text, [
    /reserve fund[^$\n]*\$\s*([0-9,]+(?:\.[0-9]{2})?)/i
  ]);

  const reconcile = (field: keyof ExtractedJson, sourceValue: string | null, formatter?: (value: string) => string) => {
    if (!sourceValue) return;
    const finalSource = formatter ? formatter(sourceValue) : sourceValue;
    const aiValue = normalized[field] ? String(normalized[field]) : null;
    if (aiValue && aiValue.trim() && aiValue.trim() !== finalSource.trim()) {
      conflicts.push({ field: String(field), ai_value: aiValue, source_value: finalSource });
    }
    (normalized as Record<string, unknown>)[field] = finalSource;
  };

  reconcile('corporation_name', sourceCorporation);
  reconcile('property_address', sourceAddress);
  reconcile('unit', sourceUnit);
  reconcile('common_expenses', sourceCommonExpenses, (value) => `$${value}`);
  reconcile('reserve_fund_balance', sourceReserveFund, (value) => `$${value}`);

  return { extracted: normalized, conflicts };
}

function normalizeComparable(value?: string | null) {
  if (!value) return '';
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9.$-]/g, '').trim();
}

function findEvidenceByField(extracted: ExtractedJson, fieldNames: string[]) {
  const pool = Array.isArray(extracted.evidence) ? extracted.evidence : [];
  return pool.filter((entry) => fieldNames.includes((entry.field || '').toLowerCase()));
}

function formatCitation(entry: { page: number; paragraph?: string }) {
  if (!entry?.page) return '';
  if (entry.paragraph && String(entry.paragraph).trim()) {
    return `[p.${entry.page}, para ${String(entry.paragraph).trim()}]`;
  }
  return `[p.${entry.page}]`;
}

function ensureInlineCitation(content: string, extracted: ExtractedJson, evidenceFields: string[]) {
  if (!content || /\[p\.\d+/i.test(content)) return content;
  const evidence = findEvidenceByField(extracted, evidenceFields);
  const citation = evidence.length ? formatCitation(evidence[0]) : '';
  return citation ? `${content.trim()} ${citation}` : content;
}

function applyCitationRules(sections: ReviewSection[], extracted: ExtractedJson) {
  const map: Record<string, string[]> = {
    summary: ['common_expenses', 'reserve_fund_balance', 'special_assessments', 'legal_proceedings'],
    insurance: ['insurance_term', 'insurance_required_policies_status', 'insurance_deductibles'],
    budget_reserve: ['common_expenses', 'reserve_fund_balance', 'reserve_fund_study_date'],
    leasing: ['restrictions_summary', 'leased_unit_count'],
    additional: ['restrictions_summary', 'legal_proceedings']
  };

  return sections.map((section) => {
    const fields = map[section.key];
    if (!fields || !section.content) return section;
    return { ...section, content: ensureInlineCitation(section.content, extracted, fields) };
  });
}

function computeApsCrossChecks(extracted: ExtractedJson) {
  const aps = extracted.aps_extracted;
  if (!aps?.aps_present) return [] as CrossCheckItem[];

  const checks: Array<{ key: CrossCheckItem['key']; label: string; aps: string | null | undefined; statusCert: string | null | undefined; highRisk?: boolean }> = [
    { key: 'unit', label: 'Unit', aps: aps.unit, statusCert: extracted.unit, highRisk: true },
    { key: 'parking', label: 'Parking', aps: aps.parking, statusCert: extracted.parking },
    { key: 'locker', label: 'Locker', aps: aps.locker, statusCert: extracted.locker },
    { key: 'bike', label: 'Bike', aps: aps.bike, statusCert: extracted.bike },
    { key: 'common_expenses', label: 'Common expenses', aps: aps.common_expenses, statusCert: extracted.common_expenses, highRisk: true }
  ];

  return checks.map((item) => {
    const apsValue = item.aps ? String(item.aps).trim() : null;
    const certValue = item.statusCert ? String(item.statusCert).trim() : null;
    if (!apsValue || !certValue) {
      return {
        key: item.key,
        label: item.label,
        aps_value: apsValue,
        status_cert_value: certValue,
        status: 'NOT_FOUND',
        note: 'Could not compare because one side is missing.'
      } as CrossCheckItem;
    }
    const same = normalizeComparable(apsValue) === normalizeComparable(certValue);
    return {
      key: item.key,
      label: item.label,
      aps_value: apsValue,
      status_cert_value: certValue,
      status: same ? 'MATCH' : 'MISMATCH',
      severity: same ? undefined : item.highRisk ? 'HIGH' : 'MED',
      note: same ? 'APS and status certificate match.' : 'APS and status certificate values differ. Confirm before closing.'
    } as CrossCheckItem;
  });
}

function buildCrossCheckFlags(extracted: ExtractedJson) {
  const checks = Array.isArray(extracted.cross_checks) ? extracted.cross_checks : [];
  const apsEvidence = extracted.aps_extracted?.evidence || [];
  return checks
    .filter((check) => check.status === 'MISMATCH')
    .map((check) => ({
      key: `aps_mismatch_${check.key}`,
      title: `APS mismatch: ${check.label}`,
      severity: (check.severity || 'MED') as 'MED' | 'HIGH',
      evidence: apsEvidence
        .filter((e) => e.field === check.key)
        .slice(0, 2)
        .map((e) => ({ quote: e.quote, page: e.page, paragraph: e.paragraph })),
      why_it_matters: `${check.label} in APS does not match status certificate value.`,
      recommended_follow_up: 'Confirm contractual details with client and request clarification from listing side before closing.'
    })) as FlagItem[];
}

function buildUnusualClauseFlags(extracted: ExtractedJson) {
  const clauses = Array.isArray(extracted.unusual_clauses) ? extracted.unusual_clauses : [];
  return clauses
    .filter((clause) => clause && clause.trim())
    .slice(0, 5)
    .map((clause, index) => ({
      key: `unusual_clause_${index + 1}`,
      title: `Unusual clause to review: ${clause}`,
      severity: 'MED' as const,
      evidence: [],
      why_it_matters: 'This item appears non-standard and should be reviewed with the client and supervising lawyer.',
      recommended_follow_up: 'Confirm implications and closing impact of this clause.'
    }));
}

function injectInsuranceComplianceLine(sections: ReviewSection[], extracted: ExtractedJson) {
  return sections.map((section) => {
    if (section.key !== 'insurance') return section;
    const status = extracted.insurance_required_policies_status;
    const hasSecured = status === 'HAS_REQUIRED_POLICIES' ? 'has' : 'has not';
    const basisEvidence = findEvidenceByField(extracted, ['insurance_required_policies_status', 'insurance_term']);
    const citation = basisEvidence.length ? ` ${formatCitation(basisEvidence[0])}` : '';
    const requiredLine = `According to the Status Certificate, the Corporation ${hasSecured} secured all policies of insurance required under the Condominium Act, 1998.${citation}`;
    const content = (section.content || '').trim();
    if (!content) return { ...section, content: requiredLine };
    if (/secured all policies of insurance required under the condominium act, 1998/i.test(content)) {
      return section;
    }
    return { ...section, content: `${requiredLine}\n\n${content}` };
  });
}

async function updateJob(jobId: string, patch: JobProgressUpdate) {
  const admin = createServiceSupabaseClient();
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.status === 'SUCCEEDED' || patch.status === 'FAILED') {
    update.completed_at = new Date().toISOString();
  }
  await admin.from('status_cert_jobs').update(update).eq('id', jobId);
}

export async function runGenerateDraftJob(job: any) {
  const admin = createServiceSupabaseClient();
  const firmId = job.firm_id as string;
  const reviewId = job.review_id as string;

  await updateJob(job.id, { status: 'RUNNING', stage: 'VALIDATING', progress: 5 });

  const { data: review } = await admin
    .from('status_cert_reviews')
    .select('id, title, document_path, template_id, review_sections_json, created_by')
    .eq('id', reviewId)
    .eq('firm_id', firmId)
    .single();

  if (!review) {
    await updateJob(job.id, { status: 'FAILED', error_message: 'Review not found.' });
    return;
  }

  const { data: docRows } = await admin
    .from('status_cert_review_documents')
    .select('file_path')
    .eq('firm_id', firmId)
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });

  const documentPaths =
    docRows && docRows.length
      ? docRows.map((row: { file_path: string }) => row.file_path)
      : review.document_path
      ? [review.document_path]
      : [];

  if (!documentPaths.length) {
    await admin.from('status_cert_reviews').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', reviewId);
    await updateJob(job.id, { status: 'FAILED', error_message: 'No documents uploaded.' });
    return;
  }

  await admin.from('status_cert_reviews').update({ status: 'PROCESSING', updated_at: new Date().toISOString() }).eq('id', reviewId);

  await updateJob(job.id, { stage: 'OCR_PARSE', progress: 10 });
  const totalFiles = documentPaths.length;
  const parseBase = 10;
  const parseRange = 40;
  const mergedTexts: string[] = new Array(totalFiles).fill('');
  let filesProcessed = 0;
  await runWithConcurrency(documentPaths, PARSE_CONCURRENCY, async (documentPath, index) => {
    const { data: file, error } = await admin.storage.from('documents').download(documentPath);
    if (error || !file) {
      throw new Error(`Unable to download ${documentPath}`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = documentPath.split('/').pop() || documentPath;
    const parsed = await extractPdfText({ buffer, filename: fileName });
    mergedTexts[index] = `\n\n=== FILE: ${fileName} ===\n\n${parsed.text}\n`;
    filesProcessed += 1;
    const parseProgress = parseBase + Math.floor((filesProcessed / totalFiles) * parseRange);
    await updateJob(job.id, {
      stage: 'OCR_PARSE',
      progress: parseProgress,
      result: { filesTotal: totalFiles, filesProcessed, currentFileName: fileName }
    });
  });
  const mergedText = mergedTexts.join('');

  await updateJob(job.id, { stage: 'EXTRACT_LLM', progress: 55 });
  const { extracted, model: extractModel, promptVersion: extractPromptVersion } = await extractStatusCert(mergedText);
  const reconciled = reconcileExtractedFacts(mergedText, extracted);
  reconciled.extracted.cross_checks = computeApsCrossChecks(reconciled.extracted);

  await admin
    .from('status_cert_reviews')
    .update({
      extracted_json: extracted,
      status: 'EXTRACTED',
      model: extractModel,
      prompt_version: extractPromptVersion,
      updated_at: new Date().toISOString()
    })
    .eq('id', reviewId)
    .eq('firm_id', firmId);

  if (isPlaceholderTitle(review.title)) {
    const autoTitle = buildAutoReviewTitle(reconciled.extracted);
    await admin
      .from('status_cert_reviews')
      .update({ title: autoTitle, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .eq('firm_id', firmId);
  }

  await updateJob(job.id, { stage: 'GENERATE_LLM', progress: 85 });

  const { data: billing } = await admin
    .from('firm_billing')
    .select('trial_remaining, credits_balance, status, plan_type, founder_override')
    .eq('firm_id', firmId)
    .single();

  const activeSubscription = billing?.status === 'active' && (billing?.plan_type === 'monthly' || billing?.plan_type === 'yearly');
  const entitlementState = {
    founderOverride: !!billing?.founder_override,
    activeSubscription: !!activeSubscription,
    trialRemaining: billing?.trial_remaining ?? Number(process.env.FREE_TRIAL_REVIEWS || 1),
    creditsBalance: billing?.credits_balance ?? 0
  };

  if (!canGenerateReview(entitlementState)) {
    await admin.from('status_cert_reviews').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', reviewId);
    await updateJob(job.id, { status: 'FAILED', error_message: 'No entitlements remaining.' });
    return;
  }

  let template = DEFAULT_TEMPLATE as TemplateJson;

  const templateLookupId = (job.payload as any)?.templateId || review.template_id;
  if (templateLookupId) {
    const { data: templateRow } = await admin
      .from('status_cert_templates')
      .select('template_json')
      .eq('id', templateLookupId)
      .single();
    if (templateRow?.template_json) template = templateRow.template_json;
  } else {
    const { data: defaultTemplate } = await admin
      .from('status_cert_templates')
      .select('template_json')
      .or(`and(firm_id.eq.${firmId},is_default.eq.true),and(firm_id.is.null,is_default.eq.true)`)
      .order('firm_id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (defaultTemplate?.template_json) template = defaultTemplate.template_json;
  }

  const { data: firm } = await admin.from('firms').select('name').eq('id', firmId).single();

  const { sections, flags, followUps, model, promptVersion } = await generateReview({
    extracted: reconciled.extracted,
    template,
    firmName: firm?.name || 'Firm',
    disclaimers: template.disclaimers || []
  });

  const missingFields = Array.isArray(reconciled.extracted.missing_fields) ? reconciled.extracted.missing_fields : [];
  const crossChecks = Array.isArray(reconciled.extracted.cross_checks) ? reconciled.extracted.cross_checks : [];
  const crossCheckFollowUps = crossChecks
    .filter((check) => check.status === 'MISMATCH')
    .map((check) => `APS mismatch detected for ${check.label}. APS: ${check.aps_value || 'Not found'}; Status Certificate: ${check.status_cert_value || 'Not found'}. Resolve before closing.`);
  const missingFieldFollowUps = missingFields.map(
    (fieldKey) => `Missing information: ${fieldKey}. Not found in provided documents. Request additional supporting records.`
  );
  const missingFieldFlags: FlagItem[] = missingFields.map((fieldKey) => ({
    key: `missing_${fieldKey}`,
    title: `Missing information: ${fieldKey}`,
    severity: 'MED',
    evidence: [],
    why_it_matters: 'This detail was not found in the provided status certificate documents.',
    recommended_follow_up: 'Request supporting documents or confirm this point before closing.'
  }));

  const allFollowUps = [...(followUps || []), ...missingFieldFollowUps, ...crossCheckFollowUps];
  const followUpSection: ReviewSection[] = allFollowUps.length
    ? [{ key: 'follow_ups', title: 'Follow-ups / Action Items', instructions: '', style: 'narrative', content: allFollowUps.map((f) => `- ${f}`).join('\n') }]
    : [];

  const uniqueSectionLines = new Set<string>();
  const deDuplicatedSections = sections.map((section) => {
    if (!section.content) return section;
    const lines = section.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const key = line.toLowerCase();
        if (uniqueSectionLines.has(key)) return false;
        uniqueSectionLines.add(key);
        return true;
      });
    return { ...section, content: lines.join('\n') };
  });

  let finalSections = injectInsuranceComplianceLine(deDuplicatedSections, reconciled.extracted);
  finalSections = applyCitationRules(finalSections, reconciled.extracted);
  finalSections = [...finalSections, ...followUpSection];

  const crossCheckFlags = buildCrossCheckFlags(reconciled.extracted);
  const unusualClauseFlags = buildUnusualClauseFlags(reconciled.extracted);
  const reviewText = sectionsToReviewText(finalSections);
  const reviewHtml = htmlFromSections(finalSections);

  await admin
    .from('status_cert_reviews')
    .update({
      review_sections_json: finalSections,
      extracted_json: reconciled.extracted,
      flags_json: [...(flags || []), ...missingFieldFlags, ...crossCheckFlags, ...unusualClauseFlags],
      review_text: reviewText,
      review_html: reviewHtml,
      status: 'READY',
      model,
      prompt_version: promptVersion,
      updated_at: new Date().toISOString()
    })
    .eq('id', reviewId)
    .eq('firm_id', firmId);

  if (!billing?.founder_override && !activeSubscription) {
    const consumed = consumeEntitlement(entitlementState);
    await admin
      .from('firm_billing')
      .update({
        trial_remaining: consumed.trialRemaining,
        credits_balance: consumed.creditsBalance,
        updated_at: new Date().toISOString()
      })
      .eq('firm_id', firmId);
  }

  await admin.from('status_cert_events').insert({
    firm_id: firmId,
    review_id: reviewId,
    actor_id: review.created_by,
    event_type: 'REVIEW_GENERATED',
    payload: { followUps: allFollowUps, missingFields, crossChecks, extractionConflicts: reconciled.conflicts }
  });

  await updateJob(job.id, { status: 'SUCCEEDED', stage: 'DONE', progress: 100, result: { reviewId } });
}

export async function runExportDocxJob(job: any) {
  const admin = createServiceSupabaseClient();
  const firmId = job.firm_id as string;
  const reviewId = job.review_id as string;

  await updateJob(job.id, { status: 'RUNNING', stage: 'DOCX_BUILD', progress: 60 });

  const { data: review } = await admin
    .from('status_cert_reviews')
    .select('id, title, review_text, review_sections_json, flags_json, extracted_json, template_id')
    .eq('id', reviewId)
    .eq('firm_id', firmId)
    .single();

  if (!review?.review_sections_json && !review?.review_text) {
    await updateJob(job.id, { status: 'FAILED', error_message: 'Generate review first.' });
    return;
  }

  const { data: firm } = await admin.from('firms').select('name').eq('id', firmId).single();
  let template = DEFAULT_TEMPLATE as TemplateJson;

  if (review.template_id) {
    const { data: templateRow } = await admin
      .from('status_cert_templates')
      .select('template_json')
      .eq('id', review.template_id)
      .single();
    if (templateRow?.template_json) template = templateRow.template_json;
  }

  const sectionsForDocx =
    review.review_text && review.review_text.trim()
      ? reviewTextToSections(template.sections, review.review_text)
      : ((review.review_sections_json || []) as ReviewSection[]);

  const buffer = await buildStatusCertDocxBuffer({
    firmName: firm?.name || 'Firm',
    matterTitle: review.title,
    generatedAt: new Date(),
    extracted: (review.extracted_json || null) as ExtractedJson | null,
    template,
    sections: sectionsForDocx,
    flags: (review.flags_json || []) as FlagItem[]
  });

  await updateJob(job.id, { stage: 'UPLOAD_EXPORT', progress: 90 });
  const titleStem = slugify(review.title || '');
  const fileStem = titleStem || `status-certificate-${reviewId.slice(0, 8)}`;
  const path = `${firmId}/${reviewId}/${fileStem}-${Date.now()}.docx`;
  const { error: uploadError } = await admin.storage.from('documents').upload(path, buffer, {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    metadata: { firm_id: firmId, review_id: reviewId }
  });

  if (uploadError) {
    await updateJob(job.id, { status: 'FAILED', error_message: uploadError.message });
    return;
  }

  const { data: signed } = await admin.storage.from('documents').createSignedUrl(path, 60 * 60);

  await admin
    .from('status_cert_reviews')
    .update({ exported_doc_path: path, status: 'EXPORTED', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
    .eq('firm_id', firmId);

  await admin.from('status_cert_events').insert({
    firm_id: firmId,
    review_id: reviewId,
    event_type: 'EXPORTED',
    payload: { path }
  });

  await updateJob(job.id, {
    status: 'SUCCEEDED',
    stage: 'DONE',
    progress: 100,
    result: {
      path,
      downloadUrl: signed?.signedUrl || null,
      renderer: process.env.STATUSCERT_PRECEDENT_MODE === 'true' ? 'precedent_template' : 'programmatic'
    }
  });
}

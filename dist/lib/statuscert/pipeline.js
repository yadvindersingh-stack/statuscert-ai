"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGenerateDraftJob = runGenerateDraftJob;
exports.runExportDocxJob = runExportDocxJob;
const admin_1 = require("../supabase/admin");
const pdf_1 = require("./pdf");
const extract_1 = require("./extract");
const generate_1 = require("./generate");
const templates_1 = require("./templates");
const entitlements_1 = require("./entitlements");
const docx_1 = require("./docx");
const editor_1 = require("./editor");
const PARSE_CONCURRENCY = Math.max(1, Number(process.env.STATUSCERT_PARSE_CONCURRENCY || 3));
async function runWithConcurrency(items, concurrency, handler) {
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async (_, workerIndex) => {
        for (let i = workerIndex; i < items.length; i += concurrency) {
            await handler(items[i], i);
        }
    });
    await Promise.all(workers);
}
function htmlFromSections(sections) {
    return sections
        .map((section) => `<h2>${section.title}</h2><p>${(section.content || '').replace(/\n/g, '<br/>')}</p>`)
        .join('\n');
}
function isPlaceholderTitle(title) {
    return !title || /^untitled status certificate/i.test(title.trim());
}
function formatTimestampForTitle(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function buildAutoReviewTitle(extracted) {
    const subject = (extracted.unit && extracted.property_address && `${extracted.unit} - ${extracted.property_address}`) ||
        extracted.property_address ||
        extracted.unit ||
        extracted.corporation_name ||
        'Status Certificate';
    return `${subject} - ${formatTimestampForTitle(new Date())}`;
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}
async function updateJob(jobId, patch) {
    const admin = (0, admin_1.createServiceSupabaseClient)();
    const update = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status === 'SUCCEEDED' || patch.status === 'FAILED') {
        update.completed_at = new Date().toISOString();
    }
    await admin.from('status_cert_jobs').update(update).eq('id', jobId);
}
async function runGenerateDraftJob(job) {
    const admin = (0, admin_1.createServiceSupabaseClient)();
    const firmId = job.firm_id;
    const reviewId = job.review_id;
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
    const documentPaths = docRows && docRows.length
        ? docRows.map((row) => row.file_path)
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
    const mergedTexts = new Array(totalFiles).fill('');
    let filesProcessed = 0;
    await runWithConcurrency(documentPaths, PARSE_CONCURRENCY, async (documentPath, index) => {
        const { data: file, error } = await admin.storage.from('documents').download(documentPath);
        if (error || !file) {
            throw new Error(`Unable to download ${documentPath}`);
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = documentPath.split('/').pop() || documentPath;
        const parsed = await (0, pdf_1.extractPdfText)({ buffer, filename: fileName });
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
    const { extracted, model: extractModel, promptVersion: extractPromptVersion } = await (0, extract_1.extractStatusCert)(mergedText);
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
        const autoTitle = buildAutoReviewTitle(extracted);
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
    if (!(0, entitlements_1.canGenerateReview)(entitlementState)) {
        await admin.from('status_cert_reviews').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', reviewId);
        await updateJob(job.id, { status: 'FAILED', error_message: 'No entitlements remaining.' });
        return;
    }
    let template = templates_1.DEFAULT_TEMPLATE;
    const templateLookupId = job.payload?.templateId || review.template_id;
    if (templateLookupId) {
        const { data: templateRow } = await admin
            .from('status_cert_templates')
            .select('template_json')
            .eq('id', templateLookupId)
            .single();
        if (templateRow?.template_json)
            template = templateRow.template_json;
    }
    else {
        const { data: defaultTemplate } = await admin
            .from('status_cert_templates')
            .select('template_json')
            .eq('firm_id', firmId)
            .eq('is_default', true)
            .maybeSingle();
        if (defaultTemplate?.template_json)
            template = defaultTemplate.template_json;
    }
    const { data: firm } = await admin.from('firms').select('name').eq('id', firmId).single();
    const { sections, flags, followUps, model, promptVersion } = await (0, generate_1.generateReview)({
        extracted,
        template,
        firmName: firm?.name || 'Firm',
        disclaimers: template.disclaimers || []
    });
    const missingFields = Array.isArray(extracted.missing_fields) ? extracted.missing_fields : [];
    const missingFieldFollowUps = missingFields.map((fieldKey) => `Missing information: ${fieldKey}. Not found in provided documents. Request additional supporting records.`);
    const missingFieldFlags = missingFields.map((fieldKey) => ({
        key: `missing_${fieldKey}`,
        title: `Missing information: ${fieldKey}`,
        severity: 'MED',
        evidence: [],
        why_it_matters: 'This detail was not found in the provided status certificate documents.',
        recommended_follow_up: 'Request supporting documents or confirm this point before closing.'
    }));
    const allFollowUps = [...(followUps || []), ...missingFieldFollowUps];
    const followUpSection = allFollowUps.length
        ? [{ key: 'follow_ups', title: 'Follow-ups / Action Items', instructions: '', style: 'narrative', content: allFollowUps.map((f) => `- ${f}`).join('\n') }]
        : [];
    const finalSections = [...sections, ...followUpSection];
    const reviewText = (0, editor_1.sectionsToReviewText)(finalSections);
    const reviewHtml = htmlFromSections(finalSections);
    await admin
        .from('status_cert_reviews')
        .update({
        review_sections_json: finalSections,
        flags_json: [...(flags || []), ...missingFieldFlags],
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
        const consumed = (0, entitlements_1.consumeEntitlement)(entitlementState);
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
        payload: { followUps: allFollowUps, missingFields }
    });
    await updateJob(job.id, { status: 'SUCCEEDED', stage: 'DONE', progress: 100, result: { reviewId } });
}
async function runExportDocxJob(job) {
    const admin = (0, admin_1.createServiceSupabaseClient)();
    const firmId = job.firm_id;
    const reviewId = job.review_id;
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
    let template = templates_1.DEFAULT_TEMPLATE;
    if (review.template_id) {
        const { data: templateRow } = await admin
            .from('status_cert_templates')
            .select('template_json')
            .eq('id', review.template_id)
            .single();
        if (templateRow?.template_json)
            template = templateRow.template_json;
    }
    const sectionsForDocx = review.review_text && review.review_text.trim()
        ? (0, editor_1.reviewTextToSections)(template.sections, review.review_text)
        : (review.review_sections_json || []);
    const buffer = await (0, docx_1.buildStatusCertDocxBuffer)({
        firmName: firm?.name || 'Firm',
        matterTitle: review.title,
        generatedAt: new Date(),
        extracted: (review.extracted_json || null),
        template,
        sections: sectionsForDocx,
        flags: (review.flags_json || [])
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
        result: { path, downloadUrl: signed?.signedUrl || null }
    });
}

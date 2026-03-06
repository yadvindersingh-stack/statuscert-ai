"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGenerateDraftJob = runGenerateDraftJob;
exports.runExportDocxJob = runExportDocxJob;
const admin_1 = require("../supabase/admin");
const pdf_1 = require("./pdf");
const extract_1 = require("./extract");
const templates_1 = require("./templates");
const entitlements_1 = require("./entitlements");
const docx_1 = require("./docx");
const editor_1 = require("./editor");
const PARSE_CONCURRENCY = Math.max(1, Number(process.env.STATUSCERT_PARSE_CONCURRENCY || 3));
const MUST_HAVE_FIELDS = new Set([
    'corporation_name',
    'property_address',
    'unit',
    'common_expenses',
    'reserve_fund_balance',
    'insurance_required_policies_status',
    'legal_proceedings',
    'restrictions_summary'
]);
const NICE_TO_HAVE_FIELDS = new Set([
    'parking',
    'locker',
    'bike',
    'fee_increases',
    'special_assessments',
    'reserve_fund_study_date',
    'leased_unit_count'
]);
const ACTIONABLE_FOLLOW_UP_FIELDS = new Set([
    'corporation_name',
    'common_expenses',
    'special_assessments',
    'legal_proceedings',
    'fee_increases'
]);
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
function cleanTitlePart(value) {
    if (!value)
        return '';
    return value
        .replace(/\s+/g, ' ')
        .replace(/,\s*during normal business hours.*$/i, '')
        .replace(/\bprovided a request is in writing.*$/i, '')
        .trim();
}
function formatUnitForTitle(value) {
    if (!value)
        return '';
    const cleaned = cleanTitlePart(value);
    const unitMatch = cleaned.match(/unit\s*#?\s*(\d+)/i);
    if (unitMatch) {
        return `Unit ${unitMatch[1]}`;
    }
    return cleaned;
}
function normalizeUnitToken(value) {
    if (!value)
        return '';
    const match = value.match(/unit\s*#?\s*\d+/i);
    if (match)
        return match[0].replace(/\s+/g, ' ').toLowerCase();
    return value.trim().toLowerCase();
}
function removeDuplicateUnitFromAddress(address, unit) {
    if (!address)
        return address;
    const unitToken = normalizeUnitToken(unit);
    if (!unitToken)
        return address;
    const rx = new RegExp(`(?:,|\\b)?\\s*${unitToken.replace(/[#]/g, '#?').replace(/\s+/g, '\\s*')}\\b`, 'ig');
    return address
        .replace(rx, '')
        .replace(/\s+,/g, ',')
        .replace(/,\s*,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .replace(/^,\s*/, '')
        .replace(/\s*,\s*$/, '')
        .trim();
}
function shouldPrefixUnit(cleanUnit, cleanAddress) {
    if (!cleanUnit || !cleanAddress)
        return false;
    const unitToken = normalizeUnitToken(cleanUnit);
    if (!unitToken)
        return false;
    const normalizedAddress = cleanAddress.toLowerCase().replace(/\s+/g, ' ');
    return !normalizedAddress.includes(unitToken);
}
function buildAutoReviewTitle(extracted) {
    const cleanUnit = formatUnitForTitle(extracted.unit);
    const cleanAddress = removeDuplicateUnitFromAddress(cleanTitlePart(extracted.property_address), cleanUnit);
    const subject = (cleanUnit && cleanAddress && shouldPrefixUnit(cleanUnit, cleanAddress) && `${cleanUnit} - ${cleanAddress}`) ||
        cleanAddress ||
        cleanUnit ||
        cleanTitlePart(extracted.corporation_name) ||
        'Status Certificate';
    const compactSubject = subject
        .replace(/\b(unit\s*#?\s*\d+)\s*-\s*(.*\bunit\s*#?\s*\d+\b.*)/i, '$2')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const finalSubject = compactSubject || subject;
    return `${finalSubject.slice(0, 120)} - ${formatTimestampForTitle(new Date())}`;
}
function buildReviewTitleFromExtraction(extracted) {
    const raw = buildAutoReviewTitle(extracted);
    return raw
        .replace(/\s+,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
function buildReviewFilenameStem(title, reviewId) {
    const normalizedTitle = title
        .replace(/\b(unit\s*#?\s*\d+)\s*-\s*(.*\bunit\s*#?\s*\d+\b.*)/i, '$2')
        .replace(/,\s*during normal business hours.*$/i, '')
        .replace(/\bprovided a request is in writing.*$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const titleStem = slugify(normalizedTitle || '');
    return titleStem || `status-certificate-${reviewId.slice(0, 8)}`;
}
function hasDuplicateUnitTitlePattern(title) {
    if (!title)
        return false;
    return /unit\s*#?\s*\d+.*unit\s*#?\s*\d+/i.test(title);
}
function hasNoisyTitleTail(title) {
    if (!title)
        return false;
    return /during normal business hours|provided a request is in writing/i.test(title);
}
function shouldAutoRetitle(title) {
    return isPlaceholderTitle(title) || hasDuplicateUnitTitlePattern(title) || hasNoisyTitleTail(title);
}
function getCanonicalReviewTitle(title, extracted) {
    if (shouldAutoRetitle(title) && extracted) {
        return buildReviewTitleFromExtraction(extracted);
    }
    return String(title || '')
        .replace(/,\s*during normal business hours.*$/i, '')
        .replace(/\bprovided a request is in writing.*$/i, '')
        .replace(/\bunit\s*#?\s*(\d+)\b/i, 'Unit $1')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}
function extractFirstMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        const captured = match?.[1] || match?.[0];
        if (captured && String(captured).trim()) {
            return String(captured).replace(/\s+/g, ' ').trim();
        }
    }
    return null;
}
function dedupeLines(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const normalized = String(item || '').trim().replace(/\s+/g, ' ').toLowerCase();
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(String(item).trim());
    }
    return out;
}
function hasPresentValue(value) {
    if (value === null || value === undefined)
        return false;
    const normalized = String(value).trim();
    return normalized.length > 0;
}
function isNegativeOrNone(value) {
    if (!hasPresentValue(value))
        return false;
    const normalized = String(value).toLowerCase();
    return /\bnone\b|\bno\b|\bnot found\b|\bnil\b|\bnot disclosed\b|\bnot noted\b/.test(normalized);
}
function shortValue(value, max = 140) {
    if (!hasPresentValue(value))
        return '';
    const normalized = String(value)
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized.length <= max)
        return normalized;
    return `${normalized.slice(0, max - 1).trimEnd()}…`;
}
function buildConciseSummaryBullets(extracted) {
    const bullets = [];
    bullets.push(hasPresentValue(extracted.leased_unit_count)
        ? `${shortValue(extracted.leased_unit_count, 40)} units shown in paragraph 5.`
        : 'Units shown in paragraph 5: Not found in provided status certificate.');
    bullets.push(hasPresentValue(extracted.special_assessments) && !isNegativeOrNone(extracted.special_assessments)
        ? `Special assessment under paragraph 11: ${shortValue(extracted.special_assessments, 140)}.`
        : 'No special assessment under paragraph 11.');
    bullets.push(hasPresentValue(extracted.reserve_fund_balance)
        ? `Reserve fund balance is ${shortValue(extracted.reserve_fund_balance, 60)}${hasPresentValue(extracted.reserve_fund_balance_date) ? ` as of ${shortValue(extracted.reserve_fund_balance_date, 40)}` : ''}.`
        : 'Reserve fund balance (paragraph 13): Not found in provided status certificate.');
    if (hasPresentValue(extracted.fee_increases) && !isNegativeOrNone(extracted.fee_increases)) {
        bullets.push(`Review paragraph 12: ${shortValue(extracted.fee_increases, 140)}.`);
    }
    bullets.push(hasPresentValue(extracted.legal_proceedings) && !isNegativeOrNone(extracted.legal_proceedings)
        ? `Ongoing legal proceedings noted in paragraphs 18-22: ${shortValue(extracted.legal_proceedings, 160)}.`
        : 'Legal proceedings (paragraphs 18-22): No legal proceedings noted in provided status certificate.');
    const unusualDocs = Array.isArray(extracted.unusual_clauses) ? extracted.unusual_clauses.filter((item) => !isNegativeOrNone(item)) : [];
    if (unusualDocs.length) {
        bullets.push(`Unusuality found in accompanying documents: ${dedupeLines(unusualDocs).slice(0, 2).map((item) => shortValue(item, 80)).join('; ')}.`);
    }
    else {
        bullets.push('No unusuality to report for accompanying documents.');
    }
    return dedupeLines(bullets);
}
function isFlagAllowedForLawyerSummary(flag) {
    const key = String(flag.key || '').toLowerCase();
    const title = String(flag.title || '').toLowerCase();
    if (key.startsWith('missing_'))
        return false;
    if (title.includes('parking') || title.includes('locker') || title.includes('bike'))
        return false;
    if (title.includes('no mention') || title.includes('not found') || title.includes('no explicit'))
        return false;
    return true;
}
function buildConciseFollowUpSection(extracted, flags) {
    const followUps = [];
    if (hasPresentValue(extracted.corporation_name)) {
        followUps.push(`Confirm corporation name and number against status certificate before final sign-off.`);
    }
    else {
        followUps.push(`Corporation name is not available in the status certificate. Confirm before finalizing.`);
    }
    if (hasPresentValue(extracted.common_expenses)) {
        followUps.push(`Confirm common expenses amount (${shortValue(extracted.common_expenses, 40)}) and payment timing with management certificate.`);
    }
    else {
        followUps.push(`Common expenses information is not available in the status certificate. Obtain written confirmation.`);
    }
    if (hasPresentValue(extracted.special_assessments) && !isNegativeOrNone(extracted.special_assessments)) {
        followUps.push(`Special assessment disclosed: ${shortValue(extracted.special_assessments, 130)}. Confirm unit-level allocation and timing.`);
    }
    if (!hasPresentValue(extracted.special_assessments)) {
        followUps.push(`Special assessment information is not available in the status certificate. Confirm whether any levy exists.`);
    }
    if (hasPresentValue(extracted.fee_increases) && !isNegativeOrNone(extracted.fee_increases)) {
        followUps.push(`Common expense increase noted: ${shortValue(extracted.fee_increases, 130)}. Confirm effective date and updated amount.`);
    }
    if (hasPresentValue(extracted.legal_proceedings) && !isNegativeOrNone(extracted.legal_proceedings)) {
        followUps.push(`Legal proceedings disclosed. Obtain current status, exposure, and impact on purchaser risk.`);
    }
    else {
        followUps.push(`No legal proceedings noted in status certificate. Confirm with management if any new claims exist.`);
    }
    const topFlagLines = flags
        .filter(isFlagAllowedForLawyerSummary)
        .filter((flag) => ['HIGH', 'MED'].includes(String(flag.severity || '').toUpperCase()))
        .slice(0, 4)
        .map((flag) => `${flag.title}: ${shortValue(flag.recommended_follow_up, 140)}`);
    return dedupeLines([...followUps, ...topFlagLines]).slice(0, 10);
}
function dedupeFlags(flags) {
    const seen = new Set();
    return flags.filter((flag) => {
        const key = `${String(flag.key || '').toLowerCase()}|${String(flag.title || '').toLowerCase()}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function isActionableUnusualClause(clause) {
    const normalized = clause.trim().toLowerCase();
    if (!normalized)
        return false;
    if (normalized.startsWith('no ') ||
        normalized.includes('no mention') ||
        normalized.includes('not found') ||
        normalized.includes('not provided') ||
        normalized.includes('not disclosed') ||
        normalized.includes('not explicitly') ||
        normalized.includes('none') ||
        normalized.includes('missing')) {
        return false;
    }
    return true;
}
function sanitizeUnusualClauses(clauses) {
    return dedupeLines(clauses).filter((clause) => isActionableUnusualClause(clause));
}
function reconcileExtractedFacts(rawText, extracted) {
    const text = rawText || '';
    const normalized = { ...extracted };
    const conflicts = [];
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
    const sourceFeeIncrease = extractFirstMatch(text, [
        /(\d+(?:\.\d+)?%\s+increase(?:\s+effective\s+[a-z]+\s+\d{1,2},\s+\d{4})?)/i,
        /fee(?:s)?[^.\n]{0,120}increase[^.\n]{0,120}/i
    ]);
    const sourceSpecialAssessment = extractFirstMatch(text, [
        /(special assessment[^.\n]{0,180})/i
    ]);
    const sourceRestrictionsSummary = extractFirstMatch(text, [
        /(short[\s-]?term rentals?[^.\n]{0,180})/i,
        /(rules relating to the use of the unit and common elements[^.\n]{0,180})/i,
        /(lifestyle restrictions[^.\n]{0,220})/i
    ]);
    const reconcile = (field, sourceValue, formatter) => {
        if (!sourceValue)
            return;
        const finalSource = formatter ? formatter(sourceValue) : sourceValue;
        const aiValue = normalized[field] ? String(normalized[field]) : null;
        if (aiValue && aiValue.trim() && aiValue.trim() !== finalSource.trim()) {
            conflicts.push({ field: String(field), ai_value: aiValue, source_value: finalSource });
        }
        normalized[field] = finalSource;
    };
    reconcile('corporation_name', sourceCorporation);
    reconcile('property_address', sourceAddress);
    reconcile('unit', sourceUnit);
    reconcile('common_expenses', sourceCommonExpenses, (value) => `$${value}`);
    reconcile('reserve_fund_balance', sourceReserveFund, (value) => `$${value}`);
    reconcile('fee_increases', sourceFeeIncrease);
    reconcile('special_assessments', sourceSpecialAssessment);
    reconcile('restrictions_summary', sourceRestrictionsSummary);
    normalized.property_address = removeDuplicateUnitFromAddress(String(normalized.property_address || ''), normalized.unit).trim() || normalized.property_address;
    const missing = new Set(Array.isArray(normalized.missing_fields) ? normalized.missing_fields : []);
    const clearIfFound = (key) => {
        const value = normalized[key];
        if (value !== null && value !== undefined && String(value).trim()) {
            missing.delete(String(key));
        }
    };
    [
        'corporation_name',
        'property_address',
        'unit',
        'common_expenses',
        'reserve_fund_balance',
        'fee_increases',
        'special_assessments',
        'restrictions_summary'
    ].forEach((key) => clearIfFound(key));
    normalized.missing_fields = Array.from(missing);
    return { extracted: normalized, conflicts };
}
function normalizeComparable(value) {
    if (!value)
        return '';
    return value.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9.$-]/g, '').trim();
}
function hasMeaningfulValue(value) {
    if (value === null || value === undefined)
        return false;
    if (Array.isArray(value))
        return value.length > 0;
    if (typeof value === 'object')
        return Object.keys(value).length > 0;
    return String(value).trim().length > 0;
}
function findEvidenceByField(extracted, fieldNames) {
    const pool = Array.isArray(extracted.evidence) ? extracted.evidence : [];
    return pool.filter((entry) => fieldNames.includes((entry.field || '').toLowerCase()));
}
function formatCitation(entry) {
    if (!entry?.page)
        return '';
    if (entry.paragraph && String(entry.paragraph).trim()) {
        return `[p.${entry.page}, para ${String(entry.paragraph).trim()}]`;
    }
    return `[p.${entry.page}]`;
}
function ensureInlineCitation(content, extracted, evidenceFields) {
    if (!content || /\[p\.\d+/i.test(content))
        return content;
    const evidence = findEvidenceByField(extracted, evidenceFields);
    const citation = evidence.length ? formatCitation(evidence[0]) : '';
    return citation ? `${content.trim()} ${citation}` : content;
}
function applyCitationRules(sections, extracted) {
    const map = {
        summary: ['common_expenses', 'reserve_fund_balance', 'special_assessments', 'legal_proceedings'],
        insurance: ['insurance_term', 'insurance_required_policies_status', 'insurance_deductibles'],
        budget_reserve: ['common_expenses', 'reserve_fund_balance', 'reserve_fund_study_date'],
        leasing: ['restrictions_summary', 'leased_unit_count'],
        additional: ['restrictions_summary', 'legal_proceedings']
    };
    return sections.map((section) => {
        const fields = map[section.key];
        if (!fields || !section.content)
            return section;
        return { ...section, content: ensureInlineCitation(section.content, extracted, fields) };
    });
}
function computeApsCrossChecks(extracted) {
    const aps = extracted.aps_extracted;
    if (!aps?.aps_present)
        return [];
    const checks = [
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
            };
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
        };
    });
}
function buildCrossCheckFlags(extracted) {
    const checks = Array.isArray(extracted.cross_checks) ? extracted.cross_checks : [];
    const apsEvidence = extracted.aps_extracted?.evidence || [];
    return checks
        .filter((check) => check.status === 'MISMATCH')
        .map((check) => ({
        key: `aps_mismatch_${check.key}`,
        title: `APS mismatch: ${check.label}`,
        severity: (check.severity || 'MED'),
        evidence: apsEvidence
            .filter((e) => e.field === check.key)
            .slice(0, 2)
            .map((e) => ({ quote: e.quote, page: e.page, paragraph: e.paragraph })),
        why_it_matters: `${check.label} in APS does not match status certificate value.`,
        recommended_follow_up: 'Confirm contractual details with client and request clarification from listing side before closing.'
    }));
}
function buildUnusualClauseFlags(extracted) {
    const clauses = Array.isArray(extracted.unusual_clauses) ? extracted.unusual_clauses : [];
    return sanitizeUnusualClauses(clauses)
        .slice(0, 3)
        .map((clause, index) => ({
        key: `unusual_clause_${index + 1}`,
        title: `Unusual clause to review: ${clause}`,
        severity: 'MED',
        evidence: [],
        why_it_matters: 'This item appears non-standard and should be reviewed with the client and supervising lawyer.',
        recommended_follow_up: 'Confirm implications and closing impact of this clause.'
    }));
}
function injectInsuranceComplianceLine(sections, extracted) {
    return sections.map((section) => {
        if (section.key !== 'insurance')
            return section;
        const status = extracted.insurance_required_policies_status;
        const hasSecured = status === 'HAS_REQUIRED_POLICIES' ? 'has' : 'has not';
        const basisEvidence = findEvidenceByField(extracted, ['insurance_required_policies_status', 'insurance_term']);
        const citation = basisEvidence.length ? ` ${formatCitation(basisEvidence[0])}` : '';
        const requiredLine = `According to the Status Certificate, the Corporation ${hasSecured} secured all policies of insurance required under the Condominium Act, 1998.${citation}`;
        const content = (section.content || '').trim();
        if (!content)
            return { ...section, content: requiredLine };
        if (/secured all policies of insurance required under the condominium act, 1998/i.test(content)) {
            return section;
        }
        return { ...section, content: `${requiredLine}\n\n${content}` };
    });
}
function detectCriticalClauses(rawText) {
    const text = rawText || '';
    const leasingNotice = /if it is the intention of the purchaser to rent|property management must be notified|leasing agreement/i.test(text);
    const shortTermRental = /short[\s-]?term rentals?|airbnb|less than\s+30\s+days/i.test(text);
    const subMetering = /sub[\s-]?meter(?:ing)?|utilities?\s+sub[\s-]?meter/i.test(text);
    return { leasingNotice, shortTermRental, subMetering };
}
function enforceDeterministicQuality(sections, extracted, mergedText) {
    const outFlags = [];
    const outFollowUps = [];
    const clauses = detectCriticalClauses(mergedText);
    let prohibitedRemoved = 0;
    const nextSections = sections.map((section) => {
        let content = section.content || '';
        if (/reserve fund balance is healthy|reserve fund is healthy/i.test(content)) {
            content = content.replace(/reserve fund balance is healthy\.?/gi, 'Reserve fund adequacy cannot be concluded solely from provided documents.');
            content = content.replace(/reserve fund is healthy\.?/gi, 'Reserve fund adequacy cannot be concluded solely from provided documents.');
            prohibitedRemoved += 1;
            outFlags.push({
                key: 'quality_reserve_fund_claim',
                title: 'Unsupported reserve fund adequacy conclusion removed',
                severity: 'MED',
                evidence: [],
                why_it_matters: 'Reserve fund adequacy should not be stated as a definitive legal conclusion without explicit supporting analysis.',
                recommended_follow_up: 'Review reserve fund study and financials before making adequacy statements.'
            });
        }
        if (/no gaps or issues in coverage were identified/i.test(content)) {
            content = content.replace(/no gaps or issues in coverage were identified from the documents provided\.?/gi, '');
            prohibitedRemoved += 1;
        }
        return { ...section, content: content.trim() };
    });
    if (clauses.shortTermRental) {
        const hasMention = nextSections.some((s) => /short[\s-]?term rental/i.test(s.content || ''));
        if (!hasMention) {
            outFlags.push({
                key: 'detected_short_term_rental',
                title: 'Short-term rental restriction detected',
                severity: 'MED',
                evidence: [],
                why_it_matters: 'Short-term rental rules can materially impact purchaser plans.',
                recommended_follow_up: 'Confirm short-term rental restrictions with management and declaration/rules.'
            });
            outFollowUps.push('Short-term rental restrictions appear in source documents. Confirm exact prohibition language for client.');
        }
    }
    if (clauses.subMetering) {
        const hasMention = nextSections.some((s) => /sub[\s-]?meter/i.test(s.content || ''));
        if (!hasMention) {
            outFlags.push({
                key: 'detected_sub_metering',
                title: 'Sub-metering provision detected',
                severity: 'MED',
                evidence: [],
                why_it_matters: 'Sub-metering can affect utility costs and closing expectations.',
                recommended_follow_up: 'Confirm utility sub-metering obligations and billing model.'
            });
            outFollowUps.push('Sub-metering language appears in source documents. Confirm utility metering obligations.');
        }
    }
    if (clauses.leasingNotice) {
        const hasMention = nextSections.some((s) => /property management must be notified|leasing agreement|notice/i.test(s.content || ''));
        if (!hasMention) {
            outFlags.push({
                key: 'detected_leasing_notice',
                title: 'Leasing notice requirement detected',
                severity: 'LOW',
                evidence: [],
                why_it_matters: 'Leasing notices and documents are operational conditions the purchaser should know.',
                recommended_follow_up: 'Confirm leasing notice/forms required by management before tenancy.'
            });
        }
    }
    const mandatoryInsuranceLinePresent = nextSections.some((s) => s.key === 'insurance' && /secured all policies of insurance required under the condominium act, 1998/i.test(s.content || ''));
    const highRiskSections = nextSections.filter((s) => ['insurance', 'budget_reserve', 'leasing', 'additional'].includes(s.key));
    const highRiskWithCitation = highRiskSections.filter((s) => /\[p\.\d+/i.test(s.content || ''));
    const citationCoverage = highRiskSections.length
        ? Math.round((highRiskWithCitation.length / highRiskSections.length) * 100)
        : 100;
    if (citationCoverage < 95) {
        outFlags.push({
            key: 'quality_citation_coverage',
            title: 'Citation coverage below threshold',
            severity: 'MED',
            evidence: [],
            why_it_matters: 'High-risk sections should include source citations for partner review confidence.',
            recommended_follow_up: 'Regenerate or manually add page references to insurance, reserve, leasing, and additional sections.'
        });
    }
    const listedMissing = new Set(Array.isArray(extracted.missing_fields) ? extracted.missing_fields : []);
    const impliedMissing = [...MUST_HAVE_FIELDS, ...NICE_TO_HAVE_FIELDS].filter((field) => {
        const value = extracted[field];
        return value === null || value === undefined || !String(value).trim();
    });
    impliedMissing.forEach((field) => listedMissing.add(field));
    const mustMissing = [...listedMissing].filter((field) => MUST_HAVE_FIELDS.has(field));
    const niceMissing = [...listedMissing].filter((field) => NICE_TO_HAVE_FIELDS.has(field));
    const mustHaveEvidence = [...MUST_HAVE_FIELDS].reduce((acc, field) => {
        const evidence = findEvidenceByField(extracted, [field]);
        if (evidence.length)
            acc.withEvidence += 1;
        return acc;
    }, { withEvidence: 0, total: MUST_HAVE_FIELDS.size });
    let status = 'PASS';
    if (!mandatoryInsuranceLinePresent || citationCoverage < 95) {
        status = 'FAIL';
    }
    else if (mustMissing.length > 0) {
        status = 'FAIL';
    }
    else if (niceMissing.length > 0) {
        status = 'PASS_WITH_GAPS';
    }
    if (mustMissing.length > 0) {
        outFlags.push({
            key: 'required_info_missing',
            title: 'Required information missing from provided documents',
            severity: 'HIGH',
            evidence: [],
            why_it_matters: `Required fields missing: ${mustMissing.join(', ')}.`,
            recommended_follow_up: 'Request missing required documents/details before relying on this draft for closing advice.'
        });
        outFollowUps.push(`Required information missing: ${mustMissing.join(', ')}. Obtain these items before final legal sign-off.`);
    }
    const qa = {
        mandatoryInsuranceLinePresent,
        prohibitedClaimsRemoved: prohibitedRemoved,
        highRiskSectionCount: highRiskSections.length,
        highRiskSectionsWithCitation: highRiskWithCitation.length,
        highRiskCitationCoveragePct: citationCoverage,
        mustHaveMissingFields: mustMissing,
        niceToHaveMissingFields: niceMissing,
        mustHaveEvidenceCoverage: {
            withEvidence: mustHaveEvidence.withEvidence,
            total: mustHaveEvidence.total,
            pct: mustHaveEvidence.total ? Math.round((mustHaveEvidence.withEvidence / mustHaveEvidence.total) * 100) : 100
        },
        status,
        passCriteria: {
            insuranceLineRequired: true,
            apsMismatchDetectionRequired: true,
            citationCoverageTargetPct: 95
        },
        pass: status === 'PASS'
    };
    return { sections: nextSections, flags: outFlags, followUps: outFollowUps, qa };
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
    const reconciled = reconcileExtractedFacts(mergedText, extracted);
    reconciled.extracted.cross_checks = computeApsCrossChecks(reconciled.extracted);
    const criticalClauses = detectCriticalClauses(mergedText);
    const currentUnusual = Array.isArray(reconciled.extracted.unusual_clauses) ? reconciled.extracted.unusual_clauses : [];
    const deterministicUnusual = [
        criticalClauses.shortTermRental ? 'short-term rental restrictions detected' : null,
        criticalClauses.subMetering ? 'sub-metering provisions detected' : null,
        criticalClauses.leasingNotice ? 'leasing notice/management documentation requirement detected' : null
    ].filter(Boolean);
    reconciled.extracted.unusual_clauses = sanitizeUnusualClauses([...currentUnusual, ...deterministicUnusual]);
    await admin
        .from('status_cert_reviews')
        .update({
        extracted_json: reconciled.extracted,
        status: 'EXTRACTED',
        model: extractModel,
        prompt_version: extractPromptVersion,
        updated_at: new Date().toISOString()
    })
        .eq('id', reviewId)
        .eq('firm_id', firmId);
    const canonicalGeneratedTitle = getCanonicalReviewTitle(review.title, reconciled.extracted);
    if (canonicalGeneratedTitle && canonicalGeneratedTitle !== review.title) {
        await admin
            .from('status_cert_reviews')
            .update({ title: canonicalGeneratedTitle, updated_at: new Date().toISOString() })
            .eq('id', reviewId)
            .eq('firm_id', firmId);
        review.title = canonicalGeneratedTitle;
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
    const model = 'deterministic_rule_v1';
    const promptVersion = 'generate_deterministic_v1';
    const missingFields = Array.isArray(reconciled.extracted.missing_fields) ? reconciled.extracted.missing_fields : [];
    const normalizedMissingFields = missingFields.filter((fieldKey) => {
        const value = reconciled.extracted[fieldKey];
        return !hasMeaningfulValue(value);
    });
    reconciled.extracted.missing_fields = normalizedMissingFields;
    const actionableMissingFields = normalizedMissingFields.filter((fieldKey) => ACTIONABLE_FOLLOW_UP_FIELDS.has(fieldKey));
    const crossChecks = Array.isArray(reconciled.extracted.cross_checks) ? reconciled.extracted.cross_checks : [];
    const crossCheckFollowUps = crossChecks
        .filter((check) => check.status === 'MISMATCH')
        .map((check) => `APS mismatch detected for ${check.label}. APS: ${check.aps_value || 'Not found'}; Status Certificate: ${check.status_cert_value || 'Not found'}. Resolve before closing.`);
    const missingFieldFollowUps = actionableMissingFields.map((fieldKey) => {
        const prefix = MUST_HAVE_FIELDS.has(fieldKey) ? 'Required missing information' : 'Missing information';
        return `${prefix}: ${fieldKey}. Not found in status certificate. Request confirmation before finalizing.`;
    });
    const missingFieldFlags = actionableMissingFields.map((fieldKey) => ({
        key: `missing_${fieldKey}`,
        title: `Missing information: ${fieldKey}`,
        severity: MUST_HAVE_FIELDS.has(fieldKey) ? 'HIGH' : 'MED',
        evidence: [],
        why_it_matters: 'This detail was not found in the provided status certificate documents.',
        recommended_follow_up: 'Request supporting documents or confirm this point before closing.'
    }));
    const alwaysShowFlags = [];
    if (hasPresentValue(reconciled.extracted.special_assessments) && !isNegativeOrNone(reconciled.extracted.special_assessments)) {
        alwaysShowFlags.push({
            key: 'special_assessment_present',
            title: 'Special assessment disclosed',
            severity: 'HIGH',
            evidence: findEvidenceByField(reconciled.extracted, ['special_assessments']).slice(0, 2),
            why_it_matters: 'Special assessments can materially affect purchaser costs and closing decisions.',
            recommended_follow_up: 'Confirm amount, timeline, and unit-level allocation of the special assessment.'
        });
    }
    if (hasPresentValue(reconciled.extracted.fee_increases) && !isNegativeOrNone(reconciled.extracted.fee_increases)) {
        alwaysShowFlags.push({
            key: 'fee_increase_present',
            title: 'Common expense increase noted',
            severity: 'MED',
            evidence: findEvidenceByField(reconciled.extracted, ['fee_increases']).slice(0, 2),
            why_it_matters: 'Fee increases change purchaser monthly carrying costs.',
            recommended_follow_up: 'Confirm revised monthly amount and effective date.'
        });
    }
    if (hasPresentValue(reconciled.extracted.legal_proceedings)) {
        alwaysShowFlags.push({
            key: 'legal_proceedings_present',
            title: 'Legal proceedings disclosed',
            severity: 'HIGH',
            evidence: findEvidenceByField(reconciled.extracted, ['legal_proceedings']).slice(0, 2),
            why_it_matters: 'Litigation may create financial exposure or operational impact for the corporation.',
            recommended_follow_up: 'Obtain current proceeding status and potential financial impact details.'
        });
    }
    const crossCheckFlags = buildCrossCheckFlags(reconciled.extracted);
    const unusualClauseFlags = buildUnusualClauseFlags(reconciled.extracted);
    const mergedFlags = dedupeFlags([
        ...missingFieldFlags,
        ...crossCheckFlags,
        ...unusualClauseFlags,
        ...alwaysShowFlags
    ]);
    const conciseSummary = buildConciseSummaryBullets(reconciled.extracted);
    const conciseFollowUps = buildConciseFollowUpSection(reconciled.extracted, mergedFlags);
    const finalSections = (0, editor_1.canonicalizeReviewSections)([
        {
            ...editor_1.CANONICAL_REVIEW_SECTIONS[0],
            content: conciseSummary.map((line) => `- ${line}`).join('\n')
        },
        {
            ...editor_1.CANONICAL_REVIEW_SECTIONS[1],
            content: conciseFollowUps.length
                ? conciseFollowUps.map((line) => `- ${line}`).join('\n')
                : '- None'
        }
    ]);
    delete reconciled.extracted.quality_checks;
    const reviewText = (0, editor_1.sectionsToReviewText)(finalSections);
    const reviewHtml = htmlFromSections(finalSections);
    await admin
        .from('status_cert_reviews')
        .update({
        review_sections_json: finalSections,
        extracted_json: reconciled.extracted,
        flags_json: mergedFlags,
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
        payload: {
            followUps: conciseFollowUps,
            missingFields: normalizedMissingFields,
            crossChecks,
            extractionConflicts: reconciled.conflicts
        }
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
    const canonicalTitle = getCanonicalReviewTitle(review.title, (review.extracted_json || null));
    if (canonicalTitle && canonicalTitle !== review.title) {
        await admin
            .from('status_cert_reviews')
            .update({ title: canonicalTitle, updated_at: new Date().toISOString() })
            .eq('id', reviewId)
            .eq('firm_id', firmId);
        review.title = canonicalTitle;
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
    const sectionsForDocx = Array.isArray(review.review_sections_json) && review.review_sections_json.length
        ? (0, editor_1.canonicalizeReviewSections)((review.review_sections_json || []), review.review_text)
        : review.review_text && review.review_text.trim()
            ? (0, editor_1.canonicalizeReviewSections)((0, editor_1.reviewTextToSections)(template.sections, review.review_text), review.review_text)
            : (0, editor_1.canonicalizeReviewSections)([]);
    let buffer;
    let diagnostics;
    try {
        const result = await (0, docx_1.buildStatusCertDocxBuffer)({
            firmName: firm?.name || 'Firm',
            matterTitle: review.title || 'Status Certificate Review',
            generatedAt: new Date(),
            extracted: (review.extracted_json || null),
            template,
            sections: sectionsForDocx,
            flags: (review.flags_json || [])
        });
        buffer = result.buffer;
        diagnostics = result.diagnostics;
    }
    catch (error) {
        await admin.from('status_cert_events').insert({
            firm_id: firmId,
            review_id: reviewId,
            event_type: 'EXPORT_MAPPING_FAILED',
            payload: {
                review_id: reviewId,
                error: String(error?.message || error || 'Unknown export mapping error'),
                diagnostics: {
                    requiredFieldsMissing: [],
                    fallbackFieldsUsed: [],
                    unresolvedTemplateTokens: [],
                    bannedResidueHits: [],
                    anchorsNotFound: [],
                    requiredFieldsTotal: 0,
                    requiredFieldsResolved: 0
                }
            }
        });
        throw error;
    }
    await updateJob(job.id, { stage: 'UPLOAD_EXPORT', progress: 90 });
    const fileStem = buildReviewFilenameStem(review.title || canonicalTitle || '', reviewId);
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
        payload: { path, diagnostics }
    });
    await updateJob(job.id, {
        status: 'SUCCEEDED',
        stage: 'DONE',
        progress: 100,
        result: {
            path,
            downloadUrl: signed?.signedUrl || null,
            diagnostics
        }
    });
}

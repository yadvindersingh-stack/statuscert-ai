"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_REVIEW_SECTIONS = void 0;
exports.sectionsToReviewText = sectionsToReviewText;
exports.reviewTextToSections = reviewTextToSections;
exports.canonicalizeReviewSections = canonicalizeReviewSections;
exports.CANONICAL_REVIEW_SECTIONS = [
    {
        key: 'summary',
        title: 'Summary',
        instructions: '',
        style: 'structured'
    },
    {
        key: 'follow_ups',
        title: 'Flags / Follow-ups',
        instructions: '',
        style: 'structured'
    }
];
function sectionsToReviewText(sections) {
    return sections
        .map((section) => {
        const body = (section.content || '').trim();
        return `## ${section.title}\n\n${body}`;
    })
        .join('\n\n');
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function cleanLine(line) {
    return line
        .replace(/^[-*]\s+/, '')
        .replace(/^##+\s+/, '')
        .trim();
}
function dedupeLines(lines) {
    const seen = new Set();
    const out = [];
    for (const line of lines) {
        const normalized = cleanLine(line).toLowerCase();
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(cleanLine(line));
    }
    return out;
}
function isFollowUpHeading(value) {
    const normalized = value.toLowerCase();
    return (normalized.includes('follow-up') ||
        normalized.includes('follow up') ||
        normalized.includes('action item') ||
        normalized.includes('flag'));
}
function reviewTextToSections(templateSections, reviewText) {
    const text = (reviewText || '').trim();
    if (!text) {
        return templateSections.map((s) => ({ ...s, content: '' }));
    }
    const out = templateSections.map((s) => ({ ...s, content: '' }));
    let consumed = false;
    for (let i = 0; i < out.length; i += 1) {
        const current = out[i];
        const next = out[i + 1];
        const currentHeading = new RegExp(`^##\\s+${escapeRegExp(current.title)}\\s*$`, 'im');
        const currentMatch = text.match(currentHeading);
        if (!currentMatch || currentMatch.index === undefined)
            continue;
        const start = currentMatch.index + currentMatch[0].length;
        let end = text.length;
        if (next) {
            const nextHeading = new RegExp(`^##\\s+${escapeRegExp(next.title)}\\s*$`, 'im');
            const rest = text.slice(start);
            const nextMatch = rest.match(nextHeading);
            if (nextMatch && nextMatch.index !== undefined) {
                end = start + nextMatch.index;
            }
        }
        current.content = text.slice(start, end).trim();
        consumed = true;
    }
    if (!consumed) {
        // Fallback 1: parse generic markdown headings when template headings don't match.
        const genericMatches = Array.from(text.matchAll(/^##\s+(.+)\s*$/gm));
        if (genericMatches.length) {
            const genericSections = [];
            for (let i = 0; i < genericMatches.length; i += 1) {
                const heading = genericMatches[i][1].trim();
                const headingStart = genericMatches[i].index ?? 0;
                const bodyStart = headingStart + genericMatches[i][0].length;
                const bodyEnd = i + 1 < genericMatches.length ? (genericMatches[i + 1].index ?? text.length) : text.length;
                const body = text.slice(bodyStart, bodyEnd).trim();
                genericSections.push({
                    key: heading.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `section_${i + 1}`,
                    title: heading,
                    instructions: "",
                    style: "structured",
                    content: body
                });
            }
            return genericSections;
        }
        // Fallback 2: put all text into first section when headings are absent.
        out[0].content = text;
    }
    return out;
}
function canonicalizeReviewSections(sections, reviewText) {
    const sourceSections = Array.isArray(sections) ? sections : [];
    const summaryLines = [];
    const followUpLines = [];
    const addLines = (bucket, text) => {
        if (!text)
            return;
        for (const rawLine of String(text).split('\n')) {
            const cleaned = cleanLine(rawLine);
            if (!cleaned)
                continue;
            bucket.push(cleaned);
        }
    };
    for (const section of sourceSections) {
        const key = String(section.key || '').toLowerCase();
        const title = String(section.title || '').toLowerCase();
        const followUpSection = key === 'follow_ups' || key === 'flags' || isFollowUpHeading(title);
        addLines(followUpSection ? followUpLines : summaryLines, section.content);
    }
    if ((!summaryLines.length && !followUpLines.length) && reviewText && reviewText.trim()) {
        const parsed = reviewTextToSections(exports.CANONICAL_REVIEW_SECTIONS, reviewText);
        const parsedSummary = parsed.find((s) => s.key === 'summary');
        const parsedFollowUps = parsed.find((s) => s.key === 'follow_ups');
        if (parsedSummary || parsedFollowUps) {
            addLines(summaryLines, parsedSummary?.content);
            addLines(followUpLines, parsedFollowUps?.content);
        }
        else {
            for (const section of parsed) {
                const followUpSection = isFollowUpHeading(String(section.title || ''));
                addLines(followUpSection ? followUpLines : summaryLines, section.content);
            }
        }
    }
    const normalizedSummary = dedupeLines(summaryLines);
    const normalizedFollowUps = dedupeLines(followUpLines);
    return [
        {
            ...exports.CANONICAL_REVIEW_SECTIONS[0],
            content: normalizedSummary.length
                ? normalizedSummary.map((line) => `- ${line}`).join('\n')
                : '- Not available'
        },
        {
            ...exports.CANONICAL_REVIEW_SECTIONS[1],
            content: normalizedFollowUps.length
                ? normalizedFollowUps.map((line) => `- ${line}`).join('\n')
                : '- None'
        }
    ];
}

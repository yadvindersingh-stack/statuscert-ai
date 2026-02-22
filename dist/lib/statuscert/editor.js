"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sectionsToReviewText = sectionsToReviewText;
exports.reviewTextToSections = reviewTextToSections;
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
        // Fallback: put all text into first section when headings are absent.
        out[0].content = text;
    }
    return out;
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGenerationPrompt = buildGenerationPrompt;
exports.generateReview = generateReview;
const openai_1 = __importDefault(require("openai"));
const DEFAULT_MODEL = "gpt-4.1-mini";
function buildGenerationPrompt(input) {
    return `You are a conservative Ontario real estate lawyer. Generate a status certificate review.\n\nUse the provided template sections. Return JSON ONLY with this shape:\n{\n  review_sections: [{ key, title, content }],\n  flags: [{ key, title, severity, evidence: [{ quote, page }], why_it_matters, recommended_follow_up }],\n  follow_ups: [string]\n}\n\nTone: neutral, lawyer-grade. Include follow-ups/action items.\nIf extracted_json.missing_fields contains values, include explicit follow-ups for each missing item and state "Not found in provided documents" in relevant section text.\n\nTemplate:\n${JSON.stringify(input.template)}\n\nFirm: ${input.firmName}\nDisclaimers: ${JSON.stringify(input.disclaimers)}\n\nExtracted JSON:\n${JSON.stringify(input.extracted)}`;
}
async function generateReview(input) {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const promptVersion = "generate_v1";
    const model = process.env.OPENAI_GENERATE_MODEL || DEFAULT_MODEL;
    const completion = await openai.chat.completions.create({
        model,
        messages: [
            { role: "system", content: "Return JSON only. Use conservative legal tone." },
            { role: "user", content: buildGenerationPrompt(input) }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const sections = input.template.sections.map((section) => {
        const found = parsed.review_sections?.find((s) => s.key === section.key);
        return { ...section, content: found?.content || "" };
    });
    return {
        sections,
        flags: parsed.flags || [],
        followUps: parsed.follow_ups || [],
        model,
        promptVersion
    };
}

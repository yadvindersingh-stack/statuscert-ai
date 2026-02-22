"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExtractionPrompt = buildExtractionPrompt;
exports.extractStatusCert = extractStatusCert;
const openai_1 = __importDefault(require("openai"));
const DEFAULT_MODEL = "gpt-4.1-mini";
function buildExtractionPrompt(text) {
    return `You are an Ontario condo real estate law assistant. Extract key facts from the status certificate package.\n\nReturn JSON ONLY with this shape:\n{\n  corporation_name, corporation_number, property_address, unit, parking, locker, bike,\n  common_expenses, common_expenses_due_date, arrears, prepaid, fee_increases, special_assessments,\n  reserve_fund_balance, reserve_fund_balance_date, reserve_fund_study_date, reserve_fund_next_due,\n  legal_proceedings, insurance_term, insurance_deductibles, leased_unit_count, restrictions_summary,\n  missing_fields: [field_key_string],\n  evidence: [{ field, quote, page }]\n}\n\nRules:\n- If a field is not present in the provided documents, return null and include its key in missing_fields.\n- Include evidence snippets with page references (page numbers as integers) whenever possible.\n- Do not hallucinate.\n\nDocument text:\n${text}`;
}
async function extractStatusCert(text) {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const promptVersion = "extract_v1";
    const model = process.env.OPENAI_EXTRACT_MODEL || DEFAULT_MODEL;
    const completion = await openai.chat.completions.create({
        model,
        messages: [
            { role: "system", content: "Return JSON only. Use conservative legal tone." },
            { role: "user", content: buildExtractionPrompt(text) }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const extracted = JSON.parse(content);
    if (!Array.isArray(extracted.missing_fields))
        extracted.missing_fields = [];
    return { extracted, model, promptVersion };
}

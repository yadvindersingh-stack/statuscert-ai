import OpenAI from "openai";
import { ExtractedJson } from "./types";

const DEFAULT_MODEL = "gpt-4.1-mini";

export function buildExtractionPrompt(text: string) {
  return `You are an Ontario condo real estate law assistant. Extract key facts from the status certificate package.\n\nSome packages may also include an APS file. FILE markers are provided in the text as:\n=== FILE: <filename> ===\nUse those markers to identify APS vs status certificate sources.\n\nReturn JSON ONLY with this shape:\n{\n  corporation_name, corporation_number, property_address, unit, parking, locker, bike,\n  common_expenses, common_expenses_due_date, arrears, prepaid, fee_increases, special_assessments,\n  reserve_fund_balance, reserve_fund_balance_date, reserve_fund_study_date, reserve_fund_next_due,\n  legal_proceedings, insurance_term, insurance_deductibles,\n  insurance_required_policies_status, insurance_required_policies_basis,\n  leased_unit_count, restrictions_summary, unusual_clauses,\n  missing_fields: [field_key_string],\n  aps_extracted: {\n    aps_present,\n    property_address, unit, parking, locker, bike, common_expenses,\n    evidence: [{ field, quote, page, paragraph }]\n  },\n  evidence: [{ field, quote, page, paragraph }]\n}\n\nRules:\n- If a field is not present in the provided documents, return null and include its key in missing_fields.\n- If APS is not present, set aps_extracted.aps_present=false and other aps_extracted values null.\n- insurance_required_policies_status must be one of: HAS_REQUIRED_POLICIES | NOT_CONFIRMED | NOT_SECURED.\n- Prioritize insurance-required-policies evidence from status certificate paragraph 26 when present.\n- Include short-term rental restrictions and sub-metering in unusual_clauses when present.\n- Include evidence snippets with page references (page numbers as integers) and paragraph labels when available.\n- Do not hallucinate.\n\nDocument text:\n${text}`;
}

export async function extractStatusCert(text: string): Promise<{ extracted: ExtractedJson; model: string; promptVersion: string; }>{
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  const extracted = JSON.parse(content) as ExtractedJson;
  if (!Array.isArray(extracted.missing_fields)) extracted.missing_fields = [];
  if (!Array.isArray(extracted.unusual_clauses)) extracted.unusual_clauses = [];
  if (!extracted.aps_extracted) extracted.aps_extracted = { aps_present: false };
  if (!Array.isArray(extracted.aps_extracted.evidence)) extracted.aps_extracted.evidence = [];
  if (!Array.isArray(extracted.evidence)) extracted.evidence = [];

  return { extracted, model, promptVersion };
}

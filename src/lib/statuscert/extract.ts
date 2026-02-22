import OpenAI from "openai";
import { ExtractedJson } from "./types";

const DEFAULT_MODEL = "gpt-4.1-mini";

export function buildExtractionPrompt(text: string) {
  return `You are an Ontario condo real estate law assistant. Extract key facts from the status certificate package.\n\nReturn JSON ONLY with this shape:\n{\n  corporation_name, corporation_number, property_address, unit, parking, locker, bike,\n  common_expenses, common_expenses_due_date, arrears, prepaid, fee_increases, special_assessments,\n  reserve_fund_balance, reserve_fund_balance_date, reserve_fund_study_date, reserve_fund_next_due,\n  legal_proceedings, insurance_term, insurance_deductibles, leased_unit_count, restrictions_summary,\n  missing_fields: [field_key_string],\n  evidence: [{ field, quote, page }]\n}\n\nRules:\n- If a field is not present in the provided documents, return null and include its key in missing_fields.\n- Include evidence snippets with page references (page numbers as integers) whenever possible.\n- Do not hallucinate.\n\nDocument text:\n${text}`;
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

  return { extracted, model, promptVersion };
}

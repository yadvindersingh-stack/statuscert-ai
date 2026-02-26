import OpenAI from "openai";
import { ExtractedJson, TemplateJson, FlagItem, ReviewSection } from "./types";

const DEFAULT_MODEL = "gpt-4.1-mini";

export function buildGenerationPrompt(input: {
  extracted: ExtractedJson;
  template: TemplateJson;
  firmName: string;
  disclaimers: string[];
}) {
  return `You are a conservative Ontario real estate lawyer. Generate a status certificate review.\n\nUse the provided template sections. Return JSON ONLY with this shape:\n{\n  review_sections: [{ key, title, content }],\n  flags: [{ key, title, severity, evidence: [{ quote, page, paragraph }], why_it_matters, recommended_follow_up }],\n  follow_ups: [string]\n}\n\nRules:\n- Tone: neutral, lawyer-grade.\n- Add inline citations in body text for high-impact statements using [p.X] or [p.X, para Y].\n- For core facts (corporation name, property address, unit, common expenses, reserve fund values), use extracted_json values exactly and do not restate with different numbers or names.\n- Avoid repeated wording across sections.\n- Do NOT write unsupported conclusions like \"reserve fund is healthy\" unless evidence and rationale are explicitly available.\n- Insurance section must include this exact legal finding pattern:\n  \"According to the Status Certificate, the Corporation has/has not secured all policies of insurance required under the Condominium Act, 1998.\"\n- If extracted_json.missing_fields contains values, include explicit follow-ups for each missing field and state \"Not found in provided documents\" where relevant.\n- Explicitly mention short-term rental restrictions and sub-metering provisions when present.\n\nTemplate:\n${JSON.stringify(input.template)}\n\nFirm: ${input.firmName}\nDisclaimers: ${JSON.stringify(input.disclaimers)}\n\nExtracted JSON:\n${JSON.stringify(input.extracted)}`;
}

export async function generateReview(input: {
  extracted: ExtractedJson;
  template: TemplateJson;
  firmName: string;
  disclaimers: string[];
}): Promise<{ sections: ReviewSection[]; flags: FlagItem[]; followUps: string[]; model: string; promptVersion: string; }>{
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  const parsed = JSON.parse(content) as {
    review_sections: { key: string; title: string; content: string }[];
    flags: FlagItem[];
    follow_ups: string[];
  };

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

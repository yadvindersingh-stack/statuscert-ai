import { TemplateJson } from "./types";

export const DEFAULT_TEMPLATE: TemplateJson = {
  title: "Status Certificate Review – Precedent",
  mode: "precedent_locked",
  disclaimers: [
    "Facts are drawn from the provided status certificate package and should be verified against the source documents.",
    "This review does not replace independent legal analysis or partner review."
  ],
  sections: [
    { key: "intro", title: "Purpose and Scope", instructions: "Explain purpose, source package scope, and key assumptions. Include inline citations for factual statements.", style: "narrative" },
    { key: "summary", title: "Key Terms Summary", instructions: "Produce concise terms summary (unit, parking, locker, common expenses, arrears, reserve, legal proceedings) and avoid repeating details covered in budget/insurance sections.", style: "structured" },
    { key: "insurance", title: "Insurance", instructions: "State whether Corporation has/has not secured all policies required under the Condominium Act, 1998, with citation and key policy term notes.", style: "narrative" },
    { key: "budget_reserve", title: "Budget and Reserve Fund", instructions: "Discuss common expenses, fee increases, reserve balance/study timing with evidence. Do not conclude reserve fund is healthy unless rationale is explicit.", style: "narrative" },
    { key: "pets", title: "Pet Rules", instructions: "Note any pet restrictions or approvals required.", style: "narrative" },
    { key: "leasing", title: "Leasing Rules", instructions: "Summarize leasing restrictions, short-term rental prohibition status, and any notice/approval requirements.", style: "narrative" },
    { key: "additional", title: "Additional Items to Note", instructions: "Capture sub-metering, unusual clauses, litigation, special assessments, and operational follow-ups.", style: "narrative" }
  ]
};

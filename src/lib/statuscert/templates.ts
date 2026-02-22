import { TemplateJson } from "./types";

export const DEFAULT_TEMPLATE: TemplateJson = {
  title: "Status Certificate Review – Precedent",
  disclaimers: [
    "Facts are drawn from the provided status certificate package and should be verified against the source documents.",
    "This review does not replace independent legal analysis or partner review."
  ],
  sections: [
    { key: "intro", title: "Purpose and Scope", instructions: "Explain the purpose of the review and what documents were considered.", style: "narrative" },
    { key: "summary", title: "Key Terms Summary", instructions: "Produce a concise factual summary of key financial and governance terms.", style: "structured" },
    { key: "insurance", title: "Insurance", instructions: "Summarize the insurance coverage, deductibles, and any gaps or issues.", style: "narrative" },
    { key: "budget_reserve", title: "Budget and Reserve Fund", instructions: "Discuss common expenses, arrears, reserve fund balance, and reserve fund study timing.", style: "narrative" },
    { key: "pets", title: "Pet Rules", instructions: "Note any pet restrictions or approvals required.", style: "narrative" },
    { key: "leasing", title: "Leasing Rules", instructions: "Summarize leasing restrictions and any notice or approval requirements.", style: "narrative" },
    { key: "additional", title: "Additional Items to Note", instructions: "Capture any other notable restrictions, assessments, litigation, or governance issues.", style: "narrative" }
  ]
};

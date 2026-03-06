"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TEMPLATE = void 0;
exports.DEFAULT_TEMPLATE = {
    title: "Status Certificate Review – Precedent",
    mode: "precedent_locked",
    disclaimers: [
        "Facts are drawn from the provided status certificate package and should be verified against the source documents.",
        "This review does not replace independent legal analysis or partner review."
    ],
    sections: [
        {
            key: "summary",
            title: "Summary",
            instructions: "Provide concise bullet points only. Cover units in paragraph 5, special assessment in paragraph 11, reserve fund balance in paragraph 13, any unusual findings in paragraphs 9/10/12 (only if unusual), legal proceedings from paragraphs 18-22 (always mention yes/no), and unusual findings from supporting documents (only mention document name).",
            style: "structured"
        },
        {
            key: "follow_ups",
            title: "Flags / Follow-ups",
            instructions: "Provide concise bullet list of lawyer follow-ups only. Focus on unusual or risk items. Do not include parking/locker/bike missing details.",
            style: "structured"
        }
    ]
};

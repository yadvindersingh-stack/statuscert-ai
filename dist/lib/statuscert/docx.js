"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStatusCertDocxBuffer = buildStatusCertDocxBuffer;
const docx_1 = require("docx");
function toText(value, fallback = "N/A") {
    if (value === null || value === undefined)
        return fallback;
    const out = String(value).trim();
    return out.length ? out : fallback;
}
function buildSummaryRows(extracted, corporationFallback) {
    const e = extracted || {};
    return [
        ["Property Unit", toText(e.unit)],
        ["Parking Unit", toText(e.parking)],
        ["Locker Unit", toText(e.locker)],
        ["Bike Unit", toText(e.bike)],
        ["Corporation", toText(e.corporation_name || corporationFallback)],
        ["Default for Common Element Fees", toText(e.arrears ? `Arrears: ${e.arrears}` : "No arrears indicated")],
        ["Common Assessment", toText(e.common_expenses)],
        ["Prepaid Common Expenses", toText(e.prepaid)],
        ["Increases of Common Expenses", toText(e.fee_increases)],
        ["Special Assessments", toText(e.special_assessments)],
        [
            "Reserve Fund",
            toText([e.reserve_fund_balance, e.reserve_fund_balance_date ? `as of ${e.reserve_fund_balance_date}` : ""]
                .filter(Boolean)
                .join(" "))
        ],
        ["Reserve Fund Study", toText(e.reserve_fund_study_date)],
        ["Leased Unit Count", toText(e.leased_unit_count)]
    ];
}
function paragraphLines(text) {
    return text
        .split("\n")
        .map((line) => new docx_1.Paragraph({ text: line.trimEnd() }));
}
async function buildStatusCertDocxBuffer(input) {
    const summaryRows = buildSummaryRows(input.extracted, input.template.title || "Condominium Corporation");
    const disclaimers = input.template.disclaimers || [];
    const missingFields = Array.isArray(input.extracted?.missing_fields) ? input.extracted?.missing_fields : [];
    const summaryTable = new docx_1.Table({
        width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
        rows: [
            new docx_1.TableRow({
                children: [
                    new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: "Status Certificate" })] }),
                    new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: "Extracted Summary" })] })
                ]
            }),
            ...summaryRows.map(([label, value]) => new docx_1.TableRow({
                children: [
                    new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: label })] }),
                    new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: value })] })
                ]
            }))
        ]
    });
    const flagsSection = input.flags.length > 0
        ? new docx_1.Table({
            width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
            rows: [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: "Flag" })] }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: "Severity" })] }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: "Why it matters" })] }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: "Follow-up" })] })
                    ]
                }),
                ...input.flags.map((flag) => new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: toText(flag.title) })] }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: toText(flag.severity) })] }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: toText(flag.why_it_matters) })] }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ text: toText(flag.recommended_follow_up) })] })
                    ]
                }))
            ]
        })
        : new docx_1.Paragraph({ text: "No flags identified." });
    const document = new docx_1.Document({
        sections: [
            {
                children: [
                    new docx_1.Paragraph({
                        text: "Status Certificate Review",
                        heading: docx_1.HeadingLevel.TITLE,
                        alignment: docx_1.AlignmentType.CENTER
                    }),
                    new docx_1.Paragraph({ text: input.matterTitle, alignment: docx_1.AlignmentType.CENTER }),
                    new docx_1.Paragraph({ text: input.firmName, alignment: docx_1.AlignmentType.CENTER }),
                    new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `Date: ${input.generatedAt.toLocaleDateString()}` })],
                        alignment: docx_1.AlignmentType.CENTER
                    }),
                    new docx_1.Paragraph({ text: "" }),
                    ...disclaimers.map((disclaimer) => new docx_1.Paragraph({
                        text: disclaimer,
                        bullet: { level: 0 }
                    })),
                    new docx_1.Paragraph({ text: "" }),
                    summaryTable,
                    new docx_1.Paragraph({ text: "" }),
                    new docx_1.Paragraph({ text: "Notes, Rules & Regulations", heading: docx_1.HeadingLevel.HEADING_1 }),
                    ...(missingFields.length
                        ? [
                            new docx_1.Paragraph({ text: "Information Gaps", heading: docx_1.HeadingLevel.HEADING_2 }),
                            ...missingFields.map((field) => new docx_1.Paragraph({
                                text: `${field}: Not found in provided documents`,
                                bullet: { level: 0 }
                            }))
                        ]
                        : []),
                    ...input.sections.flatMap((section) => [
                        new docx_1.Paragraph({ text: section.title || section.key, heading: docx_1.HeadingLevel.HEADING_2 }),
                        ...paragraphLines(toText(section.content, ""))
                    ]),
                    new docx_1.Paragraph({ text: "" }),
                    new docx_1.Paragraph({ text: "Flags / Follow-ups", heading: docx_1.HeadingLevel.HEADING_2 }),
                    flagsSection
                ]
            }
        ]
    });
    return docx_1.Packer.toBuffer(document);
}

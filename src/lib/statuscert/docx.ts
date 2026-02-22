import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import { ExtractedJson, FlagItem, ReviewSection, TemplateJson } from "./types";

type BuildDocxInput = {
  firmName: string;
  matterTitle: string;
  generatedAt: Date;
  extracted: ExtractedJson | null;
  template: TemplateJson;
  sections: ReviewSection[];
  flags: FlagItem[];
};

function toText(value: unknown, fallback = "N/A") {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out.length ? out : fallback;
}

function buildSummaryRows(extracted: ExtractedJson | null, corporationFallback: string) {
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
      toText(
        [e.reserve_fund_balance, e.reserve_fund_balance_date ? `as of ${e.reserve_fund_balance_date}` : ""]
          .filter(Boolean)
          .join(" ")
      )
    ],
    ["Reserve Fund Study", toText(e.reserve_fund_study_date)],
    ["Leased Unit Count", toText(e.leased_unit_count)]
  ];
}

function paragraphLines(text: string) {
  return text
    .split("\n")
    .map((line) => new Paragraph({ text: line.trimEnd() }));
}

export async function buildStatusCertDocxBuffer(input: BuildDocxInput) {
  const summaryRows = buildSummaryRows(input.extracted, input.template.title || "Condominium Corporation");
  const disclaimers = input.template.disclaimers || [];
  const missingFields = Array.isArray(input.extracted?.missing_fields) ? input.extracted?.missing_fields : [];

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: "Status Certificate" })] }),
          new TableCell({ children: [new Paragraph({ text: "Extracted Summary" })] })
        ]
      }),
      ...summaryRows.map(
        ([label, value]) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: label })] }),
              new TableCell({ children: [new Paragraph({ text: value })] })
            ]
          })
      )
    ]
  });

  const flagsSection =
    input.flags.length > 0
      ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Flag" })] }),
                new TableCell({ children: [new Paragraph({ text: "Severity" })] }),
                new TableCell({ children: [new Paragraph({ text: "Why it matters" })] }),
                new TableCell({ children: [new Paragraph({ text: "Follow-up" })] })
              ]
            }),
            ...input.flags.map(
              (flag) =>
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ text: toText(flag.title) })] }),
                    new TableCell({ children: [new Paragraph({ text: toText(flag.severity) })] }),
                    new TableCell({ children: [new Paragraph({ text: toText(flag.why_it_matters) })] }),
                    new TableCell({ children: [new Paragraph({ text: toText(flag.recommended_follow_up) })] })
                  ]
                })
            )
          ]
        })
      : new Paragraph({ text: "No flags identified." });

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Status Certificate Review",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: input.matterTitle, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: input.firmName, alignment: AlignmentType.CENTER }),
          new Paragraph({
            children: [new TextRun({ text: `Date: ${input.generatedAt.toLocaleDateString()}` })],
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: "" }),
          ...disclaimers.map(
            (disclaimer) =>
              new Paragraph({
                text: disclaimer,
                bullet: { level: 0 }
              })
          ),
          new Paragraph({ text: "" }),
          summaryTable,
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Notes, Rules & Regulations", heading: HeadingLevel.HEADING_1 }),
          ...(missingFields.length
            ? [
                new Paragraph({ text: "Information Gaps", heading: HeadingLevel.HEADING_2 }),
                ...missingFields.map(
                  (field) =>
                    new Paragraph({
                      text: `${field}: Not found in provided documents`,
                      bullet: { level: 0 }
                    })
                )
              ]
            : []),
          ...input.sections.flatMap((section) => [
            new Paragraph({ text: section.title || section.key, heading: HeadingLevel.HEADING_2 }),
            ...paragraphLines(toText(section.content, ""))
          ]),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Flags / Follow-ups", heading: HeadingLevel.HEADING_2 }),
          flagsSection
        ]
      }
    ]
  });

  return Packer.toBuffer(document);
}

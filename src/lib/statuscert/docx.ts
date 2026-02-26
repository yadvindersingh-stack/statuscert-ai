import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { CrossCheckItem, ExtractedJson, FlagItem, ReviewSection, TemplateJson } from "./types";

type BuildDocxInput = {
  firmName: string;
  matterTitle: string;
  generatedAt: Date;
  extracted: ExtractedJson | null;
  template: TemplateJson;
  sections: ReviewSection[];
  flags: FlagItem[];
};

const CONTENT_WIDTH_TWIPS = 9026; // Letter width (11906) - 1" margins on both sides (1440+1440)

function toText(value: unknown, fallback = "N/A"): string {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) {
    const flattened: string = value
      .map((item) => toText(item, ""))
      .filter((item) => item && item !== "N/A")
      .join("; ")
      .trim();
    return flattened || fallback;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferred = ["value", "text", "name", "title", "status", "amount"];
    for (const key of preferred) {
      if (obj[key] !== undefined && obj[key] !== null) {
        const candidate: string = toText(obj[key], "");
        if (candidate) return candidate;
      }
    }
    const compact: string = Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `${k}: ${toText(v, "")}`)
      .join(", ")
      .trim();
    return compact || fallback;
  }
  const out = String(value).trim();
  return out.length ? out : fallback;
}

function paragraphLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => new Paragraph({ text: line }));
}

function cellParagraph(text: string, bold = false) {
  return new Paragraph({
    spacing: { before: 40, after: 40, line: 276 },
    children: [new TextRun({ text, bold })]
  });
}

function tableCell(text: string, widthTwips: number, header = false) {
  return new TableCell({
    width: { size: widthTwips, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [cellParagraph(text, header)]
  });
}

function apsComparisonRows(extracted: ExtractedJson | null) {
  const e = extracted || {};
  const aps = e.aps_extracted || {};
  const checks = (e.cross_checks || []) as CrossCheckItem[];

  const lookup = new Map<string, CrossCheckItem>();
  checks.forEach((check) => lookup.set(check.key, check));

  const rows: Array<[string, string, string, string]> = [
    ["Property Unit", toText(aps.unit, "Not found in APS"), toText(e.unit, "Not found in status certificate"), toText(lookup.get("unit")?.status, "NOT_FOUND")],
    ["Parking Unit", toText(aps.parking, "Not found in APS"), toText(e.parking, "Not found in status certificate"), toText(lookup.get("parking")?.status, "NOT_FOUND")],
    ["Locker Unit", toText(aps.locker, "Not found in APS"), toText(e.locker, "Not found in status certificate"), toText(lookup.get("locker")?.status, "NOT_FOUND")],
    ["Bike Unit", toText(aps.bike, "Not found in APS"), toText(e.bike, "Not found in status certificate"), toText(lookup.get("bike")?.status, "NOT_FOUND")],
    [
      "Common Assessment",
      toText(aps.common_expenses, "Not found in APS"),
      toText(e.common_expenses, "Not found in status certificate"),
      toText(lookup.get("common_expenses")?.status, "NOT_FOUND")
    ],
    ["Corporation", toText(e.corporation_name, "Not found in provided documents"), toText(e.corporation_name, "Not found in provided documents"), "MATCH"]
  ];

  return rows;
}

function buildApsVsStatusTable(extracted: ExtractedJson | null) {
  const rows = apsComparisonRows(extracted);
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          tableCell("Item", 1625, true),
          tableCell("Agreement of Purchase and Sale", 2708, true),
          tableCell("Status Certificate", 2708, true),
          tableCell("Match", 1985, true)
        ]
      }),
      ...rows.map(
        ([label, apsValue, statusValue, match]) =>
          new TableRow({
            children: [
              tableCell(label, 1625),
              tableCell(apsValue, 2708),
              tableCell(statusValue, 2708),
              tableCell(match, 1985)
            ]
          })
      )
    ]
  });
}

function buildFlagsTable(flags: FlagItem[]) {
  if (!flags.length) {
    return new Paragraph({ text: "No flags identified." });
  }

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          tableCell("Flag", 2166, true),
          tableCell("Severity", 903, true),
          tableCell("Why it matters", 2979, true),
          tableCell("Follow-up", 2978, true)
        ]
      }),
      ...flags.map(
        (flag) =>
          new TableRow({
            children: [
              tableCell(toText(flag.title), 2166),
              tableCell(toText(flag.severity), 903),
              tableCell(toText(flag.why_it_matters), 2979),
              tableCell(toText(flag.recommended_follow_up), 2978)
            ]
          })
      )
    ]
  });
}

function buildPrecedentDocument(input: BuildDocxInput) {
  const missingFields = Array.isArray(input.extracted?.missing_fields) ? input.extracted?.missing_fields : [];
  const rulesHeading = input.template.sections.some((section) => section.key === "additional")
    ? "Notes, Rules & Regulations"
    : "Review Notes";

  const children = [
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
    ...input.template.disclaimers.map((line) => new Paragraph({ text: line })),
    new Paragraph({ text: "" }),
    buildApsVsStatusTable(input.extracted),
    new Paragraph({ text: "" }),
    new Paragraph({ text: rulesHeading, heading: HeadingLevel.HEADING_1 }),
    ...(missingFields.length
      ? [
          new Paragraph({ text: "Information Gaps", heading: HeadingLevel.HEADING_2 }),
          ...missingFields.map((field) =>
            new Paragraph({ text: `${field}: Not found in provided documents`, bullet: { level: 0 } })
          )
        ]
      : []),
    ...input.sections.flatMap((section) => [
      new Paragraph({ text: section.title || section.key, heading: HeadingLevel.HEADING_2 }),
      ...paragraphLines(toText(section.content, "Not found in provided documents"))
    ]),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Flags / Follow-ups", heading: HeadingLevel.HEADING_2 }),
    buildFlagsTable(input.flags)
  ];

  return new Document({ sections: [{ children }] });
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paraXml(text: string) {
  return `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function tableRowXml(cells: string[]) {
  return `<w:tr>${cells
    .map(
      (cell) =>
        `<w:tc><w:p><w:r><w:t xml:space="preserve">${xmlEscape(cell)}</w:t></w:r></w:p></w:tc>`
    )
    .join("")}</w:tr>`;
}

async function buildFromDocxTemplate(input: BuildDocxInput, templatePath: string) {
  const source = await readFile(templatePath);
  const zip = await JSZip.loadAsync(source);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Template is missing word/document.xml");
  let xml = await docFile.async("string");

  const summaryRows = apsComparisonRows(input.extracted).map(([a, b, c]) =>
    tableRowXml([a, b, c])
  );
  const flagsRows = input.flags.map((flag) =>
    tableRowXml([
      toText(flag.title),
      toText(flag.severity),
      toText(flag.why_it_matters),
      toText(flag.recommended_follow_up)
    ])
  );
  const sectionsXml = input.sections
    .flatMap((section) => [
      paraXml(section.title || section.key),
      ...toText(section.content, "Not found in provided documents")
        .split("\n")
        .map((line) => paraXml(line))
    ])
    .join("");
  const disclaimersXml = input.template.disclaimers.map((line) => paraXml(line)).join("");

  const replacements: Record<string, string> = {
    "{{MATTER_TITLE}}": xmlEscape(input.matterTitle),
    "{{FIRM_NAME}}": xmlEscape(input.firmName),
    "{{GENERATED_DATE}}": xmlEscape(input.generatedAt.toLocaleDateString()),
    "{{DISCLAIMERS_BLOCK}}": disclaimersXml,
    "{{APS_ROWS_BLOCK}}": summaryRows.join(""),
    "{{SECTIONS_BLOCK}}": sectionsXml,
    "{{FLAGS_ROWS_BLOCK}}": flagsRows.join(""),
    "<!--DISCLAIMERS_BLOCK-->": disclaimersXml,
    "<!--APS_ROWS_BLOCK-->": summaryRows.join(""),
    "<!--SECTIONS_BLOCK-->": sectionsXml,
    "<!--FLAGS_ROWS_BLOCK-->": flagsRows.join("")
  };

  for (const [token, value] of Object.entries(replacements)) {
    xml = xml.split(token).join(value);
  }

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

function buildStandardDocument(input: BuildDocxInput) {
  const summaryRows = [
    ["Property Unit", toText(input.extracted?.unit)],
    ["Parking Unit", toText(input.extracted?.parking)],
    ["Locker Unit", toText(input.extracted?.locker)],
    ["Bike Unit", toText(input.extracted?.bike)],
    ["Corporation", toText(input.extracted?.corporation_name || input.template.title || "Condominium Corporation")],
    ["Common Assessment", toText(input.extracted?.common_expenses)],
    ["Reserve Fund", toText(input.extracted?.reserve_fund_balance)],
    ["Legal Proceedings", toText(input.extracted?.legal_proceedings)]
  ];

  const summaryTable = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          tableCell("Status Certificate", 3159, true),
          tableCell("Extracted Summary", 5867, true)
        ]
      }),
      ...summaryRows.map(
        ([label, value]) =>
          new TableRow({
            children: [
              tableCell(label, 3159),
              tableCell(value, 5867)
            ]
          })
      )
    ]
  });

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Status Certificate Review", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: input.matterTitle, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: "" }),
          ...input.template.disclaimers.map((line) => new Paragraph({ text: line, bullet: { level: 0 } })),
          new Paragraph({ text: "" }),
          summaryTable,
          ...input.sections.flatMap((section) => [
            new Paragraph({ text: section.title || section.key, heading: HeadingLevel.HEADING_2 }),
            ...paragraphLines(toText(section.content, ""))
          ]),
          new Paragraph({ text: "Flags / Follow-ups", heading: HeadingLevel.HEADING_2 }),
          buildFlagsTable(input.flags)
        ]
      }
    ]
  });
}

export async function buildStatusCertDocxBuffer(input: BuildDocxInput) {
  const precedentEnabled = process.env.STATUSCERT_PRECEDENT_MODE === "true";
  const configuredTemplatePath = process.env.STATUSCERT_PRECEDENT_TEMPLATE_PATH;
  const defaultTemplatePath = path.join(process.cwd(), "templates", "statuscert-precedent-template.docx");
  const templatePath =
    (configuredTemplatePath && existsSync(configuredTemplatePath) && configuredTemplatePath) ||
    (existsSync(defaultTemplatePath) ? defaultTemplatePath : null);

  if (precedentEnabled) {
    if (!templatePath) {
      throw new Error("Precedent template file not found. Set STATUSCERT_PRECEDENT_TEMPLATE_PATH.");
    }
    return buildFromDocxTemplate(input, templatePath);
  }
  const lockedMode = input.template.mode === "precedent_locked";
  const document = lockedMode ? buildPrecedentDocument(input) : buildStandardDocument(input);
  return Packer.toBuffer(document);
}

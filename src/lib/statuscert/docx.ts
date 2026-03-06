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
import { CrossCheckItem, ExportMappingDiagnostics, ExtractedJson, FlagItem, ReviewSection, TemplateJson } from "./types";
import { TEMPLATE_FIELD_RULES } from "./template_token_manifest";

const EXPORT_RENDERER_VERSION = "template_locked_v2026_03_06b";
let hasLoggedRendererVersion = false;

type BuildDocxInput = {
  firmName: string;
  matterTitle: string;
  generatedAt: Date;
  extracted: ExtractedJson | null;
  template: TemplateJson;
  sections: ReviewSection[];
  flags: FlagItem[];
};

type BuildDocxResult = {
  buffer: Buffer;
  diagnostics: ExportMappingDiagnostics;
};

class ExportTemplateMappingError extends Error {
  diagnostics: ExportMappingDiagnostics;
  constructor(message: string, diagnostics: ExportMappingDiagnostics) {
    super(message);
    this.name = "ExportTemplateMappingError";
    this.diagnostics = diagnostics;
  }
}

const CONTENT_WIDTH_TWIPS = 9026; // Letter width (11906) - 1" margins on both sides (1440+1440)

function toText(value: unknown, fallback = "Not available"): string {
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

function yesNoFromValue(value: unknown) {
  const text = toText(value, "").toLowerCase();
  if (!text) return "Not available";
  if (/\bno\b|\bnone\b|\bnot found\b|\bnot disclosed\b|\bnil\b/.test(text)) return "No";
  return "Yes";
}

function normalizeUnitLabel(value: unknown) {
  const raw = toText(value, "").trim();
  if (!raw) return "Not available";
  const match = raw.match(/unit\s*#?\s*(\d+)/i);
  if (match?.[1]) return `Unit ${match[1]}`;
  return raw.replace(/\bunit\b/i, "Unit");
}

function formatHumanDate(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return value;
  const [, y, m, d] = iso;
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return value;
  return `${monthNames[idx]} ${Number(d)}, ${y}`;
}

function normalizeDateText(value: unknown, fallback = "Not available") {
  const text = toText(value, fallback);
  if (!text || text === fallback) return text;
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (token) => formatHumanDate(token));
}

function normalizeLegalProceedings(value: unknown) {
  const text = toText(value, "NONE");
  if (!text || text === "NONE") return "NONE";
  const normalized = text
    .replace(/\b(role|court|summary|file_number)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= 220) return normalized;
  return `${normalized.slice(0, 219).trimEnd()}…`;
}

function toConciseLine(value: unknown, fallback = "Not available", max = 220) {
  const normalized = toText(value, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/^-+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function pickFirstMatchingSentence(value: unknown, matchers: RegExp[], fallback = "Not available") {
  const source = toText(value, "");
  if (!source) return fallback;
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (matchers.some((rx) => rx.test(lower))) {
      return toConciseLine(sentence, fallback);
    }
  }
  return fallback;
}

function normalizeSpecialAssessmentCell(yesNo: string, detail: string) {
  if (yesNo !== "Yes") return yesNo;
  if (!detail || detail === "Not available" || detail === "Not found" || detail === "NONE") return "Yes";
  return "Yes";
}

function parseInsuranceExpiry(insuranceTerm?: string) {
  if (!insuranceTerm) return "Not available";
  const range = insuranceTerm.match(/to\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (range?.[1]) return range[1];
  return insuranceTerm;
}

function firstDate(text: string) {
  const match = text.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
  return match?.[1] || "Not available";
}

function firstAmount(text: string) {
  const match = text.match(/\$[0-9,]+(?:\.[0-9]{2})?/);
  return match?.[0] || "Not available";
}

function sectionText(sections: ReviewSection[], key: string) {
  return (sections.find((s) => s.key === key)?.content || "").trim();
}

function replaceNth(source: string, needle: string, replacement: string, occurrence: number) {
  if (!needle) return source;
  let idx = -1;
  let from = 0;
  for (let i = 0; i < occurrence; i += 1) {
    idx = source.indexOf(needle, from);
    if (idx === -1) return source;
    from = idx + needle.length;
  }
  return source.slice(0, idx) + replacement + source.slice(idx + needle.length);
}

function removeBracketInstructions(text: string) {
  return text.replace(/\[[^\]]+\]/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePlaceholderAfterAnchor(
  xml: string,
  anchorText: string,
  placeholder: string,
  replacement: string
) {
  const pattern = new RegExp(
    `(${escapeRegExp(anchorText)}[\\s\\S]{0,2400}?)${escapeRegExp(placeholder)}`,
    "i"
  );
  if (!pattern.test(xml)) return xml;
  return xml.replace(pattern, `$1${replacement}`);
}

function collectBracketTokens(xml: string) {
  return Array.from(new Set((xml.match(/\[[^\]]+\]/g) || []).map((token) => token.trim())));
}

function createFlexibleTokenRegex(token: string) {
  const chars = Array.from(token).map((char) => escapeRegExp(char));
  const pattern = chars
    .map((char, index) => (index === chars.length - 1 ? char : `${char}(?:<[^>]+>)*`))
    .join("");
  return new RegExp(pattern, "g");
}

function replaceAllFlexibleToken(xml: string, token: string, replacement: string) {
  return xml.replace(createFlexibleTokenRegex(token), replacement);
}

function hasFlexibleToken(xml: string, token: string) {
  return createFlexibleTokenRegex(token).test(xml);
}

function hasValue(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textFromXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceCellText(cellXml: string, value: string) {
  const escaped = xmlEscape(value);
  const tcPrMatch = cellXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
  const tcPr = tcPrMatch ? tcPrMatch[0] : "";
  return `<w:tc>${tcPr}<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p></w:tc>`;
}

function replaceRowSecondCellByAnchor(xml: string, anchor: string, value: string) {
  const rowRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  const anchorNorm = normalizeForMatch(anchor);
  let found = false;
  const out = xml.replace(rowRegex, (rowXml) => {
    if (found) return rowXml;
    const rowText = normalizeForMatch(textFromXml(rowXml));
    if (!rowText.includes(anchorNorm)) return rowXml;
    const cellRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    const cells = [...rowXml.matchAll(cellRegex)];
    if (cells.length < 2) return rowXml;
    const target = cells[1];
    const start = target.index as number;
    const end = start + target[0].length;
    const replacement = replaceCellText(target[0], value);
    found = true;
    return rowXml.slice(0, start) + replacement + rowXml.slice(end);
  });
  return { xml: out, found };
}

function sanitizeInstructionResidue(xml: string) {
  const patterns = [
    /Unit\s*__\s*,\s*Level\s*__/gi,
    /Yes\s+or\s+No/gi,
    /Yes\s*-\s*(?:Not available|Not found|NONE)?(?=<|$|\s)/gi,
    /\$\s*_{3,}/g,
    /NOT IN DEFAULT or CURRENT OWNER IN DEFAULT OF \$___/gi,
    /special assessment\/loan\/increased common expenses or a combination/gi
  ];
  let out = xml;
  for (const pattern of patterns) {
    out = out.replace(pattern, "");
  }
  return out;
}

function collectBannedResidueHits(xml: string) {
  const checks = [
    "Unit __, Level __",
    "Yes or No",
    "$ ____",
    "NOT IN DEFAULT or CURRENT OWNER IN DEFAULT OF $___",
    "special assessment/loan/increased common expenses or a combination"
  ];
  const text = textFromXml(xml);
  return checks.filter((pattern) => text.includes(pattern));
}

function hasAnchor(xml: string, anchor: string) {
  return normalizeForMatch(textFromXml(xml)).includes(normalizeForMatch(anchor));
}

function normalizeMalformedTemplateTokens(xml: string) {
  return xml
    .replace(
      /\[ENTER FROM PARAGRAPH 14The annual contribution to be made to the Reserve Fund in the current fiscal year is \$______\. \[ENTER FROM PARAGRAPH 15, AND IF NOT AVAILABLE IN PARAGRAPH 15, ENTER FROM CONTRIBUTION TABLE UNDER RESERVE FUND STUDY\]/g,
      '[ENTER FROM PARAGRAPH 14]'
    )
    .replace(/\[ENTER FROM PARAGRAPH 14[^\]]*\]?/g, '[ENTER FROM PARAGRAPH 14]');
}

function extractUnitFromTitle(title: string) {
  const match = title.match(/\bunit\s*#?\s*(\d+)\b/i);
  if (!match?.[1]) return "";
  return `Unit ${match[1]}`;
}

function hydrateExtractedForExport(
  extracted: ExtractedJson,
  _matterTitle: string,
  _sections: ReviewSection[]
): ExtractedJson {
  return { ...extracted };
}

async function buildFromMasterTemplate(input: BuildDocxInput, templatePath: string): Promise<BuildDocxResult> {
  const source = await readFile(templatePath);
  const zip = await JSZip.loadAsync(source);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Template is missing word/document.xml");
  let xml = normalizeMalformedTemplateTokens(await docFile.async("string"));
  const fallbackFieldsUsed = new Set<string>();
  const anchorsNotFound = new Set<string>();

  const extracted = hydrateExtractedForExport(input.extracted || {}, input.matterTitle, input.sections);
  const summaryText = sectionText(input.sections, "summary");
  const followUpText = sectionText(input.sections, "follow_ups");

  const inferredUnit = extracted.unit || extractUnitFromTitle(input.matterTitle || "");
  const para5 = normalizeUnitLabel(inferredUnit);
  const parking = toText(extracted.parking, "Not found");
  const locker = toText(extracted.locker, "Not found");
  const bike = toText(extracted.bike, "Not found");
  const corporation = toText(extracted.corporation_name, "Not available");
  const statusCertDate = toText(extracted.reserve_fund_balance_date, "Not available");
  const defaultFees = /not in default|no arrears/i.test(toText(extracted.arrears, ""))
    ? "CURRENT OWNER NOT IN DEFAULT"
    : /arrears|default/i.test(toText(extracted.arrears, ""))
    ? `CURRENT OWNER IN DEFAULT OF ${toText(extracted.arrears, "Not available")}`
    : "CURRENT OWNER NOT IN DEFAULT";
  const inferredCommonAssessment = extracted.common_expenses || firstAmount(`${summaryText} ${followUpText}`) || "";
  const commonAssessment = toText(inferredCommonAssessment, "Not available");
  const commonAssessmentDetail = normalizeDateText(extracted.common_expenses_due_date, "Not available");
  const prepaid = toText(extracted.prepaid, "Not available");
  const feeIncreaseYesNo = yesNoFromValue(extracted.fee_increases);
  const feeIncreaseDetail = toText(extracted.fee_increases, "Not available");
  const increaseKnowledgeYesNo = yesNoFromValue(extracted.fee_increases);
  const specialAssessmentRawValue = toText(extracted.special_assessments, "Not available");
  const specialAssessmentYesNo = yesNoFromValue(extracted.special_assessments);
  const specialAssessmentDetail = toText(extracted.special_assessments, "Not available");
  const specialAssessmentRenderedValue = normalizeSpecialAssessmentCell(specialAssessmentYesNo, specialAssessmentDetail);
  const reserveFundDate = normalizeDateText(extracted.reserve_fund_balance_date, "");
  const reserveFund = Object.prototype.hasOwnProperty.call(extracted, "reserve_fund_balance")
    ? `${toText(extracted.reserve_fund_balance, "Not available")}${reserveFundDate ? ` as of ${reserveFundDate}` : ""}`
    : "Not available";
  const modification = toText((summaryText.match(/modification[^.\n]*/i) || [])[0], "Not available");
  const substantialChange = toText((summaryText.match(/substantial[^.\n]*common elements[^.\n]*/i) || [])[0], "Not available");
  const legalProceedingsYesNo = yesNoFromValue(extracted.legal_proceedings);
  const legalProceedingsDetail = legalProceedingsYesNo === "No"
    ? "NONE"
    : normalizeLegalProceedings(extracted.legal_proceedings);
  const insuranceExpiry = parseInsuranceExpiry(extracted.insurance_term);
  const reserveStudyDate = toText(extracted.reserve_fund_study_date, "Not available");
  const reserveStudyNextDue = toText(extracted.reserve_fund_next_due, "Not available");
  const annualContribution = toText((extracted as any).reserve_fund_annual_contribution, "Not available");
  const reserveExpenditures = toText((extracted as any).reserve_fund_expenditures, "Not available");
  const reserveAdequacySentence = "";
  const restrictionsSummary = toText(extracted.restrictions_summary, "");
  const unusualClausesSummary = Array.isArray(extracted.unusual_clauses) ? extracted.unusual_clauses.join(". ") : "";
  const restrictionCorpus = `${restrictionsSummary}. ${unusualClausesSummary}`.trim();
  const petSummary = toConciseLine(
    (extracted as any).pet_summary || pickFirstMatchingSentence(restrictionCorpus, [/\bpet\b/, /\banimal\b/, /\bnuisance\b/], ""),
    "Not available",
    220
  );
  const leasingSummary = toConciseLine(
    (extracted as any).leasing_summary || pickFirstMatchingSentence(restrictionCorpus, [/\bleas/, /\btenant\b/, /\bsublet\b/, /\bshort[- ]?term\b/], ""),
    "Not available",
    220
  );
  const permittedUse = toConciseLine(
    (extracted as any).permitted_use_summary || pickFirstMatchingSentence(restrictionCorpus, [/\buse\b/, /\boccupan/, /\bsingle[- ]family\b/, /\bresidential\b/], ""),
    "Not available",
    220
  );
  const additionalItems = toText(followUpText, "NONE");

  const resolverValues: Record<string, string> = {
    property_unit: para5,
    parking_unit: parking,
    locker_unit: locker,
    bike_unit: bike,
    corporation,
    default_fees: defaultFees,
    common_assessment: hasValue(commonAssessmentDetail) && commonAssessmentDetail !== "Not available" ? `${commonAssessment} due ${commonAssessmentDetail}` : commonAssessment,
    prepaid,
    fee_increase_yes_no: feeIncreaseYesNo,
    fee_knowledge_yes_no: increaseKnowledgeYesNo,
    special_assessment_yes_no: specialAssessmentRenderedValue,
    reserve_fund: reserveFund,
    modification,
    substantial_changes: substantialChange,
    legal_proceedings: legalProceedingsDetail || "NONE",
    insurance_expiry: insuranceExpiry,
    reserve_study_date: reserveStudyDate,
    reserve_study_next_due: reserveStudyNextDue,
    pet_summary: petSummary,
    leasing_summary: leasingSummary,
    permitted_use: permittedUse,
    additional_items: additionalItems
  };

  for (const rule of TEMPLATE_FIELD_RULES) {
    const resolved = String(resolverValues[rule.resolverKey] || "").trim();
    if (!resolved || resolved === "Not available" || resolved === "Not found" || resolved === "NONE") {
      fallbackFieldsUsed.add(rule.id);
    }
    if (rule.targetType === "cell") {
      const rowResult = replaceRowSecondCellByAnchor(xml, rule.anchor, resolved || rule.fallback);
      xml = rowResult.xml;
      if (!rowResult.found) {
        anchorsNotFound.add(rule.anchor);
      }
    } else {
      if (!hasAnchor(xml, rule.anchor)) {
        anchorsNotFound.add(rule.anchor);
      }
      if (rule.placeholder && hasFlexibleToken(xml, rule.placeholder)) {
        xml = replaceAllFlexibleToken(xml, rule.placeholder, xmlEscape(resolved || rule.fallback));
      }
    }
  }

  xml = replaceAllFlexibleToken(xml, "[ENTER PROPERTY ADDRESS]", xmlEscape(input.matterTitle || "Not available"));
  xml = replacePlaceholderAfterAnchor(xml, "status certificate dated", "[ENTER DATE FROM STATUS CERTIFICATE]", xmlEscape(statusCertDate));
  xml = replacePlaceholderAfterAnchor(xml, "Corporation", "[ENTER DATE FROM STATUS CERTIFICATE]", xmlEscape(corporation));
  xml = replaceAllFlexibleToken(xml, "[MENTION “NOT FOUND” IF NOT UNDER PARAGRAPH 5]", "Not found");

  xml = xml.replace(/NOT IN DEFAULT or CURRENT OWNER IN DEFAULT OF \$___/g, xmlEscape(defaultFees));
  xml = replacePlaceholderAfterAnchor(xml, "Common Assessment", "$____", xmlEscape(commonAssessment));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 6]", xmlEscape(commonAssessmentDetail));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 7]", xmlEscape(prepaid));
  xml = replacePlaceholderAfterAnchor(xml, "Increases of Common Expenses", "Yes or No", xmlEscape(feeIncreaseYesNo));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 10]", xmlEscape(feeIncreaseDetail));
  xml = replacePlaceholderAfterAnchor(xml, "Corporation’s Knowledge of Increase in Common Expenses", "Yes or No", xmlEscape(increaseKnowledgeYesNo));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 12]", xmlEscape(feeIncreaseDetail));
  xml = replacePlaceholderAfterAnchor(
    xml,
    "Levied Special Assessments",
    "Yes or No",
    xmlEscape(specialAssessmentRenderedValue)
  );
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 11]", xmlEscape(specialAssessmentDetail));
  xml = xml.replace(/\$________ as of \[DATE\]/g, xmlEscape(reserveFund));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 13]", xmlEscape(reserveFund));
  xml = replacePlaceholderAfterAnchor(xml, "Modification Agreements", "Yes or no", xmlEscape(yesNoFromValue(modification)));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 23]", xmlEscape(modification));
  xml = replacePlaceholderAfterAnchor(xml, "Substantial Changes to Common Elements", "Yes or no", xmlEscape(yesNoFromValue(substantialChange)));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 25]", xmlEscape(substantialChange));
  xml = replacePlaceholderAfterAnchor(xml, "Legal Proceedings/Claims involving the Condo Corporation", "Yes or No", xmlEscape(legalProceedingsYesNo));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 18 - 22]", xmlEscape(legalProceedingsDetail));

  xml = replaceAllFlexibleToken(xml, "[ENTER FROM CERTIFICATE OF INSURANCE]", `${xmlEscape(insuranceExpiry)}`);
  xml = replacePlaceholderAfterAnchor(xml, "The most recent Reserve Fund Stud was completed on", "[DATE]", xmlEscape(reserveStudyDate));
  xml = replacePlaceholderAfterAnchor(xml, "The next Reserve Fund Study is expected to be completed by", "[DATE]", xmlEscape(reserveStudyNextDue));
  xml = replaceAllFlexibleToken(xml, "[ENTER FROM PARAGRAPH 14]", "Not available");
  xml = xml.replace(
    /The annual contribution to be made to the Reserve Fund in the current fiscal year is \$______\.\s*\[ENTER FROM PARAGRAPH 15[^\]]*\]/g,
    `The annual contribution to be made to the Reserve Fund in the current fiscal year is ${xmlEscape(annualContribution)}.`
  );
  xml = xml.replace(
    /The Condominium Corporation anticipated \$_______ in Reserve Fund expenditures in the current fiscal year\.\s*\[ENTER FROM PARAGRAPH 15[^\]]*\]/g,
    `The Condominium Corporation anticipated ${xmlEscape(reserveExpenditures)} in Reserve Fund expenditures in the current fiscal year.`
  );
  if (reserveAdequacySentence) {
    xml = xml.replace(
      /The Board anticipates that the Reserve fund will be adequate in the current fiscal year to cover any expected costs of replacement and\/or repair of the condominium’s assets\. \[ENTER FROM PARAGRAPH 15, AND IF NOT AVAILABLE IN PARAGRAPH 15, THEN DO NOT INCLUDE THIS SECTION 2\.4\]/g,
      xmlEscape(reserveAdequacySentence)
    );
  } else {
    xml = xml.replace(
      /<w:p[^>]*>[\s\S]*?The Board anticipates that the Reserve fund will be adequate[\s\S]*?SECTION 2\.4[\s\S]*?<\/w:p>/g,
      ""
    );
  }

  xml = replaceAllFlexibleToken(xml, "[SUMMARIZE PET PROVISIONS INCLUDED IN THE DECLARATION, AND RULES AND REGULATIONS]", xmlEscape(petSummary));
  xml = replaceAllFlexibleToken(xml, "[FOLLOW SAME PARAGRAPH NUMBERING SEQUENCE (3.1, 3.2 AND SO ON)]", "");
  xml = replaceAllFlexibleToken(xml, "[SUMMARIZE PROVISIONS RELATED TO TENANCY AND LEASING INCLUDED IN THE DECLARATION, AND RULES &amp; REGULATIONS]", xmlEscape(leasingSummary));
  xml = replaceAllFlexibleToken(xml, "[SUMMARIZE USE SUCH AS SINGLE-FAMILY DWELLING, ETC. AS PER DECLARATION, AND RULES &amp; REGULATIONS]", xmlEscape(permittedUse));
  xml = replaceAllFlexibleToken(
    xml,
    "[MENTION “NONE” IF NO LEGAL PROCEEDINGS FOUND OR SUMMARIZE LEGAL PROCEEDINGS DISCOVERED IN THE STATUS CERTIFICATE AND ACCOMPANYTING DOCUMENTS]",
    xmlEscape(legalProceedingsDetail || "NONE")
  );
  xml = replaceAllFlexibleToken(
    xml,
    "[ENTER ANY ADDITIONAL FLAGS OR ITEMS TO NOTE. USE SAME NUMBERING SEQUENCE SUCH AS 7.1, 7.2, ETC. KEEP IT CONCISE.]",
    xmlEscape(additionalItems)
  );

  const rawFallbackTokens: Array<{ id: string; placeholder: string; fallback: string }> = [
    { id: "paragraph_5", placeholder: "[ENTER FROM PARAGRAPH 5]", fallback: "Not available" },
    { id: "paragraph_6", placeholder: "[ENTER FROM PARAGRAPH 6]", fallback: "Not available" },
    { id: "paragraph_7", placeholder: "[ENTER FROM PARAGRAPH 7]", fallback: "Not available" },
    { id: "paragraph_10", placeholder: "[ENTER FROM PARAGRAPH 10]", fallback: "Not available" },
    { id: "paragraph_11", placeholder: "[ENTER FROM PARAGRAPH 11]", fallback: "Not available" },
    { id: "paragraph_12", placeholder: "[ENTER FROM PARAGRAPH 12]", fallback: "Not available" },
    { id: "paragraph_13", placeholder: "[ENTER FROM PARAGRAPH 13]", fallback: "Not available" },
    { id: "paragraph_18_22", placeholder: "[ENTER FROM PARAGRAPH 18 - 22]", fallback: "NONE" },
    { id: "insurance", placeholder: "[ENTER FROM CERTIFICATE OF INSURANCE]", fallback: "Not available" },
    { id: "date", placeholder: "[DATE]", fallback: "Not available" },
    { id: "pet_summary", placeholder: "[SUMMARIZE PET PROVISIONS INCLUDED IN THE DECLARATION, AND RULES AND REGULATIONS]", fallback: "Not available" },
    { id: "leasing_summary", placeholder: "[SUMMARIZE PROVISIONS RELATED TO TENANCY AND LEASING INCLUDED IN THE DECLARATION, AND RULES &amp; REGULATIONS]", fallback: "Not available" },
    { id: "permitted_use", placeholder: "[SUMMARIZE USE SUCH AS SINGLE-FAMILY DWELLING, ETC. AS PER DECLARATION, AND RULES &amp; REGULATIONS]", fallback: "Not available" },
    { id: "legal_proceedings", placeholder: "[MENTION “NONE” IF NO LEGAL PROCEEDINGS FOUND OR SUMMARIZE LEGAL PROCEEDINGS DISCOVERED IN THE STATUS CERTIFICATE AND ACCOMPANYTING DOCUMENTS]", fallback: "NONE" },
    { id: "additional", placeholder: "[ENTER ANY ADDITIONAL FLAGS OR ITEMS TO NOTE. USE SAME NUMBERING SEQUENCE SUCH AS 7.1, 7.2, ETC. KEEP IT CONCISE.]", fallback: "NONE" },
    { id: "not_found", placeholder: "[MENTION “NOT FOUND” IF NOT UNDER PARAGRAPH 5]", fallback: "Not found" },
    { id: "numbering", placeholder: "[FOLLOW SAME PARAGRAPH NUMBERING SEQUENCE (3.1, 3.2 AND SO ON)]", fallback: "" }
  ];
  for (const token of rawFallbackTokens) {
    if (!hasFlexibleToken(xml, token.placeholder)) continue;
    xml = replaceAllFlexibleToken(xml, token.placeholder, token.fallback);
    fallbackFieldsUsed.add(token.id);
  }

  for (const moneyToken of ["$____", "$_____", "$______", "$_______", "$________"]) {
    if (hasFlexibleToken(xml, moneyToken)) {
      xml = replaceAllFlexibleToken(xml, moneyToken, "Not available");
      fallbackFieldsUsed.add("money_placeholder_cleanup");
    }
  }
  for (const yesNoToken of ["Yes or No", "Yes or no"]) {
    if (hasFlexibleToken(xml, yesNoToken)) {
      xml = replaceAllFlexibleToken(xml, yesNoToken, "");
      fallbackFieldsUsed.add("yes_no_placeholder_cleanup");
    }
  }

  xml = sanitizeInstructionResidue(xml);
  const unresolvedTemplateTokens = rawFallbackTokens
    .filter((token) => hasFlexibleToken(xml, token.placeholder))
    .map((token) => token.placeholder);
  xml = removeBracketInstructions(xml);
  const bannedResidueHits = collectBannedResidueHits(xml);

  const requiredRules = TEMPLATE_FIELD_RULES.filter((rule) => rule.required);
  const requiredFieldsMissing = requiredRules
    .filter((rule) => !hasValue(resolverValues[rule.resolverKey]) || resolverValues[rule.resolverKey] === "Not available")
    .map((rule) => rule.id);

  const requiredPlaceholderSet = new Set([
    "[ENTER FROM PARAGRAPH 5]",
    "[ENTER FROM PARAGRAPH 13]",
    "[ENTER FROM PARAGRAPH 18 - 22]"
  ]);
  const unresolvedRequired = unresolvedTemplateTokens.filter((token) => requiredPlaceholderSet.has(token));

  const diagnostics: ExportMappingDiagnostics = {
    requiredFieldsMissing,
    fallbackFieldsUsed: Array.from(fallbackFieldsUsed),
    unresolvedTemplateTokens,
    bannedResidueHits,
    anchorsNotFound: Array.from(anchorsNotFound),
    requiredFieldsTotal: requiredRules.length,
    requiredFieldsResolved: requiredRules.length - requiredFieldsMissing.length,
    exportRendererVersion: EXPORT_RENDERER_VERSION,
    specialAssessmentRawValue,
    specialAssessmentRenderedValue
  };

  const missingRequiredAnchors = requiredRules
    .map((rule) => rule.anchor)
    .filter((anchor) => anchorsNotFound.has(anchor));
  if (unresolvedRequired.length || bannedResidueHits.length || missingRequiredAnchors.length) {
    throw new ExportTemplateMappingError(
      `Template mapping incomplete. unresolved_required=${unresolvedRequired.length}, residue=${bannedResidueHits.join(", ")}, anchors_missing=${missingRequiredAnchors.length}`,
      diagnostics
    );
  }

  zip.file("word/document.xml", xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, diagnostics };
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

export async function buildStatusCertDocxBuffer(input: BuildDocxInput): Promise<BuildDocxResult> {
  if (!hasLoggedRendererVersion) {
    hasLoggedRendererVersion = true;
    console.info(`[statuscert-export] renderer=${EXPORT_RENDERER_VERSION}`);
  }
  const configuredTemplatePath = process.env.STATUSCERT_MASTER_TEMPLATE_PATH;
  const defaultTemplatePath = path.join(process.cwd(), "templates", "statuscert-master-template.docx");
  const templatePath =
    (configuredTemplatePath && existsSync(configuredTemplatePath) && configuredTemplatePath) ||
    (existsSync(defaultTemplatePath) ? defaultTemplatePath : null);

  if (!templatePath) {
    throw new Error("Master template file not found. Set STATUSCERT_MASTER_TEMPLATE_PATH.");
  }
  return buildFromMasterTemplate(input, templatePath);
}

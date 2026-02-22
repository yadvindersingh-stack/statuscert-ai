"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPdfText = extractPdfText;
const openai_1 = __importDefault(require("openai"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const MIN_PARSED_TEXT_CHARS = Number(process.env.PDF_PARSE_MIN_CHARS || 1200);
function normalizeLength(text) {
    return text.replace(/\s+/g, " ").trim().length;
}
async function ocrPdfWithOpenAI(buffer, filename = "document.pdf") {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const base64 = buffer.toString("base64");
    const response = await openai.responses.create({
        model: process.env.OPENAI_OCR_MODEL || "gpt-4.1-mini",
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: "Extract all readable text from this PDF. Return plain text only. Preserve headings, numbering, and legal clauses where possible."
                    },
                    {
                        type: "input_file",
                        filename,
                        file_data: `data:application/pdf;base64,${base64}`
                    }
                ]
            }
        ]
    });
    return (response.output_text || "").trim();
}
async function extractPdfText(input) {
    const parsed = await (0, pdf_parse_1.default)(input.buffer);
    const parsedText = (parsed.text || "").trim();
    const parsedLen = normalizeLength(parsedText);
    // If parser already captured enough text, do not spend OCR tokens.
    if (parsedLen >= MIN_PARSED_TEXT_CHARS || process.env.PDF_OCR_FALLBACK === "false") {
        return {
            text: parsedText,
            method: "pdf-parse",
            parsedChars: parsedLen
        };
    }
    try {
        const ocrText = await ocrPdfWithOpenAI(input.buffer, input.filename);
        const ocrLen = normalizeLength(ocrText);
        if (ocrLen > parsedLen) {
            return {
                text: ocrText,
                method: "openai-ocr",
                parsedChars: parsedLen,
                ocrChars: ocrLen
            };
        }
    }
    catch {
        // Fall back to parser text if OCR fails.
    }
    return {
        text: parsedText,
        method: "pdf-parse",
        parsedChars: parsedLen
    };
}

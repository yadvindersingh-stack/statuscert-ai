import OpenAI from "openai";
import pdfParse from "pdf-parse";

type ExtractPdfTextInput = {
  buffer: Buffer;
  filename?: string;
};

const MIN_PARSED_TEXT_CHARS = Number(process.env.PDF_PARSE_MIN_CHARS || 1200);

function normalizeLength(text: string) {
  return text.replace(/\s+/g, " ").trim().length;
}

async function ocrPdfWithOpenAI(buffer: Buffer, filename = "document.pdf") {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

export async function extractPdfText(input: ExtractPdfTextInput) {
  const parsed = await pdfParse(input.buffer);
  const parsedText = (parsed.text || "").trim();
  const parsedLen = normalizeLength(parsedText);

  // If parser already captured enough text, do not spend OCR tokens.
  if (parsedLen >= MIN_PARSED_TEXT_CHARS || process.env.PDF_OCR_FALLBACK === "false") {
    return {
      text: parsedText,
      method: "pdf-parse" as const,
      parsedChars: parsedLen
    };
  }

  try {
    const ocrText = await ocrPdfWithOpenAI(input.buffer, input.filename);
    const ocrLen = normalizeLength(ocrText);
    if (ocrLen > parsedLen) {
      return {
        text: ocrText,
        method: "openai-ocr" as const,
        parsedChars: parsedLen,
        ocrChars: ocrLen
      };
    }
  } catch {
    // Fall back to parser text if OCR fails.
  }

  return {
    text: parsedText,
    method: "pdf-parse" as const,
    parsedChars: parsedLen
  };
}

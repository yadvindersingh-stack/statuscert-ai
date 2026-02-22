import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFirmId } from "@/lib/auth";
import { extractStatusCert } from "@/lib/statuscert/extract";
import { extractPdfText } from "@/lib/statuscert/pdf";

export async function POST(request: Request) {
  const { firmId, user } = await requireFirmId();
  const { reviewId } = await request.json();

  const supabase = createServerSupabaseClient();
  const { data: review } = await supabase
    .from("status_cert_reviews")
    .select("id, document_path")
    .eq("id", reviewId)
    .eq("firm_id", firmId)
    .single();

  if (!review?.document_path) {
    return NextResponse.json({ ok: false, error: "Missing document" }, { status: 400 });
  }

  const admin = createServiceSupabaseClient();
  const { data: docRows } = await supabase
    .from("status_cert_review_documents")
    .select("file_path")
    .eq("firm_id", firmId)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });

  const documentPaths =
    docRows && docRows.length
      ? docRows.map((row) => row.file_path)
      : [review.document_path];

  let mergedText = "";
  let lastMethod = "pdf-parse";
  let totalParsedChars = 0;
  let totalOcrChars = 0;

  for (const documentPath of documentPaths) {
    const { data: file, error } = await admin.storage
      .from("documents")
      .download(documentPath);

    if (error || !file) {
      return NextResponse.json({ ok: false, error: `Unable to download PDF: ${documentPath}` }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await extractPdfText({ buffer, filename: documentPath.split("/").pop() });
    mergedText += `\n\n=== FILE: ${documentPath.split("/").pop()} ===\n\n${parsed.text}\n`;
    lastMethod = parsed.method;
    totalParsedChars += parsed.parsedChars || 0;
    totalOcrChars += parsed.ocrChars || 0;
  }

  const { extracted, model, promptVersion } = await extractStatusCert(mergedText);

  await supabase
    .from("status_cert_reviews")
    .update({
      extracted_json: extracted,
      status: "EXTRACTED",
      model,
      prompt_version: promptVersion,
      updated_at: new Date().toISOString()
    })
    .eq("id", reviewId)
    .eq("firm_id", firmId);

  await supabase.from("status_cert_events").insert({
    firm_id: firmId,
    review_id: reviewId,
    actor_id: user.id,
    event_type: "EXTRACTED",
    payload: {
      model,
      promptVersion,
      files_count: documentPaths.length,
      text_method: lastMethod,
      parsed_chars: totalParsedChars,
      ocr_chars: totalOcrChars || null
    }
  });

  return NextResponse.json({ ok: true });
}

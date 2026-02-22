import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFirmId } from "@/lib/auth";

export async function POST(request: Request) {
  const { firmId, user } = await requireFirmId();
  const { reviewId, documents } = await request.json();
  const docs = Array.isArray(documents) ? documents : [];
  const firstPath = docs[0]?.path || null;

  const supabase = createServerSupabaseClient();
  await supabase
    .from("status_cert_reviews")
    .update({ document_path: firstPath, status: "UPLOADED" })
    .eq("id", reviewId)
    .eq("firm_id", firmId);

  if (docs.length) {
    await supabase.from("status_cert_review_documents").delete().eq("review_id", reviewId).eq("firm_id", firmId);
    await supabase.from("status_cert_review_documents").insert(
      docs.map((doc: { path: string; name: string; size?: number }) => ({
        firm_id: firmId,
        review_id: reviewId,
        file_path: doc.path,
        file_name: doc.name,
        size_bytes: doc.size || null,
        created_by: user.id
      }))
    );
  }

  return NextResponse.json({ ok: true });
}

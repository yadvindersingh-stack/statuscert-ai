import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireFirmId } from "@/lib/auth";

export async function POST(request: Request) {
  const { firmId, user } = await requireFirmId();
  const { reviewId } = await request.json();

  const supabase = createServerSupabaseClient();
  await supabase
    .from("status_cert_reviews")
    .update({ status: "FINALIZED", updated_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("firm_id", firmId);

  await supabase.from("status_cert_events").insert({
    firm_id: firmId,
    review_id: reviewId,
    actor_id: user.id,
    event_type: "FINALIZED"
  });

  return NextResponse.json({ ok: true });
}

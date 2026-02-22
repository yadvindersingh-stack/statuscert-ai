import { NextResponse } from "next/server";
import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { firmId, user } = await requireFirmId();
  const { reviewId, jobId, event, payload } = await request.json();

  if (!event) {
    return NextResponse.json({ ok: false, error: "event is required" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  await supabase.from("status_cert_events").insert({
    firm_id: firmId,
    review_id: reviewId || null,
    actor_id: user.id,
    event_type: "UI_TELEMETRY",
    payload: {
      event,
      jobId: jobId || null,
      ...payload
    }
  });

  return NextResponse.json({ ok: true });
}


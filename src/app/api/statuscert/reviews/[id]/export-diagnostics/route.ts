import { NextResponse } from "next/server";
import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { firmId } = await requireFirmId();
  const supabase = createServerSupabaseClient();

  const { data: event } = await supabase
    .from("status_cert_events")
    .select("payload, created_at")
    .eq("firm_id", firmId)
    .eq("review_id", params.id)
    .in("event_type", ["EXPORTED", "EXPORT_MAPPING_FAILED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const diagnostics = (event?.payload as any)?.diagnostics || null;

  return NextResponse.json({
    ok: true,
    diagnostics,
    exportedAt: event?.created_at || null
  });
}

"use server";

import { redirect } from "next/navigation";
import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function saveFirmSettingsAction(formData: FormData) {
  const { firmId } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const firmName = String(formData.get("firm_name") || "").trim();

  if (!firmName) {
    redirect("/app/settings?error=Firm%20name%20is%20required");
  }

  const { error } = await supabase
    .from("firms")
    .update({ name: firmName })
    .eq("id", firmId);

  if (error) {
    redirect(`/app/settings?error=${encodeURIComponent("Unable to save settings right now.")}`);
  }

  redirect("/app/settings?saved=true");
}

"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { mapAuthError } from "@/lib/auth-errors";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  const supabase = createServerSupabaseClient();
  const admin = createServiceSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(mapAuthError(error.message))}&email=${encodeURIComponent(email)}`);
  }

  const userId = data.user?.id;
  if (userId) {
    const { data: existingMembership } = await admin
      .from("firm_members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingMembership) {
      const { data: ownedFirm } = await admin
        .from("firms")
        .select("id")
        .eq("created_by", userId)
        .maybeSingle();

      if (ownedFirm?.id) {
        await admin.from("firm_members").insert({
          firm_id: ownedFirm.id,
          user_id: userId,
          role: "OWNER"
        });
      } else {
        const fallbackName =
          (typeof data.user.user_metadata?.firm_name === "string" &&
          data.user.user_metadata.firm_name.trim().length > 0
            ? data.user.user_metadata.firm_name.trim()
            : "New Firm");

        const { data: createdFirm, error: createFirmError } = await admin
          .from("firms")
          .insert({
            name: fallbackName,
            created_by: userId
          })
          .select("id")
          .single();

        if (createFirmError || !createdFirm?.id) {
          redirect("/login?error=Account%20authenticated%20but%20firm%20provisioning%20failed.");
        }
      }
    }

    const { data: currentMembership } = await admin
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (currentMembership?.firm_id) {
      await admin.from("firm_billing").upsert({ firm_id: currentMembership.firm_id }, { onConflict: "firm_id" });
    }
  }

  redirect("/app/reviews");
}

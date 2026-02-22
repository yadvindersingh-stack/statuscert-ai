"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { mapAuthError } from "@/lib/auth-errors";

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const firmName = String(formData.get("firm_name") || "").trim();

  const supabase = createServerSupabaseClient();
  const admin = createServiceSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { firm_name: firmName }
    }
  });

  if (error) {
    redirect(
      `/signup?error=${encodeURIComponent(mapAuthError(error.message))}&email=${encodeURIComponent(email)}&firm_name=${encodeURIComponent(
        firmName
      )}`
    );
  }

  if (data.user) {
    const { data: existingFirm } = await admin
      .from("firms")
      .select("id")
      .eq("created_by", data.user.id)
      .maybeSingle();

    const { error: firmError } = existingFirm
      ? { error: null }
      : await admin.from("firms").insert({
          name: firmName,
          created_by: data.user.id
        });

    if (firmError) {
      redirect(
        `/signup?error=${encodeURIComponent("We created your account, but could not provision your firm. Please contact support.")}&email=${encodeURIComponent(
          email
        )}`
      );
    }

    const { data: createdFirm } = await admin
      .from("firms")
      .select("id")
      .eq("created_by", data.user.id)
      .maybeSingle();

    if (createdFirm?.id) {
      await admin.from("firm_billing").upsert({ firm_id: createdFirm.id }, { onConflict: "firm_id" });
      try {
        await admin.from("status_cert_events").insert({
          firm_id: createdFirm.id,
          actor_id: data.user.id,
          event_type: "auth_signup_completed",
          payload: { email }
        });
      } catch {
        // Non-blocking analytics event.
      }
    }
  }

  if (!data.session) {
    redirect("/login?message=Check%20your%20email%20to%20confirm%20your%20account%2C%20then%20log%20in.");
  }

  redirect("/app/billing?source=onboarding");
}

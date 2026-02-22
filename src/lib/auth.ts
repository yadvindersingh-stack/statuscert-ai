import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export async function requireUser() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  return data.user;
}

export async function requireFirmId() {
  const supabase = createServerSupabaseClient();
  const admin = createServiceSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Use service-role read here to avoid RLS recursion on firm_members policies.
  const { data: membership, error: membershipError } = await admin
    .from("firm_members")
    .select("firm_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    redirect(`/login?error=${encodeURIComponent(`Membership lookup failed: ${membershipError.message}`)}`);
  }

  if (!membership?.firm_id) {
    redirect("/login?error=No%20firm%20membership%20found%20for%20this%20account.");
  }

  return { firmId: membership.firm_id, role: membership.role, user };
}

import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveFirmSettingsAction } from "./actions";
import FormSubmitButton from "@/components/FormSubmitButton";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: { saved?: string; error?: string };
}) {
  const { firmId } = await requireFirmId();
  const supabase = createServerSupabaseClient();
  const { data: firm } = await supabase.from("firms").select("name").eq("id", firmId).single();

  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">Settings</p>
        <h1 className="font-serif text-3xl font-semibold">Firm profile</h1>
        <p className="mt-2 text-sm text-slate">Keep your firm information accurate for review outputs and exports.</p>
      </div>

      {searchParams?.saved === "true" ? (
        <div className="rounded-xl border border-[#C7D9CC] bg-[#F2FAF4] p-4 text-sm text-[#1E5B2B]">Settings saved.</div>
      ) : null}
      {searchParams?.error ? (
        <div className="rounded-xl border border-[#E6D1B8] bg-[#FFF8EE] p-4 text-sm text-slate">{searchParams.error}</div>
      ) : null}

      <form action={saveFirmSettingsAction} className="card p-6 space-y-5">
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-slate">Firm name</label>
          <input
            name="firm_name"
            type="text"
            required
            defaultValue={firm?.name || ""}
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2"
          />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm text-slate">
          Signature blocks and default disclaimer settings are next in roadmap.
        </div>
        <FormSubmitButton className="btn btn-primary" idleLabel="Save settings" pendingLabel="Saving..." />
      </form>
    </div>
  );
}


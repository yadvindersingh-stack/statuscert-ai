import { requireFirmId } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_TEMPLATE } from "@/lib/statuscert/templates";

export default async function TemplatesPage() {
  const { firmId } = await requireFirmId();
  const supabase = createServerSupabaseClient();

  const { data: templates } = await supabase
    .from("status_cert_templates")
    .select("id, title, is_default, template_json")
    .or(`firm_id.is.null,firm_id.eq.${firmId}`);

  const hasDefault = templates?.some((t) => t.is_default);

  if (!templates?.length) {
    await supabase.from("status_cert_templates").insert({
      firm_id: firmId,
      title: DEFAULT_TEMPLATE.title,
      template_json: DEFAULT_TEMPLATE,
      is_default: true,
      created_by: (await supabase.auth.getUser()).data.user?.id || "00000000-0000-0000-0000-000000000000"
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">Templates</p>
        <h1 className="font-serif text-3xl font-semibold">Firm templates</h1>
        <p className="mt-2 text-sm text-slate">Control how drafts are structured across your team.</p>
      </div>
      <div className="card p-6 space-y-3">
        {templates?.map((template) => (
          <details key={template.id} className="rounded-xl border border-[#E6E2D9] p-4">
            <summary className="flex cursor-pointer items-center justify-between">
              <div>
                <h3 className="font-semibold">{template.title}</h3>
                <p className="text-xs text-slate">{template.is_default ? "Default firm template" : "Custom template"}</p>
              </div>
              <div className="flex items-center gap-2">
                {template.template_json?.mode === "precedent_locked" ? (
                  <span className="badge bg-[#EDF6EE] text-[#2A6B3F]">Precedent (Locked)</span>
                ) : null}
                <span className="badge bg-[#ECF2FA] text-ink">Editor coming soon</span>
              </div>
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-slate">Disclaimers</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate">
                  {(template.template_json?.disclaimers || []).map((line: string, idx: number) => (
                    <li key={`${template.id}-disc-${idx}`}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-slate">Sections</p>
                <div className="mt-2 space-y-2">
                  {(template.template_json?.sections || []).map((section: any) => (
                    <div key={`${template.id}-${section.key}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                      <p className="text-sm font-semibold text-ink">{section.title}</p>
                      <p className="text-xs text-slate">Key: {section.key} • Style: {section.style}</p>
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-slate">{section.instructions || "No instructions."}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        )) || <p className="text-sm text-slate">No templates yet.</p>}
        {!hasDefault && <p className="text-xs text-warn">A default template will be seeded on first use.</p>}
      </div>
    </div>
  );
}

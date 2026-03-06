export default function MarketingProductPreview() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[#F8FAFD] p-4">
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#D5DEEA]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#D5DEEA]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#D5DEEA]" />
          </div>
          <span className="rounded-full bg-[#EEF2F8] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Ready
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate">Review Draft</p>
              <p className="mt-1 text-sm font-semibold text-ink">123 Main Street, Unit 100 - Draft</p>
            </div>
            <div className="rounded border border-[var(--border)] bg-[#FAFCFF] p-2.5">
              <p className="text-xs font-semibold text-ink">Purpose and Scope</p>
              <p className="mt-1 text-xs text-slate">
                Draft review prepared from uploaded status certificate package with cited source references.
              </p>
            </div>
            <div className="rounded border border-[var(--border)] bg-[#FAFCFF] p-2.5">
              <p className="text-xs font-semibold text-ink">Key Terms Summary</p>
              <p className="mt-1 text-xs text-slate">
                Common expenses, reserve fund, insurance status, and proceedings summarized for lawyer review.
              </p>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate">Flags</p>
            <div className="rounded border border-[#F4D8D8] bg-[#FFF6F6] p-2.5">
              <p className="text-xs font-semibold text-[#991B1B]">High: Ongoing Legal Proceedings</p>
              <p className="mt-1 text-xs text-slate">Confirm impact and obtain current litigation update before final advice.</p>
            </div>
            <div className="rounded border border-[#E8DAC5] bg-[#FFFDF6] p-2.5">
              <p className="text-xs font-semibold text-[#92400E]">Medium: Missing Locker Details</p>
              <p className="mt-1 text-xs text-slate">Request supporting records for locker allocation and ownership rights.</p>
            </div>
            <div className="rounded border border-[#E6E2D9] bg-[#FCFBF8] p-2.5">
              <p className="text-xs font-semibold text-ink">Export</p>
              <p className="mt-1 text-xs text-slate">Download lawyer-editable DOCX.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import MarketingProductPreview from "@/components/MarketingProductPreview";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#edf3fb_52%,#e6edf7_100%)]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-8">
        <div className="text-xl font-semibold tracking-tight text-[var(--primary)]">StatusCert AI</div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn btn-secondary">Log in</Link>
          <Link href="/signup" className="btn btn-primary">Get started</Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-6">
        <section className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <p className="section-title">Ontario Real Estate Law Firms</p>
            <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-tight text-ink md:text-5xl">
              Turn condo status certificate packages into lawyer-ready draft reviews.
            </h1>
            <p className="max-w-2xl text-lg text-slate">
              StatusCert AI helps law clerks and lawyers review faster with structured extraction, issue
              highlighting, and editable DOCX output aligned to firm workflow.
            </p>
            <p className="text-sm font-medium text-[var(--primary)]">
              Typical first draft turnaround: 2-5 minutes for standard packages.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-primary">Create firm workspace</Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate">Built for Ontario condo files</div>
              <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate">DOCX-first legal workflow</div>
              <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate">Firm-level data isolation (RLS)</div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <p className="section-title">Product Preview</p>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-slate">
                Desktop workflow
              </span>
            </div>
            <h2 className="mt-2 font-serif text-2xl font-semibold">One workspace from upload to export.</h2>
            <div className="mt-4">
              <MarketingProductPreview />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mt-6">
          <div className="card p-7">
          <p className="section-title">How It Works</p>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              { step: "1", title: "Create Review", body: "Open a new file and set review name." },
              { step: "2", title: "Upload Package", body: "Upload one or many status certificate PDFs." },
              { step: "3", title: "Generate Draft", body: "Extraction and draft generation run in background." },
              { step: "4", title: "Edit & Export", body: "Finalize in editor and export a clean DOCX." }
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-[var(--border)] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Step {item.step}</p>
                <h3 className="mt-2 font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-sm text-slate">{item.body}</p>
              </div>
            ))}
          </div>
          </div>
        </section>

        <section id="features" className="mt-8">
          <p className="section-title">Why Firms Use StatusCert AI</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            <div className="card p-6">
              <h3 className="font-serif text-xl font-semibold">Structured extraction</h3>
              <p className="mt-3 text-sm text-slate">
                Captures corporation details, expenses, reserve fund, insurance, proceedings, and restrictions
                with source evidence.
              </p>
            </div>
            <div className="card p-6">
              <h3 className="font-serif text-xl font-semibold">Lawyer-ready drafting</h3>
              <p className="mt-3 text-sm text-slate">
                Produces a full draft review aligned to firm template structure and ready for legal refinement.
              </p>
            </div>
            <div className="card p-6">
              <h3 className="font-serif text-xl font-semibold">Operational control</h3>
              <p className="mt-3 text-sm text-slate">
                Centralized status tracking, billing control, and reusable templates across your team.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

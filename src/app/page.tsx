import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#ECF2FA_50%,#E2EAF4_100%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
        <div className="text-lg font-semibold tracking-wide">StatusCert AI</div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn btn-secondary">Log in</Link>
          <Link href="/signup" className="btn btn-primary">Get started</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-8">
          <div className="space-y-4">
            <p className="section-title">Ontario Real Estate Law</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-ink md:text-5xl">
              Review status certificate packages faster with firm-ready drafting quality.
            </h1>
            <p className="text-lg text-slate">
              StatusCert AI extracts key facts, flags risks, and produces DOCX drafts your team can edit
              immediately. Built for Ontario real estate workflows with templates, follow-ups, and
              partner-ready review output.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">Start your first review</Link>
            <a href="#features" className="btn btn-secondary">See how it works</a>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: "DOCX-first", body: "Drafts in editable DOCX with sectioned structure." },
              { title: "Firm templates", body: "Match your precedent with sectioned JSON templates." },
              { title: "Risk flags", body: "Highlights legal risks with evidence + follow-ups." }
            ].map((item) => (
              <div key={item.title} className="card p-4">
                <h3 className="font-semibold text-ink">{item.title}</h3>
                <p className="text-sm text-slate">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <div className="space-y-5">
            <div>
              <p className="section-title">Workflow</p>
              <h2 className="font-serif text-2xl font-semibold">From upload to lawyer-ready draft</h2>
            </div>
            <ol className="space-y-4 text-sm text-slate">
              <li>1. Upload the status certificate package (PDF).</li>
              <li>2. Auto-extract key fields with evidence references.</li>
              <li>3. Generate a review from your firm template.</li>
              <li>4. Edit in one document and export DOCX.</li>
            </ol>
            <div className="rounded-2xl border border-dashed border-[#CBBFAE] bg-[#FBF9F5] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate">Team workflow ready</p>
              <p className="mt-2 text-sm text-slate">
                Keep reviews consistent across clerks and lawyers with one shared process from upload to
                export.
              </p>
            </div>
          </div>
        </section>
      </main>

      <section id="features" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            {
              title: "Structured extraction",
              body: "Evidence-backed fields: reserve funds, arrears, assessments, litigation, insurance, restrictions, and more."
            },
            {
              title: "Lawyer-ready review",
              body: "Generate a full draft, edit quickly, and keep your firm style consistent."
            },
            {
              title: "Audit-friendly",
              body: "Prompt versions, model IDs, and event trails for every review." 
            }
          ].map((item) => (
            <div key={item.title} className="card p-6">
              <h3 className="font-serif text-xl font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm text-slate">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

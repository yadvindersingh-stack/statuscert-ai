import Link from "next/link";
import { signupAction } from "./actions";
import FormSubmitButton from "@/components/FormSubmitButton";

export default function SignupPage({
  searchParams
}: {
  searchParams?: { error?: string; message?: string; email?: string; firm_name?: string };
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[960px] rounded-3xl border border-[var(--border)] bg-white shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
        <div className="grid md:grid-cols-[0.95fr_1.05fr]">
          <div className="hidden rounded-l-3xl bg-[linear-gradient(160deg,#0f2742_0%,#173a60_100%)] p-10 text-white md:flex md:flex-col md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">StatusCert AI</p>
              <h2 className="mt-3 font-serif text-3xl leading-tight">Set up your firm workspace in one step.</h2>
            </div>
            <p className="text-sm text-white/80">After sign up, choose a billing plan and start your first review.</p>
          </div>
          <div className="p-8 md:p-10">
            <h1 className="font-serif text-3xl font-semibold">Create your firm account</h1>
            <p className="mt-2 text-sm text-slate">Create your owner account with email and password.</p>
        {searchParams?.error ? (
              <div className="mt-5 rounded-xl border border-[#F1C2B8] bg-[#FFF5F2] px-4 py-3 text-sm text-[#7A2A21]">
            {searchParams.error}
          </div>
        ) : null}
        {searchParams?.message ? (
              <div className="mt-5 rounded-xl border border-[#B7DCC2] bg-[#F2FAF4] px-4 py-3 text-sm text-[#1E5B2B]">
            {searchParams.message}
          </div>
        ) : null}
            <form action={signupAction} className="mt-7 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate">Firm name</label>
            <input
              name="firm_name"
              type="text"
              required
              defaultValue={searchParams?.firm_name || ""}
                  className="form-input"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate">Email</label>
            <input
              name="email"
              type="email"
              required
              defaultValue={searchParams?.email || ""}
                  className="form-input"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate">Password</label>
                <input name="password" type="password" required className="form-input" />
          </div>
              <FormSubmitButton className="btn btn-primary mt-2 w-full disabled:opacity-60" idleLabel="Create account" pendingLabel="Creating account..." />
        </form>
            <p className="mt-5 text-sm text-slate">
              Already have access? <Link className="text-ink underline" href="/login">Log in</Link>
        </p>
          </div>
        </div>
      </div>
    </div>
  );
}

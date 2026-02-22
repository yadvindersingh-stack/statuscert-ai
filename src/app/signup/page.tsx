import Link from "next/link";
import { signupAction } from "./actions";
import FormSubmitButton from "@/components/FormSubmitButton";

export default function SignupPage({
  searchParams
}: {
  searchParams?: { error?: string; message?: string; email?: string; firm_name?: string };
}) {
  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center px-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-serif text-2xl font-semibold">Create your firm</h1>
        <p className="text-sm text-slate mt-2">Owner access with firm-level setup.</p>
        {searchParams?.error ? (
          <div className="mt-4 rounded-xl border border-[#D9A9A0] bg-[#FFF3F1] px-4 py-3 text-sm text-[#7A2A21]">
            {searchParams.error}
          </div>
        ) : null}
        {searchParams?.message ? (
          <div className="mt-4 rounded-xl border border-[#C7D9CC] bg-[#F2FAF4] px-4 py-3 text-sm text-[#1E5B2B]">
            {searchParams.message}
          </div>
        ) : null}
        <form action={signupAction} className="mt-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate">Firm name</label>
            <input
              name="firm_name"
              type="text"
              required
              defaultValue={searchParams?.firm_name || ""}
              className="mt-2 w-full rounded-xl border border-[#DDD6CA] px-4 py-2"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate">Email</label>
            <input
              name="email"
              type="email"
              required
              defaultValue={searchParams?.email || ""}
              className="mt-2 w-full rounded-xl border border-[#DDD6CA] px-4 py-2"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate">Password</label>
            <input name="password" type="password" required className="mt-2 w-full rounded-xl border border-[#DDD6CA] px-4 py-2" />
          </div>
          <FormSubmitButton className="btn btn-primary w-full disabled:opacity-60" idleLabel="Create firm" pendingLabel="Creating..." />
        </form>
        <p className="mt-4 text-sm text-slate">
          Already have access? <Link className="text-ink underline" href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}

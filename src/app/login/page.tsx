import Link from "next/link";
import { loginAction } from "./actions";
import FormSubmitButton from "@/components/FormSubmitButton";

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string; message?: string; email?: string };
}) {
  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center px-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-serif text-2xl font-semibold">Log in</h1>
        <p className="text-sm text-slate mt-2">Access your firm workspace.</p>
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
        <form action={loginAction} className="mt-6 space-y-4">
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
          <FormSubmitButton className="btn btn-primary w-full disabled:opacity-60" idleLabel="Log in" pendingLabel="Logging in..." />
        </form>
        <p className="mt-4 text-sm text-slate">
          No account? <Link className="text-ink underline" href="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
}

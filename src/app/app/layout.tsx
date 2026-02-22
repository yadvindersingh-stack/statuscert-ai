import Link from "next/link";
import { requireUser } from "@/lib/auth";
import AppNav from "@/components/AppNav";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-8">
            <Link href="/app/reviews" className="font-semibold tracking-wide">StatusCert AI</Link>
            <AppNav />
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate">Ontario Condo Review Platform</div>
            <form action={logoutAction}>
              <button className="btn btn-secondary px-4 py-1.5 text-xs">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        {children}
      </main>
    </div>
  );
}

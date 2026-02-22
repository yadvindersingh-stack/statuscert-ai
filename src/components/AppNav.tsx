"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app/reviews", label: "Reviews" },
  { href: "/app/templates", label: "Templates" },
  { href: "/app/billing", label: "Billing" },
  { href: "/app/settings", label: "Settings" }
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1.5 transition ${
              active ? "bg-[#E6ECF5] text-ink" : "text-slate hover:bg-[#F1F4F9] hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}


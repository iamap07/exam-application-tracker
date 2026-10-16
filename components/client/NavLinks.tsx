"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (h: string) => (h === "/admin" || h === "/sme" ? path === h : path.startsWith(h));
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm md:border-l-2 md:rounded-l-none ${active(i.href) ? "bg-teal-50 font-medium text-teal-900 md:border-teal-700" : "text-slate-700 hover:bg-slate-100 md:border-transparent"}`}>{i.label}</Link>
      ))}
    </nav>
  );
}

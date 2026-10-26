import type { ReactNode } from "react";
import NavLinks from "./client/NavLinks";
import { SignOutButton } from "./client/AuthForms";

export default function Shell({ title, email, role, nav, children }: { title: string; email: string; role: string; nav: { href: string; label: string }[]; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 md:grid md:grid-cols-[15rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-white focus:p-2">Skip to content</a>
      <aside className="border-b border-slate-200 bg-white p-3 md:min-h-screen md:border-b-0 md:border-r md:p-4">
        <div className="mb-3 flex items-center justify-between md:block">
          <div className="text-base font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 md:mt-1">{email} · {role.replace("_", " ")}</div>
        </div>
        <NavLinks items={nav} />
        <div className="mt-3 md:mt-6"><SignOutButton /></div>
      </aside>
      <main id="main" className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}

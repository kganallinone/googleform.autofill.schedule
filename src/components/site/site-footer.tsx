import Link from "next/link";

import { ftccMainNav, mainNav } from "@/lib/site";

import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xl text-sm leading-7 text-slate-600">
            All rights reserved &copy; 2026.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          {ftccMainNav.map((item) => (
            <Link
              key={item.href}
              href={`/${item.href}`}
              className="transition hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

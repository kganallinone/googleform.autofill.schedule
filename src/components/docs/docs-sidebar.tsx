import Link from "next/link";

import type { DocMeta } from "@/lib/docs";
import { cn } from "@/lib/utils";

type DocsSidebarProps = {
  docs: DocMeta[];
  currentSlug: string;
};

export function DocsSidebar({ docs, currentSlug }: DocsSidebarProps) {
  return (
    <aside className="rounded-[2rem] border border-border bg-white p-5 shadow-sm lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-hidden">
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
        Documentation
      </p>
      <div className="mt-4 space-y-1 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
        {docs.map((doc) => {
          const slug = doc.slug.join("/");
          const href = slug === "index" ? "/docs" : `/docs/${slug}`;

          return (
            <Link
              key={slug}
              href={href}
              className={cn(
                "block rounded-2xl px-3 py-3 transition",
                slug === currentSlug
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <p className="text-sm font-semibold">{doc.title}</p>
              <p
                className={cn(
                  "mt-1 text-xs leading-6",
                  slug === currentSlug ? "text-slate-300" : "text-slate-500",
                )}
              >
                {doc.description}
              </p>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

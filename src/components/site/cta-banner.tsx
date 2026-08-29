import Link from "next/link";

import { Separator } from "@/components/ui/separator";

export function CtaBanner() {
  return (
    <div className="rounded-[2rem] border border-border bg-white p-6 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.4)] md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-700">
            Documentation-first workflow
          </p>
          <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
            Ship sections once, document them once, and reuse them everywhere.
          </h3>
          <p className="max-w-2xl text-base leading-8 text-slate-600">
            The docs route reads markdown files directly from the repository, so
            component guidance lives next to the code instead of in a separate tool.
          </p>
        </div>
        <Link
          href="/docs"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium whitespace-nowrap text-primary-foreground transition hover:bg-primary/90"
        >
          Browse docs
        </Link>
      </div>
      <Separator className="my-6" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          "Document variants and intended use cases",
          "Add live previews for critical components",
          "Keep usage examples close to implementation",
        ].map((item) => (
          <p key={item} className="text-sm leading-7 text-slate-600">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

type ComponentPreviewProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ComponentPreview({
  title,
  description,
  children,
}: ComponentPreviewProps) {
  return (
    <section className="space-y-4 rounded-[2rem] border border-border bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="text-sm leading-7 text-slate-600">{description}</p>
      </div>
      <div className="rounded-[1.5rem] border border-dashed border-blue-200 bg-blue-50/40 p-5">
        {children}
      </div>
    </section>
  );
}

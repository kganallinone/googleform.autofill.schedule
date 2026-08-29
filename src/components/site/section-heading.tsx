import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl space-y-5", className)}>
      <Badge
        variant="outline"
        className="border-blue-200 bg-blue-50 text-blue-700"
      >
        {eyebrow}
      </Badge>
      <div className="space-y-4">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
          {title}
        </h2>
        <p className="max-w-2xl text-base leading-8 text-slate-600">
          {description}
        </p>
      </div>
    </div>
  );
}

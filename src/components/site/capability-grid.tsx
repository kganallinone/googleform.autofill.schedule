import { ArrowRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { capabilities } from "@/lib/site";

export function CapabilityGrid() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {capabilities.map((item) => (
        <Card
          key={item.title}
          className="group border-border/70 bg-white/90 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
        >
          <CardHeader className="space-y-5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <item.icon className="size-5" />
            </div>
            <div className="space-y-3">
              <CardTitle className="text-xl tracking-tight text-slate-950">
                {item.title}
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                {item.description}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition group-hover:gap-3">
              Learn More
              <ArrowRight className="size-4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

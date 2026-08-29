import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-grid" />
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 pb-18 pt-16 md:px-10 lg:items-start lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:pb-24 lg:pt-24">
        <div className="space-y-8">
          <Badge className="rounded-full border-blue-200 bg-blue-50 px-4 py-1.5 text-blue-700 hover:bg-blue-50">
            Filipino Trusted Care Center
          </Badge>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
              Your Trusted Healthcare Partner
            </h1>
            <p className="max-w-2xl text-md leading-8 text-slate-600">
              FTCC (Filipino Trusted Care Company) translates the vision of the
              Universal Health Care (UHC) Act into action by operating
              compliant, technology-driven Konsulta networks
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/about"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-primary px-6 text-sm font-medium whitespace-nowrap text-primary-foreground transition hover:bg-primary/90"
            >
              Explore More
              <ArrowUpRight className="size-4" />
            </Link>
            {/* <Link
              href="#solutions"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-background px-6 text-sm font-medium whitespace-nowrap text-foreground transition hover:bg-muted"
            >
              FTCC as Service Provider
            </Link> */}
          </div>
          <p className="max-w-2xl text-md leading-5 text-slate-600">
            PhilHealth Konsulta aims to:
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              "Protect the health of every Filipinos against chronic illnesses.",
              "Avoid complications through early detection.",
              "To provide affordable drugs and medicines.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-border bg-white/80 p-4 text-sm leading-7 text-slate-700 shadow-sm backdrop-blur"
              >
                <CheckCircle2 className="mb-3 size-4 text-blue-700" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div>
          <img
            src="/hero.png"
            className="h-[800px] hidden lg:block ml-[100px]"
            alt=""
          />
        </div>
      </div>
    </section>
  );
}

"use client";

import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  return (
    <Card className="self-start border-slate-900 bg-slate-950 text-white shadow-[0_32px_120px_-48px_rgba(15,23,42,0.85)]">
      <CardHeader className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-200">
          Get in Touch
        </p>
        <CardTitle className="text-3xl">A ready-made inquiry form.</CardTitle>
        <CardDescription className="text-base leading-7 text-slate-300">
          Send your inquiry directly via email.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();

            const form = e.currentTarget;
            const company = form.company.value;
            const email = form.email.value;
            const message = form.message.value;

            const subject = encodeURIComponent(
              `Inquiry from ${company || "Website"}`,
            );

            const body = encodeURIComponent(
              `Company: ${company}\nEmail: ${email}\n\nMessage:\n${message}`,
            );

            window.open(
              `mailto:ftccmedicalinc@gmail.com?subject=${subject}&body=${body}`,
              "_blank",
            );
          }}
        >
          <Input
            id="company"
            name="company"
            placeholder="Company name"
            className="border-white/10 bg-white/5 text-white placeholder:text-slate-400"
          />

          <Input
            id="email"
            name="email"
            type="email"
            placeholder="Email address"
            className="border-white/10 bg-white/5 text-white placeholder:text-slate-400"
          />

          <Textarea
            id="message"
            name="message"
            placeholder="Tell FTCC about your inquiry..."
            className="min-h-36 border-white/10 bg-white/5 text-white placeholder:text-slate-400"
          />

          <Button
            type="submit"
            size="lg"
            className="w-full rounded-full flex items-center justify-center gap-2"
          >
            Send inquiry
            <Send className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

import { ArrowRight } from "lucide-react";

import { ContactForm } from "@/components/site/contact-form";
import { SectionHeading } from "@/components/site/section-heading";
import { Badge } from "@/components/ui/badge";
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

import { ComponentPreview } from "./component-preview";

const previewRegistry: Record<string, React.ReactNode> = {
  "components/button": (
    <ComponentPreview
      title="Button variants"
      description="Use buttons for primary actions, secondary actions, and low-emphasis links."
    >
      <div className="flex flex-wrap gap-3">
        <Button>Primary action</Button>
        <Button variant="outline">Secondary action</Button>
        <Button variant="ghost">Ghost action</Button>
        <Button variant="link" className="px-0">
          Inline link
        </Button>
      </div>
    </ComponentPreview>
  ),
  "components/card": (
    <ComponentPreview
      title="Card composition"
      description="Cards work well for summaries, service highlights, and content groupings."
    >
      <Card className="max-w-md border-border/70 bg-white">
        <CardHeader>
          <Badge
            variant="outline"
            className="w-fit border-blue-200 bg-blue-50 text-blue-700"
          >
            Featured
          </Badge>
          <CardTitle>Implementation snapshot</CardTitle>
          <CardDescription>
            Combine `CardHeader` and `CardContent` to express reusable content blocks.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="max-w-xs text-sm leading-7 text-slate-600">
            This pattern suits service cards, documentation callouts, and onboarding panels.
          </p>
          <ArrowRight className="size-5 text-blue-700" />
        </CardContent>
      </Card>
    </ComponentPreview>
  ),
  "components/form-controls": (
    <ComponentPreview
      title="Form controls"
      description="Inputs and textareas should be wrapped in a dedicated form component once submission logic exists."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Input placeholder="Project name" />
          <Input placeholder="Team email" type="email" />
          <Textarea placeholder="Describe the workflow problem or requirement." />
        </div>
        <ContactForm />
      </div>
    </ComponentPreview>
  ),
  "layout/sections": (
    <ComponentPreview
      title="Section composition"
      description="Page sections should assemble smaller UI primitives, not re-implement them."
    >
      <div className="space-y-6">
        <SectionHeading
          eyebrow="Reusable section"
          title="This is the preferred pattern for headline-led content blocks."
          description="The component centralizes spacing, typography, and label treatment so every section starts from the same baseline."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {["Hero", "Feature grid", "CTA"].map((item) => (
            <Card key={item}>
              <CardHeader>
                <CardTitle>{item}</CardTitle>
                <CardDescription>
                  Compose with existing `ui` primitives and pass only the content.
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </ComponentPreview>
  ),
};

type LivePreviewsProps = {
  slug: string;
};

export function LivePreviews({ slug }: LivePreviewsProps) {
  return previewRegistry[slug] ?? null;
}

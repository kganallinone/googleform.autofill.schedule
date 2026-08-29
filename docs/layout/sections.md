---
title: Section Patterns
description: How FTCC-specific sections should be composed and extended.
order: 40
---

# Section Patterns

FTCC-specific content sections belong in `src/components/site`.

## Principles

- Compose from shared `ui` primitives instead of duplicating control styles.
- Keep sections content-driven: props should describe content, not styling tweaks.
- Prefer a small number of dependable section patterns over many one-off layouts.

## Current examples

- `Hero`
- `CapabilityGrid`
- `CtaBanner`
- `ContactForm`
- `SectionHeading`

## Example workflow

```tsx
import { SectionHeading } from "@/components/site/section-heading";

export function ServicesSection() {
  return (
    <section className="py-16">
      <SectionHeading
        eyebrow="Services"
        title="Implementation and support"
        description="Reusable narrative wrapper for section intros."
      />
    </section>
  );
}
```

## Documentation rule

If a section becomes part of the standard FTCC page toolkit, add a markdown entry for it and a preview if visual behavior matters.

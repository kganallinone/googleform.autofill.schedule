---
title: Form Controls
description: Patterns for the shared input and textarea primitives.
order: 30
---

# Form Controls

The current template includes `Input` and `Textarea` primitives from `shadcn/ui`.

## Recommended usage

- Wrap controls in a dedicated form component.
- Pass semantic `type` values for email, phone, and numeric fields.
- Add labels when wiring a production form, even if placeholders exist.
- Keep validation and submit logic close to the form boundary.

## Example

```tsx
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function InquiryFields() {
  return (
    <div className="grid gap-4">
      <Input type="email" placeholder="Email address" />
      <Textarea placeholder="Project brief" />
    </div>
  );
}
```

## Next step

When this moves beyond template mode, introduce a form schema and server action or route handler for submission.

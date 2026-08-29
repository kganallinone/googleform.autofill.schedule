---
title: Button
description: Usage guidance for the shared button component generated with shadcn/ui.
order: 10
---

# Button

The shared button lives at `src/components/ui/button.tsx`.

Use it for clear user actions and pick variants based on emphasis:

- `default` for primary calls to action
- `outline` for secondary actions
- `ghost` for low-emphasis surface actions
- `link` for inline navigation inside content

## Example

```tsx
import { Button } from "@/components/ui/button";

export function Example() {
  return (
    <div className="flex gap-3">
      <Button>Primary action</Button>
      <Button variant="outline">Secondary action</Button>
    </div>
  );
}
```

## Notes

- Use `asChild` when the button should render a `Link`.
- Keep icons small and aligned with the action label.
- Avoid using multiple primary buttons in the same section.

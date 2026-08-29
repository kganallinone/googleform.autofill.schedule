---
title: Card
description: Guidance for summary cards, service cards, and content containers.
order: 20
---

# Card

Cards are useful when content needs clear grouping with a consistent surface.

The standard composition is:

- `Card`
- `CardHeader`
- `CardTitle`
- `CardDescription`
- `CardContent`

## Example

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ServiceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Systems</CardTitle>
        <CardDescription>
          Tools for stock movement, audits, and internal operations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>Reusable page content goes here.</p>
      </CardContent>
    </Card>
  );
}
```

## Notes

- Use cards for repeated content patterns, not as a replacement for every section wrapper.
- Keep spacing consistent by relying on the provided subcomponents.
- If a card needs a badge, place it in `CardHeader`.

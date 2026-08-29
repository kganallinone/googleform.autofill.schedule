---
title: Routing
description: Practical routing guidance for a modern Next.js App Router codebase.
order: 6
---

# Routing

This project should follow the **App Router** model, which is the current recommended routing system in Next.js.

The routing mental model is:

- folders define route segments
- `page.tsx` creates a route
- `layout.tsx` wraps nested routes
- `route.ts` handles backend requests
- special conventions like `(group)` and `[slug]` control advanced routing behavior

## Core route files

### `page.tsx`

Creates a route UI.

Examples:

- `src/app/page.tsx` -> `/`
- `src/app/about/page.tsx` -> `/about`
- `src/app/services/erp/page.tsx` -> `/services/erp`

Use `page.tsx` only for route entry composition, not for storing every reusable component inline.

### `layout.tsx`

Wraps child routes and persists across navigation.

Use it for:

- shared navigation
- section shells
- auth-aware wrappers
- route-level metadata boundaries

Example:

```txt
src/app/(marketing)/layout.tsx
src/app/(marketing)/about/page.tsx
src/app/(marketing)/services/page.tsx
```

That layout wraps both `/about` and `/services`.

### `loading.tsx`

Shows a fallback UI while a route segment is loading.

Use this for:

- skeletons
- loading placeholders
- async route transitions

### `error.tsx`

Defines a route-level error boundary.

Use it when a route or nested component can fail and you want localized recovery instead of a full app error state.

### `not-found.tsx`

Defines the UI for missing routes or missing resources when `notFound()` is called.

## Basic route structure

```txt
src/app/
  layout.tsx
  page.tsx
  about/
    page.tsx
  services/
    page.tsx
  contact/
    page.tsx
```

This produces:

- `/`
- `/about`
- `/services`
- `/contact`

## Nested routes

Nested folders create nested URLs.

```txt
src/app/services/
  page.tsx
  erp/
    page.tsx
  websites/
    page.tsx
```

This produces:

- `/services`
- `/services/erp`
- `/services/websites`

This is the standard way to grow site sections.

## Route groups

Route groups use parentheses and do **not** affect the URL.

Example:

```txt
src/app/
  (marketing)/
    page.tsx
    about/
      page.tsx
  (docs)/
    docs/
      [[...slug]]/
        page.tsx
```

This still creates:

- `/`
- `/about`
- `/docs`

Use route groups when you want to:

- organize different app areas
- apply different layouts
- separate marketing, docs, dashboard, or auth flows

Recommended FTCC groups:

- `(marketing)` for public site pages
- `(docs)` for docs pages
- `(dashboard)` if an internal app is added later

## Dynamic routes

Use square brackets for variable path segments.

Example:

```txt
src/app/blog/[slug]/page.tsx
```

This matches:

- `/blog/hello-world`
- `/blog/ftcc-launch`

In App Router, route params are passed to the page.

```tsx
type BlogPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BlogPage({ params }: BlogPageProps) {
  const { slug } = await params;

  return <div>{slug}</div>;
}
```

## Catch-all and optional catch-all routes

Use catch-all segments when the number of path parts can vary.

### Catch-all

```txt
src/app/docs/[...slug]/page.tsx
```

Matches:

- `/docs/components/button`
- `/docs/architecture/routing`

### Optional catch-all

```txt
src/app/docs/[[...slug]]/page.tsx
```

Also matches:

- `/docs`

This is what your docs route currently uses, and it is the correct pattern for a markdown docs section.

## Route Handlers

Use `route.ts` inside `app` when you need request handling.

Example:

```txt
src/app/api/contact/route.ts
```

This creates:

- `/api/contact`

Typical use cases:

- contact form submission
- webhook endpoints
- health checks
- backend-for-frontend endpoints

Example:

```ts
export async function POST(request: Request) {
  const body = await request.json();

  return Response.json({ ok: true, received: body });
}
```

Supported methods include:

- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `HEAD`
- `OPTIONS`

## Important rule: `page.tsx` and `route.ts` cannot share the same segment

Do not place both at the same route level.

Bad:

```txt
src/app/contact/page.tsx
src/app/contact/route.ts
```

If you need both page UI and an API endpoint, place the API endpoint under `app/api/...`.

Good:

```txt
src/app/contact/page.tsx
src/app/api/contact/route.ts
```

## Navigation best practices

Use `Link` from `next/link` for internal navigation.

Good:

```tsx
import Link from "next/link";

<Link href="/docs">Docs</Link>;
```

Avoid raw `<a>` tags for internal routes unless you specifically want normal browser navigation.

## When to use `useRouter`

Use `useRouter` only in client components when navigation must happen programmatically.

Examples:

- redirecting after form submission
- stepping through a wizard
- back/forward interactions

Prefer `Link` whenever a visible navigation element exists.

## Colocation with routes

App Router allows you to colocate non-route files inside route folders.

Example:

```txt
src/app/dashboard/
  _components/
    stats-card.tsx
  _lib/
    get-dashboard-data.ts
  page.tsx
```

Only special files like `page.tsx`, `layout.tsx`, and `route.ts` become part of routing.

This is useful when code is route-specific and should stay near the route.

## Recommended FTCC routing approach

For this codebase, use these defaults:

- `src/app/(marketing)` for public website pages
- `src/app/docs/[[...slug]]/page.tsx` for docs content
- `src/app/api/**/route.ts` for API endpoints
- route-specific helpers can live in `_components` or `_lib` near the route
- globally reusable UI should stay in `src/components`

## Example FTCC routing layout

```txt
src/app/
  (marketing)/
    layout.tsx
    page.tsx
    about/
      page.tsx
    services/
      page.tsx
      erp/
        page.tsx
      websites/
        page.tsx
    contact/
      page.tsx
  docs/
    [[...slug]]/
      page.tsx
  api/
    contact/
      route.ts
    health/
      route.ts
```

## Practical rules

- keep route files thin
- use nested layouts for shared route shells
- use route groups to organize without changing URLs
- use dynamic segments only when the path genuinely depends on data
- prefer Route Handlers over legacy `pages/api` in App Router projects
- colocate route-specific code near the route, but keep shared code out of `app`

## Source notes

This guidance is based on current Next.js App Router documentation for:

- layouts and pages
- project structure and colocation
- route groups
- dynamic routes
- Route Handlers

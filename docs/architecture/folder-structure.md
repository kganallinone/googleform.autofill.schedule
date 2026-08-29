---
title: Folder Structure
description: Recommended App Router folder structure for a modern Next.js codebase, including hooks, services, route groups, and API handlers.
order: 5
---

# Folder Structure

This project uses the **App Router** approach, which is the recommended structure for modern Next.js applications.

For FTCC projects, the goal is simple:

- keep routing concerns in `src/app`
- keep reusable UI outside route files
- keep server integrations explicit
- organize by shared layer first, then by feature when needed

## Recommended structure

```txt
src/
  app/
    (marketing)/
      layout.tsx
      page.tsx
      about/
        page.tsx
      services/
        page.tsx
      contact/
        page.tsx
    (docs)/
      docs/
        [[...slug]]/
          page.tsx
    dashboard/
      layout.tsx
      page.tsx
      loading.tsx
      error.tsx
    api/
      contact/
        route.ts
      health/
        route.ts
    favicon.ico
    icon.png
    apple-icon.png
    globals.css
    layout.tsx
    not-found.tsx
  components/
    ui/
      button.tsx
      card.tsx
      input.tsx
    site/
      hero.tsx
      site-header.tsx
      site-footer.tsx
    docs/
      docs-sidebar.tsx
      live-previews.tsx
  hooks/
    use-mobile.ts
    use-scroll-position.ts
  lib/
    utils.ts
    site.ts
    docs.ts
    validations/
      contact.ts
    constants/
      navigation.ts
  services/
    contact.service.ts
    cms.service.ts
    analytics.service.ts
  types/
    contact.ts
    navigation.ts
  styles/
    editor.css
docs/
  architecture/
    folder-structure.md
  components/
  layout/
```

## What goes where

### `src/app`

This is for routing, layouts, route-level loading states, metadata, and server entry points.

Use it for:

- `page.tsx` for route UI
- `layout.tsx` for shared wrappers
- `loading.tsx` for suspense fallback UI
- `error.tsx` for route error boundaries
- `not-found.tsx` for route-level 404 UI
- `route.ts` for Route Handlers

Do not turn `app` into a general dumping ground for reusable components.

## Route groups

Use folders wrapped in parentheses when you want to organize routes without affecting the URL.

Examples:

- `(marketing)` for public website pages
- `(dashboard)` for authenticated app screens
- `(docs)` for internal documentation routes

This is preferred over forcing everything into one flat `app` tree.

## Private folders

Use underscore-prefixed folders for non-routable implementation details when colocating files inside `app`.

Example:

```txt
src/app/dashboard/
  _components/
    stats-card.tsx
  _lib/
    get-dashboard-data.ts
  page.tsx
```

This keeps route-adjacent code close to the route without making it routable.

## `src/components`

Use this for reusable React components.

Recommended split:

- `components/ui` for design-system primitives like buttons, cards, inputs, dialogs
- `components/site` for FTCC-specific sections like hero blocks, navbars, forms, footers
- `components/docs` for documentation-only rendering and preview helpers

If a component is used across multiple routes, it belongs here instead of inside a single page file.

## `src/hooks`

Put custom React hooks here when they are shared across multiple features.

Examples:

- `use-mobile.ts`
- `use-scroll-position.ts`
- `use-debounce.ts`

Keep hooks focused on UI behavior or client-side state coordination.

If a hook only exists for one route and will not be reused, it can be colocated near that route instead.

## `src/lib`

Use `lib` for pure helpers, low-level utilities, shared configuration, parsers, and validation logic.

Good fits:

- `utils.ts`
- `docs.ts`
- schema helpers
- formatters
- constant maps
- server-safe helper functions

`lib` should usually stay framework-light. It should not become a folder for React components.

## `src/services`

Use `services` for external or domain-level integrations.

Examples:

- calling a CRM
- submitting contact forms
- fetching CMS content
- analytics adapters
- email delivery integrations

A service is usually a boundary around I/O or business-side operations, not a presentational helper.

Example:

```ts
export async function submitContactInquiry(input: ContactInquiryInput) {
  // call database, webhook, or external API
}
```

## `src/types`

Put shared TypeScript domain types here when they are used in multiple layers.

Examples:

- DTOs used by forms and APIs
- navigation models
- CMS content shapes

If a type is only used by one file, keep it local to that file.

## `src/styles`

Use this only for additional stylesheet modules or editor/content CSS that should not live in `globals.css`.

For most UI work in this project, Tailwind utilities and component-level composition should be the default.

## API and backend structure

For an App Router project, prefer **Route Handlers** under `app/api/.../route.ts`.

Example:

```txt
src/app/api/contact/route.ts
src/app/api/newsletter/route.ts
```

This is the modern equivalent of `pages/api`, and you generally do **not** need both in the same project.

Use `pages/api` only if you are intentionally maintaining legacy Pages Router code.

## `page` vs `pages`

In App Router:

- `page.tsx` is the route entry file
- `pages/` is the legacy Pages Router directory

For a new codebase like this one, prefer:

- `src/app/.../page.tsx`
- `src/app/api/.../route.ts`

Avoid introducing a top-level `pages/` directory unless you have a deliberate migration reason.

## Recommended FTCC rule set

Use these defaults:

- public website pages go under `src/app/(marketing)`
- docs routes stay under `src/app/(docs)` or `src/app/docs`
- shared design system primitives go under `src/components/ui`
- FTCC-branded sections go under `src/components/site`
- reusable hooks go under `src/hooks`
- pure utilities and config go under `src/lib`
- external integrations and domain operations go under `src/services`
- API endpoints use `src/app/api/**/route.ts`

## Practical notes

- Start simple. Do not create every folder on day one unless it has a real use.
- Split by feature only when a feature has enough size to justify local files.
- Keep route files thin. Let pages compose sections instead of implementing everything inline.
- Prefer colocating route-specific helpers close to the route, and keep globally reused logic in shared folders.

## Source notes

This recommendation is based on current Next.js App Router guidance around:

- `app` as the primary router
- route groups using `(group-name)`
- private folders using `_folder`
- Route Handlers in `app/api`
- optional `src` folder support

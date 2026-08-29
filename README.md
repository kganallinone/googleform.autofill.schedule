# FTCC Website

A production-oriented website starter for **FTCC Solutions Inc.** built with **Next.js App Router**, **TypeScript**, **Tailwind CSS v4**, and **shadcn/ui**.

This repository is structured as a reusable marketing-site foundation with:

- a branded homepage template
- shared UI primitives under `components/ui`
- FTCC-specific page sections under `components/site`
- markdown-powered documentation under `docs/`
- an in-app docs experience at `/docs`

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- React Markdown + gray-matter for docs rendering

## Features

- App Router-first project structure
- Reusable component architecture
- FTCC-branded header, footer, and icons
- Markdown-backed component and architecture docs
- Static docs route with live previews
- Clean separation between route files, shared UI, site sections, and utilities

## Project Structure

```txt
.
|-- docs/
|   |-- architecture/
|   |-- components/
|   `-- layout/
|-- public/
|   |-- ftcc-logo.png
|   `-- logo.png
|-- src/
|   |-- app/
|   |   |-- docs/[[...slug]]/
|   |   |-- apple-icon.png
|   |   |-- favicon.ico
|   |   |-- globals.css
|   |   |-- icon.png
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   |-- components/
|   |   |-- docs/
|   |   |-- site/
|   |   `-- ui/
|   `-- lib/
|       |-- docs.ts
|       |-- site.ts
|       `-- utils.ts
|-- package.json
`-- README.md
```

## Folder Conventions

### `src/app`

Contains routes, layouts, metadata, and route-specific entry files.

### `src/components/ui`

Contains reusable UI primitives and generated `shadcn/ui` components.

### `src/components/site`

Contains FTCC-specific sections such as the hero, footer, header, CTA blocks, and contact form.

### `src/components/docs`

Contains the docs sidebar, preview wrappers, and live demo helpers used by the `/docs` route.

### `src/lib`

Contains shared utilities, docs parsing logic, and site configuration.

### `docs`

Contains markdown files rendered by the docs route. This includes component guidance and architecture references.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install dependencies

```bash
pnpm install
```

### Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

## Documentation

The project includes an internal docs experience at:

```txt
/docs
```

Documentation content is sourced from markdown files under `docs/`.

Current docs include:

- component usage guides
- section composition guidance
- architecture guidance for folder structure
- architecture guidance for routing in Next.js

## Adding a New Component

1. Add or generate the component under `src/components/ui` or `src/components/site`.
2. Reuse it from route files instead of duplicating markup in `page.tsx`.
3. Add a markdown doc under `docs/components` or another appropriate docs section.
4. If useful, register a visual preview in `src/components/docs/live-previews.tsx`.

## Adding a New Docs Page

1. Create a markdown file under `docs/`.
2. Add frontmatter:

```md
---
title: Example Title
description: Short description for the docs sidebar.
order: 50
---
```

3. The `/docs` route will automatically pick it up.

## Design Direction

The current UI follows these FTCC defaults:

- blue, white, and black palette
- clean enterprise-oriented layout
- reusable content sections
- restrained motion and strong spacing rhythm

## Recommended Development Rules

- Keep route files thin.
- Put shared UI in `components/ui`.
- Put branded FTCC sections in `components/site`.
- Keep parsing, constants, and helpers in `lib`.
- Use markdown docs to document reusable building blocks.
- Prefer App Router patterns over legacy `pages/` patterns.

## Build Verification

Before merging changes, run:

```bash
pnpm lint
pnpm build
```

## Notes

- Browser icons may be cached aggressively. If the favicon or tab icon does not update immediately, hard refresh or reopen the tab.
- The docs sidebar and previews are intended to scale as more internal UI guidance is added.

## License

Internal FTCC project. Update this section if a formal license is introduced later.

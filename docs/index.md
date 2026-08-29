---
title: FTCC Docs
description: Overview of the FTCC website template, structure, and documentation workflow.
order: 1
---

# FTCC Website Template

This repository is structured around a few stable layers:

- `src/app` owns routes, layouts, metadata, and page composition.
- `src/components/ui` contains generated `shadcn/ui` primitives.
- `src/components/site` contains FTCC-specific marketing sections and page blocks.
- `src/lib` holds shared utilities, configuration, and markdown-loading helpers.
- `docs/` stores markdown documentation rendered by the `/docs` route.

## Why this structure

The goal is to keep generic UI separate from brand-specific presentation.

- When you need a new low-level control, add it under `components/ui`.
- When you need a new homepage or landing-page section, add it under `components/site`.
- When a component needs guidance, add a markdown file here and optionally a live preview in `src/components/docs/live-previews.tsx`.

## Workflow

1. Add or update a component.
2. Document intended usage in a markdown file.
3. Add a preview if the component benefits from a visual example.
4. Reuse the same component across routes instead of duplicating markup.

## Recommended conventions

| Area | Convention |
| --- | --- |
| Naming | Use PascalCase for React components and kebab-case for markdown files. |
| Imports | Use the `@/` alias for app code. |
| Styling | Prefer utility classes and shared variants over page-specific overrides. |
| Docs | Keep short implementation notes close to each component entry. |

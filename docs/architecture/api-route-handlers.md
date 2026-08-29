---
title: API Route Handlers
description: Recommended structure and examples for API endpoints in a Next.js App Router project.
order: 7
---

# API Route Handlers

In a modern Next.js App Router project, API endpoints should live under:

```txt
src/app/api/**/route.ts
```

This is the preferred replacement for legacy `pages/api`.

## Why this approach

Route Handlers keep request handling inside the App Router model while still giving you server-side endpoints for:

- contact forms
- webhooks
- health checks
- backend-for-frontend endpoints
- integrations with external services

## Current FTCC examples

This codebase now includes these example endpoints:

```txt
src/app/api/health/route.ts
src/app/api/contact/route.ts
src/app/api/users/route.ts
src/app/api/users/[id]/route.ts
```

They expose:

- `GET /api/health`
- `POST /api/contact`
- `GET /api/users`
- `POST /api/users`
- `GET /api/users/:id`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

## Example folder structure

```txt
src/
  app/
    api/
      contact/
        route.ts
      health/
        route.ts
      users/
        route.ts
        [id]/
          route.ts
  services/
    contact.service.ts
    user.service.ts
  types/
    contact.ts
    user.ts
```

This is the pattern to follow:

- the route file handles HTTP details
- `services` handle domain or external integration logic
- `types` hold shared request and response shapes

## Recommended responsibility split

### `route.ts`

Keep Route Handlers focused on:

- parsing requests
- validating input
- returning HTTP responses
- calling a service or domain layer

Avoid putting all business logic directly into the route file.

### `services`

Use services for:

- database writes
- CRM calls
- email providers
- CMS integrations
- analytics and logging adapters

This keeps your API layer thin and easier to test.

### `types`

Use shared types for:

- request payloads
- service input shapes
- response contracts

## Example: health endpoint

The health endpoint is a simple read-only endpoint:

```ts
export async function GET() {
  return Response.json({
    ok: true,
    service: "ftcc.website",
    timestamp: new Date().toISOString(),
  });
}
```

Use this kind of route for:

- uptime checks
- deployment verification
- environment smoke tests

## Example: contact endpoint

The contact endpoint shows a more realistic pattern:

1. parse the JSON body
2. validate the payload shape
3. normalize and validate field values
4. call a service
5. return a structured response

This is a good baseline for form submission endpoints.

## Example: CRUD endpoint

The users example is a focused CRUD sample for App Router APIs only.

It demonstrates:

1. `GET /api/users` to list records
2. `POST /api/users` to create a record
3. `GET /api/users/:id` to fetch one record
4. `PATCH /api/users/:id` to update one record
5. `DELETE /api/users/:id` to delete one record

The current sample uses an in-memory store through `user.service.ts`, which is appropriate for documentation and local reference code but not for production persistence.

Use this pattern when teaching or scaffolding a new endpoint:

- collection route for list and create
- dynamic route for read, update, and delete
- shared type definitions
- service layer to isolate storage logic

## Recommended response shape

Keep API responses explicit and predictable.

Example:

```json
{
  "ok": true,
  "message": "Inquiry received.",
  "data": {
    "id": "generated-id",
    "receivedAt": "2026-03-18T00:00:00.000Z"
  }
}
```

For validation errors:

```json
{
  "ok": false,
  "message": "Please provide a valid email address."
}
```

## Best practices

- keep handlers small
- validate input at the API boundary
- return proper status codes
- move integration logic into `services`
- keep domain types reusable
- avoid mixing page UI and API files in the same route segment

## Common status codes

- `200` for successful reads
- `201` for successful creation
- `400` for invalid client input
- `401` for unauthorized access
- `403` for forbidden access
- `404` for missing resources
- `500` for unexpected server failures

## Example next steps for FTCC

You can evolve the current contact example by adding:

- schema validation with Zod
- persistence to a database
- email notifications
- webhook forwarding
- rate limiting
- bot protection

## Related docs

- see `Folder Structure` for where `services` and `types` belong
- see `Routing` for how `app/api/.../route.ts` fits into App Router

# Luminova Construction PM

A responsive construction operations workspace for projects, trades, quotes, budgets, invoices, site photography, and team communication.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/luminova-pm/` — React/Vite web app and Luminova brand assets
- `artifacts/api-server/src/routes/luminova.ts` — current project, trade, dashboard, and invoice API behavior
- `lib/api-spec/openapi.yaml` — source of truth for API contracts and generated client hooks
- `artifacts/luminova-pm/src/index.css` — exact Luminova design tokens and global theme

## Architecture decisions

- Money values are represented as integer cents throughout the API.
- Client quotes and trade quotes remain separate concepts and must never share permissions or data shapes.
- The current first-build API uses seeded in-process demo data; durable database persistence is the next backend milestone.
- Gold is reserved for brand and primary actions; status indicators use success, warning, danger, and info tokens.

## Product

The first build includes a live project dashboard, responsive project workspaces, trade directory and profiles, invoice intake with automatic budget approval logic, project creation/editing, activity, messaging presentation, and a branded login experience.

## User preferences

- Use the supplied Luminova logo on dark chrome and login surfaces.
- Keep the interface readable in bright outdoor light and fully responsive for field use.
- Keep realistic demo projects and conversations visible, but never prefill new-project forms or invent missing import values.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

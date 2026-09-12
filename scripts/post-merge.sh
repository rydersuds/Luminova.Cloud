#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
node scripts/normalize-generated-eof.mjs
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
# Git updates can replace watched files without emitting the event tsx needs.
# Touch the entrypoint so the managed development API process reloads merged routes.
touch artifacts/api-server/src/index.ts

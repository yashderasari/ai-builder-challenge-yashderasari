# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A take-home challenge monorepo for building an asset-tracking UX on top of a local Fastify/SQLite API. The backend (`api/`) is read-only for candidates — all work lives in `starter/`.

## Commands

```bash
# From monorepo root — starts API on :8080 and Next.js on :3000
pnpm dev

# Run all tests
pnpm test

# Per-package
pnpm --filter @asset-tracking/starter test
pnpm --filter @asset-tracking/api test

# Typecheck starter
cd starter && pnpm typecheck

# Single test file (vitest)
pnpm --filter @asset-tracking/starter test -- test/ScanInput.test.tsx
```

## Environment

Copy `starter/.env.example` → `starter/.env`. The two vars are `API_BASE_URL` and `API_TOKEN`. Both are server-only — never use `NEXT_PUBLIC_API_TOKEN`.

## Architecture

```
monorepo root (pnpm workspaces)
├── api/           Fastify + better-sqlite3. Do not modify.
└── starter/       Next.js 15 App Router + Tailwind. All candidate work goes here.
    ├── app/                    Pages and route handlers
    │   └── api/upstream/       Proxy that attaches the bearer token (browser → here → API)
    ├── components/
    │   ├── ScanInput.tsx       Auto-focus input, fires onScan(value) on Enter, clears
    │   └── RoleSwitcher.tsx    Cookie-based role toggle (tech-jane / manager-paul)
    └── lib/
        ├── api-client.ts       createApiClient() — auto-detects server vs browser context
        ├── types.ts            All shared types (Asset, Event, Location, scan inputs…)
        └── auth.ts             getRole(), getCurrentUserId(), toggleRole()
```

### Token/proxy pattern

- **Browser code** uses `api` from `lib/api-client.ts` directly. It auto-routes to `/api/upstream/*` which adds the bearer token server-side.
- **Server route handlers** (RSCs, `route.ts` files) use the same `api` import — on the server it talks to `API_BASE_URL` with `API_TOKEN` directly.
- Never pass the token to the browser. Never use `NEXT_PUBLIC_API_TOKEN`.

### Pages to build

| Route | Who | What |
|---|---|---|
| `/tech/receive` | tech | Scan new asset in at receiving dock |
| `/tech/store` | tech | Move asset to storage |
| `/tech/deploy` | tech | Rack asset (requires site/room/rack/ru) |
| `/tech/transfer` | tech | Custody handoff — scan asset then receiving badge |
| `/manager` | manager | Asset list with pagination/filtering |
| `/manager/assets/[tag]` | manager | Asset detail + event log |
| `/manager/reconcile` | manager | Three-way diff: ops vs facilities vs finance |

The reconciliation join **must** live in `app/api/reconcile/route.ts` (server route handler), not in the page component. This keeps the token server-side and makes the logic testable.

### Facilities/finance write-back

After a successful scan:
- **deploy** → POST to `/v1/mock/facilities/spaces` (set rack_location) and `/v1/mock/finance/equipment` (status: `capitalized`)
- **store from `in_service`** → POST to `/v1/mock/facilities/spaces` with `rack_location: null`
- receive / store-from-received / transfer → no writes

Fire these from a server route handler, not from browser code, for the same token-security reason as reconcile.

### State machine (valid transitions)

```
unreceived → received → stored ⇄ in_service → rma_pending → received
                  ↓                    ↓
              disposed             disposed
```

Only `receive`, `store`, `deploy`, and `transfer` (state-preserving) are exposed as scan endpoints.

### Key API behaviors to handle in the UI

- **Receive + matching serial** → idempotent 200, writes a `duplicate_receive` event
- **Receive + different serial** → 409 `and_match_failed`. Show the existing serial.
- **Deploy** requires `site`, `room`, `rack`, and `ru` — 422 `incomplete_deploy_location` otherwise
- **Transfer** requires `to_custodian` ≠ current custodian — 422 `same_custodian` otherwise
- Branch error handling on `ApiError.code`, not on the message string

### ScanInput contract

`<ScanInput onScan={fn} />` fires `onScan(trimmedValue)` on Enter, then clears and re-focuses. Design rule: focus must stay on the input after any error — the tech's next action is always the next scan.

### Auth (simulated)

`lib/auth.ts` reads/writes a cookie. `getRole()` returns `"tech" | "manager"`. `getCurrentUserId()` maps to `"tech-jane"` or `"manager-paul"`. No real auth.

## Testing

Vitest + React Testing Library. Config in `starter/vitest.config.ts` and `api/vitest.config.ts`. Test setup files at `starter/test/setup.ts` / `api/test/setup.ts`.

## Reset

`api.reset()` calls `POST /v1/reset` and re-seeds ~1,000 assets. Use before Loom recordings. Acceptable in a `/dev/*` route; remove from any production surface.

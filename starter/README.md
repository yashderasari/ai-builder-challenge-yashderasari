# Asset tracking — submission

Built by Yash Derasari for the take-home challenge.

## How to run locally

```bash
# From the monorepo root
pnpm install
pnpm dev
# API on :8080, starter on :3000
```

Copy `starter/.env.example` → `starter/.env` and fill in `API_BASE_URL` and `API_TOKEN` from your challenge email. For local dev the defaults work as-is.

Open http://localhost:3000.

## What was built

**Tech scan workflows** (`/tech/*`)

Four screens for a lab tech — receive, store, deploy, transfer. Built for the 11pm-in-a-cold-dock-bay constraint: large tap targets (min 44px), focus stays on the input after any error, every error message names the problem and says what to do next. Both USB/Bluetooth keyboard-wedge scanners and phone camera scanning (`@zxing/browser`, Code 128 + QR) are supported via an explicit toggle per page.

**Manager dashboard** (`/manager`, `/manager/assets/[tag]`)

Asset list with client-side pagination (25/page), filter by state + site, full-text search across tag/serial/model. Needs-attention strip at the top surfaces recent activity and RMA-pending counts without requiring the manager to hunt. Asset detail shows an identity card and a full event log (newest-first) with state-transition pills.

**Three-way reconciliation** (`/manager/reconcile`)

Server-side join at `app/api/reconcile/route.ts` pulls ops, facilities, and finance, then classifies differences into three parent categories per the system's design (CONTEXT.md):

- **Expected** — scope differences (stored item not in facilities). Not a problem.
- **Real drift** — genuine disagreements (ghost tags, location mismatch). Action needed.
- **Ambiguous** — needs a human (disposed-but-capitalized, stale observation). Review before acting.

Each issue row carries a hover tooltip with a plain-English explanation — what happened, who needs to act, and what they should do — written for a non-technical asset manager who runs this every Monday. The asset detail page (`/manager/assets/[tag]`) surfaces the same explanations inline, without requiring a hover, alongside the identity card.

**Write-back to facilities and finance**

Deploy → POST to facilities (set rack location) + finance (capitalize). Store from `in_service` → POST to facilities with `rack_location: null` to de-rack. Both fire from server-side route handlers (`app/api/scans/deploy/route.ts`, `app/api/scans/store/route.ts`) so the writes are atomic and the token stays server-side.

**Dev surfaces**

- `/dev/reset` — one-button database reset for demo prep
- `/dev/barcodes` — printable Code 128 barcodes for 7 interesting assets (drifted, ghost, disposed, RMA), 3 locations, 2 badges

## Environment variables

| Variable | Notes |
|---|---|
| `API_BASE_URL` | Upstream API including `/v1`. Default: `http://localhost:8080/v1` |
| `API_TOKEN` | Server-only. Never prefix with `NEXT_PUBLIC_`. Browser code goes through `/api/upstream/*`. |

## Three calls I nearly made the other way

**1. Server-side writebacks vs. client-side direct**

The brief says to "decide where the writes live" for facilities and finance. The easy path is firing them from the browser after a successful scan response — the proxy already handles the token, so it's not a security issue per se. I put them in server-side route handlers (`app/api/scans/deploy`, `app/api/scans/store`) instead. The reason: doing all three writes (ops scan + facilities + finance) in one server round-trip means partial failures are visible in one place, the logic is testable without a browser, and the reconcile report can trust that a successful deploy response means all three systems were updated. The downside is an extra network hop from browser → Next.js → API, but the tradeoff is clearly worth it here.

**2. Explicit scan mode toggle vs. auto-detect**

The brief says both USB scanner and phone camera flows should "feel native." The tempting path is auto-detecting: if the device has no physical keyboard (mobile), switch to camera automatically. I kept it as an explicit toggle per page instead. Auto-detection based on `navigator.maxTouchPoints` or user-agent is unreliable — a tablet with a paired Bluetooth scanner would get the wrong default, and a tech switching between workstations mid-shift shouldn't have the UI change under them. Explicit is predictable, and predictable matters at 11pm in a dock bay.

**3. Reconcile categories: cause-based vs. severity-based**

My first instinct was to sort by severity (critical / needs-review / expected). Every diff tool does this. I switched to cause-based buckets (ghost / missing / location mismatch / stale / state-finance conflict) because severity hides the "why," and the "why" is what tells a manager whether to send a tech to the rack or call finance. A "critical" label on a disposed-but-capitalized asset and a "critical" label on a ghost in facilities would both be red but require completely different responses. Cause-based buckets mean each bucket has exactly one action associated with it.

## Pushback on the brief

**"Three scan endpoints (receive, store, deploy)"** — The brief's "How this works" section counts three scan endpoints, but the API has four: `receive`, `store`, `deploy`, and `transfer`. The brief's own "What to build" section correctly requires all four. The count in the summary is off by one.

**"The happy-path is a 10-step smoke test"** — The table header in the brief says 10 steps; the actual checklist has 11 (the last one covers mobile viewport). Not a problem in practice, but worth noting since we were told to count.

**"Two static mocks for facilities and finance"** — The mocks accept POSTs and persist changes in-memory until `/v1/reset` or server restart. They're not static — they're mutable in-memory overlays on top of the seeded baseline. This is the right design for the challenge (otherwise write-back would be untestable), but "static" is the wrong word.

**State machine diagram omits `received → in_service`** — CHALLENGE.md's diagram implies you must always store before deploying (`received → stored → in_service`). The actual API (`state-machine.ts` line 12) allows a direct `received → in_service` transition. A candidate who trusted the diagram would block deploy on received assets in their UI — wrong behavior. I verified against the source and kept the direct path open.

## Backend gaps worth flagging

These aren't brief inconsistencies — they're genuine API surface gaps a real production system would need to close.

**Transfer: no ownership check** — The transfer endpoint accepts any `user_id` as the initiating party with no server-side verification against `asset.custodian`. In production, only the current custodian (or a manager) should be able to initiate a handoff. With the cookie-based role switcher, any tech can transfer any asset regardless of who holds it. Real fix: verify the `from` identity server-side before accepting the scan.

**Transfer: no user registry** — `to_custodian` accepts any arbitrary string. The API has no `/v1/users` endpoint to validate that the recipient is a real person. The UI can heuristically block asset-tag-shaped strings (e.g. `C0001234`), but a tech could scan a random badge value and it would go through. Real fix: expose a user lookup endpoint so badge scans can be validated before submission.

**RMA return path: no scan endpoint** — The state machine supports `rma_pending → received` (the RMA return path), but none of the four exposed scan endpoints perform this transition. When a tech physically has a returned RMA unit in hand, there's no workflow to get it back into the system — `/tech/receive` logs a `duplicate_receive` event and leaves the asset stuck in `rma_pending`. Real fix: expose a fifth scan endpoint (`rma_receive_back`) or extend `receive` to handle the return case.

**Receive on terminated assets** — The API accepts receive scans on `disposed` and `rma_pending` assets and logs a `duplicate_receive` event without complaint. A disposed asset that gets scanned at receiving should be a hard error, not a silent duplicate. This is a validation gap in the API, not in the UI — the UI surfaces a warning, but the underlying write still goes through.

## InQueue design decision

The deploy and store pages show a panel of assets already queued for that action — `received` assets waiting to be stored, `stored` assets waiting to be deployed. A natural instinct is to scope this list to the logged-in tech (only show assets whose `custodian` matches the current user).

I deliberately show all assets in the relevant state instead, sorted by `updated_at` descending, filtered to the last 24 hours. The reasoning: `custodian` means "who last touched this," not "who is responsible for processing it next." A dock shift doesn't map cleanly to a single person — the tech on duty at 11pm needs visibility into everything received by the previous shift, not just their own scans. Scoping to custodian would hide real work items.

In a production system with real auth and site-level access control, this queue would be scoped to the site or team. The current implementation makes the intentional choice to treat it as a shared shift queue, which is the correct mental model for a shared dock. The `custodian` column in each row lets the tech see who received the item and sanity-check that it's legitimate work.

## Architecture notes (re: future extensibility)

Per CONTEXT.md, the following are explicitly out of scope but shouldn't be architecturally blocked:

- **Parent-child asset relationships** (chassis + serialized blades): the `Asset` type already has `parent_asset_tag`. The receive form would need a "parent" field; the rest of the system handles it already.
- **Offline scan queueing**: the scan pages are intentionally stateless (scan → submit → result → reset). Adding a queue would mean persisting pending scans to `localStorage` and replaying on reconnect — nothing in the current design prevents this.
- **Tracking barcode tags as assets**: tags are just strings today. Promoting them to first-class assets would require a new asset class and a tag-issuance workflow, but wouldn't conflict with anything built here.

## Scripts

```bash
pnpm dev          # Next dev server on :3000
pnpm build        # Production build
pnpm start        # Run the production build
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest
pnpm lint         # next lint
```

## One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyashderasari%2Fasset-tracking-challenge%2Ftree%2Fmain%2Fstarter&env=API_BASE_URL,API_TOKEN&envDescription=Provided%20with%20your%20challenge%20brief)

Update the URL above to point at your fork before submitting.

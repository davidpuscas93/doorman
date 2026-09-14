# Seed script for the `api` project

## Context

The `doorman` ticketing API (NestJS + TypeORM + Postgres) has its schema fully in place (users, events, ticket_types, transactions, tickets — migrations D-010, entities D-011/D-012) and real hold/checkout logic (`tickets.service.ts`), but no data to exercise it with. This adds a standalone seed script that populates realistic volume — ~2,000 users, 50 events, 3 ticket types/event, 2,000 tickets per ticket type (≈300,000 tickets total), with a believable spread of bought/held/available tickets and transactions — so the app can be manually tested, demoed, and used to measure real query plans against realistic data volume (hence ending the run with `ANALYZE` so planner statistics reflect the seeded data). It reuses the existing entities/schema, runs via bulk multi-row inserts (not row-by-row), and is safely re-runnable without duplicating or corrupting data.

## Approach

**New file:** `api/src/database/seed.ts` — one file: PRNG helpers, sample-data pools, a generic bulk-insert helper, generator functions, and `main()`.

**Execution:** reuses the existing `api/src/database/data-source.ts` default-exported `DataSource` (same one `migration:run` uses) rather than booting the full Nest app. `main()` initializes it, runs cleanup + all inserts in one `dataSource.transaction(async (manager) => {...})` block (mirroring the exact idiom already used in `tickets.service.ts`), then — after that transaction commits — runs `ANALYZE users, events, ticket_types, transactions, tickets;` as a separate top-level query so Postgres's planner statistics are refreshed against the final committed data, then destroys the DataSource and exits.

### Idempotency: tag + delete + reinsert

Every seeded user gets an email ending in `@seed.doorman.dev`. Since every event/ticket_type/transaction/ticket seeded is reachable from a seed-tagged organizer or buyer, cleanup scoped from that user set is safe and complete — no organic row can ever hang off a `@seed.doorman.dev` user. At the start of the transaction, delete in FK-safe order:

1. `tickets` where `event_id` belongs to a seed-tagged organizer's event
2. `transactions` (same scope)
3. `ticket_types` (same scope — CASCADEs from events anyway, kept explicit for clarity)
4. `events` where `user_id` is seed-tagged
5. `users` where email matches the seed domain

Then bulk-insert fresh data in dependency order. Cleanup + reinsert run in one transaction: atomic (never left half-seeded on error). `SET LOCAL statement_timeout = 0;` runs as the first statement as a safety net against low default timeouts.

### Data volumes & realism

- **Users (2,000):** 35 organizers, 1,965 buyers. Names/emails from small local sample-data arrays (no faker dependency) — `${first}.${last}${index}@seed.doorman.dev`, globally unique via the running index. `socials: {}` (jsonb, matches DB default, supplied explicitly since the TS column has no default).
- **Events (50):** distributed across the 35 organizers (20 organizers × 1 event, 15 organizers × 2 events = 50). Title/location from combined sample pools; `startsAt` randomized across a past/future window.
- **Ticket types (150):** 3 per event — "General Admission", "Early Bird", "VIP" (distinct per event, satisfies the `(event_id, name)` unique constraint). `total = 2000` (matches actual tickets seeded per type).
  - **Prices are in bani (minor units), same as `transactions.amount`** — 100 bani = 1 leu. General Admission: `randInt(2000, 6000)` (20–60 lei). Early Bird: `max(500, round(gaPrice * randFloat(0.5, 0.85)))` — always cheaper than GA, floor of 500 bani. VIP: `randInt(gaPrice + 4000, gaPrice + 19000)` — always pricier than GA. (An earlier draft generated these in the 20–60 range directly, i.e. bani-as-if-lei, which under-priced everything by 100x — caught and fixed before merge; a comment in the code now states the unit inline.)
- **Tickets (300,000):** 2,000 per ticket type. Each event gets a randomized "popularity tier" (hot/medium/quiet, weighted ~10/40/50%) driving what fraction of its tickets are sold — a few near-sold-out events, most lightly sold, keeping the overall spread mostly `available`. Within the sold fraction, ~10–20% are `held`, the rest `bought`.
- **Status semantics mirror `tickets.service.ts` exactly** (read for reference, not modified):
  - `held`: batched per single ticket type (matches `hold()`'s signature), assigned to a random buyer, `heldUntil` in the near future, `heldByUserId` set, `transactionId` null — satisfies the `tickets_held_state_valid` CHECK.
  - `bought`: "to-buy" tickets pooled **across all 3 types of the same event** (matches `checkout()`'s per-user-per-event sweep), batched into orders of 1–5, one `transactions` row per order (`amount` = sum of each ticket's type price, `status: 'accepted'`, matching `checkout()`'s hardcoded status), tickets get `transactionId` set and held fields cleared to null.
  - `available`: all nullable fields left null.
  - `scanned` is out of scope (not requested).
- **`qr_code` uniqueness:** each ticket's `qr_code` is `'SEED-' + randomUUID()`. Collision probability across 300k independent UUIDv4 calls is negligible, and the script additionally asserts `new Set(qrCodes).size === qrCodes.length` right before insert, throwing (and rolling back) if that ever somehow fails.
- A seeded PRNG (`mulberry32`, fixed constant seed) drives all randomness so runs are deterministic/reproducible.

### Bulk insert helper

A generic `bulkInsert(manager, table, columns, rows, chunkSize=2000)` builds parameterized multi-row `INSERT INTO t (...) VALUES (...),(...),...` statements via `manager.query(sql, params)`, chunked at 2000 rows/statement (worst case: `tickets` at 7 columns × 2000 rows = 14,000 bound params, well under Postgres's 65,535 limit). This avoids depending on the QueryBuilder bulk-insert API surface of the installed `typeorm@1.1.1` (confirmed genuinely resolved to that version via `node_modules`/`package-lock.json`, atypical since public TypeORM releases run in the 0.x line) and directly satisfies "bulk inserts, not one insert per row": ~165 total INSERT statements for 300k+ rows instead of 300k+ round trips.

**ID generation — parent tables vs. `tickets`:** for `users`, `events`, `ticket_types`, and `transactions`, IDs are generated in JS (`randomUUID()`) and inserted explicitly, since child rows need the parent's ID before that child row is built. For `tickets`, the `id` column is **omitted entirely** from the insert, letting the DB's `DEFAULT uuidv7()` generate it — using a JS `randomUUID()` (v4, random) for the highest-cardinality table would defeat the point of the schema's `uuidv7()` choice (time-ordered, index-locality-friendly IDs), which matters since this data is meant for measuring real index behavior. `created_at`/`updated_at` are never included (DB `DEFAULT now()` handles them).

Insert order: `users` → `events` → `ticket_types` → `transactions` → `tickets`. `ANALYZE` runs last, after commit.

### npm script

Added to `api/package.json` `"scripts"`:
```json
"seed": "ts-node -r tsconfig-paths/register src/database/seed.ts"
```
Follows the existing `ts-node -r tsconfig-paths/register` convention already used in `test:debug`; both were already devDependencies, no new deps added.

## Files touched

- `api/src/database/seed.ts` — new file, the entire script
- `api/package.json` — added the `seed` script

## Verification (run and confirmed)

1. `npm run seed` completed in ~6s on a clean DB, printing: `users: 2000, organizers: 35, buyers: 1965, events: 50, ticketTypes: 150, transactions: 20991, tickets: 300000`.
2. Status split observed: `available: 225941`, `bought: 62793`, `held: 11276` (sums to 300,000; ~75% available as intended).
3. Ran `npm run seed` a second time back-to-back — completed cleanly with no unique-constraint or FK errors, and produced **identical** counts (proving cleanup fully removes prior rows before reinsert; the fixed PRNG seed makes output fully reproducible, not just structurally stable).
4. Invariant checks against the live DB: `bought` tickets missing a `transaction_id` → 0; `held` tickets missing `held_by_user_id`/`held_until` → 0; duplicate `qr_code` values → 0; duplicate ticket `id` values → 0; `ticket_types.price` / `transactions.amount` ranges land in the expected bani range (observed min/max 1097–23278 and 1097–116175 respectively).
5. `pg_stat_user_tables.last_analyze` showed a fresh timestamp matching the run for all five seeded tables.
6. Scoping check: manually inserted a non-seed user (`real.person@example.com`) and event, re-ran the seed twice — both rows survived untouched, confirming cleanup only ever touches `@seed.doorman.dev`-tagged data. (Test rows removed afterward.)

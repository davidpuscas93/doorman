# Security

What this API does about the OWASP Top 10, and what it deliberately doesn't.

OWASP is the Open Worldwide Application Security Project; the Top 10 is its list of the most
common classes of web application vulnerability. The categories below follow the 2021 revision —
check owasp.org for the current one before quoting it.

The point of this document is not to claim the app is secure. It's to be explicit about which
risks were addressed, which were accepted, and why.

---

## A01 — Broken Access Control

**Addressed.**

- `JwtAuthGuard` verifies a Bearer token on every protected route and attaches the payload to
  the request. Nothing downstream trusts a client-supplied identity.
- `userId` was removed from the `hold` and `checkout` request bodies. Both now take the user id
  from the verified token via `@CurrentUser()`, so a caller cannot act as another user.
- `RolesGuard` reads `@Roles(...)` metadata off the route and returns **403** (not 401) when an
  authenticated user lacks the role. `POST /events` is organizer-only.
- `checkout()` re-verifies server-side that each ticket is held *by this user*, is still held,
  and has not expired. The client's claim about what it holds is never trusted.

**Not addressed:** no per-object ownership checks beyond tickets — e.g. an organizer can only
create events, but there is no `PATCH /events/:id` yet that would need "is this *your* event".
That check belongs in the service, not the guard, when those routes exist.

## A02 — Cryptographic Failures

**Addressed.**

- Passwords hashed with **argon2id**, the current recommendation for password storage. Salting
  and parameter storage are handled by the library; the hash string carries its own parameters.
- Refresh tokens are 32 bytes from `crypto.randomBytes` (a CSPRNG — cryptographically secure
  pseudo-random number generator), stored only as a **SHA-256 hash**. A database dump yields no
  usable credentials.
- SHA-256 rather than argon2 for those tokens is deliberate: argon2's slowness defends
  low-entropy human passwords against guessing. A 256-bit random value cannot be guessed at any
  hash speed, so the cost would buy nothing. **Match the hash to the entropy of what you hash.**
- `JWT_SECRET` is 32 random bytes, read via `configService.getOrThrow` so a missing secret fails
  at boot rather than at first login.
- No secrets are committed. `.env` is gitignored and absent from history; only `.env.example`
  with placeholders is tracked.

**Not addressed:** TLS termination is a deployment concern (chapter 9), not handled in the app.
`Strict-Transport-Security` is set by helmet but means nothing until the app is actually served
over HTTPS.

## A03 — Injection

**Addressed.**

- Every query goes through TypeORM with bound parameters (`:name` placeholders), including the
  hand-written query-builder calls. No string concatenation of user input into SQL anywhere.
- All request bodies are validated by Zod schemas via `StandardSchemaValidationPipe`, registered
  globally. Unknown keys are stripped, so an extra field in a body cannot reach a service.
- Path parameters go through `ParseUUIDPipe`, query parameters through `ParseIntPipe`.

## A04 — Insecure Design

**Partially addressed.**

- Ticket availability is derived by counting rows, not stored as a mutable counter, so it cannot
  drift. Holds expire by timestamp rather than by a job that might not run.
- Overselling is prevented in the database — a transaction with `FOR UPDATE` on the ticket rows —
  not in application logic that a retry or a second process could bypass. (`SKIP LOCKED` is on the
  same query but buys throughput, not correctness; see `concurrency-and-locking.md` §3.)
- A per-user cap of 10 concurrent holds is enforced inside `hold()`'s transaction, which takes a
  `FOR UPDATE` lock on the **user** row before counting that user's active holds. Locking the
  ticket rows is not enough here: the invariant is about the user, so the user row is the row to
  lock. Lock order is always user, then tickets, so two of these can't deadlock each other.
- Refresh token rotation includes reuse detection: a token presented twice revokes its whole
  family, on the assumption that the duplicate means a leak.

**Known gaps, by design decision rather than oversight:**

- Multi-ticket holds are all-or-nothing, so tickets can go unsold while people are still asking for
  them, whenever the remaining supply is smaller than any pending request's quantity. `SKIP LOCKED`
  can also report "sold out" for a row that is freed a moment later. Both are product decisions
  rather than bugs, but they should be stated as decisions.
- Checkout marks the transaction `accepted` immediately. A real payment provider requires
  pending → webhook → accepted, with idempotency keys so a retried webhook doesn't double-charge.

## A05 — Security Misconfiguration

**Addressed.**

- `helmet()` sets security response headers and removes `X-Powered-By`, which otherwise
  advertises the stack and version to anyone scanning.
- TypeORM `synchronize` is always `false`; schema changes only ever happen through committed
  migrations, run deliberately.
- Errors are thrown as Nest HTTP exceptions with generic messages. Internal errors are not
  echoed to the client.
- CORS is configured with an **explicit origin** from `CORS_ORIGIN` and `credentials: true`. A
  wildcard origin is rejected by browsers once credentials are involved, which is the correct
  default: a cookie-bearing cross-origin request has to name who may make it. Same-origin policy is
  a browser rule and CORS is the server choosing to relax it — neither exists server-to-server,
  which is why the server-component fetches never needed either.
- All app-level middleware and pipes live in one `configureApp()` function
  (`api/src/setup-app.ts`), called from `main.ts` **and** from the test harness. This is listed as
  a security control deliberately: the earlier arrangement had helmet, the cookie parser and the
  global validation pipe registered only in `main.ts`, so the entire integration suite ran against
  an app with **no request validation at all** and stayed green. A control that isn't exercised by
  the tests is a control nobody is checking.

**Not addressed:** default Nest error responses in production would need review. TLS is a
deployment concern (chapter 9).

## A06 — Vulnerable and Outdated Components

**Partially addressed.** Dependencies are current at time of writing and lockfiles are committed.
There is still no automated check: `npm audit` as a CI step and a Dependabot (or equivalent)
configuration are both outstanding. CI exists now (see A08), so this is a step to add rather than
infrastructure to build.

## A07 — Identification and Authentication Failures

**Addressed.**

- Login returns an identical 401 for an unknown email, a user with no password set, and a wrong
  password, so the endpoint does not reveal which accounts exist (user enumeration).
- When no user is found, login still verifies against a dummy hash, so a missing account does
  not respond measurably faster than a wrong password (timing attack).
- The email lookup uses `lower(email)`, matching the unique index, so case cannot be used to
  register a duplicate account.
- Access tokens expire in 15 minutes. Refresh tokens are single-use and expire in 7 days.
- Registration forces `role: 'buyer'` server-side — the role in the request body is ignored, so
  nobody can register themselves as an organizer.
- Password policy is enforced at registration (min 12 characters). The login schema deliberately
  does *not* enforce a minimum, so tightening the policy later cannot lock out existing users;
  its `max` exists only as a denial-of-service guard on argon2.

**Known gaps:**

- Access tokens cannot be revoked before they expire. This is the accepted cost of a stateless
  access token; the worst case is a 15-minute window, and the refresh family can be revoked
  immediately. A denylist would close it at the cost of a lookup per request.
- No login rate limiting or account lockout. The existing rate limiter covers ticket endpoints
  and keys on IP; brute-force protection on `/auth/login` is a real gap.
- No email verification, no password reset, no MFA.
- Expired and revoked refresh token rows are never cleaned up.
- **No single-flight refresh on the client.** Two concurrent 401s each call `/auth/refresh`; with
  rotation, the loser presents an already-spent token, which looks exactly like a leak and revokes
  the whole family — logging the user out. The fix is to hold the in-flight promise in a ref, and/or
  a short server-side grace window accepting the immediately-previous token. Same root cause as the
  two-tab case.

**Added since the first version of this document:** `POST /auth/logout` revokes every unrevoked
token in the family and clears the cookie. It answers 204 and never throws — an unknown or missing
token is treated as already logged out, since telling a caller that their token was unrecognised
leaks information and helps nobody.

## A08 — Software and Data Integrity Failures

**Partially addressed.** Lockfiles are committed and CI runs on every push
(`.github/workflows/ci.yml`): two parallel jobs that lint, build and — for the API — run the
integration suite against a real Postgres and Redis started by Testcontainers. `npm ci` is used
rather than `npm install`, so a lockfile that disagrees with `package.json` fails the build instead
of being silently resolved. The Node version comes from `.nvmrc` via `node-version-file`, so local
and CI cannot drift apart.

**Not addressed:** no artifact signing, no provenance attestation, no dependency scanning (A06).

## A09 — Security Logging and Monitoring Failures

**Not addressed.** Failed logins, reuse detection and 403s are not logged as security events,
and there is no alerting. Reuse detection in particular *should* emit a warning — it means a
token leaked, which is exactly the thing worth waking someone for. Tracing is chapter 10.

## A10 — Server-Side Request Forgery

**Not applicable.** The API makes no outbound HTTP requests on behalf of user input.

---

## Token storage: `localStorage` vs httpOnly cookies

The decision that shapes most of the auth surface, written out because it is the one an interviewer
is most likely to push on. There are two workable designs and they trade different risks.

**Option 1 — both tokens in `localStorage`, sent as `Authorization: Bearer …`.**

- Simple: one mechanism, no cookie semantics, trivially CORS-friendly, works the same for a web
  app, a mobile app and a CLI.
- **Any XSS reads both tokens.** `localStorage` is readable by every script running on the page,
  including one injected through a dependency you didn't audit. Stolen refresh token means
  persistent access, not a 15-minute window.
- No CSRF exposure at all, because nothing is attached automatically.

**Option 2 — access token in memory, refresh token in an httpOnly cookie.** This is what Doorman
does.

- `httpOnly` means **JavaScript cannot read the cookie**, so theft-by-script is off the table even
  if the page is compromised. The access token lives in a JavaScript variable and dies with the tab,
  so there's nothing durable to steal.
- The cost: the browser now attaches that cookie **automatically**, which is exactly what CSRF
  exploits — a malicious page causes your browser to make an authenticated request.
- That is closed by `SameSite=Lax`, which tells the browser not to attach the cookie on
  cross-site requests (a form post or `fetch` from another origin); it still works for a normal
  top-level navigation to the site.
- Further narrowing: `path=/auth` means the cookie is only sent to the refresh and logout routes,
  not to every API request. `Secure` restricts it to HTTPS in production.
- The remaining friction is operational, not security: it needs an explicit CORS origin with
  `credentials: true`, and `clearCookie` must repeat the same `path` or it silently clears nothing.

**Why option 2 here.** The threat that actually matters for a ticketing system is a stolen
long-lived credential, and `httpOnly` removes the script-readable copy of it. CSRF is a solved
problem with a one-line cookie attribute; XSS-readable refresh tokens are not solvable from the
server side at all. The access token being in memory — so a reload briefly has no credential and
calls `/auth/refresh` — is the price, and it's cheap.

**What would change the answer:** a native mobile client, or third-party API consumers, where
cookies are awkward or meaningless. Then bearer tokens with short lifetimes and a server-side
denylist is the more honest design.

---

## Rate limiting — current state

A hand-rolled fixed-window limiter (Redis `INCR` + `EXPIRE`) allows 10 requests per minute per
IP on ticket endpoints. Two known weaknesses:

- **Keying on IP** is wrong behind a proxy or load balancer, where every request appears to come
  from the same address, and unfair behind an office NAT where many users share one. Keying on
  the authenticated user id is better where a user exists.
- **A fixed window** allows a double burst at the boundary: 10 requests at 11:59:59 and 10 more
  at 12:00:00 is 20 in one second. A sliding window or token bucket fixes it.

Both are known and accepted for now; neither is the kind of thing to discover in production
without having written it down first.

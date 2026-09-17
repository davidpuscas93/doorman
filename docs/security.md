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
- Overselling is prevented in the database (`FOR UPDATE SKIP LOCKED` inside a transaction),
  not in application logic that a retry or a second process could bypass.
- Refresh token rotation includes reuse detection: a token presented twice revokes its whole
  family, on the assumption that the duplicate means a leak.

**Known gaps, by design decision rather than oversight:**

- No per-user cap on concurrent holds. `quantity` is capped at 10 *per request*, but a user can
  repeat the request. The fix belongs inside `hold()`'s transaction, after the lock.
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

**Not addressed:** no CORS policy yet — not needed while the frontend uses server components,
required as soon as anything fetches from a client component. Default Nest error responses in
production would need review.

## A06 — Vulnerable and Outdated Components

**Partially addressed.** Dependencies are current at time of writing. There is no automated
check — `npm audit` in CI and a Dependabot (or equivalent) configuration belong in chapter 8.

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
- No logout endpoint (revoke the family), no email verification, no password reset, no MFA.
- Expired and revoked refresh token rows are never cleaned up.

## A08 — Software and Data Integrity Failures

**Partially addressed.** Lockfiles are committed. CI with a verified build pipeline is
chapter 8. No artifact signing.

## A09 — Security Logging and Monitoring Failures

**Not addressed.** Failed logins, reuse detection and 403s are not logged as security events,
and there is no alerting. Reuse detection in particular *should* emit a warning — it means a
token leaked, which is exactly the thing worth waking someone for. Tracing is chapter 10.

## A10 — Server-Side Request Forgery

**Not applicable.** The API makes no outbound HTTP requests on behalf of user input.

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

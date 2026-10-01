# Concurrency and locking: how holds work

Notes on the hardest correctness problem in Doorman — two people trying to take the last ticket
at the same moment — and how it's solved. Written as a reference, not a tutorial.

---

## 1. The problem

Ten tickets available. Fifty people hit checkout in the same second.

The obvious implementation:

```typescript
const tickets = await repo.find({ where: { ticketTypeId, status: 'available' }, take: quantity });
if (tickets.length < quantity) throw new BadRequestException(...);
for (const t of tickets) { t.status = 'held'; ... }
await repo.save(tickets);
```

Reads correctly. Fails under load.

**Measured, on this codebase**, 50 concurrent requests against 10 tickets:

| | Expected | Actual |
|---|---|---|
| `201 Created` | 10 | **50** |
| `400 Bad Request` | 40 | 0 |
| Tickets held | 10 | **2** |
| Tickets left unsold | 0 | **8** |

Forty-eight people were told they had a ticket they didn't have. Eight tickets went unsold while
fifty people were trying to buy. No error, no warning, nothing in the logs.

## 2. Why it fails

The read and the write are two separate steps with a gap between them.

```
Request A:  SELECT ... available LIMIT 1   →  row #1
Request B:  SELECT ... available LIMIT 1   →  row #1     ← nobody has written yet
Request A:  UPDATE row #1 SET status='held', held_by = A
Request B:  UPDATE row #1 SET status='held', held_by = B ← silently overwrites A
```

Both selects ran before either update committed, so both saw the same row as available.
Nothing in Postgres forbids updating a row twice — the second write just wins.

This is the **lost update** problem. It is the thing "do you understand transactions and
isolation levels?" is actually asking about.

Why 2 tickets rather than 1: the fifty requests landed in roughly two waves, and the second wave
read after the first wave's writes had committed. The exact number is a timing accident — that's
the nature of a race condition, and it's why you cannot find this bug by clicking around.

## 3. The fix

Two parts make it correct. A third makes it fast. Keeping those apart matters — "which of these
actually fixes the bug?" is the obvious follow-up question, and the three-as-one answer falls over.

### Correctness, part 1 — a transaction

Wrap the read and the write so they are one indivisible unit: either both happen or neither does.
Necessary, but on its own not sufficient — at Postgres's default isolation level (READ COMMITTED)
two transactions can still both read the same row as available.

### Correctness, part 2 — `FOR UPDATE`

Adding `FOR UPDATE` to a `SELECT` doesn't just read the rows, it **locks** them until the
transaction ends. Another transaction trying to select the same rows `FOR UPDATE` blocks and waits.

Two lock modes matter:

| SQL | TypeORM | Meaning |
|---|---|---|
| `FOR SHARE` | `setLock('pessimistic_read')` | "I'm reading this, don't let anyone modify it." Several transactions can hold this at once. |
| `FOR UPDATE` | `setLock('pessimistic_write')` | Exclusive. One transaction holds these rows; everyone else waits. |

**Rule of thumb: `FOR SHARE` when reading and blocking writers, `FOR UPDATE` when you intend to
write.** A share lock is not enough here — two requests could both take one on the same ticket,
both pass the availability check, and the bug survives.

### Throughput — `SKIP LOCKED`

**This part is not what makes the code correct.** With `FOR UPDATE` alone the answers are already
right: fifty requests queue behind the same rows, ten succeed, forty get a proper 400. They just do
it one at a time, so correctness has been paid for with all of the concurrency.

`SKIP LOCKED` says: don't wait for a locked row, skip it and take the next unlocked one. Fifty
concurrent requests then take **different** rows simultaneously — and the response codes come out
identical.

> **The transaction and `FOR UPDATE` make it correct. `SKIP LOCKED` makes it fast.**

Measured by removing each part in turn, 50 concurrent requests against 10 tickets:

| Implementation | 201 | 400 | Held | Unsold |
|---|---|---|---|---|
| no lock | 50 | 0 | **2** | **8** |
| `FOR UPDATE` | 10 | 40 | 10 | 0 |
| `FOR UPDATE SKIP LOCKED` | 10 | 40 | 10 | 0 |

Commenting out `setOnLocked('skip_locked')` changes nothing at all. Removing
`setLock('pessimistic_write')` brings the lost update straight back. An earlier version of this
document presented all three as one fix, which was wrong.

The three options when a row you want is already locked:

| Clause | Behaviour |
|---|---|
| *(nothing)* | Wait until the lock is released |
| `NOWAIT` | Fail immediately with an error |
| `SKIP LOCKED` | Ignore that row, move to the next one |

`SKIP LOCKED` is right when rows are interchangeable — any available ticket will do. It would be
wrong if you needed one *specific* row (e.g. "lock user 123's account"), where skipping it means
silently doing nothing.

## 4. The implementation

```typescript
async hold(ticketTypeId: string, quantity: number, userId: string) {
  return this.dataSource.transaction(async (manager) => {
    const tickets = await manager
      .createQueryBuilder(Ticket, 'ticket')
      .setLock('pessimistic_write')     // FOR UPDATE
      .setOnLocked('skip_locked')       // SKIP LOCKED — throughput, not correctness
      .where({ ticketTypeId, status: 'available' })
      .limit(quantity)                  // NOT take() — see below
      .getMany();

    if (tickets.length < quantity) {
      throw new BadRequestException(
        `There are not enough tickets available. Found ${tickets.length} instead of ${quantity}.`,
      );
    }

    const heldUntil = new Date(Date.now() + 10 * 60 * 1000);
    for (const ticket of tickets) {
      ticket.status = 'held';
      ticket.heldByUserId = userId;
      ticket.heldUntil = heldUntil;
    }

    await manager.save(tickets);   // manager, not the repository
    return tickets;
  });
}
```

### Two traps

**`limit()`, not `take()`.** `take`/`skip` are TypeORM's entity-level pagination and wrap the query
in a subquery so limiting stays correct when relations are joined. `FOR UPDATE` can't be applied
through that subquery — you either get an error or silently lose the lock. `limit`/`offset` emit
plain SQL `LIMIT`/`OFFSET`, which is what a locking query needs.

**`manager`, not `this.ticketsRepository`.** The injected repository has its own connection. Saving
through it inside a transaction runs the write *outside* that transaction — everything looks fine
and is exactly as broken as before.

## 5. Why not a queue

A reasonable first instinct: serialise every hold through one worker.

It works, but it trades all throughput for correctness, adds infrastructure and latency, and you
*still* need the database to be correct because workers get retried and can run twice.

Real ticketing platforms do use queues — the "you are number 4,281 in line" waiting rooms on big
onsales. That is **load shedding**, protecting the system from 200,000 simultaneous users. It is
not how they stop two people getting the same seat. That happens in the database.

Worth knowing: `FOR UPDATE SKIP LOCKED` is exactly how job queues are built *inside* Postgres —
many workers pulling different rows from one table without stepping on each other. Same mechanism,
same reason.

## 6. Related design decisions

These were settled in the schema and interact with the above:

- **Availability is counted from ticket rows, not stored as a counter.** A counter is a single
  contended row and it drifts; individual rows can each be locked independently, which is what makes
  `SKIP LOCKED` possible at all.
- **Tickets are pre-created** (one row per unit of `ticket_type.total`) for the same reason — you
  can only lock a row that exists.
- **Holds expire by timestamp, not by a background job.** A hold is dead when
  `status = 'held' AND held_until < now()`, so the availability query treats expired holds as
  available. Expiry is a property of the read, not a process that has to run.
- **`held_by_user_id`** exists so only the holder can complete the checkout.
- A `CHECK` constraint enforces that a held ticket has both a holder and an expiry:
  `status <> 'held' OR (held_until IS NOT NULL AND held_by_user_id IS NOT NULL)`.

## 7. How to verify it

Reset:

```sql
UPDATE tickets SET status='available', held_by_user_id=NULL, held_until=NULL;
```

Get a token — the endpoint is behind `JwtAuthGuard`, and the holder's id comes from the
verified token rather than the request body:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<email>","password":"<password>"}' | jq -r .accessToken)
```

Fire 50 concurrent requests:

```bash
rm -f /tmp/codes.txt
for i in $(seq 1 50); do
  (curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3001/tickets/hold \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"ticketTypeId":"<id>","quantity":1}' \
    >> /tmp/codes.txt) &
done
wait
sort /tmp/codes.txt | uniq -c
```

The rate limiter allows 10 requests per minute per IP, so raise or disable it for this test —
otherwise you measure the limiter, not the locking.

```sql
SELECT status, count(*) FROM tickets GROUP BY status;
```

Correct result: 10 × `201`, 40 × `400`, 10 held, 0 available.

To see the generated SQL, set `logging: true` in `database.module.ts` (the app's config — not
`data-source.ts`, which is the CLI's) and look for `FOR UPDATE SKIP LOCKED` at the end of the select.

### The automated version

This is now covered by `api/test/concurrency.e2e-spec.ts`, which fires the same 50 requests at a
Postgres started by Testcontainers and asserts held, available **and the number of distinct
holders** — that last one being the assertion that catches a lost update, since a held count can
look correct while two people have each been told they own the same row. The test harness raises
`RATE_LIMIT_PER_MINUTE` for that suite, so there is nothing to disable by hand any more.

Re-running it with `setLock` or `setOnLocked` commented out is how the table in section 3 was
produced. That is the cheapest way to check a claim about concurrent behaviour: delete the part
you think is responsible and see whether anything changes.

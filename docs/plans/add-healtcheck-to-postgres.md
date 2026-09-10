# Add healthcheck to postgres service

## Context
`docker-compose.yml` currently starts the postgres service with no healthcheck. Anything that
depends on it (e.g. an api service added later, or `depends_on: condition: service_healthy`)
can't tell when Postgres is actually ready to accept connections — a container can be "running"
well before the DB is accepting connections. Adding a healthcheck lets Docker report accurate
status and lets dependent services wait on `service_healthy` instead of guessing with
sleeps/retries.

## Change
In `docker-compose.yml`, add a healthcheck block to the postgres service:

```yaml
services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER}", "-d", "${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
```

## Why these choices

- **Command (`pg_isready -U ... -d ...`)**: `pg_isready` is the official Postgres client utility
  built into the postgres image specifically to check whether the server is accepting
  connections — more reliable than a raw TCP check (which would pass while Postgres is still
  initializing) and it doesn't require a full `psql` query. Passing `-U`/`-d` (reusing the same
  `${POSTGRES_USER}`/`${POSTGRES_DB}` env vars already used by the service) checks that the
  specific configured user/database can be reached, not just that the process is listening.
  Using the `CMD` exec-array form (not `CMD-SHELL`) is enough here: Docker Compose interpolates
  `${...}` variables itself when it parses the compose file (from the shell environment / `.env`),
  before the command is ever sent to Docker — the container never needs a shell to expand them,
  so there's no reason to pay for one.
- **`interval: 5s`**: frequent enough to detect "healthy" soon after startup without polling
  excessively.
- **`timeout: 5s`**: `pg_isready` returns almost instantly; 5s gives generous headroom without
  letting a single hung check block things long.
- **`retries: 5`**: requires 5 consecutive failures (~25s of interval time) before marking
  unhealthy, avoiding flapping on transient blips while still catching real failures.
- **`start_period: 10s`**: a grace period during initial startup/`initdb` so early failing checks
  don't count against retries before Postgres has had a chance to come up.

No other files need to change — redis has no dependent services defined yet, so it's left as-is.

## Verification

- Run `docker compose config` to confirm the YAML parses correctly.
- Run `docker compose up -d postgres` and `docker compose ps` (or
  `docker inspect --format='{{json .State.Health}}' <container>`) to confirm the container
  transitions from `starting` to `healthy`.
- Run `docker compose down -v` afterward to clean up.

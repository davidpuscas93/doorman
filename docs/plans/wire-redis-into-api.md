# Wire Redis into the NestJS API

## Context

The API has one infra module today, `DatabaseModule`, which wires TypeORM/Postgres via `ConfigService`-driven `forRootAsync`. There's no equivalent wrapper package for a raw `ioredis` client (Redis is already running via `docker-compose.yml` on `localhost:6379`, no auth), so `RedisModule` needs a genuine custom DI provider (`{ provide, useFactory, inject }` + `exports`) rather than delegating to a library's dynamic module the way `DatabaseModule` does. `ioredis` is not yet installed (it only appears as an optional TypeORM peer dep in the lockfile). `ConfigModule` is already global in `app.module.ts`, but `RedisModule` will still explicitly import it for local clarity, matching `DatabaseModule`'s pattern. This task is pure connection wiring — no caching logic (`.get`/`.set`/etc.) is added.

## 1. Install dependency

```bash
cd api
npm install ioredis
```

Resolves current stable `ioredis` (ships its own TS types, no `@types/ioredis` needed). Let npm resolve the version rather than hand-editing `package.json`.

## 2. New file: `api/src/redis/redis.module.ts`

Mirrors the minimalism of `database.module.ts`. Exports the injection token alongside the module (no separate constants file for a single token).

```ts
import { Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');

        const client = new Redis({
          host: configService.get<string>('REDIS_HOST'),
          port: Number(configService.get<string>('REDIS_PORT')),
        });

        client.on('error', (err) => {
          logger.error(`Redis connection error: ${err.message}`, err.stack);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redisClient.quit();
    } catch (err) {
      new Logger('RedisModule').warn(
        `Error while closing Redis connection: ${(err as Error).message}`,
      );
    }
  }
}
```

**Design decisions:**
- **Token**: plain string constant `REDIS_CLIENT`, exported from the module file and consumed elsewhere via `@Inject(REDIS_CLIENT) private readonly redis: Redis`.
- **Error handling**: the `.on('error', ...)` listener is the critical piece — ioredis is an `EventEmitter`, and an unhandled `'error'` event crashes the Node process. Logging here satisfies "log, don't crash." ioredis's default `retryStrategy` already retries connections with backoff, so no extra retry config is needed.
- **Graceful shutdown**: `RedisModule` implements `OnModuleDestroy`, injecting its own `REDIS_CLIENT` provider to call `client.quit()` on teardown, wrapped in try/catch so a failed close never throws during shutdown. Requires `app.enableShutdownHooks()` in `main.ts` (step 4) for OS signals (SIGINT/SIGTERM) to trigger it, not just `app.close()`.

## 3. `api/src/app.module.ts` diff

```diff
 import { DatabaseModule } from './database/database.module';
 import { EventsModule } from './modules/events/events.module';
 import { TicketsModule } from './modules/tickets/tickets.module';
+import { RedisModule } from './redis/redis.module';

 @Module({
   imports: [
     ConfigModule.forRoot({ isGlobal: true }),
     DatabaseModule,
+    RedisModule,
     EventsModule,
     TicketsModule,
   ],
```

## 4. `api/src/main.ts` diff

```diff
 import { NestFactory } from '@nestjs/core';
 import { AppModule } from './app.module';

 async function bootstrap() {
   const app = await NestFactory.create(AppModule);
+  app.enableShutdownHooks();
   await app.listen(process.env.PORT ?? 3000);
 }
 bootstrap();
```

## 5. `api/.env` diff

```diff
 POSTGRES_HOST=localhost
 POSTGRES_PORT=5433
 POSTGRES_USER=doorman_user
 POSTGRES_PASSWORD=doorman_password
 POSTGRES_DB=doorman_db
+REDIS_HOST=localhost
+REDIS_PORT=6379
```

## 6. `api/.env.example` diff

```diff
 POSTGRES_HOST=localhost
 POSTGRES_PORT=5433
 POSTGRES_USER=your_postgres_user
 POSTGRES_PASSWORD=your_postgres_password
 POSTGRES_DB=your_postgres_db
+REDIS_HOST=localhost
+REDIS_PORT=6379
```

Literal (non-placeholder) values, matching the existing convention for host/port fields. No `REDIS_PASSWORD` since the compose `redis` service has no auth.

## Verification

1. `docker compose up -d redis` from repo root; confirm container is up (`docker compose ps`).
2. `cd api && npm install && npm run start:dev`.
3. Confirm the app boots to "Nest application successfully started" with no `Redis connection error` log lines.
4. Negative-path check: `docker compose stop redis`, confirm the running app logs `Redis connection error: ...` repeatedly but stays up (other routes still respond). Then `docker compose start redis` and confirm ioredis reconnects automatically (errors stop).
5. Do not add any `.get()`/`.set()` or cache-manager usage — connection wiring only.

### Files touched
- `api/src/redis/redis.module.ts` (new)
- `api/src/app.module.ts`
- `api/src/main.ts`
- `api/.env`
- `api/.env.example`
- `api/package.json` / `package-lock.json` (via `npm install ioredis`)

## Status

Implemented and verified 2026-09-15. Type-check passed; app booted with `RedisModule dependencies initialized` and no connection errors against the running `docker-compose` Redis instance.

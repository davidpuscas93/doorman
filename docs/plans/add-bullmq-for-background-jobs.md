# Add BullMQ (connection + queue registration only)

## Context

The API needs background job infrastructure for future ticket-related async work (e.g. expiring holds, sending confirmations). This step only wires up `@nestjs/bullmq` to the existing Redis instance and registers a `"tickets"` queue — no jobs, producers, or processors yet, per explicit scope.

The app already has a hand-rolled Redis connection in `api/src/redis/redis.module.ts` (raw `ioredis` client, DI token `REDIS_CLIENT`, host/port from `ConfigService` via the global `ConfigModule.forRoot({ isGlobal: true })` in `app.module.ts`). `@nestjs/bullmq` needs its own `connection` config (host/port), not the existing raw `ioredis` instance — BullMQ manages its own Redis connections internally. So `BullModule.forRootAsync` is configured with a `useFactory` that reads `REDIS_HOST`/`REDIS_PORT` from `ConfigService`, mirroring the pattern already used in `redis.module.ts`.

## 1. Install dependencies

```bash
cd api
npm install @nestjs/bullmq bullmq
```

Neither was previously installed (only `ioredis` was, per `api/package.json`). NestJS core is v12 (`@nestjs/core@^12.0.1`), which the installed `@nestjs/bullmq` supports.

## 2. `api/src/app.module.ts` diff

```diff
 import { Module } from '@nestjs/common';
-import { ConfigModule } from '@nestjs/config';
+import { BullModule } from '@nestjs/bullmq';
+import { ConfigModule, ConfigService } from '@nestjs/config';

 import { AppController } from './app.controller';
 import { AppService } from './app.service';

 import { DatabaseModule } from './database/database.module';
 import { EventsModule } from './modules/events/events.module';
 import { TicketsModule } from './modules/tickets/tickets.module';
 import { RedisModule } from './redis/redis.module';

 @Module({
   imports: [
     ConfigModule.forRoot({ isGlobal: true }),
+    BullModule.forRootAsync({
+      inject: [ConfigService],
+      useFactory: (configService: ConfigService) => ({
+        connection: {
+          host: configService.get<string>('REDIS_HOST'),
+          port: Number(configService.get<string>('REDIS_PORT')),
+        },
+      }),
+    }),
     DatabaseModule,
     RedisModule,
     EventsModule,
     TicketsModule,
   ],
```

## 3. `api/src/modules/tickets/tickets.module.ts` diff

```diff
 import { Module } from '@nestjs/common';
+import { BullModule } from '@nestjs/bullmq';
 import { TypeOrmModule } from '@nestjs/typeorm';

 import { RedisModule } from '../../redis/redis.module';

 import { TicketsService } from './tickets.service';
 import { TicketsController } from './tickets.controller';

 import { Ticket } from './entities/ticket.entity';
 import { TicketType } from '../ticket-types/entities/ticket-type.entity';
 import { Transaction } from '../transactions/entities/transaction.entity';

 @Module({
   imports: [
     TypeOrmModule.forFeature([Ticket, TicketType, Transaction]),
     RedisModule,
+    BullModule.registerQueue({ name: 'tickets' }),
   ],
```

This follows the same "import into the module that owns it" pattern already used for `RedisModule` in this file. No producers/processors are added — just the queue registration.

## Verification

1. `cd api && npm run build` — confirms it compiles.
2. Start the app (`npm run start:dev`) with Redis running locally (`localhost:6379`) and confirm it boots without connection errors.
3. Run the existing test suite (`npm test`) to confirm nothing broke — `tickets.module.ts` and `app.module.ts` changes shouldn't affect existing specs since no processors/jobs are added.

### Files touched
- `api/src/app.module.ts`
- `api/src/modules/tickets/tickets.module.ts`
- `api/package.json` / `package-lock.json` (via `npm install @nestjs/bullmq bullmq`)

## Status

Implemented 2026-09-15. `npm run build` passed. `npm test` showed 5 pre-existing failing suites unrelated to this change (a `tsconfig`/jest `rootDir` TS5011 error, confirmed present before these changes via `git stash`).

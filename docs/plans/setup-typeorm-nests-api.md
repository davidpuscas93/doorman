# Set up TypeORM in the NestJS `api` project

## Context
The `api` project (`/Users/davidpuscas/Developer/ParsecStudios/doorman/api`) is a freshly scaffolded Nest 12 / TypeScript 6 app with no database layer yet — just `AppModule`/`AppController`/`AppService` and no `@nestjs/config`, `typeorm`, or env-loading of any kind. The repo's `docker-compose.yml` already runs Postgres 18 on host port `5433` (container port 5432) with credentials from the root `.env` (`POSTGRES_USER=doorman_user`, `POSTGRES_PASSWORD=doorman_password`, `POSTGRES_DB=doorman_db`). This task wires the `api` project to that database via TypeORM, without yet adding any entities or migrations — just the connection scaffolding, migration tooling, and env files needed for future work to build on.

## Packages
In `api/`:
- `npm install typeorm @nestjs/typeorm pg`
- `npm install -D @types/pg`

`@nestjs/config` is also required for env-based async config and isn't installed yet:
- `npm install @nestjs/config`

(`ts-node` and `tsconfig-paths`, needed by the TypeORM CLI, are already present as devDependencies.)

## New files

**`api/.env`** (real dev credentials, gitignored via `api/.gitignore`'s `.env` rule):
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=doorman_user
POSTGRES_PASSWORD=doorman_password
POSTGRES_DB=doorman_db
```

**`api/.env.example`** (committed — placeholder credentials, not the real ones; `HOST`/`PORT` are kept as real local-dev defaults since they're infrastructure values, not secrets):
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=your_postgres_db
```
Host/port point at the docker-compose mapping (`localhost:5433`). These are separate from the root `.env` because the API needs `HOST`/`PORT` for a client connection, which the root file (used only to configure the Postgres container itself) doesn't need.

**`api/src/database/data-source.ts`** — standalone `DataSource` for the TypeORM CLI, used outside Nest's DI/bootstrap so it loads `.env` itself via Node's built-in `process.loadEnvFile()` (no extra dependency needed — `@nestjs/config` already covers the Nest side):
```ts
import { DataSource } from 'typeorm';

process.loadEnvFile();

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  migrationsRun: false,
});
```

**`api/src/database/database.module.ts`** — the Nest-side connection, using `TypeOrmModule.forRootAsync` with `ConfigService` injected so nothing reads `process.env` directly inside the app:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: Number(configService.get<string>('POSTGRES_PORT')),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
      }),
    }),
  ],
})
export class DatabaseModule {}
```
`autoLoadEntities: true` satisfies "entities are auto-loaded" — any entity registered later via `TypeOrmModule.forFeature([...])` in a feature module is picked up automatically, no manual entities array to maintain. `synchronize` and `migrationsRun` are both explicitly `false` per the requirement (schema changes only ever happen through committed migrations, run deliberately).

**`api/src/migrations/`** — create the empty directory (e.g. via a `.gitkeep`) so it exists for the CLI's default output path; no migrations added yet.

## Modified files

**`api/src/app.module.ts`** — import `ConfigModule.forRoot({ isGlobal: true })` (so `ConfigService` is available app-wide from a single registration) and `DatabaseModule`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**`api/package.json`** — add scripts for the CLI, using TypeORM's `typeorm-ts-node-commonjs` wrapper (matches the project's CommonJS output + existing `ts-node`/`tsconfig-paths` devDependencies, avoiding any ESM-loader complications with the `nodenext` tsconfig setting):
```json
"typeorm": "typeorm-ts-node-commonjs -d src/database/data-source.ts",
"migration:create": "typeorm-ts-node-commonjs migration:create ./src/migrations/$npm_config_name",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert"
```
Usage: `npm run migration:create --name=CreateUsersTable` (creates an empty migration file), `npm run migration:run`, `npm run migration:revert`.

## Verification
- `npm run build` in `api/` compiles cleanly (confirms TypeORM/@nestjs/typeorm/@nestjs/config types resolve under the existing `nodenext`/strict tsconfig).
- `docker compose up -d postgres` from repo root, then `npm run start:dev` in `api/` — app should boot with no connection errors (Nest logs `TypeOrmModule` dependencies initialized).
- `npm run migration:run` with no migrations present should connect successfully and report "No migrations are pending" (proves the standalone `DataSource` in `data-source.ts` can reach the DB using the same `.env` outside of Nest).
- `npm run migration:create --name=Smoke` creates an empty file under `src/migrations/`, confirming the CLI wiring end-to-end; delete the smoke-test file afterward since no migrations should be added yet.

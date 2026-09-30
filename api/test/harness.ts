import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

export type Harness = {
  app: INestApplication;
  dataSource: DataSource;
  stop: () => Promise<void>;
};

export async function startHarness(
  options: { env?: Record<string, string> } = {},
): Promise<Harness> {
  const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18',
  ).start();

  const redis: StartedRedisContainer = await new RedisContainer(
    'redis:7',
  ).start();

  // The app reads these through ConfigService, so they must be set
  // before the module is created.
  process.env.POSTGRES_HOST = postgres.getHost();
  process.env.POSTGRES_PORT = String(postgres.getPort());
  process.env.POSTGRES_USER = postgres.getUsername();
  process.env.POSTGRES_PASSWORD = postgres.getPassword();
  process.env.POSTGRES_DB = postgres.getDatabase();
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getPort());
  process.env.RATE_LIMIT_PER_MINUTE = '1000';

  Object.assign(process.env, options.env ?? {});

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  return {
    app,
    dataSource,
    stop: async () => {
      await app.close();
      await redis.stop();
      await postgres.stop();
    },
  };
}

import request from 'supertest';

import { startHarness, type Harness } from './harness';

const MIGRATIONS_COUNT = 10;

describe('GET /health', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.stop();
  });

  it('reports ok when both dependencies are reachable', async () => {
    const response = await request(harness.app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      database: true,
      cache: true,
    });
  });

  it('applies every migration', async () => {
    const applied = await harness.dataSource.query(
      'SELECT count(*)::int AS count FROM migrations',
    );

    expect(applied[0].count).toBe(MIGRATIONS_COUNT);
  });

  it('runs against a throwaway database, not the dev one', () => {
    // 5433 is the docker-compose Postgres used for development.
    expect(process.env.POSTGRES_PORT).not.toBe('5433');
  });
});

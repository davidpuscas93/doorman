import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import type { Harness } from './harness';

const PASSWORD = 'test-password-1234';

export type TestUser = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshCookie: string;
};

export type TokenUser = {
  id: string;
  accessToken: string;
};

export async function createUser(
  harness: Harness,
  options: { role?: 'buyer' | 'organizer' } = {},
): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.com`;

  const registered = await request(harness.app.getHttpServer())
    .post('/auth/register')
    .send({ email, name: 'Test User', password: PASSWORD })
    .expect(201);

  if (options.role === 'organizer') {
    await harness.dataSource.query(
      `UPDATE users SET role = 'organizer' WHERE id = $1`,
      [registered.body.id],
    );
  }

  // Log in after the role change, so the token carries the right role.
  const loggedIn = await request(harness.app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);

  const cookies = loggedIn.headers['set-cookie'] as unknown as string[];

  const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!refreshCookie) {
    throw new Error('login did not set a refresh_token cookie');
  }

  return {
    id: registered.body.id,
    email,
    password: PASSWORD,
    accessToken: loggedIn.body.accessToken,
    refreshCookie,
  };
}

export async function createEventWithTier(
  harness: Harness,
  options: {
    organizerId: string;
    ticketCount?: number;
    price?: number;
    name?: string;
  },
): Promise<{ eventId: string; ticketTypeId: string }> {
  const {
    organizerId,
    ticketCount = 10,
    price = 5000,
    name = 'General',
  } = options;

  const [event] = (await harness.dataSource.query(
    `INSERT INTO events (title, location, user_id, starts_at) 
     VALUES ($1, $2, $3, now() + interval '30 days')
     RETURNING id`,
    [`Test Event ${randomUUID().slice(0, 8)}`, 'Cluj-Napoca', organizerId],
  )) as [{ id: string }];

  const [ticketType] = (await harness.dataSource.query(
    `INSERT INTO ticket_types (name, price, total, event_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name, price, ticketCount, event.id],
  )) as [{ id: string }];

  await harness.dataSource.query(
    `INSERT INTO tickets (status, qr_code, ticket_type_id, event_id)
     SELECT 'available', gen_random_uuid()::text, $1, $2
     FROM generate_series(1, $3::int)`,
    [ticketType.id, event.id, ticketCount],
  );

  return { eventId: event.id, ticketTypeId: ticketType.id };
}

/**
 * Users created straight in the database with tokens signed directly - no
 * registration, no argon2. This test is about row locking, not about login,
 * and fifty password hashes would be most of its runtime.
 */
export async function createUsersWithTokens(
  harness: Harness,
  count: number,
): Promise<TokenUser[]> {
  const rows = (await harness.dataSource.query(
    `INSERT INTO users (email, name, role)
     SELECT 'load-' || gen_random_uuid() || '@example.com', 'Load User', 'buyer'
     FROM generate_series(1, $1::int)
     RETURNING id, email`,
    [count],
  )) as { id: string; email: string }[];

  const jwtService = harness.app.get(JwtService);

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      accessToken: await jwtService.signAsync({
        sub: row.id,
        email: row.email,
        role: 'buyer',
      }),
    })),
  );
}

import request from 'supertest';

import { startHarness, type Harness } from './harness';
import { createUser } from './factories';

describe('auth', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.stop();
  });

  const post = (path: string) =>
    request(harness.app.getHttpServer()).post(path);

  describe('POST /auth/register', () => {
    it('creates a buyer and never an organizer, whatever the body says', async () => {
      const response = await post('/auth/register')
        .send({
          email: `role-${Date.now()}@example.com`,
          name: 'Test User',
          password: 'test-password-1234',
          role: 'organizer',
        })
        .expect(201);

      expect(response.body.role).toBe('buyer');
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email case-insensitively', async () => {
      const user = await createUser(harness);

      await post('/auth/register')
        .send({
          email: user.email.toUpperCase(),
          name: 'Impostor',
          password: 'test-password-1234',
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('returns an access token and sets an httpOnly refresh cookie', async () => {
      const user = await createUser(harness);

      const response = await post('/auth/login')
        .send({
          email: user.email,
          password: user.password,
        })
        .expect(201);

      expect(response.body.accessToken).toBeTruthy();
      expect(response.body).not.toHaveProperty('refreshToken');

      const cookie = (
        response.headers['set-cookie'] as unknown as string[]
      ).find((c) => c.startsWith('refresh_token'));

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/auth');
    });

    it('answers identically for a wrong password and an unknown email', async () => {
      const user = await createUser(harness);

      const wrongPassword = await post('/auth/login')
        .send({
          email: user.email,
          password: 'not-the-password',
        })
        .expect(401);

      const unknownEmail = await post('/auth/login')
        .send({
          email: 'nobody@example.com',
          password: 'not-the-password',
        })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the token, issuing a different one', async () => {
      const user = await createUser(harness);

      const refreshed = await post('/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(201);

      expect(refreshed.body.accessToken).toBeTruthy();

      const rotated = (
        refreshed.headers['set-cookie'] as unknown as string[]
      ).find((c) => c.startsWith('refresh_token='));

      expect(rotated).toBeTruthy();
      expect(rotated).not.toBe(user.refreshCookie);
    });

    it('revokes the whole family when a spent token is replayed', async () => {
      const user = await createUser(harness);

      // Spend the original, keeping its successor.
      const first = await post('/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(201);

      const successor = (
        first.headers['set-cookie'] as unknown as string[]
      ).find((c) => c.startsWith('refresh_token='));

      if (!successor) {
        throw new Error('refresh did not set a refresh_token cookie');
      }

      // Replaying the spent one is treated as a leak.
      await post('/auth/refresh').set('Cookie', user.refreshCookie).expect(401);

      // ...which kills the successor too, even though it was never used.
      await post('/auth/refresh').set('Cookie', successor).expect(401);

      const [row] = (await harness.dataSource.query(
        `SELECT count(*)::int AS unrevoked
         FROM refresh_tokens
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id],
      )) as [{ unrevoked: number }];

      expect(row.unrevoked).toBe(0);
    });
  });
});

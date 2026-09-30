import request from 'supertest';

import { startHarness, type Harness } from './harness';
import { createUser, createEventWithTier, type TestUser } from './factories';

describe('tickets', () => {
  let harness: Harness;
  let organizer: TestUser;

  beforeAll(async () => {
    harness = await startHarness();
    organizer = await createUser(harness, { role: 'organizer' });
  });

  afterAll(async () => {
    await harness.stop();
  });

  const hold = (user: TestUser, ticketTypeId: string, quantity: number) =>
    request(harness.app.getHttpServer())
      .post('/tickets/hold')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ ticketTypeId, quantity });

  it('rejects an unauthenticated hold', async () => {
    const { ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
    });

    await request(harness.app.getHttpServer())
      .post('/tickets/hold')
      .send({
        ticketTypeId,
        quantity: 1,
      })
      .expect(401);
  });

  it('holds the requested tickets and returns their expiry', async () => {
    const buyer = await createUser(harness);
    const { ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: 5,
    });

    const response = await hold(buyer, ticketTypeId, 2).expect(201);

    expect(response.body).toHaveLength(2);
    expect(new Date(response.body[0].heldUntil).getTime()).toBeGreaterThan(
      Date.now(),
    );
    // The QR code of an unpaid ticket must never leave the server.
    expect(response.body[0]).not.toHaveProperty('qrCode');
  });

  it('refuses to hold more than exist', async () => {
    const buyer = await createUser(harness);
    const { ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: 2,
    });

    await hold(buyer, ticketTypeId, 3).expect(400);
  });

  it('enforces the per-user hold cap across separate requests', async () => {
    const buyer = await createUser(harness);
    const { ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: 20,
    });

    await hold(buyer, ticketTypeId, 10).expect(201);
    await hold(buyer, ticketTypeId, 1).expect(400);
  });

  it('reports what a user currently holds', async () => {
    const buyer = await createUser(harness);
    const { eventId, ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: 5,
    });

    await hold(buyer, ticketTypeId, 3).expect(201);

    const response = await request(harness.app.getHttpServer())
      .get(`/tickets/holds?eventId=${eventId}`)
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .expect(200);

    expect(response.body).toHaveLength(3);
  });

  it('checks out held tickets and prices them from the database', async () => {
    const buyer = await createUser(harness);
    const { eventId, ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: 5,
      price: 5000,
    });

    await hold(buyer, ticketTypeId, 2).expect(201);

    const response = await request(harness.app.getHttpServer())
      .post('/tickets/checkout')
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .send({ eventId })
      .expect(201);

    expect(response.body.transaction.amount).toBe(10000);
    expect(response.body.tickets).toHaveLength(2);
    expect(response.body.tickets[0].qrCode).toBeTruthy();

    const [counts] = (await harness.dataSource.query(
      `SELECT
        count(*) FILTER (WHERE status = 'bought')::int      AS bought,
        count(*) FILTER (WHERE status = 'available')::int   AS available,
        count(*) FILTER (WHERE held_until IS NOT NULL)::int AS still_held
       FROM tickets WHERE event_id = $1`,
      [eventId],
    )) as [{ bought: number; available: number; still_held: number }];

    expect(counts).toEqual({ bought: 2, available: 3, still_held: 0 });
  });

  it('refuses checkout with nothing held', async () => {
    const buyer = await createUser(harness);
    const { eventId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
    });

    await request(harness.app.getHttpServer())
      .post('/tickets/checkout')
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .send({ eventId })
      .expect(400);
  });

  it('returns released tickets to the pool', async () => {
    const buyer = await createUser(harness);
    const { eventId, ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: 5,
    });

    await hold(buyer, ticketTypeId, 4).expect(201);

    const released = await request(harness.app.getHttpServer())
      .post('/tickets/release')
      .set('Authorization', `Bearer ${buyer.accessToken}`)
      .send({ eventId })
      .expect(201);

    expect(released.body.released).toBe(4);

    const [row] = (await harness.dataSource.query(
      `SELECT count(*)::int AS available
       FROM tickets WHERE event_id = $1 AND status = 'available'`,
      [eventId],
    )) as [{ available: number }];

    expect(row.available).toBe(5);
  });
});

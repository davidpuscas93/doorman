import request from 'supertest';

import { startHarness, type Harness } from './harness';
import {
  createUser,
  createEventWithTier,
  createUsersWithTokens,
} from './factories';

const TICKETS = 10;
const BUYERS = 50;

describe('concurrent holds', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.stop();
  });

  it('sells each ticket exactly once under simultaneous demand', async () => {
    const organizer = await createUser(harness, { role: 'organizer' });
    const { eventId, ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: TICKETS,
    });

    const buyers = await createUsersWithTokens(harness, BUYERS);

    const statuses = await Promise.all(
      buyers.map((buyer) =>
        request(harness.app.getHttpServer().setMaxListeners(BUYERS + 10))
          .post('/tickets/hold')
          .set('Authorization', `Bearer ${buyer.accessToken}`)
          .send({ ticketTypeId, quantity: 1 })
          .then((response) => response.status),
      ),
    );

    const created = statuses.filter((status) => status === 201).length;
    const rejected = statuses.filter((status) => status === 400).length;

    expect(created).toBe(TICKETS);
    expect(rejected).toBe(BUYERS - TICKETS);

    const [counts] = (await harness.dataSource.query(
      `SELECT
        count(*) FILTER (WHERE status = 'held')::int      AS held,
        count(*) FILTER (WHERE status = 'available')::int AS available,
        count(DISTINCT held_by_user_id)::int              AS holders
       FROM tickets WHERE event_id = $1`,
      [eventId],
    )) as [{ held: number; available: number; holders: number }];

    // Expect every ticket held, none left unheld, and one distinct holder each
    expect(counts).toEqual({ held: TICKETS, available: 0, holders: TICKETS });
  });
});

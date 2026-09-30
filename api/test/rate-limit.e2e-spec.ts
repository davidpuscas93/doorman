import request from 'supertest';

import { startHarness, type Harness } from './harness';
import { createUser, createEventWithTier, type TestUser } from './factories';

describe('rate limiting', () => {
  let harness: Harness;
  let buyer: TestUser;
  let ticketTypeId: string;

  beforeAll(async () => {
    harness = await startHarness({ env: { RATE_LIMIT_PER_MINUTE: '3' } });

    const organizer = await createUser(harness, { role: 'organizer' });
    buyer = await createUser(harness);

    ({ ticketTypeId } = await createEventWithTier(harness, {
      organizerId: organizer.id,
      ticketCount: 20,
    }));
  });

  afterAll(async () => {
    await harness.stop();
  });

  it('returns 429 once the window allowance is spent', async () => {
    const attempt = () =>
      request(harness.app.getHttpServer())
        .post('/tickets/hold')
        .set('Authorization', `Bearer ${buyer.accessToken}`)
        .send({ ticketTypeId, quantity: 1 })
        .then((response) => response.status);

    const statuses: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      statuses.push(await attempt());
    }

    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
});

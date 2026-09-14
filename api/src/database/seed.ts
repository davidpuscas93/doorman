import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';

import dataSource from './data-source';

const SEED_DOMAIN = '@seed.doorman.dev';
const USER_COUNT = 2000;
const ORGANIZER_COUNT = 35;
const EVENT_COUNT = 50;
const TICKETS_PER_TYPE = 2000;
const CHUNK_SIZE = 2000;
const PRNG_SEED = 42;

type RNG = () => number;

function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng: RNG, min: number, max: number): number {
  return rng() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pick<T>(rng: RNG, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(rng: RNG, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function weightedPick<T>(rng: RNG, items: [T, number][]): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let r = rng() * total;
  for (const [item, weight] of items) {
    if (r < weight) return item;
    r -= weight;
  }
  return items[items.length - 1][0];
}

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
  'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
];

const CITIES = [
  'Austin', 'Denver', 'Seattle', 'Chicago', 'Miami', 'Boston', 'Portland',
  'Nashville', 'Atlanta', 'Phoenix', 'Dallas', 'Minneapolis', 'Detroit',
  'Charlotte', 'San Diego',
];

const VENUES = [
  'Grand Convention Center', 'Riverside Park Pavilion', 'The Civic Auditorium',
  'Skyline Arena', 'Union Station Hall', 'Lakeside Amphitheater',
  'The Old Mill Warehouse', 'Downtown Expo Center', 'Harbor View Terrace',
  'Oakwood Fairgrounds',
];

const EVENT_TYPES = [
  'Music Festival', 'Tech Conference', 'Food & Wine Expo', 'Comedy Night',
  'Art Fair', 'Startup Summit', 'Film Festival', 'Craft Beer Fest',
  'Marathon Weekend', 'Book Fair',
];

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'organizer' | 'buyer';
}

interface EventRecord {
  id: string;
  title: string;
  location: string;
  userId: string;
  startsAt: Date;
}

interface TicketTypeRecord {
  id: string;
  name: string;
  price: number;
  total: number;
  eventId: string;
}

function generateUsers(rng: RNG): UserRecord[] {
  const users: UserRecord[] = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const role: 'organizer' | 'buyer' = i < ORGANIZER_COUNT ? 'organizer' : 'buyer';
    const email = `${first}.${last}${i}${SEED_DOMAIN}`.toLowerCase();
    users.push({ id: randomUUID(), name: `${first} ${last}`, email, role });
  }
  return users;
}

function generateEvents(rng: RNG, organizers: UserRecord[]): EventRecord[] {
  const assignment: UserRecord[] = [];
  for (let i = 0; i < 20; i++) assignment.push(organizers[i]);
  for (let j = 0; j < 15; j++) {
    assignment.push(organizers[20 + j]);
    assignment.push(organizers[20 + j]);
  }

  const combos: [string, string][] = [];
  for (const type of EVENT_TYPES) {
    for (const city of CITIES) {
      combos.push([type, city]);
    }
  }
  shuffle(rng, combos);
  const chosen = combos.slice(0, EVENT_COUNT);

  const now = Date.now();
  return chosen.map(([eventType, city], i) => {
    const venue = pick(rng, VENUES);
    const offsetMs =
      randInt(rng, -60, 120) * 24 * 60 * 60 * 1000 + randInt(rng, 0, 24 * 60 * 60 * 1000);
    return {
      id: randomUUID(),
      title: `${eventType} — ${city}`,
      location: `${venue}, ${city}`,
      userId: assignment[i].id,
      startsAt: new Date(now + offsetMs),
    };
  });
}

function generateTicketTypes(rng: RNG, events: EventRecord[]): TicketTypeRecord[] {
  const types: TicketTypeRecord[] = [];
  for (const event of events) {
    // Prices are in bani (minor units), same as transactions.amount — 100 bani = 1 leu.
    const gaPrice = randInt(rng, 2000, 6000);
    const earlyBirdPrice = Math.max(500, Math.round(gaPrice * randFloat(rng, 0.5, 0.85)));
    const vipPrice = randInt(rng, gaPrice + 4000, gaPrice + 19000);
    types.push(
      { id: randomUUID(), name: 'General Admission', price: gaPrice, total: TICKETS_PER_TYPE, eventId: event.id },
      { id: randomUUID(), name: 'Early Bird', price: earlyBirdPrice, total: TICKETS_PER_TYPE, eventId: event.id },
      { id: randomUUID(), name: 'VIP', price: vipPrice, total: TICKETS_PER_TYPE, eventId: event.id },
    );
  }
  return types;
}

function groupByEventId<T extends { eventId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.eventId);
    if (list) list.push(item);
    else map.set(item.eventId, [item]);
  }
  return map;
}

function generateTicketsAndTransactions(
  rng: RNG,
  events: EventRecord[],
  ticketTypesByEvent: Map<string, TicketTypeRecord[]>,
  buyers: UserRecord[],
) {
  const ticketRows: unknown[][] = [];
  const transactionRows: unknown[][] = [];
  const qrCodes: string[] = [];

  const pushTicket = (
    status: string,
    ticketTypeId: string,
    eventId: string,
    heldByUserId: string | null,
    transactionId: string | null,
    heldUntil: Date | null,
  ) => {
    const qrCode = `SEED-${randomUUID()}`;
    qrCodes.push(qrCode);
    ticketRows.push([status, qrCode, ticketTypeId, eventId, heldByUserId, transactionId, heldUntil]);
  };

  for (const event of events) {
    const types = ticketTypesByEvent.get(event.id) ?? [];
    const tier = weightedPick<'hot' | 'medium' | 'quiet'>(rng, [
      ['hot', 0.1],
      ['medium', 0.4],
      ['quiet', 0.5],
    ]);
    const baseFraction =
      tier === 'hot'
        ? randFloat(rng, 0.6, 0.85)
        : tier === 'medium'
          ? randFloat(rng, 0.2, 0.45)
          : randFloat(rng, 0.03, 0.15);

    const boughtPool: { ticketTypeId: string; price: number }[] = [];

    for (const ticketType of types) {
      const jitter = randFloat(rng, 0.7, 1.3);
      const combined = clamp(baseFraction * jitter, 0, 0.95);
      const heldFraction = randFloat(rng, 0.1, 0.2);
      const heldCount = Math.round(TICKETS_PER_TYPE * combined * heldFraction);
      const soldCount = Math.round(TICKETS_PER_TYPE * combined);
      const boughtCount = Math.max(0, soldCount - heldCount);
      const availableCount = TICKETS_PER_TYPE - heldCount - boughtCount;

      let remainingHeld = heldCount;
      while (remainingHeld > 0) {
        const groupSize = Math.min(randInt(rng, 1, 5), remainingHeld);
        const buyer = pick(rng, buyers);
        const heldUntil = new Date(Date.now() + randInt(rng, 1, 10) * 60 * 1000);
        for (let k = 0; k < groupSize; k++) {
          pushTicket('held', ticketType.id, event.id, buyer.id, null, heldUntil);
        }
        remainingHeld -= groupSize;
      }

      for (let k = 0; k < boughtCount; k++) {
        boughtPool.push({ ticketTypeId: ticketType.id, price: ticketType.price });
      }

      for (let k = 0; k < availableCount; k++) {
        pushTicket('available', ticketType.id, event.id, null, null, null);
      }
    }

    shuffle(rng, boughtPool);
    let idx = 0;
    while (idx < boughtPool.length) {
      const groupSize = Math.min(randInt(rng, 1, 5), boughtPool.length - idx);
      const group = boughtPool.slice(idx, idx + groupSize);
      idx += groupSize;
      const buyer = pick(rng, buyers);
      const amount = group.reduce((sum, g) => sum + g.price, 0);
      const transactionId = randomUUID();
      transactionRows.push([transactionId, amount, 'accepted', event.id, buyer.id]);
      for (const g of group) {
        pushTicket('bought', g.ticketTypeId, event.id, null, transactionId, null);
      }
    }
  }

  return { ticketRows, transactionRows, qrCodes };
}

type ColumnSpec = string | { name: string; cast: string };

async function bulkInsert(
  manager: EntityManager,
  table: string,
  columns: ColumnSpec[],
  rows: unknown[][],
  chunkSize = CHUNK_SIZE,
): Promise<void> {
  if (rows.length === 0) return;
  const colName = (c: ColumnSpec) => (typeof c === 'string' ? c : c.name);
  const colCast = (c: ColumnSpec) => (typeof c === 'string' ? undefined : c.cast);
  const colNames = columns.map(colName).join(', ');

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuesSql = chunk
      .map((_, rowIdx) =>
        '(' +
        columns
          .map((c, colIdx) => {
            const paramNum = rowIdx * columns.length + colIdx + 1;
            const cast = colCast(c);
            return cast ? `$${paramNum}::${cast}` : `$${paramNum}`;
          })
          .join(', ') +
        ')',
      )
      .join(', ');
    const params = chunk.flat();
    await manager.query(`INSERT INTO ${table} (${colNames}) VALUES ${valuesSql}`, params);
  }
}

async function cleanup(manager: EntityManager): Promise<void> {
  const pattern = `%${SEED_DOMAIN}`;

  await manager.query(
    `DELETE FROM tickets WHERE event_id IN (
      SELECT e.id FROM events e JOIN users u ON u.id = e.user_id WHERE lower(u.email) LIKE $1
    )`,
    [pattern],
  );
  await manager.query(
    `DELETE FROM transactions WHERE event_id IN (
      SELECT e.id FROM events e JOIN users u ON u.id = e.user_id WHERE lower(u.email) LIKE $1
    )`,
    [pattern],
  );
  await manager.query(
    `DELETE FROM ticket_types WHERE event_id IN (
      SELECT e.id FROM events e JOIN users u ON u.id = e.user_id WHERE lower(u.email) LIKE $1
    )`,
    [pattern],
  );
  await manager.query(
    `DELETE FROM events WHERE user_id IN (SELECT id FROM users WHERE lower(email) LIKE $1)`,
    [pattern],
  );
  await manager.query(`DELETE FROM users WHERE lower(email) LIKE $1`, [pattern]);
}

async function main(): Promise<void> {
  const rng = mulberry32(PRNG_SEED);

  await dataSource.initialize();
  try {
    const users = generateUsers(rng);
    const organizers = users.filter((u) => u.role === 'organizer');
    const buyers = users.filter((u) => u.role === 'buyer');

    const events = generateEvents(rng, organizers);
    const ticketTypes = generateTicketTypes(rng, events);
    const ticketTypesByEvent = groupByEventId(ticketTypes);

    const { ticketRows, transactionRows, qrCodes } = generateTicketsAndTransactions(
      rng,
      events,
      ticketTypesByEvent,
      buyers,
    );

    if (new Set(qrCodes).size !== qrCodes.length) {
      throw new Error('Duplicate qr_code detected in generated seed data — aborting.');
    }

    await dataSource.transaction(async (manager) => {
      await manager.query('SET LOCAL statement_timeout = 0');
      await cleanup(manager);

      await bulkInsert(
        manager,
        'users',
        ['id', 'name', 'email', 'description', { name: 'socials', cast: 'jsonb' }, 'role'],
        users.map((u) => [u.id, u.name, u.email, null, JSON.stringify({}), u.role]),
      );

      await bulkInsert(
        manager,
        'events',
        ['id', 'title', 'location', 'description', 'user_id', 'starts_at'],
        events.map((e) => [e.id, e.title, e.location, null, e.userId, e.startsAt]),
      );

      await bulkInsert(
        manager,
        'ticket_types',
        ['id', 'name', 'price', 'total', 'event_id'],
        ticketTypes.map((t) => [t.id, t.name, t.price, t.total, t.eventId]),
      );

      await bulkInsert(
        manager,
        'transactions',
        ['id', 'amount', 'status', 'event_id', 'user_id'],
        transactionRows,
      );

      await bulkInsert(
        manager,
        'tickets',
        ['status', 'qr_code', 'ticket_type_id', 'event_id', 'held_by_user_id', 'transaction_id', 'held_until'],
        ticketRows,
      );
    });

    await dataSource.query('ANALYZE users, events, ticket_types, transactions, tickets');

    console.log('Seed complete:', {
      users: users.length,
      organizers: organizers.length,
      buyers: buyers.length,
      events: events.length,
      ticketTypes: ticketTypes.length,
      transactions: transactionRows.length,
      tickets: ticketRows.length,
    });
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});

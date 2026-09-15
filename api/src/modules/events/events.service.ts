import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';

import { Ticket } from '../tickets/entities/ticket.entity';
import { Event } from './entities/event.entity';

import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
  ) {}

  async findAll(limit = 20, offset = 0) {
    const cacheKey = `events:list:${limit}:${offset}`;

    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      this.logger.warn(`Cache read failed: ${(err as Error).message}`);
    }

    const events = await this.eventsRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organizer', 'organizer')
      .orderBy('event.startsAt', 'ASC')
      .take(limit)
      .skip(offset)
      .getMany();

    if (events.length === 0) return [];

    const counts = await this.ticketsRepository
      .createQueryBuilder('ticket')
      .select('ticket.eventId', 'eventId')
      .addSelect('COUNT(*)', 'available')
      .where('ticket.eventId IN (:...ids)', { ids: events.map((e) => e.id) })
      .andWhere('ticket.status = :status', { status: 'available' })
      .groupBy('ticket.eventId')
      .getRawMany<{
        eventId: string;
        available: string;
      }>();

    const availableByEvent = new Map(
      counts.map((c) => [c.eventId, Number(c.available)]),
    );

    const result = events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      organizer: event.organizer?.name ?? null,
      available: availableByEvent.get(event.id) ?? 0,
    }));

    try {
      await this.redisClient.set(cacheKey, JSON.stringify(result), 'EX', 30);
    } catch (err) {
      this.logger.warn(`Cache read failed: ${(err as Error).message}`);
    }

    return result;
  }
}

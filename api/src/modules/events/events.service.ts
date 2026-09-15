import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';

import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
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
    @InjectRepository(TicketType)
    private readonly ticketTypesRepository: Repository<TicketType>,
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

  async findOne(id: string) {
    const event = await this.eventsRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organizer', 'organizer')
      .where('event.id = :id', { id })
      .getOne();

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const ticketTypes = await this.ticketTypesRepository
      .createQueryBuilder('ticket_type')
      .where('ticket_type.eventId = :id', { id })
      .getMany();

    const counts = await this.ticketsRepository
      .createQueryBuilder('ticket')
      .select('ticket.ticketTypeId', 'ticketTypeId')
      .addSelect('COUNT(*)', 'available')
      .where('ticket.eventId = :id', { id })
      .andWhere(
        '(ticket.status = :available OR (ticket.status = :held AND ticket.heldUntil < now()))',
        { available: 'available', held: 'held' },
      )
      .groupBy('ticket.ticketTypeId')
      .getRawMany<{
        ticketTypeId: string;
        available: string;
      }>();

    const availableByType = new Map(
      counts.map((c) => [c.ticketTypeId, Number(c.available)]),
    );

    const result = {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      location: event.location,
      organizer: event.organizer?.name ?? null,
      ticketTypes: ticketTypes.map((tt) => ({
        id: tt.id,
        name: tt.name,
        price: tt.price,
        available: availableByType.get(tt.id) ?? 0,
      })),
    };

    return result;
  }
}

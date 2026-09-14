import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

import { User } from '../users/entities/user.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Event } from './entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
  ) {}

  create(createEventDto: CreateEventDto) {
    return 'This action adds a new event';
  }

  async findAll(limit = 20, offset = 0) {
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

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      organizer: event.organizer?.name ?? null,
      available: availableByEvent.get(event.id) ?? 0,
    }));
  }

  findOne(id: number) {
    return `This action returns a #${id} event`;
  }

  update(id: number, updateEventDto: UpdateEventDto) {
    return `This action updates a #${id} event`;
  }

  remove(id: number) {
    return `This action removes a #${id} event`;
  }
}

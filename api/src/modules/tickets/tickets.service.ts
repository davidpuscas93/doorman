import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Repository } from 'typeorm';
import { Queue } from 'bullmq';

import { Ticket } from './entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

const MAX_ACTIVE_HOLDS_PER_USER = 10;

@Injectable()
export class TicketsService {
  constructor(
    @InjectQueue('tickets') private readonly ticketsQueue: Queue,
    private readonly dataSource: DataSource,
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
  ) {}

  async hold(ticketTypeId: string, quantity: number, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      // 1. Serialise this user's holds
      await manager
        .createQueryBuilder(User, 'user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .getOne();

      // 2. Count what they're already holding
      const activeHolds = await manager
        .createQueryBuilder(Ticket, 'ticket')
        .where('ticket.heldByUserId = :userId', { userId })
        .andWhere('ticket.status = :status', { status: 'held' })
        .andWhere('ticket.heldUntil > now()')
        .getCount();

      if (activeHolds + quantity > MAX_ACTIVE_HOLDS_PER_USER) {
        throw new BadRequestException(
          `You can hold at most ${MAX_ACTIVE_HOLDS_PER_USER} tickets at a time. You currently hold ${activeHolds}.`,
        );
      }

      const tickets = await manager
        .createQueryBuilder(Ticket, 'ticket')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('ticket.ticketTypeId = :ticketTypeId', { ticketTypeId })
        .andWhere(
          '(ticket.status = :available OR (ticket.status = :held AND ticket.heldUntil < now()))',
          { available: 'available', held: 'held' },
        )
        .limit(quantity)
        .getMany();

      if (tickets.length < quantity) {
        throw new BadRequestException(
          `There are not enough tickets available. Found ${tickets.length} instead of ${quantity}.`,
        );
      }

      const heldUntil = new Date(Date.now() + 10 * 60 * 1000);

      for (const ticket of tickets) {
        ticket.status = 'held';
        ticket.heldByUserId = userId;
        ticket.heldUntil = heldUntil;
      }

      await manager.save(tickets);
      return tickets;
    });
  }

  async checkout(userId: string, eventId: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      // 1. Re-read from the database what this user is ACTUALLY holding, right now.
      const tickets = await manager
        .createQueryBuilder(Ticket, 'ticket')
        .setLock('pessimistic_write')
        .where('ticket.eventId = :eventId', { eventId })
        .andWhere('ticket.heldByUserId = :userId', { userId })
        .andWhere('ticket.status = :held', { held: 'held' })
        .andWhere('ticket.heldUntil > now()')
        .getMany();

      if (tickets.length === 0) {
        throw new BadRequestException(
          'No valid held tickets found — your hold may have expired.',
        );
      }

      // 2. Price them from the database. Never from the request.
      const ticketTypeIds = [...new Set(tickets.map((t) => t.ticketTypeId))];
      const ticketTypes = await manager.find(TicketType, {
        where: { id: In(ticketTypeIds) },
      });
      const priceById = new Map(ticketTypes.map((tt) => [tt.id, tt.price]));

      const amount = tickets.reduce((sum, ticket) => {
        const price = priceById.get(ticket.ticketTypeId);
        if (price === undefined) {
          throw new Error(`No ticket type found for ${ticket.ticketTypeId}`);
        }
        return sum + price;
      }, 0);

      // 3. Create the transaction first — the tickets need its id.
      const transaction = manager.create(Transaction, {
        amount,
        status: 'accepted' as const, // no payment provider yet
        eventId,
        userId,
      });
      await manager.save(transaction);

      // 4. Mark the tickets bought and release the hold fields.
      for (const ticket of tickets) {
        ticket.status = 'bought';
        ticket.transactionId = transaction.id;
        ticket.heldByUserId = null;
        ticket.heldUntil = null;
      }
      await manager.save(tickets);

      return { transaction, tickets };
    });

    await this.ticketsQueue.add('send-tickets', {
      transactionId: result.transaction.id,
    });

    return result;
  }

  async release(
    userId: string,
    eventId: string,
  ): Promise<{ released: number }> {
    const result = await this.ticketsRepository.update(
      {
        eventId,
        heldByUserId: userId,
        status: 'held',
      },
      {
        status: 'available',
        heldByUserId: null,
        heldUntil: null,
      },
    );

    return { released: result.affected ?? 0 };
  }

  async findActiveHolds(userId: string, eventId: string) {
    return this.ticketsRepository.find({
      where: {
        eventId,
        heldByUserId: userId,
        status: 'held',
        heldUntil: MoreThan(new Date()),
      },
    });
  }
}

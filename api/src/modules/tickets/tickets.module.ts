import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RedisModule } from '../../redis/redis.module';

import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketsProcessor } from './tickets.processor';

import { Ticket } from './entities/ticket.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketType, Transaction]),
    RedisModule,
    BullModule.registerQueue({ name: 'tickets' }),
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsProcessor],
})
export class TicketsModule {}

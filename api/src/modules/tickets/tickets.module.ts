import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';

import { Ticket } from './entities/ticket.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketType, Transaction])],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}

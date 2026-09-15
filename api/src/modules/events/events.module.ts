import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventsService } from './events.service';
import { EventsController } from './events.controller';

import { RedisModule } from '../../redis/redis.module';

import { User } from '../users/entities/user.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketType } from '../ticket-types/entities/ticket-type.entity';
import { Event } from './entities/event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, User, Ticket, TicketType]),
    RedisModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}

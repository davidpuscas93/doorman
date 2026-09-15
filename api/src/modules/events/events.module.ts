import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventsService } from './events.service';
import { EventsController } from './events.controller';

import { RedisModule } from '../../redis/redis.module';

import { Event } from './entities/event.entity';
import { User } from '../users/entities/user.entity';
import { Ticket } from '../tickets/entities/ticket.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, User, Ticket]), RedisModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}

import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';

import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @UseGuards(RateLimitGuard)
  @Post('hold')
  hold(
    @Body() body: { ticketTypeId: string; quantity: number; userId: string },
  ) {
    return this.ticketsService.hold(
      body.ticketTypeId,
      body.quantity,
      body.userId,
    );
  }

  @Post('checkout')
  checkout(@Body() body: { userId: string; eventId: string }) {
    return this.ticketsService.checkout(body.userId, body.eventId);
  }
}

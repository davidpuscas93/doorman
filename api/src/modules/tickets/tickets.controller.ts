import { Controller, Post, Body } from '@nestjs/common';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

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

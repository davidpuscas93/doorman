import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';

import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { holdSchema } from './dto/hold.dto';
import { checkoutSchema } from './dto/checkout.dto';
import type { HoldDto } from './dto/hold.dto';
import type { CheckoutDto } from './dto/checkout.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @UseGuards(RateLimitGuard)
  @Post('hold')
  hold(@Body({ schema: holdSchema }) body: HoldDto) {
    return this.ticketsService.hold(
      body.ticketTypeId,
      body.quantity,
      body.userId,
    );
  }

  @Post('checkout')
  checkout(@Body({ schema: checkoutSchema }) body: CheckoutDto) {
    return this.ticketsService.checkout(body.userId, body.eventId);
  }
}

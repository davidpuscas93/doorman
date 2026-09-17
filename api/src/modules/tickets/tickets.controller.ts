import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';

import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { holdSchema } from './dto/hold.dto';
import { checkoutSchema } from './dto/checkout.dto';
import type { HoldDto } from './dto/hold.dto';
import type { CheckoutDto } from './dto/checkout.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @UseGuards(RateLimitGuard, JwtAuthGuard)
  @Post('hold')
  hold(
    @Body({ schema: holdSchema }) body: HoldDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.hold(body.ticketTypeId, body.quantity, user.sub);
  }

  @UseGuards(RateLimitGuard, JwtAuthGuard)
  @Post('checkout')
  checkout(
    @Body({ schema: checkoutSchema }) body: CheckoutDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.checkout(user.sub, body.eventId);
  }
}

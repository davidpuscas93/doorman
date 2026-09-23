import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';

import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { holdSchema, type HoldDto } from './dto/hold.dto';
import { checkoutSchema, type CheckoutDto } from './dto/checkout.dto';
import { releaseSchema, type ReleaseDto } from './dto/release.dto';

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

  @UseGuards(RateLimitGuard, JwtAuthGuard)
  @Post('release')
  release(
    @Body({ schema: releaseSchema }) body: ReleaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.release(user.sub, body.eventId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('holds')
  findActiveHolds(
    @Query('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ticketsService.findActiveHolds(user.sub, eventId);
  }
}

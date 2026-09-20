import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';

import { registerSchema } from './dto/register.dto';
import { loginSchema } from './dto/login.dto';

import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  register(@Body({ schema: registerSchema }) body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  async login(
    @Body({ schema: loginSchema }) body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(body);

    response.cookie(
      'refresh_token',
      result.refreshToken,
      this.refreshCookieOptions(),
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.['refresh_token'] as
      string | undefined;
    response.clearCookie('refresh_token', { path: '/auth' });

    if (!refreshToken) {
      return;
    }

    await this.authService.logout(refreshToken);
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.['refresh_token'] as
      string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const result = await this.authService.refresh(refreshToken);

    response.cookie(
      'refresh_token',
      result.refreshToken,
      this.refreshCookieOptions(),
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  private refreshCookieOptions(): CookieOptions {
    const days = Number(
      this.configService.getOrThrow<string>('REFRESH_TOKEN_EXPIRES_IN_DAYS'),
    );

    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: days * 24 * 60 * 60 * 1000,
    };
  }
}

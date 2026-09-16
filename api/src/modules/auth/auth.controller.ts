import { Controller, Post, Body } from '@nestjs/common';

import { AuthService } from './auth.service';

import { registerSchema } from './dto/register.dto';
import { loginSchema } from './dto/login.dto';
import { refreshSchema } from './dto/refresh.dto';

import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body({ schema: registerSchema }) body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body({ schema: loginSchema }) body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('refresh')
  refresh(@Body({ schema: refreshSchema }) body: RefreshDto) {
    return this.authService.refresh(body.refreshToken);
  }
}

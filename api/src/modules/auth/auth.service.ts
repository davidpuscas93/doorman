import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';

import { User } from '../users/entities/user.entity';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash('unused-placeholder-value');

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password);

    const user = this.usersRepository.create({
      email: dto.email,
      name: dto.name,
      role: 'buyer',
      passwordHash,
    });

    try {
      await this.usersRepository.save(user);
    } catch (err) {
      // Postgres's unique-violation code
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException(
          'An account with that email already exists',
        );
      }
      throw err;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .where('lower(user.email) = lower(:email)', { email: dto.email })
      .getOne();

    if (!user || !user.passwordHash) {
      // Burn comparable time so a missing account isn't faster than a wrong password
      await argon2.verify(await this.dummyHash, dto.password);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refresh(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const refreshToken = await this.refreshTokensRepository
      .createQueryBuilder('refresh_token')
      .where('refresh_token.tokenHash = :tokenHash', { tokenHash })
      .getOne();

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (refreshToken.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (refreshToken.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (refreshToken.usedAt) {
      await this.refreshTokensRepository.update(
        {
          familyId: refreshToken.familyId,
          revokedAt: IsNull(),
        },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersRepository.findOneBy({
      id: refreshToken.userId,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.refreshTokensRepository.update(refreshToken.id, {
      usedAt: new Date(),
    });

    const accessToken = await this.signAccessToken(user);
    const newRefreshToken = await this.issueRefreshToken(
      refreshToken.userId,
      refreshToken.familyId,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private signAccessToken(user: User) {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private async issueRefreshToken(
    userId: string,
    familyId?: string,
  ): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const days = Number(
      this.configService.getOrThrow<string>('REFRESH_TOKEN_EXPIRES_IN_DAYS'),
    );
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const refreshToken = this.refreshTokensRepository.create({
      userId,
      tokenHash,
      familyId: familyId ?? randomUUID(),
      expiresAt,
    });

    await this.refreshTokensRepository.save(refreshToken);

    return token;
  }
}

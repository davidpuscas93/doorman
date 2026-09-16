import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';

import { User } from '../users/entities/user.entity';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash('unusued-placeholder-value');

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}

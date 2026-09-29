import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check() {
    const [database, cache] = await Promise.all([
      this.isReachable('database', () => this.dataSource.query('SELECT 1')),
      this.isReachable('redis', () => this.redis.ping()),
    ]);

    if (!database || !cache) {
      throw new ServiceUnavailableException({
        status: 'error',
        database,
        cache,
      });
    }

    return { status: 'ok', database, cache };
  }

  private async isReachable(
    name: string,
    run: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await run();
      return true;
    } catch (error) {
      this.logger.warn(`health: ${name} unreachable`, error);
      return false;
    }
  }
}

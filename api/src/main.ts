import { NestFactory } from '@nestjs/core';
import { StandardSchemaValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

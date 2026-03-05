import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';

async function bootstrap() {
  const dbPath = process.env.DB_PATH ?? 'data/app.sqlite';
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const app = await NestFactory.create(AppModule);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN ?? true;
  app.enableCors({ origin: corsOrigin === 'true' ? true : corsOrigin });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

import './load-env';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { assertSecureConfig } from './common/config';

async function bootstrap() {
  // Fail fast if the session/encryption secrets are missing or default.
  assertSecureConfig();

  const app = await NestFactory.create(AppModule);

  // The web app talks to the API same-origin (Next rewrites /api/* to the API),
  // so cross-origin CORS is not needed for normal operation. Only allow the
  // explicit origin(s) in WEB_ORIGIN (comma-separated) when the API is exposed
  // cross-origin; otherwise CORS stays off (never reflect an arbitrary origin
  // with credentials).
  const corsOrigins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api`);
}

bootstrap();

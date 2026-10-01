import './load-env';
// Must come before Nest/http/express load so the OTel instrumentations can
// patch them (no-op unless tracing is enabled — see tracing.ts).
import './tracing';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertSecureConfig } from './common/config';

async function bootstrap() {
  // Fail fast if the session/encryption secrets are missing or default.
  assertSecureConfig();

  // bufferLogs holds early logs until the pino logger is installed, so nothing
  // bypasses structured logging.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.). This
  // is a JSON API consumed same-origin, so helmet's defaults apply cleanly; the
  // browser never renders HTML from here.
  app.use(helmet());

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

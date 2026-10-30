import express from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  const configService = app.get(ConfigService);

  // HTTP security headers (SRCH-2)
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // required for GraphQL playground
      contentSecurityPolicy: process.env.ENVIRONMENT === 'production',
    }),
  );

  // Browsers reach search through the gateway, never directly, so CORS is
  // limited to ALLOWED_ORIGINS (none by default) like the other subgraphs.
  const allowedOrigins = (configService.get<string>('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    methods: ['GET', 'POST'],
    credentials: true,
  });

  // Limit request body size
  app.use(express.json({ limit: '1mb' }));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // On `docker stop`, finish the requests and jobs in progress, then exit.
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  const port = configService.get<number>('PORT') || 4005;
  await app.listen(port);

  logger.log(`Search subgraph is running on port ${port}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Error starting the application:', err);
  process.exit(1);
});

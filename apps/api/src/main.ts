import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file - rely on the real environment / defaults.
}

const DEFAULT_PORT = 4000;

function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}

async function bootstrap() {
  const port = resolvePort(process.env.PORT);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  // TODO(api): CORS policy - only needed once a browser calls the API directly.
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}
await bootstrap();

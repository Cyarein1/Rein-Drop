import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file - rely on the real environment / defaults.
}

async function bootstrap() {
  // Standalone application context: Nest DI and lifecycle hooks, no HTTP server.
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Worker started', 'Bootstrap');
}

await bootstrap();

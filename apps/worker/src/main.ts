import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfigOrExit, loadDotEnvFile, redactUrl } from '@rein-drop/env';
import { loadWorkerConfig } from './config/worker-config.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  loadDotEnvFile();
  // Fail fast with a readable list of problems before Nest starts.
  const config = loadConfigOrExit(() => loadWorkerConfig());

  // Standalone application context: Nest DI and lifecycle hooks, no HTTP server.
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config));
  app.enableShutdownHooks();

  Logger.log(
    `NODE_ENV=${config.nodeEnv} DATABASE_URL=${redactUrl(config.databaseUrl)}`,
    'Config',
  );
  Logger.log('Worker started', 'Bootstrap');
}

await bootstrap();

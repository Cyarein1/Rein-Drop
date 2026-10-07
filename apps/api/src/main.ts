import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfigOrExit, loadDotEnvFile, redactUrl } from '@rein-drop/env';
import { AppModule } from './app.module.js';
import { loadApiConfig } from './config/api-config.js';

async function bootstrap() {
  loadDotEnvFile();
  // Fail fast with a readable list of problems before Nest starts.
  const config = loadConfigOrExit(() => loadApiConfig());

  const app = await NestFactory.create(AppModule.forRoot(config));
  app.enableShutdownHooks();
  // TODO(api): CORS policy - only needed once a browser calls the API directly.
  await app.listen(config.port);

  Logger.log(
    `NODE_ENV=${config.nodeEnv} AUTH_PROVIDER=${config.authProvider} DATABASE_URL=${redactUrl(config.databaseUrl)}`,
    'Config',
  );
  Logger.log(`API listening on http://localhost:${config.port}`, 'Bootstrap');
}
await bootstrap();

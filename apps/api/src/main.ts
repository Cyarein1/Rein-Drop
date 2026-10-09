import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfigOrExit, loadDotEnvFile, redactUrl } from '@rein-drop/env';
import { AppModule } from './app.module.js';
import { configureHttp } from './common/http/security.js';
import { loadApiConfig } from './config/api-config.js';

async function bootstrap() {
  loadDotEnvFile();
  // Fail fast with a readable list of problems before Nest starts.
  const config = loadConfigOrExit(() => loadApiConfig());

  // rawBody: billing webhooks verify their signature over the exact bytes received.
  // Structured logs in production: one JSON object per line (timestamp, level, context, message).
  const app = await NestFactory.create(AppModule.forRoot(config), {
    rawBody: true,
    logger: new ConsoleLogger({ json: config.logFormat === 'json', colors: config.logFormat !== 'json' }),
  });
  // Body limits, proxy trust, no X-Powered-By. CORS stays off: no browser calls the API directly.
  configureHttp(app, { trustProxyHops: config.trustProxyHops });
  app.enableShutdownHooks();
  await app.listen(config.port);

  Logger.log(
    `NODE_ENV=${config.nodeEnv} AUTH_PROVIDER=${config.authProvider} DATABASE_URL=${redactUrl(config.databaseUrl)}`,
    'Config',
  );
  Logger.log(`API listening on http://localhost:${config.port}`, 'Bootstrap');
}
await bootstrap();

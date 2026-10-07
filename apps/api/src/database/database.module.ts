import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@rein-drop/db';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

/** Injection token for the shared PrismaClient: `@Inject(PRISMA) prisma: PrismaClient`. */
export const PRISMA = Symbol('PRISMA');

/** Closes the connection pool on shutdown. Connecting is lazy (first query). */
@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown() {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) => createPrismaClient(config.databaseUrl),
    },
    PrismaLifecycle,
  ],
  exports: [PRISMA],
})
export class DatabaseModule {}

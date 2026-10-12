import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JoinWaitlistRequest } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { PRISMA } from '../../database/database.module.js';

export type WaitlistOutcome = 'created' | 'duplicate';

/**
 * Early-access sign-ups (Landing 19). Write-only: there is no method that reads sign-ups back (the
 * architecture spec forbids it in the API). A repeat address is a no-op at the database
 * (`ON CONFLICT DO NOTHING` via skipDuplicates), so concurrent double-submits are safe and the
 * caller can't tell new from repeat. Logs carry the outcome and counts - never the email.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger('Waitlist');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async join(request: JoinWaitlistRequest, requestId: string | undefined): Promise<WaitlistOutcome> {
    const { count } = await this.prisma.waitlistSignup.createMany({
      data: [
        {
          email: request.email,
          source: request.source,
          requestedMarketplaces: request.requestedMarketplaces,
          requestedMarketplaceOther: request.requestedMarketplaceOther,
          consentVersion: request.consentVersion,
        },
      ],
      skipDuplicates: true,
    });
    const outcome: WaitlistOutcome = count === 1 ? 'created' : 'duplicate';
    const entry = {
      event: 'waitlist_signup',
      outcome,
      source: request.source,
      requestedMarketplaces: request.requestedMarketplaces.length,
      requestId: requestId ?? null,
    };
    this.logger.log(this.config.logFormat === 'json' ? entry : `waitlist sign-up ${outcome} (${request.source}, ${entry.requestedMarketplaces} requested) [${requestId ?? '-'}]`);
    return outcome;
  }
}

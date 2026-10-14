import { Controller, Get, Inject, Query } from '@nestjs/common';
import { capabilitiesFor, capabilitiesQuerySchema, type CapabilitiesResponse } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { PlansService } from '../plans/plans.service.js';

class CapabilitiesQueryDto extends createZodDto(capabilitiesQuerySchema) {}

/**
 * `GET /me/capabilities?platform=web|mobile` - which features this user has on this platform
 * (decision 0018). Evaluated here, once, from the shared feature list (contracts `FEATURES`), the
 * server's rollout flags (FEATURE_FLAGS) and the user's plan - so clients never decide on their
 * own. Hiding is product design; the endpoints of an unavailable feature still enforce access
 * themselves (entitlements, plan limits).
 */
@Controller('me/capabilities')
export class CapabilitiesController {
  constructor(
    private readonly plans: PlansService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Get()
  async get(@CurrentUser() user: Principal, @Query() query: CapabilitiesQueryDto): Promise<CapabilitiesResponse> {
    const plan = await this.plans.planForUser(user.userId);
    return {
      platform: query.platform,
      features: capabilitiesFor({
        platform: query.platform,
        flags: this.config.featureFlags,
        entitlements: plan.entitlements,
        environment: this.config.nodeEnv === 'production' ? 'production' : 'development',
      }),
    };
  }
}

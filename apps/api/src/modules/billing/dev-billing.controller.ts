import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { devBillingConfirmRequestSchema, type DevBillingConfirmResponse } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { AppException } from '../../common/errors/app.exception.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { SubscriptionsService } from './subscriptions.service.js';

class DevBillingConfirmDto extends createZodDto(devBillingConfirmRequestSchema) {}

/**
 * DEVELOPMENT-ONLY fake billing. Lets the plan gate be exercised end to end without a
 * billing provider. Responds 404 in production as if the route did not exist.
 * TODO(billing): replace with the real checkout (Stripe / app stores) - not integrated.
 */
@Controller('billing/dev')
export class DevBillingController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentUser() user: Principal, @Body() body: DevBillingConfirmDto): Promise<DevBillingConfirmResponse> {
    if (this.config.nodeEnv === 'production') {
      throw new AppException('NOT_FOUND', `Cannot POST /billing/dev/confirm`, HttpStatus.NOT_FOUND);
    }
    return { subscription: await this.subscriptions.confirmDevelopmentPlan(user.userId, body.planCode) };
  }
}

import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Product } from '@rein-drop/contracts';
import type { Request } from 'express';
import { getPrincipal } from '../../auth/decorators.js';
import { AccessService } from './access.service.js';

export const REQUIRES_PRODUCT = 'rein-drop:requires-product';

/**
 * Marks a route (or controller) as belonging to a paid product, e.g. `@RequiresProduct('sell')` on
 * every future Sell endpoint (decision 0018). Enforced by ProductAccessGuard (global) on the
 * server - never by hiding a button.
 */
export const RequiresProduct = (product: Product) => SetMetadata(REQUIRES_PRODUCT, product);

/** Global guard: routes without @RequiresProduct pass; marked ones need the product now (403 otherwise). */
@Injectable()
export class ProductAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const product = this.reflector.getAllAndOverride<Product | undefined>(REQUIRES_PRODUCT, [context.getHandler(), context.getClass()]);
    if (!product) return true;
    const user = getPrincipal(context.switchToHttp().getRequest<Request>());
    // The auth guard runs first; a marked route never runs anonymously.
    if (!user) return false;
    await this.access.assertProduct(user.userId, product);
    return true;
  }
}

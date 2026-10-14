import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { setPrincipal } from '../../auth/decorators.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AccessService } from './access.service.js';
import { ProductAccessGuard, RequiresProduct } from './requires-product.js';

// A future Sell endpoint and an ordinary one (Sell isn't built - these exist only in this test).
class SellController {
  @RequiresProduct('sell')
  createListing() {}

  listHunts() {}
}

function contextFor(handler: () => void, principal: { userId: string } | null): ExecutionContext {
  const req = {};
  if (principal) setPrincipal(req as never, principal as never);
  return {
    getHandler: () => handler,
    getClass: () => SellController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ProductAccessGuard (@RequiresProduct, decision 0018)', () => {
  const allowed = { assertProduct: vi.fn(async () => undefined) } as unknown as AccessService;
  const denied = {
    assertProduct: vi.fn(async () => {
      throw new AppException('PRODUCT_NOT_INCLUDED', "Your current access doesn't include Rein Drop Sell.", 403);
    }),
  } as unknown as AccessService;

  it('routes without @RequiresProduct are untouched (no access lookup)', async () => {
    const guard = new ProductAccessGuard(new Reflector(), denied);
    await expect(guard.canActivate(contextFor(SellController.prototype.listHunts, { userId: 'u1' }))).resolves.toBe(true);
    expect(denied.assertProduct).not.toHaveBeenCalled();
  });

  it('a Sell route runs only for an account with Sell; otherwise 403 PRODUCT_NOT_INCLUDED', async () => {
    await expect(new ProductAccessGuard(new Reflector(), allowed).canActivate(contextFor(SellController.prototype.createListing, { userId: 'u1' }))).resolves.toBe(true);
    expect(allowed.assertProduct).toHaveBeenCalledWith('u1', 'sell');
    await expect(new ProductAccessGuard(new Reflector(), denied).canActivate(contextFor(SellController.prototype.createListing, { userId: 'u2' }))).rejects.toMatchObject({ code: 'PRODUCT_NOT_INCLUDED' });
  });

  it('never runs a product route anonymously', async () => {
    await expect(new ProductAccessGuard(new Reflector(), allowed).canActivate(contextFor(SellController.prototype.createListing, null))).resolves.toBe(false);
  });
});

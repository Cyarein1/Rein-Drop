import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import {
  saveSellerSnapshotRequestSchema,
  updateSellerSnapshotRequestSchema,
  type SellerSnapshot,
} from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { SellerSnapshotService } from './seller-snapshot.service.js';

class UpdateSellerSnapshotDto extends createZodDto(updateSellerSnapshotRequestSchema) {}
class SaveSellerSnapshotDto extends createZodDto(saveSellerSnapshotRequestSchema) {}

/** The current user's Seller Snapshot. Protected by the global AuthGuard. */
@Controller('me/seller-snapshot')
export class SellerSnapshotController {
  constructor(private readonly snapshots: SellerSnapshotService) {}

  @Get()
  get(@CurrentUser() user: Principal): Promise<SellerSnapshot> {
    return this.snapshots.get(user.userId);
  }

  /** Save one or more answers (progressive onboarding). */
  @Patch()
  update(@CurrentUser() user: Principal, @Body() body: UpdateSellerSnapshotDto): Promise<SellerSnapshot> {
    return this.snapshots.update(user.userId, body);
  }

  /** Save all five answers at once. */
  @Put()
  save(@CurrentUser() user: Principal, @Body() body: SaveSellerSnapshotDto): Promise<SellerSnapshot> {
    return this.snapshots.save(user.userId, body);
  }
}

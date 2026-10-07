import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createHuntRequestSchema,
  idSchema,
  listHuntsQuerySchema,
  updateHuntRequestSchema,
  type Hunt,
  type HuntEvent,
  type Page,
} from '@rein-drop/contracts';
import { z } from 'zod';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { HuntsService } from './hunts.service.js';

class CreateHuntDto extends createZodDto(createHuntRequestSchema) {}
class UpdateHuntDto extends createZodDto(updateHuntRequestSchema) {}
class ListHuntsQueryDto extends createZodDto(listHuntsQuerySchema.extend({ cursor: idSchema.optional() })) {}
class HuntIdParams extends createZodDto(z.object({ id: idSchema })) {}

/**
 * The current user's hunts. Protected by the global AuthGuard. There is no DELETE:
 * hunts are archived, never removed.
 */
@Controller('hunts')
export class HuntsController {
  constructor(private readonly hunts: HuntsService) {}

  @Get()
  list(@CurrentUser() user: Principal, @Query() query: ListHuntsQueryDto): Promise<Page<Hunt>> {
    return this.hunts.list(user.userId, query);
  }

  /** Creates a DRAFT hunt (201). */
  @Post()
  create(@CurrentUser() user: Principal, @Body() body: CreateHuntDto): Promise<Hunt> {
    return this.hunts.create(user.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: Principal, @Param() params: HuntIdParams): Promise<Hunt> {
    return this.hunts.get(user.userId, params.id);
  }

  /** Edit criteria; identity and history are preserved. */
  @Patch(':id')
  update(@CurrentUser() user: Principal, @Param() params: HuntIdParams, @Body() body: UpdateHuntDto): Promise<Hunt> {
    return this.hunts.update(user.userId, params.id, body);
  }

  @Get(':id/events')
  async events(@CurrentUser() user: Principal, @Param() params: HuntIdParams): Promise<{ items: HuntEvent[] }> {
    return { items: await this.hunts.events(user.userId, params.id) };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@CurrentUser() user: Principal, @Param() params: HuntIdParams): Promise<Hunt> {
    return this.hunts.transition(user.userId, params.id, 'activate');
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@CurrentUser() user: Principal, @Param() params: HuntIdParams): Promise<Hunt> {
    return this.hunts.transition(user.userId, params.id, 'pause');
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@CurrentUser() user: Principal, @Param() params: HuntIdParams): Promise<Hunt> {
    return this.hunts.transition(user.userId, params.id, 'resume');
  }

  /** Archive (records are kept). */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@CurrentUser() user: Principal, @Param() params: HuntIdParams): Promise<Hunt> {
    return this.hunts.transition(user.userId, params.id, 'archive');
  }

  /** Restore an archived hunt to DRAFT or PAUSED (never straight to LIVE). */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() user: Principal, @Param() params: HuntIdParams): Promise<Hunt> {
    return this.hunts.transition(user.userId, params.id, 'restore');
  }
}

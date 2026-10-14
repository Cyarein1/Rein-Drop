import { Inject, Injectable } from '@nestjs/common';
import type { UpdateUserAreaRequest, UserArea } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { roundPoint } from '@rein-drop/geo';
import { PRISMA } from '../../database/database.module.js';
import { GeoService } from './geo.service.js';

const AREA_SELECT = { areaLabel: true, areaLat: true, areaLng: true, areaPostalCode: true, areaUpdatedAt: true, countryCode: true } as const;

type AreaRow = { areaLabel: string | null; areaLat: number | null; areaLng: number | null; areaPostalCode: string | null; areaUpdatedAt: Date | null };

export function toUserArea(row: AreaRow | null): UserArea | null {
  if (!row?.areaLabel) return null;
  return {
    label: row.areaLabel,
    point: row.areaLat !== null && row.areaLng !== null ? { lat: row.areaLat, lng: row.areaLng } : null,
    postalCode: row.areaPostalCode,
    updatedAt: row.areaUpdatedAt?.toISOString() ?? null,
  };
}

/**
 * "Your area" (decision 0017): a place label + approximate coordinates on the user - never a street
 * address. Points are rounded to ~110 m; a label the geocoder can't place is kept as text.
 */
@Injectable()
export class AreaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly geo: GeoService,
  ) {}

  async get(userId: string): Promise<UserArea | null> {
    return toUserArea(await this.prisma.user.findUnique({ where: { id: userId }, select: AREA_SELECT }));
  }

  async set(userId: string, request: UpdateUserAreaRequest): Promise<UserArea | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { countryCode: true } });
    const point = request.point ? roundPoint(request.point) : await this.geo.place(request.label, user?.countryCode ?? null);
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        areaLabel: request.label,
        areaLat: point?.lat ?? null,
        areaLng: point?.lng ?? null,
        areaPostalCode: request.postalCode,
        areaUpdatedAt: new Date(),
      },
      select: AREA_SELECT,
    });
    return toUserArea(row);
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { areaLabel: null, areaLat: null, areaLng: null, areaPostalCode: null, areaUpdatedAt: new Date() },
    });
  }
}

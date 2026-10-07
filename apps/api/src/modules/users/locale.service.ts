import { Inject, Injectable } from '@nestjs/common';
import {
  DISTANCE_UNITS,
  LOCALE_SOURCES,
  regionDefaults,
  type UpdateUserLocaleRequest,
  type UserLocale,
} from '@rein-drop/contracts';
import type { PrismaClient, User } from '@rein-drop/db';
import { PRISMA } from '../../database/database.module.js';

type LocaleColumns = Pick<User, 'countryCode' | 'currency' | 'distanceUnit' | 'language' | 'regionSource'>;

const LOCALE_SELECT = {
  countryCode: true,
  currency: true,
  distanceUnit: true,
  language: true,
  regionSource: true,
} as const;

const DEFAULT_LANGUAGE = 'en';

/** Locale columns -> contract; null until a locale has been set. */
export function toUserLocale(row: LocaleColumns | null): UserLocale | null {
  if (!row?.countryCode || !row.currency) return null;
  const unit = (DISTANCE_UNITS as readonly string[]).includes(row.distanceUnit ?? '') ? row.distanceUnit : null;
  const source = (LOCALE_SOURCES as readonly string[]).includes(row.regionSource ?? '') ? row.regionSource : null;
  return {
    countryCode: row.countryCode,
    currency: row.currency,
    distanceUnit: (unit ?? regionDefaults(row.countryCode).distanceUnit) as UserLocale['distanceUnit'],
    language: row.language ?? DEFAULT_LANGUAGE,
    source: (source ?? 'detected') as UserLocale['source'],
  };
}

/**
 * The user's locale preferences (country, currency, distance unit, language).
 * Detected values only fill an empty locale; a user's own choice is never overwritten
 * by detection (travelling with a phone must not flip their currency).
 */
@Injectable()
export class LocaleService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<UserLocale | null> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: LOCALE_SELECT });
    return toUserLocale(row);
  }

  async update(userId: string, request: UpdateUserLocaleRequest): Promise<UserLocale | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = toUserLocale(await tx.user.findUnique({ where: { id: userId }, select: LOCALE_SELECT }));
      if (request.source === 'detected' && existing) return existing;

      const defaults = regionDefaults(request.countryCode);
      const row = await tx.user.update({
        where: { id: userId },
        data: {
          countryCode: request.countryCode,
          currency: request.currency ?? defaults.currency,
          distanceUnit: request.distanceUnit ?? defaults.distanceUnit,
          language: request.language ?? existing?.language ?? DEFAULT_LANGUAGE,
          regionSource: request.source,
        },
        select: LOCALE_SELECT,
      });
      return toUserLocale(row);
    });
  }
}

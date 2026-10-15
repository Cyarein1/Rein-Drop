import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaConfig } from '../../config/api-config.js';

/**
 * Listing photo storage (decision 0019). Development: local disk. Production: none until Azure Blob
 * storage exists (TODO(media) - owner provisions the storage account), so uploads are refused there
 * while source-listing photos still work.
 *
 * Photos are served through `GET /media/:key` with a short-lived HMAC signature in the query, so a
 * web <img> and a React Native <Image> can load them without sending credentials. Keys are random
 * (`<uuid>.<ext>`), never user input.
 */
export interface MediaStorage {
  readonly enabled: boolean;
  put(bytes: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
const TYPES: Record<string, string> = Object.fromEntries(Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type]));
const KEY = /^[0-9a-f-]{36}\.(jpg|png|webp|heic)$/;

export function isMediaKey(key: string): boolean {
  return KEY.test(key);
}

class LocalDiskMediaStorage implements MediaStorage {
  readonly enabled = true;
  constructor(private readonly dir: string) {}

  async put(bytes: Buffer, contentType: string): Promise<string> {
    const key = `${randomUUID()}.${EXTENSIONS[contentType] ?? 'jpg'}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, key), bytes);
    return key;
  }

  async get(key: string) {
    if (!isMediaKey(key)) return null;
    try {
      return { bytes: await readFile(path.join(this.dir, key)), contentType: TYPES[key.split('.').pop()!] ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (isMediaKey(key)) await rm(path.join(this.dir, key), { force: true });
  }
}

class NoMediaStorage implements MediaStorage {
  readonly enabled = false;
  put(): Promise<string> {
    return Promise.reject(new Error('Photo storage is not configured'));
  }
  async get() {
    return null;
  }
  async delete() {}
}

export function createMediaStorage(config: MediaConfig): MediaStorage {
  return config.storage === 'local' ? new LocalDiskMediaStorage(path.resolve(config.dir)) : new NoMediaStorage();
}

/** Links stay valid this long; screens re-fetch the listing (and so new links) on focus. */
export const MEDIA_LINK_TTL_S = 60 * 60;

const signature = (key: string, exp: number, secret: string) => createHmac('sha256', secret).update(`${key}.${exp}`).digest('base64url');

/** `/media/<key>?exp=<unix s>&sig=<hmac>` - resolved by clients against their API base URL. */
export function signedMediaPath(key: string, secret: string, nowMs: number, ttlS = MEDIA_LINK_TTL_S): string {
  const exp = Math.floor(nowMs / 1000) + ttlS;
  return `/media/${key}?exp=${exp}&sig=${signature(key, exp, secret)}`;
}

export function verifyMediaSignature(key: string, exp: string | undefined, sig: string | undefined, secret: string, nowMs: number): boolean {
  const expires = Number(exp);
  if (!sig || !Number.isInteger(expires) || expires * 1000 < nowMs) return false;
  const expected = Buffer.from(signature(key, expires, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

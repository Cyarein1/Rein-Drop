import { z } from 'zod';

/** A value that survives JSON round-tripping (what the RawListing `payload` column can store). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.json();

export function isJsonValue(value: unknown): value is JsonValue {
  return jsonValueSchema.safeParse(value).success;
}

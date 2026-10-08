import { z } from 'zod';

/**
 * Converts a task's zod schema into the JSON Schema subset Azure OpenAI structured outputs accept
 * with `strict: true` (Microsoft Learn, "How to use structured outputs", JSON Schema support and
 * limitations):
 * - every object: `additionalProperties: false` and every property listed in `required`;
 * - supported: type, properties, required, additionalProperties, items, enum, anyOf, description,
 *   $ref / $defs - so `oneOf` becomes `anyOf` and `const` becomes a one-value `enum`;
 * - unsupported keywords (minLength, maxLength, pattern, format, minimum, maximum, minItems,
 *   maxItems, ...) are dropped. The zod schema still enforces them afterwards (withValidation).
 */
export type JsonSchema = { [key: string]: unknown };

const KEEP = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'anyOf', 'description', '$ref', '$defs']);

export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, { io: 'output', target: 'draft-2020-12' }) as JsonSchema;
  const root = strict(raw);
  if (root.type !== 'object' || 'anyOf' in root) throw new Error('A structured output schema must have an object at the root');
  return root;
}

function strict(node: unknown): JsonSchema {
  if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error('Unexpected JSON Schema node');
  const source = node as JsonSchema;
  const out: JsonSchema = {};

  const alternatives = [...asArray(source.anyOf), ...asArray(source.oneOf)];
  if (alternatives.length > 0) {
    // Nested unions (nullable discriminated unions) flatten into one anyOf.
    out.anyOf = alternatives.map(strict).flatMap((alt) => (Array.isArray(alt.anyOf) && Object.keys(alt).length === 1 ? (alt.anyOf as JsonSchema[]) : [alt]));
    if (typeof source.description === 'string') out.description = source.description;
    return out;
  }

  for (const [key, value] of Object.entries(source)) {
    if (!KEEP.has(key)) continue;
    if (key === 'properties') {
      out.properties = Object.fromEntries(Object.entries(value as JsonSchema).map(([name, child]) => [name, strict(child)]));
    } else if (key === 'items') {
      out.items = strict(value);
    } else if (key === '$defs') {
      out.$defs = Object.fromEntries(Object.entries(value as JsonSchema).map(([name, child]) => [name, strict(child)]));
    } else if (key !== 'required' && key !== 'additionalProperties') {
      out[key] = value;
    }
  }
  if ('const' in source) out.enum = [source.const];
  if (source.type === 'object') {
    out.properties ??= {};
    out.required = Object.keys(out.properties as JsonSchema);
    out.additionalProperties = false;
  }
  return out;
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

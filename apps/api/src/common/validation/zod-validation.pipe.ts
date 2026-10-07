import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import type { ApiErrorDetail } from '@rein-drop/contracts';
import { z } from 'zod';
import { ValidationFailedException } from '../errors/app.exception.js';


/**
 * Creates a DTO class backed by a zod schema. Use it as the parameter type of
 * `@Body()`, `@Query()` or `@Param()` and the global ZodValidationPipe will
 * validate and replace the value with the parsed output (unknown keys stripped):
 *
 *   const CreateHuntSchema = z.object({ name: z.string().min(1) });
 *   export class CreateHuntDto extends createZodDto(CreateHuntSchema) {}
 *   create(@Body() dto: CreateHuntDto) { ... }
 */
export function createZodDto<S extends z.ZodType>(schema: S) {
  class ZodDto {
    // Plain string key (not a symbol) so DTO class types can be named in emitted .d.ts files.
    static readonly zodSchema = schema;
  }
  return ZodDto as unknown as { new (): z.output<S>; readonly zodSchema: S };
}

function schemaOf(metatype: unknown): z.ZodType | undefined {
  if (typeof metatype !== 'function') return undefined;
  const schema = (metatype as { zodSchema?: unknown }).zodSchema;
  return schema instanceof z.ZodType ? schema : undefined;
}

/** Global pipe: validates any argument whose type was created with createZodDto. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = schemaOf(metadata.metatype);
    if (!schema) return value;

    const result = schema.safeParse(value);
    if (result.success) return result.data;

    const details: ApiErrorDetail[] = result.error.issues.map((issue) => ({
      path: [metadata.type, ...issue.path.map(String)].join('.'),
      message: issue.message,
    }));
    throw new ValidationFailedException(details);
  }
}

import { z } from 'zod';
import { ValidationFailedException } from '../errors/app.exception.js';
import { createZodDto, ZodValidationPipe } from './zod-validation.pipe.js';

class ExampleDto extends createZodDto(z.object({ name: z.string().min(1), count: z.number().int() })) {}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('returns parsed output and strips unknown keys', () => {
    const out = pipe.transform({ name: 'a', count: 1, extra: true }, { type: 'body', metatype: ExampleDto });
    expect(out).toEqual({ name: 'a', count: 1 });
  });

  it('throws VALIDATION_FAILED with a detail per problem', () => {
    try {
      pipe.transform({ name: '', count: 1.5 }, { type: 'body', metatype: ExampleDto });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationFailedException);
      const details = (err as ValidationFailedException).details ?? [];
      expect(details.map((d) => d.path)).toEqual(['body.name', 'body.count']);
    }
  });

  it('passes through arguments without a zod DTO', () => {
    expect(pipe.transform('abc', { type: 'param', metatype: String })).toBe('abc');
    expect(pipe.transform(undefined, { type: 'custom' })).toBeUndefined();
  });
});

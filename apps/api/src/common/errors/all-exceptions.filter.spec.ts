import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@rein-drop/db';
import { AppException, ValidationFailedException } from './app.exception.js';
import { normalize } from './all-exceptions.filter.js';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });
}

describe('normalize (exception -> ApiErrorBody fields)', () => {
  it('keeps AppException code, message and details', () => {
    const err = new ValidationFailedException([{ path: 'body.name', message: 'Required' }]);
    expect(normalize(err)).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: [{ path: 'body.name', message: 'Required' }],
    });
    expect(normalize(new AppException('CONFLICT', 'Taken', HttpStatus.CONFLICT)).code).toBe('CONFLICT');
  });

  it('maps Nest HttpExceptions by status', () => {
    expect(normalize(new NotFoundException('Cannot GET /x'))).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /x',
    });
    expect(normalize(new BadRequestException(['a', 'b'])).message).toBe('a; b');
  });

  it('maps Prisma unique and not-found errors', () => {
    expect(normalize(prismaError('P2002'))).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(normalize(prismaError('P2025'))).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('never exposes details of unexpected errors', () => {
    expect(normalize(new Error('password=hunter2'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(normalize(prismaError('P1001')).message).toBe('Internal server error');
  });
});

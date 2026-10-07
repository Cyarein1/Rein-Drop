import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiErrorDetail } from '@rein-drop/contracts';

/**
 * Throw from any module to return a specific error code. The global
 * exception filter turns it into the standard ApiErrorBody.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message, status);
  }
}

export class ValidationFailedException extends AppException {
  constructor(details: ApiErrorDetail[]) {
    super('VALIDATION_FAILED', 'Request validation failed', HttpStatus.BAD_REQUEST, details);
  }
}

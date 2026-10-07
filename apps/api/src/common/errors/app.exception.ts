import { HttpException, HttpStatus } from '@nestjs/common';
import type { ActivationBlock, ApiErrorCode, ApiErrorDetail } from '@rein-drop/contracts';

/** Structured extras some errors carry in the standard ApiErrorBody. */
export interface AppExceptionExtras {
  activationBlock?: ActivationBlock;
}

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
    readonly extras?: AppExceptionExtras,
  ) {
    super(message, status);
  }
}

export class ValidationFailedException extends AppException {
  constructor(details: ApiErrorDetail[]) {
    super('VALIDATION_FAILED', 'Request validation failed', HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * A hunt cannot go live under the user's plan (or is not ready). The hunt is left as it
 * was - a draft stays a draft (App Flow Blueprint section 14: "preserve draft").
 */
export class ActivationBlockedException extends AppException {
  constructor(block: ActivationBlock, message = 'This hunt cannot go live yet') {
    const details: ApiErrorDetail[] = block.reasons.flatMap((r) =>
      r.code === 'NOT_READY' ? r.problems.map((p) => ({ path: 'body.location', message: p })) : [],
    );
    super('ACTIVATION_BLOCKED', message, HttpStatus.CONFLICT, details.length ? details : undefined, {
      activationBlock: block,
    });
  }
}

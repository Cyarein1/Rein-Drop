import type { ActivationBlock, ApiErrorCode, ApiErrorDetail } from '@rein-drop/contracts';

/**
 * The only error type the client throws.
 * - `status` undefined: the request never got a response (network, timeout,
 *   bad configuration) or failed client-side validation.
 * - `code` set: the API's standard error body, or `VALIDATION_FAILED` from
 *   client-side validation (same `details` format as the server).
 * - `activationBlock` set with code `ACTIVATION_BLOCKED`: why a hunt cannot go live and
 *   what the user can do (pause another hunt / upgrade / edit).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: ApiErrorCode,
    readonly details?: ApiErrorDetail[],
    readonly requestId?: string,
    readonly activationBlock?: ActivationBlock,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

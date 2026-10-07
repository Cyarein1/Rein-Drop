import type { HealthResponse } from '@rein-drop/contracts';

export type { HealthResponse } from '@rein-drop/contracts';

/** Thrown for network failures, timeouts and non-2xx responses. */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status code, or undefined when the request never got a response. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** e.g. http://localhost:4000 - no trailing path. */
  baseUrl: string;
  /** Per-request timeout. Defaults to 10s. */
  timeoutMs?: number;
  /** Override for tests or non-standard runtimes. */
  fetch?: typeof fetch;
}

export interface ApiClient {
  getHealth(): Promise<HealthResponse>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetch ?? globalThis.fetch;

  async function request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      const reason = controller.signal.aborted
        ? `timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      throw new ApiError(`Request to ${path} failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new ApiError(
        `Request to ${path} failed with HTTP ${response.status}`,
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(`Response from ${path} was not valid JSON`, response.status);
    }
  }

  return {
    getHealth: () => request<HealthResponse>('/health'),
  };
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new ApiError('API base URL is not configured');
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ApiError(`API base URL is not a valid URL: "${trimmed}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(`API base URL must use http or https: "${trimmed}"`);
  }
  return trimmed.replace(/\/+$/, '');
}

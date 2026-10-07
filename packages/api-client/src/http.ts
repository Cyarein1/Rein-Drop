import { apiErrorBodySchema, type ApiErrorDetail } from '@rein-drop/contracts';
import type { z } from 'zod';
import { ApiError } from './errors.js';

export interface HttpOptions {
  baseUrl: string;
  timeoutMs: number;
  fetch: typeof fetch;
  /** Extra headers per request (e.g. auth, once decided). */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
}

export interface RequestSpec<T> {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  /** Validates the response body; drift between client and API fails loudly. */
  response: z.ZodType<T>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Non-2xx statuses whose body is still a valid response (e.g. 503 from /ready). */
  acceptStatuses?: readonly number[];
}

export async function send<T>(http: HttpOptions, spec: RequestSpec<T>): Promise<T> {
  const url = `${http.baseUrl}${spec.path}${toQueryString(spec.query)}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(spec.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(http.getHeaders ? await http.getHeaders() : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), http.timeoutMs);
  let response: Response;
  try {
    response = await http.fetch(url, {
      method: spec.method,
      headers,
      body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const reason = controller.signal.aborted
      ? `timed out after ${http.timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    throw new ApiError(`${spec.method} ${spec.path} failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(`${spec.method} ${spec.path} returned a non-JSON response`, response.status);
  }

  if (!response.ok && !spec.acceptStatuses?.includes(response.status)) {
    const error = apiErrorBodySchema.safeParse(body);
    if (error.success) {
      const e = error.data;
      throw new ApiError(e.message, e.statusCode, e.code, e.details, e.requestId);
    }
    throw new ApiError(`${spec.method} ${spec.path} failed with HTTP ${response.status}`, response.status);
  }

  const parsed = spec.response.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      `${spec.method} ${spec.path} returned a response that does not match the contract`,
      response.status,
    );
  }
  return parsed.data;
}

/** Validates a request body/query with its contract schema before anything is sent. */
export function validateInput<S extends z.ZodType>(schema: S, value: unknown, part: 'body' | 'query'): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details: ApiErrorDetail[] = result.error.issues.map((issue) => ({
    path: [part, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
  throw new ApiError('Request validation failed', undefined, 'VALIDATION_FAILED', details);
}

export function normalizeBaseUrl(raw: string): string {
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

function toQueryString(query: RequestSpec<unknown>['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function pathId(id: string): string {
  return encodeURIComponent(id);
}

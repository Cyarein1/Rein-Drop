/** The parts of `fetch` real adapters use (this package has no DOM / Node typings). Injected for tests. */
export interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: unknown }) => Promise<HttpResponse>;

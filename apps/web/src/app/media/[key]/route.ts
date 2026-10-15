import { apiBaseUrl } from "@/auth/provider";

/**
 * Listing photos (decision 0019): the API issues short-lived signed links (`/media/<key>?exp&sig`).
 * The browser loads them from this origin and this route passes the request through to the API,
 * so no public API URL or CORS set-up is needed. The signature is the authorization; invalid or
 * expired links are 404 from the API.
 */
export async function GET(request: Request, { params }: RouteContext<"/media/[key]">) {
  const { key } = await params;
  const search = new URL(request.url).search;
  const upstream = await fetch(`${apiBaseUrl()}/media/${encodeURIComponent(key)}${search}`, { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("Not found", { status: 404 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": upstream.headers.get("cache-control") ?? "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { getServerApiRequest } from "@/auth";

/**
 * Web map tiles in Azure Maps mode (decision 0017): the browser asks this route, the web server
 * asks the API, the API asks Azure Maps with the key - which never reaches the browser.
 * Development (mock geocoder) uses OpenStreetMap tiles directly instead (geo config `tiles: "osm"`).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await params;
  if (![z, x, y].every((v) => /^\d{1,7}$/.test(v))) return new Response(null, { status: 404 });
  const { baseUrl, headers } = await getServerApiRequest();
  const res = await fetch(`${baseUrl}/geo/tiles/${z}/${x}/${y}`, { headers, cache: "no-store" });
  if (!res.ok) return new Response(null, { status: res.status === 429 ? 429 : 404 });
  return new Response(res.body, {
    status: 200,
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=86400" },
  });
}

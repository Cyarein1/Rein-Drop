import { connection } from "next/server";
import { createApiClient } from "@rein-drop/api-client";
import { colors } from "@rein-drop/design-tokens";

/** Server component: checks apps/api reachability on every request. */
export async function ApiStatus() {
  await connection();
  const baseUrl = process.env.API_BASE_URL ?? "";

  const result = await checkHealth(baseUrl);

  if (result.ok) {
    return (
      <p style={{ color: colors.green }}>API reachable ({result.timestamp})</p>
    );
  }
  return (
    <div>
      <p style={{ color: colors.orange }}>API unreachable: {result.message}</p>
      <p style={{ fontSize: 14 }}>
        API_BASE_URL: {baseUrl || "(not set - see apps/web/.env.example)"}.
        Start it with <code>pnpm --filter api dev</code> and refresh.
      </p>
    </div>
  );
}

async function checkHealth(
  baseUrl: string,
): Promise<{ ok: true; timestamp: string } | { ok: false; message: string }> {
  try {
    const health = await createApiClient({ baseUrl, timeoutMs: 3000 }).getHealth();
    return { ok: true, timestamp: health.timestamp };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

import { connection } from "next/server";
import { createApiClient, type ReadinessResponse } from "@rein-drop/api-client";
import { colors } from "@rein-drop/design-tokens";

type StatusResult =
  | { ok: true; timestamp: string; readiness: ReadinessResponse | null }
  | { ok: false; message: string };

/** Server component: checks apps/api liveness (/health) and readiness (/ready) per request. */
export async function ApiStatus() {
  await connection();
  const baseUrl = process.env.API_BASE_URL ?? "";
  const result = await checkApi(baseUrl);

  if (result.ok) {
    const database = result.readiness?.checks.database;
    return (
      <div>
        <p style={{ color: colors.green }}>API reachable ({result.timestamp})</p>
        <p>
          Ready:{" "}
          {result.readiness ? (
            <span
              style={{
                color: result.readiness.status === "ready" ? colors.green : colors.orange,
              }}
            >
              {result.readiness.status} (database {database})
            </span>
          ) : (
            <span style={{ color: colors.orange }}>unknown - /ready did not respond</span>
          )}
        </p>
      </div>
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

async function checkApi(baseUrl: string): Promise<StatusResult> {
  try {
    const client = createApiClient({ baseUrl, timeoutMs: 3000 });
    const health = await client.getHealth();
    const readiness = await client.getReadiness().catch(() => null);
    return { ok: true, timestamp: health.timestamp, readiness };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

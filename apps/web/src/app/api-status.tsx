import { connection } from "next/server";
import { createApiClient, type ReadinessResponse } from "@rein-drop/api-client";
import { Badge, SystemBanner } from "@/components/ui";

type StatusResult =
  | { ok: true; timestamp: string; readiness: ReadinessResponse | null }
  | { ok: false; message: string };

/** Server component: checks apps/api liveness (/health) and readiness (/ready) per request. */
export async function ApiStatus() {
  await connection();
  const baseUrl = process.env.API_BASE_URL ?? "";
  const result = await checkApi(baseUrl);

  if (!result.ok) {
    return (
      <SystemBanner
        tone="error"
        title="API unreachable"
        message={
          <>
            {result.message}. API_BASE_URL: {baseUrl || "(not set - see apps/web/.env.example)"}.
            Start it with <code>pnpm --filter api dev</code> and refresh.
          </>
        }
      />
    );
  }

  const ready = result.readiness?.status === "ready";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge tone="profit">API live</Badge>
        {result.readiness ? (
          <Badge tone={ready ? "profit" : "loss"}>
            {ready ? "Ready" : "Not ready"} · database {result.readiness.checks.database}
          </Badge>
        ) : (
          <Badge tone="neutral">Readiness unknown</Badge>
        )}
      </p>
      {result.readiness && !ready && (
        <SystemBanner
          tone="warning"
          title="Database unavailable"
          message="Start it with pnpm infra:up - the API keeps running meanwhile."
        />
      )}
      <p style={{ fontSize: 14, color: "var(--rd-text-muted)" }}>Checked {result.timestamp}</p>
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

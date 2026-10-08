import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiError, type IngestionDiagnostics, type SourceDiagnostics } from "@rein-drop/api-client";
import { getServerApiClient } from "@/auth";
import { Badge, Card, LoadingState, Metric, Page, SystemBanner } from "@/components/ui";
import { formatCount, formatMs, formatStats, formatUsd, readWindow, share, WINDOWS } from "./format";

export const metadata: Metadata = { title: "Ingestion diagnostics" };

/**
 * DEVELOPMENT ONLY, INTERNAL: ingestion economics and freshness per marketplace source, across
 * every user's Hunts (decision 0011). Not customer analytics - not linked from the app shell.
 */
export default function IngestionDiagnosticsPage({ searchParams }: PageProps<"/dev/diagnostics">) {
  return (
    <Page title="Ingestion diagnostics" description="Internal, development only. Every user's Hunts - never shown to customers.">
      <p>
        <Link href="/dev">← Developer</Link>
      </p>
      <Suspense fallback={<LoadingState label="Aggregating search runs…" />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/dev/diagnostics">["searchParams"] }) {
  const query = readWindow(await searchParams);
  let d: IngestionDiagnostics;
  try {
    d = await (await getServerApiClient()).getIngestionDiagnostics(query);
  } catch (err) {
    const notAvailable = err instanceof ApiError && err.status === 404;
    return (
      <SystemBanner
        tone={notAvailable ? "info" : "error"}
        title={notAvailable ? "Not available" : "Couldn't load diagnostics"}
        message={notAvailable ? "Diagnostics only exist outside production." : err instanceof Error ? err.message : String(err)}
      />
    );
  }

  const columns = [...d.sources, d.total];
  return (
    <div style={{ display: "grid", gap: "var(--rd-space-4, 16px)" }}>
      <WindowPicker d={d} hours={query.since ? null : query.hours} />
      <Answers t={d.total} />
      {d.sources.length === 0 ? (
        <Card>
          <p>No search ran in this window. Start the worker with a LIVE Hunt, or pick a longer window.</p>
        </Card>
      ) : (
        <Card title="Per marketplace / provider">
          <MetricTable columns={columns} />
        </Card>
      )}
      {d.hunts.length > 0 && <HuntCosts d={d} />}
      <Card title="How these are counted">
        <ul style={{ margin: 0, paddingLeft: "1.2em", fontSize: "var(--rd-font-size-sm)" }}>
          <li>Search activity counts runs started in the window; candidates, analyses and alerts are attributed to the run that first produced the match.</li>
          <li>&quot;Returned&quot; and &quot;matched&quot; include repeats (the same listing seen again on the next poll); &quot;new&quot; counts first sightings only.</li>
          <li>Request latency is the slowest source request per run, measured by the worker. Listing age = first seen − posted, only where the source exposes a posting time.</li>
          <li>Cost is what sources report: ~ marks estimates from published pricing; &quot;unknown&quot; means free, quota-based or not reported - never zero. AI cost is shown only when the AI provider reports it (Foundry with FOUNDRY_PRICE_* set).</li>
          <li>Per Hunt-day = known cost ÷ Hunts served ÷ window days. Grouped runs split their cost evenly between their Hunts.</li>
        </ul>
      </Card>
    </div>
  );
}

function WindowPicker({ d, hours }: { d: IngestionDiagnostics; hours: number | null }) {
  return (
    <p style={{ display: "flex", flexWrap: "wrap", gap: "var(--rd-space-3, 12px)", alignItems: "center", margin: 0 }}>
      <span>Window:</span>
      {WINDOWS.map((w) =>
        w.hours === hours ? (
          <strong key={w.hours}>{w.label}</strong>
        ) : (
          <Link key={w.hours} href={`/dev/diagnostics?hours=${w.hours}`}>
            {w.label}
          </Link>
        ),
      )}
      <span style={{ color: "var(--rd-text-muted)", fontSize: "var(--rd-font-size-sm)" }}>
        {d.window.since.replace("T", " ").slice(0, 16)} → {d.window.until.replace("T", " ").slice(0, 16)} UTC ({d.window.hours} h)
      </span>
    </p>
  );
}

/** The three checkpoint questions, from the totals. */
function Answers({ t }: { t: SourceDiagnostics }) {
  const passedMatcher = t.candidates.evaluated - t.candidates.rejected;
  return (
    <div style={{ display: "grid", gap: "var(--rd-space-3, 12px)", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      <Card title="What does one active Hunt cost?">
        <Metric
          label="Source cost per Hunt per day"
          value={formatUsd(t.cost.perHuntDayUsd, t.cost.providerIsEstimate)}
          estimated={t.cost.providerIsEstimate}
          caption={`${formatUsd(t.cost.providerUsd, t.cost.providerIsEstimate)} over ${t.huntsServed} Hunt(s); ${t.cost.runsWithUnknownCost} of ${t.runs.total} run(s) had no known cost. AI cost: ${formatUsd(t.cost.aiUsd)}.`}
        />
      </Card>
      <Card title="How fresh are results?">
        <Metric
          label="Median listing age at discovery"
          value={formatMs(t.listingAge.age.p50Ms)}
          caption={`p95 ${formatMs(t.listingAge.age.p95Ms)}. Measurable for ${t.listingAge.withPostedTime} of ${t.listingAge.discovered} new listing(s) (${share(t.listingAge.withPostedTime, t.listingAge.discovered)}).`}
        />
      </Card>
      <Card title="How much noise is filtered?">
        <Metric
          label="Returned → alerted"
          value={`${formatCount(t.listings.returned)} → ${formatCount(t.alerts)}`}
          caption={`${share(t.listings.new, t.listings.returned)} of results were new; ${share(t.candidates.rejected, t.candidates.evaluated)} of candidate checks rejected (${formatCount(passedMatcher)} passed); ${formatCount(t.analysis.alertEligible)} of ${formatCount(t.analysis.analyzed)} analyzed were alert-worthy.`}
        />
      </Card>
    </div>
  );
}

type Row = [label: string, value: (s: SourceDiagnostics) => ReactNode];
const SECTIONS: [title: string, rows: Row[]][] = [
  [
    "Searches",
    [
      ["Runs (ok / failed / running)", (s) => `${s.runs.total} (${s.runs.succeeded} / ${s.runs.failed} / ${s.runs.running})`],
      ["Requests", (s) => formatCount(s.requests)],
      ["Hunts served", (s) => formatCount(s.huntsServed)],
    ],
  ],
  [
    "Listings",
    [
      ["Returned (incl. repeats)", (s) => formatCount(s.listings.returned)],
      ["New", (s) => `${formatCount(s.listings.new)} (${share(s.listings.new, s.listings.returned)})`],
      ["Updated (seen before)", (s) => formatCount(s.listings.updated)],
      ["Duplicates", (s) => formatCount(s.listings.duplicates)],
      ["Unreadable", (s) => formatCount(s.listings.unreadable)],
    ],
  ],
  [
    "Candidates",
    [
      ["Checked (Hunt × listing)", (s) => formatCount(s.candidates.evaluated)],
      ["Matched (incl. repeats)", (s) => formatCount(s.candidates.matched)],
      ["New candidate matches", (s) => formatCount(s.candidates.newMatches)],
      ["Rejected", (s) => `${formatCount(s.candidates.rejected)} (${share(s.candidates.rejected, s.candidates.evaluated)})`],
      ["Top rejection reasons", (s) => s.candidates.rejectionReasons.slice(0, 3).map((r) => `${r.reason} ${r.count}`).join(", ") || "—"],
    ],
  ],
  [
    "AI analysis",
    [
      ["Analyzed (failed)", (s) => `${formatCount(s.analysis.analyzed)} (${formatCount(s.analysis.failed)})`],
      ["Alert-eligible", (s) => formatCount(s.analysis.alertEligible)],
      ["Providers", (s) => s.analysis.aiProviders.join(", ") || "—"],
      ["Tokens in / out", (s) => (s.analysis.inputTokens === null ? "not reported" : `${formatCount(s.analysis.inputTokens)} / ${formatCount(s.analysis.outputTokens)}`)],
      ["Analysis time", (s) => formatStats(s.analysis.duration)],
    ],
  ],
  ["Alerts", [["Alerts created", (s) => formatCount(s.alerts)]]],
  [
    "Latency",
    [
      ["Source request", (s) => formatStats(s.latency.request)],
      ["Whole run", (s) => formatStats(s.latency.run)],
    ],
  ],
  [
    "Freshness",
    [
      ["New listings (with posted time)", (s) => `${formatCount(s.listingAge.discovered)} (${formatCount(s.listingAge.withPostedTime)})`],
      ["Age at discovery", (s) => formatStats(s.listingAge.age)],
    ],
  ],
  [
    "Cost (USD)",
    [
      ["Source cost", (s) => <CostCell s={s} />],
      ["Per run", (s) => formatUsd(s.cost.perRunUsd, s.cost.providerIsEstimate)],
      ["Per new candidate", (s) => formatUsd(s.cost.perNewMatchUsd, s.cost.providerIsEstimate)],
      ["Per alert", (s) => formatUsd(s.cost.perAlertUsd, s.cost.providerIsEstimate)],
      ["Per Hunt per day", (s) => formatUsd(s.cost.perHuntDayUsd, s.cost.providerIsEstimate)],
      ["AI cost", (s) => formatUsd(s.cost.aiUsd)],
    ],
  ],
];

function CostCell({ s }: { s: SourceDiagnostics }) {
  return (
    <>
      {formatUsd(s.cost.providerUsd, s.cost.providerIsEstimate)} {s.cost.providerIsEstimate && <Badge tone="neutral">estimate</Badge>}
      {s.cost.runsWithUnknownCost > 0 && s.cost.runsWithKnownCost > 0 && <div>{s.cost.runsWithUnknownCost} run(s) unknown</div>}
    </>
  );
}

const cell = { padding: "6px 10px", borderTop: "1px solid var(--rd-neutral-border)", verticalAlign: "top" } as const;

function MetricTable({ columns }: { columns: SourceDiagnostics[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--rd-font-size-sm)" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th scope="col" style={cell}>
              Metric
            </th>
            {columns.map((s) => (
              <th key={`${s.marketplace}|${s.provider}`} scope="col" style={cell}>
                {s.marketplace === "all" ? "Total" : s.marketplace}
                <div style={{ fontWeight: "normal" }}>{s.provider === "all" ? "all sources" : s.provider}</div>
              </th>
            ))}
          </tr>
        </thead>
        {SECTIONS.map(([title, rows]) => (
          <tbody key={title}>
            <tr>
              <th scope="colgroup" colSpan={columns.length + 1} style={{ ...cell, textAlign: "left", background: "var(--rd-neutral-surface-subtle)" }}>
                {title}
              </th>
            </tr>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row" style={{ ...cell, textAlign: "left", fontWeight: "normal" }}>
                  {label}
                </th>
                {columns.map((s) => (
                  <td key={`${s.marketplace}|${s.provider}`} style={cell}>
                    {value(s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function HuntCosts({ d }: { d: IngestionDiagnostics }) {
  return (
    <Card title="Cost per Hunt (most expensive first)">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--rd-font-size-sm)" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              {["Hunt", "Status", "Source", "Runs", "Cost", "Per day"].map((h) => (
                <th key={h} scope="col" style={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.hunts.map((h) => (
              <tr key={`${h.huntId}|${h.marketplace}|${h.provider}`}>
                <td style={cell}>{h.name}</td>
                <td style={cell}>{h.status}</td>
                <td style={cell}>
                  {h.marketplace} · {h.provider}
                </td>
                <td style={cell}>{h.runs}</td>
                <td style={cell}>{formatUsd(h.costUsd)}</td>
                <td style={cell}>{formatUsd(h.perDayUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

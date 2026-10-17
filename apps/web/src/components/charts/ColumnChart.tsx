import { MarkTarget, toneClass, type MarkAction, type MarkTone } from "./Mark";
import { barSpan, domainOf, domId, labelIndexes } from "./scale";
import styles from "./charts.module.css";

export interface ColumnSeries {
  key: string;
  label: string;
  tone: MarkTone;
  /** Per-value tone (e.g. realized profit: green when up, red when down). Overrides `tone`. */
  toneOf?: (amount: number) => MarkTone;
}

export interface ColumnBucket extends MarkAction {
  key: string;
  /** Axis label ("8 Oct"). */
  label: string;
  /** Full range ("8 Oct - 14 Oct") for the pop-up, the accessible name and the table. */
  rangeLabel: string;
  /** One value per series, same order as `series`. */
  values: { amount: number; value: string }[];
}

/**
 * Columns over time, one group per bucket (one or two series, side by side). The whole bucket
 * is the hit target (link or pop-up), so it stays big enough on a phone. Ticks: zero and the nice
 * maximum (and minimum when negative). A table view sits under the plot.
 */
export function ColumnChart({
  id,
  label,
  series,
  buckets,
  formatTick,
}: {
  id: string;
  label: string;
  series: ColumnSeries[];
  buckets: ColumnBucket[];
  formatTick: (n: number) => string;
}) {
  const domain = domainOf(buckets.flatMap((b) => b.values.map((v) => v.amount)));
  const shown = labelIndexes(buckets.length);
  return (
    <figure className={styles.figure} aria-label={label}>
      {series.length > 1 && (
        <ul className={styles.legend} aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className={styles.legendItem}>
              <span className={[styles.swatch, toneClass(s.tone)].join(" ")} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.columnsWrap}>
        <div className={styles.yAxis} aria-hidden="true">
          <span style={{ bottom: "100%" }}>{formatTick(domain.max)}</span>
          {domain.zero > 0 && domain.zero < 100 && <span style={{ bottom: `${domain.zero}%` }}>{formatTick(0)}</span>}
          <span style={{ bottom: "0%" }}>{formatTick(domain.min)}</span>
        </div>
        <div className={styles.plot}>
          <span className={styles.gridline} style={{ bottom: "100%" }} aria-hidden="true" />
          <span className={[styles.gridline, styles.baseline].join(" ")} style={{ bottom: `${domain.zero}%` }} aria-hidden="true" />
          <ol className={styles.columns} aria-label={label}>
            {buckets.map((b, i) => (
              <li key={b.key} className={styles.columnSlot}>
                <MarkTarget
                  id={domId(id, b.key)}
                  action={b}
                  label={`${b.rangeLabel}: ${series.map((s, j) => `${b.values[j]?.value ?? "-"} ${s.label}`).join(", ")}`}
                  className={styles.columnGroup}
                >
                  {series.map((s, j) => {
                    const amount = b.values[j]?.amount ?? 0;
                    const span = barSpan(amount, domain);
                    return (
                      <span key={s.key} className={styles.columnLane} aria-hidden="true">
                        <span
                          className={[styles.columnFill, amount < 0 ? styles.columnNeg : "", toneClass(s.toneOf ? s.toneOf(amount) : s.tone)].join(" ")}
                          style={{ bottom: `${span.start}%`, height: `${span.size}%` }}
                        />
                      </span>
                    );
                  })}
                </MarkTarget>
                <span className={styles.xLabel} aria-hidden="true">
                  {shown.has(i) ? b.label : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <details className={styles.tableView}>
        <summary>Show as table</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key}>
                <th scope="row">{b.rangeLabel}</th>
                {series.map((s, j) => (
                  <td key={s.key}>{b.values[j]?.value ?? "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

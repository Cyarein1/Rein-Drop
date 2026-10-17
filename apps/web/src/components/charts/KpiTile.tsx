import { MarkTarget, type MarkAction } from "./Mark";
import { domId } from "./scale";
import styles from "./charts.module.css";

export type Basis = "Realized" | "Estimated" | "Now" | "Activity";

export interface Kpi extends MarkAction {
  key: string;
  label: string;
  value: string;
  /** Always shown, so no number is ambiguous. */
  basis: Basis;
  /** profit / loss colour only for Realized numbers; estimates stay neutral. */
  tone?: "profit" | "loss" | "neutral";
  caption?: string | null;
}

/** A row of stat tiles; each tile is a link (or pop-up) to the detail behind the number. */
export function KpiTiles({ id, tiles }: { id: string; tiles: Kpi[] }) {
  return (
    <ul className={styles.tiles}>
      {tiles.map((k) => {
        const tone = k.basis === "Realized" && k.tone && k.tone !== "neutral" ? styles[`text_${k.tone}`] : "";
        return (
          <li key={k.key}>
            <MarkTarget id={domId(id, k.key)} action={k} label={[`${k.label} (${k.basis}): ${k.value}`, k.caption].filter(Boolean).join(". ")} className={styles.tile}>
              <span className={styles.tileLabel} aria-hidden="true">
                {k.label}
                <span className={[styles.basis, k.basis === "Estimated" ? styles.basisEstimated : ""].join(" ")}>{k.basis}</span>
              </span>
              <span className={[styles.tileValue, tone].join(" ")} aria-hidden="true">
                {k.value}
              </span>
              {k.caption && (
                <span className={styles.small} aria-hidden="true">
                  {k.caption}
                </span>
              )}
            </MarkTarget>
          </li>
        );
      })}
    </ul>
  );
}

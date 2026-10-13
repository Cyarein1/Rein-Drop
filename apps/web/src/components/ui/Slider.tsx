"use client";

import type { CSSProperties } from "react";
import styles from "./Slider.module.css";

export interface SliderProps {
  /** Accessible name (the visible field label usually stays on the paired input). */
  label: string;
  /** Position 0..max (whole steps). */
  value: number;
  max: number;
  onChange: (position: number) => void;
  /** What a screen reader announces for the position, e.g. "$250.00" or "No limit". */
  valueText: string;
  /** Small labels under the two ends. */
  minLabel?: string;
  maxLabel?: string;
  id?: string;
  className?: string;
}

/**
 * A native range input over whole positions (0..max), styled like the landing demo's slider:
 * orange fill up to the thumb, 24 px thumb, visible focus ring. Keyboard and screen-reader
 * behaviour are the browser's own; `valueText` makes the announced value meaningful.
 */
export function Slider({ label, value, max, onChange, valueText, minLabel, maxLabel, id, className }: SliderProps) {
  const fill = max > 0 ? `${(value / max) * 100}%` : "0%";
  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <input
        id={id}
        type="range"
        className={styles.slider}
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
        style={{ "--fill": fill } as CSSProperties}
      />
      {(minLabel || maxLabel) && (
        <div className={styles.ends} aria-hidden="true">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

"use client";

import { useId } from "react";
import styles from "./ChoiceGroup.module.css";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface BaseProps<T extends string> {
  legend: string;
  options: readonly ChoiceOption<T>[];
  hint?: string;
  error?: string;
  /** Keep the legend for screen readers but hide it visually (when a heading already asks it). */
  hideLegend?: boolean;
}

export type ChoiceGroupProps<T extends string> = BaseProps<T> &
  (
    | { multiple: true; value: readonly T[]; onChange: (value: T[]) => void }
    | { multiple?: false; value: T; onChange: (value: T) => void }
  );

/**
 * Chips backed by native checkboxes (multiple) or radios (single) inside a fieldset,
 * so keyboard and screen-reader behaviour come from the platform.
 */
export function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>) {
  const { legend, options, hint, error, hideLegend } = props;
  const name = useId();
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;

  const isChecked = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const toggle = (v: T) => {
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    } else {
      props.onChange(v);
    }
  };

  return (
    <fieldset
      className={styles.group}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={hideLegend ? styles.legendHidden : styles.legend}>{legend}</legend>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.chip}>
            <input
              className={styles.input}
              type={props.multiple ? "checkbox" : "radio"}
              name={name}
              value={option.value}
              checked={isChecked(option.value)}
              onChange={() => toggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

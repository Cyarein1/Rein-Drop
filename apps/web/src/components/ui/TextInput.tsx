"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import type { TextInputKind } from "@rein-drop/design-tokens";
import styles from "./TextInput.module.css";

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: string;
  kind?: TextInputKind;
  hint?: string;
  /** Validation message; marks the field invalid and is announced. */
  error?: string;
  /** For kind="money": ISO currency code shown as a prefix, e.g. "USD". */
  currency?: string;
}

const INPUT_TYPE: Record<TextInputKind, string> = {
  text: "text",
  email: "email",
  password: "password",
  money: "text",
  search: "search",
};

export function TextInput({
  label,
  kind = "text",
  hint,
  error,
  currency,
  id,
  className,
  ...rest
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const [showPassword, setShowPassword] = useState(false);

  const type = kind === "password" && showPassword ? "text" : INPUT_TYPE[kind];

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={[styles.control, error && styles.invalid].filter(Boolean).join(" ")}>
        {kind === "money" && currency && <span className={styles.adornment}>{currency}</span>}
        <input
          id={inputId}
          type={type}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          inputMode={kind === "money" ? "decimal" : undefined}
          autoComplete={kind === "email" ? "email" : kind === "password" ? "current-password" : undefined}
          spellCheck={kind === "email" || kind === "password" ? false : undefined}
          {...rest}
        />
        {kind === "password" && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

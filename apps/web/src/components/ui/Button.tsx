import type { ButtonHTMLAttributes } from "react";
import type { ButtonVariant } from "@rein-drop/design-tokens";
import { Spinner } from "./LoadingState";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = Rein Orange (one per screen), secondary = outline, text, destructive. */
  variant?: ButtonVariant;
  /** Disables the button and shows a spinner; the label stays for screen readers. */
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], fullWidth && styles.fullWidth, className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      <span>{children}</span>
    </button>
  );
}

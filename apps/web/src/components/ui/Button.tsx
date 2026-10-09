import type { ButtonHTMLAttributes } from "react";
import type { ButtonVariant } from "@rein-drop/design-tokens";
import { Spinner } from "./LoadingState";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = Rein Orange (one per screen), secondary = outline, text, destructive. */
  variant?: ButtonVariant;
  /**
   * Shows a spinner and ignores presses. Uses aria-disabled (not `disabled`) so keyboard and
   * screen-reader focus stays on the button while the action runs.
   */
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
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], fullWidth && styles.fullWidth, className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      // While loading, presses are ignored. No handler is attached when none is needed, so the
      // button still renders from Server Components.
      {...(loading
        ? onClick || type === "submit"
          ? { onClick: (event: { preventDefault(): void }) => event.preventDefault() }
          : {}
        : onClick
          ? { onClick }
          : {})}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      <span>{children}</span>
    </button>
  );
}

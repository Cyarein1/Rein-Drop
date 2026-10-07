import Link from "next/link";
import type { ComponentProps } from "react";
import type { ButtonVariant } from "@rein-drop/design-tokens";
import styles from "./Button.module.css";

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

/** Navigation that looks like a Button. Use for "go somewhere"; use Button for "do something". */
export function ButtonLink({ variant = "primary", fullWidth = false, className, ...rest }: ButtonLinkProps) {
  return (
    <Link
      className={[styles.button, styles.link, styles[variant], fullWidth && styles.fullWidth, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

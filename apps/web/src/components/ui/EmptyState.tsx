import Image from "next/image";
import type { ReactNode } from "react";
import type { MascotToken } from "@rein-drop/design-tokens";
import { mascotAssets } from "@/brand/assets";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Always offer a useful next action - "no dead ends" (App Flow Blueprint, section 1). */
  action?: ReactNode;
  /**
   * Optional illustration zone. Renders the approved asset for the token, or
   * nothing if none is approved yet. Decorative: the text carries the meaning.
   */
  mascot?: MascotToken;
}

const ILLUSTRATION_WIDTH = 160;

export function EmptyState({ title, description, action, mascot }: EmptyStateProps) {
  const asset = mascot ? mascotAssets[mascot] : null;
  return (
    <div className={styles.empty}>
      {asset && (
        <Image
          src={asset}
          alt=""
          width={ILLUSTRATION_WIDTH}
          height={Math.round((asset.height / asset.width) * ILLUSTRATION_WIDTH)}
          className={styles.illustration}
        />
      )}
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

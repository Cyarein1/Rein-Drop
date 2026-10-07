import type { ReactNode } from "react";
import { bannerToneColors, type BannerTone } from "@rein-drop/design-tokens";
import styles from "./SystemBanner.module.css";

export interface SystemBannerProps {
  /** e.g. source degraded -> warning, payment issue -> error, plan limit -> info. */
  tone?: BannerTone;
  title: string;
  message?: ReactNode;
  /** Recovery action - banners should never be a dead end. */
  action?: ReactNode;
}

const TONE_LABEL: Record<BannerTone, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

/** Errors interrupt screen readers (role=alert); everything else is a polite status. */
export function SystemBanner({ tone = "info", title, message, action }: SystemBannerProps) {
  return (
    <div
      className={[styles.banner, styles[bannerToneColors[tone]]].join(" ")}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className={styles.body}>
        <p className={styles.title}>
          <span className="visually-hidden">{TONE_LABEL[tone]}: </span>
          {title}
        </p>
        {message && <div className={styles.message}>{message}</div>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

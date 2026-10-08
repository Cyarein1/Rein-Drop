import Image from "next/image";
import { Hourglass, Lightbulb, Moon, PartyPopper, RefreshCw, Search, Sparkles, TrendingUp, CircleSlash, type LucideIcon } from "lucide-react";
import type { MascotToken } from "@rein-drop/design-tokens";
import { mascotAssets } from "@/brand/assets";
import styles from "./MascotSlot.module.css";

/**
 * The one way product UI shows a mascot: by semantic token, never a file name. Approved art when it
 * exists; otherwise a NEUTRAL placeholder (a plain UI icon in a soft circle - not mascot artwork),
 * tracked in docs/ASSET_TODO.md. Decorative: the surrounding text carries the meaning.
 */
const PLACEHOLDER_ICON: Partial<Record<MascotToken, LucideIcon>> = {
  working: RefreshCw,
  waiting: Hourglass,
  afterHours: Moon,
  suggestion: Lightbulb,
  analysis: Search,
  exceptionalDeal: Sparkles,
  success: PartyPopper,
  profit: TrendingUp,
  cancellation: CircleSlash,
};

export function MascotSlot({ token, size = 72 }: { token: MascotToken; size?: number }) {
  const art = mascotAssets[token];
  if (art) {
    return <Image src={art} alt="" width={size} height={Math.round((art.height / art.width) * size)} className={styles.art} />;
  }
  const Icon = PLACEHOLDER_ICON[token] ?? Sparkles;
  return (
    <span
      className={[styles.placeholder, token === "working" ? styles.spin : ""].join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-asset-todo={token}
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.75} />
    </span>
  );
}

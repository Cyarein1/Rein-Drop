import Image from "next/image";
import { BellRing, Inbox, Repeat2, Settings2 } from "lucide-react";
import { landingImages } from "../landing-assets";
import { ALERT_POINTS, alertsCopy, exampleNotification } from "./alerts-story";
import styles from "./AlertsSection.module.css";

const ICONS = { push: BellRing, inbox: Inbox, choose: Settings2, once: Repeat2 } as const;
const appIcon = landingImages.appIcon;

/**
 * Alerts (Landing 12, spec 09): a phone lock-screen illustration with one Rein Drop notification
 * (role="img" + summary; no clock or "now" - nothing pretends to be live), and the channels the
 * product actually has: push in the app and the in-app inbox, per-type preferences, one alert per
 * deal. No email (not built), no speed promise - plus the honest caveat. Server component.
 */
export function AlertsSection() {
  return (
    <section id="alerts" aria-labelledby="alerts-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.phoneWrap}>
          <div className={styles.phone} role="img" aria-label={exampleNotification.summary}>
            <div className={styles.screen} aria-hidden>
              <span className={styles.notch} />
              <span className={styles.lock}>Illustration</span>
              <div className={styles.notification}>
                {/* Optimized + lazy: a 40 px icon from the 512 px source (Landing 23). */}
                <Image src={appIcon.src} width={40} height={40} sizes="40px" alt="" className={styles.appIcon} />
                <div className={styles.notificationText}>
                  <span className={styles.appName}>{exampleNotification.app}</span>
                  <strong>{exampleNotification.title}</strong>
                  <span>{exampleNotification.body}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>{alertsCopy.eyebrow}</p>
          <h2 id="alerts-heading" className={styles.heading}>
            {alertsCopy.headline}
          </h2>
          <p className={styles.lead}>{alertsCopy.lead}</p>
          <ul className={styles.points}>
            {ALERT_POINTS.map((p) => {
              const Icon = ICONS[p.key];
              return (
                <li key={p.key}>
                  <span className={styles.icon} aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{p.title}</strong>
                    <span className={styles.pointText}>{p.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className={styles.caveat}>{alertsCopy.caveat}</p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import type { NotificationCategory, NotificationChannel, NotificationPreferences } from "@rein-drop/api-client";
import { NOTIFICATION_CHANNELS_NOTE, preferenceSections, withPreference } from "@rein-drop/client-core";
import { savePreference } from "../alerts/actions";
import styles from "./settings.module.css";

/**
 * Notification choices per category and channel. Alerts, insights and marketing are separate
 * sections; marketing is opt-in. Each switch saves on its own (optimistic, rolled back on error).
 */
export function NotificationSettings({ initial }: { initial: NotificationPreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (category: NotificationCategory, channel: NotificationChannel, enabled: boolean) => {
    const before = prefs;
    const key = `${category}:${channel}`;
    setPrefs(withPreference(prefs, category, channel, enabled));
    setSaving(key);
    setStatus(null);
    const result = await savePreference(category, channel, enabled);
    setSaving(null);
    if (!result.ok) {
      setPrefs(before);
      setStatus({ tone: "error", text: `Not saved: ${result.message}` });
      return;
    }
    setPrefs(result.value);
    setStatus({ tone: "ok", text: "Saved" });
  };

  return (
    <div className={styles.prefs}>
      {preferenceSections(prefs).map((section) => (
        <section key={section.group} aria-labelledby={`prefs-${section.group}`} className={styles.prefSection}>
          <h3 id={`prefs-${section.group}`} className={styles.prefHeading}>
            {section.title}
          </h3>
          <p className={styles.muted}>{section.description}</p>
          {section.categories.map((c) => (
            <fieldset key={c.category} className={styles.category}>
              <legend className={styles.categoryTitle}>{c.title}</legend>
              <p className={styles.muted}>{c.description}</p>
              <div className={styles.switches}>
                {c.channels.map((ch) => (
                  <label key={ch.channel} className={styles.switch}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={ch.enabled}
                      disabled={!ch.editable || saving === `${c.category}:${ch.channel}`}
                      onChange={(e) => void toggle(c.category, ch.channel, e.target.checked)}
                    />
                    <span>
                      {ch.label}
                      {!ch.editable && <span className={styles.muted}> (always on)</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      ))}
      <p className={styles.muted}>{NOTIFICATION_CHANNELS_NOTE}</p>
      <p role="status" className={status?.tone === "error" ? styles.error : styles.muted}>
        {status?.text ?? ""}
      </p>
    </div>
  );
}

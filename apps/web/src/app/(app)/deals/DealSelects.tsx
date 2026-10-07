"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MARKETPLACE_LABEL } from "@rein-drop/client-core";
import styles from "./deals.module.css";

/** Hunt + source filters. Changing one updates the URL (the page re-renders on the server). */
export function DealSelects({
  hunts,
  huntId,
  marketplace,
}: {
  hunts: { id: string; name: string }[];
  huntId: string;
  marketplace: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const update = (key: "hunt" | "source", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const text = next.toString();
    router.push(text ? `/deals?${text}` : "/deals");
  };

  return (
    <div className={styles.selects}>
      <label className={styles.select}>
        Hunt
        <select value={huntId} onChange={(e) => update("hunt", e.target.value)}>
          <option value="">All Hunts</option>
          {hunts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.select}>
        Source
        <select value={marketplace} onChange={(e) => update("source", e.target.value)}>
          <option value="">All sources</option>
          {Object.entries(MARKETPLACE_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

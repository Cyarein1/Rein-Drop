"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MapPin } from "lucide-react";
import type { GeoPlace, UserArea } from "@rein-drop/api-client";
import { SUGGEST_DEBOUNCE_MS } from "@rein-drop/client-core";
import { suggestPlaces } from "./actions";
import styles from "./LocationField.module.css";

export interface LocationFieldProps {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  /** The text was typed (the caller drops the old point). */
  onType: (text: string) => void;
  /** A suggestion was chosen. */
  onPick: (place: GeoPlace) => void;
  error?: string;
  /** False when no geocoder is configured: a plain text field. */
  suggestions: boolean;
  /** "Use my area" when the profile has one. */
  area?: UserArea | null;
  onUseArea?: (area: UserArea) => void;
  className?: string;
}

/**
 * Location with suggestions while typing (decision 0017) - the WAI-ARIA combobox pattern: arrow
 * keys move through the list, Enter picks, Escape closes, the count is announced politely. Typed
 * text is always allowed (the API places it on save). Suggestions come through a server action.
 */
export function LocationField({ label, hint, placeholder, value, onType, onPick, error, suggestions, area, onUseArea, className }: LocationFieldProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const requestRef = useRef(0);

  // Ask for suggestions a moment after the last keystroke; ignore answers to older text.
  useEffect(() => {
    if (!suggestions || query === null) return;
    const ticket = ++requestRef.current;
    const timer = setTimeout(async () => {
      const result = await suggestPlaces(query);
      if (ticket !== requestRef.current) return;
      if (!result.ok) {
        setPlaces([]);
        setOpen(false);
        setStatus(result.message);
        return;
      }
      setPlaces(result.places);
      setActive(-1);
      setOpen(result.places.length > 0);
      setStatus(query.trim().length < 2 ? "" : result.places.length === 0 ? "No matching places - you can keep what you typed" : `${result.places.length} suggestion${result.places.length === 1 ? "" : "s"}, use the arrow keys to choose`);
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, suggestions]);

  const pick = (place: GeoPlace) => {
    requestRef.current += 1;
    onPick(place);
    setOpen(false);
    setPlaces([]);
    setActive(-1);
    setStatus(`${place.label} selected`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || places.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + places.length) % places.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(places[active]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const useAreaShown = area && onUseArea && area.label !== value;

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
      <div className={styles.combo}>
        <div className={[styles.control, error && styles.invalid].filter(Boolean).join(" ")}>
          <MapPin size={18} aria-hidden="true" className={styles.icon} />
          <input
            id={inputId}
            className={styles.input}
            type="text"
            autoComplete="off"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onType(e.target.value);
              setQuery(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onFocus={() => places.length > 0 && setOpen(true)}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
            {...(suggestions
              ? {
                  role: "combobox",
                  "aria-autocomplete": "list" as const,
                  "aria-expanded": open,
                  "aria-controls": listId,
                  "aria-activedescendant": open && active >= 0 ? `${listId}-${active}` : undefined,
                }
              : {})}
          />
        </div>
        {suggestions && (
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className={styles.list} hidden={!open}>
            {places.map((place, i) => (
              <li
                key={`${place.label}-${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={[styles.option, i === active && styles.active].filter(Boolean).join(" ")}
                // Mouse down (not click) so the pick lands before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(place);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <MapPin size={16} aria-hidden="true" />
                <span>{place.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {useAreaShown && (
        <button type="button" className={styles.useArea} onClick={() => onUseArea(area)}>
          Use my area: {area.label}
        </button>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

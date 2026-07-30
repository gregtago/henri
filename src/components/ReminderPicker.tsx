"use client";

import { useMemo, useState } from "react";
import { Icon } from "./Icon";

type Props = {
  value: string | null | undefined;  // ISO timestamp ou null
  onChange: (iso: string | null) => void;
  themeColor?: string;               // optionnel : couleur d'accent (post-it = #92400e)
  /** Relance pour CE rappel : true/false explicite, null = suivre la préférence globale. */
  repeat?: boolean | null;
  onRepeatChange?: (repeat: boolean) => void;
  /** Préférence globale (Préférences → Rappels), utilisée quand repeat vaut null. */
  defaultRepeat?: boolean;
  /** Cadence des relances, pour le libellé (« toutes les 3 h, 3 fois maximum »). */
  repeatLabel?: string;
};

/**
 * Sélecteur de rappel : "Me rappeler à...".
 *
 * Présets : Dans 1h, Dans 3h, Demain matin (9h), Demain soir (18h),
 * Lundi prochain matin, Personnalisé.
 *
 * Le mode personnalisé propose un date+time.
 *
 * Si value === null, rien n'est armé.
 *
 * Quand la relance est active, Henri renotifie tant que la tâche n'est pas
 * passée « Traité » — une notification évacuée n'est donc pas une notification
 * perdue.
 */
export function ReminderPicker({
  value,
  onChange,
  themeColor = "#374151",
  repeat,
  onRepeatChange,
  defaultRepeat = true,
  repeatLabel,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const repeatOn = repeat === null || repeat === undefined ? defaultRepeat : repeat;
  const isPostIt = themeColor === "#92400e";

  const presets = useMemo(() => {
    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const tomorrow9 = (() => {
      const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d;
    })();
    const tomorrow18 = (() => {
      const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d;
    })();
    const nextMonday9 = (() => {
      const d = new Date(now);
      const dow = d.getDay(); // 0 = dimanche
      const daysUntilMonday = ((1 - dow) + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilMonday);
      d.setHours(9, 0, 0, 0);
      return d;
    })();
    return [
      { label: "Dans 1h", iso: in1h.toISOString() },
      { label: "Dans 3h", iso: in3h.toISOString() },
      { label: "Demain 9h", iso: tomorrow9.toISOString() },
      { label: "Demain 18h", iso: tomorrow18.toISOString() },
      { label: "Lundi 9h", iso: nextMonday9.toISOString() },
    ];
  }, []);

  const currentLabel = useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(d); target.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((target.getTime() - today.getTime()) / 86400000);
    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (daysDiff === 0) return `Aujourd'hui ${time}`;
    if (daysDiff === 1) return `Demain ${time}`;
    if (daysDiff > 1 && daysDiff < 7) return `${d.toLocaleDateString("fr-FR", { weekday: "long" })} ${time}`;
    return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${time}`;
  }, [value]);

  return (
    <div>
      <p style={{ fontSize: "10px", fontWeight: 700, color: themeColor === "#92400e" ? "#92400e" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
        Rappel
      </p>

      {value && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: "8px 12px", background: themeColor === "#92400e" ? "rgba(255,255,255,0.6)" : "#f9fafb", borderRadius: "8px", border: `1px solid ${themeColor === "#92400e" ? "#fde68a" : "#e5e7eb"}` }}>
          <Icon name="time" size={16} style={{ color: themeColor, flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: themeColor === "#92400e" ? "#451a03" : "#111827", flex: 1 }}>{currentLabel}</span>
          <button
            onClick={() => onChange(null)}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", padding: 0, lineHeight: 0 }}
            title="Retirer le rappel"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => onChange(p.iso)}
            style={{
              padding: "6px 12px", borderRadius: "20px",
              border: `1px solid ${themeColor === "#92400e" ? "#fde68a" : "#e5e7eb"}`,
              background: themeColor === "#92400e" ? "rgba(255,255,255,0.7)" : "white",
              color: themeColor === "#92400e" ? "#92400e" : "#374151",
              fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustomOpen(p => !p)}
          style={{
            padding: "6px 12px", borderRadius: "20px",
            border: `1px solid ${themeColor === "#92400e" ? "#fde68a" : "#e5e7eb"}`,
            background: customOpen ? (themeColor === "#92400e" ? "#fde68a" : "#374151") : (themeColor === "#92400e" ? "rgba(255,255,255,0.7)" : "white"),
            color: customOpen ? (themeColor === "#92400e" ? "#451a03" : "white") : (themeColor === "#92400e" ? "#92400e" : "#374151"),
            fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Personnalisé…
        </button>
      </div>

      {onRepeatChange && value && (
        <button
          onClick={() => onRepeatChange(!repeatOn)}
          title={repeatOn
            ? "Henri renotifie tant que la tâche n'est pas traitée"
            : "Une seule notification, à l'heure du rappel"}
          style={{
            marginTop: "10px", width: "100%", display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 10px", borderRadius: "8px", cursor: "pointer", textAlign: "left",
            border: `1px solid ${isPostIt ? "#fde68a" : "#e5e7eb"}`,
            background: repeatOn
              ? (isPostIt ? "rgba(255,255,255,0.7)" : "#f9fafb")
              : "transparent",
            fontFamily: "inherit",
          }}
        >
          <span
            style={{
              position: "relative", width: 32, height: 18, borderRadius: 9, flexShrink: 0,
              background: repeatOn ? (isPostIt ? "#92400e" : "#374151") : "#d1d5db",
              transition: "background 0.15s",
            }}
          >
            <span style={{
              position: "absolute", top: 3, left: repeatOn ? 17 : 3, width: 12, height: 12,
              background: "white", borderRadius: "50%", transition: "left 0.15s", display: "block",
            }} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "12px", color: isPostIt ? "#451a03" : "#374151" }}>
              Relancer tant que ce n'est pas fait
            </span>
            <span style={{ display: "block", fontSize: "10.5px", color: isPostIt ? "#92400e" : "#9ca3af", marginTop: "1px" }}>
              {repeatOn
                ? `Nouvelle notification ${repeatLabel ?? "toutes les 3 h"}`
                : "Une seule notification"}
            </span>
          </span>
        </button>
      )}

      {customOpen && (
        <div style={{ marginTop: "10px", display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="datetime-local"
            defaultValue={value ? value.slice(0, 16) : ""}
            onChange={e => {
              if (!e.target.value) return;
              const d = new Date(e.target.value);
              if (Number.isNaN(d.getTime())) return;
              onChange(d.toISOString());
            }}
            style={{
              flex: 1, fontSize: "13px",
              border: `1px solid ${themeColor === "#92400e" ? "#fde68a" : "#e5e7eb"}`,
              borderRadius: "8px", padding: "8px 10px",
              outline: "none", fontFamily: "inherit",
              background: themeColor === "#92400e" ? "rgba(255,255,255,0.85)" : "#f9fafb",
              color: themeColor === "#92400e" ? "#451a03" : "#374151",
            }}
          />
        </div>
      )}
    </div>
  );
}

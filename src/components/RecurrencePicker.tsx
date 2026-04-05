"use client";

import { useState } from "react";
import type { Recurrence, RecurrenceFrequency } from "@/lib/types";
import { formatRecurrence } from "@/lib/recurrence";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAYS_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

interface Props {
  value: Recurrence | null;
  onChange: (r: Recurrence | null) => void;
}

const DEFAULT_RECURRENCE: Recurrence = {
  frequency: "weekly",
  interval: 1,
  dayOfWeek: 1, // lundi par défaut
};

export function RecurrencePicker({ value, onChange }: Props) {
  const r = value ?? DEFAULT_RECURRENCE;

  const update = (patch: Partial<Recurrence>) => onChange({ ...r, ...patch });

  const sel = "font-[inherit] text-[12.5px] text-tx bg-bg-subtle border border-border rounded px-2 py-1 outline-none cursor-pointer hover:border-border-strong transition-colors";
  const numInput = "font-[inherit] text-[12.5px] text-tx bg-bg-subtle border border-border rounded px-2 py-1 w-14 outline-none text-center";

  return (
    <div className="space-y-3">
      {/* Activation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value ? null : DEFAULT_RECURRENCE)}
          style={{
            background: value ? "var(--accent)" : "var(--border-strong)",
            position: "relative", width: 36, height: 20, borderRadius: 10,
            cursor: "pointer", border: "none", flexShrink: 0, transition: "background 0.2s"
          }}
        >
          <span style={{
            position: "absolute", top: 2, left: value ? 18 : 2,
            width: 16, height: 16, background: "white", borderRadius: "50%",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s", display: "block"
          }} />
        </button>
        <span className="text-[12.5px] text-tx-2">Récurrence</span>
        {value && (
          <span className="text-[11px] text-tx-3 italic">{formatRecurrence(value)}</span>
        )}
      </div>

      {value && (
        <div className="pl-1 space-y-2 border-l-2 border-border ml-1 pl-4">

          {/* Fréquence */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-tx-3">Tous les</span>
            <input
              type="number"
              min={1}
              max={99}
              value={r.interval}
              onChange={e => update({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
              className={numInput}
            />
            <select
              value={r.frequency}
              onChange={e => {
                const freq = e.target.value as RecurrenceFrequency;
                // Reset des champs dépendants
                if (freq === "daily") update({ frequency: freq, interval: r.interval });
                else if (freq === "weekly") update({ frequency: freq, interval: r.interval, dayOfWeek: r.dayOfWeek ?? 1 });
                else update({ frequency: freq, interval: r.interval, monthlyMode: "dayOfWeek", dayOfWeek: r.dayOfWeek ?? 1, weekOfMonth: r.weekOfMonth ?? 1 });
              }}
              className={sel}
            >
              <option value="daily">{r.interval === 1 ? "jour" : "jours"}</option>
              <option value="weekly">{r.interval === 1 ? "semaine" : "semaines"}</option>
              <option value="monthly">{r.interval === 1 ? "mois" : "mois"}</option>
            </select>
          </div>

          {/* Options hebdo : quel jour */}
          {r.frequency === "weekly" && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-tx-3">Le</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update({ dayOfWeek: d as Recurrence["dayOfWeek"] })}
                    className={`text-[11px] w-8 h-7 rounded border cursor-pointer font-[inherit] transition-all ${
                      r.dayOfWeek === d
                        ? "bg-tx text-bg border-tx"
                        : "bg-bg-subtle border-border text-tx-2 hover:border-border-strong"
                    }`}
                  >
                    {DAYS_SHORT[d].slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options mensuelles */}
          {r.frequency === "monthly" && (
            <div className="space-y-2">
              {/* Mode */}
              <div className="flex gap-2">
                {(["dayOfWeek", "dayOfMonth"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update({ monthlyMode: mode })}
                    className={`text-[11.5px] px-3 py-1 rounded border cursor-pointer font-[inherit] transition-all ${
                      (r.monthlyMode ?? "dayOfWeek") === mode
                        ? "bg-tx text-bg border-tx"
                        : "bg-bg-subtle border-border text-tx-2 hover:border-border-strong"
                    }`}
                  >
                    {mode === "dayOfWeek" ? "Jour nommé" : "Jour fixe"}
                  </button>
                ))}
              </div>

              {/* Jour fixe du mois */}
              {r.monthlyMode === "dayOfMonth" && (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-tx-3">Le</span>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={r.dayOfMonth ?? 1}
                    onChange={e => update({ dayOfMonth: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })}
                    className={numInput}
                  />
                  <span className="text-[12px] text-tx-3">du mois</span>
                  <button
                    type="button"
                    onClick={() => update({ dayOfMonth: -1 })}
                    className={`text-[11px] px-2 py-1 rounded border cursor-pointer font-[inherit] transition-all ${
                      r.dayOfMonth === -1
                        ? "bg-tx text-bg border-tx"
                        : "bg-bg-subtle border-border text-tx-2 hover:border-border-strong"
                    }`}
                  >
                    Dernier jour
                  </button>
                </div>
              )}

              {/* Jour nommé */}
              {(r.monthlyMode === "dayOfWeek" || !r.monthlyMode) && (
                <div className="space-y-2">
                  {/* Quelle semaine */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] text-tx-3">Le</span>
                    <div className="flex gap-1">
                      {([1, 2, 3, 4, -1] as const).map(w => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => update({ weekOfMonth: w })}
                          className={`text-[11px] px-2 h-7 rounded border cursor-pointer font-[inherit] transition-all ${
                            (r.weekOfMonth ?? 1) === w
                              ? "bg-tx text-bg border-tx"
                              : "bg-bg-subtle border-border text-tx-2 hover:border-border-strong"
                          }`}
                        >
                          {w === -1 ? "Dernier" : `${w}${w === 1 ? "er" : "ème"}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quel jour de semaine */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5, 6, 0].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => update({ dayOfWeek: d as Recurrence["dayOfWeek"] })}
                          className={`text-[11px] w-8 h-7 rounded border cursor-pointer font-[inherit] transition-all ${
                            r.dayOfWeek === d
                              ? "bg-tx text-bg border-tx"
                              : "bg-bg-subtle border-border text-tx-2 hover:border-border-strong"
                          }`}
                        >
                          {DAYS_SHORT[d].slice(0, 3)}
                        </button>
                      ))}
                    </div>
                    <span className="text-[12px] text-tx-3">du mois</span>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

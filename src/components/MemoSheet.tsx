"use client";

// Le formulaire de **création** d'un mémo, sur mobile.
//
// Un mémo naît avec ses paramètres — échéance, rappel, dossier, tâche,
// répétition — parce que les régler après coup suppose de retrouver ce qu'on
// vient de créer.
//
// Il ne sert qu'à la création : un mémo qui existe s'ouvre dans le panneau de
// détail, celui-là même qui ouvre une tâche. C'est le même objet à un
// interrupteur près, il n'y a pas de raison qu'il change d'écran.
//
// Pendant mobile de `MemoComposer` (desktop).

import { useEffect, useMemo, useState } from "react";
import type { Case, Item, Recurrence } from "@/lib/types";
import { Icon } from "./Icon";
import { ReminderPicker } from "./ReminderPicker";
import { RecurrencePicker } from "./RecurrencePicker";

export type MemoDraft = {
  title: string;
  starred: boolean;
  caseId: string | null;
  /** Tâche sous laquelle le mémo est posé — null = au niveau du dossier. */
  parentItemId: string | null;
  /** ISO, midi local — null si pas d'échéance. */
  dueDate: string | null;
  reminderAt: string | null;
  reminderRepeat: boolean | null;
  recurrence: Recurrence | null;
  note: string | null;
};

export const emptyMemoDraft = (): MemoDraft => ({
  title: "",
  starred: false,
  caseId: null,
  parentItemId: null,
  dueDate: null,
  reminderAt: null,
  reminderRepeat: null,
  recurrence: null,
  note: null,
});

type Props = {
  initial: MemoDraft;
  cases: Case[];
  /** Toutes les tâches : de quoi poser le mémo sous l'une d'elles. */
  items?: Item[];
  onSubmit: (draft: MemoDraft) => void | Promise<void>;
  onClose: () => void;
  defaultRepeat?: boolean;
  repeatLabel?: string;
};

const LABEL: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, color: "#9ca3af",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px",
};

const FIELD: React.CSSProperties = {
  width: "100%", fontSize: "15px", border: "1px solid #e5e7eb", borderRadius: "12px",
  padding: "12px 16px", outline: "none", fontFamily: "inherit",
  background: "#f9fafb", color: "#111827", boxSizing: "border-box",
};

/** Clé de date locale (JJ) d'une valeur ISO — sans passer par UTC. */
const dayKeyOf = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Une clé de date (AAAA-MM-JJ) → ISO à midi, pour ne jamais glisser d'un jour. */
const noonOf = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
};

const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
};

const nextMonday = () => {
  const date = new Date();
  const add = ((1 - date.getDay()) + 7) % 7 || 7;
  date.setDate(date.getDate() + add);
  date.setHours(12, 0, 0, 0);
  return date;
};

export default function MemoSheet({
  initial,
  cases,
  items = [],
  onSubmit,
  onClose,
  defaultRepeat = true,
  repeatLabel,
}: Props) {
  const [draft, setDraft] = useState<MemoDraft>(initial);
  const [caseSearch, setCaseSearch] = useState("");
  const [showMore, setShowMore] = useState(
    () => Boolean(initial.recurrence) || Boolean(initial.note)
  );
  const [saving, setSaving] = useState(false);

  // Le formulaire est monté une fois par mémo (clé côté appelant) ; cet effet
  // couvre le cas où l'appelant change de mémo sans démonter.
  useEffect(() => { setDraft(initial); }, [initial]);

  const patch = (next: Partial<MemoDraft>) => setDraft((current) => ({ ...current, ...next }));

  const selectedCase = draft.caseId ? cases.find((entry) => entry.id === draft.caseId) ?? null : null;
  const parentItem = draft.parentItemId ? items.find((entry) => entry.id === draft.parentItemId) ?? null : null;
  // Les tâches de premier niveau du dossier : un mémo descend d'un cran, pas de deux.
  const caseTasks = useMemo(
    () => (draft.caseId ? items.filter((entry) => entry.caseId === draft.caseId && !entry.parentItemId) : []),
    [draft.caseId, items]
  );

  const caseMatches = useMemo(() => {
    const needle = caseSearch.trim().toLowerCase();
    if (!needle) return [];
    return cases.filter((entry) => !entry.archived && entry.title.toLowerCase().includes(needle)).slice(0, 8);
  }, [caseSearch, cases]);

  const canSubmit = draft.title.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit({ ...draft, title: draft.title.trim(), note: draft.note?.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  const dueDayKey = dayKeyOf(draft.dueDate);
  const chips = [
    { label: "Aujourd'hui", date: inDays(0) },
    { label: "Demain", date: inDays(1) },
    { label: "Dans 2 j.", date: inDays(2) },
    { label: "Lundi proch.", date: nextMonday() },
    { label: "Dans 1 sem.", date: inDays(7) },
    { label: "Dans 1 mois", date: inDays(30) },
  ].map((chip) => ({ ...chip, key: dayKeyOf(chip.date.toISOString()) }));
  const isCustomDue = !!dueDayKey && !chips.some((chip) => chip.key === dueDayKey);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "white" }}>
      <div style={{
        width: "100%", height: "100%", background: "white",
        padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 24px)",
        display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", boxSizing: "border-box",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "17px", fontWeight: 700, color: "#111827" }}>
            Nouveau mémo
          </p>
          <button onClick={onClose} aria-label="Fermer"
            style={{ width: "32px", height: "32px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f9fafb", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Intitulé + étoile */}
        <div>
          <p style={LABEL}>Intitulé</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => patch({ starred: !draft.starred })}
              aria-pressed={draft.starred}
              title={draft.starred ? "Retirer l'étoile" : "Marquer important"}
              style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0, color: draft.starred ? "#f59e0b" : "#d1d5db" }}>
              <Icon name="star" size={26} filled={draft.starred} strokeWidth={1.75} />
            </button>
            <input
              autoFocus
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Que faut-il faire ?"
              style={{ ...FIELD, fontSize: "16px", fontWeight: 600 }}
            />
          </div>
        </div>

        {/* Échéance */}
        <div>
          <p style={LABEL}>Échéance</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {chips.map(({ label, date, key }) => {
              const on = dueDayKey === key;
              return (
                <button key={label} onClick={() => patch({ dueDate: on ? null : date.toISOString() })}
                  style={{ padding: "8px 14px", borderRadius: "20px", border: on ? "2px solid #111827" : "1px solid #e5e7eb", background: on ? "#111827" : "white", color: on ? "white" : "#374151", fontSize: "13px", fontWeight: on ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                  {label}
                </button>
              );
            })}
            <label style={{ position: "relative", padding: "8px 14px", borderRadius: "20px", border: isCustomDue ? "2px solid #111827" : "1px solid #e5e7eb", background: isCustomDue ? "#111827" : "white", color: isCustomDue ? "white" : "#374151", fontSize: "13px", fontWeight: isCustomDue ? 600 : 400, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <Icon name="calendar" size={14} />
              {isCustomDue && draft.dueDate
                ? new Date(draft.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                : "Autre…"}
              <input type="date" value={dueDayKey}
                onChange={(event) => patch({ dueDate: event.target.value ? noonOf(event.target.value) : null })}
                style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            </label>
            {draft.dueDate && (
              <button onClick={() => patch({ dueDate: null })} aria-label="Retirer l'échéance"
                style={{ padding: "8px 12px", borderRadius: "20px", border: "1px solid #fee2e2", background: "white", color: "#ef4444", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="close" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Rappel */}
        <div>
          <ReminderPicker
            value={draft.reminderAt}
            onChange={(iso) => patch({ reminderAt: iso })}
            repeat={draft.reminderRepeat}
            onRepeatChange={(value) => patch({ reminderRepeat: value })}
            defaultRepeat={defaultRepeat}
            repeatLabel={repeatLabel}
          />
        </div>

        {/* Dossier */}
        <div>
          <p style={LABEL}>
            Dossier <span style={{ fontWeight: 400, textTransform: "none", fontSize: "11px" }}>(optionnel)</span>
          </p>
          {selectedCase ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "12px", background: "#f9fafb" }}>
              <Icon name="folder" size={15} style={{ color: "#6b7280", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: "14px", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedCase.title}
              </span>
              <button onClick={() => { patch({ caseId: null, parentItemId: null }); setCaseSearch(""); }}
                style={{ flexShrink: 0, fontSize: "12px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                Détacher
              </button>
            </div>
          ) : (
            <>
              <input
                value={caseSearch}
                onChange={(event) => setCaseSearch(event.target.value)}
                placeholder="Rechercher un dossier…"
                style={FIELD}
              />
              {caseSearch.trim() && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", overflow: "hidden", maxHeight: "180px", overflowY: "auto", marginTop: "8px" }}>
                  {caseMatches.map((entry) => (
                    <button key={entry.id} onClick={() => { patch({ caseId: entry.id, parentItemId: null }); setCaseSearch(""); }}
                      style={{ width: "100%", padding: "12px 16px", textAlign: "left", background: "white", border: "none", borderBottom: "1px solid #f3f4f6", fontSize: "14px", color: "#111827", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Icon name="folder" size={14} /> {entry.title}
                    </button>
                  ))}
                  {caseMatches.length === 0 && (
                    <p style={{ padding: "12px 16px", fontSize: "13px", color: "#9ca3af" }}>Aucun dossier trouvé</p>
                  )}
                </div>
              )}
              <p style={{ fontSize: "11.5px", color: "#9ca3af", marginTop: "6px", lineHeight: 1.4 }}>
                Sans dossier, un mémo s'efface 7 jours après avoir été réalisé.
              </p>
            </>
          )}
        </div>

        {/* Sous quelle tâche — le mémo descend d'un cran et se range à côté des
          * sous-tâches, où il compte dans l'avancement de la tâche. */}
        {selectedCase && caseTasks.length > 0 && (
          <div>
            <p style={LABEL}>
              Sous la tâche <span style={{ fontWeight: 400, textTransform: "none", fontSize: "11px" }}>(optionnel)</span>
            </p>
            <select
              value={draft.parentItemId ?? ""}
              onChange={(event) => patch({ parentItemId: event.target.value || null })}
              style={FIELD}
              aria-label="Sous quelle tâche"
            >
              <option value="">Au niveau du dossier</option>
              {caseTasks.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.title}</option>
              ))}
            </select>
            {parentItem && (
              <p style={{ fontSize: "11.5px", color: "#9ca3af", marginTop: "6px", lineHeight: 1.4 }}>
                Ce mémo compte dans l'avancement de « {parentItem.title} ».
              </p>
            )}
          </div>
        )}

        {/* Le reste est replié : neuf mémos sur dix n'en ont pas besoin. */}
        {!showMore ? (
          <button onClick={() => setShowMore(true)}
            style={{ alignSelf: "flex-start", fontSize: "13px", color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            ▸ Répétition et observations
          </button>
        ) : (
          <>
            <div>
              <p style={LABEL}>Répétition</p>
              <RecurrencePicker value={draft.recurrence} onChange={(value) => patch({ recurrence: value })} />
            </div>
            <div>
              <p style={LABEL}>Observations</p>
              <textarea
                value={draft.note ?? ""}
                onChange={(event) => patch({ note: event.target.value })}
                rows={3}
                placeholder="Contexte, numéro de téléphone, précision…"
                style={{ ...FIELD, resize: "none" }}
              />
            </div>
          </>
        )}

        {/* Actions */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingTop: "8px" }}>
          <button
            disabled={!canSubmit}
            onClick={() => void submit()}
            style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: canSubmit ? "#111827" : "#e5e7eb", color: canSubmit ? "white" : "#9ca3af", fontSize: "16px", fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            Créer le mémo
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// Le détail d'un mémo, sur desktop.
//
// Un seul composant, parce qu'il n'y a qu'un mémo : celui qu'on ouvre depuis
// Ma journée et celui qu'on ouvre depuis la colonne Tâches d'un dossier sont
// le même objet, et doivent donc offrir exactement les mêmes gestes. Ce fichier
// est le pendant desktop de `MemoSheet` (mobile).
//
// Il rend un fragment — en-tête, corps défilant, barre d'actions — que
// l'appelant place dans sa colonne.

import { useState } from "react";
import type { Case, FloatingTask } from "@/lib/types";
import { formatDateFR } from "@/lib/dates";
import { Icon } from "./Icon";
import { EditableInput } from "./EditableField";
import { ReminderPicker } from "./ReminderPicker";
import { RecurrencePicker } from "./RecurrencePicker";

type Props = {
  task: FloatingTask;
  cases: Case[];
  /** Écriture Firestore : `updateFloatingTask(uid, task.id, patch)`. */
  onPatch: (patch: Partial<FloatingTask>) => void;
  /** Échéance : ajuste aussi le `dateKey` (futur = pas dans la journée en cours). */
  onDueDate: (date: Date | null) => void;
  /** Rattacher / détacher : aucune conversion, le mémo reste un mémo. */
  onAttach: (caseId: string | null) => void;
  /** Cocher / décocher. */
  onToggleDone: () => void;
  onDelete: () => void;
  defaultRepeat?: boolean;
  repeatLabel?: string;
  titleRef?: React.Ref<HTMLInputElement>;
};

export default function MemoDetail({
  task,
  cases,
  onPatch,
  onDueDate,
  onAttach,
  onToggleDone,
  onDelete,
  defaultRepeat = true,
  repeatLabel,
  titleRef,
}: Props) {
  const [caseSearch, setCaseSearch] = useState("");
  const done = !!task.doneAt;
  const attachedCase = task.caseId ? cases.find((entry) => entry.id === task.caseId) ?? null : null;
  const matches = caseSearch.trim()
    ? cases.filter((entry) => entry.title.toLowerCase().includes(caseSearch.toLowerCase()))
    : [];

  return (
    <>
      {/* Header — fond post-it jaune */}
      <div className="finder-header" style={{ background: "#fef9c3", borderBottom: "1px solid #fde68a" }}>
        <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "#92400e" }}>Mémo</span>
        {done && (
          <span className="text-[11px]" style={{ color: "#92400e" }}>Réalisé le {formatDateFR(task.doneAt)}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarColor: "#fde68a transparent" }}>
        {/* Zone post-it : titre + échéance */}
        <div style={{ background: "#fef9c3", borderBottom: "1px solid #fde68a" }} className="px-5 pt-5 pb-4 space-y-4">
          {/* Case à cocher, étoile, titre */}
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleDone}
              className="shrink-0 cursor-pointer flex items-center justify-center transition-all duration-200"
              title={done ? "Marquer à faire" : "Marquer réalisé"}
              style={{
                width: "22px", height: "22px", borderRadius: "6px",
                border: done ? "none" : "2px solid #d6a96b",
                background: done ? "#16a34a" : "rgba(255,255,255,0.7)",
              }}
            >
              {done && <Icon name="check" size={14} className="text-white" strokeWidth={2.5} />}
            </button>
            <button
              onClick={() => onPatch({ starred: !task.starred })}
              className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-all hover:scale-110"
              style={{ color: task.starred ? "#f59e0b" : "#d6a96b" }}
              title={task.starred ? "Retirer l'étoile" : "Marquer important"}
            >
              <Icon name="star" size={26} filled={task.starred} strokeWidth={1.75} />
            </button>
            <EditableInput
              key={task.id}
              ref={titleRef}
              className="block flex-1 min-w-0 font-[inherit] text-[20px] font-semibold text-[#451a03] placeholder:text-[#a16207] outline-none transition-all"
              style={{
                lineHeight: 1.3,
                background: "rgba(255,255,255,0.45)",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                padding: "6px 10px",
                textDecoration: done ? "line-through" : undefined,
              }}
              onFocus={e => {
                e.currentTarget.style.background = "white";
                e.currentTarget.style.borderColor = "#f59e0b";
                e.currentTarget.style.boxShadow = "0 1px 4px rgba(245,158,11,0.15)";
              }}
              onBlurCapture={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.45)";
                e.currentTarget.style.borderColor = "#fde68a";
                e.currentTarget.style.boxShadow = "none";
              }}
              placeholder="Sans titre"
              value={task.title}
              onCommit={next => onPatch({ title: next })}
              onKeyDown={e => {
                if (e.key === "Enter") { e.stopPropagation(); (e.target as HTMLInputElement).blur(); }
              }}
            />
          </div>

          {/* Échéance */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#92400e" }}>Échéance</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(() => {
                const today = new Date(); today.setHours(12, 0, 0, 0);
                const nextMon = (() => { const d = new Date(today); const dow = d.getDay(); const diff = (1 - dow + 7) % 7 || 7; d.setDate(d.getDate() + diff); return d; })();
                const nextMonLabel = "Lun. " + nextMon.getDate() + "/" + (nextMon.getMonth() + 1);
                return [
                  { label: "Aujourd'hui", date: new Date(today) },
                  { label: "Demain", date: new Date(today.getTime() + 86400000) },
                  { label: "Dans 2 j.", date: new Date(today.getTime() + 2 * 86400000) },
                  { label: nextMonLabel, date: nextMon },
                  { label: "Dans 1 sem.", date: new Date(today.getTime() + 7 * 86400000) },
                  { label: "Dans 1 mois", date: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate(), 12) },
                ].map(({ label, date }) => (
                  <button key={label} onClick={() => onDueDate(date)}
                    className="text-[11px] font-[inherit] px-2 py-1 rounded border cursor-pointer transition-colors"
                    style={{ background: "rgba(255,255,255,0.7)", borderColor: "#fde68a", color: "#92400e" }}>
                    {label}
                  </button>
                ));
              })()}
              {task.dueDate && (
                <button onClick={() => onPatch({ dueDate: null })}
                  className="text-[11px] font-[inherit] px-2 py-1 rounded border cursor-pointer transition-colors"
                  style={{ background: "rgba(255,255,255,0.7)", borderColor: "#fca5a5", color: "#dc2626" }}>
                  ✕ Retirer
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={e => { const inp = (e.currentTarget.parentElement?.querySelector("input[type=date]") as any); if (inp?.showPicker) inp.showPicker(); else inp?.focus(); }}
                className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-opacity hover:opacity-70"
                style={{ color: "#92400e" }}
                title="Ouvrir le calendrier"
              ><Icon name="calendar" size={20} /></button>
              <input key={task.id + "-due"} type="date"
                className="font-[inherit] text-[13px] rounded-lg px-3 py-1.5 outline-none flex-1 border"
                style={{ background: "rgba(255,255,255,0.85)", borderColor: "#fde68a", color: "#451a03" }}
                defaultValue={task.dueDate?.slice(0, 10) ?? ""}
                onBlur={e => {
                  if (!e.target.value) { onDueDate(null); return; }
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  if (y < 1900 || y > 2100) return;
                  onDueDate(new Date(y, m - 1, d, 12));
                }} />
            </div>
          </div>

          {/* Rappel push */}
          <ReminderPicker
            value={task.reminderAt}
            onChange={iso => onPatch({ reminderAt: iso, reminderSentAt: null, reminderCount: 0 })}
            themeColor="#92400e"
            repeat={task.reminderRepeat}
            onRepeatChange={v => onPatch({ reminderRepeat: v })}
            defaultRepeat={defaultRepeat}
            repeatLabel={repeatLabel}
          />
        </div>

        {/* Zone blanche : récurrence, rattacher, commentaires */}
        <div className="px-5 py-5 space-y-4">
          {/* Récurrence — hauteur min pour éviter que la section suivante bouge à l'activation */}
          <div style={{ minHeight: "120px" }}>
            <RecurrencePicker value={task.recurrence ?? null} onChange={r => onPatch({ recurrence: r ?? null })} />
          </div>

          {/* Rattachement — le mémo est le même objet, avec ou sans dossier.
            * On le pose, on le retire. */}
          <div>
            <div className="flex items-baseline gap-2 mb-1.5">
              <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">Dossier</p>
              {task.caseId && (
                <button
                  onClick={() => onAttach(null)}
                  className="ml-auto text-[10px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer hover:text-tx transition-colors"
                >Détacher</button>
              )}
            </div>
            {task.caseId && (
              <p className="text-[13px] text-tx mb-2">{attachedCase?.title ?? "Dossier introuvable"}</p>
            )}
            <div className="space-y-1.5">
              <input type="text" placeholder="Rechercher un dossier…"
                value={caseSearch} onChange={e => setCaseSearch(e.target.value)}
                className="font-[inherit] text-[13px] text-tx bg-white border border-border-strong rounded-lg px-3 py-1.5 outline-none w-full focus:border-tx-2 transition-colors placeholder:text-tx-3"
              />
              {caseSearch && (
                <div className="border border-border rounded-lg overflow-hidden max-h-[160px] overflow-y-auto">
                  {matches.length === 0
                    ? <p className="text-[12px] text-tx-3 px-3 py-2">Aucun dossier trouvé</p>
                    : matches.map(c => (
                      <button key={c.id}
                        className="w-full text-left font-[inherit] text-[13px] text-tx px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-bg-subtle transition-colors border-b border-border last:border-0"
                        onClick={() => { onAttach(c.id); setCaseSearch(""); }}>
                        {c.title}
                      </button>
                    ))}
                </div>
              )}
              {!task.caseId && (
                <p className="text-[11px] text-tx-3 leading-snug">
                  Sans dossier, un mémo s'efface 7 jours après avoir été réalisé.
                </p>
              )}
            </div>
          </div>

          {/* Commentaires */}
          <div>
            <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Commentaires</p>
            <textarea
              key={task.id + "-note"}
              className="font-[inherit] text-[13px] text-tx bg-white border border-border-strong rounded-lg px-3 py-2 outline-none w-full resize-none focus:border-tx-2 transition-colors"
              rows={4} placeholder="Ajouter un commentaire…"
              defaultValue={task.note ?? ""}
              onBlur={e => onPatch({ note: e.target.value || null })}
            />
          </div>
        </div>
      </div>

      {/* Barre actions bas — fond blanc pour cohérence avec la zone blanche du détail */}
      <div className="detail-actions-bar" style={{ background: "white" }}>
        <button className="detail-action-btn" onClick={onToggleDone}>
          <Icon name="check" size={14} /> {done ? "Marquer à faire" : "Marquer réalisé"}
        </button>
        <button className="detail-action-btn detail-action-danger" onClick={onDelete}>
          <Icon name="delete" size={14} /> Supprimer
        </button>
      </div>
    </>
  );
}

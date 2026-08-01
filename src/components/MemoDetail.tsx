"use client";

// Le détail d'un mémo, sur desktop.
//
// Un seul composant, parce qu'il n'y a qu'un mémo : celui qu'on ouvre depuis
// Ma journée et celui qu'on ouvre depuis la colonne Tâches d'un dossier sont
// le même objet, et doivent donc offrir exactement les mêmes gestes.
//
// **C'est aussi le même panneau que celui d'une tâche.** Basculer l'interrupteur
// « Mémo » ne doit pas donner l'impression de changer d'application : même
// en-tête, même titre, même ordre de sections, mêmes couleurs. Ce qui change
// tient en trois choses, et c'est précisément ce qu'on veut faire comprendre :
//
// - le mot en haut, « Mémo » au lieu de « Tâche » ;
// - la **case à cocher** est active et les **statuts** sont grisés (sur une
//   tâche, c'est l'inverse) : un mémo s'accomplit d'un geste, une tâche avance
//   par étapes. Les statuts restent affichés, sans quoi on ne verrait pas ce
//   qu'on récupère en éteignant l'interrupteur ;
// - la **récurrence**, qui n'a de sens que pour un mémo.
//
// Tout le reste — échéance, rappel, dossier, tâche parente, commentaires — est
// commun, au même endroit.

import { useState } from "react";
import type { Case, FloatingTask, Item } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { atDueHour, formatDateFR, getDueSuggestions } from "@/lib/dates";
import { Icon } from "./Icon";
import { EditableInput } from "./EditableField";
import { ReminderPicker } from "./ReminderPicker";
import { RecurrencePicker } from "./RecurrencePicker";
import MemoSwitch from "./MemoSwitch";
import { statusBadgeClass } from "./StatusBadge";

type Props = {
  task: FloatingTask;
  cases: Case[];
  /** Toutes les tâches : de quoi poser le mémo sous l'une d'elles. */
  items?: Item[];
  /** Écriture Firestore : `updateFloatingTask(uid, task.id, patch)`. */
  onPatch: (patch: Partial<FloatingTask>) => void;
  /** Échéance : ajuste aussi le `dateKey` (futur = pas dans la journée en cours). */
  onDueDate: (date: Date | null) => void;
  /** Rattacher / détacher : aucune conversion, le mémo reste un mémo. */
  onAttach: (caseId: string | null) => void;
  /** Poser le mémo sous une tâche du dossier, ou le remonter au niveau du dossier. */
  onAttachToItem?: (itemId: string | null) => void;
  /** Éteindre l'interrupteur « Mémo » : l'objet redevient une tâche à statuts. */
  onConvertToTask?: () => void;
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
  items = [],
  onPatch,
  onDueDate,
  onAttach,
  onAttachToItem,
  onConvertToTask,
  onToggleDone,
  onDelete,
  defaultRepeat = true,
  repeatLabel,
  titleRef,
}: Props) {
  const [caseSearch, setCaseSearch] = useState("");
  const done = !!task.doneAt;
  const attachedCase = task.caseId ? cases.find((entry) => entry.id === task.caseId) ?? null : null;
  const parentItem = task.parentItemId ? items.find((entry) => entry.id === task.parentItemId) ?? null : null;
  // Les tâches de premier niveau du dossier : un mémo descend d'un cran, pas de deux.
  const caseTasks = task.caseId
    ? items.filter((entry) => entry.caseId === task.caseId && !entry.parentItemId)
    : [];
  const matches = caseSearch.trim()
    ? cases.filter((entry) => entry.title.toLowerCase().includes(caseSearch.toLowerCase()))
    : [];

  return (
    <>
      {/* En-tête — même bandeau que celui d'une tâche, un mot près. */}
      <div className="finder-header">
        <span className="text-[11px] font-medium text-tx-3 uppercase tracking-widest">Mémo</span>
        {done && <span className="text-[11px] text-tx-3">Réalisé le {formatDateFR(task.doneAt)}</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-0">
        {/* Case à cocher, étoile, titre — la case est ici active : c'est le
          * geste d'un mémo. Sur une tâche, elle est grisée au même endroit. */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={onToggleDone}
            className="shrink-0 cursor-pointer flex items-center justify-center transition-all duration-200"
            title={done ? "Marquer à faire" : "Marquer réalisé"}
            style={{
              width: "22px", height: "22px", borderRadius: "6px",
              border: done ? "none" : "2px solid #9ca3af",
              background: done ? "#16a34a" : "white",
            }}
          >
            {done && <Icon name="check" size={14} className="text-white" strokeWidth={2.5} />}
          </button>
          <button
            onClick={() => onPatch({ starred: !task.starred })}
            className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-all hover:scale-110"
            style={{ color: task.starred ? "#f59e0b" : "#d1d5db" }}
            title={task.starred ? "Retirer l'étoile" : "Marquer important"}
          >
            <Icon name="star" size={26} filled={task.starred} strokeWidth={1.75} />
          </button>
          <EditableInput
            key={task.id}
            ref={titleRef}
            className="detail-title-input"
            style={{ marginBottom: 0, flex: 1, minWidth: 0, textDecoration: done ? "line-through" : undefined }}
            placeholder="Sans titre"
            value={task.title}
            onCommit={next => onPatch({ title: next })}
            onKeyDown={e => {
              if (e.key === "Enter") { e.stopPropagation(); (e.target as HTMLInputElement).blur(); }
            }}
          />
        </div>

        <div className="space-y-4">
          {/* Statuts — grisés, mais là. C'est ce qu'on récupère en éteignant
            * l'interrupteur : un mémo s'accomplit, une tâche avance. */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {STATUSES.map(s => (
              <span
                key={s}
                className={`${statusBadgeClass(s)} text-[13px] px-4 py-1.5 rounded-full`}
                style={{ opacity: 0.25, filter: "grayscale(1)", cursor: "default" }}
                title="Un mémo se coche ; éteignez « Mémo » pour lui rendre ses statuts."
              >
                {s}
              </span>
            ))}
            {onConvertToTask && (
              <MemoSwitch
                on
                disabled={!task.caseId}
                title={task.caseId
                  ? "Éteindre : ce mémo redevient une tâche, avec ses quatre statuts"
                  : "Un mémo sans dossier ne peut pas devenir une tâche : rattachez-le d'abord."}
                onChange={() => onConvertToTask()}
              />
            )}
          </div>

          <div className="border-t border-border" />

          {/* Échéance */}
          <div>
            <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-2">Échéance</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {getDueSuggestions().map(({ label, date }) => (
                <button key={label} onClick={() => onDueDate(date)}
                  className="text-[11px] font-[inherit] px-2 py-1 rounded border border-border bg-bg-subtle text-tx-2 cursor-pointer hover:border-border-strong hover:text-tx transition-colors">
                  {label}
                </button>
              ))}
              {task.dueDate && (
                <button onClick={() => onPatch({ dueDate: null })}
                  className="text-[11px] font-[inherit] px-2 py-1 rounded border border-border bg-bg-subtle text-red-400 cursor-pointer hover:border-red-300 transition-colors">
                  ✕ Retirer
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={e => { const inp = (e.currentTarget.parentElement?.querySelector("input[type=date]") as any); if (inp?.showPicker) inp.showPicker(); else inp?.focus(); }}
                className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none text-tx-3 transition-opacity hover:opacity-70"
                title="Ouvrir le calendrier"
              ><Icon name="calendar" size={20} /></button>
              <input key={task.id + "-due"} type="date"
                className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none flex-1 focus:border-border-strong transition-colors"
                defaultValue={task.dueDate?.slice(0, 10) ?? ""}
                onBlur={e => {
                  if (!e.target.value) { onDueDate(null); return; }
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  if (y < 1900 || y > 2100) return;
                  onDueDate(atDueHour(new Date(y, m - 1, d)));
                }} />
            </div>
          </div>

          {/* Rappel push */}
          <ReminderPicker
            value={task.reminderAt}
            onChange={iso => onPatch({ reminderAt: iso, reminderSentAt: null, reminderCount: 0 })}
            repeat={task.reminderRepeat}
            onRepeatChange={v => onPatch({ reminderRepeat: v })}
            defaultRepeat={defaultRepeat}
            repeatLabel={repeatLabel}
          />

          <div className="border-t border-border" />

          {/* Dossier — le mémo est le même objet, avec ou sans dossier.
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
                className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none w-full focus:border-border-strong transition-colors placeholder:text-tx-3"
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

          {/* Sous quelle tâche — le mémo descend d'un cran et se range à côté
            * des sous-tâches. Il compte alors dans son avancement. */}
          {onAttachToItem && task.caseId && caseTasks.length > 0 && (
            <div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">Sous la tâche</p>
                {parentItem && (
                  <button
                    onClick={() => onAttachToItem(null)}
                    className="ml-auto text-[10px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer hover:text-tx transition-colors"
                  >Remonter au dossier</button>
                )}
              </div>
              <select
                value={task.parentItemId ?? ""}
                onChange={e => onAttachToItem(e.target.value || null)}
                className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none w-full focus:border-border-strong transition-colors"
                aria-label="Sous quelle tâche"
              >
                <option value="">Au niveau du dossier</option>
                {caseTasks.map(entry => (
                  <option key={entry.id} value={entry.id}>{entry.title}</option>
                ))}
              </select>
              {parentItem && (
                <p className="text-[11px] text-tx-3 leading-snug mt-1.5">
                  Ce mémo compte dans l'avancement de « {parentItem.title} » : quand tout ce
                  qu'elle porte est fait, elle se termine.
                </p>
              )}
            </div>
          )}

          <div className="border-t border-border" />

          {/* Répétition — la seule section qu'une tâche n'a pas : elle ne
            * revient pas toute seule, elle se traite une fois. */}
          <div>
            <RecurrencePicker value={task.recurrence ?? null} onChange={r => onPatch({ recurrence: r ?? null })} />
          </div>

          <div className="border-t border-border" />

          {/* Commentaires */}
          <div>
            <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Commentaires</p>
            <textarea
              key={task.id + "-note"}
              className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-2 outline-none w-full resize-none focus:border-border-strong transition-colors"
              rows={4} placeholder="Ajouter un commentaire…"
              defaultValue={task.note ?? ""}
              onBlur={e => onPatch({ note: e.target.value || null })}
            />
          </div>
        </div>
      </div>

      {/* Barre d'actions bas — même bandeau que celui d'une tâche. */}
      <div className="detail-actions-bar">
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

"use client";

// Vue Calendrier — « les deux rives ».
//
// Parti pris : Henri n'a pas de rendez-vous, il a des pièces qui circulent.
// Une grille horaire classique serait vide 90 % du temps. On remplace donc
// les heures par un axe à deux rives :
//   À FAIRE    — ce que je réalise ce jour-là (demandes à faire, relances)
//   J'ATTENDS  — les demandes parties sans réponse, dessinées comme des durées
//   ÉCHÉANCES  — ce qui tombe ce jour-là (échéance, retour attendu, rappel)
//
// La terminologie suit le cycle de vie d'une tâche dans Henri :
// je la crée → je la réalise → j'attends le retour → traité, elle disparaît.
//
// Voir CALENDRIER.md pour le raisonnement complet.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  subscribeCases,
  subscribeItems,
  subscribeFloatingTasks,
  subscribeEvents,
  subscribeMyDaySelections,
  updateItem,
  updateFloatingTask,
  updateItemProgress,
  logStatusEvent,
  addMyDaySelection,
} from "@/lib/firestore";
import type { Case, Event as HenriEvent, FloatingTask, Item, MyDaySelection, Status } from "@/lib/types";
import { getDateKey, formatDateFR } from "@/lib/dates";
import { addDays, type DelaiInfo } from "@/lib/delais";
import {
  buildCalendarModel,
  explainEntry,
  startOfWeek,
  REASON_LABELS,
  type CalendarEntry,
  type CalendarTask,
  type DayCell,
} from "@/lib/calendar";

type Mode = "semaine" | "jour";

const DAY_NAMES = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const RAIL_START_HOUR = 8;
const RAIL_END_HOUR = 19;

// Henri dit toujours d'où vient le chiffre qu'il applique.
const DELAI_SOURCE_LABEL: Record<DelaiInfo["source"], (label: string) => string> = {
  manual: () => "fixé à la main",
  rule: (label) => label,
  default: () => "estimation par défaut",
};

const STATUS_DOT: Record<Status, string> = {
  "Créé": "#d1d5db",
  "Demandé": "#fbbf24",
  "Reçu": "#60a5fa",
  "Traité": "#34d399",
};

const startOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const shortDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

export default function CalendarShell({ user }: { user: User }) {
  const [mode, setMode] = useState<Mode>("semaine");
  const [anchor, setAnchor] = useState<Date>(startOfToday);
  const [today, setToday] = useState<Date>(startOfToday);

  const [cases, setCases] = useState<Case[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [floatingTasks, setFloatingTasks] = useState<FloatingTask[]>([]);
  const [events, setEvents] = useState<HenriEvent[]>([]);
  const [myDaySelections, setMyDaySelections] = useState<MyDaySelection[]>([]);

  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropHour, setDropHour] = useState<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3000);
  }, []);

  // Le jour courant peut changer pendant qu'un onglet reste ouvert la nuit.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = startOfToday();
      setToday((current) => (getDateKey(current) === getDateKey(next) ? current : next));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const uid = user.uid;
    const windowStart = addDays(startOfWeek(new Date()), -35);
    const unsubs = [
      subscribeCases(uid, setCases),
      subscribeItems(uid, setItems),
      subscribeFloatingTasks(uid, setFloatingTasks),
      subscribeEvents(uid, setEvents),
      subscribeMyDaySelections(uid, setMyDaySelections, windowStart),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [user.uid]);

  // Le délai est une donnée de la tâche, pas une préférence d'affichage : il est
  // saisi depuis le panneau détail comme depuis ici, et se propage aux deux vues.
  const setDelaiDays = useCallback(
    async (task: CalendarTask, days: number) => {
      if (task.kind !== "item") return;
      await updateItem(user.uid, task.id, { delaiDays: days });
      showToast(`Délai fixé à ${days} jours.`);
    },
    [user.uid, showToast]
  );

  const days = useMemo(() => {
    if (mode === "jour") return [anchor];
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [mode, anchor]);

  const model = useMemo(
    () =>
      buildCalendarModel({
        days,
        today,
        cases,
        items,
        floatingTasks,
        events,
        myDaySelections,
      }),
    [days, today, cases, items, floatingTasks, events, myDaySelections]
  );

  // ── Navigation ──────────────────────────────────────────────────────────
  const step = useCallback(
    (direction: 1 | -1) => setAnchor((current) => addDays(current, direction * (mode === "jour" ? 1 : 7))),
    [mode]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      else if (event.key.toLowerCase() === "s") setMode("semaine");
      else if (event.key.toLowerCase() === "j") setMode("jour");
      else if (event.key.toLowerCase() === "t") { setAnchor(startOfToday()); }
      else if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  // ── Écritures ───────────────────────────────────────────────────────────
  const scheduleReminder = useCallback(
    async (task: CalendarTask, date: Date, hour: number) => {
      const at = new Date(date);
      at.setHours(hour, 0, 0, 0);
      const payload = { reminderAt: at.toISOString(), reminderSentAt: null };
      if (task.kind === "floating") await updateFloatingTask(user.uid, task.id, payload);
      else await updateItem(user.uid, task.id, payload);
      showToast(`Rappel posé à ${String(hour).padStart(2, "0")}:00`);
    },
    [user.uid, showToast]
  );

  const advanceStatus = useCallback(
    async (task: CalendarTask, next: Status) => {
      if (task.kind === "floating") {
        await updateFloatingTask(user.uid, task.id, { status: next });
      } else {
        await updateItemProgress(user.uid, task.id, next);
        await logStatusEvent(user.uid, task.id, task.status, next);
      }
      showToast(next === "Demandé" ? "Demandé — l'attente démarre." : `Statut : ${next}`);
    },
    [user.uid, showToast]
  );

  const addToMyDay = useCallback(
    async (task: CalendarTask) => {
      if (task.kind === "floating") {
        await updateFloatingTask(user.uid, task.id, { dateKey: getDateKey(today) });
      } else {
        await addMyDaySelection(user.uid, {
          dateKey: getDateKey(today),
          refType: task.level === 3 ? "subitem" : "item",
          refId: task.id,
        });
      }
      showToast("☀ Ajouté à Ma journée.");
    },
    [user.uid, today, showToast]
  );

  // ── Rendu ───────────────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (mode === "jour") {
      return `${DAY_NAMES[anchor.getDay()]} ${anchor.getDate()} ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }
    const start = days[0];
    const end = days[6];
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${start.getDate()} – ${end.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
      : `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  }, [mode, anchor, days]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── HEADER ── */}
      <header className="h-[44px] flex items-center px-4 border-b border-border bg-bg shrink-0 gap-1 z-10">
        <nav className="flex gap-0.5">
          <Link href="/" className="cal-nav">Dossiers</Link>
          <Link href="/my-day" className="cal-nav">Ma journée</Link>
          <span className="cal-nav cal-nav-active">Calendrier</span>
        </nav>

        <div className="flex items-center gap-1 ml-6">
          <button className="cal-step" onClick={() => step(-1)} title="Période précédente (←)" aria-label="Période précédente">
            <Icon name="arrow-left" size={14} />
          </button>
          <button className="cal-step" onClick={() => step(1)} title="Période suivante (→)" aria-label="Période suivante">
            <Icon name="arrow-right" size={14} />
          </button>
          <button className="cal-btn ml-1" onClick={() => setAnchor(startOfToday())} title="Revenir à aujourd'hui (T)">
            Aujourd&apos;hui
          </button>
          <span className="text-[13px] text-tx ml-2 font-medium">{periodLabel}</span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <div className="cal-toggle">
            <button data-on={mode === "semaine"} onClick={() => setMode("semaine")} title="Vue semaine (S)">Semaine</button>
            <button data-on={mode === "jour"} onClick={() => setMode("jour")} title="Vue jour (J)">Jour</button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── LE SAS ── tout ce qui a franchi sa date sans être traité */}
        <aside className="cal-sas">
          <div className="finder-header" style={{ paddingRight: 8 }}>
            <span>En retard</span>
            <span className="text-tx-3">{model.souffrance.length}</span>
          </div>
          <div className="cal-sas-list">
            {model.souffrance.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-tx-3">Rien en retard.</p>
            )}
            {model.souffrance.map((entry) => (
              <EntryChip
                key={entry.key}
                entry={entry}
                variant="sas"
                selected={selected?.key === entry.key}
                dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
                onSelect={() => setSelected(entry)}
                onHover={setHoveredTaskId}
                onDragStart={setDragTaskId}
              />
            ))}
          </div>
        </aside>

        {/* ── LE FLUX ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {mode === "semaine" ? (
            <WeekView
              model={model}
              selected={selected}
              hoveredTaskId={hoveredTaskId}
              onSelect={setSelected}
              onHover={setHoveredTaskId}
              onOpenDay={(date) => { setAnchor(date); setMode("jour"); }}
              onDragStart={setDragTaskId}
            />
          ) : (
            <DayView
              cell={model.days[0]}
              model={model}
              selected={selected}
              hoveredTaskId={hoveredTaskId}
              dropHour={dropHour}
              onSelect={setSelected}
              onHover={setHoveredTaskId}
              onDragStart={setDragTaskId}
              onDropHour={async (hour) => {
                const task = findTask(model.days[0], model.souffrance, dragTaskId);
                setDragTaskId(null);
                setDropHour(null);
                if (task) await scheduleReminder(task, model.days[0].date, hour);
              }}
              onHoverHour={setDropHour}
            />
          )}
        </main>

        {/* ── INSPECTEUR ── */}
        {selected && (
          <Inspector
            entry={selected}
            onClose={() => setSelected(null)}
            onAddToMyDay={() => addToMyDay(selected.task)}
            onAdvance={(status) => advanceStatus(selected.task, status)}
            onDelai={(days) => setDelaiDays(selected.task, days)}
          />
        )}
      </div>

      {toast && <div className="cal-toast">{toast}</div>}
    </div>
  );
}

const findTask = (cell: DayCell, souffrance: CalendarEntry[], taskId: string | null): CalendarTask | null => {
  if (!taskId) return null;
  const pool = [...cell.entrant, ...cell.sortant, ...souffrance];
  return pool.find((entry) => entry.task.id === taskId)?.task ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// VUE SEMAINE
// ─────────────────────────────────────────────────────────────────────────────

type WeekProps = {
  model: ReturnType<typeof buildCalendarModel>;
  selected: CalendarEntry | null;
  hoveredTaskId: string | null;
  onSelect: (entry: CalendarEntry) => void;
  onHover: (taskId: string | null) => void;
  onOpenDay: (date: Date) => void;
  onDragStart: (taskId: string | null) => void;
};

function WeekView({ model, selected, hoveredTaskId, onSelect, onHover, onOpenDay, onDragStart }: WeekProps) {
  const columnIndex = useMemo(() => {
    const map = new Map<string, number>();
    model.days.forEach((cell, index) => map.set(cell.dateKey, index));
    return map;
  }, [model.days]);

  const visibleBars = model.bars.slice(0, 5);
  const hiddenBars = model.bars.length - visibleBars.length;

  return (
    <div className="cal-week">
      {/* En-têtes de jour */}
      <div className="cal-grid cal-head">
        <div className="cal-gutter" />
        {model.days.map((cell) => (
          <button
            key={cell.dateKey}
            className="cal-day-head"
            data-today={cell.isToday}
            data-weekend={cell.isWeekend}
            data-past={cell.isPast}
            onClick={() => onOpenDay(cell.date)}
            title="Ouvrir la vue jour"
          >
            <span className="cal-day-name">{DAY_NAMES[cell.date.getDay()]}</span>
            <span className="cal-day-num">{cell.date.getDate()}</span>
            <span className="cal-load" style={{ opacity: 0.15 + cell.load * 0.85 }} aria-hidden />
          </button>
        ))}
      </div>

      {/* ── À FAIRE ── en tête : c'est ce qu'on regarde en premier le matin.
        * Sur un jour passé, la même bande raconte ce qui a effectivement
        * avancé ce jour-là, et combien on en avait prévu. */}
      <div className="cal-grid cal-band cal-band-out">
        <div className="cal-gutter"><span className="cal-gutter-label">à faire</span></div>
        {model.days.map((cell) => (
          <div key={cell.dateKey} className="cal-cell" data-today={cell.isToday} data-weekend={cell.isWeekend} data-past={cell.isPast}>
            {cell.isPast ? (
              <>
                {cell.fait.slice(0, 5).map((entry) => (
                  <EntryChip
                    key={entry.key}
                    entry={entry}
                    variant="fait"
                    selected={selected?.key === entry.key}
                    dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
                    onSelect={() => onSelect(entry)}
                    onHover={onHover}
                    onDragStart={onDragStart}
                  />
                ))}
                {cell.fait.length > 5 && <span className="cal-more">+{cell.fait.length - 5} autres</span>}
                {cell.myDayCount > 0 && <span className="cal-past-plan">{cell.myDayCount} prévues ce jour-là</span>}
              </>
            ) : (
              cell.sortant.map((entry) => (
                <EntryChip
                  key={entry.key}
                  entry={entry}
                  variant="out"
                  selected={selected?.key === entry.key}
                  dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
                  onSelect={() => onSelect(entry)}
                  onHover={onHover}
                  onDragStart={onDragStart}
                />
              ))
            )}
          </div>
        ))}
      </div>

      {/* ── LA LIGNE D'EAU : les attentes en cours, dessinées comme des durées ── */}
      <div className="cal-water">
        <div className="cal-grid cal-water-bg">
          <div className="cal-gutter"><span className="cal-gutter-label">j'attends</span></div>
          {model.days.map((cell) => (
            <div key={cell.dateKey} className="cal-water-col" data-today={cell.isToday} data-weekend={cell.isWeekend} />
          ))}
        </div>
        <div className="cal-grid cal-bars">
          <div className="cal-gutter" />
          {visibleBars.map((bar) => {
            const startIndex = columnIndex.get(getDateKey(bar.start));
            const endIndex = columnIndex.get(getDateKey(bar.end));
            const from = startIndex ?? 0;
            const to = endIndex ?? model.days.length - 1;
            const clippedStart = Math.max(0, Math.min(from, model.days.length - 1));
            const clippedEnd = Math.max(clippedStart, Math.min(to, model.days.length - 1));
            const late = !!bar.overdueFrom;
            return (
              <div
                key={bar.task.id}
                className="cal-bar"
                data-late={late}
                data-dim={!!hoveredTaskId && hoveredTaskId !== bar.task.id}
                style={{ gridColumn: `${clippedStart + 2} / ${clippedEnd + 3}` }}
                onMouseEnter={() => onHover(bar.task.id)}
                onMouseLeave={() => onHover(null)}
                onClick={() =>
                  onSelect({
                    key: `${bar.task.id}-bar`,
                    task: bar.task,
                    reason: late ? "relance" : "retour",
                    overdue: late,
                  })
                }
                title={`${bar.task.title} — demandé le ${shortDate(bar.start)}, attendu le ${shortDate(bar.task.expectedReturn ?? bar.end)}`}
              >
                {startIndex !== undefined && <span className="cal-bar-cap">▸</span>}
                <span className="cal-bar-title">{bar.task.title}</span>
                <span className="cal-bar-meta">
                  {bar.task.caseTitle ? `${bar.task.caseTitle} · ` : ""}
                  {late ? `en retard depuis le ${shortDate(bar.overdueFrom as Date)}` : `attendu ${shortDate(bar.task.expectedReturn ?? bar.end)}`}
                </span>
                {endIndex !== undefined && !late && <span className="cal-bar-cap">◂</span>}
              </div>
            );
          })}
          {hiddenBars > 0 && (
            <div className="cal-bar-more" style={{ gridColumn: `2 / ${model.days.length + 2}` }}>
              +{hiddenBars} attente{hiddenBars > 1 ? "s" : ""} hors fenêtre
            </div>
          )}
          {model.bars.length === 0 && (
            <div className="cal-bar-more" style={{ gridColumn: `2 / ${model.days.length + 2}` }}>
              Aucune pièce en attente cette semaine.
            </div>
          )}
        </div>
      </div>

      {/* ── ÉCHÉANCES ── ce qui tombe ce jour-là : échéance de tâche ou de
        * dossier, retour attendu d'une pièce, rappel programmé. */}
      <div className="cal-grid cal-band cal-band-in">
        <div className="cal-gutter"><span className="cal-gutter-label">échéances</span></div>
        {model.days.map((cell) => (
          <div key={cell.dateKey} className="cal-cell" data-today={cell.isToday} data-weekend={cell.isWeekend} data-past={cell.isPast}>
            {!cell.isPast && cell.entrant.map((entry) => (
              <EntryChip
                key={entry.key}
                entry={entry}
                variant="in"
                selected={selected?.key === entry.key}
                dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
                onSelect={() => onSelect(entry)}
                onHover={onHover}
                onDragStart={onDragStart}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VUE JOUR
// ─────────────────────────────────────────────────────────────────────────────

type DayProps = {
  cell: DayCell;
  model: ReturnType<typeof buildCalendarModel>;
  selected: CalendarEntry | null;
  hoveredTaskId: string | null;
  dropHour: number | null;
  onSelect: (entry: CalendarEntry) => void;
  onHover: (taskId: string | null) => void;
  onDragStart: (taskId: string | null) => void;
  onDropHour: (hour: number) => void;
  onHoverHour: (hour: number | null) => void;
};

function DayView({
  cell, model, selected, hoveredTaskId, dropHour,
  onSelect, onHover, onDragStart, onDropHour, onHoverHour,
}: DayProps) {
  const hours = Array.from({ length: RAIL_END_HOUR - RAIL_START_HOUR + 1 }, (_, i) => RAIL_START_HOUR + i);

  // Le rail n'accueille que ce qui est réellement horodaté : les rappels.
  const railEntries = cell.entrant.filter((entry) => entry.reason === "rappel");
  const attendu = cell.entrant.filter((entry) => entry.reason !== "rappel");

  // Ce que ça déclenche : une demande faite aujourd'hui revient à telle date.
  // C'est la contrepartie de la bande « à faire ».
  const engagements = cell.sortant
    .filter((entry) => entry.reason === "lancement" || entry.reason === "relance")
    .map((entry) => ({ entry, back: entry.task.dueDate }));

  return (
    <div className="cal-day">
      <div className="cal-day-body">
        {/* Rail horaire — le seul endroit où Henri connaît des heures */}
        <div className="cal-rail">
          <div className="finder-header" style={{ justifyContent: "center", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Rappels
          </div>
          <div className="cal-rail-body">
            {hours.map((hour) => {
              const at = railEntries.filter((entry) => entry.task.reminderAt?.getHours() === hour);
              return (
                <div
                  key={hour}
                  className="cal-rail-slot"
                  data-drop={dropHour === hour}
                  onDragOver={(event) => { event.preventDefault(); onHoverHour(hour); }}
                  onDragLeave={() => onHoverHour(null)}
                  onDrop={(event) => { event.preventDefault(); onDropHour(hour); }}
                >
                  <span className="cal-rail-hour">{String(hour).padStart(2, "0")}</span>
                  <div className="cal-rail-items">
                    {at.map((entry) => (
                      <button
                        key={entry.key}
                        className="cal-rail-chip"
                        onClick={() => onSelect(entry)}
                        onMouseEnter={() => onHover(entry.task.id)}
                        onMouseLeave={() => onHover(null)}
                        title={explainEntry(entry)}
                      >
                        {entry.task.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="cal-rail-hint">Glissez une tâche sur une heure pour poser un rappel.</p>
        </div>

        {/* Trois couloirs */}
        <div className="cal-lanes">
          <Lane
            title="À faire"
            hint="À réaliser aujourd'hui pour tenir l'échéance"
            entries={cell.sortant}
            empty="Rien à faire aujourd'hui."
            variant="out"
            selected={selected}
            hoveredTaskId={hoveredTaskId}
            onSelect={onSelect}
            onHover={onHover}
            onDragStart={onDragStart}
          />
          <Lane
            title="J'attends"
            hint={`${model.bars.length} demande${model.bars.length > 1 ? "s" : ""} sans réponse`}
            entries={model.bars.map((bar) => ({
              key: `${bar.task.id}-wait`,
              task: bar.task,
              reason: bar.overdueFrom ? ("relance" as const) : ("retour" as const),
              overdue: !!bar.overdueFrom,
            }))}
            empty="Aucune demande en attente."
            variant="wait"
            selected={selected}
            hoveredTaskId={hoveredTaskId}
            onSelect={onSelect}
            onHover={onHover}
            onDragStart={onDragStart}
          />
          <Lane
            title="Échéances"
            hint="Ce qui tombe aujourd'hui"
            entries={attendu}
            empty="Aucune échéance aujourd'hui."
            variant="in"
            selected={selected}
            hoveredTaskId={hoveredTaskId}
            onSelect={onSelect}
            onHover={onHover}
            onDragStart={onDragStart}
          />
        </div>
      </div>

      {/* Ce que la journée engage */}
      <div className="cal-engage">
        <span className="cal-engage-label">Ce que ça déclenche</span>
        {engagements.length === 0 && <span className="text-[12px] text-tx-3">Rien à faire aujourd&apos;hui.</span>}
        {engagements.map(({ entry, back }) => (
          <button key={`${entry.key}-engage`} className="cal-engage-chip" onClick={() => onSelect(entry)}>
            <span>{entry.task.title}</span>
            <span className="cal-engage-arrow">→ retour sous {entry.task.delai.days} j</span>
            {back && <span className="cal-engage-due">échéance {shortDate(back)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

type LaneProps = {
  title: string;
  hint: string;
  entries: CalendarEntry[];
  empty: string;
  variant: "in" | "out" | "wait";
  selected: CalendarEntry | null;
  hoveredTaskId: string | null;
  onSelect: (entry: CalendarEntry) => void;
  onHover: (taskId: string | null) => void;
  onDragStart: (taskId: string | null) => void;
};

function Lane({ title, hint, entries, empty, variant, selected, hoveredTaskId, onSelect, onHover, onDragStart }: LaneProps) {
  return (
    <section className="cal-lane" data-variant={variant}>
      <div className="finder-header">
        <span>{title}</span>
        <span className="text-tx-3">{entries.length}</span>
      </div>
      <p className="cal-lane-hint">{hint}</p>
      <div className="cal-lane-list">
        {entries.length === 0 && <p className="px-3 py-3 text-[12px] text-tx-3">{empty}</p>}
        {entries.map((entry) => (
          <EntryChip
            key={entry.key}
            entry={entry}
            variant={variant === "wait" ? "in" : variant}
            large
            selected={selected?.key === entry.key}
            dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
            onSelect={() => onSelect(entry)}
            onHover={onHover}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASTILLES
// ─────────────────────────────────────────────────────────────────────────────

type ChipProps = {
  entry: CalendarEntry;
  variant: "in" | "out" | "sas" | "fait";
  large?: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onHover: (taskId: string | null) => void;
  onDragStart: (taskId: string | null) => void;
};

function EntryChip({ entry, variant, large, selected, dimmed, onSelect, onHover, onDragStart }: ChipProps) {
  const { task, reason, overdue } = entry;
  return (
    <button
      className="cal-chip"
      data-variant={variant}
      data-reason={reason}
      data-overdue={overdue}
      data-memo={task.isMemo}
      data-selected={selected}
      data-dim={dimmed}
      data-large={!!large}
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={() => onDragStart(null)}
      onClick={onSelect}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
      title={explainEntry(entry)}
    >
      <span className="cal-chip-dot" style={{ background: STATUS_DOT[task.status] }} aria-hidden />
      <span className="cal-chip-title">{task.title}</span>
      {task.caseTitle && <span className="cal-chip-case">{task.caseTitle}</span>}
      {reason === "relance" && <span className="cal-chip-tag">relance</span>}
      {reason === "lancement" && <span className="cal-chip-tag">−{task.delai.days} j</span>}
      {task.starred && <span className="cal-chip-star">⭐</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTEUR — la « trace » d'une tâche dans le temps
// ─────────────────────────────────────────────────────────────────────────────

type InspectorProps = {
  entry: CalendarEntry;
  onClose: () => void;
  onAddToMyDay: () => void;
  onAdvance: (status: Status) => void;
  onDelai: (days: number) => void;
};

function Inspector({ entry, onClose, onAddToMyDay, onAdvance, onDelai }: InspectorProps) {
  const { task } = entry;
  const [draftDelai, setDraftDelai] = useState(String(task.delai.days));
  useEffect(() => setDraftDelai(String(task.delai.days)), [task.id, task.delai.days]);

  return (
    <aside className="cal-inspector">
      <div className="finder-header">
        <span>{REASON_LABELS[entry.reason]}</span>
        <button className="cal-icon-btn" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer">
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="cal-inspector-body">
        <h2 className="cal-inspector-title">{task.title}</h2>
        {task.caseTitle && <p className="cal-inspector-case">{task.caseTitle}</p>}

        <p className="cal-inspector-explain">{explainEntry(entry)}</p>

        {/* Un mémo se coche : ni délai de retour, ni cycle de statut à afficher. */}
        {task.isMemo ? (
          <p className="cal-note-hint">
            Mémo — il se coche dans Ma journée. Il apparaît ici le jour de son
            échéance ou de son rappel.
          </p>
        ) : (
        <>
        {/* La trace : les trois dates qui structurent la vie d'une pièce */}
        <p className="cal-section-label">Les dates de cette tâche</p>
        <ol className="cal-trace">
          <li data-done={!!task.launchAt}>
            <span>À faire au plus tard le</span>
            <strong>{task.launchAt ? formatDateFR(task.launchAt) : "—"}</strong>
          </li>
          <li data-done={!!task.requestedAt}>
            <span>Demandé le</span>
            <strong>{task.requestedAt ? formatDateFR(task.requestedAt) : "—"}</strong>
          </li>
          <li data-done={!!task.expectedReturn}>
            <span>Retour attendu</span>
            <strong>{task.expectedReturn ? formatDateFR(task.expectedReturn) : "—"}</strong>
          </li>
          <li data-done={!!task.dueDate}>
            <span>{task.dueFromCase ? "Échéance du dossier" : "Échéance"}</span>
            <strong>{task.dueDate ? formatDateFR(task.dueDate) : "—"}</strong>
          </li>
        </ol>

        <p className="cal-section-label">Délai de retour</p>
        <div className="cal-delai">
          <input
            value={draftDelai}
            inputMode="numeric"
            onChange={(event) => setDraftDelai(event.target.value.replace(/\D/g, ""))}
            onBlur={() => {
              const parsed = Number(draftDelai);
              if (parsed > 0 && parsed !== task.delai.days) onDelai(parsed);
            }}
            aria-label="Délai en jours"
          />
          <span>jours</span>
          <span className="cal-delai-src">{DELAI_SOURCE_LABEL[task.delai.source](task.delai.label)}</span>
        </div>

        <p className="cal-section-label">Statut</p>
        <div className="cal-status-row">
          {(["Créé", "Demandé", "Reçu", "Traité"] as Status[]).map((status) => (
            <button
              key={status}
              className="cal-status-btn"
              data-on={task.status === status}
              onClick={() => onAdvance(status)}
            >
              {status}
            </button>
          ))}
        </div>
        </>
        )}
      </div>

      <div className="cal-inspector-actions">
        <button className="detail-action-btn detail-action-primary" onClick={onAddToMyDay}>☀ Ma journée</button>
        <Link href="/" className="detail-action-btn" style={{ textDecoration: "none" }}>Ouvrir le dossier</Link>
      </div>
    </aside>
  );
}

"use client";

// Vue Calendrier — le planning.
//
// Parti pris : Henri n'a pas de rendez-vous, il a des pièces qui circulent.
// La vue principale est une TIMELINE : une ligne par dossier, dépliable en
// une ligne par tâche, et toute la vie d'une pièce se lit de gauche à droite
// sur sa propre ligne — le lancement (●), l'attente (une barre, hachurée de
// rouge quand le retour est dépassé), l'échéance (◆). La règle « une tâche,
// un seul endroit » devient géométrique.
//   Créé     → ● au jour du lancement, corridor pointillé jusqu'à ◆
//   Demandé  → la barre d'attente
//   Reçu     → la BANNETTE, à gauche (le sas si l'échéance est dépassée)
//   Traité   → disparaît
// Chaque ligne de dossier porte aussi sa date tenable (◇) face à son
// échéance (◆) : « on signe quand ? » se lit dossier par dossier.
// La vue Jour reste la vue de travail du matin (rail des rappels, couloirs).
//
// Voir CALENDRIER.md pour le raisonnement complet.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import DueChips from "@/components/DueChips";
import {
  subscribeCases,
  subscribeItems,
  subscribeFloatingTasks,
  subscribeEvents,
  subscribeMyDaySelections,
  createItem,
  updateItem,
  updateFloatingTask,
  updateItemProgress,
  logStatusEvent,
  addMyDaySelection,
} from "@/lib/firestore";
import type { Case, Event as HenriEvent, FloatingTask, Item, MyDaySelection, Status } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { getDateKey, formatDateFR, atDueHour } from "@/lib/dates";
import { addDays, type DelaiInfo } from "@/lib/delais";
import {
  buildCalendarModel,
  computeTenable,
  explainEntry,
  startOfWeek,
  OPEN_STATUSES,
  REASON_LABELS,
  type CalendarEntry,
  type CalendarTask,
  type DayCell,
  type Tenable,
  type WaitingBar,
} from "@/lib/calendar";

type Mode = "planning" | "jour";

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
  "Créé": "var(--border-strong)",
  "Demandé": "var(--warn-accent)",
  "Reçu": "var(--accent)",
  "Traité": "var(--ok-fg)",
};

const startOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const shortDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

const DAY_MS = 86_400_000;
const startOfDayMs = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
};
/** Nombre de jours écoulés depuis `date`, en jours pleins. */
const daysAgo = (date: Date, today: Date) =>
  Math.max(0, Math.round((startOfDayMs(today) - startOfDayMs(date)) / DAY_MS));

const toDatePosed = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// La réglette : 90 jours — 30 en arrière, 60 en avant. C'est la seule vue
// d'Henri où un délai notarial (une DIA fait 60 jours) tient en entier.
const RULER_BACK = 30;
const RULER_FORWARD = 60;
const RULER_MAX_LANES = 5;
const SHORT_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Brouillon de création d'une tâche — pré-rempli selon le geste qui l'ouvre. */
type Draft = { caseId: string | null; dueDate: Date | null };

export default function CalendarShell({ user }: { user: User }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("planning");
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filterCaseId, setFilterCaseId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [echeancier, setEcheancier] = useState(false);

  // Miroir de `selected` pour les raccourcis clavier : un écouteur global ne
  // doit ni capturer une valeur périmée, ni déclencher d'écriture depuis un
  // updater d'état (StrictMode l'appellerait deux fois).
  const selectedRef = useRef<CalendarEntry | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const filterRef = useRef<string | null>(null);
  useEffect(() => { filterRef.current = filterCaseId; }, [filterCaseId]);
  const echeancierRef = useRef(false);
  useEffect(() => { echeancierRef.current = echeancier; }, [echeancier]);

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

  // Le filtre par dossier se pose avant le modèle : bandes, sas, bannette et
  // réglette héritent tous de la restriction — c'est le plan de charge du
  // dossier, pas un filtre d'affichage.
  const filteredItems = useMemo(
    () => (filterCaseId ? items.filter((item) => item.caseId === filterCaseId) : items),
    [items, filterCaseId]
  );
  const filteredFloating = useMemo(
    () => (filterCaseId ? floatingTasks.filter((task) => task.caseId === filterCaseId) : floatingTasks),
    [floatingTasks, filterCaseId]
  );
  const filterCase = filterCaseId ? cases.find((entry) => entry.id === filterCaseId) ?? null : null;
  useEffect(() => { if (!filterCaseId) setEcheancier(false); }, [filterCaseId]);

  const model = useMemo(
    () =>
      buildCalendarModel({
        days,
        today,
        cases,
        items: filteredItems,
        floatingTasks: filteredFloating,
        events,
        myDaySelections,
      }),
    [days, today, cases, filteredItems, filteredFloating, events, myDaySelections]
  );

  // L'inspecteur suit la donnée : après un changement de statut, l'entrée
  // sélectionnée est recherchée dans le modèle recalculé — même clé d'abord,
  // même tâche sinon. Sans quoi le panneau montrerait l'état d'avant le clic.
  useEffect(() => {
    setSelected((current) => {
      if (!current) return current;
      const pool: CalendarEntry[] = [
        ...model.souffrance,
        ...model.souffranceGroups.flatMap((group) => group.entries),
        ...model.bannette,
        ...model.days.flatMap((cell) => [...cell.entrant, ...cell.sortant, ...cell.rappels, ...cell.fait]),
        ...model.bars.map((bar) => ({
          key: `${bar.task.id}-bar`,
          task: bar.task,
          reason: "retour" as const,
          overdue: !!bar.overdueFrom,
        })),
      ];
      return (
        pool.find((entry) => entry.key === current.key) ??
        pool.find((entry) => entry.task.id === current.task.id) ??
        current
      );
    });
  }, [model]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const step = useCallback(
    (direction: 1 | -1) => setAnchor((current) => addDays(current, direction * (mode === "jour" ? 1 : 7))),
    [mode]
  );

  // La fenêtre du planning : 90 jours autour de l'ancre — 30 en arrière,
  // 60 en avant, comme la réglette dont il est la généralisation.
  const planStart = useMemo(() => addDays(anchor, -RULER_BACK), [anchor]);
  const planEnd = useMemo(() => addDays(anchor, RULER_FORWARD + 1), [anchor]);

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

  // Ouvrir la tâche là où elle vit : Mes dossiers, dossier ouvert, tâche
  // sélectionnée. Même mécanisme que le lien « Dossier » de Ma journée —
  // la sélection attend dans sessionStorage, AppShell la restaure.
  const openInCase = useCallback(
    (task: CalendarTask) => {
      if (task.kind === "floating" || !task.caseId) {
        router.push("/my-day");
        return;
      }
      sessionStorage.setItem(
        "pendingSelection",
        JSON.stringify({
          caseId: task.caseId,
          itemId: task.level === 3 && task.parentItemId ? task.parentItemId : task.id,
          subItemId: task.level === 3 ? task.id : null,
        })
      );
      router.push("/");
    },
    [router]
  );

  // Reporter (ou retirer) l'échéance depuis l'inspecteur — l'action « le tas
  // se vide » du sas : ce qui n'est plus tenable se replanifie sur place.
  const setDue = useCallback(
    async (task: CalendarTask, date: Date | null) => {
      if (task.kind !== "item") return;
      await updateItem(user.uid, task.id, { dueDate: date ? atDueHour(date).toISOString() : null });
      showToast(date ? `Échéance reportée au ${shortDate(date)}.` : "Échéance retirée.");
    },
    [user.uid, showToast]
  );

  // Chaque motif de pastille n'a qu'un seul coup naturel. Un bouton au
  // survol, jamais deux : celui du motif.
  const actFor = useCallback(
    (entry: CalendarEntry): ChipAct | undefined => {
      const task = entry.task;
      if (task.isMemo) return undefined;
      switch (entry.reason) {
        case "lancement":
          return { label: "→", hint: "Demande envoyée — passer en Demandé", run: () => advanceStatus(task, "Demandé") };
        case "retour":
        case "echeance":
        case "legal":
          return { label: "✓", hint: "C'est arrivé — passer en Reçu", run: () => advanceStatus(task, "Reçu") };
        default:
          return undefined;
      }
    },
    [advanceStatus]
  );

  const createTask = useCallback(
    async (caseId: string, title: string, due: Date | null) => {
      await createItem(user.uid, {
        caseId,
        parentItemId: null,
        level: 2,
        title: title.trim(),
        status: "Créé",
        dueDate: due ? atDueHour(due).toISOString() : null,
      });
      const caseTitle = cases.find((entry) => entry.id === caseId)?.title ?? "le dossier";
      showToast(
        due
          ? `Tâche créée dans ${caseTitle} — échéance ${shortDate(due)}.`
          : `Tâche créée dans ${caseTitle}.`
      );
      setDraft(null);
    },
    [user.uid, cases, showToast]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      else if (event.key.toLowerCase() === "p" || event.key.toLowerCase() === "s") setMode("planning");
      else if (event.key.toLowerCase() === "j") setMode("jour");
      else if (event.key.toLowerCase() === "t") { setAnchor(startOfToday()); }
      else if (event.key.toLowerCase() === "n") { event.preventDefault(); setDraft({ caseId: null, dueDate: null }); }
      else if (event.key === "Escape") {
        // Un Échap, une chose : l'échéancier, la création, l'inspecteur, le filtre.
        if (echeancierRef.current) setEcheancier(false);
        else if (draftRef.current) setDraft(null);
        else if (selectedRef.current) setSelected(null);
        else if (filterRef.current) setFilterCaseId(null);
      }
      else if (/^[1-4]$/.test(event.key)) {
        // Les mêmes raccourcis 1–4 que dans le reste d'Henri : le statut de la
        // tâche sélectionnée, sans rien ouvrir.
        const current = selectedRef.current;
        if (current && !current.task.isMemo) void advanceStatus(current.task, STATUSES[Number(event.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, advanceStatus]);

  // ── Rendu ───────────────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (mode === "jour") {
      return `${DAY_NAMES[anchor.getDay()]} ${anchor.getDate()} ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }
    const start = planStart;
    const end = addDays(planEnd, -1);
    return `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  }, [mode, anchor, planStart, planEnd]);

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
          {filterCase && (
            <>
              <button
                className="cal-filter-pill"
                onClick={() => setFilterCaseId(null)}
                title="Toute la vue est restreinte à ce dossier — cliquer pour retirer le filtre (Échap)"
              >
                <Icon name="folder" size={11} />
                <span className="cal-filter-title">{filterCase.title}</span>
                <span aria-hidden>×</span>
              </button>
              <button
                className="cal-btn"
                onClick={() => setEcheancier(true)}
                title="L'échéancier du dossier, prêt à imprimer pour le client"
              >
                Échéancier
              </button>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="cal-btn"
            onClick={() => setDraft({ caseId: null, dueDate: null })}
            title="Nouvelle tâche (N) — double-clic sur un jour pour pré-remplir l'échéance"
          >
            + Tâche
          </button>
          <div className="cal-toggle">
            <button data-on={mode === "planning"} onClick={() => setMode("planning")} title="Le planning (P)">Planning</button>
            <button data-on={mode === "jour"} onClick={() => setMode("jour")} title="Vue jour (J)">Jour</button>
          </div>
        </div>
      </header>

      {/* ── LA RÉGLETTE ── en vue Jour seulement : les 90 jours de contexte
        * autour de la journée. Le planning, lui, est sa généralisation. */}
      {mode === "jour" && (
      <Ruler
        today={today}
        windowStart={days[0]}
        windowEnd={days[days.length - 1]}
        waits={model.allWaits}
        dueDays={model.dueDays}
        tenableDate={filterCase ? model.tenable?.date ?? null : null}
        hoveredTaskId={hoveredTaskId}
        onHover={setHoveredTaskId}
        onJump={(date) => setAnchor(date)}
        onPick={(bar) =>
          setSelected({
            key: `${bar.task.id}-bar`,
            task: bar.task,
            reason: "retour",
            overdue: !!bar.overdueFrom,
          })
        }
      />
      )}

      {/* ── LA DATE TENABLE ── la vue conclut : « on signe quand ? ».
        * Un sens seulement sur un dossier filtré. Cliquer le bandeau
        * sélectionne la pièce critique. */}
      {filterCase && model.tenable && (() => {
        const tenable = model.tenable;
        const posed = toDatePosed(filterCase.legalDueDate);
        const critical = tenable.critical;
        const criticalState =
          critical.status === "Reçu"
            ? "reçue — à exploiter"
            : critical.status === "Demandé"
              ? `demandée${critical.requestedAt ? ` le ${shortDate(critical.requestedAt)}` : ""}`
              : "pas encore lancée";
        const diff = posed ? Math.round((startOfDayMs(posed) - startOfDayMs(tenable.date)) / DAY_MS) : null;
        // « Tient si la demande part aujourd'hui » : le vrai signal d'alarme,
        // celui qui arrive à temps — le point de non-retour de la pièce
        // critique est atteint alors que la date posée tient encore.
        const mustLaunchToday =
          critical.status === "Créé" &&
          diff !== null && diff >= 0 &&
          !!critical.launchAt && startOfDayMs(critical.launchAt) <= startOfDayMs(today);
        const tone = diff === null ? "neutral" : diff < 0 ? "late" : mustLaunchToday ? "warn" : "ok";
        return (
          <button
            className="cal-tenable"
            data-tone={tone}
            onClick={() =>
              setSelected({
                key: `${critical.id}-critical`,
                task: critical,
                reason: critical.status === "Reçu" ? "recu" : critical.status === "Demandé" ? "retour" : "lancement",
                overdue: tone === "late",
              })
            }
            title="La date au plus tôt à laquelle toutes les pièces ouvertes peuvent être là — cliquer pour voir la pièce critique"
          >
            <span className="cal-tenable-main">
              ▸ Signature tenable au plus tôt le <strong>{formatDateFR(tenable.date)}</strong>
              {" — chemin critique : "}
              <strong>{critical.title}</strong> ({critical.delai.days} j, {criticalState})
            </span>
            {posed && diff !== null && (
              <span className="cal-tenable-verdict">
                {diff < 0
                  ? `échéance du ${shortDate(posed)} intenable de ${-diff} j`
                  : mustLaunchToday
                    ? `l'échéance du ${shortDate(posed)} tient si la demande part aujourd'hui`
                    : `échéance du ${shortDate(posed)} : marge de ${diff} j`}
              </span>
            )}
          </button>
        );
      })()}

      <div className="flex flex-1 min-h-0">
        {/* ── LE SAS ── tout ce qui a franchi sa date sans être traité */}
        <aside className="cal-sas">
          <div className="finder-header" style={{ paddingRight: 8 }}>
            <span>En retard</span>
            <span className="text-tx-3">
              {model.souffrance.length + model.souffranceGroups.reduce((sum, group) => sum + group.entries.length, 0)}
            </span>
          </div>
          <div className="cal-sas-list">
            {model.souffrance.length === 0 && model.souffranceGroups.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-tx-3">Rien en retard.</p>
            )}
            {model.souffrance.map((entry) => (
              <EntryChip
                key={entry.key}
                entry={entry}
                variant="sas"
                meta={sasMeta(entry, today)}
                selected={selected?.key === entry.key}
                dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
                canDrag={mode === "jour"}
                onSelect={() => setSelected(entry)}
                onOpen={() => openInCase(entry.task)}
                onCase={entry.task.caseId ? () => setFilterCaseId(entry.task.caseId) : undefined}
                act={entry.task.isMemo ? undefined : { label: "✓", hint: "Marquer Traité", run: () => advanceStatus(entry.task, "Traité") }}
                onHover={setHoveredTaskId}
                onDragStart={setDragTaskId}
              />
            ))}
            {/* Les dossiers dont l'échéance est dépassée, repliés : vingt
              * tâches en retard par la même date sont une seule information. */}
            {model.souffranceGroups.map((group) => {
              const expanded = openGroups.has(group.caseId);
              return (
                <div key={group.caseId} className="cal-sas-group">
                  <button
                    className="cal-sas-group-head"
                    onClick={() =>
                      setOpenGroups((current) => {
                        const next = new Set(current);
                        if (next.has(group.caseId)) next.delete(group.caseId);
                        else next.add(group.caseId);
                        return next;
                      })
                    }
                    title={`Échéance du dossier dépassée — ${group.entries.length} tâches ouvertes`}
                  >
                    <span className="cal-sas-group-arrow" aria-hidden>{expanded ? "▾" : "▸"}</span>
                    <span className="cal-sas-group-title">{group.caseTitle}</span>
                    <span className="cal-sas-group-count">{group.entries.length}</span>
                  </button>
                  <p className="cal-sas-group-meta">
                    échéance dépassée{group.dueDate ? ` de ${daysAgo(group.dueDate, today)} j` : ""}
                  </p>
                  {expanded &&
                    group.entries.map((entry) => (
                      <EntryChip
                        key={entry.key}
                        entry={entry}
                        variant="sas"
                        selected={selected?.key === entry.key}
                        dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
                        canDrag={mode === "jour"}
                        onSelect={() => setSelected(entry)}
                        onOpen={() => openInCase(entry.task)}
                        act={{ label: "✓", hint: "Marquer Traité", run: () => advanceStatus(entry.task, "Traité") }}
                        onHover={setHoveredTaskId}
                        onDragStart={setDragTaskId}
                      />
                    ))}
                </div>
              );
            })}
          </div>

          {/* ── LA BANNETTE ── ce que les retours apportent. Le tas du haut dit
            * « tu es en train de perdre », celui-ci « tu as de quoi travailler ».
            * Une pièce reçue n'a pas de date, donc pas de colonne : elle attend
            * ici, triée par marge restante, jusqu'à « Traité ». */}
          <div className="finder-header" style={{ paddingRight: 8, borderTop: "1px solid var(--border)" }}>
            <span>Bannette</span>
            <span className="text-tx-3">{model.bannette.length}</span>
          </div>
          <div className="cal-sas-list">
            {model.bannette.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-tx-3">Aucune pièce reçue en attente.</p>
            )}
            {model.bannette.map((entry) => {
              const age = entry.task.receivedAt ? daysAgo(entry.task.receivedAt, today) : null;
              const ageLabel = age === null ? "reçu" : age === 0 ? "reçu aujourd'hui" : `reçu il y a ${age} j`;
              return (
                <EntryChip
                  key={entry.key}
                  entry={entry}
                  variant="recu"
                  meta={`${ageLabel}${entry.task.dueDate ? ` · éch. ${shortDate(entry.task.dueDate)}` : ""}`}
                  old={(age ?? 0) > 10}
                  selected={selected?.key === entry.key}
                  dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
                  canDrag={mode === "jour"}
                  onSelect={() => setSelected(entry)}
                  onOpen={() => openInCase(entry.task)}
                  onCase={entry.task.caseId ? () => setFilterCaseId(entry.task.caseId) : undefined}
                  act={{ label: "✓", hint: "Marquer Traité", run: () => advanceStatus(entry.task, "Traité") }}
                  onHover={setHoveredTaskId}
                  onDragStart={setDragTaskId}
                />
              );
            })}
          </div>
        </aside>

        {/* ── LE FLUX ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {mode === "planning" ? (
            <PlanningView
              model={model}
              cases={cases}
              today={today}
              rangeStart={planStart}
              rangeEnd={planEnd}
              filterCaseId={filterCaseId}
              selected={selected}
              hoveredTaskId={hoveredTaskId}
              onSelect={setSelected}
              onHover={setHoveredTaskId}
              onOpen={openInCase}
              actFor={actFor}
              onDraft={(caseId, date) => setDraft({ caseId, dueDate: date })}
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
              onOpen={openInCase}
              onFilterCase={setFilterCaseId}
              actFor={actFor}
              onDragStart={setDragTaskId}
              onDropHour={async (hour) => {
                const task = findTask(model, dragTaskId);
                setDragTaskId(null);
                setDropHour(null);
                if (task) await scheduleReminder(task, model.days[0].date, hour);
              }}
              onHoverHour={setDropHour}
            />
          )}
        </main>

        {/* ── PANNEAU DROIT ── créer prend la place d'inspecter : un seul
          * panneau à la fois, jamais de modale (cf. CALENDRIER.md § 8). */}
        {draft ? (
          <TaskCreator
            cases={cases}
            draft={draft}
            onClose={() => setDraft(null)}
            onCreate={createTask}
          />
        ) : selected && (
          <Inspector
            entry={selected}
            onClose={() => setSelected(null)}
            onAddToMyDay={() => addToMyDay(selected.task)}
            onAdvance={(status) => advanceStatus(selected.task, status)}
            onDelai={(days) => setDelaiDays(selected.task, days)}
            onDue={(date) => setDue(selected.task, date)}
            onOpenCase={() => openInCase(selected.task)}
            onNewTask={
              selected.task.caseId
                ? () => setDraft({ caseId: selected.task.caseId, dueDate: null })
                : undefined
            }
          />
        )}
      </div>

      {toast && <div className="cal-toast">{toast}</div>}

      {echeancier && filterCase && (
        <Echeancier
          caseData={filterCase}
          tasks={model.tasks}
          tenable={model.tenable}
          today={today}
          onClose={() => setEcheancier(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// L'ÉCHÉANCIER — la vue qui sort de l'étude.
//
// Le dossier filtré raconte exactement ce que le client demande au téléphone :
// qu'est-ce qui est parti, qu'est-ce qu'on attend, on signe quand. Ce panneau
// le met en page pour l'impression, avec les règles d'écriture qui changent
// quand le lecteur change : les dates calculées deviennent des « vers le »,
// la date tenable devient « envisageable à partir du » — un délai estimé ne
// se promet pas à un client. Ni retards internes, ni bannette, ni rappels :
// le client voit le circuit de son dossier, pas la cuisine.
// ─────────────────────────────────────────────────────────────────────────────

const ECHEANCIER_STATUS_ORDER: Record<Status, number> = { "Traité": 0, "Reçu": 1, "Demandé": 2, "Créé": 3 };

type EcheancierProps = {
  caseData: Case;
  tasks: CalendarTask[];
  tenable: { date: Date; critical: CalendarTask } | null;
  today: Date;
  onClose: () => void;
};

function Echeancier({ caseData, tasks, tenable, today, onClose }: EcheancierProps) {
  const rows = useMemo(
    () =>
      tasks
        .filter((task) => !task.isMemo && task.kind === "item")
        .sort((a, b) => {
          const order = ECHEANCIER_STATUS_ORDER[a.status] - ECHEANCIER_STATUS_ORDER[b.status];
          if (order !== 0) return order;
          const dateA = a.treatedAt ?? a.receivedAt ?? a.requestedAt ?? a.dueDate;
          const dateB = b.treatedAt ?? b.receivedAt ?? b.requestedAt ?? b.dueDate;
          return (dateA?.getTime() ?? Infinity) - (dateB?.getTime() ?? Infinity);
        }),
    [tasks]
  );

  const describe = (task: CalendarTask): { state: string; detail: string } => {
    switch (task.status) {
      case "Traité":
        return { state: "fait", detail: task.treatedAt ? `réglée le ${formatDateFR(task.treatedAt)}` : "réglée" };
      case "Reçu":
        return { state: "reçue", detail: task.receivedAt ? `reçue le ${formatDateFR(task.receivedAt)}` : "reçue" };
      case "Demandé":
        return {
          state: "en cours",
          detail: `demandée${task.requestedAt ? ` le ${formatDateFR(task.requestedAt)}` : ""}${
            task.expectedReturn ? ` — attendue vers le ${formatDateFR(task.expectedReturn)}` : ""
          }`,
        };
      default:
        return { state: "à venir", detail: `à demander — réponse sous ${task.delai.days} jours` };
    }
  };

  return (
    <div className="cal-print-overlay" role="dialog" aria-label="Échéancier du dossier">
      <div className="cal-print-actions">
        <button className="cal-btn" onClick={() => window.print()}>Imprimer</button>
        <button className="cal-btn" onClick={onClose}>Fermer (Échap)</button>
      </div>
      <div className="cal-print-page">
        <header className="cal-print-head">
          <h1>{caseData.title}</h1>
          <p>Échéancier au {formatDateFR(today)}</p>
        </header>
        <table className="cal-print-table">
          <tbody>
            {rows.map((task) => {
              const { state, detail } = describe(task);
              return (
                <tr key={task.id} data-state={state}>
                  <td className="cal-print-state">{state}</td>
                  <td className="cal-print-title">{task.title}</td>
                  <td className="cal-print-detail">{detail}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="cal-print-detail">Aucune pièce dans ce dossier.</td></tr>
            )}
          </tbody>
        </table>
        {tenable && (
          <p className="cal-print-tenable">
            ▸ Signature envisageable à partir du <strong>{formatDateFR(tenable.date)}</strong>
          </p>
        )}
        <p className="cal-print-note">
          Dates estimées d&apos;après les délais habituels de réponse des administrations et
          organismes consultés — données à titre indicatif.
        </p>
      </div>
    </div>
  );
}

const findTask = (model: ReturnType<typeof buildCalendarModel>, taskId: string | null): CalendarTask | null => {
  if (!taskId) return null;
  const cell = model.days[0];
  const pool: CalendarTask[] = [
    ...cell.entrant.map((entry) => entry.task),
    ...cell.sortant.map((entry) => entry.task),
    ...cell.rappels.map((entry) => entry.task),
    ...model.souffrance.map((entry) => entry.task),
    ...model.souffranceGroups.flatMap((group) => group.entries.map((entry) => entry.task)),
    ...model.bannette.map((entry) => entry.task),
    ...model.bars.map((bar) => bar.task),
  ];
  return pool.find((task) => task.id === taskId) ?? null;
};

/** L'action au survol d'une pastille : une seule, celle de son motif. */
export type ChipAct = { label: string; hint: string; run: () => void };

/** Ce que la ligne du sas doit dire : de combien, et depuis quand. */
const sasMeta = (entry: CalendarEntry, today: Date): string | undefined => {
  const { task, reason } = entry;
  if (reason === "echeance" && task.dueDate) return `${daysAgo(task.dueDate, today)} j de retard`;
  if (reason === "lancement" && task.launchAt)
    return `à lancer depuis ${daysAgo(task.launchAt, today)} j${task.dueDate ? ` · éch. ${shortDate(task.dueDate)}` : ""}`;
  return undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// LE PLANNING — les dossiers à l'horizontale.
//
// Une ligne par dossier, dépliable en une ligne par tâche. Toute la vie d'une
// pièce se lit de gauche à droite sur sa propre ligne : ● le jour où la
// demande doit partir, un corridor pointillé jusqu'à son échéance, la barre
// d'attente quand elle est demandée (hachurée de rouge au-delà du retour
// attendu), ◆ l'échéance. La ligne du dossier agrège tout cela et y pose ◇ la
// date tenable face à ◆ son échéance : « on signe quand ? » se lit d'un
// regard, dossier par dossier. Les pièces reçues ne sont pas ici : elles sont
// dans la bannette. Double-clic sur une piste : nouvelle tâche du dossier, à
// cette date.
// ─────────────────────────────────────────────────────────────────────────────

type PlanRow = {
  caseData: Case;
  /** Les tâches dessinées en lignes : Créé et Demandé — l'anticipation. */
  children: CalendarTask[];
  /** Les échéances ouvertes du dossier (Reçu compris), pour la ligne agrégée. */
  diamonds: CalendarTask[];
  legalDue: Date | null;
  tenable: Tenable | null;
  nextDue: Date | null;
};

type PlanningProps = {
  model: ReturnType<typeof buildCalendarModel>;
  cases: Case[];
  today: Date;
  rangeStart: Date;
  rangeEnd: Date;
  filterCaseId: string | null;
  selected: CalendarEntry | null;
  hoveredTaskId: string | null;
  onSelect: (entry: CalendarEntry) => void;
  onHover: (taskId: string | null) => void;
  onOpen: (task: CalendarTask) => void;
  actFor: (entry: CalendarEntry) => ChipAct | undefined;
  onDraft: (caseId: string, date: Date) => void;
};

/** L'entrée d'inspecteur d'une ligne de tâche : son statut choisit le motif. */
const planEntry = (task: CalendarTask): CalendarEntry => ({
  key: `${task.id}-plan`,
  task,
  reason: task.status === "Demandé" ? "retour" : task.status === "Reçu" ? "recu" : "lancement",
  overdue: false,
});

function PlanningView({
  model, cases, today, rangeStart, rangeEnd, filterCaseId,
  selected, hoveredTaskId, onSelect, onHover, onOpen, actFor, onDraft,
}: PlanningProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const total = rangeEnd.getTime() - rangeStart.getTime();
  const pct = useCallback(
    (date: Date) => Math.min(100, Math.max(0, ((date.getTime() - rangeStart.getTime()) / total) * 100)),
    [rangeStart, total]
  );
  const inRange = (date: Date | null): date is Date => !!date && date >= rangeStart && date < rangeEnd;

  const rows = useMemo(() => {
    const byCase = new Map<string, CalendarTask[]>();
    for (const task of model.tasks) {
      if (task.isMemo || !task.caseId) continue;
      const bucket = byCase.get(task.caseId) ?? [];
      bucket.push(task);
      byCase.set(task.caseId, bucket);
    }
    const casesById = new Map(cases.map((entry) => [entry.id, entry]));
    const built: PlanRow[] = [];
    for (const [caseId, tasks] of byCase) {
      const caseData = casesById.get(caseId);
      if (!caseData || caseData.archived) continue;
      const open = tasks.filter((task) => OPEN_STATUSES.has(task.status));
      if (open.length === 0) continue;
      const children = open
        .filter((task) => task.status !== "Reçu")
        .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));
      const diamonds = open.filter((task) => task.dueDate && !task.dueFromCase);
      const legalDue = toDatePosed(caseData.legalDueDate);
      const dues = [...diamonds.map((task) => task.dueDate as Date), ...(legalDue ? [legalDue] : [])];
      built.push({
        caseData,
        children,
        diamonds,
        legalDue,
        tenable: computeTenable(open, today),
        nextDue: dues.length ? new Date(Math.min(...dues.map((d) => d.getTime()))) : null,
      });
    }
    // L'ordre du planning : le dossier le plus près de tomber d'abord.
    return built.sort((a, b) => {
      const dueA = a.nextDue?.getTime() ?? Infinity;
      const dueB = b.nextDue?.getTime() ?? Infinity;
      if (dueA !== dueB) return dueA - dueB;
      return a.caseData.title.localeCompare(b.caseData.title);
    });
  }, [model.tasks, cases, today]);

  const months = useMemo(() => {
    const marks: { left: number; label: string; boundary: boolean }[] = [];
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cursor < rangeEnd) {
      const from = cursor < rangeStart ? rangeStart : cursor;
      marks.push({ left: pct(from), label: `${SHORT_MONTHS[cursor.getMonth()]}${cursor.getMonth() === 0 ? ` ${cursor.getFullYear()}` : ""}`, boundary: cursor >= rangeStart });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return marks;
  }, [rangeStart, rangeEnd, pct]);

  // Un trait par lundi : la trame de fond du planning.
  const weekMarks = useMemo(() => {
    const marks: number[] = [];
    let cursor = startOfWeek(rangeStart);
    if (cursor < rangeStart) cursor = addDays(cursor, 7);
    while (cursor < rangeEnd) {
      marks.push(pct(cursor));
      cursor = addDays(cursor, 7);
    }
    return marks;
  }, [rangeStart, rangeEnd, pct]);

  const dateAt = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const date = new Date(rangeStart.getTime() + ratio * total);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const dim = (taskId: string) => !!hoveredTaskId && hoveredTaskId !== taskId;

  const trackDeco = (
    <>
      {weekMarks.map((left) => (
        <span key={left} className="plan-week" style={{ left: `${left}%` }} aria-hidden />
      ))}
      {inRange(today) && <span className="plan-today" style={{ left: `${pct(today)}%` }} aria-hidden />}
    </>
  );

  /** La barre d'attente d'une tâche demandée, clippée à la fenêtre. */
  const renderWait = (task: CalendarTask, tone: "case" | "task") => {
    if (task.status !== "Demandé" || !task.requestedAt || !task.expectedReturn) return null;
    const startAt = task.requestedAt;
    const overdue = task.expectedReturn < today;
    const endAt = overdue ? today : task.expectedReturn;
    if (endAt < rangeStart || startAt >= rangeEnd) return null;
    const from = pct(startAt);
    const split = pct(addDays(task.expectedReturn, 1));
    const to = pct(addDays(endAt, 1));
    const mainEnd = overdue ? Math.min(split, to) : to;
    const entry: CalendarEntry = { key: `${task.id}-plan`, task, reason: "retour", overdue };
    const shared = {
      onMouseEnter: () => onHover(task.id),
      onMouseLeave: () => onHover(null),
      onClick: (event: React.MouseEvent) => { event.stopPropagation(); onSelect(entry); },
      title: explainEntry(entry),
    };
    return (
      <span key={`${task.id}-wait`}>
        <span className="plan-wait" data-tone={tone} data-dim={dim(task.id)} style={{ left: `${from}%`, width: `${Math.max(0.4, mainEnd - from)}%` }} {...shared} />
        {overdue && split < to && (
          <span className="plan-wait" data-late data-tone={tone} data-dim={dim(task.id)} style={{ left: `${split}%`, width: `${Math.max(0.4, to - split)}%` }} {...shared} />
        )}
      </span>
    );
  };

  /** ◆ une échéance, cliquable. */
  const renderDiamond = (task: CalendarTask, tone: "case" | "task") => {
    if (!inRange(task.dueDate)) return null;
    const entry: CalendarEntry = { key: `${task.id}-due`, task, reason: task.dueFromCase ? "legal" : "echeance", overdue: false };
    return (
      <span
        key={`${task.id}-due`}
        className="plan-due"
        data-tone={tone}
        data-dim={dim(task.id)}
        style={{ left: `${pct(task.dueDate)}%` }}
        onMouseEnter={() => onHover(task.id)}
        onMouseLeave={() => onHover(null)}
        onClick={(event) => { event.stopPropagation(); onSelect(entry); }}
        title={explainEntry(entry)}
      />
    );
  };

  return (
    <div className="plan">
      <div className="plan-grid">
        {/* L'axe */}
        <div className="plan-corner">
          <span>{rows.length} dossier{rows.length > 1 ? "s" : ""}</span>
        </div>
        <div className="plan-axis">
          {months.map((mark) => (
            <span key={mark.left} className="plan-month" data-boundary={mark.boundary} style={{ left: `${mark.left}%` }}>
              {mark.label}
            </span>
          ))}
          {inRange(today) && (
            <span className="plan-today-label" style={{ left: `${pct(today)}%` }}>aujourd&apos;hui</span>
          )}
          {trackDeco}
        </div>

        {rows.length === 0 && (
          <>
            <div />
            <p className="plan-empty">Aucun dossier avec des tâches ouvertes.</p>
          </>
        )}

        {rows.map((row) => {
          const isOpen = expanded.has(row.caseData.id) || filterCaseId === row.caseData.id;
          const holds = row.tenable && row.legalDue ? row.tenable.date <= row.legalDue : null;
          return (
            <React.Fragment key={row.caseData.id}>
              {/* ── La ligne du dossier ── */}
              <button
                className="plan-title plan-title-case"
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(row.caseData.id)) next.delete(row.caseData.id);
                    else next.add(row.caseData.id);
                    return next;
                  })
                }
                title={isOpen ? "Replier" : `Déplier — ${row.children.length} tâche${row.children.length > 1 ? "s" : ""} à suivre`}
              >
                <span className="plan-arrow" aria-hidden>{isOpen ? "▾" : "▸"}</span>
                <span className="plan-case-name">{row.caseData.title}</span>
                {holds === false && (
                  <span className="plan-hold" title={`Échéance du ${row.legalDue ? formatDateFR(row.legalDue) : "?"} intenable — tenable au plus tôt le ${row.tenable ? formatDateFR(row.tenable.date) : "?"}`}>
                    ⚠
                  </span>
                )}
                <span className="plan-count">{row.children.length}</span>
              </button>
              <div
                className="plan-track plan-track-case"
                onDoubleClick={(event) => { if (event.target === event.currentTarget) onDraft(row.caseData.id, dateAt(event)); }}
                title="Double-clic : nouvelle tâche du dossier à cette date"
              >
                {trackDeco}
                {row.children.map((task) => renderWait(task, "case"))}
                {row.diamonds.map((task) => renderDiamond(task, "case"))}
                {inRange(row.legalDue) && (
                  <span
                    className="plan-legal"
                    data-hold={holds !== false}
                    style={{ left: `${pct(row.legalDue)}%` }}
                    title={`Échéance du dossier : ${formatDateFR(row.legalDue)}${holds === false && row.tenable ? ` — intenable, tenable le ${formatDateFR(row.tenable.date)}` : ""}`}
                    aria-hidden
                  />
                )}
                {row.tenable && inRange(row.tenable.date) && (
                  <span
                    className="plan-tenable"
                    data-dim={dim(row.tenable.critical.id)}
                    style={{ left: `${pct(row.tenable.date)}%` }}
                    onMouseEnter={() => onHover(row.tenable!.critical.id)}
                    onMouseLeave={() => onHover(null)}
                    onClick={(event) => { event.stopPropagation(); onSelect(planEntry(row.tenable!.critical)); }}
                    title={`Tenable au plus tôt le ${formatDateFR(row.tenable.date)} — chemin critique : ${row.tenable.critical.title}`}
                  />
                )}
              </div>

              {/* ── Les lignes de tâches ── */}
              {isOpen &&
                row.children.map((task) => {
                  const entry = planEntry(task);
                  const act = actFor(entry);
                  return (
                    <React.Fragment key={task.id}>
                      <div
                        className="plan-title plan-title-task"
                        data-dim={dim(task.id)}
                        data-selected={selected?.task.id === task.id}
                        onMouseEnter={() => onHover(task.id)}
                        onMouseLeave={() => onHover(null)}
                        onClick={() => onSelect(entry)}
                        onDoubleClick={() => onOpen(task)}
                        title={`${explainEntry(entry)} — double-clic : ouvrir le dossier`}
                        role="button"
                      >
                        <span className="cal-chip-dot" style={{ background: STATUS_DOT[task.status] }} aria-hidden />
                        <span className="plan-task-name">{task.title}</span>
                        {task.starred && <span className="cal-chip-star">⭐</span>}
                        {act && (
                          <span
                            className="cal-chip-done"
                            role="button"
                            title={act.hint}
                            onClick={(event) => { event.stopPropagation(); act.run(); }}
                          >
                            {act.label}
                          </span>
                        )}
                      </div>
                      <div
                        className="plan-track"
                        onDoubleClick={(event) => { if (event.target === event.currentTarget) onDraft(row.caseData.id, dateAt(event)); }}
                        title="Double-clic : nouvelle tâche du dossier à cette date"
                      >
                        {trackDeco}
                        {/* Créé : le corridor — du jour où la demande doit partir à l'échéance */}
                        {task.status === "Créé" && task.launchAt && task.dueDate && task.launchAt < rangeEnd && task.dueDate >= rangeStart && (
                          <span
                            className="plan-corridor"
                            data-dim={dim(task.id)}
                            style={{ left: `${pct(task.launchAt)}%`, width: `${Math.max(0, pct(task.dueDate) - pct(task.launchAt))}%` }}
                            aria-hidden
                          />
                        )}
                        {task.status === "Créé" && inRange(task.launchAt) && (
                          <span
                            className="plan-launch"
                            data-late={task.launchAt < today}
                            data-dim={dim(task.id)}
                            style={{ left: `${pct(task.launchAt)}%` }}
                            onMouseEnter={() => onHover(task.id)}
                            onMouseLeave={() => onHover(null)}
                            onClick={(event) => { event.stopPropagation(); onSelect({ key: `${task.id}-launch`, task, reason: "lancement", overdue: task.launchAt! < today }); }}
                            title={explainEntry({ key: "", task, reason: "lancement", overdue: false })}
                          />
                        )}
                        {renderWait(task, "task")}
                        {renderDiamond(task, "task")}
                      </div>
                    </React.Fragment>
                  );
                })}
            </React.Fragment>
          );
        })}
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
  onOpen: (task: CalendarTask) => void;
  onFilterCase: (caseId: string) => void;
  actFor: (entry: CalendarEntry) => ChipAct | undefined;
  onDragStart: (taskId: string | null) => void;
  onDropHour: (hour: number) => void;
  onHoverHour: (hour: number | null) => void;
};

function DayView({
  cell, model, selected, hoveredTaskId, dropHour,
  onSelect, onHover, onOpen, onFilterCase, actFor, onDragStart, onDropHour, onHoverHour,
}: DayProps) {
  const hours = Array.from({ length: RAIL_END_HOUR - RAIL_START_HOUR + 1 }, (_, i) => RAIL_START_HOUR + i);

  // Le rail n'accueille que ce qui est réellement horodaté : les rappels.
  const railEntries = cell.rappels;
  const attendu = cell.entrant;

  // Ce que ça déclenche : une demande faite aujourd'hui revient à telle date.
  // C'est la contrepartie de la bande « à faire ».
  const engagements = cell.sortant
    .filter((entry) => entry.reason === "lancement")
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
          {!cell.isPast && <p className="cal-rail-hint">Glissez une tâche sur une heure pour poser un rappel.</p>}
        </div>

        {/* Les couloirs. Un jour passé ne répond pas à la même question qu'un
          * jour à venir : il raconte le réalisé — prévu / fait — au lieu de
          * proposer du travail (le modèle calculait déjà `fait`, la vue Jour
          * l'ignorait et affichait trois couloirs vides). */}
        {cell.isPast ? (
          <div className="cal-lanes" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <Lane
              title="Réalisé"
              hint={`Ce qui a avancé ce jour-là${cell.myDayCount > 0 ? ` · ${cell.myDayCount} prévues dans Ma journée` : ""}`}
              entries={cell.fait}
              empty="Rien n'a bougé ce jour-là."
              variant="fait"
              selected={selected}
              hoveredTaskId={hoveredTaskId}
              onSelect={onSelect}
              onHover={onHover}
              onOpen={onOpen}
              onFilterCase={onFilterCase}
              onDragStart={onDragStart}
            />
            <Lane
              title="Échéances"
              hint="Ce qui tombait ce jour-là"
              entries={attendu}
              empty="Aucune échéance ce jour-là."
              variant="in"
              selected={selected}
              hoveredTaskId={hoveredTaskId}
              onSelect={onSelect}
              onHover={onHover}
              onOpen={onOpen}
              onFilterCase={onFilterCase}
              onDragStart={onDragStart}
            />
          </div>
        ) : (
        <div className="cal-lanes">
          <Lane
            title="À faire"
            hint="À réaliser aujourd'hui pour tenir l'échéance"
            entries={cell.sortant}
            empty="Rien à faire aujourd'hui."
            variant="out"
            canDrag
            actFor={actFor}
            selected={selected}
            hoveredTaskId={hoveredTaskId}
            onSelect={onSelect}
            onHover={onHover}
            onOpen={onOpen}
            onFilterCase={onFilterCase}
            onDragStart={onDragStart}
          />
          <Lane
            title="J'attends"
            hint={`${model.bars.length} demande${model.bars.length > 1 ? "s" : ""} sans réponse`}
            entries={model.bars.map((bar) => ({
              key: `${bar.task.id}-wait`,
              task: bar.task,
              reason: "retour" as const,
              overdue: !!bar.overdueFrom,
            }))}
            empty="Aucune demande en attente."
            variant="wait"
            canDrag
            actFor={actFor}
            selected={selected}
            hoveredTaskId={hoveredTaskId}
            onSelect={onSelect}
            onHover={onHover}
            onOpen={onOpen}
            onFilterCase={onFilterCase}
            onDragStart={onDragStart}
          />
          <Lane
            title="Échéances"
            hint="Ce qui tombe aujourd'hui"
            entries={attendu}
            empty="Aucune échéance aujourd'hui."
            variant="in"
            canDrag
            actFor={actFor}
            selected={selected}
            hoveredTaskId={hoveredTaskId}
            onSelect={onSelect}
            onHover={onHover}
            onOpen={onOpen}
            onFilterCase={onFilterCase}
            onDragStart={onDragStart}
          />
        </div>
        )}
      </div>

      {/* Ce que la journée engage — une question qui ne se pose qu'au présent */}
      {!cell.isPast && (
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
      )}
    </div>
  );
}

type LaneProps = {
  title: string;
  hint: string;
  entries: CalendarEntry[];
  empty: string;
  variant: "in" | "out" | "wait" | "fait";
  canDrag?: boolean;
  selected: CalendarEntry | null;
  hoveredTaskId: string | null;
  onSelect: (entry: CalendarEntry) => void;
  onHover: (taskId: string | null) => void;
  onOpen: (task: CalendarTask) => void;
  onFilterCase: (caseId: string) => void;
  actFor?: (entry: CalendarEntry) => ChipAct | undefined;
  onDragStart: (taskId: string | null) => void;
};

function Lane({ title, hint, entries, empty, variant, canDrag, selected, hoveredTaskId, onSelect, onHover, onOpen, onFilterCase, actFor, onDragStart }: LaneProps) {
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
            canDrag={canDrag}
            selected={selected?.key === entry.key}
            dimmed={!!hoveredTaskId && hoveredTaskId !== entry.task.id}
            onSelect={() => onSelect(entry)}
            onOpen={() => onOpen(entry.task)}
            onCase={entry.task.caseId ? () => onFilterCase(entry.task.caseId as string) : undefined}
            act={actFor?.(entry)}
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
  variant: "in" | "out" | "sas" | "fait" | "recu";
  large?: boolean;
  /** La pastille n'est saisissable que là où un dépôt existe : le rail de la
   * vue Jour. Une affordance qui ne mène nulle part apprend à ne plus essayer. */
  canDrag?: boolean;
  /** Seconde ligne : « 12 j de retard », « reçu il y a 6 j »… */
  meta?: string;
  /** La seconde ligne passe à l'ambre — un délai qu'on s'inflige à soi-même. */
  old?: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  /** Double-clic : ouvrir la tâche dans son dossier, geste Finder. */
  onOpen?: () => void;
  /** Clic sur le nom du dossier : restreindre toute la vue à ce dossier. */
  onCase?: () => void;
  /** L'action au survol — le coup naturel du motif (→ Demandé, ↻ Relancé,
   * ✓ Reçu) ou ✓ Traité dans le sas et la bannette. */
  act?: ChipAct;
  onHover: (taskId: string | null) => void;
  onDragStart: (taskId: string | null) => void;
};

function EntryChip({ entry, variant, large, canDrag, meta, old, selected, dimmed, onSelect, onOpen, onCase, act, onHover, onDragStart }: ChipProps) {
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
      draggable={!!canDrag}
      onDragStart={canDrag ? () => onDragStart(task.id) : undefined}
      onDragEnd={canDrag ? () => onDragStart(null) : undefined}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
      title={`${explainEntry(entry)} — double-clic : ouvrir le dossier`}
    >
      <span className="cal-chip-dot" style={{ background: STATUS_DOT[task.status] }} aria-hidden />
      <span className="cal-chip-title">{task.title}</span>
      {task.caseTitle && (
        <span
          className="cal-chip-case"
          data-link={!!onCase}
          onClick={onCase ? (event) => { event.stopPropagation(); onCase(); } : undefined}
          title={onCase ? "Ne voir que ce dossier" : undefined}
        >
          {task.caseTitle}
        </span>
      )}
      {reason === "lancement" && <span className="cal-chip-tag">−{task.delai.days} j</span>}
      {task.starred && <span className="cal-chip-star">⭐</span>}
      {act && (
        <span
          className="cal-chip-done"
          role="button"
          title={act.hint}
          onClick={(event) => { event.stopPropagation(); act.run(); }}
        >
          {act.label}
        </span>
      )}
      {meta && <span className="cal-chip-meta" data-old={!!old}>{meta}</span>}
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
  onDue: (date: Date | null) => void;
  onOpenCase: () => void;
  onNewTask?: () => void;
};

function Inspector({ entry, onClose, onAddToMyDay, onAdvance, onDelai, onDue, onOpenCase, onNewTask }: InspectorProps) {
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

        {/* Un tas qu'on ne peut que lire ne se vide jamais : l'échéance se
          * reporte ici, sans repasser par le dossier. Poser une date sur une
          * tâche qui héritait de celle du dossier lui donne la sienne. */}
        {task.kind === "item" && (
          <>
            <p className="cal-section-label">{task.dueDate && !task.dueFromCase ? "Reporter l'échéance au" : "Poser une échéance au"}</p>
            <input
              key={`${task.id}-due`}
              type="date"
              className="cal-input"
              style={{ marginBottom: 18 }}
              defaultValue={task.dueDate && !task.dueFromCase ? getDateKey(task.dueDate) : ""}
              onBlur={(event) => {
                const raw = event.target.value;
                const current = task.dueDate && !task.dueFromCase ? getDateKey(task.dueDate) : "";
                if (raw === current) return;
                if (!raw) { onDue(null); return; }
                const [y, m, d] = raw.split("-").map(Number);
                if (y < 1900 || y > 2100) return;
                onDue(new Date(y, m - 1, d));
              }}
              aria-label="Reporter l'échéance"
            />
          </>
        )}

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
        <button className="detail-action-btn" onClick={onOpenCase}>
          {task.kind === "floating" || !task.caseId ? "Ouvrir Ma journée" : "Ouvrir le dossier"}
        </button>
      </div>
      {onNewTask && (
        <button className="cal-newtask-link" onClick={onNewTask}>
          + Nouvelle tâche dans {task.caseTitle ?? "ce dossier"}
        </button>
      )}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CRÉATION — une tâche naît dans un dossier ; le calendrier ne fait que lui
// donner tout de suite une place dans le temps. Le panneau prend le slot de
// l'inspecteur : un seul panneau à la fois, pas de modale.
// ─────────────────────────────────────────────────────────────────────────────

type CreatorProps = {
  cases: Case[];
  draft: Draft;
  onClose: () => void;
  onCreate: (caseId: string, title: string, due: Date | null) => void;
};

function TaskCreator({ cases, draft, onClose, onCreate }: CreatorProps) {
  const open = useMemo(
    () =>
      cases
        .filter((entry) => !entry.archived)
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [cases]
  );

  const [caseId, setCaseId] = useState<string | null>(draft.caseId);
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Date | null>(draft.dueDate);

  const caseInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Le curseur va là où il manque quelque chose : le dossier, sinon le titre.
  useEffect(() => {
    (draft.caseId ? titleInputRef : caseInputRef).current?.focus();
  }, [draft.caseId]);

  const selectedCase = open.find((entry) => entry.id === caseId) ?? null;

  const strip = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches = useMemo(() => {
    const needle = strip(query.trim());
    const pool = needle ? open.filter((entry) => strip(entry.title).includes(needle)) : open;
    return pool.slice(0, 8);
  }, [open, query]);

  const pickCase = (id: string) => {
    setCaseId(id);
    setQuery("");
    setListOpen(false);
    titleInputRef.current?.focus();
  };

  const canCreate = !!caseId && title.trim().length > 0;
  const submit = () => {
    if (canCreate) onCreate(caseId as string, title, due);
  };

  return (
    <aside className="cal-inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <div className="finder-header">
        <span>Nouvelle tâche</span>
        <button className="cal-icon-btn" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer">
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="cal-inspector-body">
        <p className="cal-section-label">Dossier</p>
        <div className="cal-combo">
          <input
            ref={caseInputRef}
            className="cal-input"
            placeholder="Chercher un dossier…"
            value={listOpen || !selectedCase ? query : selectedCase.title}
            onFocus={() => { setListOpen(true); setActiveIndex(0); }}
            onBlur={() => setListOpen(false)}
            onChange={(event) => { setQuery(event.target.value); setListOpen(true); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (!listOpen) return;
              if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, matches.length - 1)); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
              else if (event.key === "Enter") { event.preventDefault(); if (matches[activeIndex]) pickCase(matches[activeIndex].id); }
              // Tant que la liste est ouverte, Échap lui appartient — même règle
              // que la ligne de saisie de Ma journée.
              else if (event.key === "Escape") { event.stopPropagation(); setListOpen(false); }
            }}
            aria-label="Dossier de la tâche"
          />
          {listOpen && (
            <div className="cal-combo-list">
              {matches.length === 0 && <p className="cal-combo-empty">Aucun dossier à ce nom.</p>}
              {matches.map((entry, index) => (
                <button
                  key={entry.id}
                  className="cal-combo-item"
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  // mousedown : avant le blur de l'input, sinon la liste se ferme sans retenir.
                  onMouseDown={(event) => { event.preventDefault(); pickCase(entry.id); }}
                >
                  {entry.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="cal-section-label" style={{ marginTop: 16 }}>Titre</p>
        <input
          ref={titleInputRef}
          className="cal-input"
          placeholder="Demander l'état daté au syndic…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          aria-label="Titre de la tâche"
        />

        <p className="cal-section-label" style={{ marginTop: 16 }}>Échéance</p>
        <div style={{ marginBottom: 8 }}>
          <DueChips
            value={due ? due.toISOString() : null}
            onPick={(date) => setDue(date)}
            onClear={due ? () => setDue(null) : undefined}
          />
        </div>
        <input
          type="date"
          className="cal-input"
          value={due ? getDateKey(due) : ""}
          onChange={(event) => {
            if (!event.target.value) { setDue(null); return; }
            const [y, m, d] = event.target.value.split("-").map(Number);
            if (y < 1900 || y > 2100) return;
            setDue(new Date(y, m - 1, d));
          }}
          aria-label="Échéance de la tâche"
        />
        {due && (
          <p className="cal-note-hint" style={{ marginTop: 12 }}>
            Elle apparaîtra dans « échéances » le {formatDateFR(due)}, et dans
            « à faire » le jour où la demande devra partir.
          </p>
        )}
      </div>

      <div className="cal-inspector-actions">
        <button className="detail-action-btn detail-action-primary" onClick={submit} disabled={!canCreate}>
          Créer la tâche
        </button>
        <button className="detail-action-btn" onClick={onClose}>Annuler</button>
      </div>
    </aside>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// LA RÉGLETTE — 90 jours d'un seul tenant (30 en arrière, 60 en avant).
//
// Le barème notarial va de 7 à 60 jours ; une fenêtre de sept colonnes n'en
// montre jamais qu'un segment. La réglette porte quatre choses, et rien
// d'autre : la fenêtre affichée (le cadre qu'on déplace), toutes les attentes
// en cours — y compris celles qui ne touchent pas la semaine, précisément
// celles qu'on oublie —, les échéances en traits verticaux, et aujourd'hui.
// Un clic déplace la fenêtre ; survoler un segment allume la pastille.
// ─────────────────────────────────────────────────────────────────────────────

type RulerProps = {
  today: Date;
  windowStart: Date;
  windowEnd: Date;
  waits: WaitingBar[];
  dueDays: { date: Date; count: number }[];
  /** La date tenable du dossier filtré — dessinée en losange. */
  tenableDate?: Date | null;
  hoveredTaskId: string | null;
  onHover: (taskId: string | null) => void;
  onJump: (date: Date) => void;
  onPick: (bar: WaitingBar) => void;
};

function Ruler({ today, windowStart, windowEnd, waits, dueDays, tenableDate, hoveredTaskId, onHover, onJump, onPick }: RulerProps) {
  const start = useMemo(() => addDays(today, -RULER_BACK), [today]);
  const end = useMemo(() => addDays(today, RULER_FORWARD + 1), [today]); // borne exclue : le dernier jour est entier
  const total = end.getTime() - start.getTime();
  const pct = useCallback(
    (date: Date) => Math.min(100, Math.max(0, ((date.getTime() - start.getTime()) / total) * 100)),
    [start, total]
  );

  // Rangement des barres sur peu de lignes : première ligne dont la dernière
  // barre est finie avant que celle-ci commence. Au-delà du plafond, on compte.
  const { lanes, hidden } = useMemo(() => {
    const visible = waits.filter((bar) => bar.end >= start && bar.start <= end);
    const laneEnds: number[] = [];
    const placed: { bar: WaitingBar; lane: number }[] = [];
    let hiddenCount = 0;
    for (const bar of visible) {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd + DAY_MS <= bar.start.getTime());
      if (lane === -1) {
        if (laneEnds.length >= RULER_MAX_LANES) { hiddenCount += 1; continue; }
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = bar.end.getTime();
      placed.push({ bar, lane });
    }
    return { lanes: placed, hidden: hiddenCount };
  }, [waits, start, end]);

  const months = useMemo(() => {
    const marks: { left: number; label: string; boundary: boolean }[] = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor < end) {
      const from = cursor < start ? start : cursor;
      marks.push({ left: pct(from), label: SHORT_MONTHS[cursor.getMonth()], boundary: cursor >= start });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return marks;
  }, [start, end, pct]);

  const ticks = useMemo(
    () => dueDays.filter((day) => day.date >= start && day.date < end),
    [dueDays, start, end]
  );

  const jump = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const date = new Date(start.getTime() + ratio * total);
    date.setHours(0, 0, 0, 0);
    onJump(date);
  };

  const windowLeft = pct(windowStart);
  const windowWidth = Math.max(0.8, pct(addDays(windowEnd, 1)) - windowLeft);

  return (
    <div className="cal-ruler" onClick={jump} title="90 jours — cliquer pour déplacer la fenêtre">
      {months.map((mark) => (
        <span key={`${mark.label}-${mark.left}`} className="cal-ruler-month" data-boundary={mark.boundary} style={{ left: `${mark.left}%` }}>
          {mark.label}
        </span>
      ))}

      <div className="cal-ruler-window" style={{ left: `${windowLeft}%`, width: `${windowWidth}%` }} aria-hidden />
      <div className="cal-ruler-today" style={{ left: `${pct(today)}%` }} aria-hidden />

      {lanes.map(({ bar, lane }) => {
        const dimmed = !!hoveredTaskId && hoveredTaskId !== bar.task.id;
        const from = pct(bar.start);
        const to = pct(addDays(bar.end, 1));
        const split = bar.overdueFrom ? pct(bar.overdueFrom) : to;
        const top = 15 + lane * 5;
        const shared = {
          onMouseEnter: () => onHover(bar.task.id),
          onMouseLeave: () => onHover(null),
          onClick: (event: React.MouseEvent) => { event.stopPropagation(); onPick(bar); },
          title: `${bar.task.title}${bar.task.caseTitle ? ` · ${bar.task.caseTitle}` : ""} — demandé le ${shortDate(bar.start)}, ${bar.overdueFrom ? `en retard depuis le ${shortDate(bar.overdueFrom)}` : `attendu le ${shortDate(bar.end)}`}`,
        };
        return (
          <span key={bar.task.id}>
            <span className="cal-ruler-bar" data-dim={dimmed} style={{ left: `${from}%`, width: `${Math.max(0.5, split - from)}%`, top }} {...shared} />
            {bar.overdueFrom && (
              <span className="cal-ruler-bar" data-late data-dim={dimmed} style={{ left: `${split}%`, width: `${Math.max(0.5, to - split)}%`, top }} {...shared} />
            )}
          </span>
        );
      })}

      {ticks.map((day) => (
        <span
          key={getDateKey(day.date)}
          className="cal-ruler-tick"
          style={{ left: `${pct(day.date)}%`, height: 4 + Math.min(day.count, 4) * 2 }}
          title={`${day.count} échéance${day.count > 1 ? "s" : ""} le ${shortDate(day.date)}`}
          aria-hidden
        />
      ))}

      {tenableDate && tenableDate >= start && tenableDate < end && (
        <span
          className="cal-ruler-tenable"
          style={{ left: `${pct(tenableDate)}%` }}
          title={`Signature tenable au plus tôt le ${formatDateFR(tenableDate)}`}
          aria-hidden
        />
      )}

      {hidden > 0 && <span className="cal-ruler-more">+{hidden}</span>}
    </div>
  );
}

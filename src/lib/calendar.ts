// Modèle de la vue Calendrier.
//
// Henri n'a pas de rendez-vous : il a des pièces qu'on demande et qui reviennent.
// Ce module transforme les dossiers, tâches et mémos en une lecture temporelle
// à deux rives :
//
//   • la rive haute — CE QUI REVIENT : échéances, retours attendus, rappels.
//   • la rive basse — CE QUI PART   : demandes à lancer, relances à faire.
//
// La rive basse n'est stockée nulle part : elle est *calculée* à rebours depuis
// les échéances (échéance − délai de la pièce). C'est ce qui distingue cette vue
// d'un agenda : elle ne montre pas seulement quand ça tombe, elle montre quand
// il faut agir pour que ça tombe bien.

import type { Case, FloatingTask, Item, MyDaySelection, Event as HenriEvent } from "./types";
import { getDateKey, toDate } from "./dates";
import { addDays, expectedReturnDate, inferDelai, isWeekend, latestLaunchDate, resolveDelai, type DelaiInfo } from "./delais";

export type TaskKind = "item" | "floating" | "case";

export type CalendarTask = {
  id: string;
  kind: TaskKind;
  title: string;
  caseId: string | null;
  caseTitle: string | null;
  status: Item["status"];
  starred: boolean;
  level: 2 | 3 | null;
  dueDate: Date | null;         // échéance portée par la tâche (ou l'échéance légale du dossier)
  dueFromCase: boolean;         // l'échéance vient du dossier, pas de la tâche
  reminderAt: Date | null;
  requestedAt: Date | null;     // date de passage au statut « Demandé » (lue dans la timeline)
  expectedReturn: Date | null;  // requestedAt + délai de la pièce
  launchAt: Date | null;        // échéance − délai : dernier jour pour lancer la demande
  delai: DelaiInfo;
};

export type EntryReason =
  | "echeance"    // rive haute — une échéance tombe ce jour
  | "retour"      // rive haute — une pièce demandée est attendue ce jour
  | "legal"       // rive haute — échéance légale de dossier
  | "rappel"      // rive haute — un rappel est programmé ce jour
  | "lancement"   // rive basse — dernier jour pour envoyer la demande
  | "relance"     // rive basse — la pièce n'est pas revenue, il faut relancer
  | "fait";       // passé — le statut a avancé ce jour-là

export type CalendarEntry = {
  key: string;
  task: CalendarTask;
  reason: EntryReason;
  overdue: boolean;
  /** Pour « fait » : le statut atteint ce jour-là. */
  reachedStatus?: Item["status"];
};

export type WaitingBar = {
  task: CalendarTask;
  start: Date;      // date de la demande
  end: Date;        // retour attendu
  overdueFrom: Date | null; // à partir d'ici, le retour est en dépassement
};

export type DayCell = {
  date: Date;
  dateKey: string;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
  entrant: CalendarEntry[];  // rive haute
  sortant: CalendarEntry[];  // rive basse
  fait: CalendarEntry[];     // réalisé (jours passés)
  myDayCount: number;        // nb d'éléments mis dans Ma journée ce jour-là
  load: number;              // 0 → 1, intensité de charge relative à la fenêtre
};

export type CalendarModel = {
  days: DayCell[];
  bars: WaitingBar[];
  /** Le « sas » : tout ce qui aurait dû être traité et ne l'a pas été. */
  souffrance: CalendarEntry[];
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const startOfWeek = (date: Date) => {
  const day = startOfDay(date);
  const dow = day.getDay(); // 0 = dimanche
  return addDays(day, dow === 0 ? -6 : 1 - dow); // semaine du lundi
};

const sameDay = (a: Date | null, b: Date) => !!a && getDateKey(a) === getDateKey(b);

const OPEN_STATUSES = new Set(["Créé", "Demandé", "Reçu"]);

/**
 * Date de passage au statut « Demandé », lue dans la timeline d'événements.
 * Aucun champ à ajouter au modèle : Henri journalise déjà les changements de
 * statut (`logStatusEvent`). À défaut d'événement, on retombe sur `updatedAt`.
 */
export const buildRequestedAtIndex = (events: HenriEvent[]) => {
  const index = new Map<string, Date>();
  for (const event of events) {
    if (event.type !== "progress_changed") continue;
    const to = (event.payload as { to?: string } | null | undefined)?.to;
    if (to !== "Demandé") continue;
    const at = toDate(event.createdAt);
    if (!at) continue;
    const known = index.get(event.itemId);
    if (!known || at > known) index.set(event.itemId, at);
  }
  return index;
};

/** Index des jours où le statut d'une tâche a avancé (pour le « réalisé »). */
const buildProgressIndex = (events: HenriEvent[]) => {
  const index = new Map<string, { itemId: string; status: string }[]>();
  for (const event of events) {
    if (event.type !== "progress_changed") continue;
    const at = toDate(event.createdAt);
    if (!at) continue;
    const to = (event.payload as { to?: string } | null | undefined)?.to;
    if (!to) continue;
    const dateKey = getDateKey(at);
    const bucket = index.get(dateKey) ?? [];
    bucket.push({ itemId: event.itemId, status: to });
    index.set(dateKey, bucket);
  }
  return index;
};

export const toCalendarTask = (
  item: Item,
  caseData: Case | undefined,
  requestedAt: Date | null
): CalendarTask => {
  // `delaiDays` est le délai que l'utilisateur a fixé sur la tâche ; à défaut,
  // on retombe sur l'estimation déduite du libellé.
  const delai = resolveDelai(item);
  const days = delai.days;

  const own = toDate(item.dueDate ?? null);
  const legal = toDate(caseData?.legalDueDate ?? null);
  const dueDate = own ?? legal;

  return {
    id: item.id,
    kind: "item",
    title: item.title,
    caseId: item.caseId,
    caseTitle: caseData?.title ?? null,
    status: item.status,
    starred: !!item.starred,
    level: item.level,
    dueDate,
    dueFromCase: !own && !!legal,
    reminderAt: toDate(item.reminderAt ?? null),
    requestedAt: item.status === "Demandé" ? (requestedAt ?? toDate(item.updatedAt)) : requestedAt,
    expectedReturn:
      item.status === "Demandé" && (requestedAt ?? toDate(item.updatedAt))
        ? expectedReturnDate((requestedAt ?? toDate(item.updatedAt)) as Date, days)
        : null,
    launchAt: dueDate ? latestLaunchDate(dueDate, days) : null,
    delai,
  };
};

const floatingToTask = (task: FloatingTask): CalendarTask => ({
  id: task.id,
  kind: "floating",
  title: task.title,
  caseId: null,
  caseTitle: null,
  status: task.status,
  starred: !!task.starred,
  level: null,
  dueDate: toDate(task.dueDate ?? null),
  dueFromCase: false,
  reminderAt: toDate(task.reminderAt ?? null),
  requestedAt: null,
  expectedReturn: null,
  launchAt: null,
  delai: inferDelai(task.title),
});

export type BuildInput = {
  days: Date[];               // fenêtre affichée (7 jours en semaine, 1 en jour)
  today: Date;
  cases: Case[];
  items: Item[];
  floatingTasks: FloatingTask[];
  events: HenriEvent[];
  myDaySelections: MyDaySelection[];
};

export const buildCalendarModel = ({
  days,
  today,
  cases,
  items,
  floatingTasks,
  events,
  myDaySelections,
}: BuildInput): CalendarModel => {
  const todayStart = startOfDay(today);
  const casesById = new Map(cases.map((c) => [c.id, c]));
  const requestedIndex = buildRequestedAtIndex(events);
  const progressIndex = buildProgressIndex(events);
  const itemsById = new Map(items.map((i) => [i.id, i]));

  const tasks: CalendarTask[] = [
    ...items
      .filter((item) => !casesById.get(item.caseId)?.archived)
      .map((item) => toCalendarTask(item, casesById.get(item.caseId), requestedIndex.get(item.id) ?? null)),
    ...floatingTasks.map(floatingToTask),
  ];

  const myDayByDate = new Map<string, number>();
  for (const selection of myDaySelections) {
    myDayByDate.set(selection.dateKey, (myDayByDate.get(selection.dateKey) ?? 0) + 1);
  }

  const cells: DayCell[] = days.map((date) => {
    const dateKey = getDateKey(date);
    const isToday = getDateKey(todayStart) === dateKey;
    const isPast = date < todayStart && !isToday;

    const entrant: CalendarEntry[] = [];
    const sortant: CalendarEntry[] = [];
    const fait: CalendarEntry[] = [];

    for (const task of tasks) {
      const open = OPEN_STATUSES.has(task.status);

      // ── Rive haute ──────────────────────────────────────────────────────
      if (open && sameDay(task.dueDate, date)) {
        entrant.push({
          key: `${task.id}-echeance`,
          task,
          reason: task.dueFromCase ? "legal" : "echeance",
          overdue: false,
        });
      }
      if (task.status === "Demandé" && sameDay(task.expectedReturn, date)) {
        entrant.push({ key: `${task.id}-retour`, task, reason: "retour", overdue: false });
      }
      if (open && sameDay(task.reminderAt, date)) {
        entrant.push({ key: `${task.id}-rappel`, task, reason: "rappel", overdue: false });
      }

      // ── Rive basse : ce qu'il faut envoyer ─────────────────────────────
      // Le jour où la demande doit partir pour que la pièce revienne à temps.
      if (task.status === "Créé" && sameDay(task.launchAt, date) && task.launchAt! >= todayStart) {
        sortant.push({ key: `${task.id}-lancement`, task, reason: "lancement", overdue: false });
      }
      // La relance se pose le jour du retour attendu dépassé, ou aujourd'hui si
      // ce jour est déjà passé (une relance en retard se fait aujourd'hui).
      if (task.status === "Demandé" && task.expectedReturn) {
        const relanceDay = task.expectedReturn < todayStart ? todayStart : task.expectedReturn;
        if (sameDay(relanceDay, date) && date >= todayStart) {
          sortant.push({
            key: `${task.id}-relance`,
            task,
            reason: "relance",
            overdue: task.expectedReturn < todayStart,
          });
        }
      }
    }

    // ── Réalisé (jours passés uniquement) ────────────────────────────────
    if (isPast || isToday) {
      for (const progress of progressIndex.get(dateKey) ?? []) {
        const item = itemsById.get(progress.itemId);
        if (!item) continue;
        fait.push({
          key: `${progress.itemId}-fait-${progress.status}`,
          task: toCalendarTask(item, casesById.get(item.caseId), requestedIndex.get(item.id) ?? null),
          reason: "fait",
          overdue: false,
          reachedStatus: progress.status as Item["status"],
        });
      }
    }

    return {
      date,
      dateKey,
      isToday,
      isPast,
      isWeekend: isWeekend(date),
      entrant,
      sortant,
      fait,
      myDayCount: myDayByDate.get(dateKey) ?? 0,
      load: 0,
    };
  });

  // Charge relative : sert au fond de colonne. Le sortant pèse plus lourd que
  // l'entrant (envoyer coûte du temps, recevoir n'en coûte pas toujours).
  const rawLoads = cells.map((cell) => cell.entrant.length + cell.sortant.length * 1.5);
  const maxLoad = Math.max(1, ...rawLoads);
  cells.forEach((cell, index) => {
    cell.load = Math.min(1, rawLoads[index] / maxLoad);
  });

  // ── Barres d'attente ────────────────────────────────────────────────────
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  const bars: WaitingBar[] = tasks
    .filter((task) => task.status === "Demandé" && task.requestedAt && task.expectedReturn)
    .map((task) => ({
      task,
      start: task.requestedAt as Date,
      end: task.expectedReturn as Date,
      overdueFrom: (task.expectedReturn as Date) < todayStart ? (task.expectedReturn as Date) : null,
    }))
    // Une barre qui a dépassé son retour attendu continue de courir jusqu'à
    // aujourd'hui : l'attente n'est pas finie tant que la pièce n'est pas là.
    .map((bar) => ({ ...bar, end: bar.end < todayStart ? todayStart : bar.end }))
    .filter((bar) => bar.end >= windowStart && bar.start <= windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // ── Le sas « en souffrance » ────────────────────────────────────────────
  // Ce qui a franchi sa date et n'a plus de jour où se poser : échéances
  // dépassées, points de non-retour franchis. Dans un calendrier, ce retard-là
  // n'a pas de date — il a un tas, et un tas se met devant la porte.
  //
  // Les relances en retard, elles, ne viennent PAS ici : leur action a une date
  // évidente — aujourd'hui — et elles sont déjà posées sur la rive basse du
  // jour. On évite ainsi de compter deux fois la même tâche.
  const souffrance: CalendarEntry[] = [];
  for (const task of tasks) {
    if (!OPEN_STATUSES.has(task.status)) continue;
    if (task.dueDate && task.dueDate < todayStart) {
      souffrance.push({ key: `${task.id}-souffrance-echeance`, task, reason: "echeance", overdue: true });
      continue;
    }
    if (task.status === "Créé" && task.launchAt && task.launchAt < todayStart && task.dueDate) {
      // Le point de non-retour est franchi : l'échéance est mathématiquement
      // menacée même si elle est encore dans le futur.
      souffrance.push({ key: `${task.id}-souffrance-lancement`, task, reason: "lancement", overdue: true });
    }
  }
  souffrance.sort((a, b) => {
    const dateA = a.task.dueDate ?? a.task.expectedReturn ?? a.task.launchAt;
    const dateB = b.task.dueDate ?? b.task.expectedReturn ?? b.task.launchAt;
    return (dateA?.getTime() ?? 0) - (dateB?.getTime() ?? 0);
  });

  return { days: cells, bars, souffrance };
};

export const REASON_LABELS: Record<EntryReason, string> = {
  echeance: "Échéance",
  retour: "Retour attendu",
  legal: "Échéance légale du dossier",
  rappel: "Rappel programmé",
  lancement: "À lancer au plus tard",
  relance: "Relance",
  fait: "Traité",
};

/** Explication littérale du calcul, affichée au survol. Henri doit savoir se justifier. */
export const explainEntry = (entry: CalendarEntry): string => {
  const { task, reason } = entry;
  const fmt = (date: Date | null) =>
    date ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}` : "?";
  switch (reason) {
    case "lancement":
      return `Échéance ${fmt(task.dueDate)} − ${task.delai.days} j (${task.delai.label}) → à envoyer le ${fmt(task.launchAt)}`;
    case "relance":
      return `Demandé le ${fmt(task.requestedAt)}, retour attendu le ${fmt(task.expectedReturn)} (${task.delai.label})`;
    case "retour":
      return `Demandé le ${fmt(task.requestedAt)} · ${task.delai.label} : ${task.delai.days} j`;
    case "legal":
      return `Échéance légale du dossier ${task.caseTitle ?? ""}`.trim();
    case "rappel":
      return `Rappel programmé le ${fmt(task.reminderAt)}`;
    case "echeance":
      return `Échéance de la tâche : ${fmt(task.dueDate)}`;
    case "fait":
      return `Passée en « ${entry.reachedStatus} » ce jour-là`;
  }
};

// Modèle de la vue Calendrier.
//
// Henri n'a pas de rendez-vous : il a des pièces qu'on demande et qui reviennent.
// Ce module transforme les dossiers, tâches et mémos en une lecture temporelle
// à deux rives :
//
//   • À FAIRE    : ce que je réalise ce jour-là — demandes à faire, relances.
//   • J'ATTENDS  : les demandes parties dont le retour n'est pas arrivé.
//   • ÉCHÉANCES  : ce qui tombe ce jour-là.
//
// La rive basse n'est stockée nulle part : elle est *calculée* à rebours depuis
// les échéances (échéance − délai de la pièce). C'est ce qui distingue cette vue
// d'un agenda : elle ne montre pas seulement quand ça tombe, elle montre quand
// il faut agir pour que ça tombe bien.

import type { Case, FloatingTask, Item, MyDaySelection, Event as HenriEvent } from "./types";
import { getDateKey, toDate } from "./dates";
import { getContainerIds } from "./completion";
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
  /** Pour une sous-tâche : la tâche qui la porte — nécessaire pour la
   * resélectionner dans Mes dossiers depuis le calendrier. */
  parentItemId: string | null;
  /** Un mémo se coche ; il n'a ni délai de retour, ni attente à dessiner. */
  isMemo: boolean;
  dueDate: Date | null;         // échéance portée par la tâche (ou l'échéance légale du dossier)
  dueFromCase: boolean;         // l'échéance vient du dossier, pas de la tâche
  reminderAt: Date | null;
  requestedAt: Date | null;     // date de passage au statut « Demandé » (lue dans la timeline)
  receivedAt: Date | null;      // date de passage au statut « Reçu » — l'âge de la bannette
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
  | "recu"        // bannette — la pièce est là, elle attend d'être exploitée
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

/** Tâches en retard par la seule échéance de leur dossier, repliées ensemble :
 * une signature reportée ne doit pas noyer les vraies urgences du sas. */
export type SouffranceGroup = {
  caseId: string;
  caseTitle: string;
  dueDate: Date | null;
  entries: CalendarEntry[];
};

export type CalendarModel = {
  days: DayCell[];
  bars: WaitingBar[];
  /** Toutes les attentes en cours, sans découpe de fenêtre — la réglette. */
  allWaits: WaitingBar[];
  /** Le « sas » : tout ce qui aurait dû être traité et ne l'a pas été. */
  souffrance: CalendarEntry[];
  souffranceGroups: SouffranceGroup[];
  /** La bannette : les pièces reçues qui attendent d'être exploitées. */
  bannette: CalendarEntry[];
  /** Échéances ouvertes par jour, pour les traits de la réglette. */
  dueDays: { date: Date; count: number }[];
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
 * Date du dernier passage à un statut donné, lue dans la timeline d'événements.
 * Aucun champ à ajouter au modèle : Henri journalise déjà les changements de
 * statut (`logStatusEvent`). À défaut d'événement, l'appelant retombe sur
 * `updatedAt`.
 */
export const buildStatusDateIndex = (events: HenriEvent[], status: string) => {
  const index = new Map<string, Date>();
  for (const event of events) {
    if (event.type !== "progress_changed") continue;
    const to = (event.payload as { to?: string } | null | undefined)?.to;
    if (to !== status) continue;
    const at = toDate(event.createdAt);
    if (!at) continue;
    const known = index.get(event.itemId);
    if (!known || at > known) index.set(event.itemId, at);
  }
  return index;
};

export const buildRequestedAtIndex = (events: HenriEvent[]) =>
  buildStatusDateIndex(events, "Demandé");

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
  requestedAt: Date | null,
  receivedAt: Date | null = null
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
    parentItemId: item.parentItemId ?? null,
    isMemo: false,
    dueDate,
    dueFromCase: !own && !!legal,
    reminderAt: toDate(item.reminderAt ?? null),
    requestedAt: item.status === "Demandé" ? (requestedAt ?? toDate(item.updatedAt)) : requestedAt,
    receivedAt: item.status === "Reçu" ? (receivedAt ?? toDate(item.updatedAt)) : receivedAt,
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
  parentItemId: null,
  isMemo: true,
  dueDate: toDate(task.dueDate ?? null),
  dueFromCase: false,
  reminderAt: toDate(task.reminderAt ?? null),
  requestedAt: null,
  receivedAt: null,
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
  const requestedIndex = buildStatusDateIndex(events, "Demandé");
  const receivedIndex = buildStatusDateIndex(events, "Reçu");
  const progressIndex = buildProgressIndex(events);
  const itemsById = new Map(items.map((i) => [i.id, i]));

  // Un contenant — une tâche qui porte des sous-tâches ou des mémos — n'entre
  // pas dans le calendrier. Le calendrier répond à « qu'est-ce que je fais ce
  // jour-là ? » : on ne fait pas un contenant, on fait ce qu'il contient. L'y
  // laisser, c'était afficher deux fois le même travail — la chose et son
  // rangement — et occuper une ligne que rien ne permet de cocher.
  const containerIds = getContainerIds(items, floatingTasks);

  const tasks: CalendarTask[] = [
    ...items
      .filter((item) => !casesById.get(item.caseId)?.archived)
      .filter((item) => !containerIds.has(item.id))
      .map((item) =>
        toCalendarTask(item, casesById.get(item.caseId), requestedIndex.get(item.id) ?? null, receivedIndex.get(item.id) ?? null)
      ),
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
      // Les notes restent « ouvertes » : elles doivent pouvoir porter un rappel.
      // Leur exclusion des rives basses est structurelle — pas d'échéance, donc
      // pas de `launchAt` ; pas d'attente, donc pas de `expectedReturn`.
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
          task: toCalendarTask(item, casesById.get(item.caseId), requestedIndex.get(item.id) ?? null, receivedIndex.get(item.id) ?? null),
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
  // Normalisée contre une charge de référence, pas contre la fenêtre : sinon
  // le jour le plus chargé serait toujours à fond, même dans une semaine
  // calme, et la jauge ne saurait jamais dire « semaine tranquille ».
  const REFERENCE_LOAD = 8;
  const rawLoads = cells.map((cell) => cell.entrant.length + cell.sortant.length * 1.5);
  const maxLoad = Math.max(REFERENCE_LOAD, ...rawLoads);
  cells.forEach((cell, index) => {
    cell.load = Math.min(1, rawLoads[index] / maxLoad);
  });

  // ── Barres d'attente ────────────────────────────────────────────────────
  // `allWaits` porte toutes les attentes en cours, sans découpe : c'est la
  // matière de la réglette. `bars` n'est que sa restriction à la fenêtre.
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  const allWaits: WaitingBar[] = tasks
    .filter((task) => !task.isMemo && task.status === "Demandé" && task.requestedAt && task.expectedReturn)
    .map((task) => ({
      task,
      start: task.requestedAt as Date,
      end: task.expectedReturn as Date,
      overdueFrom: (task.expectedReturn as Date) < todayStart ? (task.expectedReturn as Date) : null,
    }))
    // Une barre qui a dépassé son retour attendu continue de courir jusqu'à
    // aujourd'hui : l'attente n'est pas finie tant que la pièce n'est pas là.
    .map((bar) => ({ ...bar, end: bar.end < todayStart ? todayStart : bar.end }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const bars = allWaits.filter((bar) => bar.end >= windowStart && bar.start <= windowEnd);

  // ── Le sas « en souffrance » ────────────────────────────────────────────
  // Ce qui a franchi sa date et n'a plus de jour où se poser : échéances
  // dépassées, points de non-retour franchis. Dans un calendrier, ce retard-là
  // n'a pas de date — il a un tas, et un tas se met devant la porte.
  //
  // Les relances en retard, elles, ne viennent PAS ici : leur action a une date
  // évidente — aujourd'hui — et elles sont déjà posées sur la rive basse du
  // jour. On évite ainsi de compter deux fois la même tâche.
  const rawSouffrance: CalendarEntry[] = [];
  for (const task of tasks) {
    if (task.isMemo) continue; // un mémo se coche, il ne se met pas en retard ici
    if (!OPEN_STATUSES.has(task.status)) continue;
    if (task.dueDate && task.dueDate < todayStart) {
      rawSouffrance.push({ key: `${task.id}-souffrance-echeance`, task, reason: "echeance", overdue: true });
      continue;
    }
    if (task.status === "Créé" && task.launchAt && task.launchAt < todayStart && task.dueDate) {
      // Le point de non-retour est franchi : l'échéance est mathématiquement
      // menacée même si elle est encore dans le futur.
      rawSouffrance.push({ key: `${task.id}-souffrance-lancement`, task, reason: "lancement", overdue: true });
    }
  }
  rawSouffrance.sort((a, b) => {
    const dateA = a.task.dueDate ?? a.task.expectedReturn ?? a.task.launchAt;
    const dateB = b.task.dueDate ?? b.task.expectedReturn ?? b.task.launchAt;
    return (dateA?.getTime() ?? 0) - (dateB?.getTime() ?? 0);
  });

  // Une tâche en retard par la seule échéance de son dossier rejoint le groupe
  // de ce dossier : une signature reportée verse d'un coup vingt tâches dans le
  // sas, et les vraies urgences — celles qui portent leur propre date —
  // passeraient sous la ligne de flottaison.
  const souffrance = rawSouffrance.filter((entry) => !entry.task.dueFromCase);
  const groupsByCase = new Map<string, CalendarEntry[]>();
  for (const entry of rawSouffrance) {
    if (!entry.task.dueFromCase || !entry.task.caseId) continue;
    const bucket = groupsByCase.get(entry.task.caseId) ?? [];
    bucket.push(entry);
    groupsByCase.set(entry.task.caseId, bucket);
  }
  const souffranceGroups: SouffranceGroup[] = Array.from(groupsByCase.entries())
    .map(([caseId, entries]) => ({
      caseId,
      caseTitle: entries[0].task.caseTitle ?? casesById.get(caseId)?.title ?? "Dossier",
      dueDate: entries[0].task.dueDate,
      entries,
    }))
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

  // ── La bannette ─────────────────────────────────────────────────────────
  // Les pièces reçues et pas encore exploitées. Pas de date, donc pas de
  // colonne : la matière est là, plus rien à anticiper. Tri par marge
  // restante — échéance croissante, puis les sans-échéance, les plus
  // anciennes d'abord. Une pièce reçue dont l'échéance passe n'est pas ici :
  // elle est déjà montée dans le sas.
  const bannette: CalendarEntry[] = tasks
    .filter((task) => !task.isMemo && task.status === "Reçu")
    .filter((task) => !(task.dueDate && task.dueDate < todayStart))
    .map((task) => ({ key: `${task.id}-recu`, task, reason: "recu" as const, overdue: false }))
    .sort((a, b) => {
      const dueA = a.task.dueDate?.getTime();
      const dueB = b.task.dueDate?.getTime();
      if (dueA !== undefined && dueB !== undefined) return dueA - dueB;
      if (dueA !== undefined) return -1;
      if (dueB !== undefined) return 1;
      return (a.task.receivedAt?.getTime() ?? 0) - (b.task.receivedAt?.getTime() ?? 0);
    });

  // ── Échéances par jour, pour les traits de la réglette ──────────────────
  const dueByDay = new Map<string, { date: Date; count: number }>();
  for (const task of tasks) {
    if (!OPEN_STATUSES.has(task.status) || !task.dueDate) continue;
    const key = getDateKey(task.dueDate);
    const known = dueByDay.get(key);
    if (known) known.count += 1;
    else dueByDay.set(key, { date: task.dueDate, count: 1 });
  }
  const dueDays = Array.from(dueByDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  return { days: cells, bars, allWaits, souffrance, souffranceGroups, bannette, dueDays };
};

export const REASON_LABELS: Record<EntryReason, string> = {
  echeance: "Échéance",
  retour: "Retour attendu",
  legal: "Échéance du dossier",
  rappel: "Rappel",
  lancement: "À faire au plus tard",
  relance: "Relance",
  recu: "Reçu — à exploiter",
  fait: "Fait",
};

/** Explication littérale du calcul, affichée au survol. Henri doit savoir se justifier. */
export const explainEntry = (entry: CalendarEntry): string => {
  const { task, reason } = entry;
  const fmt = (date: Date | null) =>
    date ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}` : "?";
  switch (reason) {
    case "lancement":
      return `Échéance ${fmt(task.dueDate)} − ${task.delai.days} j de délai (${task.delai.label}) → à faire le ${fmt(task.launchAt)}`;
    case "relance":
      return `Demandé le ${fmt(task.requestedAt)}, le retour était attendu le ${fmt(task.expectedReturn)} (${task.delai.label})`;
    case "retour":
      return `Demandé le ${fmt(task.requestedAt)} · retour sous ${task.delai.days} j (${task.delai.label})`;
    case "legal":
      return `Échéance du dossier ${task.caseTitle ?? ""}`.trim();
    case "rappel":
      return `Rappel le ${fmt(task.reminderAt)}`;
    case "echeance":
      return `Échéance de la tâche : ${fmt(task.dueDate)}`;
    case "recu":
      return task.dueDate
        ? `Reçu le ${fmt(task.receivedAt)} — à exploiter avant l'échéance du ${fmt(task.dueDate)}`
        : `Reçu le ${fmt(task.receivedAt)} — en attente d'exploitation`;
    case "fait":
      return `Passée en « ${entry.reachedStatus} » ce jour-là`;
  }
};

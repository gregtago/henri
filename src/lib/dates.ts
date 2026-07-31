import type { Timestamp } from "firebase/firestore";

const pad = (value: number) => String(value).padStart(2, "0");

export const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const getTodayKey = () => getDateKey(new Date());

export const getYesterdayKey = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return getDateKey(date);
};

export const getWindowDateKeys = (days: number, endDate: Date = new Date()) => {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - offset);
    keys.push(getDateKey(date));
  }
  return keys;
};

export const getStartOfWindow = (days: number, endDate: Date = new Date()) => {
  const start = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
};

export const dateKeyToDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
};

export const toDate = (
  input?: string | number | Date | Timestamp | { toDate: () => Date } | null
): Date | null => {
  if (!input) {
    return null;
  }
  if (input instanceof Date) {
    return input;
  }
  if (typeof input === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return dateKeyToDate(input);
    }
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof input === "number") {
    return new Date(input);
  }
  if (typeof (input as Timestamp).toDate === "function") {
    return (input as Timestamp).toDate();
  }
  return null;
};

export const formatDateFR = (
  input?: string | number | Date | Timestamp | { toDate: () => Date } | null
) => {
  const date = toDate(input);
  if (!date) {
    return "-";
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const getDateKeyFromValue = (
  input?: string | number | Date | Timestamp | { toDate: () => Date } | null
) => {
  const date = toDate(input);
  return date ? getDateKey(date) : null;
};

// ── Propositions d'échéance ─────────────────────────────────────────────────
//
// Les mêmes six propositions, partout où l'on pose une échéance : détail d'une
// tâche, détail d'un mémo, fenêtre de création, mobile. Elles étaient jusqu'ici
// recopiées dans cinq écrans, avec cinq listes légèrement différentes — « lundi
// prochain » manquait là où on en avait le plus besoin.
//
// **Toutes tombent à 9 h**, l'heure à laquelle on ouvre le dossier. Une échéance
// n'est pas un rendez-vous : ce qui compte est le jour, mais l'heure doit être
// tôt et la même partout, sinon deux échéances du même jour ne se comparent pas.
// (9 h ne glisse jamais d'un jour, quel que soit le fuseau d'affichage.)

/** L'heure de toute échéance posée par Henri. */
export const DUE_HOUR = 9;

/** Une date au jour donné, à l'heure des échéances. */
export const atDueHour = (date: Date) => {
  const next = new Date(date);
  next.setHours(DUE_HOUR, 0, 0, 0);
  return next;
};

const inDaysAtDueHour = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return atDueHour(date);
};

/** Le prochain lundi — jamais aujourd'hui, même un lundi : c'est « la semaine prochaine ». */
export const nextMonday = () => {
  const date = new Date();
  date.setDate(date.getDate() + (((1 - date.getDay()) + 7) % 7 || 7));
  return atDueHour(date);
};

export type DueSuggestion = { label: string; date: Date };

/**
 * Les propositions d'échéance, dans l'ordre où on les lit : le proche d'abord,
 * puis le lundi — le jour où l'on reprend ce qu'on a laissé —, puis le lointain.
 */
export const getDueSuggestions = (options?: { long?: boolean }): DueSuggestion[] => {
  const base: DueSuggestion[] = [
    { label: "Aujourd'hui", date: inDaysAtDueHour(0) },
    { label: "Demain", date: inDaysAtDueHour(1) },
    { label: "Dans 2 j.", date: inDaysAtDueHour(2) },
    { label: "Lundi 9 h", date: nextMonday() },
    { label: "Dans 1 sem.", date: inDaysAtDueHour(7) },
    { label: "Dans 1 mois", date: inDaysAtDueHour(30) },
  ];
  // L'échéance légale d'un dossier se compte en mois, pas en jours.
  if (!options?.long) return base;
  const monthsAhead = (months: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return atDueHour(date);
  };
  return [...base, { label: "Dans 3 mois", date: monthsAhead(3) }, { label: "Dans 6 mois", date: monthsAhead(6) }];
};

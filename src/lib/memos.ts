// Durée de vie d'un mémo réalisé.
//
// Un mémo n'est pas une archive : c'est un pense-bête. Coché, il quitte la
// liste du jour et reste consultable un moment ; puis il s'efface pour de bon.
// Sans ça, la liste des réalisés finit par charrier des mois de petites choses
// faites, et le pense-bête devient un cimetière.
//
// Deux conditions, toutes les deux nécessaires :
// - le mémo est **coché**. Un mémo qu'on n'a pas fait ne disparaît jamais tout
//   seul : ce serait perdre du travail sans l'avoir demandé ;
// - le mémo est **non rattaché** — ni à un dossier, ni à une tâche. Rattaché, un
//   mémo appartient à ce qui le porte : il vit et meurt avec lui.

import type { FloatingTask } from "./types";
import { deleteFloatingTasks } from "./firestore";

/** Au-delà de ce nombre de jours, un mémo réalisé et libre disparaît. */
export const MEMO_TTL_DAYS = 7;

const DAY_MS = 86400000;

const parse = (value?: string | null): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Un mémo réalisé a-t-il dépassé sa durée de vie ?
 *
 * L'âge se compte depuis la réalisation — c'est le seul moment où un mémo
 * cesse d'être utile.
 *
 * Trois garde-fous, parce qu'une suppression ne se rattrape pas :
 * - un mémo **non coché** n'expire jamais, quel que soit son âge ;
 * - un mémo rattaché à un dossier non plus ;
 * - un mémo récurrent non plus (il est appelé à revenir).
 */
export const isExpiredMemo = (memo: FloatingTask, now: Date = new Date()): boolean => {
  if (memo.caseId || memo.parentItemId) return false;
  if (memo.recurrence) return false;
  const done = parse(memo.doneAt);
  if (done === null) return false; // pas coché (ou date illisible) : on n'y touche pas
  return now.getTime() - done > MEMO_TTL_DAYS * DAY_MS;
};

/** Les mémos réalisés arrivés au bout de leurs 7 jours, dans la liste donnée. */
export const listExpiredMemos = (memos: FloatingTask[], now: Date = new Date()): FloatingTask[] =>
  memos.filter((memo) => isExpiredMemo(memo, now));

/**
 * Efface les mémos libres expirés. Sans effet s'il n'y en a aucun.
 * Retourne le nombre de mémos supprimés.
 */
export const purgeExpiredMemos = async (uid: string, memos: FloatingTask[]): Promise<number> => {
  const expired = listExpiredMemos(memos);
  if (expired.length === 0) return 0;
  await deleteFloatingTasks(uid, expired.map((memo) => memo.id));
  return expired.length;
};

/**
 * Les mémos réalisés qu'on doit encore pouvoir consulter : cochés, et cochés
 * il y a moins de {@link MEMO_TTL_DAYS} jours. Les plus récents d'abord.
 */
export const listRecentlyDoneMemos = (memos: FloatingTask[], now: Date = new Date()): FloatingTask[] => {
  const floor = now.getTime() - MEMO_TTL_DAYS * DAY_MS;
  return memos
    .filter((memo) => {
      const done = parse(memo.doneAt);
      return done !== null && done >= floor;
    })
    .sort((a, b) => (parse(b.doneAt) ?? 0) - (parse(a.doneAt) ?? 0));
};

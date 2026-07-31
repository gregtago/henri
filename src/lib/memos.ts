// Durée de vie d'un mémo libre.
//
// Un mémo n'est pas une archive : c'est un pense-bête. Réalisé, il quitte la
// liste du jour et reste consultable un moment ; puis il s'efface pour de bon.
// Sans ça, « Ma journée » finit par charrier des mois de petites choses faites
// ou abandonnées, et le pense-bête devient un cimetière.
//
// La règle ne vaut que pour les mémos **non rattachés**. Rattaché à un dossier,
// un mémo appartient au dossier : il vit et meurt avec lui, jamais tout seul.

import type { FloatingTask } from "./types";
import { getTodayKey } from "./dates";
import { deleteFloatingTasks } from "./firestore";

/** Au-delà de ce nombre de jours, un mémo libre disparaît complètement. */
export const MEMO_TTL_DAYS = 7;

const DAY_MS = 86400000;

const parse = (value?: string | null): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Un mémo libre a-t-il dépassé sa durée de vie ?
 *
 * L'âge se compte depuis la réalisation si le mémo est coché, depuis sa
 * création sinon : un mémo qu'on traîne depuis une semaine sans le faire n'est
 * pas plus à garder qu'un mémo fait il y a une semaine.
 *
 * Trois garde-fous, parce qu'une suppression ne se rattrape pas :
 * - un mémo rattaché à un dossier n'expire jamais ;
 * - un mémo programmé pour un jour à venir non plus (il n'a pas commencé à vivre) ;
 * - un mémo dont l'échéance est encore devant nous non plus ;
 * - un mémo récurrent non plus (il est appelé à revenir).
 */
export const isExpiredMemo = (
  memo: FloatingTask,
  now: Date = new Date(),
  todayKey: string = getTodayKey()
): boolean => {
  if (memo.caseId) return false;
  if (memo.recurrence) return false;
  if (memo.dateKey && memo.dateKey > todayKey) return false;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const due = parse(memo.dueDate);
  if (due !== null && due >= startOfToday.getTime()) return false;

  const born = parse(memo.doneAt) ?? parse(memo.createdAt);
  if (born === null) return false; // date illisible : on ne touche à rien
  return now.getTime() - born > MEMO_TTL_DAYS * DAY_MS;
};

/** Les mémos libres arrivés au bout de leurs 7 jours, dans la liste donnée. */
export const listExpiredMemos = (memos: FloatingTask[], now: Date = new Date()): FloatingTask[] => {
  const todayKey = getTodayKey();
  return memos.filter((memo) => isExpiredMemo(memo, now, todayKey));
};

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

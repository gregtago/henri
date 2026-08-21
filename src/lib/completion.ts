// Ce qu'une tâche porte en dessous d'elle, et ce qu'on en conclut.
//
// Une tâche de dossier peut porter deux sortes d'enfants, et deux seulement :
// des **sous-tâches** (`items` de niveau 3, qui se traitent) et des **mémos**
// (`floatingTasks` posés sous elle, qui se cochent). Les deux natures se
// distinguent partout ailleurs — pas ici : sous une tâche, un mémo pèse
// exactement ce que pèse une sous-tâche.
//
// D'où la règle, qui se lit dans les deux sens :
// - tant qu'il reste un enfant ouvert, la tâche mère ne peut pas passer
//   « Traité » — on ne déclare pas fini ce qui ne l'est pas ;
// - quand le dernier enfant se ferme, la tâche mère passe « Traité » d'elle-même
//   — il n'y a plus rien à y faire, et le redemander serait une corvée.
//
// Ce fichier ne contient que le raisonnement (pur, testable) ; l'écriture qui
// en découle vit dans `updateItemProgress` / `updateFloatingTask`
// (`src/lib/firestore.ts`).

import type { FloatingTask, Item } from "./types";

/**
 * Une tâche est finie quand elle est traitée.
 *
 * La seule lecture de « c'est fait » pour une tâche, et la seule à employer :
 * une tâche traitée est finie sous une tâche mère (elle ne bloque plus rien) et
 * finie partout ailleurs (elle ne se suggère plus, ne tient plus une ligne de
 * Ma journée, ne s'affiche plus en retard). Les vues qui la relisaient à leur
 * façon — « progressLevel !== 3 », « status !== "Traité" » — finissaient par
 * diverger, et une tâche traitée réapparaissait là où on l'avait oubliée.
 */
export const isItemDone = (item: Item) => item.status === "Traité";

/** Un mémo est fini quand il est coché. */
export const isMemoDone = (memo: FloatingTask) => !!memo.doneAt;

/** Les mémos posés sous une tâche. */
export const getItemMemos = (memos: FloatingTask[], itemId: string) =>
  memos.filter((memo) => memo.parentItemId === itemId);

/**
 * Les mémos d'un dossier qui s'affichent au niveau du dossier : ceux qui ne
 * sont pas posés sous une tâche — ou dont la tâche a disparu. Un mémo ne doit
 * jamais devenir invisible parce que sa tâche n'existe plus : il remonte d'un
 * cran plutôt que de se perdre.
 */
export const getCaseLevelMemos = (memos: FloatingTask[], caseId: string, items: Item[]) => {
  const itemIds = new Set(items.map((item) => item.id));
  return memos.filter(
    (memo) => memo.caseId === caseId && !(memo.parentItemId && itemIds.has(memo.parentItemId))
  );
};

/**
 * Une tâche qui porte quelque chose est un **contenant**, pas une tâche.
 *
 * Ce n'est pas un type de plus : c'est une situation. Une tâche devient un
 * contenant dès qu'on lui pose une sous-tâche ou un mémo, et redevient une
 * tâche ordinaire si on les enlève. Le travail réel est descendu d'un cran ;
 * elle, elle ne fait plus que le rassembler.
 *
 * Conséquences, appliquées partout : pas de statut à régler à la main (son
 * état se déduit de ce qu'elle porte) et pas de présence au calendrier (ce
 * sont ses enfants qui se font un jour donné, pas elle).
 */
export const isContainer = (itemId: string, items: Item[], memos: FloatingTask[] = []) =>
  items.some((item) => item.parentItemId === itemId) || getItemMemos(memos, itemId).length > 0;

/**
 * Tous les contenants d'un coup — à préférer dès qu'on en teste plusieurs
 * (une colonne, le calendrier) : un seul passage au lieu d'un par tâche.
 */
export const getContainerIds = (items: Item[], memos: FloatingTask[] = []) => {
  const ids = new Set<string>();
  for (const item of items) if (item.parentItemId) ids.add(item.parentItemId);
  for (const memo of memos) if (memo.parentItemId) ids.add(memo.parentItemId);
  return ids;
};

/** Combien d'enfants sont terminés, sur combien — de quoi lire « 2/5 » sans ouvrir. */
export const getCompletion = (itemId: string, items: Item[], memos: FloatingTask[] = []) => {
  const subItems = items.filter((item) => item.parentItemId === itemId);
  const itemMemos = getItemMemos(memos, itemId);
  const total = subItems.length + itemMemos.length;
  const done = subItems.filter(isItemDone).length + itemMemos.filter(isMemoDone).length;
  return { done, total };
};

/** Ce qui reste ouvert sous une tâche : sous-tâches non traitées et mémos non cochés. */
export const getOpenChildren = (itemId: string, items: Item[], memos: FloatingTask[]) => ({
  subItems: items.filter((item) => item.parentItemId === itemId && !isItemDone(item)),
  memos: getItemMemos(memos, itemId).filter((memo) => !isMemoDone(memo)),
});

/** Combien de choses restent ouvertes sous une tâche — sous-tâches et mémos confondus. */
export const countOpenChildren = (itemId: string, items: Item[], memos: FloatingTask[] = []) => {
  const open = getOpenChildren(itemId, items, memos);
  return open.subItems.length + open.memos.length;
};

/**
 * Ce qui bloque le passage en « Traité », dit en français.
 * `null` si rien ne bloque. Sert aux messages de l'interface, pour que la
 * raison du refus soit la même partout.
 */
export const describeOpenChildren = (itemId: string, items: Item[], memos: FloatingTask[] = []) => {
  const open = getOpenChildren(itemId, items, memos);
  const parts: string[] = [];
  if (open.subItems.length > 0) {
    parts.push(`${open.subItems.length} sous-tâche${open.subItems.length > 1 ? "s" : ""} non traitée${open.subItems.length > 1 ? "s" : ""}`);
  }
  if (open.memos.length > 0) {
    parts.push(`${open.memos.length} mémo${open.memos.length > 1 ? "s" : ""} non réalisé${open.memos.length > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" et ")} — terminez-${open.subItems.length + open.memos.length > 1 ? "les" : "le"} d'abord.`;
};

/**
 * Tout ce que porte cette tâche est-il terminé ?
 *
 * Faux pour une tâche sans enfant : elle n'a rien à conclure, c'est à
 * l'utilisateur de dire où elle en est. Sans ce garde-fou, toute tâche créée
 * naîtrait traitée.
 */
export const areAllChildrenDone = (itemId: string, items: Item[], memos: FloatingTask[] = []) => {
  const subItems = items.filter((item) => item.parentItemId === itemId);
  const itemMemos = getItemMemos(memos, itemId);
  if (subItems.length + itemMemos.length === 0) return false;
  return subItems.every(isItemDone) && itemMemos.every(isMemoDone);
};

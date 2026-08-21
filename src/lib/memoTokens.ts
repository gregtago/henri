// Les jetons d'une saisie de mémo : « # » un dossier, « @ » une échéance,
// « > » une tâche, « ! » l'étoile.
//
// Dans Ma journée, un mémo se tape en une ligne, et cette ligne ne savait rien
// dire de ses réglages. Les poser supposait d'ouvrir la fenêtre de création, ou
// de retrouver le mémo après coup — précisément le geste qu'une ligne de saisie
// existe pour éviter. Un caractère en tête de saisie ouvre donc la proposition
// correspondante ; on en retient une, la ligne repart à vide, et on écrit le
// mémo :
//
//     #dupr  @lundi  !  relancer le syndic pour l'état daté
//     └ dossier      └ échéance (+ son rappel)   └ le mémo
//     ······· └ lundi prochain
//
// Trois règles, les mêmes pour les quatre jetons :
//
// - **un jeton ne se lit qu'en tête de saisie.** « rappeler le client au sujet
//   du lot #3 » est un titre de mémo, pas une recherche de dossier — un
//   caractère au milieu d'une phrase ne doit jamais ouvrir une liste ;
// - **un jeton retenu se consomme** : il disparaît de la saisie et va s'afficher
//   en pastille, avec sa croix. La ligne est de nouveau vide, prête pour le
//   jeton suivant ou pour le titre ;
// - **renoncer ne perd rien** : le caractère tombe et ce qui restait devient le
//   titre (`stripToken`).
//
// Ce que la ligne crée reste un **mémo** — une chose qu'on coche, sans statut —,
// rattaché ou non : les jetons règlent le mémo, ils ne changent pas sa nature
// (voir DESIGN.md, « Deux natures d'objets »).
//
// La lecture de la saisie et l'ordre des propositions vivent ici et nulle part
// ailleurs : desktop (`AppShell`) et mobile (`MobileMyDay`) lisent la même
// saisie de la même façon — l'un au clavier, l'autre au doigt, mais avec les
// mêmes propositions dans le même ordre.

import type { Case, Item } from "./types";
import { isItemDone } from "./completion";
import { getDueSuggestions, type DueSuggestion } from "./dates";

/** Ce qu'un jeton règle sur le mémo. */
export type MemoTokenKind = "case" | "due" | "parent" | "starred";

type TokenSpec = {
  char: string;
  kind: MemoTokenKind;
  /** Ce que le jeton règle, tel qu'on le dit à l'utilisateur. */
  hint: string;
};

/**
 * Les quatre jetons, dans l'ordre où on les présente.
 *
 * `!` n'a pas de liste : il n'y a rien à choisir entre important et pas
 * important. Il se consomme dès la frappe (voir {@link isInstantToken}).
 */
export const MEMO_TOKENS: TokenSpec[] = [
  { char: "#", kind: "case", hint: "dossier" },
  { char: "@", kind: "due", hint: "échéance" },
  { char: ">", kind: "parent", hint: "sous une tâche" },
  { char: "!", kind: "starred", hint: "important" },
];

/** Combien de propositions on affiche au plus — au-delà, on ne lit plus, on cherche. */
export const TOKEN_LIMIT = 6;

export type MemoToken = { kind: MemoTokenKind; char: string; hint: string; query: string };

/**
 * Le jeton ouvert par une saisie, `null` si elle n'en ouvre pas.
 *
 * Un jeton sans requête (« # » seul) renvoie une requête vide : il est ouvert,
 * on n'a pas encore dit quoi. C'est la différence avec `null`, qui veut dire
 * « ceci est un mémo ordinaire ».
 */
export const readToken = (text: string): MemoToken | null => {
  const spec = MEMO_TOKENS.find((entry) => text.startsWith(entry.char));
  if (!spec) return null;
  return {
    kind: spec.kind,
    char: spec.char,
    hint: spec.hint,
    query: text.slice(spec.char.length).trimStart(),
  };
};

/**
 * Un jeton qui se règle sans rien choisir, donc dès la frappe : `!`.
 *
 * Ouvrir une liste de deux lignes « important / pas important » serait un clic
 * pour dire ce que la frappe a déjà dit.
 */
export const isInstantToken = (token: MemoToken | null): boolean =>
  token?.kind === "starred";

/**
 * La saisie débarrassée de son jeton — la sortie de secours.
 *
 * Quand rien ne répond, il faut pouvoir écrire son mémo quand même : on retire
 * le caractère et ce qui restait devient le titre.
 */
export const stripToken = (text: string): string => readToken(text)?.query ?? text;

/**
 * La proposition que la **barre d'espace** retient — `null` s'il y a encore à
 * choisir.
 *
 * Quand la requête n'en laisse qu'une, il n'y a plus rien à sélectionner :
 * l'espace qu'on allait taper pour continuer le nom n'a plus de rival à écarter,
 * autant qu'il retienne et laisse écrire le mémo. Tant que deux propositions
 * répondent, l'espace reste une lettre du nom cherché — un titre de dossier en
 * contient (« #vente dup » doit pouvoir se taper).
 */
export const soleMatch = <T,>(matches: T[]): T | null =>
  matches.length === 1 ? matches[0] : null;

/** Minuscules et sans accents : « Duprés » se trouve en tapant « dupres ». */
export const fold = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const matchesQuery = (haystack: string, needle: string) =>
  !needle || fold(haystack).includes(needle);

/** Trie les titres qui *commencent* par la requête devant les autres. */
const startsFirst = (needle: string) => (a: string, b: string) => {
  if (!needle) return 0;
  const aStarts = fold(a).startsWith(needle);
  const bStarts = fold(b).startsWith(needle);
  return aStarts === bStarts ? 0 : aStarts ? -1 : 1;
};

/**
 * `#` — les dossiers proposés.
 *
 * - **Requête vide** : les derniers dossiers touchés. C'est presque toujours
 *   l'un d'eux — on note un mémo sur le dossier qu'on a sous les yeux.
 * - **Requête** : les dossiers dont le titre la contient, ceux qui *commencent*
 *   par elle d'abord — taper « dup » doit donner « DUPONT » avant
 *   « VENTE DUPONT/MARTIN » —, puis les plus récemment touchés.
 * - Les dossiers **archivés** ne sont jamais proposés : on n'y ajoute plus rien.
 */
export const suggestCases = (
  cases: Case[],
  query: string,
  limit: number = TOKEN_LIMIT
): Case[] => {
  const needle = fold(query.trim());
  const rank = startsFirst(needle);
  return cases
    .filter((entry) => !entry.archived && matchesQuery(entry.title, needle))
    .sort((a, b) => {
      const byRank = rank(a.title, b.title);
      if (byRank !== 0) return byRank;
      const byRecency = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      if (byRecency !== 0) return byRecency;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
};

/**
 * `@` — les échéances proposées.
 *
 * **Les mêmes six propositions que partout ailleurs** (`getDueSuggestions`),
 * dans le même ordre : ce sont celles des puces du détail et de la fenêtre de
 * création, et il n'y a aucune raison qu'une septième naisse ici. La requête
 * filtre les libellés — « @lun » donne « Lundi prochain ».
 */
export const suggestDues = (query: string): DueSuggestion[] => {
  const needle = fold(query.trim());
  return getDueSuggestions().filter((entry) => matchesQuery(entry.label, needle));
};

/**
 * `>` — les tâches sous lesquelles poser le mémo, dans le dossier retenu.
 *
 * Les tâches de **premier niveau** seulement : un mémo descend d'un cran, pas de
 * deux. Sans dossier retenu, il n'y a rien à proposer — un mémo se pose sous une
 * tâche *de son dossier*, il faut donc commencer par « # ».
 *
 * Les tâches **traitées** ne sont pas proposées : on ne pose pas une chose à
 * faire sous une tâche finie. Y accrocher un mémo ouvert la rouvrirait par la
 * bande — une tâche ne peut pas être traitée et porter du travail en cours.
 */
export const suggestTasks = (
  items: Item[],
  caseId: string | null,
  query: string,
  limit: number = TOKEN_LIMIT
): Item[] => {
  if (!caseId) return [];
  const needle = fold(query.trim());
  const rank = startsFirst(needle);
  return items
    .filter(
      (entry) =>
        entry.caseId === caseId &&
        !entry.parentItemId &&
        !isItemDone(entry) &&
        matchesQuery(entry.title, needle)
    )
    .sort((a, b) => {
      const byRank = rank(a.title, b.title);
      if (byRank !== 0) return byRank;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
};

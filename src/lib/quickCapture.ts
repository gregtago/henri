// La saisie d'un mémo **depuis l'extérieur** : un texte, des mémos.
//
// Ma journée a une ligne de saisie, et cette ligne suppose l'application
// ouverte. Or un mémo naît rarement devant l'écran : il naît dans le couloir,
// au téléphone, en sortant d'un rendez-vous. Le geste utile est donc celui qui
// ne demande rien — la touche Action de l'iPhone, un champ, une phrase — et il
// n'a personne pour l'accompagner : pas de liste à choisir, pas de proposition
// à retenir, pas de retour arrière. Le texte part tel qu'il a été dicté.
//
// Ce fichier lit ce texte, et **rien d'autre ne doit le lire** : ni la route
// d'API, ni un futur partage iOS. Deux règles le gouvernent.
//
// **Les jetons sont les mêmes qu'à la saisie** (`memoTokens.ts`) — `#` le
// dossier, `@` l'échéance, `>` la tâche, `!` l'étoile —, dans le même ordre et
// avec les mêmes propositions. Un notaire qui a appris « #dupr » dans Ma
// journée ne doit pas apprendre autre chose pour la touche Action :
//
//     #dupr @lundi ! relancer le syndic pour l'état daté
//
// **Ce qui n'est pas certain n'est pas retenu.** À la saisie, on choisit dans
// une liste ; ici il n'y a personne pour trancher, et deviner classerait un
// mémo dans le mauvais dossier — une erreur qu'on ne verra pas passer. Un jeton
// dont la requête laisse deux réponses possibles est donc **rendu au titre** :
// le mémo s'appelle « #dup relancer le syndic », il est sous les yeux dans Ma
// journée, et il se corrige d'un geste. Perdre le rattachement est réparable,
// se tromper de dossier ne l'est pas.
//
// Une différence, une seule, avec la ligne de saisie : le jeton s'arrête au
// **premier espace**. « #vente dup » se tape à l'écran parce qu'une liste
// répond à chaque lettre ; dicté d'un trait, rien ne dirait où finit le nom du
// dossier et où commence le mémo.

import type { Case, Item } from "./types";
import { fold, readToken, suggestCases, suggestDues, suggestTasks } from "./memoTokens";

/** Au-delà, ce n'est plus une note jetée : c'est un import, et ce n'est pas ce geste-ci. */
export const CAPTURE_MAX_MEMOS = 20;

/** Un titre de mémo tient sur une ligne — au-delà, on tronque plutôt que de refuser. */
export const CAPTURE_MAX_TITLE = 300;

/** Une ligne lue : ce que ses jetons demandent, et ce qui reste de titre. */
export type CaptureLine = {
  caseQuery: string | null;
  dueQuery: string | null;
  parentQuery: string | null;
  starred: boolean;
  title: string;
};

/**
 * Les lignes d'un texte capturé — une ligne, un mémo.
 *
 * Les lignes vides tombent (une dictée en produit), et le nombre est plafonné :
 * un texte de trois pages collé par accident ne doit pas remplir la journée.
 */
export const splitCapture = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, CAPTURE_MAX_MEMOS);

/** Le premier mot de la requête d'un jeton, et ce qui reste après lui. */
const takeWord = (query: string): { word: string; rest: string } => {
  const match = /^(\S+)\s*([\s\S]*)$/.exec(query);
  if (!match) return { word: "", rest: query.trimStart() };
  return { word: match[1], rest: match[2] };
};

/**
 * Ce qu'une ligne demande.
 *
 * Les jetons se lisent **en tête**, l'un après l'autre, dans l'ordre où ils ont
 * été tapés — comme à la saisie, où chaque jeton retenu se consomme et rend la
 * ligne à vide. Un jeton répété ne remplace pas le premier : on garde ce qui a
 * été dit d'abord. Le reste est le titre.
 */
export const readCaptureLine = (line: string): CaptureLine => {
  const read: CaptureLine = {
    caseQuery: null,
    dueQuery: null,
    parentQuery: null,
    starred: false,
    title: "",
  };
  let rest = line.trim();

  for (;;) {
    const token = readToken(rest);
    if (!token) break;
    if (token.kind === "starred") {
      read.starred = true;
      rest = token.query;
      continue;
    }
    const { word, rest: tail } = takeWord(token.query);
    rest = tail;
    if (!word) continue; // « # » seul ne dit rien : le caractère tombe
    if (token.kind === "case" && read.caseQuery === null) read.caseQuery = word;
    else if (token.kind === "due" && read.dueQuery === null) read.dueQuery = word;
    else if (token.kind === "parent" && read.parentQuery === null) read.parentQuery = word;
  }

  read.title = rest.trim().slice(0, CAPTURE_MAX_TITLE);
  return read;
};

/**
 * La seule réponse possible d'une liste de propositions, `null` s'il y a un
 * doute.
 *
 * Une réponse : c'est elle. Plusieurs : celle qui **commence** par la requête,
 * s'il n'y en a qu'une — « dup » désigne « DUPONT » et non « VENTE
 * DUPONT/MARTIN », c'est déjà l'ordre des propositions à l'écran. Sinon rien :
 * personne n'est là pour choisir.
 */
const theOnlyOne = <T,>(matches: T[], title: (entry: T) => string, query: string): T | null => {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const needle = fold(query.trim());
  const starting = matches.filter((entry) => fold(title(entry)).startsWith(needle));
  return starting.length === 1 ? starting[0] : null;
};

/** `#` — le dossier désigné, ou `null` si la requête n'en désigne pas un seul. */
export const resolveCaptureCase = (cases: Case[], query: string | null): Case | null =>
  query ? theOnlyOne(suggestCases(cases, query, CAPTURE_MAX_MEMOS), (entry) => entry.title, query) : null;

/** `@` — l'échéance désignée, en ISO (à 9 h, comme partout), ou `null`. */
export const resolveCaptureDue = (query: string | null): string | null => {
  if (!query) return null;
  const match = theOnlyOne(suggestDues(query), (entry) => entry.label, query);
  return match ? match.date.toISOString() : null;
};

/** `>` — la tâche du dossier retenu sous laquelle poser le mémo, ou `null`. */
export const resolveCaptureParent = (
  items: Item[],
  caseId: string | null,
  query: string | null
): Item | null =>
  query
    ? theOnlyOne(suggestTasks(items, caseId, query, CAPTURE_MAX_MEMOS), (entry) => entry.title, query)
    : null;

/**
 * Le titre à écrire quand un jeton n'a pas été retenu : la requête revient dans
 * le titre, précédée de son caractère, exactement comme elle a été dictée.
 *
 * C'est ce qui rend le doute lisible. Le mémo dit « #dup relancer le syndic » :
 * on voit tout de suite qu'un dossier était demandé et n'a pas été trouvé.
 */
export const restoreQuery = (title: string, char: string, query: string | null): string =>
  query ? `${char}${query} ${title}`.trim().slice(0, CAPTURE_MAX_TITLE) : title;

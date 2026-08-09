// Le jeton dossier d'une saisie de mémo : « # » puis un bout de nom.
//
// Dans Ma journée, un mémo se tape en une ligne, et il lui manquait son
// dossier. Le rattacher supposait d'ouvrir la fenêtre de création, ou de
// retrouver le mémo après coup — précisément le geste qu'une ligne de saisie
// existe pour éviter. Un « # » en tête ouvre donc la liste des dossiers : on en
// choisit un, puis on écrit ce qu'il y a à faire.
//
// Le jeton n'est reconnu qu'en **tête** de saisie. « #dupont » cherche un
// dossier ; « appeler le client au sujet du lot #3 » écrit un mémo, sans quoi
// un dièse au milieu d'une phrase déclencherait une liste de dossiers qu'on
// n'a pas demandée.
//
// La règle vit ici et nulle part ailleurs : desktop (`AppShell`) et mobile
// (`MobileMyDay`) lisent la même saisie de la même façon — l'un au clavier,
// l'autre au doigt, mais avec les mêmes dossiers dans le même ordre.

import type { Case } from "./types";

/** Le caractère qui ouvre la recherche de dossier. */
export const CASE_TOKEN_CHAR = "#";

/** Combien de dossiers on propose au plus — au-delà, on ne lit plus, on cherche. */
export const CASE_TOKEN_LIMIT = 6;

/**
 * La requête de dossier ouverte par une saisie, `null` si elle n'en ouvre pas.
 *
 * « # » seul renvoie une chaîne vide : le jeton est ouvert, on n'a pas encore
 * dit quel dossier. C'est la différence avec `null`, qui veut dire « ceci est
 * un mémo ordinaire ».
 */
export const readCaseQuery = (text: string): string | null => {
  if (!text.startsWith(CASE_TOKEN_CHAR)) return null;
  return text.slice(CASE_TOKEN_CHAR.length).trimStart();
};

/**
 * La saisie débarrassée de son jeton — la sortie de secours.
 *
 * Quand aucun dossier ne répond, il faut pouvoir écrire son mémo quand même :
 * on retire le dièse et ce qui restait devient le titre.
 */
export const stripCaseToken = (text: string): string => {
  const query = readCaseQuery(text);
  return query === null ? text : query;
};

/** Minuscules et sans accents : « Duprés » se trouve en tapant « dupres ». */
const fold = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Les dossiers proposés pour une requête.
 *
 * - **Requête vide** (« # » seul) : les derniers dossiers touchés. C'est presque
 *   toujours l'un d'eux — on note un mémo sur le dossier qu'on a sous les yeux.
 * - **Requête** : les dossiers dont le titre contient la requête, ceux qui
 *   *commencent* par elle d'abord — taper « dup » doit donner « DUPONT » avant
 *   « VENTE DUPONT/MARTIN » —, puis les plus récemment touchés.
 * - Les dossiers **archivés** ne sont jamais proposés : on n'y ajoute plus rien.
 */
export const suggestCases = (
  cases: Case[],
  query: string,
  limit: number = CASE_TOKEN_LIMIT
): Case[] => {
  const needle = fold(query.trim());
  const matches = cases.filter(
    (entry) => !entry.archived && (!needle || fold(entry.title).includes(needle))
  );
  const rank = (entry: Case) => (needle && fold(entry.title).startsWith(needle) ? 0 : 1);
  return matches
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      const byRecency = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      if (byRecency !== 0) return byRecency;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
};

// À quel rythme proposer le second facteur — sans jamais devenir du harcèlement.
//
// `mfaPolicy.ts` dit *quand* le second facteur sera exigé. Ce fichier dit
// seulement *quand le proposer*, et c'est une tout autre question : une
// proposition qui revient à chaque ouverture s'écarte d'un geste sans être
// lue, et la seule chose qu'elle apprend, c'est à cliquer « Plus tard » sans
// regarder. Le jour de l'échéance, elle ne vaudra plus rien.
//
// Le rythme suit donc l'échéance, comme une voix qui se rapproche : très
// espacée tant qu'il reste des mois, quotidienne dans la dernière semaine, à
// chaque ouverture une fois la date passée. Ce n'est jamais bloquant — c'est
// `mfaPolicy.enforced` qui décide de fermer la porte, et lui seul.

import type { MfaStanding } from "./mfaPolicy";

/** La clé qui retient le jour de la dernière proposition. */
export const MFA_NUDGE_KEY = "henri_mfa_nudge";

const DAY_MS = 86400000;

/**
 * Le délai à laisser entre deux propositions, en jours.
 *
 * `null` : ne rien proposer du tout — le compte est déjà équipé, ou la
 * politique ne sait rien dire de lui (date de création illisible : dans le
 * doute, on se tait).
 */
export const nudgeIntervalDays = (standing: MfaStanding): number | null => {
  switch (standing.state) {
    case "enrolled":
    case "unknown":
      return null;
    // L'échéance est passée : à chaque ouverture, sans pour autant fermer.
    case "due":
      return 0;
    case "pending":
      if (standing.daysLeft <= 7) return 1;
      if (standing.daysLeft <= 30) return 7;
      return 14;
  }
};

/**
 * Faut-il proposer le second facteur maintenant ?
 *
 * `lastShown` est l'horodatage de la dernière proposition (`null` : jamais).
 * Une première fois se propose toujours, dès lors que la politique a quelque
 * chose à dire de ce compte.
 */
export const shouldSuggestMfa = (input: {
  standing: MfaStanding;
  lastShown: number | null;
  now?: Date;
}): boolean => {
  const interval = nudgeIntervalDays(input.standing);
  if (interval === null) return false;
  if (input.lastShown === null) return true;
  const now = (input.now ?? new Date()).getTime();
  // Une horloge qui recule (fuseau, réglage manuel) ne doit pas taire la
  // proposition pour quinze jours : un dernier passage « dans le futur » vaut
  // un dernier passage inconnu.
  if (input.lastShown > now) return true;
  return now - input.lastShown >= interval * DAY_MS;
};

/** Le dernier passage, tel que le navigateur s'en souvient. */
export const readLastNudge = (): number | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MFA_NUDGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

/** Retenir qu'on vient de proposer — le stockage refusé n'est pas une erreur. */
export const writeLastNudge = (when: number = Date.now()): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MFA_NUDGE_KEY, String(when));
  } catch {
    // Navigation privée, stockage plein : la proposition reviendra, tant pis.
  }
};

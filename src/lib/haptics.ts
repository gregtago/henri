// Le retour au doigt.
//
// Sur mobile, un bouton qui ne répond pas donne l'impression d'avoir raté sa
// cible : on tape une deuxième fois. Le visuel (`.due-chip:active`) répond
// toujours ; la vibration, elle, dépend de l'appareil.
//
// **Android** (Chrome, Firefox) : `navigator.vibrate` fonctionne.
// **iOS** (Safari, et donc tous les navigateurs de l'iPhone) : l'API n'existe
// pas — Apple ne l'implémente pas, et aucun contournement fiable n'existe depuis
// une page web. La vibration est donc un **bonus**, jamais le seul retour : ce
// qui doit être compris passe par l'écran, ce qui se sent en plus passe par là.
//
// Trois intensités, pour trois sens : on a touché, on a fini, on n'a pas pu.

const canVibrate = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

const buzz = (pattern: number | number[]) => {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Un appareil qui refuse de vibrer ne doit jamais casser le geste demandé.
  }
};

/** Un appui pris en compte — le plus court possible, sinon c'est agaçant. */
export const tapFeedback = () => buzz(10);

/** Quelque chose d'accompli : une tâche traitée, un mémo coché. */
export const successFeedback = () => buzz([12, 40, 18]);

/** Un refus : le geste n'a rien fait, et il faut le sentir. */
export const refusedFeedback = () => buzz([25, 60, 25]);

/** L'appareil sait-il vibrer ? (Pour ne pas promettre ce qu'on ne tiendra pas.) */
export const hasHaptics = canVibrate;

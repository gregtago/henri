// La clé du raccourci : ce qui autorise un iPhone à écrire dans Ma journée.
//
// Une capture depuis la touche Action n'a pas de session : le raccourci n'ouvre
// pas Henri, ne connaît pas le mot de passe et ne saurait pas quoi faire d'un
// écran de connexion. Il lui faut donc un secret à lui, porté par l'appareil et
// révocable sans toucher au compte.
//
// Trois propriétés, et elles tiennent en une phrase chacune :
//
// - **la clé désigne un utilisateur, et rien d'autre** : elle ouvre l'écriture
//   d'un mémo dans Ma journée, pas la lecture des dossiers ;
// - **elle se retire d'un geste** — un bouton dans les Préférences, et le
//   raccourci cesse d'écrire à la seconde ;
// - **elle se remplace sans dommage** : régénérer casse l'ancienne, il n'y a
//   qu'un raccourci à recoller.
//
// Le format est reconnaissable — `hnr_` puis 32 caractères hexadécimaux — pour
// deux raisons : on la reconnaît dans un presse-papiers, et la route d'API
// refuse tout ce qui n'y ressemble pas **avant** d'aller chercher quoi que ce
// soit.
//
// **La clé en clair n'est écrite qu'à un seul endroit** : le réglage de son
// propriétaire (`users/{uid}/settings/shortcut`), protégé comme le reste de ses
// données. L'annuaire clé → utilisateur, lui, est rangé sous l'**empreinte**
// SHA-256 de la clé (`shortcutKeys/{empreinte}`) : il faut présenter la clé pour
// retrouver la ligne, et lire l'annuaire entier n'apprend rien — on ne remonte
// pas d'une empreinte à 128 bits de hasard. Une collection qu'un oubli dans les
// règles Firestore rendrait lisible ne doit rien livrer d'utilisable.

/** Le préfixe qui rend une clé reconnaissable. */
export const SHORTCUT_KEY_PREFIX = "hnr_";

const KEY_PATTERN = /^hnr_[0-9a-f]{32}$/;

/** Une clé de raccourci neuve — 128 bits de hasard cryptographique. */
export const generateShortcutKey = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${SHORTCUT_KEY_PREFIX}${hex}`;
};

/** Le texte a-t-il la forme d'une clé ? À vérifier avant toute lecture. */
export const isShortcutKey = (value: unknown): value is string =>
  typeof value === "string" && KEY_PATTERN.test(value);

/**
 * L'empreinte sous laquelle l'annuaire range la clé.
 *
 * SHA-256 nu, sans sel : le sel protège des secrets devinables (un mot de
 * passe), et il empêcherait ici de retrouver la ligne à partir de la seule clé
 * présentée — ce qui est précisément ce qu'on demande. 128 bits de hasard ne se
 * devinent pas.
 */
export const shortcutKeyHash = async (key: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** La clé telle qu'on l'affiche quand on ne veut pas la montrer en entier. */
export const maskShortcutKey = (key: string): string =>
  isShortcutKey(key) ? `${key.slice(0, 8)}••••••••${key.slice(-4)}` : "";

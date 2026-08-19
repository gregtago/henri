// Le lien qui installe le raccourci — et pourquoi il ne peut pas venir d'Henri.
//
// On aurait aimé qu'Henri fabrique le raccourci lui-même, clé comprise, et le
// serve à l'adresse de son choix : un bouton, un fichier, rien à monter. Apple
// l'interdit. **Depuis iOS 15, un fichier `.shortcut` doit être signé pour être
// importé** ; la signature réclame les clés d'un appareil Apple, et la brèche
// qui laissait passer les fichiers non signés a été refermée dès la deuxième
// bêta d'iOS 15. Un fichier hébergé par nos soins serait refusé sans appel,
// que l'iPhone le télécharge depuis Safari ou par `shortcuts://import-shortcut`.
//
// Le seul lien qui installe un raccourci en un geste est donc **un lien iCloud**
// — celui que l'application Raccourcis produit quand on partage un raccourci
// depuis un iPhone ou un Mac. Il naît d'un appareil, une fois, puis il est
// permanent et vaut pour tout le monde.
//
// D'où le partage des rôles :
//
// - **l'office monte le raccourci une seule fois** et colle ici le lien iCloud
//   obtenu (Préférences → Raccourci iPhone, réservé à l'administrateur) ;
// - **chacun l'installe d'un tap**, puis colle sa propre clé dedans — le
//   raccourci partagé ne contient aucun secret, et c'est heureux : un lien
//   iCloud est public pour qui l'a.
//
// Ce module ne fait qu'une chose, mais il la fait avant l'écriture : vérifier
// que le lien proposé est bien un lien de raccourci iCloud. Un bouton
// « Ajouter le raccourci à mon iPhone » que l'on pourrait pointer ailleurs
// serait une invitation à l'hameçonnage, à demeure, sur l'écran de tous.

/** L'adresse canonique d'un raccourci partagé. */
const SHORTCUT_PATH = /^\/shortcuts\/([0-9A-Za-z]{8,64})\/?$/;

const ICLOUD_HOSTS = new Set(["icloud.com", "www.icloud.com"]);

/**
 * Le lien tel qu'on l'enregistre, `null` si ce n'en est pas un.
 *
 * Toujours ramené à la forme `https://www.icloud.com/shortcuts/…` : le lien
 * copié depuis un iPhone porte parfois une barre finale ou un paramètre de
 * suivi, et l'on ne veut pas de deux écritures pour un même raccourci.
 */
export const normalizeShortcutLink = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !ICLOUD_HOSTS.has(url.hostname)) return null;
  const match = SHORTCUT_PATH.exec(url.pathname);
  return match ? `https://www.icloud.com/shortcuts/${match[1]}` : null;
};

/** Le lien a-t-il la forme attendue ? */
export const isShortcutLink = (value: unknown): value is string => normalizeShortcutLink(value) !== null;

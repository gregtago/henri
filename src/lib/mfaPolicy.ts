// Quand la double authentification devient obligatoire, et pour qui.
//
// Imposer un second facteur du jour au lendemain, c'est enfermer dehors des
// notaires en pleine journée de travail. Ne jamais l'imposer, c'est laisser un
// mot de passe garder seul des dossiers couverts par le secret professionnel.
// La politique tient donc en deux échéances, et **chaque compte porte la
// sienne** :
//
// - **les comptes déjà ouverts** ont une date commune, annoncée : le
//   1er octobre 2026. Ils ont été prévenus, ils ont le temps de s'équiper ;
// - **les comptes créés ensuite** ont trois mois à compter de leur création.
//   Chacun démarre son propre compte à rebours : personne ne s'inscrit la
//   veille d'une échéance qu'il n'a pas vue passer.
//
// L'échéance se **calcule**, elle ne se stocke pas : elle ne dépend que de la
// date de création du compte, que Firebase porte déjà
// (`user.metadata.creationTime`). Rien à écrire, rien à migrer, rien qui puisse
// se désynchroniser.
//
// Enfin, `enforced` : tant qu'il est faux, la politique **s'annonce sans jamais
// bloquer**. C'est ce qui permet de la déployer avant que le second facteur ne
// soit techniquement disponible (il demande Identity Platform) sans risquer de
// verrouiller tout le monde dehors le jour dit.

export type MfaPolicy = {
  /** Les comptes créés avant cette date sont les « comptes existants ». */
  announcedAt: string;
  /** Leur échéance commune, annoncée. */
  existingAccountsDeadline: string;
  /** Le délai laissé aux comptes créés ensuite, en jours. */
  graceDays: number;
  /** Faux : on annonce, on ne bloque pas. */
  enforced: boolean;
};

export const MFA_POLICY: MfaPolicy = {
  announcedAt: "2026-08-19",
  existingAccountsDeadline: "2026-10-01",
  graceDays: 90,
  enforced: false,
};

const DAY_MS = 86400000;

const parseDay = (value: string): Date => new Date(`${value}T00:00:00`);

/**
 * Le jour où ce compte devra présenter un second facteur.
 *
 * `null` si la date de création est illisible — dans le doute on n'impose
 * rien : une date manquante ne doit jamais fermer une porte.
 */
export const mfaDeadline = (
  creationTime: string | null | undefined,
  policy: MfaPolicy = MFA_POLICY
): Date | null => {
  if (!creationTime) return null;
  const created = new Date(creationTime);
  if (Number.isNaN(created.getTime())) return null;
  const announced = parseDay(policy.announcedAt);
  if (created.getTime() < announced.getTime()) return parseDay(policy.existingAccountsDeadline);
  return new Date(created.getTime() + policy.graceDays * DAY_MS);
};

export type MfaStanding =
  /** Second facteur inscrit : plus rien à demander. */
  | { state: "enrolled" }
  /** Pas encore inscrit, échéance à venir : on annonce, on n'empêche rien. */
  | { state: "pending"; deadline: Date; daysLeft: number }
  /** Échéance passée : à inscrire pour continuer (si `enforced`). */
  | { state: "due"; deadline: Date }
  /** Rien à dire — politique inapplicable à ce compte. */
  | { state: "unknown" };

/** Où en est ce compte vis-à-vis de la politique. */
export const mfaStanding = (
  input: { enrolled: boolean; creationTime?: string | null; now?: Date },
  policy: MfaPolicy = MFA_POLICY
): MfaStanding => {
  if (input.enrolled) return { state: "enrolled" };
  const deadline = mfaDeadline(input.creationTime, policy);
  if (!deadline) return { state: "unknown" };
  const now = input.now ?? new Date();
  if (now.getTime() >= deadline.getTime()) return { state: "due", deadline };
  return {
    state: "pending",
    deadline,
    daysLeft: Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS),
  };
};

/**
 * Faut-il barrer la route à ce compte ?
 *
 * Deux conditions, et la seconde est le garde-fou : l'échéance est passée
 * **et** la politique est appliquée. Tant que `enforced` est faux, la réponse
 * est non, quelle que soit la date.
 */
export const mfaBlocks = (standing: MfaStanding, policy: MfaPolicy = MFA_POLICY): boolean =>
  policy.enforced && standing.state === "due";

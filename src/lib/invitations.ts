// L'invitation : ce qui ouvre la porte d'un compte.
//
// Elle naît de deux gestes désormais — l'administrateur qui invite quelqu'un,
// et l'inscription libre d'une adresse du notariat (`signupDomain.ts`). Dans
// les deux cas c'est **le même objet**, la même durée, la même page
// d'atterrissage : un jeton dans `invitations/{token}`, sept jours, puis le
// compte se crée sur `/invite/[token]`.
//
// Le jeton n'est pas seulement une clé, c'est **la preuve de l'adresse** : il
// n'arrive que dans la boîte visée. Une inscription libre ne crée donc jamais
// de compte directement — elle envoie ce lien, et c'est la personne qui le
// reçoit qui crée le compte. Quiconque saisirait l'adresse d'un confrère
// n'obtiendrait rien d'autre que de lui envoyer un courriel.

export const INVITATION_TTL_DAYS = 7;

/** L'adresse publique d'Henri — celle qui part dans les courriels. */
export const BASE_URL = "https://henri.tagot.fr";

export const invitationLink = (token: string) => `${BASE_URL}/invite/${token}`;

/** Le document à écrire pour une invitation neuve. */
export const buildInvitation = (
  email: string,
  options: { name?: string | null; createdBy: string; now?: Date }
) => {
  const now = options.now ?? new Date();
  const expires = new Date(now.getTime() + INVITATION_TTL_DAYS * 86400000);
  return {
    email: email.toLowerCase().trim(),
    name: options.name ?? null,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    status: "pending" as const,
    createdBy: options.createdBy,
  };
};

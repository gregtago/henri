// La vérification d'un administrateur côté serveur.
//
// Les routes d'API comparaient toutes un identifiant en dur ; elles demandent
// désormais à la même liste que les règles de sécurité (voir `superAdmin.ts`).
// Le SDK admin ne passe pas par les règles : c'est ici, et seulement ici, que
// se joue l'autorisation de ces routes.

import { adminAuth, adminDb } from "./firebase-admin";

/** Ce compte est-il administrateur ? */
export const isSuperAdminUid = async (uid: string): Promise<boolean> => {
  try {
    return (await adminDb.doc(`superAdmins/${uid}`).get()).exists;
  } catch {
    return false;
  }
};

/** L'administrateur derrière un jeton Firebase, `null` si ce n'en est pas un. */
export const verifySuperAdminToken = async (idToken?: string | null): Promise<string | null> => {
  if (!idToken) return null;
  try {
    const { uid } = await adminAuth.verifyIdToken(idToken);
    return (await isSuperAdminUid(uid)) ? uid : null;
  } catch {
    return null;
  }
};

/**
 * L'administrateur derrière une requête, `null` sinon.
 *
 * Le jeton se lit dans l'en-tête `Authorization`. Une requête sans en-tête n'est
 * pas une requête de confiance : c'est une requête sans preuve.
 */
export const requireSuperAdmin = async (req: {
  headers: { get(name: string): string | null };
}): Promise<string | null> =>
  verifySuperAdminToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim());

// La vérification d'un administrateur côté navigateur.
//
// Elle interroge la même liste que les règles de sécurité et que le serveur
// (`superAdmins`, voir `superAdmin.ts`). Les règles n'autorisent chacun qu'à
// lire **sa propre** ligne : on peut savoir si l'on est administrateur, jamais
// qui l'est — c'est pourquoi la liste des comptes de l'écran d'administration
// reçoit ce renseignement du serveur, et ne le déduit pas elle-même.
//
// Rien ici ne protège quoi que ce soit : un écran qui se cache reste un écran.
// La protection est dans les règles Firestore et dans les routes d'API ; ceci
// évite seulement d'afficher une page d'administration vide à qui n'y a rien à
// faire.

import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { LEGACY_SUPER_ADMIN_UID } from "./superAdmin";

/** Ce compte est-il administrateur ? */
export const isSuperAdmin = async (uid: string): Promise<boolean> => {
  if (uid === LEGACY_SUPER_ADMIN_UID) return true;
  try {
    return (await getDoc(doc(db, `superAdmins/${uid}`))).exists();
  } catch {
    return false;
  }
};

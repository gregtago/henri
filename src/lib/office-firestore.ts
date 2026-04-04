// ── Firestore — fonctions multi-étude ────────────────────────────────────────
import {
  collection, doc, getDoc, getDocs, setDoc,
  updateDoc, query, where, onSnapshot, addDoc,
  serverTimestamp, deleteDoc
} from "firebase/firestore";
import { db } from "./firebase";
import type { Office, OfficeMember, OfficeRole, Invitation } from "./office-types";
import { v4 as uuidv4 } from "uuid";

// ── Lecture ──────────────────────────────────────────────────────────────────

export const getOffice = async (officeId: string): Promise<Office | null> => {
  const snap = await getDoc(doc(db, `offices/${officeId}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Office : null;
};

export const getOfficeMember = async (officeId: string, uid: string): Promise<OfficeMember | null> => {
  const snap = await getDoc(doc(db, `offices/${officeId}/members/${uid}`));
  return snap.exists() ? snap.data() as OfficeMember : null;
};

export const subscribeOfficeMembers = (
  officeId: string,
  onChange: (members: OfficeMember[]) => void
) => onSnapshot(
  collection(db, `offices/${officeId}/members`),
  snap => onChange(snap.docs.map(d => d.data() as OfficeMember))
);

export const getUserOfficeId = async (uid: string): Promise<string | null> => {
  const snap = await getDoc(doc(db, `users/${uid}/profile/office`));
  return snap.exists() ? (snap.data().officeId ?? null) : null;
};

export const subscribeUserOfficeId = (
  uid: string,
  onChange: (officeId: string | null) => void
) => onSnapshot(
  doc(db, `users/${uid}/profile/office`),
  snap => onChange(snap.exists() ? (snap.data().officeId ?? null) : null)
);

// ── Création étude ───────────────────────────────────────────────────────────

export const createOffice = async (
  uid: string,
  email: string,
  crpcen: string,
  name: string
): Promise<void> => {
  const now = new Date().toISOString();

  // Créer l'étude
  await setDoc(doc(db, `offices/${crpcen}`), {
    id: crpcen,
    name,
    createdAt: now,
    createdBy: uid,
  });

  // Ajouter l'admin comme membre
  await setDoc(doc(db, `offices/${crpcen}/members/${uid}`), {
    uid,
    email,
    role: "admin",
    joinedAt: now,
  } as OfficeMember);

  // Rattacher l'utilisateur à cette étude
  await setDoc(doc(db, `users/${uid}/profile/office`), {
    officeId: crpcen,
    joinedAt: now,
  });
};

// ── Invitations ──────────────────────────────────────────────────────────────

export const createInvitation = async (
  officeId: string,
  email: string,
  role: OfficeRole
): Promise<Invitation> => {
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const token = uuidv4();

  const invitation: Omit<Invitation, "id"> = {
    officeId,
    email,
    role,
    token,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    usedAt: null,
  };

  const ref = await addDoc(collection(db, `offices/${officeId}/invitations`), invitation);
  return { id: ref.id, ...invitation };
};

export const getInvitationByToken = async (token: string): Promise<(Invitation & { officeId: string }) | null> => {
  // Chercher dans toutes les études — en prod on indexerait autrement
  // Pour l'instant on passe le token + officeId dans le lien
  return null; // implémenté côté page /invite/[token]
};

export const subscribeInvitations = (
  officeId: string,
  onChange: (invitations: Invitation[]) => void
) => onSnapshot(
  collection(db, `offices/${officeId}/invitations`),
  snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Invitation))
);

export const deleteInvitation = (officeId: string, invitationId: string) =>
  deleteDoc(doc(db, `offices/${officeId}/invitations/${invitationId}`));

// ── Rejoindre une étude ──────────────────────────────────────────────────────

export const acceptInvitation = async (
  uid: string,
  email: string,
  officeId: string,
  invitationId: string,
  role: OfficeRole
): Promise<void> => {
  const now = new Date().toISOString();

  // 1. Rejoindre l'étude — le membre peut écrire son propre profil
  await setDoc(doc(db, `offices/${officeId}/members/${uid}`), {
    uid, email, role, joinedAt: now,
  } as OfficeMember);

  // 2. Rattacher l'utilisateur à l'étude dans son profil
  await setDoc(doc(db, `users/${uid}/profile/office`), {
    officeId, joinedAt: now,
  });

  // 3. Marquer l'invitation comme utilisée — best effort
  // (peut échouer si l'utilisateur n'est pas admin, ce qui est normal)
  try {
    await updateDoc(doc(db, `offices/${officeId}/invitations/${invitationId}`), {
      usedAt: now,
    });
  } catch {
    // Pas bloquant — l'invitation sera ignorée à la prochaine tentative
    // via la vérification de doublon sur members/{uid}
  }
};

// ── Gestion membres ──────────────────────────────────────────────────────────

export const updateMemberRole = (officeId: string, uid: string, role: OfficeRole) =>
  updateDoc(doc(db, `offices/${officeId}/members/${uid}`), { role });

export const removeMember = async (officeId: string, uid: string) => {
  await deleteDoc(doc(db, `offices/${officeId}/members/${uid}`));
  await deleteDoc(doc(db, `users/${uid}/profile/office`));
};

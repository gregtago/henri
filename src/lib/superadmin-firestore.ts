import {
  collection, doc, getDoc, getDocs,
  setDoc, deleteDoc, writeBatch, query, orderBy
} from "firebase/firestore";
import { db } from "./firebase";
import type { Office, OfficeMember } from "./office-types";

// ── Super-admin — accès global ────────────────────────────────────────────────

export const isSuperAdmin = async (uid: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, `superAdmins/${uid}`));
  return snap.exists();
};

export const getAllOffices = async (): Promise<Office[]> => {
  const snap = await getDocs(collection(db, "offices"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Office);
};

export const getOfficeMembers = async (officeId: string): Promise<OfficeMember[]> => {
  const snap = await getDocs(collection(db, `offices/${officeId}/members`));
  return snap.docs.map(d => d.data() as OfficeMember);
};

export const createOfficeAsAdmin = async (
  crpcen: string,
  name: string,
  adminUid: string,
  adminEmail: string
): Promise<void> => {
  const now = new Date().toISOString();
  await setDoc(doc(db, `offices/${crpcen}`), {
    id: crpcen, name, createdAt: now, createdBy: adminUid,
  });
  await setDoc(doc(db, `offices/${crpcen}/members/${adminUid}`), {
    uid: adminUid, email: adminEmail, role: "admin", joinedAt: now,
  });
  await setDoc(doc(db, `users/${adminUid}/profile/office`), {
    officeId: crpcen, joinedAt: now,
  });
};

export const deleteOffice = async (officeId: string): Promise<void> => {
  // Supprimer tous les membres, invitations, puis l'étude
  const [membersSnap, invitationsSnap] = await Promise.all([
    getDocs(collection(db, `offices/${officeId}/members`)),
    getDocs(collection(db, `offices/${officeId}/invitations`)),
  ]);
  const batch = writeBatch(db);
  membersSnap.docs.forEach(d => batch.delete(d.ref));
  invitationsSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, `offices/${officeId}`));
  await batch.commit();
};

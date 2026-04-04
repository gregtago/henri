import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  where
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Case,
  Comment,
  Event,
  FloatingTask,
  Item,
  MyDaySelection,
  SeedPayload,
  Status
} from "./types";
import { dateKeyToDate, getYesterdayKey as getYesterdayKeyUtil, getTodayKey as getTodayKeyUtil } from "./dates";
import { getProgressLevel } from "./progress";

const nowIso = () => new Date().toISOString();

// ── Collection helper — pointe vers l'étude ───────────────────────────────────
// officeId = CRPCEN de l'étude. uid conservé pour myDaySelections (personnel).
export const officeCollection = (officeId: string, path: string) =>
  collection(db, `offices/${officeId}/${path}`);

// Rétrocompatibilité solo (uid = officeId en mode solo)
export const userCollection = (uid: string, path: string) =>
  collection(db, `users/${uid}/${path}`);

// ── SOUSCRIPTIONS ─────────────────────────────────────────────────────────────

export const subscribeCases = (officeId: string, onChange: (cases: Case[]) => void) =>
  onSnapshot(officeCollection(officeId, "cases"), (snapshot) => {
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Case[];
    onChange(data);
  });

export const subscribeItems = (officeId: string, onChange: (items: Item[]) => void) =>
  onSnapshot(officeCollection(officeId, "items"), (snapshot) => {
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Item[];
    onChange(data);
  });

export const subscribeComments = (officeId: string, onChange: (comments: Comment[]) => void) =>
  onSnapshot(officeCollection(officeId, "comments"), (snapshot) => {
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Comment[];
    onChange(data);
  });

export const subscribeEvents = (officeId: string, onChange: (events: Event[]) => void) =>
  onSnapshot(officeCollection(officeId, "events"), (snapshot) => {
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[];
    onChange(data);
  });

// myDaySelections reste personnel (par utilisateur, pas par étude)
export const subscribeFloatingTasks = (officeId: string, onChange: (tasks: FloatingTask[]) => void) =>
  onSnapshot(officeCollection(officeId, "floatingTasks"), (snapshot) => {
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as FloatingTask[];
    onChange(data);
  });

export const subscribeMyDaySelections = (
  uid: string,
  onChange: (selections: MyDaySelection[]) => void,
  startDate?: Date
) => {
  const baseQuery = userCollection(uid, "myDaySelections");
  const selectionQuery = startDate
    ? query(baseQuery, where("dateTs", ">=", Timestamp.fromDate(startDate)))
    : baseQuery;
  return onSnapshot(selectionQuery, (snapshot) => {
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as MyDaySelection[];
    onChange(data);
  });
};

// ── DOSSIERS ──────────────────────────────────────────────────────────────────

export const createCase = async (officeId: string, payload: Omit<Case, "id" | "createdAt" | "updatedAt">) => {
  const ref = await addDoc(officeCollection(officeId, "cases"), {
    ...payload,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return ref.id;
};

export const updateCase = (officeId: string, id: string, payload: Partial<Case>) =>
  updateDoc(doc(db, `offices/${officeId}/cases/${id}`), { ...payload, updatedAt: nowIso() });

// ── TÂCHES ────────────────────────────────────────────────────────────────────

export const createItem = async (officeId: string, payload: Omit<Item, "id" | "createdAt" | "updatedAt">) => {
  const ref = await addDoc(officeCollection(officeId, "items"), {
    ...payload,
    progressLevel: payload.progressLevel ?? getProgressLevel(payload.status),
    lastProgressAt: payload.lastProgressAt ?? serverTimestamp(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return ref.id;
};

export const updateItem = (officeId: string, id: string, payload: Partial<Item>) =>
  updateDoc(doc(db, `offices/${officeId}/items/${id}`), { ...payload, updatedAt: nowIso() });

export const updateItemProgress = (officeId: string, id: string, status: Status) =>
  updateDoc(doc(db, `offices/${officeId}/items/${id}`), {
    status,
    progressLevel: getProgressLevel(status),
    lastProgressAt: serverTimestamp(),
    updatedAt: nowIso()
  });

// ── COMMENTAIRES & EVENTS ─────────────────────────────────────────────────────

export const createComment = async (officeId: string, payload: Omit<Comment, "id" | "createdAt">) => {
  const ref = await addDoc(officeCollection(officeId, "comments"), {
    ...payload,
    createdAt: nowIso()
  });
  return ref.id;
};

export const createEvent = async (officeId: string, payload: Omit<Event, "id" | "createdAt">) => {
  const ref = await addDoc(officeCollection(officeId, "events"), {
    ...payload,
    createdAt: nowIso()
  });
  return ref.id;
};

// ── TÂCHES VOLANTES ───────────────────────────────────────────────────────────

export const createFloatingTask = async (
  officeId: string,
  payload: Omit<FloatingTask, "id" | "createdAt" | "updatedAt">
) => {
  const ref = await addDoc(officeCollection(officeId, "floatingTasks"), {
    ...payload,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return ref.id;
};

export const updateFloatingTask = (officeId: string, id: string, payload: Partial<FloatingTask>) =>
  updateDoc(doc(db, `offices/${officeId}/floatingTasks/${id}`), { ...payload, updatedAt: nowIso() });

// ── MA JOURNÉE (personnel — reste sur users/) ─────────────────────────────────

export const addMyDaySelection = async (uid: string, payload: Omit<MyDaySelection, "id">) => {
  const dateBase = dateKeyToDate(payload.dateKey) ?? new Date();
  const ref = await addDoc(userCollection(uid, "myDaySelections"), {
    selectionDate: payload.selectionDate ?? Timestamp.fromDate(new Date()),
    dateTs: payload.dateTs ?? Timestamp.fromDate(dateBase),
    ...payload
  });
  return ref.id;
};

export const deleteMyDaySelection = (uid: string, id: string) =>
  deleteDoc(doc(db, `users/${uid}/myDaySelections/${id}`));

// ── SUPPRESSION ───────────────────────────────────────────────────────────────

export const deleteCaseCascade = async (officeId: string, caseId: string, items: Item[]) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, `offices/${officeId}/cases/${caseId}`));
  items.filter((item) => item.caseId === caseId).forEach((item) => {
    batch.delete(doc(db, `offices/${officeId}/items/${item.id}`));
  });
  await batch.commit();
};

export const deleteItemsCascade = async (officeId: string, itemIds: string[], items: Item[]) => {
  const batch = writeBatch(db);
  const toDelete = new Set(itemIds);
  items.forEach((item) => {
    if (toDelete.has(item.id)) {
      batch.delete(doc(db, `offices/${officeId}/items/${item.id}`));
    }
    if (item.parentItemId && toDelete.has(item.parentItemId)) {
      batch.delete(doc(db, `offices/${officeId}/items/${item.id}`));
    }
  });
  await batch.commit();
};

export const deleteFloatingTasks = async (officeId: string, taskIds: string[]) => {
  const batch = writeBatch(db);
  taskIds.forEach((id) => batch.delete(doc(db, `offices/${officeId}/floatingTasks/${id}`)));
  await batch.commit();
};

// ── EVENTS ────────────────────────────────────────────────────────────────────

export const logStatusEvent = async (officeId: string, itemId: string, fromStatus: Status, toStatus: Status) => {
  await createEvent(officeId, {
    itemId,
    type: "progress_changed",
    payload: { from: fromStatus, to: toStatus }
  });
};

// ── SEED DATA ─────────────────────────────────────────────────────────────────

export const ensureSeedData = async (officeId: string, seed: SeedPayload) => {
  const casesSnap = await getDocs(officeCollection(officeId, "cases"));
  if (!casesSnap.empty) return;
  const batch = writeBatch(db);
  const caseIdMap = new Map<string, string>();
  seed.cases.forEach((entry) => {
    const ref = doc(officeCollection(officeId, "cases"));
    caseIdMap.set(entry.title, ref.id);
    batch.set(ref, { ...entry, id: ref.id });
  });
  const itemIdMap = new Map<string, string>();
  seed.items.forEach((entry) => {
    const ref = doc(officeCollection(officeId, "items"));
    const mappedCaseId = caseIdMap.get(entry.caseId) ?? entry.caseId;
    const payload = {
      ...entry,
      id: ref.id,
      caseId: mappedCaseId,
      parentItemId: entry.parentItemId ? itemIdMap.get(entry.parentItemId) ?? null : null
    };
    itemIdMap.set(entry.title, ref.id);
    batch.set(ref, payload);
  });
  seed.comments.forEach((entry) => {
    const ref = doc(officeCollection(officeId, "comments"));
    batch.set(ref, { ...entry, id: ref.id, itemId: itemIdMap.get(entry.itemId) ?? entry.itemId });
  });
  seed.events.forEach((entry) => {
    const ref = doc(officeCollection(officeId, "events"));
    batch.set(ref, { ...entry, id: ref.id, itemId: itemIdMap.get(entry.itemId) ?? entry.itemId });
  });
  seed.floatingTasks.forEach((entry) => {
    const ref = doc(officeCollection(officeId, "floatingTasks"));
    batch.set(ref, { ...entry, id: ref.id });
  });
  await batch.commit();
};

// ── IMPORT / EXPORT ───────────────────────────────────────────────────────────

export const validateImportDepth = (items: Item[]) => items.every((item) => item.level <= 3);

export const exportCaseToJson = (caseData: Case, items: Item[]) =>
  JSON.stringify({ case: caseData, items: items.filter((item) => item.caseId === caseData.id) }, null, 2);

export const importCaseFromJson = async (officeId: string, raw: string, mode: "model" | "history") => {
  const parsed = JSON.parse(raw) as { case: Case; items: Item[] };
  if (!validateImportDepth(parsed.items)) throw new Error("Structure > 3 niveaux détectée.");
  const batch = writeBatch(db);
  const caseRef = doc(officeCollection(officeId, "cases"));
  batch.set(caseRef, { ...parsed.case, id: caseRef.id, createdAt: nowIso(), updatedAt: nowIso() });
  parsed.items.forEach((item) => {
    const ref = doc(officeCollection(officeId, "items"));
    batch.set(ref, {
      ...item,
      id: ref.id,
      caseId: caseRef.id,
      status: mode === "model" ? ("Créée" as Status) : item.status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  });
  await batch.commit();
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

export const getItemsByParent = (items: Item[], parentItemId: string | null) =>
  items.filter((item) => (parentItemId ? item.parentItemId === parentItemId : !item.parentItemId));

export const getItemsByCase = (items: Item[], caseId: string) =>
  items.filter((item) => item.caseId === caseId && !item.parentItemId);

export const getSubItems = (items: Item[], parentItemId: string) =>
  items.filter((item) => item.parentItemId === parentItemId);

export const getTodayKey = () => getTodayKeyUtil();
export const getYesterdayKey = () => getYesterdayKeyUtil();

export const queryMyDayByDate = async (uid: string, dateKey: string) => {
  const q = query(userCollection(uid, "myDaySelections"), where("dateKey", "==", dateKey));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as MyDaySelection[];
};

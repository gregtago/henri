import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
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
  Recurrence,
  RecurringTemplate,
  SeedPayload,
  Status
} from "./types";
import { dateKeyToDate, getYesterdayKey as getYesterdayKeyUtil, getTodayKey as getTodayKeyUtil } from "./dates";
import { getProgressLevel } from "./progress";

const nowIso = () => new Date().toISOString();

export const userCollection = (uid: string, path: string) => collection(db, `users/${uid}/${path}`);

export const subscribeCases = (uid: string, onChange: (cases: Case[]) => void) =>
  onSnapshot(userCollection(uid, "cases"), (snapshot) => {
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Case[];
    onChange(data);
  });

export const subscribeItems = (uid: string, onChange: (items: Item[]) => void) =>
  onSnapshot(userCollection(uid, "items"), (snapshot) => {
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Item[];
    onChange(data);
  });

export const subscribeComments = (uid: string, onChange: (comments: Comment[]) => void) =>
  onSnapshot(userCollection(uid, "comments"), (snapshot) => {
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Comment[];
    onChange(data);
  });

export const subscribeEvents = (uid: string, onChange: (events: Event[]) => void) =>
  onSnapshot(userCollection(uid, "events"), (snapshot) => {
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Event[];
    onChange(data);
  });

export const subscribeFloatingTasks = (uid: string, onChange: (tasks: FloatingTask[]) => void) =>
  onSnapshot(userCollection(uid, "floatingTasks"), (snapshot) => {
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as FloatingTask[];
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
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as MyDaySelection[];
    onChange(data);
  });
};

export const createCase = async (uid: string, payload: Omit<Case, "id" | "createdAt" | "updatedAt">) => {
  const ref = await addDoc(userCollection(uid, "cases"), {
    ...payload,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return ref.id;
};

export const updateCase = (uid: string, id: string, payload: Partial<Case>) =>
  updateDoc(doc(db, `users/${uid}/cases/${id}`), { ...payload, updatedAt: nowIso() });

export const createItem = async (uid: string, payload: Omit<Item, "id" | "createdAt" | "updatedAt">) => {
  const ref = await addDoc(userCollection(uid, "items"), {
    ...payload,
    progressLevel: payload.progressLevel ?? getProgressLevel(payload.status),
    lastProgressAt: payload.lastProgressAt ?? serverTimestamp(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return ref.id;
};

export const updateItem = (uid: string, id: string, payload: Partial<Item>) =>
  updateDoc(doc(db, `users/${uid}/items/${id}`), { ...payload, updatedAt: nowIso() });

export const updateItemProgress = (uid: string, id: string, status: Status) =>
  updateDoc(doc(db, `users/${uid}/items/${id}`), {
    status,
    progressLevel: getProgressLevel(status),
    lastProgressAt: serverTimestamp(),
    updatedAt: nowIso()
  });

export const updateComment = async (uid: string, commentId: string, payload: Partial<Comment>) => {
  const ref = doc(userCollection(uid, "comments"), commentId);
  await updateDoc(ref, payload);
};

export const createComment = async (uid: string, payload: Omit<Comment, "id" | "createdAt">) => {
  const ref = await addDoc(userCollection(uid, "comments"), {
    ...payload,
    createdAt: nowIso()
  });
  return ref.id;
};

export const createEvent = async (uid: string, payload: Omit<Event, "id" | "createdAt">) => {
  const ref = await addDoc(userCollection(uid, "events"), {
    ...payload,
    createdAt: nowIso()
  });
  return ref.id;
};

export const createFloatingTask = async (
  uid: string,
  payload: Omit<FloatingTask, "id" | "createdAt" | "updatedAt">
) => {
  const ref = await addDoc(userCollection(uid, "floatingTasks"), {
    ...payload,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return ref.id;
};

export const updateFloatingTask = (uid: string, id: string, payload: Partial<FloatingTask>) =>
  updateDoc(doc(db, `users/${uid}/floatingTasks/${id}`), { ...payload, updatedAt: nowIso() });

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

export const deleteCaseCascade = async (uid: string, caseId: string, items: Item[]) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, `users/${uid}/cases/${caseId}`));
  items.filter((item) => item.caseId === caseId).forEach((item) => {
    batch.delete(doc(db, `users/${uid}/items/${item.id}`));
  });
  await batch.commit();
};

export const deleteItemsCascade = async (uid: string, itemIds: string[], items: Item[]) => {
  const batch = writeBatch(db);
  const toDelete = new Set(itemIds);
  items.forEach((item) => {
    if (toDelete.has(item.id)) {
      batch.delete(doc(db, `users/${uid}/items/${item.id}`));
    }
    if (item.parentItemId && toDelete.has(item.parentItemId)) {
      batch.delete(doc(db, `users/${uid}/items/${item.id}`));
    }
  });
  await batch.commit();
};

export const deleteFloatingTasks = async (uid: string, taskIds: string[]) => {
  const batch = writeBatch(db);
  taskIds.forEach((id) => batch.delete(doc(db, `users/${uid}/floatingTasks/${id}`)));
  await batch.commit();
};

// ── Recurring Templates ──────────────────────────────────────────────────────

export const subscribeRecurringTemplates = (
  uid: string,
  onChange: (templates: RecurringTemplate[]) => void
) =>
  onSnapshot(userCollection(uid, "recurringTemplates"), (snapshot) => {
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as RecurringTemplate[];
    onChange(data);
  });

export const createRecurringTemplate = async (
  uid: string,
  payload: Omit<RecurringTemplate, "id" | "createdAt" | "updatedAt">
) => {
  const ref = await addDoc(userCollection(uid, "recurringTemplates"), {
    ...payload,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return ref.id;
};

export const updateRecurringTemplate = (
  uid: string,
  id: string,
  payload: Partial<RecurringTemplate>
) =>
  updateDoc(doc(db, `users/${uid}/recurringTemplates/${id}`), {
    ...payload,
    updatedAt: nowIso()
  });

export const deleteRecurringTemplate = (uid: string, id: string) =>
  deleteDoc(doc(db, `users/${uid}/recurringTemplates/${id}`));

export const logStatusEvent = async (uid: string, itemId: string, fromStatus: Status, toStatus: Status) => {
  await createEvent(uid, {
    itemId,
    type: "progress_changed",
    payload: { from: fromStatus, to: toStatus }
  });
};

export const ensureSeedData = async (uid: string, seed: SeedPayload) => {
  const casesSnap = await getDocs(userCollection(uid, "cases"));
  if (!casesSnap.empty) {
    return;
  }
  const batch = writeBatch(db);
  const caseIdMap = new Map<string, string>();
  seed.cases.forEach((entry) => {
    const ref = doc(userCollection(uid, "cases"));
    caseIdMap.set(entry.title, ref.id);
    batch.set(ref, { ...entry, id: ref.id });
  });
  const itemIdMap = new Map<string, string>();
  seed.items.forEach((entry) => {
    const ref = doc(userCollection(uid, "items"));
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
    const ref = doc(userCollection(uid, "comments"));
    const itemId = itemIdMap.get(entry.itemId) ?? entry.itemId;
    batch.set(ref, { ...entry, id: ref.id, itemId });
  });
  seed.events.forEach((entry) => {
    const ref = doc(userCollection(uid, "events"));
    const itemId = itemIdMap.get(entry.itemId) ?? entry.itemId;
    batch.set(ref, { ...entry, id: ref.id, itemId });
  });
  seed.floatingTasks.forEach((entry) => {
    const ref = doc(userCollection(uid, "floatingTasks"));
    batch.set(ref, { ...entry, id: ref.id });
  });
  seed.myDaySelections.forEach((entry) => {
    const ref = doc(userCollection(uid, "myDaySelections"));
    batch.set(ref, { ...entry, id: ref.id });
  });
  await batch.commit();
};

export const validateImportDepth = (items: Item[]) => items.every((item) => item.level <= 3);

export const exportCaseToJson = (caseData: Case, items: Item[]) =>
  JSON.stringify(
    {
      case: caseData,
      items: items.filter((item) => item.caseId === caseData.id)
    },
    null,
    2
  );

export const importCaseFromJson = async (
  uid: string,
  raw: string,
  mode: "model" | "history"
) => {
  const parsed = JSON.parse(raw) as { case: Case; items: Item[] };
  if (!validateImportDepth(parsed.items)) {
    throw new Error("Structure > 3 niveaux détectée.");
  }
  const batch = writeBatch(db);
  const caseRef = doc(userCollection(uid, "cases"));
  batch.set(caseRef, {
    ...parsed.case,
    id: caseRef.id,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  parsed.items.forEach((item) => {
    const ref = doc(userCollection(uid, "items"));
    batch.set(ref, {
      ...item,
      id: ref.id,
      caseId: caseRef.id,
      status: mode === "model" ? ("Créé" as Status) : item.status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  });
  await batch.commit();
};

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
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as MyDaySelection[];
};

// ── Restore (pour annulation de suppression) ─────────────────────────────────

export const restoreCase = async (uid: string, caseData: Case) => {
  await setDoc(doc(db, `users/${uid}/cases/${caseData.id}`), caseData);
};

export const restoreItems = async (uid: string, itemList: Item[]) => {
  const batch = writeBatch(db);
  itemList.forEach(item => {
    batch.set(doc(db, `users/${uid}/items/${item.id}`), item);
  });
  await batch.commit();
};

export const restoreFloatingTasks = async (uid: string, taskList: import("./types").FloatingTask[]) => {
  const batch = writeBatch(db);
  taskList.forEach(task => {
    batch.set(doc(db, `users/${uid}/floatingTasks/${task.id}`), task);
  });
  await batch.commit();
};

// ── Invitations ───────────────────────────────────────────────────────────────

export type Invitation = {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "used";
  createdBy: string;
};

export const createInvitation = async (createdByUid: string, email: string, name?: string): Promise<string> => {
  const token = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 jours
  await setDoc(doc(db, `invitations/${token}`), {
    token,
    email: email.toLowerCase().trim(),
    name: name ?? null,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    status: "pending",
    createdBy: createdByUid,
  });
  return token;
};

export const getInvitation = async (token: string): Promise<Invitation | null> => {
  const snap = await import("firebase/firestore").then(({ getDoc }) =>
    getDoc(doc(db, `invitations/${token}`))
  );
  if (!snap.exists()) return null;
  return snap.data() as Invitation;
};

export const markInvitationUsed = async (token: string): Promise<void> => {
  await updateDoc(doc(db, `invitations/${token}`), { status: "used" });
};

export const subscribeInvitations = (
  onChange: (invitations: Invitation[]) => void
) =>
  onSnapshot(
    collection(db, "invitations"),
    (snapshot) => {
      const data = snapshot.docs
        .map((d) => ({ ...d.data() }) as Invitation)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onChange(data);
    }
  );

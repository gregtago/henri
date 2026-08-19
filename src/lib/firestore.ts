import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  CaseTemplate,
  CaseTemplateItem,
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
import { areAllChildrenDone } from "./completion";
import { listExpiredMemos } from "./memos";

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

/**
 * Faire avancer une tâche d'un statut.
 *
 * Passer une tâche en « Traité » lui retire son échéance. Une échéance dit
 * quand une tâche est attendue ; une tâche traitée n'est plus attendue nulle
 * part. La garder, c'était laisser la tâche revenir en retard, s'annoncer
 * « à échéance aujourd'hui » et occuper une case du calendrier alors qu'il
 * n'y a plus rien à y faire. Le statut porte désormais l'information ; la date
 * ne veut plus rien dire.
 *
 * C'est le seul chemin par lequel une tâche change de statut (détail, raccourcis
 * 1–4, Ma journée, calendrier) : la règle vaut donc partout, sans que chaque
 * appelant ait à y penser. Rouvrir la tâche ne rend pas l'échéance — on la
 * repose si elle a encore un sens.
 */
export const updateItemProgress = async (uid: string, id: string, status: Status) => {
  const ref = doc(db, `users/${uid}/items/${id}`);
  await updateDoc(ref, {
    status,
    progressLevel: getProgressLevel(status),
    lastProgressAt: serverTimestamp(),
    ...(status === "Traité" ? { dueDate: null } : {}),
    updatedAt: nowIso()
  });
  if (status !== "Traité") return;
  const snap = await getDoc(ref);
  const parentItemId = (snap.data()?.parentItemId as string | null | undefined) ?? null;
  if (parentItemId) await completeParentIfAllChildrenDone(uid, parentItemId);
};

/**
 * Une tâche dont tout est fait est faite.
 *
 * Quand le dernier enfant d'une tâche se ferme — dernière sous-tâche traitée ou
 * dernier mémo coché —, la tâche mère passe « Traité » d'elle-même. L'interface
 * interdit déjà de la déclarer traitée tant qu'il reste quelque chose d'ouvert :
 * la conclusion inverse était donc la seule qui restait à la charge de
 * l'utilisateur, et c'était lui demander de confirmer ce qu'il venait de faire.
 *
 * Trois garde-fous :
 * - une tâche **sans enfant** ne conclut rien : c'est à l'utilisateur de dire où
 *   elle en est, sinon toute tâche naîtrait traitée ;
 * - une tâche **déjà traitée** n'est pas retouchée (pas d'événement en double) ;
 * - la lecture se fait au **serveur** (`items` et `floatingTasks` du parent), et
 *   non sur ce que la vue appelante croit savoir : deux enfants fermés coup sur
 *   coup depuis deux écrans donnent quand même la bonne conclusion.
 *
 * L'échec de ce prolongement (hors ligne, règle Firestore) ne doit jamais
 * invalider le geste demandé : on le signale en console et on s'arrête là.
 */
const completeParentIfAllChildrenDone = async (uid: string, parentItemId: string) => {
  try {
    const parentRef = doc(db, `users/${uid}/items/${parentItemId}`);
    const [parentSnap, subSnap, memoSnap] = await Promise.all([
      getDoc(parentRef),
      getDocs(query(userCollection(uid, "items"), where("parentItemId", "==", parentItemId))),
      getDocs(query(userCollection(uid, "floatingTasks"), where("parentItemId", "==", parentItemId)))
    ]);
    if (!parentSnap.exists()) return;
    const parent = { id: parentSnap.id, ...parentSnap.data() } as Item;
    if (parent.status === "Traité") return;
    const subItems = subSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Item[];
    const memos = memoSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as FloatingTask[];
    if (!areAllChildrenDone(parentItemId, subItems, memos)) return;
    await updateItemProgress(uid, parent.id, "Traité");
    await logStatusEvent(uid, parent.id, parent.status, "Traité");
  } catch (err) {
    console.warn("[completeParentIfAllChildrenDone]", err);
  }
};

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

/**
 * Écrire un mémo.
 *
 * Cocher un mémo posé sous une tâche est un geste qui peut en conclure un
 * autre : si c'était la dernière chose ouverte sous cette tâche, la tâche se
 * termine (voir `completeParentIfAllChildrenDone`). Sous une tâche, un mémo
 * pèse exactement ce que pèse une sous-tâche.
 */
export const updateFloatingTask = async (uid: string, id: string, payload: Partial<FloatingTask>) => {
  const ref = doc(db, `users/${uid}/floatingTasks/${id}`);
  await updateDoc(ref, { ...payload, updatedAt: nowIso() });
  if (!payload.doneAt) return;
  const parentItemId = payload.parentItemId !== undefined
    ? payload.parentItemId
    : ((await getDoc(ref)).data()?.parentItemId as string | null | undefined) ?? null;
  if (parentItemId) await completeParentIfAllChildrenDone(uid, parentItemId);
};

/**
 * Efface les mémos libres expirés. Sans effet s'il n'y en a aucun.
 * Retourne le nombre de mémos supprimés.
 */
export const purgeExpiredMemos = async (uid: string, memos: FloatingTask[]): Promise<number> => {
  const expired = listExpiredMemos(memos);
  if (expired.length === 0) return 0;
  await deleteFloatingTasks(uid, expired.map((memo) => memo.id));
  return expired.length;
};

// ── Tokens push (appareils recevant les rappels) ──
export type PushTokenInfo = {
  id: string;                 // = le token FCM (id du doc)
  token?: string;
  userAgent?: string;
  createdAt?: unknown;
  lastSeenAt?: unknown;
};

export const subscribePushTokens = (uid: string, cb: (tokens: PushTokenInfo[]) => void) =>
  onSnapshot(collection(db, `users/${uid}/pushTokens`), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PushTokenInfo, "id">) })))
  );

export const deletePushToken = (uid: string, tokenId: string) =>
  deleteDoc(doc(db, `users/${uid}/pushTokens/${tokenId}`));

// ── Clé du raccourci iOS ──
//
// Elle est **créée et révoquée côté serveur** (`/api/memo/key`), qui tient aussi
// le chemin inverse clé → utilisateur ; l'application, elle, ne fait que la
// lire pour l'afficher dans les Préférences.
export type ShortcutKeyInfo = { key: string; createdAt?: string | null };

export const subscribeShortcutKey = (uid: string, cb: (info: ShortcutKeyInfo | null) => void) =>
  onSnapshot(
    doc(db, `users/${uid}/settings/shortcut`),
    (snap) => cb(snap.exists() ? (snap.data() as ShortcutKeyInfo) : null),
    () => cb(null)
  );

export const addMyDaySelection = async (uid: string, payload: Omit<MyDaySelection, "id">) => {
  // Garde-fou anti-doublon : si une sélection existe déjà pour ce (dateKey, refType, refId),
  // on la réutilise au lieu d'en créer une nouvelle. Évite l'accumulation de doublons quand
  // l'utilisateur clique plusieurs fois sur "Ma journée".
  try {
    const existingSnap = await getDocs(query(
      userCollection(uid, "myDaySelections"),
      where("dateKey", "==", payload.dateKey),
      where("refType", "==", payload.refType),
      where("refId", "==", payload.refId),
    ));
    if (!existingSnap.empty) {
      return existingSnap.docs[0].id;
    }
  } catch (err) {
    // En cas d'échec de la requête (offline, règle Firestore), on laisse passer l'écriture
    // — le doublon sera masqué côté client par la déduplication React.
    console.warn("[addMyDaySelection] dedupe check failed", err);
  }
  const dateBase = dateKeyToDate(payload.dateKey) ?? new Date();
  // ⚠ Important : on applique les valeurs par défaut APRÈS le spread,
  // sinon un payload contenant `selectionDate: null` ou `dateTs: null` écrase
  // les défauts et la sélection devient invisible (subscribeMyDaySelections
  // filtre par `dateTs >= startDate`).
  const { selectionDate, dateTs, ...rest } = payload;
  const ref = await addDoc(userCollection(uid, "myDaySelections"), {
    ...rest,
    selectionDate: selectionDate ?? Timestamp.fromDate(new Date()),
    dateTs: dateTs ?? Timestamp.fromDate(dateBase),
  });
  return ref.id;
};

export const deleteMyDaySelection = (uid: string, id: string) =>
  deleteDoc(doc(db, `users/${uid}/myDaySelections/${id}`));

export const deleteCaseCascade = async (
  uid: string,
  caseId: string,
  items: Item[],
  memos: import("./types").FloatingTask[] = []
) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, `users/${uid}/cases/${caseId}`));
  items.filter((item) => item.caseId === caseId).forEach((item) => {
    batch.delete(doc(db, `users/${uid}/items/${item.id}`));
  });
  // Les mémos rattachés partent avec le dossier : ils n'existent que par lui.
  // (Les détacher d'abord si on veut les garder.)
  memos.filter((memo) => memo.caseId === caseId).forEach((memo) => {
    batch.delete(doc(db, `users/${uid}/floatingTasks/${memo.id}`));
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

// ── Bascule de nature (l'interrupteur « Mémo ») ──────────────────────────────
//
// Une tâche se traite, un mémo se coche. Passer de l'une à l'autre est un seul
// geste — l'interrupteur du panneau de détail — et doit donc être une seule
// fonction, sinon chaque écran refait la bascule à sa façon et l'un des deux
// finit par oublier quelque chose (les commentaires, la tâche parente, un
// garde-fou). Desktop et mobile passent tous les deux par ici.

export type ConversionResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

/**
 * Une tâche devient un mémo.
 *
 * Elle ne bouge pas : même dossier, même tâche parente si c'était une
 * sous-tâche. Ses commentaires sont recopiés dans la note du mémo — puis
 * effacés, puisqu'ils n'ont plus de tâche à qui appartenir.
 *
 * Refus : une tâche qui porte des sous-tâches ou des mémos ne peut pas devenir
 * un mémo, un mémo ne portant rien. La vérification se fait au serveur, pour ne
 * pas dépendre de ce que la vue appelante a chargé.
 */
export const convertItemToMemo = async (uid: string, item: Item): Promise<ConversionResult> => {
  const [subSnap, memoSnap, commentSnap] = await Promise.all([
    getDocs(query(userCollection(uid, "items"), where("parentItemId", "==", item.id))),
    getDocs(query(userCollection(uid, "floatingTasks"), where("parentItemId", "==", item.id))),
    getDocs(query(userCollection(uid, "comments"), where("itemId", "==", item.id)))
  ]);
  if (!subSnap.empty || !memoSnap.empty) {
    return { ok: false, reason: "Cette tâche porte des sous-tâches ou des mémos : un mémo, lui, ne porte rien." };
  }
  const body = commentSnap.docs
    .map((d) => (d.data() as Comment).body)
    .filter(Boolean)
    .join("\n\n");
  const id = await createFloatingTask(uid, {
    dateKey: getTodayKeyUtil(),
    caseId: item.caseId,
    parentItemId: item.parentItemId ?? null,
    title: item.title,
    status: "Créé",
    starred: !!item.starred,
    dueDate: item.dueDate ?? null,
    reminderAt: item.reminderAt ?? null,
    note: body || null,
    doneAt: null
  });
  const batch = writeBatch(db);
  commentSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, `users/${uid}/items/${item.id}`));
  await batch.commit();
  return { ok: true, id };
};

/**
 * Un mémo redevient une tâche, avec ses quatre statuts.
 *
 * Il reprend sa place — le dossier, et la tâche sous laquelle il était posé,
 * dont il devient une sous-tâche. Sa note redevient un commentaire.
 *
 * Refus : un mémo sans dossier ne peut pas devenir une tâche, une tâche
 * appartenant à un dossier. Si la tâche parente a disparu entre-temps, le mémo
 * remonte au niveau du dossier plutôt que de devenir une sous-tâche orpheline.
 */
export const convertMemoToTask = async (uid: string, memo: FloatingTask): Promise<ConversionResult> => {
  if (!memo.caseId) {
    return { ok: false, reason: "Ce mémo n'a pas de dossier : rattachez-le d'abord, une tâche appartient à un dossier." };
  }
  let parentItemId = memo.parentItemId ?? null;
  if (parentItemId) {
    const parentSnap = await getDoc(doc(db, `users/${uid}/items/${parentItemId}`));
    if (!parentSnap.exists()) parentItemId = null;
  }
  const id = await createItem(uid, {
    caseId: memo.caseId,
    parentItemId,
    level: parentItemId ? 3 : 2,
    title: memo.title,
    status: "Créé",
    starred: !!memo.starred,
    dueDate: memo.dueDate ?? null,
    reminderAt: memo.reminderAt ?? null
  });
  if (memo.note) await createComment(uid, { itemId: id, body: memo.note });
  await deleteFloatingTasks(uid, [memo.id]);
  return { ok: true, id };
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
  raw: string
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

  // Pré-générer les nouveaux IDs : ancien id -> nouvel id
  const idMap = new Map<string, string>();
  const refs = parsed.items.map((item) => {
    const ref = doc(userCollection(uid, "items"));
    idMap.set(item.id, ref.id);
    return ref;
  });

  // Écrire en remappant caseId ET parentItemId.
  // Les tâches importées repartent toujours du statut « Créé ».
  parsed.items.forEach((item, i) => {
    batch.set(refs[i], {
      ...item,
      id: refs[i].id,
      caseId: caseRef.id,
      parentItemId: item.parentItemId ? idMap.get(item.parentItemId) ?? null : null,
      status: "Créé" as Status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  });

  await batch.commit();
};

// Importer les tâches d'un fichier JSON dans un dossier déjà existant.
// Réutilise le même format que l'export (`{ case, items }`) : seules les tâches
// sont reprises, le dossier cible reste celui passé en argument.
export const importItemsIntoCase = async (
  uid: string,
  caseId: string,
  raw: string
) => {
  const parsed = JSON.parse(raw) as { case?: Case; items?: Item[] };
  const sourceItems = parsed.items ?? [];
  if (!sourceItems.length) {
    throw new Error("Aucune tâche à importer dans ce fichier.");
  }
  if (!validateImportDepth(sourceItems)) {
    throw new Error("Structure > 3 niveaux détectée.");
  }
  const batch = writeBatch(db);

  // Pré-générer les nouveaux IDs : ancien id -> nouvel id
  const idMap = new Map<string, string>();
  const refs = sourceItems.map((item) => {
    const ref = doc(userCollection(uid, "items"));
    idMap.set(item.id, ref.id);
    return ref;
  });

  // Écrire en rattachant chaque tâche au dossier cible, en remappant parentItemId.
  // Les tâches importées repartent toujours du statut « Créé ».
  sourceItems.forEach((item, i) => {
    batch.set(refs[i], {
      ...item,
      id: refs[i].id,
      caseId,
      parentItemId: item.parentItemId ? idMap.get(item.parentItemId) ?? null : null,
      status: "Créé" as Status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  });

  await batch.commit();
};

// Exporter une liste de tâches au format `{ items }`, réimportable dans un
// dossier existant via « Importer des tâches ».
export const exportItemsToJson = (items: Item[]) =>
  JSON.stringify({ items }, null, 2);

// ── Modèles de dossier (listes de tâches nommées) ──
export const subscribeCaseTemplates = (uid: string, cb: (templates: CaseTemplate[]) => void) =>
  onSnapshot(userCollection(uid, "caseTemplates"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CaseTemplate, "id">) })))
  );

export const createCaseTemplate = async (uid: string, name: string, items: CaseTemplateItem[]) => {
  const ref = await addDoc(userCollection(uid, "caseTemplates"), {
    name,
    items,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return ref.id;
};

export const renameCaseTemplate = (uid: string, id: string, name: string) =>
  updateDoc(doc(db, `users/${uid}/caseTemplates/${id}`), { name, updatedAt: nowIso() });

export const deleteCaseTemplate = (uid: string, id: string) =>
  deleteDoc(doc(db, `users/${uid}/caseTemplates/${id}`));

// Construit la structure d'un modèle à partir des tâches d'un dossier.
export const buildTemplateItems = (items: Item[], caseId: string): CaseTemplateItem[] =>
  items
    .filter((it) => it.caseId === caseId)
    .map((it) => ({
      id: it.id,
      parentItemId: it.parentItemId ?? null,
      level: it.level,
      title: it.title,
      starred: it.starred ?? false,
    }));

// Applique les tâches d'un modèle dans un dossier existant.
// Remappe les ids (parent → enfant), repart du statut « Créé », sans échéance.
export const applyTemplateToCase = async (uid: string, caseId: string, templateItems: CaseTemplateItem[]) => {
  if (!templateItems.length) return;
  const batch = writeBatch(db);
  const idMap = new Map<string, string>();
  const refs = templateItems.map((it) => {
    const ref = doc(userCollection(uid, "items"));
    idMap.set(it.id, ref.id);
    return ref;
  });
  templateItems.forEach((it, i) => {
    batch.set(refs[i], {
      id: refs[i].id,
      caseId,
      parentItemId: it.parentItemId ? idMap.get(it.parentItemId) ?? null : null,
      level: it.level,
      title: it.title,
      starred: it.starred ?? false,
      status: "Créé" as Status,
      dueDate: null,
      reminderAt: null,
      reminderSentAt: null,
      progressLevel: getProgressLevel("Créé"),
      lastProgressAt: serverTimestamp(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
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

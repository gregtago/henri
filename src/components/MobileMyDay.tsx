"use client";

import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import {
  subscribeItems,
  subscribeCases,
  subscribeFloatingTasks,
  subscribeMyDaySelections,
  addMyDaySelection,
  deleteMyDaySelection,
  updateItem,
  updateItemProgress,
  createFloatingTask,
  updateFloatingTask,
  convertItemToMemo,
  convertMemoToTask,
  deleteFloatingTasks,
  logStatusEvent,
} from "@/lib/firestore";
import type { Item, Case, FloatingTask, MyDaySelection, Recurrence, Status } from "@/lib/types";
import { getTodayKey, getDateKeyFromValue, formatDateFR, atDueHour } from "@/lib/dates";
import { getProgressLevel } from "@/lib/progress";
import { countOpenChildren, describeOpenChildren, getCompletion, isContainer } from "@/lib/completion";
import { refusedFeedback, successFeedback, tapFeedback } from "@/lib/haptics";
import { MEMO_TTL_DAYS, listRecentlyDoneMemos, purgeExpiredMemos } from "@/lib/memos";
import { Icon } from "./Icon";
import { ReminderPicker } from "./ReminderPicker";
import { RecurrencePicker } from "./RecurrencePicker";
import { useReminderPolicy, describeRepeat } from "@/lib/reminderPolicy";
import MemoSheet, { emptyMemoDraft, type MemoDraft } from "./MemoSheet";
import MemoSwitch from "./MemoSwitch";
import DueChips from "./DueChips";

const STATUSES: Status[] = ["Créé", "Demandé", "Reçu", "Traité"];
const STATUS_COLORS: Record<string, string> = {
  "Créé":   "#e5e7eb",
  "Demandé": "#fde68a",
  "Reçu":    "#a5f3fc",
  "Traité":  "#bbf7d0",
};
const STATUS_TEXT: Record<string, string> = {
  "Créé":   "#374151",
  "Demandé": "#92400e",
  "Reçu":    "#155e75",
  "Traité":  "#14532d",
};

type SelectionEntry = {
  selectionId: string;
  type: "item" | "floating";
  item?: Item;
  floating?: FloatingTask;
};

/**
 * Le dossier d'une entrée de la journée.
 *
 * Une tâche appartient toujours à un dossier ; un mémo peut y être rattaché.
 * Dans les deux cas c'est la même chose qu'on veut lire sous le titre : de quoi
 * il s'agit. Seul le mémo libre n'a rien à dire ici — il renvoie `null`.
 */
function folderPathOf(entry: SelectionEntry, cases: Case[], items: Item[]) {
  const caseId = entry.item?.caseId ?? entry.floating?.caseId ?? null;
  if (!caseId) return null;
  const caseTitle = cases.find(c => c.id === caseId)?.title ?? "";
  if (!caseTitle) return null;
  const parentItemId = entry.item?.parentItemId ?? entry.floating?.parentItemId ?? null;
  const parentTitle = parentItemId ? items.find(i => i.id === parentItemId)?.title ?? null : null;
  return { caseTitle, parentTitle };
}

/**
 * Le formulaire du mémo ne sert plus qu'à sa **création** : un mémo qui existe
 * s'ouvre dans le panneau de détail, celui-là même qui ouvre une tâche. Deux
 * écrans pour un même objet, c'était donner l'impression de changer
 * d'application en basculant l'interrupteur « Mémo ».
 */
type MemoSheetState = { draft: MemoDraft };

export default function MobileMyDay({ user }: { user: User }) {
  // Réglages de relance (Préférences → Rappels), pour l'interrupteur des rappels.
  const reminderPolicy = useReminderPolicy(user.uid);
  const todayKey = getTodayKey();

  // Data
  const [items, setItems] = useState<Item[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [floatingTasks, setFloatingTasks] = useState<FloatingTask[]>([]);
  const [myDaySelections, setMyDaySelections] = useState<MyDaySelection[]>([]);

  // UI
  const [detailEntry, setDetailEntry] = useState<SelectionEntry | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [groupMyDay, setGroupMyDay] = useState(false);
  useEffect(() => { try { setGroupMyDay(localStorage.getItem("henri:mydayGroup") === "1"); } catch {} }, []);
  const toggleGroupMyDay = () => setGroupMyDay(g => { const v = !g; try { localStorage.setItem("henri:mydayGroup", v ? "1" : "0"); } catch {} return v; });
  const [memoSheet, setMemoSheet] = useState<MemoSheetState | null>(null);
  const [memoText, setMemoText] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);
  const [statusPrompt, setStatusPrompt] = useState<SelectionEntry | null>(null);
  // Le refus d'une bascule de nature, dit sous l'interrupteur (pas de toast ici).
  const [natureNotice, setNatureNotice] = useState<string | null>(null);
  // Recherche de dossier, pour rattacher un mémo depuis son détail.
  const [detailCaseSearch, setDetailCaseSearch] = useState("");
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"unknown" | "granted" | "denied" | "default" | "unsupported">("unknown");
  const [showMobileAnnounce, setShowMobileAnnounce] = useState(false);

  // Annonce ponctuelle : « Mes dossiers » est maintenant sur mobile (affichée une seule fois)
  useEffect(() => {
    const key = `henri_mobile_dossiers_announce_${user.uid}`;
    if (!localStorage.getItem(key)) {
      setShowMobileAnnounce(true);
      localStorage.setItem(key, "1");
    }
  }, [user.uid]);

  // Au montage : vérifier l'état actuel de la permission notification
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
      return;
    }
    setNotifStatus(Notification.permission as any);
    // Si déjà granted, rafraîchir le token pour mise à jour de lastSeenAt
    if (Notification.permission === "granted") {
      import("@/lib/messaging").then(m => m.refreshPushToken(user.uid)).catch(() => {});
    }
  }, [user.uid]);

  const playDone = () => {
    // Le son se coupe (mode silencieux), la vibration passe quand même — et sur
    // iPhone, où l'API n'existe pas, il reste l'animation. Trois retours, aucun
    // obligatoire (voir src/lib/haptics.ts).
    successFeedback();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(523, ctx.currentTime);   // Do
      o.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // Mi
      o.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // Sol
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.5);
    } catch {}
  };

  useEffect(() => {
    const unsubs = [
      subscribeItems(user.uid, setItems),
      subscribeCases(user.uid, setCases),
      subscribeFloatingTasks(user.uid, setFloatingTasks),
      subscribeMyDaySelections(user.uid, setMyDaySelections, new Date(Date.now() - 7 * 86400000)),
    ];
    return () => unsubs.forEach(u => u());
  }, [user.uid]);

  // Entrées du jour — tri unifié : importants → en retard → aujourd'hui → futur → sans date
  const todayEntries = useMemo<SelectionEntry[]>(() => {
    const sels = myDaySelections.filter(s => s.dateKey === todayKey && !pendingRemovalIds.has(s.id));
    const entries: SelectionEntry[] = [];
    for (const s of sels) {
      const item = items.find(i => i.id === s.refId);
      if (item) entries.push({ selectionId: s.id, type: "item", item });
    }
    // Un mémo réalisé quitte la journée. Il reste visible le temps de
    // l'animation de complétion (`completingIds`), puis s'efface de la liste :
    // on le retrouve par le lien « réalisés » en bas.
    const todayFloating = floatingTasks.filter(t =>
      t.status !== "Traité" &&
      t.dateKey != null && t.dateKey <= todayKey &&
      (!t.doneAt || completingIds.has(t.id))
    );
    for (const f of todayFloating) {
      entries.push({ selectionId: f.id, type: "floating", floating: f });
    }

    const startOfToday = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
    const endOfToday = startOfToday + 86400000;

    const meta = (e: SelectionEntry) => {
      const src: any = e.item ?? e.floating;
      const dueRaw = src?.dueDate ?? src?.legalDueDate ?? null;
      const dueTs = dueRaw ? new Date(dueRaw).getTime() : Infinity;
      const hasDue = Number.isFinite(dueTs);
      return {
        starred: Boolean(src?.starred),
        hasDue,
        overdue: hasDue && dueTs < startOfToday,
        dueIsToday: hasDue && dueTs >= startOfToday && dueTs < endOfToday,
        dueTs,
        title: String(src?.title ?? ""),
      };
    };
    const bucket = (m: ReturnType<typeof meta>) => {
      if (m.starred) return 0;
      if (m.overdue) return 1;
      if (m.dueIsToday) return 2;
      if (m.hasDue) return 3;
      return 4;
    };

    return entries.sort((a, b) => {
      const ma = meta(a), mb = meta(b);
      const ba = bucket(ma), bb = bucket(mb);
      if (ba !== bb) return ba - bb;
      if (ma.dueTs !== mb.dueTs) return ma.dueTs - mb.dueTs;
      // À date égale : tâches de dossier avant mémos
      if (a.type !== b.type) return a.type === "item" ? -1 : 1;
      return ma.title.localeCompare(mb.title);
    });
  }, [myDaySelections, items, floatingTasks, todayKey, pendingRemovalIds, completingIds]);

  // Les mémos réalisés récemment — ce que cache le petit lien du bas.
  const doneMemos = useMemo(() => listRecentlyDoneMemos(floatingTasks), [floatingTasks]);

  // Un mémo libre passé les 7 jours s'efface pour de bon. On balaie à chaque
  // arrivée sur la vue : c'est le seul endroit qui regarde les mémos assez
  // souvent pour que la règle se voie.
  useEffect(() => {
    if (floatingTasks.length === 0) return;
    purgeExpiredMemos(user.uid, floatingTasks).catch(err =>
      console.warn("[MobileMyDay] purge des mémos échouée", err)
    );
    // Volontairement au montage seulement : balayer à chaque snapshot
    // relancerait la suppression en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, floatingTasks.length > 0]);

  // Suggestions
  const suggestions = useMemo(() => {
    const addedIds = new Set(myDaySelections.filter(s => s.dateKey === todayKey).map(s => s.refId));
    const itemIdsWithChildren = new Set(items.filter(i => i.parentItemId).map(i => i.parentItemId!));
    const isLeaf = (item: Item) => item.level === 3 || !itemIdsWithChildren.has(item.id);
    const notDone = (item: Item) => getProgressLevel(item.status) !== 3;
    const notAdded = (item: Item) => !addedIds.has(item.id);
    const threshold = new Date(Date.now() - 5 * 86400000);

    return {
      starred: items.filter(i => i.starred && notAdded(i) && notDone(i) && isLeaf(i)),
      overdue: items.filter(i => {
        if (!notAdded(i) || !notDone(i) || i.starred || !isLeaf(i)) return false;
        return i.dueDate && i.dueDate.slice(0, 10) < todayKey;
      }),
      dueToday: items.filter(i => {
        if (!notAdded(i) || !notDone(i) || i.starred || !isLeaf(i)) return false;
        return i.dueDate?.slice(0, 10) === todayKey;
      }),
      recent: items.filter(i => {
        if (!notAdded(i) || !notDone(i) || i.starred || !isLeaf(i)) return false;
        if (i.dueDate && i.dueDate.slice(0, 10) <= todayKey) return false;
        return new Date(i.createdAt) >= threshold;
      }),
    };
  }, [items, myDaySelections, todayKey]);

  const addToMyDay = async (item: Item) => {
    // On NE ferme PAS le panneau de suggestions : la tâche ajoutée disparaît
    // de la liste (elle n'est plus « à suggérer »), ce qui permet d'en basculer
    // plusieurs à la suite sans rouvrir le panneau.
    await addMyDaySelection(user.uid, {
      dateKey: todayKey,
      refType: item.level === 2 ? "item" : "subitem",
      refId: item.id,
    });
  };

  const removeEntry = async (entry: SelectionEntry) => {
    setPendingRemovalIds(prev => new Set([...prev, entry.selectionId]));
    if (entry.type === "item") {
      await deleteMyDaySelection(user.uid, entry.selectionId);
    } else {
      await deleteFloatingTasks(user.uid, [entry.selectionId]);
    }
    if (detailEntry?.selectionId === entry.selectionId) setDetailEntry(null);
  };

  // ── MÉMOS ──
  const openNewMemo = () =>
    setMemoSheet({ draft: { ...emptyMemoDraft(), title: memoText.trim() } });

  // Un refus de bascule ne vaut que pour l'objet ouvert : changer de panneau
  // l'efface.
  useEffect(() => { setNatureNotice(null); setDetailCaseSearch(""); }, [detailEntry?.selectionId]);

  /** Ouvrir un mémo : le même panneau qu'une tâche, pas un formulaire à part. */
  const openMemo = (memo: FloatingTask) =>
    setDetailEntry({ selectionId: memo.id, type: "floating", floating: memo });

  /**
   * Basculer la nature depuis Ma journée — l'interrupteur « Mémo » du panneau.
   *
   * La bascule elle-même vit dans `src/lib/firestore.ts` : desktop et mobile
   * font exactement la même chose, refus compris. Ici on ne s'occupe que de
   * Ma journée — l'objet transformé y reste, et le panneau reste ouvert sur
   * lui : c'est la même chose, d'une autre nature, la refermer donnerait
   * l'impression d'un départ.
   *
   * Le panneau relisant son objet dans la collection, on lui passe en attendant
   * une copie de ce qui vient d'être écrit : le temps que le snapshot arrive,
   * il montre déjà le bon.
   */
  const toggleNature = async (entry: SelectionEntry, item: Item | null, memo: FloatingTask | null) => {
    setNatureNotice(null);
    tapFeedback();
    const stamp = new Date().toISOString();
    if (memo) {
      const result = await convertMemoToTask(user.uid, memo);
      if (!result.ok) { refusedFeedback(); setNatureNotice(result.reason); return; }
      // Le mémo était dans la journée : la tâche y reste, avec sa sélection.
      const selectionId = await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: memo.parentItemId ? "subitem" : "item",
        refId: result.id,
      });
      setDetailEntry({
        selectionId,
        type: "item",
        item: {
          id: result.id,
          caseId: memo.caseId!,
          parentItemId: memo.parentItemId ?? null,
          level: memo.parentItemId ? 3 : 2,
          title: memo.title,
          status: "Créé",
          starred: !!memo.starred,
          dueDate: memo.dueDate ?? null,
          reminderAt: memo.reminderAt ?? null,
          createdAt: stamp,
          updatedAt: stamp,
        },
      });
      return;
    }
    if (!item) return;
    const result = await convertItemToMemo(user.uid, item);
    if (!result.ok) { refusedFeedback(); setNatureNotice(result.reason); return; }
    // La tâche n'existe plus : sa sélection du jour n'a plus rien à désigner.
    if (entry.type === "item") {
      await deleteMyDaySelection(user.uid, entry.selectionId).catch(() => {});
    }
    setDetailEntry({
      selectionId: result.id,
      type: "floating",
      floating: {
        id: result.id,
        dateKey: todayKey,
        caseId: item.caseId,
        parentItemId: item.parentItemId ?? null,
        title: item.title,
        status: "Créé",
        starred: !!item.starred,
        dueDate: item.dueDate ?? null,
        reminderAt: item.reminderAt ?? null,
        doneAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      },
    });
  };

  /**
   * Enregistrer le mémo — création et modification passent par ici, puisque
   * c'est le même formulaire. Rattacher à un dossier ne transforme rien : le
   * mémo garde sa case à cocher, il gagne seulement un dossier.
   */
  const handleSubmitMemo = async (draft: MemoDraft) => {
    // Une échéance à venir programme le mémo pour le bon jour plutôt que
    // d'encombrer la journée en cours.
    const dueKey = draft.dueDate ? getDateKeyFromValue(draft.dueDate) : null;
    const dateKey = dueKey && dueKey > todayKey ? dueKey : todayKey;
    await createFloatingTask(user.uid, {
      dateKey,
      caseId: draft.caseId,
      parentItemId: draft.parentItemId,
      title: draft.title,
      status: "Créé",
      starred: draft.starred,
      dueDate: draft.dueDate,
      reminderAt: draft.reminderAt,
      reminderSentAt: null,
      reminderRepeat: draft.reminderRepeat,
      reminderCount: 0,
      recurrence: draft.recurrence,
      note: draft.note,
      doneAt: null,
    });
    setMemoText("");
    setMemoSheet(null);
  };

  /**
   * Cocher un mémo : il est réalisé, il quitte la journée. On le garde à
   * l'écran le temps de l'animation — la complétion doit se voir.
   */
  const completeMemo = async (memo: FloatingTask) => {
    if (completingIds.has(memo.id)) return;
    setCompletingIds(prev => new Set(prev).add(memo.id));
    playDone();
    await updateFloatingTask(user.uid, memo.id, { doneAt: new Date().toISOString() });
    setTimeout(() => {
      setCompletingIds(prev => { const s = new Set(prev); s.delete(memo.id); return s; });
    }, 420);
  };

  /** Décocher un mémo réalisé : il revient dans la journée. */
  const uncompleteMemo = async (memo: FloatingTask) => {
    await updateFloatingTask(user.uid, memo.id, { doneAt: null, dateKey: todayKey });
  };

  /**
   * Cocher une tâche dans Ma journée : elle ne se « réalise » pas, elle
   * avance. On demande donc où elle en est, puis elle sort de la journée —
   * en restant, bien sûr, dans son dossier.
   */
  const handleStatusChange = async (entry: SelectionEntry, status: Status) => {
    if (entry.type !== "item" || !entry.item) return;
    // Un contenant n'a pas de statut à régler : il suit ce qu'il porte.
    if (isContainer(entry.item.id, items, floatingTasks)) return;
    if (status === "Traité" && countOpenChildren(entry.item.id, items, floatingTasks) > 0) return; // bloqué
    if (status !== entry.item.status) {
      await updateItemProgress(user.uid, entry.item.id, status);
      await logStatusEvent(user.uid, entry.item.id, entry.item.status, status);
    }
    // Le détail garde sa propre copie de la tâche : on y répercute le statut, et
    // la disparition de l'échéance qui l'accompagne quand la tâche est traitée.
    setDetailEntry(prev => prev?.item?.id === entry.item!.id
      ? { ...prev, item: { ...prev.item!, status, ...(status === "Traité" ? { dueDate: null } : {}) } }
      : prev);
  };

  const handleStatusPromptChoice = async (entry: SelectionEntry, status: Status) => {
    setStatusPrompt(null);
    playDone();
    await handleStatusChange(entry, status);
    await removeEntry(entry);
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  const caseOf = (item: Item) => cases.find(c => c.id === item.caseId)?.title ?? "";

  // Ma journée regroupée par dossier (option). Sinon, ordre inchangé.
  const displayEntries = useMemo(() => {
    if (!groupMyDay) return todayEntries.map(e => ({ entry: e, header: null as string | null }));
    const MEMO = "Sans dossier";
    const groups = new Map<string, SelectionEntry[]>();
    for (const e of todayEntries) {
      // Un mémo rattaché à un dossier se range avec lui, comme une tâche.
      const label = folderPathOf(e, cases, items)?.caseTitle ?? MEMO;
      const arr = groups.get(label) ?? [];
      arr.push(e);
      groups.set(label, arr);
    }
    const labels = [...groups.keys()].sort((a, b) => {
      if (a === MEMO) return 1;
      if (b === MEMO) return -1;
      return a.localeCompare(b, "fr");
    });
    const out: { entry: SelectionEntry; header: string | null }[] = [];
    for (const label of labels) {
      groups.get(label)!.forEach((e, i) => out.push({ entry: e, header: i === 0 ? label : null }));
    }
    return out;
  }, [groupMyDay, todayEntries, cases, items]);
  const parentOf = (item: Item) => item.parentItemId ? items.find(i => i.id === item.parentItemId)?.title : null;

  // ── RENDU ──
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#f9fafb", overflow: "hidden", position: "relative" }}>

      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #e5e7eb", height: "48px", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Accès Mes dossiers — haut à gauche */}
          <Link
            href="/"
            style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, textDecoration: "none" }}
            title="Mes dossiers"
            aria-label="Mes dossiers"
          >
            <Icon name="folder" size={16} />
          </Link>
          <img src="/logo-henri-new.png" alt="Henri" style={{ height: "24px" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <button
            onClick={() => setAccountMenuOpen(p => !p)}
            style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #e5e7eb", background: accountMenuOpen ? "#111827" : "#f9fafb", color: accountMenuOpen ? "white" : "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            title="Compte"
          >
            <Icon name="user" size={16} />
          </button>
        </div>

        {/* Menu compte */}
        {accountMenuOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setAccountMenuOpen(false)} />
            <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 12, background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: "220px", zIndex: 40, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6" }}>
                <p style={{ fontSize: "10px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Connecté</p>
                <p style={{ fontSize: "13px", color: "#111827", marginTop: "4px", wordBreak: "break-all" }}>{user.email}</p>
              </div>

              {/* Notifications */}
              {notifStatus !== "unsupported" && (
                <button
                  onClick={async () => {
                    if (notifStatus === "granted") {
                      // Désactiver
                      const m = await import("@/lib/messaging");
                      await m.disablePushNotifications(user.uid);
                      // L'utilisateur doit retirer la permission OS manuellement,
                      // donc l'état reste "granted" mais le token est supprimé.
                      alert("Notifications désactivées pour cet appareil. Pour les retirer définitivement, modifiez les permissions du site dans votre navigateur.");
                      setAccountMenuOpen(false);
                    } else {
                      // Activer
                      const m = await import("@/lib/messaging");
                      const res = await m.enablePushNotifications(user.uid);
                      if (res.ok) {
                        setNotifStatus("granted");
                        alert("Rappels activés ! Tu recevras une notification quand tu programmes un rappel sur une tâche ou un mémo.");
                      } else {
                        if (res.reason === "denied") alert("Permission refusée. Modifie les permissions du site dans les réglages de ton navigateur pour réactiver.");
                        else if (res.reason === "no-vapid") alert("Configuration serveur incomplète. Contacte le support.");
                        else if (res.reason === "unsupported") alert("Ton navigateur ne supporte pas les notifications. Sur iPhone, installe d'abord l'application sur l'écran d'accueil.");
                        else alert("Une erreur s'est produite. Réessaie.");
                      }
                      setAccountMenuOpen(false);
                    }
                  }}
                  style={{ display: "flex", width: "100%", textAlign: "left", padding: "12px 14px", fontSize: "14px", color: "#374151", background: "white", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", fontFamily: "inherit", alignItems: "center", gap: "8px" }}>
                  <Icon name="time" size={16} style={{ color: notifStatus === "granted" ? "#16a34a" : "#9ca3af" }} />
                  <span style={{ flex: 1 }}>
                    {notifStatus === "granted" ? "Rappels activés" : "Activer les rappels"}
                  </span>
                  {notifStatus === "granted" && (
                    <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 600 }}>✓</span>
                  )}
                </button>
              )}

              <button
                onClick={async () => {
                  setAccountMenuOpen(false);
                  const { signOut } = await import("firebase/auth");
                  const { auth } = await import("@/lib/firebase");
                  await signOut(auth);
                }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", fontSize: "14px", color: "#dc2626", background: "white", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Déconnexion
              </button>
            </div>
          </>
        )}
      </header>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 100px" }}>
        {todayEntries.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: "80px", color: "#9ca3af" }}>
              <p style={{ fontSize: "48px", marginBottom: "16px" }}>☀️</p>
              <p style={{ fontSize: "18px", fontWeight: 600, color: "#374151" }}>C'est une belle journée</p>
              <p style={{ fontSize: "14px", marginTop: "8px", color: "#9ca3af" }}>Ajoutez des tâches via les suggestions 🔭</p>
            </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={toggleGroupMyDay}
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontFamily: "inherit", padding: "5px 11px", borderRadius: "16px", border: "1px solid #e5e7eb", background: groupMyDay ? "#111827" : "white", color: groupMyDay ? "white" : "#374151", cursor: "pointer" }}>
                <Icon name="folder" size={12} /> Par dossier
              </button>
            </div>
            {displayEntries.map(({ entry, header }) => {
              const title = entry.item?.title ?? entry.floating?.title ?? "";
              const status = entry.item?.status ?? null;
              const starred = Boolean(entry.item?.starred || entry.floating?.starred);
              const dueDate = entry.item?.dueDate ?? entry.floating?.dueDate ?? null;
              const isOverdue = dueDate && dueDate.slice(0, 10) < todayKey;
              const recurrence = entry.floating?.recurrence ?? null;

              // Le dossier, sous le titre — tâche comme mémo rattaché. Quand la
              // liste est déjà regroupée par dossier, l'en-tête le dit : la
              // ligne ne garde alors que la tâche parente, pour ne pas répéter.
              const folder = folderPathOf(entry, cases, items);
              const folderLabel = !folder
                ? ""
                : groupMyDay
                  ? folder.parentTitle ?? ""
                  : folder.caseTitle + (folder.parentTitle ? ` › ${folder.parentTitle}` : "");

              // Date relative compacte (style desktop)
              const relativeLabel = (() => {
                if (!dueDate) return null;
                const startOfToday = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
                const dueDay = (() => { const d = new Date(dueDate); d.setHours(0,0,0,0); return d.getTime(); })();
                const diff = Math.round((dueDay - startOfToday) / 86400000);
                if (diff === 0) return null; // aujourd'hui = rien
                return diff > 0 ? `+${diff}` : `${diff}`;
              })();

              // Filet (box-shadow inset, pas border, pour ne pas décaler le contenu)
              const statusColors: Record<string, string> = {
                "Créé": "#d1d5db", "Demandé": "#fbbf24", "Reçu": "#60a5fa", "Traité": "#34d399",
              };
              const filet = entry.floating
                ? "none"
                : `inset 3px 0 0 ${statusColors[status ?? "Créé"] ?? "#d1d5db"}`;

              // Coche verte pendant l'animation de complétion, juste avant que
              // la ligne quitte la liste.
              const checking = !!entry.floating && completingIds.has(entry.floating.id);

              return (
                <Fragment key={entry.selectionId}>
                {header && (
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "8px 2px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="folder" size={11} /> {header}
                  </p>
                )}
                <div
                  onClick={() => setDetailEntry(entry)}
                  style={{
                    background: starred ? "rgba(251,191,36,0.10)" : "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    cursor: "pointer",
                    boxShadow: filet,
                  }}>
                  {/* Même case à cocher pour tout le monde. Ce qu'elle déclenche
                      diffère : un mémo se réalise d'un geste, une tâche demande
                      d'abord où elle en est. */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (entry.floating) { void completeMemo(entry.floating); return; }
                      // Un contenant n'a pas de statut à choisir : il n'y a rien
                      // à demander, il quitte simplement la journée.
                      if (entry.item && isContainer(entry.item.id, items, floatingTasks)) {
                        playDone();
                        void removeEntry(entry);
                        return;
                      }
                      setStatusPrompt(entry);
                    }}
                    aria-label={entry.floating ? "Marquer réalisé" : "Faire évoluer le statut"}
                    style={{
                      width: "26px", height: "26px", borderRadius: "7px", flexShrink: 0, marginTop: "1px",
                      border: checking ? "none" : "2px solid #9ca3af",
                      background: checking ? "#16a34a" : "white",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s ease",
                    }}>
                    {checking && <Icon name="check" size={16} strokeWidth={2.5} style={{ color: "white" }} />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0, opacity: checking ? 0.45 : 1, transition: "opacity 0.3s" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                      <p style={{ fontSize: "15px", fontWeight: starred ? 600 : 500, color: "#111827", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.35 }}>
                        {title}
                      </p>
                      {relativeLabel && (
                        <span style={{ fontSize: "12px", color: isOverdue ? "#ef4444" : "#9ca3af", fontWeight: isOverdue ? 600 : 400, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          {isOverdue && <Icon name="warning" size={11} />}
                          {relativeLabel}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", minHeight: "16px" }}>
                      {folderLabel ? (
                        <span style={{ fontSize: "11.5px", color: "#6b7280", flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", gap: "4px", overflow: "hidden" }}>
                          <Icon name="folder" size={11} style={{ flexShrink: 0, color: "#9ca3af" }} />
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {folderLabel}
                          </span>
                        </span>
                      ) : (
                        <span style={{ flex: 1 }} />
                      )}
                      {recurrence && (
                        <span style={{ color: "#9ca3af", flexShrink: 0, display: "inline-flex", alignItems: "center" }} title="Récurrent">
                          <Icon name="recurrence" size={11} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Une tâche se retire de la journée sans rien changer à son
                      dossier — c'est la seule chose qu'un mémo n'a pas. */}
                  {entry.item && (
                    <button
                      onClick={e => { e.stopPropagation(); removeEntry(entry); }}
                      aria-label="Retirer de Ma journée"
                      title="Retirer de Ma journée"
                      style={{
                        width: "26px", height: "26px", borderRadius: "7px", border: "none",
                        background: "transparent", color: "#d1d5db", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px",
                      }}>
                      <Icon name="close" size={16} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
                </Fragment>
              );
            })}
          </div>
        )}

        {/* Ce qui est fait ne reste pas dans le chemin, mais reste consultable. */}
        {doneMemos.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: "18px" }}>
            <button onClick={() => setDoneOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontFamily: "inherit", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "6px 10px" }}>
              <Icon name="check" size={13} strokeWidth={2} />
              {doneMemos.length} mémo{doneMemos.length > 1 ? "s" : ""} réalisé{doneMemos.length > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Barre du bas */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "10px 12px 24px", display: "flex", gap: "8px", alignItems: "center" }}>
        <button onClick={() => setSuggestionsOpen(true)}
          style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#f3f4f6", border: "1px solid #e5e7eb", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          🔭
        </button>
        <input
          value={memoText}
          onChange={e => setMemoText(e.target.value)}
          onKeyDown={async e => {
            if (e.key === "Enter") {
              const text = memoText.trim();
              if (!text) return;
              setMemoText("");
              await createFloatingTask(user.uid, {
                title: text,
                dateKey: todayKey,
                note: null,
                dueDate: null,
                starred: false,
                status: "Créé",
                doneAt: null,
              });
            }
          }}
          placeholder="Nouveau mémo…"
          style={{ flex: 1, height: "44px", borderRadius: "12px", border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: "15px", padding: "0 14px", outline: "none", fontFamily: "inherit", color: "#111827" }}
        />
        <button onClick={openNewMemo}
          style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#111827", color: "white", border: "none", fontSize: "22px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          +
        </button>
      </div>

      {/* ── FORMULAIRE DU MÉMO (création) ──
        * Un mémo déjà créé se modifie dans le panneau de détail, comme une
        * tâche. */}
      {memoSheet && (
        <MemoSheet
          key="new"
          initial={memoSheet.draft}
          cases={cases}
          items={items}
          onSubmit={handleSubmitMemo}
          onClose={() => setMemoSheet(null)}
          defaultRepeat={reminderPolicy.repeatEnabled}
          repeatLabel={describeRepeat(reminderPolicy)}
        />
      )}

      {/* ── MÉMOS RÉALISÉS ── */}
      {doneOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setDoneOpen(false)}>
          <div style={{ width: "100%", maxHeight: "80dvh", background: "white", borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#111827" }}>Mémos réalisés</p>
              <button onClick={() => setDoneOpen(false)} aria-label="Fermer"
                style={{ width: "30px", height: "30px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f9fafb", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {doneMemos.length === 0 ? (
                <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "14px", padding: "24px 0" }}>Rien de réalisé ces derniers jours.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {doneMemos.map(memo => (
                    <div key={memo.id}
                      style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", background: "white", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
                      <button onClick={() => uncompleteMemo(memo)}
                        aria-label="Remettre à faire"
                        title="Remettre à faire"
                        style={{ width: "24px", height: "24px", borderRadius: "7px", border: "none", background: "#16a34a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
                        <Icon name="check" size={15} strokeWidth={2.5} style={{ color: "white" }} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={() => { setDoneOpen(false); openMemo(memo); }}>
                        <p style={{ fontSize: "14.5px", color: "#6b7280", textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {memo.title}
                        </p>
                        <p style={{ fontSize: "11.5px", color: "#9ca3af", marginTop: "3px" }}>
                          Fait le {formatDateFR(memo.doneAt)}
                          {memo.caseId ? ` · ${cases.find(c => c.id === memo.caseId)?.title ?? ""}` : ""}
                        </p>
                      </div>
                      <button onClick={() => deleteFloatingTasks(user.uid, [memo.id])}
                        aria-label="Supprimer"
                        style={{ width: "24px", height: "24px", border: "none", background: "transparent", color: "#d1d5db", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
                        <Icon name="delete" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: "11.5px", color: "#9ca3af", textAlign: "center", marginTop: "16px", lineHeight: 1.5 }}>
                Un mémo sans dossier s'efface définitivement<br />{MEMO_TTL_DAYS} jours après avoir été réalisé.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── OÙ EN EST CETTE TÂCHE ? ── */}
      {statusPrompt?.item && (() => {
        const task = statusPrompt.item;
        const unfinishedSubs = countOpenChildren(task.id, items, floatingTasks);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
            onClick={() => setStatusPrompt(null)}>
            <div style={{ background: "white", borderRadius: "16px", width: "100%", maxWidth: "360px", padding: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.28)" }}
              onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Où en est cette tâche ?</p>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#111827", margin: "6px 0 4px", lineHeight: 1.35 }}>{task.title}</p>
              <p style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "16px" }}>{caseOf(task)}</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {STATUSES.map(s => {
                  const isCurrent = task.status === s;
                  const blocked = s === "Traité" && unfinishedSubs > 0;
                  return (
                    <button key={s} disabled={blocked}
                      onClick={() => { if (!blocked) void handleStatusPromptChoice(statusPrompt, s); }}
                      style={{ padding: "13px", borderRadius: "10px", border: isCurrent ? "2px solid #111827" : "1px solid #e5e7eb", background: isCurrent ? STATUS_COLORS[s] : "white", color: isCurrent ? STATUS_TEXT[s] : blocked ? "#d1d5db" : "#374151", fontSize: "14px", fontWeight: isCurrent ? 700 : 500, cursor: blocked ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: blocked ? 0.5 : 1 }}>
                      {s}
                    </button>
                  );
                })}
              </div>

              {unfinishedSubs > 0 && (
                <p style={{ fontSize: "11.5px", color: "#f59e0b", marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Icon name="warning" size={11} /> {describeOpenChildren(task.id, items, floatingTasks)}
                </p>
              )}

              <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "14px", lineHeight: 1.45 }}>
                La tâche quitte Ma journée et reste dans son dossier.
              </p>
              <button onClick={() => setStatusPrompt(null)}
                style={{ width: "100%", marginTop: "12px", padding: "11px", borderRadius: "10px", border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── PANNEAU SUGGESTIONS (gauche) ── */}
      {suggestionsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setSuggestionsOpen(false)}>
          <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "85vw", maxWidth: "360px", background: "white", boxShadow: "4px 0 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "#111827" }}>Suggestions</p>
              <button onClick={() => setSuggestionsOpen(false)}
                style={{ width: "32px", height: "32px", border: "none", background: "transparent", fontSize: "20px", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {[
                { label: "⭐ Importantes", items: suggestions.starred, bg: "rgba(251,191,36,0.12)" },
                { label: "🔴 En retard", items: suggestions.overdue, bg: "rgba(239,68,68,0.08)" },
                { label: "📅 Aujourd'hui", items: suggestions.dueToday, bg: "rgba(34,197,94,0.08)" },
                { label: "🆕 Récentes", items: suggestions.recent, bg: "rgba(59,130,246,0.08)" },
              ].map(({ label, items: cats, bg }) => cats.length === 0 ? null : (
                <div key={label} style={{ marginBottom: "20px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>{label}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {cats.map(item => {
                      const parent = item.parentItemId ? items.find(i => i.id === item.parentItemId) : null;
                      const subtitle = parent ? `${parent.title} · ${caseOf(item)}` : caseOf(item);
                      return (
                        <button key={item.id} onClick={() => addToMyDay(item)}
                          style={{ background: bg, border: "none", borderRadius: "10px", padding: "12px 14px", textAlign: "left", cursor: "pointer", width: "100%" }}>
                          <p style={{ fontSize: "14px", fontWeight: 500, color: "#111827", marginBottom: "2px" }}>{item.title}</p>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            {subtitle && <p style={{ fontSize: "11px", color: "#6b7280" }}>{subtitle}</p>}
                            {item.dueDate && (() => {
                              const diff = Math.round((new Date(item.dueDate).getTime() - new Date().getTime()) / 86400000);
                              const label = diff < 0 ? `${Math.abs(diff)}j` : diff === 0 ? "auj." : `+${diff}j`;
                              const color = diff < 0 ? "#ef4444" : diff <= 3 ? "#f59e0b" : "#6b7280";
                              return <span style={{ fontSize: "11px", fontWeight: 600, color }}>· {label}</span>;
                            })()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {suggestions.starred.length + suggestions.overdue.length + suggestions.dueToday.length + suggestions.recent.length === 0 && (
                <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "14px", marginTop: "40px" }}>Aucune suggestion pour aujourd'hui</p>
              )}

              {/* Mémos à venir */}
              {(() => {
                const upcoming = floatingTasks
                  .filter(t => t.status !== "Traité" && !t.doneAt && t.dateKey && t.dateKey > todayKey)
                  .sort((a, b) => (a.dateKey ?? "").localeCompare(b.dateKey ?? ""));
                if (upcoming.length === 0) return null;
                const dayLabel = (dateKey: string) => {
                  const d = Math.round((new Date(dateKey + "T12:00:00").getTime() - new Date().getTime()) / 86400000);
                  return d === 1 ? "demain" : d <= 7 ? `dans ${d} j.` : d <= 30 ? `dans ${Math.round(d / 7)} sem.` : `dans ${Math.round(d / 30)} mois`;
                };
                return (
                  <div style={{ marginTop: "20px" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>📅 Mémos à venir</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {upcoming.map(t => (
                        <div key={t.id}
                          onClick={() => { setSuggestionsOpen(false); openMemo(t); }}
                          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", cursor: "pointer" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "14px", fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</p>
                          </div>
                          <span style={{ fontSize: "12px", color: "#9ca3af", flexShrink: 0 }}>{dayLabel(t.dateKey!)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── PANNEAU DÉTAIL (droite) ──
        * Le même panneau pour une tâche et pour un mémo. Basculer de l'un à
        * l'autre ne doit pas donner l'impression de changer d'écran : même
        * en-tête, même titre, mêmes sections, dans le même ordre. Ce qui change
        * tient au mot du haut, à ce qui est actif — la case à cocher pour un
        * mémo, les statuts pour une tâche, l'autre restant affiché en grisé —
        * et à la répétition, qui n'a de sens que pour un mémo. */}
      {detailEntry && (() => {
        // On relit l'objet dans sa collection : le panneau suit les
        // modifications au lieu de vivre sur une copie prise à l'ouverture.
        const liveItem = detailEntry.item ? items.find(i => i.id === detailEntry.item!.id) ?? detailEntry.item : null;
        const liveMemo = detailEntry.floating ? floatingTasks.find(f => f.id === detailEntry.floating!.id) ?? detailEntry.floating : null;
        const isMemo = !!liveMemo;
        if (!isMemo && !liveItem) return null;

        const title = isMemo ? liveMemo!.title : liveItem!.title;
        const starred = isMemo ? !!liveMemo!.starred : !!liveItem!.starred;
        const dueDate = (isMemo ? liveMemo!.dueDate : liveItem!.dueDate) ?? null;
        const reminderAt = (isMemo ? liveMemo!.reminderAt : liveItem!.reminderAt) ?? null;
        const reminderRepeat = (isMemo ? liveMemo!.reminderRepeat : liveItem!.reminderRepeat) ?? null;
        const done = isMemo && !!liveMemo!.doneAt;
        const caseTitle = isMemo
          ? (liveMemo!.caseId ? cases.find(c => c.id === liveMemo!.caseId)?.title ?? "" : "")
          : caseOf(liveItem!);
        const parentTitle = isMemo
          ? (liveMemo!.parentItemId ? items.find(i => i.id === liveMemo!.parentItemId)?.title ?? "" : "")
          : parentOf(liveItem!);

        /** Écrire, du bon côté — c'est la seule chose que la nature change ici. */
        const patch = (payload: Record<string, unknown>) => {
          if (isMemo) void updateFloatingTask(user.uid, liveMemo!.id, payload);
          else void updateItem(user.uid, liveItem!.id, payload);
        };
        /** L'échéance d'un mémo programme aussi son jour : posée au-delà
          * d'aujourd'hui, elle le sort de la journée en cours. */
        const patchDue = (iso: string | null) => {
          if (!isMemo) { patch({ dueDate: iso }); return; }
          const dueKey = iso ? getDateKeyFromValue(iso) : null;
          void updateFloatingTask(user.uid, liveMemo!.id, {
            dueDate: iso,
            dateKey: dueKey && dueKey > todayKey ? dueKey : todayKey,
          });
        };

        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setDetailEntry(null)}>
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "92vw", maxWidth: "420px", background: "white", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {isMemo ? "Mémo" : "Tâche"}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {done && <span style={{ fontSize: "11px", color: "#9ca3af" }}>Réalisé le {formatDateFR(liveMemo!.doneAt)}</span>}
                    <button onClick={() => setDetailEntry(null)}
                      style={{ width: "30px", height: "30px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f9fafb", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                </div>

                {/* Contenu scrollable */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>

                  {/* Case à cocher, étoile, titre. La case n'est active que pour
                      un mémo : une tâche ne s'accomplit pas d'un geste, elle
                      avance. Elle reste affichée pour qu'on voie l'échange. */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      onClick={() => { if (isMemo) { if (done) void uncompleteMemo(liveMemo!); else void completeMemo(liveMemo!); } }}
                      disabled={!isMemo}
                      title={isMemo
                        ? (done ? "Marquer à faire" : "Marquer réalisé")
                        : "Une tâche ne se coche pas : elle avance par statuts."}
                      style={{
                        width: "24px", height: "24px", borderRadius: "7px", flexShrink: 0,
                        border: done ? "none" : `2px solid ${isMemo ? "#9ca3af" : "#e5e7eb"}`,
                        background: done ? "#16a34a" : isMemo ? "white" : "#f9fafb",
                        cursor: isMemo ? "pointer" : "default",
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      }}>
                      {done && <Icon name="check" size={15} strokeWidth={2.5} style={{ color: "white" }} />}
                    </button>
                    <button onClick={() => patch({ starred: !starred })}
                      style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0, color: starred ? "#f59e0b" : "#d1d5db" }}
                      title={starred ? "Retirer l'étoile" : "Marquer importante"}>
                      <Icon name="star" size={24} filled={starred} strokeWidth={1.75} />
                    </button>
                    <input
                      key={(isMemo ? "f-" : "i-") + (isMemo ? liveMemo!.id : liveItem!.id)}
                      defaultValue={title}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (!val || val === title) return;
                        patch({ title: val });
                      }}
                      style={{ flex: 1, minWidth: 0, fontSize: "18px", fontWeight: 600, color: "#111827", border: "1.5px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", boxSizing: "border-box", lineHeight: 1.3, textDecoration: done ? "line-through" : undefined }}
                    />
                  </div>

                  {/* Statut — actif sur une tâche, grisé sur un mémo (mais
                      affiché : c'est ce qu'on récupère en le rendant tâche).
                      Un contenant, lui, n'a pas de statut : il affiche ce qu'il
                      reste à faire dedans. */}
                  {(() => {
                    if (!isMemo && isContainer(liveItem!.id, items, floatingTasks)) {
                      const { done: sub, total } = getCompletion(liveItem!.id, items, floatingTasks);
                      return (
                        <div>
                          <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Avancement</p>
                          <div style={{ padding: "13px", borderRadius: "10px", border: "1px solid #e5e7eb", background: sub === total ? "#dcfce7" : "#f9fafb", color: sub === total ? "#166534" : "#374151", fontSize: "14px", fontWeight: 600 }}>
                            {sub}/{total} terminé{sub > 1 ? "s" : ""}
                          </div>
                          <p style={{ fontSize: "11.5px", color: "#9ca3af", marginTop: "8px", lineHeight: 1.45 }}>
                            Cette tâche contient ; son état suit ce qu'elle porte.
                          </p>
                        </div>
                      );
                    }
                    const openCount = isMemo ? 0 : countOpenChildren(liveItem!.id, items, floatingTasks);
                    return (
                      <div>
                        <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Statut</p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {STATUSES.map(s => {
                            const isActive = !isMemo && liveItem!.status === s;
                            const blocked = !isMemo && s === "Traité" && openCount > 0;
                            return (
                              <button key={s} disabled={isMemo}
                                onClick={() => { if (!isMemo && !blocked) handleStatusChange(detailEntry, s); }}
                                title={isMemo ? "Un mémo se coche ; il n'avance pas par statuts." : undefined}
                                style={{ padding: "11px", borderRadius: "10px", border: isActive ? "2px solid #111827" : "1px solid #e5e7eb", background: isActive ? STATUS_COLORS[s] : "white", color: isActive ? STATUS_TEXT[s] : blocked ? "#d1d5db" : "#374151", fontSize: "13px", fontWeight: isActive ? 700 : 400, cursor: isMemo || blocked ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: isMemo ? 0.35 : blocked ? 0.5 : 1 }}>
                                {s}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* La nature, au même endroit que sur desktop : sous les
                      statuts, parce que c'est la même question qu'eux. Un
                      contenant n'y a pas droit — un mémo ne porte rien. */}
                  {(isMemo || !isContainer(liveItem!.id, items, floatingTasks)) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <MemoSwitch
                        on={isMemo}
                        disabled={isMemo && !liveMemo!.caseId}
                        title={isMemo && !liveMemo!.caseId
                          ? "Un mémo sans dossier ne peut pas devenir une tâche : rattachez-le d'abord."
                          : undefined}
                        onChange={() => { void toggleNature(detailEntry, liveItem, liveMemo); }}
                      />
                      {natureNotice && (
                        <span style={{ fontSize: "11.5px", color: "#dc2626", lineHeight: 1.45, flex: 1, minWidth: "140px" }}>
                          {natureNotice}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Dossier — sur un mémo, il se pose et se retire ici : c'est
                      le geste qui décide s'il appartient à une affaire ou s'il
                      s'effacera tout seul. Sur une tâche, le dossier est sa
                      maison : on l'y déplace depuis Mes dossiers, pas ici. */}
                  {isMemo ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                        <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Dossier</p>
                        {liveMemo!.caseId && (
                          <button
                            onClick={() => { patch({ caseId: null, parentItemId: null }); setDetailCaseSearch(""); }}
                            style={{ marginLeft: "auto", fontSize: "12px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                            Détacher
                          </button>
                        )}
                      </div>
                      {liveMemo!.caseId ? (
                        <p style={{ fontSize: "14px", color: "#374151", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <Icon name="folder" size={14} />
                          {caseTitle || "Dossier introuvable"}
                        </p>
                      ) : (
                        <>
                          <input
                            value={detailCaseSearch}
                            onChange={e => setDetailCaseSearch(e.target.value)}
                            placeholder="Rechercher un dossier…"
                            style={{ width: "100%", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box" }}
                          />
                          {detailCaseSearch.trim() && (() => {
                            const needle = detailCaseSearch.trim().toLowerCase();
                            const found = cases
                              .filter(c => !c.archived && c.title.toLowerCase().includes(needle))
                              .slice(0, 8);
                            return (
                              <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden", maxHeight: "180px", overflowY: "auto", marginTop: "8px" }}>
                                {found.length === 0
                                  ? <p style={{ padding: "12px 14px", fontSize: "13px", color: "#9ca3af" }}>Aucun dossier trouvé</p>
                                  : found.map(c => (
                                    <button key={c.id}
                                      onClick={() => { patch({ caseId: c.id, parentItemId: null }); setDetailCaseSearch(""); }}
                                      style={{ width: "100%", padding: "12px 14px", textAlign: "left", background: "white", border: "none", borderBottom: "1px solid #f3f4f6", fontSize: "14px", color: "#111827", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px" }}>
                                      <Icon name="folder" size={14} /> {c.title}
                                    </button>
                                  ))}
                              </div>
                            );
                          })()}
                          <p style={{ fontSize: "11.5px", color: "#9ca3af", marginTop: "6px", lineHeight: 1.4 }}>
                            Sans dossier, un mémo s'efface {MEMO_TTL_DAYS} jours après avoir été réalisé.
                          </p>
                        </>
                      )}

                      {/* Sous quelle tâche — le mémo descend d'un cran et compte
                          alors dans l'avancement de cette tâche. */}
                      {liveMemo!.caseId && (() => {
                        const caseTasks = items.filter(i => i.caseId === liveMemo!.caseId && !i.parentItemId);
                        if (caseTasks.length === 0) return null;
                        return (
                          <div style={{ marginTop: "12px" }}>
                            <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Sous la tâche</p>
                            <select
                              value={liveMemo!.parentItemId ?? ""}
                              onChange={e => patch({ parentItemId: e.target.value || null })}
                              aria-label="Sous quelle tâche"
                              style={{ width: "100%", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box" }}>
                              <option value="">Au niveau du dossier</option>
                              {caseTasks.map(t => (
                                <option key={t.id} value={t.id}>{t.title}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Dossier</p>
                      <p style={{ fontSize: "14px", color: "#374151", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <Icon name="folder" size={14} />
                        {caseTitle || "Sans dossier"}{parentTitle ? ` › ${parentTitle}` : ""}
                      </p>
                    </div>
                  )}

                  {/* Échéance avec calendrier à gauche */}
                  <div>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Échéance</p>
                    <div style={{ marginBottom: "10px" }}>
                      <DueChips
                        value={dueDate}
                        onPick={date => patchDue(date.toISOString())}
                        onClear={() => patchDue(null)}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={e => { const inp = (e.currentTarget.parentElement?.querySelector("input[type=date]") as any); if (inp?.showPicker) inp.showPicker(); else inp?.focus(); }}
                        style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0, color: "#6b7280" }}
                        title="Ouvrir le calendrier">
                        <Icon name="calendar" size={20} />
                      </button>
                      <input type="date"
                        value={(dueDate ?? "").slice(0, 10)}
                        onChange={e => {
                          if (!e.target.value) { patchDue(null); return; }
                          patchDue(atDueHour(new Date(e.target.value + "T00:00:00")).toISOString());
                        }}
                        style={{ flex: 1, fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  {/* Rappel push */}
                  <ReminderPicker
                    value={reminderAt}
                    onChange={(iso) => patch({ reminderAt: iso, reminderSentAt: null, reminderCount: 0 })}
                    repeat={reminderRepeat}
                    onRepeatChange={(v) => patch({ reminderRepeat: v })}
                    defaultRepeat={reminderPolicy.repeatEnabled}
                    repeatLabel={describeRepeat(reminderPolicy)}
                  />

                  {/* Répétition et observations — affichées dans les deux cas,
                      grisées sur une tâche : elle ne revient pas toute seule, et
                      ses observations sont ses commentaires (dans Mes dossiers).
                      Rien n'apparaît ni ne disparaît quand on bascule. */}
                  <div style={isMemo ? undefined : { opacity: 0.4, pointerEvents: "none" }}
                    aria-disabled={!isMemo}
                    title={isMemo ? undefined : "Une tâche ne se répète pas : elle se traite une fois."}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Répétition</p>
                    <RecurrencePicker
                      value={isMemo ? liveMemo!.recurrence ?? null : null}
                      onChange={(r: Recurrence | null) => { if (isMemo) patch({ recurrence: r ?? null }); }}
                    />
                  </div>
                  <div style={isMemo ? undefined : { opacity: 0.4, pointerEvents: "none" }}
                    aria-disabled={!isMemo}
                    title={isMemo ? undefined : "Les observations d'une tâche sont ses commentaires, dans Mes dossiers."}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Observations</p>
                    <textarea
                      key={(isMemo ? liveMemo!.id : liveItem!.id) + "-note"}
                      defaultValue={isMemo ? liveMemo!.note ?? "" : ""}
                      onBlur={e => { if (isMemo) patch({ note: e.target.value.trim() || null }); }}
                      rows={3}
                      placeholder="Contexte, numéro de téléphone, précision…"
                      style={{ width: "100%", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box", resize: "none" }}
                    />
                  </div>

                </div>

                {/* Barre d'actions bas */}
                <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 16px", background: "white", display: "flex", gap: "8px" }}>
                  <button onClick={() => { void removeEntry(detailEntry); setDetailEntry(null); }}
                    style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #e5e7eb", background: "white", color: isMemo ? "#dc2626" : "#374151", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <Icon name={isMemo ? "delete" : "myday"} size={14} />
                    {isMemo ? "Supprimer" : "Retirer de Ma journée"}
                  </button>
                </div>
          </div>
        </div>
        );
      })()}

      {/* ── ANNONCE : « Mes dossiers » désormais sur mobile (affichée une seule fois) ── */}
      {showMobileAnnounce && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          onClick={() => setShowMobileAnnounce(false)}
        >
          <div
            style={{ background: "white", borderRadius: "16px", maxWidth: "360px", width: "100%", padding: "24px", boxShadow: "0 20px 60px rgba(0,0,0,0.28)" }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: "40px", textAlign: "center", margin: 0 }}>📱</p>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", textAlign: "center", margin: "8px 0 6px" }}>
              Mes dossiers arrive sur mobile
            </h2>
            <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.5, textAlign: "center", margin: "0 0 16px" }}>
              Consultez et gérez tous vos dossiers directement depuis votre téléphone.
            </p>

            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "14px 16px", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span style={{ fontSize: "18px", lineHeight: "20px", flexShrink: 0 }}>👉</span>
                <p style={{ fontSize: "13px", color: "#374151", lineHeight: 1.5, margin: 0 }}>
                  <strong>Balayez</strong> l'écran vers la gauche ou la droite pour passer de <strong>Dossiers → Tâches → Sous-tâches → Détail</strong> (et revenir).
                </p>
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span style={{ display: "inline-flex", flexShrink: 0, color: "#6b7280", marginTop: "1px" }}><Icon name="folder" size={18} /></span>
                <p style={{ fontSize: "13px", color: "#374151", lineHeight: 1.5, margin: 0 }}>
                  En haut à gauche : l'icône <strong>dossier</strong> ouvre Mes dossiers, l'icône <strong>soleil</strong> revient à Ma journée.
                </p>
              </div>
            </div>

            <Link
              href="/"
              onClick={() => setShowMobileAnnounce(false)}
              style={{ display: "block", width: "100%", textAlign: "center", boxSizing: "border-box", background: "#111827", color: "white", padding: "12px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, textDecoration: "none", marginBottom: "6px" }}
            >
              Découvrir Mes dossiers
            </Link>
            <button
              onClick={() => setShowMobileAnnounce(false)}
              style={{ display: "block", width: "100%", textAlign: "center", background: "transparent", border: "none", color: "#6b7280", padding: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}
            >
              Plus tard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

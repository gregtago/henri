"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSettings, applySettings, type UserSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { Timestamp, addDoc, collection } from "firebase/firestore";
import {
  addMyDaySelection,
  createCase,
  createComment,
  createFloatingTask,
  createItem,
  deleteCaseCascade,
  deleteFloatingTasks,
  deleteItemsCascade,
  restoreCase,
  restoreItems,
  restoreFloatingTasks,
  deleteMyDaySelection,
  exportCaseToJson,
  getItemsByCase,
  getSubItems,
  importCaseFromJson,
  logStatusEvent,
  queryMyDayByDate,
  subscribeCases,
  subscribeComments,
  subscribeEvents,
  subscribeFloatingTasks,
  subscribeItems,
  subscribeMyDaySelections,
  updateCase,
  updateFloatingTask,
  updateItem,
  updateItemProgress
} from "@/lib/firestore";
import { auth, db } from "@/lib/firebase";
import { seedOnboardingIfNeeded } from "@/lib/onboarding";
import {
  dateKeyToDate,
  formatDateFR,
  getDateKeyFromValue,
  getStartOfWindow,
  getTodayKey,
  getWindowDateKeys,
  getYesterdayKey,
  toDate
} from "@/lib/dates";
import { getProgressLevel, getProgressStageLabel } from "@/lib/progress";
import type { Case, Comment, Event, FloatingTask, Item, MyDaySelection, Status } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { RecurrencePicker } from "./RecurrencePicker";
import { Icon } from "./Icon";
import { formatRecurrence } from "@/lib/recurrence";

const isEditableElement = (element: EventTarget | null) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || element.isContentEditable;
};

type PendingDelete = {
  message: string;
  action: () => Promise<void>;        // suppression déjà exécutée (pour nettoyage final)
  restore: () => Promise<void>;       // restauration si annulation
  timeoutId: number;
  expiresAt: number;
};

type DetailTarget =
  | {
      type: "case";
      id: string;
    }
  | {
      type: "item";
      id: string;
    }
  | null;

type ParentOption = {
  id: string;
  kind: "case" | "item";
  label: string;
  caseId?: string;
};

export default function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [floatingTasks, setFloatingTasks] = useState<FloatingTask[]>([]);
  const [liveMyDaySelections, setLiveMyDaySelections] = useState<MyDaySelection[]>([]);
  const [legacyMyDaySelections, setLegacyMyDaySelections] = useState<MyDaySelection[]>([]);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set());
  const [completingFloatingIds, setCompletingFloatingIds] = useState<Set<string>>(new Set());
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(null);
  const [lastCaseId, setLastCaseId] = useState<string | null>(null);
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  const [lastSubItemId, setLastSubItemId] = useState<string | null>(null);

  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedSubItemIds, setSelectedSubItemIds] = useState<string[]>([]);
  const [selectedFloatingIds, setSelectedFloatingIds] = useState<string[]>([]);
  const [selectionModeItems, setSelectionModeItems] = useState(false);
  const [selectionModeSubItems, setSelectionModeSubItems] = useState(false);

  const [activeColumn, setActiveColumn] = useState<"cases" | "items" | "subitems" | "detail">("cases");
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [isReparentOpen, setIsReparentOpen] = useState(false);
  const [reparentTargetId, setReparentTargetId] = useState<string | null>(null);
  const [reparentSearch, setReparentSearch] = useState("");
  const [reparentCursor, setReparentCursor] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [myDayDetailId, setMyDayDetailId] = useState<string | null>(null);
  const [dossierSearch, setDossierSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [importMode, setImportMode] = useState<"model" | "history">("history");
  const [isImportOpen, setIsImportOpen] = useState(false); // "f-{id}" pour volante, selectionId pour dossier
  const toastTimeout = useRef<number | null>(null);
  const backfilledItemIds = useRef<Set<string>>(new Set());
  // Refs pour scroll automatique lors de la navigation clavier
  const casesListRef = useRef<HTMLDivElement | null>(null);
  const itemsListRef = useRef<HTMLDivElement | null>(null);
  const subitemsListRef = useRef<HTMLDivElement | null>(null);
  // Ref pour focus auto sur le titre après création
  const detailTitleRef = useRef<HTMLInputElement | null>(null);
  const detailCaseRef = useRef<HTMLInputElement | null>(null);
  const caseSearchRef = useRef<HTMLInputElement | null>(null);
  const myDayTitleRef = useRef<HTMLInputElement | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);

  const [caseSortKey, setCaseSortKey] = useState<"title" | "createdAt" | "legalDueDate">(settings.defaultSort);
  const [caseSearch, setCaseSearch] = useState("");
  const [caseSortDirection, setCaseSortDirection] = useState<"asc" | "desc">(settings.defaultSortDir);

  const pathname = usePathname();
  const router = useRouter();
  const isMyDay = pathname === "/my-day";

  const todayKey = getTodayKey();
  const yesterdayKey = getYesterdayKey();
  const windowKeys = useMemo(() => getWindowDateKeys(7, dateKeyToDate(yesterdayKey) ?? new Date()), [yesterdayKey]);
  const startOfWindow = useMemo(() => getStartOfWindow(7, dateKeyToDate(yesterdayKey) ?? new Date()), [yesterdayKey]);
  const stagnantThreshold = useMemo(() => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);
    return threshold;
  }, [todayKey]);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    applySettings(s);
    setCaseSortKey(s.defaultSort);
    setCaseSortDirection(s.defaultSortDir);
  }, []);

  // Écouter les changements de settings depuis d'autres onglets (settings page)
  useEffect(() => {
    const handleStorage = () => {
      const s = loadSettings();
      setSettings(s);
      applySettings(s);
      setCaseSortKey(s.defaultSort);
      setCaseSortDirection(s.defaultSortDir);
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("henri-settings-changed", handleStorage as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("henri-settings-changed", handleStorage as EventListener);
    };
  }, []);

  // Écran de bienvenue première connexion
  useEffect(() => {
    if (!user) return;
    const key = `henri_welcomed_${user.uid}`;
    if (!localStorage.getItem(key)) {
      setShowWelcome(true);
      localStorage.setItem(key, "1");
    }
  }, [user]);

  // Onboarding : créer les dossiers de prise en main à la première connexion
  useEffect(() => {
    if (!user) return;
    seedOnboardingIfNeeded(user.uid).catch(() => {});
  }, [user]);

  // Restaurer une sélection après navigation depuis Ma journée
  useEffect(() => {
    if (isMyDay || items.length === 0) return;
    const raw = sessionStorage.getItem("pendingSelection");
    if (!raw) return;
    try {
      const { caseId, itemId, subItemId } = JSON.parse(raw);
      sessionStorage.removeItem("pendingSelection");
      setSelectedCaseId(caseId);
      setSelectedCaseIds([caseId]);
      setSelectedItemId(itemId);
      setSelectedItemIds([itemId]);
      setDetailTarget({ type: "item", id: subItemId ?? itemId });
      if (subItemId) {
        setSelectedSubItemId(subItemId);
        setSelectedSubItemIds([subItemId]);
        setActiveColumn("subitems");
      } else {
        setActiveColumn("items");
      }
    } catch {}
  }, [isMyDay, items.length]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubCases = subscribeCases(user.uid, setCases);
    const unsubItems = subscribeItems(user.uid, setItems);
    const unsubComments = subscribeComments(user.uid, setComments);
    const unsubEvents = subscribeEvents(user.uid, setEvents);
    const unsubFloating = subscribeFloatingTasks(user.uid, setFloatingTasks);
    const unsubMyDay = subscribeMyDaySelections(user.uid, setLiveMyDaySelections, startOfWindow);
    return () => {
      unsubCases();
      unsubItems();
      unsubComments();
      unsubEvents();
      unsubFloating();
      unsubMyDay();
    };
  }, [user, startOfWindow]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadLegacySelections = async () => {
      const keysToFetch = Array.from(new Set([todayKey, ...windowKeys]));
      const entries = await Promise.all(keysToFetch.map((key) => queryMyDayByDate(user.uid, key)));
      if (cancelled) return;
      const merged = entries.flat().map((entry) => {
        const selectionBaseDate = dateKeyToDate(entry.dateKey);
        if (entry.selectionDate && entry.dateTs) {
          return entry;
        }
        return {
          ...entry,
          selectionDate: entry.selectionDate ?? (selectionBaseDate ? Timestamp.fromDate(selectionBaseDate) : undefined),
          dateTs: entry.dateTs ?? (selectionBaseDate ? Timestamp.fromDate(selectionBaseDate) : undefined)
        };
      });
      setLegacyMyDaySelections(merged);
    };
    loadLegacySelections();
    return () => {
      cancelled = true;
    };
  }, [todayKey, user, windowKeys]);

  useEffect(() => {
    if (toastTimeout.current) {
      window.clearTimeout(toastTimeout.current);
    }
    if (toast) {
      toastTimeout.current = window.setTimeout(() => setToast(null), 3000);
    }
    return () => {
      if (toastTimeout.current) {
        window.clearTimeout(toastTimeout.current);
      }
    };
  }, [toast]);

  useEffect(() => {
    if (!pendingDelete) {
      setUndoCountdown(0);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((pendingDelete.expiresAt - Date.now()) / 1000));
      setUndoCountdown(remaining);
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 500);
    return () => window.clearInterval(intervalId);
  }, [pendingDelete]);

  const activeCases = useMemo(() => cases.filter(c => !c.archived), [cases]);
  const archivedCases = useMemo(() => cases.filter(c => c.archived), [cases]);

  const sortedCases = useMemo(() => {
    const direction = caseSortDirection === "asc" ? 1 : -1;
    const source = showArchived ? archivedCases : activeCases;
    return source
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        if (caseSortKey === "title") {
          const result = a.entry.title.localeCompare(b.entry.title, "fr");
          return result !== 0 ? result * direction : a.index - b.index;
        }
        if (caseSortKey === "createdAt") {
          const result = new Date(a.entry.createdAt).getTime() - new Date(b.entry.createdAt).getTime();
          return result !== 0 ? result * direction : a.index - b.index;
        }
        // Sans date = toujours à la fin, quelle que soit la direction
        const aDate = a.entry.legalDueDate ? new Date(a.entry.legalDueDate).getTime() : null;
        const bDate = b.entry.legalDueDate ? new Date(b.entry.legalDueDate).getTime() : null;
        if (aDate === null && bDate === null) return a.index - b.index;
        if (aDate === null) return 1;  // a sans date → fin
        if (bDate === null) return -1; // b sans date → fin
        const result = aDate - bDate;
        return result !== 0 ? result * direction : a.index - b.index;
      })
      .map(({ entry }) => entry);
  }, [cases, caseSortDirection, caseSortKey, showArchived, activeCases, archivedCases]);

  const filteredCases = caseSearch.trim()
    ? sortedCases.filter(c => c.title.toLowerCase().includes(caseSearch.toLowerCase()))
    : sortedCases;

  const selectedCase = cases.find((entry) => entry.id === selectedCaseId) || null;
  const sortByCreatedAt = <T extends {createdAt: string}>(arr: T[]) =>
    [...arr].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const caseItems = selectedCase ? sortByCreatedAt(getItemsByCase(items, selectedCase.id)) : [];
  const fallbackItems =
    selectedCase && caseItems.length === 0
      ? sortByCreatedAt(items.filter((item) => item.caseId === selectedCase.id && item.parentItemId))
      : [];
  const itemsColumnItems = caseItems.length > 0 ? caseItems : fallbackItems;
  const selectedItem = items.find((entry) => entry.id === selectedItemId) || null;
  const subItems = selectedItem ? sortByCreatedAt(getSubItems(items, selectedItem.id)) : [];
  const selectedSubItem = items.find((entry) => entry.id === selectedSubItemId) || null;

  const detailItem = detailTarget?.type === "item" ? items.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailCase = detailTarget?.type === "case" ? cases.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailComments = detailItem ? comments.filter((comment) => comment.itemId === detailItem.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) : [];
  const detailEvents = detailItem ? events.filter((event) => event.itemId === detailItem.id) : [];
  const reparentTarget = reparentTargetId ? items.find((entry) => entry.id === reparentTargetId) ?? null : null;
  const reparentHasChildren = useMemo(
    () => (reparentTarget ? items.some((item) => item.parentItemId === reparentTarget.id) : false),
    [items, reparentTarget]
  );
  const caseTitleById = useMemo(() => new Map(cases.map((entry) => [entry.id, entry.title])), [cases]);
  // resolvedActiveColumn : colonne logique courante, jamais "detail"
  // On n'utilise plus "detail" comme valeur de activeColumn —
  // le détail s'ouvre via detailTarget indépendamment de la navigation.
  const resolvedActiveColumn = useMemo(() => {
    if (activeColumn === "detail") {
      // fallback de compatibilité au cas où
      if (detailTarget?.type === "case") return "cases" as const;
      if (detailItem?.level === 3) return "subitems" as const;
      return "items" as const;
    }
    return activeColumn;
  }, [activeColumn, detailItem?.level, detailTarget?.type]);
  const myDaySelections = useMemo(() => {
    const merged = new Map<string, MyDaySelection>();
    legacyMyDaySelections.forEach((entry) => merged.set(entry.id, entry));
    liveMyDaySelections.forEach((entry) => merged.set(entry.id, entry));
    return Array.from(merged.values()).filter(entry => !pendingRemovalIds.has(entry.id));
  }, [legacyMyDaySelections, liveMyDaySelections, pendingRemovalIds]);

  useEffect(() => {
    if (!user || items.length === 0) return;
    const missing = items.filter((item) => !item.lastProgressAt && !backfilledItemIds.current.has(item.id));
    if (missing.length === 0) return;
    const latestEventByItem = new Map<string, Date>();
    events
      .filter((eventEntry) => eventEntry.type === "progress_changed")
      .forEach((eventEntry) => {
        const eventDate = toDate(eventEntry.createdAt);
        if (!eventDate) return;
        const current = latestEventByItem.get(eventEntry.itemId);
        if (!current || eventDate > current) {
          latestEventByItem.set(eventEntry.itemId, eventDate);
        }
      });
    const runBackfill = async () => {
      await Promise.all(
        missing.map(async (item) => {
          const fallbackDate = toDate(item.createdAt);
          const lastDate = latestEventByItem.get(item.id) ?? fallbackDate;
          if (!lastDate) return;
          backfilledItemIds.current.add(item.id);
          await updateItem(user.uid, item.id, { lastProgressAt: Timestamp.fromDate(lastDate) });
        })
      );
    };
    runBackfill();
  }, [events, items, user]);
  const reminderItems = items.filter((item) => {
    const dueKey = getDateKeyFromValue(item.dueDate);
    if (!dueKey || dueKey > todayKey) return false;
    // Exclure si déjà rappelé aujourd'hui
    const reminderKey = getDateKeyFromValue(item.lastReminderAt);
    return reminderKey !== todayKey;
  });
  const showDetailColumn = Boolean(detailTarget && (detailCase || detailItem));
  const showCasesColumn = true;
  const showItemsColumn = Boolean(selectedCase);
  // Colonne sous-tâches visible dès qu'une tâche N2 est sélectionnée (même sans enfants)
  // → permet de créer des sous-tâches visuellement
  const showSubItemsColumn = Boolean(selectedItem) && detailTarget?.type !== "case";

  useEffect(() => {
    setIsTimelineOpen(false);
  }, [detailItem?.id, detailTarget?.type]);

  // Titre d'onglet dynamique
  useEffect(() => {
    document.title = "Henri";
  }, [isMyDay, detailCase, detailItem, selectedCase]);

  // PAS de focus auto sur le titre — ça bloquerait les raccourcis clavier
  // Le focus se fait uniquement via F2 ou double-clic sur le titre
  // (useEffect supprimé volontairement)

  // Sync myDayDetailId → detailTarget pour le panneau détail dossier/tâche
  useEffect(() => {
    if (!myDayDetailId || myDayDetailId.startsWith("f-")) {
      if (isMyDay) setDetailTarget(null);
      return;
    }
    // 1) Essayer comme selectionId (cas courant : sélection Ma journée)
    const sel = myDaySelections.find(s => s.id === myDayDetailId);
    if (sel) {
      if (sel.refType === "case") setDetailTarget({ type: "case", id: sel.refId });
      else setDetailTarget({ type: "item", id: sel.refId });
      return;
    }
    // 2) Fallback : id d'item direct (cas d'une tâche cliquée depuis À venir)
    const item = items.find(i => i.id === myDayDetailId);
    if (item) {
      setDetailTarget({ type: "item", id: item.id });
      return;
    }
    // 3) Ou id de dossier direct
    const c = cases.find(c => c.id === myDayDetailId);
    if (c) setDetailTarget({ type: "case", id: c.id });
  }, [myDayDetailId, myDaySelections, items, cases, isMyDay]);

  // ── REPÈRES "Dans Ma journée" (toutes échéances confondues) ─────────────
  // On garde toutes les sélections actives, peu importe la date,
  // pour afficher un point jaune sur les tâches/sous-tâches et leurs dossiers.
  const myDayMarkerItemIds = useMemo(() => {
    const set = new Set<string>();
    myDaySelections.forEach(sel => {
      if (sel.refType === "item" || sel.refType === "subitem") set.add(sel.refId);
    });
    return set;
  }, [myDaySelections]);

  const myDayMarkerCaseIds = useMemo(() => {
    const set = new Set<string>();
    myDaySelections.forEach(sel => {
      if (sel.refType === "case") {
        set.add(sel.refId);
      } else if (sel.refType === "item" || sel.refType === "subitem") {
        const it = items.find(i => i.id === sel.refId);
        if (it?.caseId) set.add(it.caseId);
      }
    });
    return set;
  }, [myDaySelections, items]);

  const myDayEntries = myDaySelections.filter((entry) => entry.dateKey === todayKey);
  const myDayItems = myDayEntries
    .map((entry) => {
      if (entry.refType === "case") {
        const caseItem = cases.find((entryCase) => entryCase.id === entry.refId);
        return caseItem ? { type: "case" as const, data: caseItem, selectionId: entry.id } : null;
      }
      const item = items.find((entryItem) => entryItem.id === entry.refId);
      return item ? { type: "item" as const, data: item, selectionId: entry.id } : null;
    })
    .filter(
      (entry): entry is { type: "case"; data: Case; selectionId: string } | { type: "item"; data: Item; selectionId: string } =>
        entry !== null
    );


  // ── HELPER STATUT ────────────────────────────────────────────────────────
  const statusClass = (s: string): string => {
    // Compatibilité avec anciens statuts
    const compat: Record<string, string> = {
      "À faire": "status-badge status-badge-0",
      "Créé":   "status-badge status-badge-0",
      "Demandé": "status-badge status-badge-1",
      "Reçu":    "status-badge status-badge-2",
      "Traité":  "status-badge status-badge-3",
    };
    return compat[s] ?? "status-badge status-badge-0";
  };

  // ── TÂCHES DU JOUR — tri priorité ─────────────────────────────────────────
  const todayFloating = floatingTasks.filter(t => t.status !== "Traité" && t.dateKey != null && t.dateKey <= todayKey);

  // Construire la liste unifiée triée pour Ma journée (tâches de dossier + mémos flottants)
  const myDayCombined = useMemo(() => {
    type Entry = {
      key: string;
      kind: "item" | "floating";
      title: string;
      caseLabel: string;
      parentLabel: string;
      status: string;
      starred: boolean;
      hasDue: boolean;
      dueStr: string;
      overdue: boolean;
      dueIsToday: boolean;
      dueTs: number;
      recurrence?: any;
      statusEl: React.ReactNode;
      removeBtn: React.ReactNode | null;
      floatingId?: string;
      selectionId?: string;
    };

    const startOfToday = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
    const endOfToday = startOfToday + 86400000;

    // 1. Tâches issues de myDayItems (dossiers / items / sous-items)
    const itemEntries: Entry[] = myDayItems.map(entry => {
      if (!entry) return null;
      const { data, selectionId } = entry;
      const dueRaw = "dueDate" in data ? data.dueDate : ("legalDueDate" in data ? data.legalDueDate : null);
      const dueDate = dueRaw ? new Date(dueRaw) : null;
      const hasDue = Boolean(dueDate);
      const dueTs = dueDate ? dueDate.getTime() : Infinity;
      const overdue = hasDue && dueTs < startOfToday;
      const dueIsToday = hasDue && dueTs >= startOfToday && dueTs < endOfToday;
      const dueStr = dueDate ? formatDateFR(dueRaw) : "";
      const statusEl = "status" in data
        ? <span className={statusClass(data.status)}>{data.status}</span>
        : <span className="text-[12.5px] text-tx-3">Dossier</span>;
      const removeBtn = (
        <button
          className="w-5 h-5 flex items-center justify-center text-[12.5px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-red-500 rounded shrink-0"
          onClick={e => {
            e.stopPropagation();
            setPendingRemovalIds(prev => new Set([...prev, selectionId]));
            setLegacyMyDaySelections(prev => prev.filter(s => s.id !== selectionId));
            deleteMyDaySelection(user!.uid, selectionId);
          }}
          title="Retirer de Ma journée"
        >✕</button>
      );
      let caseLabel = "";
      let parentLabel = "";
      if ("caseId" in data) {
        caseLabel = cases.find(c => c.id === data.caseId)?.title ?? "";
        if ("parentItemId" in data && data.parentItemId) {
          parentLabel = items.find(i => i.id === data.parentItemId)?.title ?? "";
        }
      }
      const status = "status" in data ? (data as any).status ?? "Créé" : "Créé";
      const starred = "starred" in data ? Boolean((data as any).starred) : false;
      return {
        key: selectionId,
        kind: "item" as const,
        title: data.title,
        caseLabel,
        parentLabel,
        status,
        starred,
        hasDue,
        dueStr,
        overdue,
        dueIsToday,
        dueTs,
        statusEl,
        removeBtn,
        selectionId,
      } as Entry;
    }).filter(Boolean) as Entry[];

    // 2. Mémos flottants du jour (pas encore traités)
    const floatingEntries: Entry[] = todayFloating.map(task => {
      const dueDate = task.dueDate ? new Date(task.dueDate) : null;
      const hasDue = Boolean(dueDate);
      const dueTs = dueDate ? dueDate.getTime() : Infinity;
      const overdue = hasDue && dueTs < startOfToday;
      const dueIsToday = hasDue && dueTs >= startOfToday && dueTs < endOfToday;
      return {
        key: `f-${task.id}`,
        kind: "floating" as const,
        title: task.title,
        caseLabel: "",
        parentLabel: "",
        status: task.status,
        starred: Boolean(task.starred),
        hasDue,
        dueStr: dueDate ? formatDateFR(task.dueDate!) : "",
        overdue,
        dueIsToday,
        dueTs,
        recurrence: task.recurrence,
        statusEl: <span className={statusClass(task.status)}>{task.status}</span>,
        removeBtn: null, // mémo : pas de bouton retirer dans la rangée (action depuis le détail)
        floatingId: task.id,
      } as Entry;
    });

    // Bucket : 0=important, 1=en retard, 2=aujourd'hui, 3=futur avec date, 4=sans date
    const bucket = (e: Entry): number => {
      if (e.starred) return 0;
      if (e.overdue) return 1;
      if (e.dueIsToday) return 2;
      if (e.hasDue) return 3;
      return 4;
    };

    const all = [...itemEntries, ...floatingEntries];
    all.sort((a, b) => {
      const ba = bucket(a), bb = bucket(b);
      if (ba !== bb) return ba - bb;
      // À bucket égal : tri par date d'échéance croissante (Infinity en dernier)
      if (a.dueTs !== b.dueTs) return a.dueTs - b.dueTs;
      // À date égale : tâches de dossier avant mémos
      if (a.kind !== b.kind) return a.kind === "item" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
    return all;
  }, [myDayItems, todayFloating, formatDateFR, statusClass, user, cases, items]);

  // Liste "À venir" : mémos et tâches dont l'échéance est dans le futur, ré-utilisée
  // dans le bouton du header et dans le popover.
  type UpcomingEntry =
    | { kind: "floating"; id: string; title: string; dateKey: string }
    | { kind: "item"; id: string; title: string; dateKey: string; caseLabel: string };

  const upcoming = useMemo<UpcomingEntry[]>(() => {
    const upcomingFloating: UpcomingEntry[] = floatingTasks
      .filter(t => t.status !== "Traité" && t.dateKey && t.dateKey > todayKey)
      .map(t => ({ kind: "floating", id: t.id, title: t.title, dateKey: t.dateKey! }));

    const todaySelectionRefIds = new Set(
      myDaySelections.filter(s => s.dateKey === todayKey).map(s => s.refId)
    );
    const itemIdsWithChildren = new Set(items.filter(i => i.parentItemId).map(i => i.parentItemId!));
    const upcomingItems: UpcomingEntry[] = items
      .filter(item => {
        if (item.status === "Traité") return false;
        if (todaySelectionRefIds.has(item.id)) return false;
        if (item.level === 2 && itemIdsWithChildren.has(item.id)) return false;
        const dk = getDateKeyFromValue(item.dueDate);
        return dk !== null && dk > todayKey;
      })
      .map(item => ({
        kind: "item",
        id: item.id,
        title: item.title,
        dateKey: getDateKeyFromValue(item.dueDate)!,
        caseLabel: cases.find(c => c.id === item.caseId)?.title ?? "",
      }));

    return [...upcomingFloating, ...upcomingItems].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [floatingTasks, items, myDaySelections, todayKey, cases]);

  const suggestions = useMemo(() => {
    // IDs déjà ajoutés à Ma journée aujourd'hui
    const todaySelectionRefIds = new Set(
      myDaySelections
        .filter((entry) => entry.dateKey === todayKey)
        .map((entry) => entry.refId)
    );
    const notAdded = (item: Item) => !todaySelectionRefIds.has(item.id);
    const notDone = (item: Item) => getProgressLevel(item.status) !== 3;
    // Tâche actionnable : sous-tâche (level 3) OU tâche sans sous-tâches (level 2 feuille)
    const itemIdsWithChildren = new Set(items.filter(i => i.parentItemId).map(i => i.parentItemId!));
    const isLeaf = (item: Item) => item.level === 3 || !itemIdsWithChildren.has(item.id);
    const recentDays = 5; // ajoutées dans les 5 derniers jours
    const recentThreshold = new Date();
    recentThreshold.setDate(recentThreshold.getDate() - recentDays);

    // 1. Importantes (starred)
    const starred = items.filter(item => item.starred && notAdded(item) && notDone(item) && isLeaf(item));

    // 2. En retard (dueDate < today, non fait)
    const overdue = items.filter(item => {
      if (!notAdded(item) || !notDone(item) || item.starred || !isLeaf(item)) return false;
      const dueKey = getDateKeyFromValue(item.dueDate);
      return dueKey ? dueKey < todayKey : false;
    });

    // 3. Échéances aujourd'hui
    const dueToday = items.filter(item => {
      if (!notAdded(item) || !notDone(item) || item.starred || !isLeaf(item)) return false;
      const dueKey = getDateKeyFromValue(item.dueDate);
      return dueKey === todayKey;
    });

    // 4. Ajoutées récemment (createdAt dans les N derniers jours, sans échéance OU échéance déjà passée pas déjà classée)
    const recent = items.filter(item => {
      if (!notAdded(item) || !notDone(item) || item.starred || !isLeaf(item)) return false;
      const dueKey = getDateKeyFromValue(item.dueDate);
      // Avec date : on exclut totalement — les tâches en retard / aujourd'hui sont déjà classées,
      // et celles dans le futur ne doivent pas être suggérées aujourd'hui (elles ont déjà une date).
      if (dueKey) return false;
      const createdAt = new Date(item.createdAt);
      return createdAt >= recentThreshold;
    });

    return { starred, overdue, dueToday, recent };
  }, [items, myDaySelections, todayKey]);

  const reparentOptions = useMemo(() => {
    if (!reparentTarget) return [];
    const options: ParentOption[] = [];
    cases.forEach((entry) => {
      options.push({
        id: entry.id,
        kind: "case",
        label: `N1 • ${entry.title}`
      });
    });
    const allowItemParents = reparentTarget.level === 3 || !reparentHasChildren;
    if (allowItemParents) {
      items
        .filter((item) => !item.parentItemId)
        .forEach((item) => {
          if (item.id === reparentTarget.id) return;
          const caseLabel = caseTitleById.get(item.caseId);
          options.push({
            id: item.id,
            kind: "item",
            caseId: item.caseId,
            label: `N2 • ${item.title}${caseLabel ? ` (${caseLabel})` : ""}`
          });
        });
    }
    const query = reparentSearch.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [caseTitleById, cases, items, reparentHasChildren, reparentSearch, reparentTarget]);

  useEffect(() => {
    if (!isReparentOpen) return;
    setReparentCursor(0);
  }, [isReparentOpen, reparentSearch]);

  useEffect(() => {
    if (reparentOptions.length === 0) return;
    if (reparentCursor >= reparentOptions.length) {
      setReparentCursor(0);
    }
  }, [reparentCursor, reparentOptions.length]);

  const stagnantSuggestions = useMemo(() => {
    const windowKeySet = new Set(windowKeys);
    const todaySelectionIds = new Set(
      myDaySelections
        .filter((entry) => entry.dateKey === todayKey && (entry.refType === "item" || entry.refType === "subitem"))
        .map((entry) => entry.refId)
    );
    const windowSelectionIds = new Set(
      myDaySelections
        .filter((entry) => windowKeySet.has(entry.dateKey) && (entry.refType === "item" || entry.refType === "subitem"))
        .map((entry) => entry.refId)
    );
    return items
      .filter((item) => windowSelectionIds.has(item.id))
      .filter((item) => !todaySelectionIds.has(item.id))
      .filter((item) => getProgressLevel(item.status) !== 3)
      .filter((item) => {
        const referenceDate = toDate(item.lastProgressAt) ?? toDate(item.createdAt);
        return referenceDate ? referenceDate.getTime() <= stagnantThreshold.getTime() : false;
      })
      .map((item) => ({
        ...item,
        progressLevel: item.progressLevel ?? getProgressLevel(item.status),
        lastProgressDate: item.lastProgressAt ?? item.createdAt
      }));
  }, [items, myDaySelections, stagnantThreshold, todayKey, windowKeys]);

  const selectRange = (ids: string[], startId: string | null, endId: string) => {
    if (!startId) return [endId];
    const startIndex = ids.indexOf(startId);
    const endIndex = ids.indexOf(endId);
    if (startIndex === -1 || endIndex === -1) return [endId];
    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    return ids.slice(from, to + 1);
  };

  const handleSelectCase = (id: string, options?: { multi?: boolean; range?: boolean }) => {
    setSelectedCaseId(id);
    setSelectedItemId(null);
    setSelectedSubItemId(null);
    setSelectedItemIds([]);
    setSelectedSubItemIds([]);
    setActiveColumn("cases");
    setDetailTarget({ type: "case", id });
    if (options?.range) {
      setSelectedCaseIds(selectRange(sortedCases.map((entry) => entry.id), lastCaseId, id));
    } else if (options?.multi) {
      setSelectedCaseIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
    } else {
      setSelectedCaseIds([id]);
    }
    setLastCaseId(id);
  };

  const handleSelectItem = (id: string, options?: { multi?: boolean; range?: boolean }) => {
    setSelectedItemId(id);
    setSelectedSubItemId(null);
    setSelectedSubItemIds([]);
    setActiveColumn("items");
    setDetailTarget({ type: "item", id });
    if (options?.range) {
      setSelectedItemIds(selectRange(itemsColumnItems.map((entry) => entry.id), lastItemId, id));
    } else if (options?.multi) {
      setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
    } else {
      setSelectedItemIds([id]);
    }
    setLastItemId(id);
  };

  const handleSelectSubItem = (id: string, options?: { multi?: boolean; range?: boolean }) => {
    setSelectedSubItemId(id);
    setActiveColumn("subitems");
    setDetailTarget({ type: "item", id });
    if (options?.range) {
      setSelectedSubItemIds(selectRange(subItems.map((entry) => entry.id), lastSubItemId, id));
    } else if (options?.multi) {
      setSelectedSubItemIds((prev) =>
        prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
      );
    } else {
      setSelectedSubItemIds([id]);
    }
    setLastSubItemId(id);
  };

  const handleOpenReparent = useCallback(() => {
    if (isMyDay) return;
    const target =
      detailTarget?.type === "item"
        ? detailItem
        : activeColumn === "subitems"
          ? selectedSubItem
          : activeColumn === "items"
            ? selectedItem
            : null;
    if (!target) {
      showToast("Sélectionnez une tâche d’abord.");
      return;
    }
    setReparentTargetId(target.id);
    setReparentSearch("");
    setReparentCursor(0);
    setIsReparentOpen(true);
  }, [activeColumn, detailItem, detailTarget?.type, isMyDay, selectedItem, selectedSubItem]);

  const handleConfirmReparent = useCallback(
    async (option: ParentOption) => {
      if (!user || !reparentTarget) return;
      if (option.kind === "item") {
        if (option.id === reparentTarget.id) {
          showToast("Impossible de rattacher une tâche à elle-même.");
          return;
        }
        if (reparentTarget.level === 2 && reparentHasChildren) {
          showToast("Rattachement impossible : dépasserait 3 niveaux.");
          return;
        }
        const parentItem = items.find((item) => item.id === option.id);
        if (!parentItem) return;
        await updateItem(user.uid, reparentTarget.id, {
          parentItemId: parentItem.id,
          level: 3,
          caseId: parentItem.caseId
        });
        setSelectedCaseId(parentItem.caseId);
        setSelectedCaseIds([parentItem.caseId]);
        setSelectedItemId(parentItem.id);
        setSelectedItemIds([parentItem.id]);
        setSelectedSubItemId(reparentTarget.id);
        setSelectedSubItemIds([reparentTarget.id]);
        setDetailTarget({ type: "item", id: reparentTarget.id });
        setIsReparentOpen(false);
        showToast("Tâche rattachée.");
        return;
      }
      const updates: Promise<void>[] = [];
      updates.push(
        updateItem(user.uid, reparentTarget.id, {
          parentItemId: null,
          level: 2,
          caseId: option.id
        })
      );
      if (reparentHasChildren && option.id !== reparentTarget.caseId) {
        items
          .filter((item) => item.parentItemId === reparentTarget.id)
          .forEach((child) => {
            updates.push(updateItem(user.uid, child.id, { caseId: option.id }));
          });
      }
      await Promise.all(updates);
      setSelectedCaseId(option.id);
      setSelectedCaseIds([option.id]);
      setSelectedItemId(reparentTarget.id);
      setSelectedItemIds([reparentTarget.id]);
      setSelectedSubItemId(null);
      setSelectedSubItemIds([]);
      setDetailTarget({ type: "item", id: reparentTarget.id });
      setIsReparentOpen(false);
      showToast("Tâche rattachée.");
    },
    [items, reparentHasChildren, reparentTarget, user]
  );

  const handleCloseReparent = useCallback(() => {
    setIsReparentOpen(false);
    setReparentTargetId(null);
  }, []);

  const showToast = (message: string) => setToast(message);

  // Son de complétion (Web Audio API, pas de fichier externe)
  const playAdd = () => {
    if (!settings.sound) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.10, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  };

  const playDone = () => {
    if (!settings.sound) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };


  const scheduleDelete = (message: string, action: () => Promise<void>, restore: () => Promise<void>) => {
    // Annuler le pendingDelete précédent (sans restaurer)
    if (pendingDelete?.timeoutId) {
      window.clearTimeout(pendingDelete.timeoutId);
    }
    // Exécuter la suppression immédiatement
    action();
    const expiresAt = Date.now() + (settings.deleteDelay * 1000);
    const timeoutId = window.setTimeout(() => {
      setPendingDelete(null);
    }, settings.deleteDelay * 1000);
    setPendingDelete({ message, action, restore, timeoutId, expiresAt });
  };

  const handleUndoDelete = async () => {
    if (pendingDelete?.timeoutId) {
      window.clearTimeout(pendingDelete.timeoutId);
    }
    if (pendingDelete?.restore) {
      await pendingDelete.restore();
    }
    setPendingDelete(null);
  };

  const handleDelete = async () => {
    if (!user) return;
    if (isMyDay) {
      // Mode sélection multi mémos
      if (selectedFloatingIds.length > 0) {
        const tasksToDelete = selectedFloatingIds.map(id => floatingTasks.find(t => t.id === id)).filter(Boolean) as typeof floatingTasks;
        scheduleDelete(`Supprimer ${selectedFloatingIds.length} mémo(s).`, async () => {
          await deleteFloatingTasks(user.uid, selectedFloatingIds);
          setSelectedFloatingIds([]);
        }, async () => {
          await restoreFloatingTasks(user.uid, tasksToDelete);
        });
        return;
      }
      // Suppression d'un mémo flottant ouvert dans le détail
      if (myDayDetailId && myDayDetailId.startsWith("f-")) {
        const floatingId = myDayDetailId.slice(2);
        const task = floatingTasks.find(t => t.id === floatingId);
        if (!task) return;
        const taskSnapshot = [{ ...task }] as typeof floatingTasks;
        scheduleDelete("Supprimer le mémo.", async () => {
          await deleteFloatingTasks(user.uid, [floatingId]);
          setMyDayDetailId(null);
        }, async () => {
          await restoreFloatingTasks(user.uid, taskSnapshot);
        });
        return;
      }
      // Suppression d'une tâche de dossier ouverte dans le détail depuis Ma journée
      if (detailTarget?.type === "item") {
        const ids = [detailTarget.id];
        const subCount = items.filter((item) => item.parentItemId && ids.includes(item.parentItemId)).length;
        const label = subCount > 0 ? `Supprimer 1 tâche et ${subCount} sous-tâche(s).` : "Supprimer la tâche.";
        const itemsSnapshot = items.filter(i => ids.includes(i.id) || (i.parentItemId && ids.includes(i.parentItemId))).map(i => ({ ...i }));
        scheduleDelete(label, async () => {
          await deleteItemsCascade(user.uid, ids, items);
          setDetailTarget(null);
          setMyDayDetailId(null);
        }, async () => {
          await restoreItems(user.uid, itemsSnapshot);
        });
        return;
      }
      return;
    }
    if (activeColumn === "cases" && selectedCaseIds.length > 0) {
      // Archiver au lieu de supprimer
      await Promise.all(selectedCaseIds.map((id) => handleArchiveCase(id, true)));
      setSelectedCaseIds([]);
      return;
    }
    if (activeColumn === "detail" && detailTarget) {
      if (detailTarget.type === "case") {
        // Archiver au lieu de supprimer
        await handleArchiveCase(detailTarget.id, true);
        return;
      }
      const ids = [detailTarget.id];
      const subCount = items.filter((item) => item.parentItemId && ids.includes(item.parentItemId)).length;
      const label = subCount > 0 ? `Supprimer 1 tâche et ${subCount} sous-tâche(s).` : "Supprimer la tâche.";
      const itemsSnapshot = items.filter(i => ids.includes(i.id) || (i.parentItemId && ids.includes(i.parentItemId))).map(i => ({ ...i }));
      scheduleDelete(label, async () => {
        await deleteItemsCascade(user.uid, ids, items);
        setSelectedItemIds([]);
        setSelectedSubItemIds([]);
        setDetailTarget(null);
      }, async () => {
        await restoreItems(user.uid, itemsSnapshot);
      });
      return;
    }
    if (activeColumn !== "cases") {
      const ids = activeColumn === "items" ? selectedItemIds : selectedSubItemIds;
      if (ids.length === 0) return;
      const subCount = items.filter((item) => item.parentItemId && ids.includes(item.parentItemId)).length;
      const label = subCount > 0 ? `Supprimer ${ids.length} tâche(s) et ${subCount} sous-tâche(s).` : `Supprimer ${ids.length} tâche(s).`;
      const colItemsSnapshot = items.filter(i => ids.includes(i.id) || (i.parentItemId && ids.includes(i.parentItemId))).map(i => ({ ...i }));
      scheduleDelete(label, async () => {
        await deleteItemsCascade(user.uid, ids, items);
        setSelectedItemIds([]);
        setSelectedSubItemIds([]);
      }, async () => {
        await restoreItems(user.uid, colItemsSnapshot);
      });
    }
  };

  const focusWhenReady = (ref: React.MutableRefObject<HTMLInputElement | null>, maxTries = 10) => {
    let tries = 0;
    const attempt = () => {
      if (ref.current) { ref.current.focus(); ref.current.select(); return; }
      if (++tries < maxTries) setTimeout(attempt, 30);
    };
    setTimeout(attempt, 50);
  };

  const handleCreateInActiveColumn = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      await createFloatingTask(user.uid, {
        dateKey: todayKey,
        title: "Nouveau mémo",
        status: "Créé"
      });
      return;
    }
    if (resolvedActiveColumn === "cases") {
      const id = await createCase(user.uid, { title: "Nouveau dossier", legalDueDate: null, caseNote: "" });
      setSelectedCaseId(id);
      setSelectedCaseIds([id]);
      setSelectedItemId(null);
      setSelectedSubItemId(null);
      setSelectedItemIds([]);
      setSelectedSubItemIds([]);
      setDetailTarget({ type: "case", id });
      focusWhenReady(detailTitleRef);
      return;
    }
    if (resolvedActiveColumn === "items") {
      if (!selectedCaseId) {
        showToast("Sélectionnez une tâche racine d’abord.");
        return;
      }
      const id = await createItem(user.uid, {
        caseId: selectedCaseId,
        level: 2,
        title: "Nouvelle tâche",
        status: "Créé",
        parentItemId: null
      });
      setSelectedItemId(id);
      setSelectedItemIds([id]);
      setSelectedSubItemId(null);
      setSelectedSubItemIds([]);
      setDetailTarget({ type: "item", id });
      focusWhenReady(detailTitleRef);
      return;
    }
    if (!selectedItemId) {
      showToast("Sélectionnez une tâche d’abord.");
      return;
    }
    const parentCaseId = selectedItem?.caseId ?? selectedCaseId;
    if (!parentCaseId) {
      showToast("Sélectionnez une tâche racine d’abord.");
      return;
    }
    const id = await createItem(user.uid, {
      caseId: parentCaseId,
      parentItemId: selectedItemId,
      level: 3,
      title: "Nouvelle sous-tâche",
      status: "Créé"
    });
    setSelectedSubItemId(id);
    setSelectedSubItemIds([id]);
    setActiveColumn("subitems");
    setDetailTarget({ type: "item", id });
    focusWhenReady(detailTitleRef);
  }, [isMyDay, resolvedActiveColumn, selectedCaseId, selectedItem?.caseId, selectedItemId, user, todayKey]);

  const handleCreateChildTask = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      await createFloatingTask(user.uid, {
        dateKey: todayKey,
        title: "Nouveau mémo",
        status: "Créé"
      });
      return;
    }
    if (resolvedActiveColumn === "cases") {
      if (!selectedCaseId) {
        showToast("Sélectionnez une tâche racine d’abord.");
        return;
      }
      const id = await createItem(user.uid, {
        caseId: selectedCaseId,
        level: 2,
        title: "Nouvelle tâche",
        status: "Créé",
        parentItemId: null
      });
      setSelectedItemId(id);
      setSelectedItemIds([id]);
      setSelectedSubItemId(null);
      setSelectedSubItemIds([]);
      setActiveColumn("items");
      setDetailTarget({ type: "item", id });
      focusWhenReady(detailTitleRef);
      return;
    }
    if (resolvedActiveColumn === "items") {
      if (!selectedItemId) {
        showToast("Sélectionnez une tâche d’abord.");
        return;
      }
      const parentCaseId = selectedItem?.caseId ?? selectedCaseId;
      if (!parentCaseId) {
        showToast("Sélectionnez une tâche racine d’abord.");
        return;
      }
      const id = await createItem(user.uid, {
        caseId: parentCaseId,
        parentItemId: selectedItemId,
        level: 3,
        title: "Nouvelle sous-tâche",
        status: "Créé"
      });
      setSelectedSubItemId(id);
      setSelectedSubItemIds([id]);
      setActiveColumn("subitems");
      setDetailTarget({ type: "item", id });
      focusWhenReady(detailTitleRef);
      return;
    }
    showToast("Niveau maximal atteint.");
  }, [isMyDay, resolvedActiveColumn, selectedCaseId, selectedItem?.caseId, selectedItemId, user, todayKey]);

  const handleAddToMyDay = async () => {
    if (!user) return;
    // Garde-fou : ne pas créer de doublon si une sélection existe déjà pour la même cible aujourd'hui
    const alreadyInMyDay = (refType: "case" | "item" | "subitem", refId: string) =>
      myDaySelections.some(s => s.dateKey === todayKey && s.refType === refType && s.refId === refId);

    if (detailTarget?.type === "case") {
      if (alreadyInMyDay("case", detailTarget.id)) {
        showToast("Déjà dans Ma journée.");
        return;
      }
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "case",
        refId: detailTarget.id
      });
      showToast("☀ Ajouté à Ma journée.");
      return;
    }
    if (detailTarget?.type === "item" && detailItem) {
      const refType = detailItem.level === 2 ? "item" : "subitem";
      if (alreadyInMyDay(refType, detailItem.id)) {
        showToast("Déjà dans Ma journée.");
        return;
      }
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType,
        refId: detailItem.id
      });
      showToast("☀ Ajouté à Ma journée.");
      return;
    }
    if (selectedCaseId && activeColumn === "cases") {
      if (alreadyInMyDay("case", selectedCaseId)) {
        showToast("Déjà dans Ma journée.");
        return;
      }
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "case",
        refId: selectedCaseId
      });
      showToast("☀ Ajouté à Ma journée.");
    }
    if (activeColumn === "items" && selectedItemId) {
      if (alreadyInMyDay("item", selectedItemId)) {
        showToast("Déjà dans Ma journée.");
        return;
      }
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "item",
        refId: selectedItemId
      });
      showToast("☀ Ajouté à Ma journée.");
    }
    if (activeColumn === "subitems" && selectedSubItemId) {
      if (alreadyInMyDay("subitem", selectedSubItemId)) {
        showToast("Déjà dans Ma journée.");
        return;
      }
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "subitem",
        refId: selectedSubItemId
      });
      showToast("☀ Ajouté à Ma journée.");
    }
  };

  const handleStatusChange = async (status: Status) => {
    if (!user || !detailItem) return;
    if (status === "Traité" && detailItem.level === 2) {
      const subItems = items.filter(i => i.parentItemId === detailItem.id);
      const unfinished = subItems.filter(i => i.status !== "Traité");
      if (unfinished.length > 0) {
        showToast(`${unfinished.length} sous-tâche${unfinished.length > 1 ? "s" : ""} non traitée${unfinished.length > 1 ? "s" : ""} — terminez-les d'abord.`);
        return;
      }
    }
    await updateItemProgress(user.uid, detailItem.id, status);
    await logStatusEvent(user.uid, detailItem.id, detailItem.status, status);
  };

  const handleMarkMyDayItemDone = async (item: Item, selectionId?: string) => {
    if (!user) return;
    if (item.level === 2) {
      const subItems = items.filter(i => i.parentItemId === item.id);
      const unfinished = subItems.filter(i => i.status !== "Traité");
      if (unfinished.length > 0) {
        showToast(`${unfinished.length} sous-tâche${unfinished.length > 1 ? "s" : ""} non traitée${unfinished.length > 1 ? "s" : ""} — terminez-les d'abord.`);
        return;
      }
    }
    playDone();
    await updateItemProgress(user.uid, item.id, "Traité");
    await logStatusEvent(user.uid, item.id, item.status, "Traité");
    // Supprimer l'échéance si la tâche est marquée traitée
    if (item.dueDate) {
      await updateItem(user.uid, item.id, { dueDate: null });
    }
    if (selectionId) {
      await deleteMyDaySelection(user.uid, selectionId);
      setLegacyMyDaySelections(prev => prev.filter(s => s.id !== selectionId));
    }
    setMyDayDetailId(null);
  };

  const handleMarkFloatingDone = async (taskId: string) => {
    if (!user) return;
    if (completingFloatingIds.has(taskId)) return;
    setCompletingFloatingIds(prev => new Set(prev).add(taskId));
    playDone();
    // Laisser le temps à l'animation de jouer avant de retirer
    setTimeout(async () => {
      try {
        await deleteFloatingTasks(user.uid, [taskId]);
        setMyDayDetailId(null);
      } finally {
        setCompletingFloatingIds(prev => { const s = new Set(prev); s.delete(taskId); return s; });
      }
    }, 350);
  };

  const handleCommentAdd = async (body: string) => {
    if (!user || !detailItem) return;
    await createComment(user.uid, { itemId: detailItem.id, body, author: user.email ?? null });
  };

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }
      if (isReparentOpen) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (activeColumn === "subitems") {
          // subitems → items : effacer complètement la sélection sous-tâche
          // et rouvrir le détail de la tâche parente
          setActiveColumn("items");
          setSelectedSubItemId(null);
          setSelectedSubItemIds([]);
          setLastSubItemId(null);
          if (selectedItemId) {
            setDetailTarget({ type: "item", id: selectedItemId });
          }
        } else if (activeColumn === "items") {
          // items → cases : garder le dossier sélectionné actif
          // fermer le détail tâche, ouvrir le détail dossier
          setActiveColumn("cases");
          setSelectedItemId(null);
          setSelectedItemIds([]);
          setSelectedSubItemId(null);
          setSelectedSubItemIds([]);
          setLastItemId(null);
          setLastSubItemId(null);
          if (selectedCaseId) {
            setDetailTarget({ type: "case", id: selectedCaseId });
          } else {
            setDetailTarget(null);
          }
        } else if (activeColumn === "cases") {
          // cases : fermer le détail si ouvert
          setDetailTarget(null);
        } else if (activeColumn === "detail") {
          // fallback legacy
          setDetailTarget(null);
          setActiveColumn("cases");
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (activeColumn === "cases" && selectedCaseId) {
          setActiveColumn("items");
          // Toujours repartir de zéro sur les sous-tâches
          setSelectedSubItemId(null);
          setSelectedSubItemIds([]);
          setLastSubItemId(null);
          if (itemsColumnItems.length > 0) {
            const firstId = itemsColumnItems[0]?.id ?? null;
            if (firstId) {
              setSelectedItemId(firstId);
              setSelectedItemIds([firstId]);
              setLastItemId(firstId);
              setDetailTarget({ type: "item", id: firstId });
            }
          }
        } else if (activeColumn === "items" && selectedItemId) {
          if (subItems.length > 0) {
            setActiveColumn("subitems");
            const firstId = subItems[0]?.id ?? null;
            if (firstId) {
              setSelectedSubItemId(firstId);
              setSelectedSubItemIds([firstId]);
              setLastSubItemId(firstId);
            }
          } else {
            setDetailTarget({ type: "item", id: selectedItemId });
          }
        } else if (activeColumn === "subitems" && selectedSubItemId) {
          setDetailTarget({ type: "item", id: selectedSubItemId });
        }
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        const scrollToRow = (listRef: React.RefObject<HTMLDivElement | null>, id: string) => {
          if (!listRef.current) return;
          const el = listRef.current.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
          el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        };
        if (activeColumn === "cases") {
          const ids = sortedCases.map((entry) => entry.id);
          if (ids.length === 0) return;
          const cur = ids.indexOf(selectedCaseId ?? ids[0]);
          const nextId = ids[Math.min(Math.max(0, cur + direction), ids.length - 1)];
          if (nextId) {
            setSelectedCaseId(nextId);
            setSelectedCaseIds([nextId]);
            setDetailTarget({ type: "case", id: nextId });
            scrollToRow(casesListRef, nextId);
          }
        }
        if (activeColumn === "items") {
          const ids = itemsColumnItems.map((entry) => entry.id);
          if (ids.length === 0) return;
          const cur = ids.indexOf(selectedItemId ?? ids[0]);
          const nextId = ids[Math.min(Math.max(0, cur + direction), ids.length - 1)];
          if (nextId) {
            setSelectedItemId(nextId);
            setSelectedItemIds([nextId]);
            setSelectedSubItemId(null);
            setSelectedSubItemIds([]);
            setDetailTarget({ type: "item", id: nextId });
            scrollToRow(itemsListRef, nextId);
          }
        }
        if (activeColumn === "subitems") {
          const ids = subItems.map((entry) => entry.id);
          if (ids.length === 0) return;
          const cur = ids.indexOf(selectedSubItemId ?? ids[0]);
          const nextId = ids[Math.min(Math.max(0, cur + direction), ids.length - 1)];
          if (nextId) {
            setSelectedSubItemId(nextId);
            setSelectedSubItemIds([nextId]);
            setDetailTarget({ type: "item", id: nextId });
            scrollToRow(subitemsListRef, nextId);
          }
        }
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        // Tab : basculer entre Dossiers et Ma journée
        if (typeof window !== "undefined") {
          window.location.href = isMyDay ? "/" : "/my-day";
        }
        return;
      }
      // S → focus recherche dossier
      if ((event.key === "s" || event.key === "S") && !event.metaKey && !event.ctrlKey) {
        const active = document.activeElement;
        if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") return;
        event.preventDefault();
        caseSearchRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        if (caseSearchRef.current === document.activeElement) {
          setCaseSearch("");
          caseSearchRef.current?.blur();
          return;
        }
        if (detailTarget?.type === "case") {
          setActiveColumn("cases");
        } else if (selectedSubItemId && subItems.length > 0) {
          setActiveColumn("subitems");
        } else {
          setActiveColumn("items");
        }
        setDetailTarget(null);
        return;
      }
      if (event.key.toLowerCase() === "n") {
        if (event.shiftKey) {
          await handleCreateChildTask();
        } else {
          await handleCreateInActiveColumn();
        }
        return;
      }
      if (event.key === " " && (detailTarget || myDayDetailId)) {
        event.preventDefault();
        const ref = myDayDetailId
          ? myDayTitleRef.current
          : (detailTarget?.type === "case" ? detailCaseRef.current : detailTitleRef.current);
        if (ref) {
          ref.focus();
          ref.select();
        }
        return;
      }
      if (event.key.toLowerCase() === "i") {
        // Touche I : ouvrir/fermer le panneau détail
        if (detailTarget) {
          setDetailTarget(null);
        } else if (activeColumn === "cases" && selectedCaseId) {
          setDetailTarget({ type: "case", id: selectedCaseId });
        } else if (activeColumn === "items" && selectedItemId) {
          setDetailTarget({ type: "item", id: selectedItemId });
        } else if (activeColumn === "subitems" && selectedSubItemId) {
          setDetailTarget({ type: "item", id: selectedSubItemId });
        }
        return;
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        handleOpenReparent();
        return;
      }
      if (event.key.toLowerCase() === "a") {
        await handleAddToMyDay();
        return;
      }
      if (event.key.toLowerCase() === "c") {
        if (detailItem) {
          handleCommentAdd("Commentaire rapide");
          showToast("Commentaire ajouté.");
        }
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        await handleDelete();
        return;
      }
      if (event.key >= "1" && event.key <= "6") {
        const status = STATUSES[Number(event.key) - 1];
        await handleStatusChange(status);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (activeColumn === "cases") {
          setSelectedCaseIds(cases.map((entry) => entry.id));
        }
        if (activeColumn === "items") {
          setSelectedItemIds(itemsColumnItems.map((entry) => entry.id));
        }
        if (activeColumn === "subitems") {
          setSelectedSubItemIds(subItems.map((entry) => entry.id));
        }
      }
    },
    [
      activeColumn,
      itemsColumnItems,
      subItems,
      selectedCaseId,
      selectedItemId,
      selectedSubItemId,
      detailItem,
      detailTarget,
      sortedCases,
      isReparentOpen,
      handleAddToMyDay,
      handleDelete,
      handleCreateChildTask,
      handleCreateInActiveColumn,
      handleOpenReparent,
      handleStatusChange,
      casesListRef,
      itemsListRef,
      subitemsListRef,
      detailTitleRef,
      detailCaseRef
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleExport = async (caseData: Case) => {
    const json = exportCaseToJson(caseData, items);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${caseData.title}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File | null, mode: "model" | "history") => {
    if (!user || !file) return;
    const text = await file.text();
    try {
      await importCaseFromJson(user.uid, text, mode);
      showToast("Import terminé.");
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const handleArchiveCase = async (caseId: string, archive: boolean) => {
    if (!user) return;
    await updateCase(user.uid, caseId, {
      archived: archive,
      archivedAt: archive ? new Date().toISOString() : null
    });
    if (archive) {
      setSelectedCaseId(null);
      setSelectedCaseIds([]);
      setDetailTarget(null);
      showToast("Dossier archivé.");
    } else {
      showToast("Dossier restauré.");
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!user) return;
    const caseSnapshot = cases.find(c => c.id === caseId);
    const caseItemsSnapshot = items.filter(i => i.caseId === caseId).map(i => ({ ...i }));
    scheduleDelete("Supprimer le dossier et ses tâches.", async () => {
      await deleteCaseCascade(user.uid, caseId, items);
      setSelectedCaseIds([]);
      setSelectedCaseId(null);
      setDetailTarget(null);
    }, async () => {
      if (caseSnapshot) await restoreCase(user.uid, { ...caseSnapshot });
      await restoreItems(user.uid, caseItemsSnapshot);
    });
  };

  // Met à jour l'échéance d'un mémo + ajuste son dateKey (futur = pas dans Ma journée aujourd'hui)
  const handleFloatingDueDate = async (taskId: string, dueDate: Date | null) => {
    if (!user) return;
    const dueDateKey = dueDate ? dueDate.toISOString().slice(0, 10) : null;
    const isFuture = dueDateKey && dueDateKey > todayKey;
    await updateFloatingTask(user.uid, taskId, {
      dueDate: dueDate ? dueDate.toISOString() : null,
      // Si échéance future, sortir de Ma journée actuelle et programmer pour le bon jour
      ...(isFuture ? { dateKey: dueDateKey } : { dateKey: todayKey }),
    });
  };

  const handleAttachFloating = async (task: FloatingTask, caseId: string) => {
    if (!user) return;
    const newItemId = await createItem(user.uid, {
      caseId,
      level: 2,
      title: task.title,
      status: "Créé",
      parentItemId: null,
      dueDate: task.dueDate ?? null,
    });
    // Reprendre le dateKey du mémo : si futur → garder pour qu'il apparaisse "À venir" le jour J ;
    // sinon (présent / pas de date / passé) → aujourd'hui pour rester dans Ma journée du jour.
    const memoDateKey = task.dateKey && task.dateKey > todayKey ? task.dateKey : todayKey;
    try {
      const newSelectionId = await addMyDaySelection(user.uid, {
        refType: "item",
        refId: newItemId,
        dateKey: memoDateKey,
        selectionDate: null,
        dateTs: null,
      });
      // Injection optimiste : la souscription Firestore peut mettre ~1s à propager
      // le snapshot, pendant lequel la nouvelle tâche apparaîtrait à tort en
      // suggestion. On l'ajoute donc immédiatement à l'état local.
      setLegacyMyDaySelections(prev => [
        ...prev,
        { id: newSelectionId, refType: "item", refId: newItemId, dateKey: memoDateKey },
      ]);
    } catch (err) {
      console.error("[handleAttachFloating] addMyDaySelection a échoué", err);
      showToast("⚠ Tâche créée mais non ajoutée à Ma journée.");
    }
    await deleteFloatingTasks(user.uid, [task.id]);
    setMyDayDetailId(null);
    showToast(`"${task.title}" rattachée au dossier.`);
  };



  const handleReparentKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setReparentCursor((prev) => Math.min(prev + 1, Math.max(0, reparentOptions.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setReparentCursor((prev) => Math.max(0, prev - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = reparentOptions[reparentCursor];
      if (option) {
        handleConfirmReparent(option);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handleCloseReparent();
    }
  };

  if (!user) {
    return null;
  }



  // ── helpers visuels (statusClass défini plus haut) ──────────────────────


  const btnGhost = "text-[14px] font-[inherit] bg-bg border border-border text-text-2 px-2 py-[2px] rounded cursor-pointer hover:border-border-strong hover:text-tx transition-all";
  const btnDanger = "text-[14px] font-[inherit] bg-bg border border-[#fecaca] text-red-600 px-2 py-[2px] rounded cursor-pointer hover:bg-red-50 hover:border-red-400 transition-all";
  const iconBtn = "w-6 h-6 flex items-center justify-center border-none bg-transparent rounded text-tx-3 text-sm cursor-pointer hover:bg-bg-hover hover:text-tx-2 transition-all";
  const propKey = "w-[120px] shrink-0 text-[14px] text-tx-3 py-1 flex items-center gap-1.5";
  const propVal = "flex-1 text-[14px] text-tx py-1 px-2 rounded min-h-[28px] flex items-center";

  // ── DETAIL PANEL ─────────────────────────────────────────────────────────

  const detailPanel = showDetailColumn && (detailItem || detailCase) ? (
    <section className="finder-detail" style={{boxShadow: "-3px 0 12px rgba(0,0,0,0.06)"}}>
      <div className="finder-header">
        <span className="text-[11px] font-medium text-tx-3 uppercase tracking-widest">
          {detailCase ? "Dossier" : detailItem && detailItem.level === 3 ? "Sous-tâche" : "Tâche"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-0">

        {/* ── DÉTAIL DOSSIER ── */}
        {detailCase ? (
          <>
            <input
              ref={detailCaseRef}
              className="detail-title-input"
              value={detailCase.title}
              onChange={(e) => updateCase(user.uid, detailCase.id, { title: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />

            <div className="space-y-4">
              {/* Échéance */}
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-2">Échéance</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(() => {
                    const today = new Date(); today.setHours(12,0,0,0);
                    const shortcuts = [
                      { label: "Aujourd'hui", date: new Date(today) },
                      { label: "Demain", date: new Date(today.getTime() + 86400000) },
                      { label: "Dans 1 sem.", date: new Date(today.getTime() + 7*86400000) },
                      { label: "Dans 1 mois", date: new Date(today.getFullYear(), today.getMonth()+1, today.getDate(), 12) },
                      { label: "Dans 3 mois", date: new Date(today.getFullYear(), today.getMonth()+3, today.getDate(), 12) },
                      { label: "Dans 6 mois", date: new Date(today.getFullYear(), today.getMonth()+6, today.getDate(), 12) },
                    ];
                    return shortcuts.map(({ label, date }) => (
                      <button key={label}
                        onClick={() => updateCase(user.uid, detailCase.id, { legalDueDate: date.toISOString() })}
                        className="text-[11px] font-[inherit] px-2 py-1 rounded border border-border bg-bg-subtle text-tx-2 cursor-pointer hover:border-border-strong hover:text-tx transition-colors">
                        {label}
                      </button>
                    ));
                  })()}
                  {detailCase.legalDueDate && (
                    <button onClick={() => updateCase(user.uid, detailCase.id, { legalDueDate: null })}
                      className="text-[11px] font-[inherit] px-2 py-1 rounded border border-border bg-bg-subtle text-red-400 cursor-pointer hover:border-red-300 transition-colors">
                      ✕ Retirer
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={e => { const inp = (e.currentTarget.parentElement?.querySelector("input[type=date]") as any); if (inp?.showPicker) inp.showPicker(); else inp?.focus(); }}
                    className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none text-tx-2 transition-opacity hover:opacity-70"
                    title="Ouvrir le calendrier"
                  ><Icon name="calendar" size={20} /></button>
                  <input
                    key={detailCase.id + "-due"}
                    type="date"
                    className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none flex-1 focus:border-border-strong transition-colors"
                    defaultValue={detailCase.legalDueDate?.slice(0, 10) ?? ""}
                    onBlur={(e) => {
                      if (!e.target.value) { updateCase(user.uid, detailCase.id, { legalDueDate: null }); return; }
                      const [y, m, d] = e.target.value.split("-").map(Number);
                      if (y < 1900 || y > 2100) return;
                      updateCase(user.uid, detailCase.id, { legalDueDate: new Date(y, m-1, d, 12).toISOString() });
                    }}
                  />
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Note */}
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Note</p>
                <textarea
                  className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-2 outline-none w-full resize-none focus:border-border-strong transition-colors"
                  rows={4}
                  value={detailCase.caseNote ?? ""}
                  onChange={(e) => updateCase(user.uid, detailCase.id, { caseNote: e.target.value })}
                  placeholder="Ajouter une note…"
                />
              </div>

              <div className="border-t border-border" />

            </div>
          </>
        ) : null}

        {/* ── DÉTAIL TÂCHE ── */}
        {detailItem ? (
          <>
            {/* Titre avec étoile à gauche */}
            <div className="flex items-center gap-3 mb-5">
              <button
                title={detailItem.starred ? "Retirer l'étoile" : "Marquer importante"}
                onClick={() => updateItem(user.uid, detailItem.id, { starred: !detailItem.starred })}
                className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-all hover:scale-110"
                style={{ color: detailItem.starred ? "#f59e0b" : "#d1d5db" }}
              >
                <Icon name="star" size={26} filled={!!detailItem.starred} strokeWidth={1.75} />
              </button>
              <input
                ref={detailTitleRef}
                className="detail-title-input"
                style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
                value={detailItem.title}
                onChange={(e) => updateItem(user.uid, detailItem.id, { title: e.target.value })}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>

            <div className="space-y-4">
              {/* Statuts + retirer de Ma journée */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {STATUSES.map(s => (
                  <button key={s} onClick={() => handleStatusChange(s)}
                    className={`${statusClass(s)} cursor-pointer border-none transition-all text-[13px] px-4 py-1.5 rounded-full ${detailItem.status === s ? "opacity-100" : "opacity-25 hover:opacity-60"}`}>
                    {s}
                  </button>
                ))}
                {myDayMarkerItemIds.has(detailItem.id) && (
                  <button
                    onClick={() => {
                      const sels = myDaySelections.filter(s => (s.refType === "item" || s.refType === "subitem") && s.refId === detailItem.id);
                      sels.forEach(sel => {
                        setPendingRemovalIds(prev => new Set([...prev, sel.id]));
                        setLegacyMyDaySelections(prev => prev.filter(x => x.id !== sel.id));
                        deleteMyDaySelection(user.uid, sel.id);
                      });
                      showToast("Retirée de Ma journée.");
                    }}
                    className="ml-auto inline-flex items-center gap-1.5 font-[inherit] text-[12px] px-3 py-1.5 rounded-full border bg-transparent text-tx-2 cursor-pointer hover:border-border-strong hover:text-tx transition-colors"
                    style={{ borderColor: "var(--border)" }}
                    title="Retirer de Ma journée"
                  >
                    <Icon name="myday" size={13} />
                    Retirer
                  </button>
                )}
              </div>

              <div className="border-t border-border" />

              {/* Échéance */}
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-2">Échéance</p>
                {(() => {
                  // Sous-tâches avec échéance (niveau 2 uniquement)
                  const subWithDue = detailItem.level === 2
                    ? items.filter(i => i.parentItemId === detailItem.id && !!i.dueDate)
                    : [];
                  const latestSubDue = subWithDue.length > 0
                    ? subWithDue.reduce((max, i) => i.dueDate! > max ? i.dueDate! : max, subWithDue[0].dueDate!)
                    : null;

                  const handleSetDue = (iso: string | null) => {
                    if (!iso) { updateItem(user.uid, detailItem.id, { dueDate: null }); return; }
                    if (latestSubDue && iso < latestSubDue) {
                      showToast("Échéance impossible : une sous-tâche a une échéance plus tardive.");
                      return;
                    }
                    updateItem(user.uid, detailItem.id, { dueDate: iso });
                  };

                  const today = new Date(); today.setHours(12,0,0,0);
                  const shortcuts = [
                    { label: "Aujourd'hui", date: new Date(today) },
                    { label: "Demain", date: new Date(today.getTime() + 86400000) },
                    { label: "Dans 2 j.", date: new Date(today.getTime() + 2*86400000) },
                    { label: (() => { const d = new Date(today); const dow = d.getDay(); const diff = (1-dow+7)%7||7; d.setDate(d.getDate()+diff); return "Lun. "+d.getDate()+"/"+(d.getMonth()+1); })(), date: (() => { const d = new Date(today); const dow = d.getDay(); const diff = (1-dow+7)%7||7; d.setDate(d.getDate()+diff); return d; })() },
                    { label: "Dans 1 sem.", date: new Date(today.getTime() + 7*86400000) },
                    { label: "Dans 1 mois", date: new Date(today.getFullYear(), today.getMonth()+1, today.getDate(), 12) },
                  ];

                  return (
                    <>
                      {latestSubDue && (
                        <p className="text-[11px] text-tx-3 mb-2">
                          ⚠ Doit être au plus tôt le {new Date(latestSubDue).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} (échéance de la sous-tâche la plus tardive)
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {shortcuts.map(({ label, date }) => (
                          <button key={label}
                            onClick={() => handleSetDue(date.toISOString())}
                            className="text-[11px] font-[inherit] px-2 py-1 rounded border border-border bg-bg-subtle text-tx-2 cursor-pointer hover:border-border-strong hover:text-tx transition-colors">
                            {label}
                          </button>
                        ))}
                        {detailItem.dueDate && (
                          <button onClick={() => handleSetDue(null)}
                            className="text-[11px] font-[inherit] px-2 py-1 rounded border border-border bg-bg-subtle text-red-400 cursor-pointer hover:border-red-300 transition-colors">
                            ✕ Retirer
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={e => { const inp = (e.currentTarget.parentElement?.querySelector("input[type=date]") as any); if (inp?.showPicker) inp.showPicker(); else inp?.focus(); }}
                          className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none text-tx-2 transition-opacity hover:opacity-70"
                          title="Ouvrir le calendrier"
                        ><Icon name="calendar" size={20} /></button>
                        <input key={detailItem.id + "-due"} type="date"
                          className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none flex-1 focus:border-border-strong transition-colors"
                          defaultValue={detailItem.dueDate?.slice(0, 10) ?? ""}
                          onBlur={(e) => {
                            if (!e.target.value) { handleSetDue(null); return; }
                            const [y, m, d] = e.target.value.split("-").map(Number);
                            if (y < 1900 || y > 2100) return;
                            handleSetDue(new Date(y, m-1, d, 12).toISOString());
                          }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Dossier — lien vers Mes Dossiers */}
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1">Dossier</p>
                {(() => {
                  const caseItem = cases.find(c => c.id === detailItem.caseId);
                  const parentItem = detailItem.parentItemId ? items.find(i => i.id === detailItem.parentItemId) : null;
                  const navigateTo = () => {
                    // Stocker la sélection cible dans sessionStorage
                    sessionStorage.setItem("pendingSelection", JSON.stringify({
                      caseId: detailItem.caseId,
                      itemId: detailItem.level === 3 && parentItem ? parentItem.id : detailItem.id,
                      subItemId: detailItem.level === 3 ? detailItem.id : null,
                    }));
                    // Naviguer vers la vue Dossiers
                    router.push("/");
                  };
                  return (
                    <button onClick={navigateTo}
                      className="font-[inherit] text-[12px] font-medium bg-bg-subtle border border-border text-tx-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-bg-hover hover:text-tx transition-colors flex items-center gap-1.5 w-full">
                      <span>📁</span>
                      <span className="flex-1 text-left truncate">{caseItem?.title ?? "—"}{parentItem ? ` › ${parentItem.title}` : ""}</span>
                      <span className="text-tx-3 text-[10px]">→</span>
                    </button>
                  );
                })()}
              </div>

              <div className="border-t border-border" />

              {/* Commentaires */}
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-2">Commentaires</p>
                <div className="space-y-2 mb-2">
                  {detailComments.map((c) => (
                    <div key={c.id} className="bg-bg-subtle rounded-lg px-3 py-2 group relative">
                      <textarea
                        className="font-[inherit] text-[13px] text-tx leading-relaxed bg-transparent border-none outline-none w-full resize-none cursor-text focus:bg-bg focus:border focus:border-border focus:rounded focus:px-1 transition-all"
                        defaultValue={c.body}
                        rows={Math.max(1, Math.ceil(c.body.length / 40))}
                        onBlur={(e) => {
                          const newBody = e.target.value.trim();
                          if (newBody && newBody !== c.body) {
                            import("@/lib/firestore").then(({ updateComment }) => 
                              updateComment(user.uid, c.id, { body: newBody })
                            ).catch(() => {});
                          }
                        }}
                      />
                      <p className="text-[11px] text-tx-3 mt-1">{formatDateFR(c.createdAt)}{c.author ? ` — ${c.author}` : ""}</p>
                    </div>
                  ))}
                </div>
                <textarea
                  className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-2 outline-none w-full resize-none focus:border-border-strong transition-colors placeholder:text-tx-3"
                  rows={3}
                  placeholder="Ajouter un commentaire… (Entrée)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const t = e.target as HTMLTextAreaElement;
                      if (t.value.trim()) { handleCommentAdd(t.value.trim()); t.value = ""; }
                    }
                  }}
                />
              </div>

              {/* Timeline */}
              {detailEvents.length > 0 && (
                <div>
                  <button
                    className="text-[10px] font-medium text-tx-3 uppercase tracking-widest bg-transparent border-none cursor-pointer hover:text-tx transition-colors"
                    onClick={() => setIsTimelineOpen(p => !p)}
                  >
                    {isTimelineOpen ? "▾ Timeline" : "▸ Timeline"}
                  </button>
                  {isTimelineOpen && (
                    <div className="space-y-1.5 mt-2">
                      {detailEvents.map((ev) => (
                        <div key={ev.id} className="bg-bg-subtle rounded-lg px-3 py-1.5">
                          <p className="text-[12px] text-tx">{ev.type}</p>
                          <p className="text-[11px] text-tx-3">{formatDateFR(ev.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* ── BARRE D'ACTIONS BAS ── */}
      <div className="detail-actions-bar">
        {detailCase && (
          <>
            <button className="detail-action-btn" onClick={() => handleExport(detailCase)}>
              <span>↓</span> Exporter
            </button>
            <button className="detail-action-btn" onClick={() => handleArchiveCase(detailCase.id, !detailCase.archived)}>
              <span>{detailCase.archived ? "↩" : "📦"}</span> {detailCase.archived ? "Restaurer" : "Archiver"}
            </button>
            {detailCase.archived && (
              <button className="detail-action-btn detail-action-danger" onClick={() => {
                if (window.confirm("Supprimer définitivement ce dossier et toutes ses tâches ? Cette action est irréversible.")) {
                  deleteCaseCascade(user.uid, detailCase.id, items).then(() => {
                    setDetailTarget(null);
                    setSelectedCaseId(null);
                  });
                }
              }}>
                <span>🗑</span> Supprimer
              </button>
            )}
          </>
        )}
        {detailItem && (
          <>
            <button className="detail-action-btn detail-action-primary" onClick={handleAddToMyDay}>
              <span>☀</span> Ma journée
            </button>
            {detailItem && (
              <button className="detail-action-btn" onClick={handleOpenReparent}>
                <span>⇄</span> Rattacher
              </button>
            )}
            <button className="detail-action-btn detail-action-danger" onClick={handleDelete}>
              <span>✕</span> Supprimer
            </button>
          </>
        )}
      </div>

    </section>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── HEADER ── */}
      <header className="h-[44px] flex items-center px-4 border-b border-border bg-bg shrink-0 z-10 relative">
        {/* Liens navigation — gauche */}
        <nav className="flex gap-0.5 z-10">
          <Link
            href="/"
            className={`text-[13px] px-2.5 py-1 rounded border-none bg-transparent cursor-pointer transition-all ${
              !isMyDay ? "bg-bg-active text-tx font-medium" : "text-tx-2 hover:bg-bg-hover hover:text-tx"
            }`}
          >
            Dossiers
          </Link>
          <Link
            href="/my-day"
            className={`text-[13px] px-2.5 py-1 rounded border-none bg-transparent cursor-pointer transition-all ${
              isMyDay ? "bg-bg-active text-tx font-medium" : "text-tx-2 hover:bg-bg-hover hover:text-tx"
            }`}
          >
            Ma journée
          </Link>
        </nav>

        {/* Logo — centré absolument */}
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
          <Link href="/" className="pointer-events-auto">
            <img src="/logo-henri.png" alt="Henri" style={{height:"36px", width:"auto"}} />
          </Link>
        </div>

        {/* Actions — droite */}
        <div className="flex items-center gap-2.5 text-[12px] text-tx-3 ml-auto z-10">
          <span className="hidden sm:inline">{user.email}</span>
          <Link href="/settings" className={btnGhost} style={{textDecoration:"none"}}>Préférences</Link>
          <button className={btnGhost} onClick={() => signOut(auth)}>Déconnexion</button>
        </div>
      </header>

      {/* ── RAPPEL ÉCHÉANCES ── */}
      {!isMyDay && reminderItems.length > 0 && (
        <div style={{background:"#fef3c7", borderBottom:"1px solid #fcd34d", position:"relative", zIndex:10}}>
          {/* Barre principale */}
          <div className="flex items-center justify-between px-4 py-2">
            <button
              className="flex items-center gap-2 text-[13px] font-medium text-[#92400e] bg-transparent border-none cursor-pointer hover:underline"
              onClick={() => setReminderOpen(p => !p)}
            >
              <span>⚠</span>
              <span><strong>{reminderItems.length} tâche{reminderItems.length > 1 ? "s" : ""}</strong> à échéance aujourd'hui ou en retard</span>
              <span className="text-[10px]">{reminderOpen ? "▲" : "▼"}</span>
            </button>
            <div className="flex gap-2">
              <button
                className="text-[12px] font-[inherit] font-medium bg-[#92400e] text-white border-none px-3 py-1 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                onClick={async () => {
                  if (!user) return;
                  await Promise.all(reminderItems.map(item =>
                    addMyDaySelection(user.uid, { dateKey: todayKey, refType: item.level === 2 ? "item" : "subitem", refId: item.id })
                  ));
                  await Promise.all(reminderItems.map(item =>
                    updateItem(user.uid, item.id, { lastReminderAt: new Date().toISOString() })
                  ));
                  setReminderOpen(false);
                  showToast(`☀ ${reminderItems.length} tâche${reminderItems.length > 1 ? "s" : ""} ajoutée${reminderItems.length > 1 ? "s" : ""} à Ma journée`);
                }}
              >☀ Tout ajouter à Ma journée</button>
              <button
                className="text-[12px] font-[inherit] bg-transparent border border-[#d97706] text-[#92400e] px-3 py-1 rounded-lg cursor-pointer hover:bg-[#fde68a] transition-colors"
                onClick={async () => {
                  if (!user) return;
                  await Promise.all(reminderItems.map(item =>
                    updateItem(user.uid, item.id, { lastReminderAt: new Date().toISOString() })
                  ));
                  setReminderOpen(false);
                }}
              >Ignorer</button>
            </div>
          </div>

          {/* Liste déroulante des tâches */}
          {reminderOpen && (
            <div style={{borderTop:"1px solid #fcd34d", background:"#fffbeb"}} className="px-4 py-2 space-y-1">
              {reminderItems.map(item => {
                const caseTitle = cases.find(c => c.id === item.caseId)?.title ?? "";
                const parentTitle = item.parentItemId ? items.find(i => i.id === item.parentItemId)?.title : null;
                return (
                  <div key={item.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#fef3c7] transition-colors group">
                    <button
                      className="flex-1 text-left bg-transparent border-none cursor-pointer"
                      onClick={() => {
                        // Sélectionner le dossier + la tâche
                        const caseId = item.caseId;
                        handleSelectCase(caseId, {});
                        setActiveColumn("items");
                        setSelectedItemId(item.id);
                        setSelectedItemIds([item.id]);
                        setDetailTarget({ type: "item", id: item.id });
                        setReminderOpen(false);
                      }}
                    >
                      <p className="text-[13px] font-medium text-[#92400e]">{item.title}</p>
                      <p className="text-[11px] text-[#b45309]">
                        {caseTitle}{parentTitle ? ` › ${parentTitle}` : ""}
                        {item.dueDate && <span className="ml-2">· Éch. {new Date(item.dueDate).toLocaleDateString("fr-FR", {day:"numeric", month:"short"})}</span>}
                      </p>
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-[11px] font-[inherit] font-medium bg-[#92400e] text-white border-none px-2 py-0.5 rounded cursor-pointer hover:opacity-90 ml-2 shrink-0 transition-opacity"
                      onClick={async () => {
                        if (!user) return;
                        await addMyDaySelection(user.uid, { dateKey: todayKey, refType: item.level === 2 ? "item" : "subitem", refId: item.id });
                        await updateItem(user.uid, item.id, { lastReminderAt: new Date().toISOString() });
                        showToast("☀ Ajouté à Ma journée");
                      }}
                    >☀ Ajouter</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ VUE DOSSIERS ══ */}
      {!isMyDay ? (
        <div className="flex flex-1 overflow-hidden">

          {/* ── COL DOSSIERS ── */}
          {showCasesColumn && (
            <div className="finder-column">
              <div className="finder-header">
                <span>{showArchived ? "Dossiers archivés" : "Dossiers"}</span>
                <div className="flex items-center gap-1">
                  <select
                    className="text-[12.5px] font-[inherit] bg-transparent border-none text-tx-2 cursor-pointer outline-none pr-1 hover:text-tx transition-colors"
                    value={caseSortKey}
                    onChange={(e) => setCaseSortKey(e.target.value as "title" | "createdAt" | "legalDueDate")}
                    title="Trier par"
                  >
                    <option value="title">Nom</option>
                    <option value="createdAt">Ancienneté</option>
                    <option value="legalDueDate">Échéance</option>
                  </select>
                  <button
                    className={iconBtn}
                    onClick={() => setCaseSortDirection(p => p === "asc" ? "desc" : "asc")}
                    title={caseSortDirection === "asc" ? "Ordre croissant — cliquer pour inverser" : "Ordre décroissant — cliquer pour inverser"}
                  >
                    <Icon name={caseSortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} strokeWidth={2} />
                  </button>
                  <button className={iconBtn} title="Nouveau dossier (N)" onClick={async () => {
                    if (!user) return;
                    const id = await createCase(user.uid, { title: "Nouveau dossier", legalDueDate: null, caseNote: "" });
                    setSelectedCaseId(id);
                    setSelectedCaseIds([id]);
                    setSelectedItemId(null);
                    setSelectedSubItemId(null);
                    setSelectedItemIds([]);
                    setSelectedSubItemIds([]);
                    setActiveColumn("cases");
                    setDetailTarget({ type: "case", id });
                    focusWhenReady(detailCaseRef);
                  }}>
                    <Icon name="myday" size={14} className="hidden" />
                    <span className="text-[18px] leading-none">+</span>
                  </button>
                </div>
              </div>

              <div className="finder-list" ref={casesListRef}>
                {filteredCases.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-id={entry.id}
                    data-selected={selectedCaseIds.includes(entry.id) ? "true" : undefined}
                    data-active={selectedCaseId === entry.id ? "true" : undefined}
                    onClick={(e) => handleSelectCase(entry.id, { multi: e.metaKey || e.ctrlKey, range: e.shiftKey })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {myDayMarkerCaseIds.has(entry.id) && (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0"
                            title="Contient une tâche dans Ma journée"
                          />
                        )}
                        <p className="text-[15px] font-medium text-tx truncate leading-snug">{entry.title}</p>
                      </div>
                      <p className="text-[12.5px] text-tx-3 mt-0.5 truncate min-h-[1.25rem]">
                        {entry.legalDueDate ? (
                          <>Éch. <span className={new Date(entry.legalDueDate) < new Date() ? "text-red-500" : ""}>{formatDateFR(entry.legalDueDate)}</span></>
                        ) : null}
                      </p>
                    </div>
                    {entry.type && (
                      <span className="text-[12.5px] text-tx-3 shrink-0">{entry.type}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Recherche dossier */}
              <div className="px-3 pt-2 pb-1">
                <input
                  type="text"
                  placeholder="Rechercher…"
                  ref={caseSearchRef}
                  value={caseSearch}
                  onChange={e => setCaseSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === "Escape") { setCaseSearch(""); caseSearchRef.current?.blur(); } }}
                  className="w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3"
                />
              </div>

              {/* Pied de colonne : Archivés + Importer (côte à côte) */}
              <div className="border-t border-border px-3 py-2 flex items-center gap-1.5">
                <button
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-[inherit] px-2.5 py-1.5 rounded border cursor-pointer transition-colors ${
                    showArchived
                      ? "bg-tx text-bg border-tx"
                      : "bg-transparent text-tx-2 border-border hover:border-border-strong hover:text-tx"
                  }`}
                  onClick={() => { setShowArchived(p => !p); setSelectedCaseId(null); setDetailTarget(null); }}
                  title={showArchived ? "Revenir aux dossiers actifs" : "Voir les dossiers archivés"}
                >
                  {showArchived ? (
                    <><Icon name="arrow-left" size={13} /> Dossiers actifs</>
                  ) : (
                    <><Icon name="archive" size={14} /> Archivés ({archivedCases.length})</>
                  )}
                </button>
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-[inherit] px-2.5 py-1.5 rounded border bg-transparent text-tx-2 border-border hover:border-border-strong hover:text-tx cursor-pointer transition-colors"
                  title="Importer un dossier depuis un fichier JSON">
                  <Icon name="import" size={14} />
                  <span>Importer</span>
                  <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !user) return;
                    const text = await file.text();
                    try {
                      await importCaseFromJson(user.uid, text, importMode);
                      showToast("Dossier importé.");
                    } catch (err) {
                      showToast((err as Error).message);
                    }
                    e.target.value = "";
                  }} />
                </label>
              </div>
            </div>
          )}

          {/* ── COL TÂCHES ── */}
          {showItemsColumn && (
            <div className="finder-column">
              <div className="finder-header">
                <span>Tâches</span>
                <div className="flex items-center gap-1">
                  <button
                    className={`text-[11px] font-[inherit] font-medium px-2 py-1 rounded border cursor-pointer transition-colors ${
                      selectionModeItems
                        ? "bg-tx text-bg border-tx"
                        : "bg-transparent text-tx-2 border-border hover:border-border-strong hover:text-tx"
                    }`}
                    title="Mode sélection multiple"
                    onClick={() => { setSelectionModeItems(p => !p); setSelectedItemIds([]); }}
                  >Sélection</button>
                  <button className={iconBtn} title="Nouvelle tâche (N)" onClick={async () => { setActiveColumn("items"); if (!user || !selectedCaseId) { showToast("Sélectionnez un dossier d'abord."); return; } const id = await createItem(user.uid, { caseId: selectedCaseId, level: 2, title: "Nouvelle tâche", status: "Créé", parentItemId: null }); setSelectedItemId(id); setSelectedItemIds([id]); setDetailTarget({ type: "item", id }); focusWhenReady(detailTitleRef); }}>
                    <span className="text-[18px] leading-none">+</span>
                  </button>
                </div>
              </div>

              {selectionModeItems && (
                <div className="finder-actionbar">
                  <button
                    className={btnGhost}
                    onClick={async () => {
                      if (!user || selectedItemIds.length === 0) return;
                      await Promise.all(selectedItemIds.map(id =>
                        addMyDaySelection(user.uid, { dateKey: todayKey, refType: "item", refId: id })
                      ));
                      showToast("☀ Ajouté à Ma journée.");
                    }}
                  >Ma journée</button>
                  <button className={btnDanger} onClick={handleDelete}>Supprimer</button>
                  <button
                    className="text-[14px] text-tx-3 bg-transparent border-none cursor-pointer ml-auto"
                    onClick={() => { setSelectedItemIds([]); setSelectionModeItems(false); }}
                  >Annuler</button>
                </div>
              )}

              <div className="finder-list" ref={itemsListRef}>
                {itemsColumnItems.map((entry) => {
                  const isOverdue = !!entry.dueDate && new Date(entry.dueDate) < new Date() && getProgressLevel(entry.status) !== 3;
                  const isDueToday = !!entry.dueDate && entry.dueDate.slice(0,10) === todayKey && !isOverdue;
                  const rowBg = entry.starred ? "rgba(251,191,36,0.12)" : isOverdue ? "rgba(239,68,68,0.08)" : isDueToday ? "rgba(34,197,94,0.08)" : undefined;
                  return (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-id={entry.id}
                    data-selected={selectedItemIds.includes(entry.id) ? "true" : undefined}
                    data-active={selectedItemId === entry.id ? "true" : undefined}
                    style={rowBg ? {background: rowBg} : undefined}
                    onClick={(e) =>
                      selectionModeItems
                        ? handleSelectItem(entry.id, { multi: true })
                        : handleSelectItem(entry.id, { multi: e.metaKey || e.ctrlKey, range: e.shiftKey })
                    }
                  >
                    {selectionModeItems && (
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(entry.id)}
                        onChange={() => handleSelectItem(entry.id, { multi: true })}
                        onClick={e => e.stopPropagation()}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {myDayMarkerItemIds.has(entry.id) && (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0"
                            title="Dans Ma journée"
                          />
                        )}
                        <p className="text-[15px] text-tx truncate leading-snug">{entry.title}</p>
                      </div>
                      <p className="text-[12.5px] text-tx-3 mt-0.5 truncate min-h-[1.25rem]">
                        {entry.dueDate ? (
                          <>Éch. <span className={new Date(entry.dueDate) < new Date() ? "text-red-500" : ""}>{formatDateFR(entry.dueDate)}</span></>
                        ) : (
                          getSubItems(items, entry.id).length > 0
                            ? `${getSubItems(items, entry.id).length} sous-tâche${getSubItems(items, entry.id).length > 1 ? "s" : ""}`
                            : null
                        )}
                      </p>
                    </div>
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── COL SOUS-TÂCHES ── */}
          {showSubItemsColumn && (
            <div className="finder-column">
              <div className="finder-header">
                <span>Sous-tâches</span>
                <div className="flex items-center gap-1">
                  <button
                    className={`text-[11px] font-[inherit] font-medium px-2 py-1 rounded border cursor-pointer transition-colors ${
                      selectionModeSubItems
                        ? "bg-tx text-bg border-tx"
                        : "bg-transparent text-tx-2 border-border hover:border-border-strong hover:text-tx"
                    }`}
                    title="Mode sélection multiple"
                    onClick={() => { setSelectionModeSubItems(p => !p); setSelectedSubItemIds([]); }}
                  >Sélection</button>
                  <button className={iconBtn} title="Nouvelle sous-tâche (⇧N)" onClick={async () => { setActiveColumn("subitems"); if (!user || !selectedItemId) { showToast("Sélectionnez une tâche d'abord."); return; } const parentCaseId = selectedItem?.caseId ?? selectedCaseId; if (!parentCaseId) return; const id = await createItem(user.uid, { caseId: parentCaseId, parentItemId: selectedItemId, level: 3, title: "Nouvelle sous-tâche", status: "Créé" }); setSelectedSubItemId(id); setSelectedSubItemIds([id]); setActiveColumn("subitems"); setDetailTarget({ type: "item", id }); focusWhenReady(detailTitleRef); }}>
                    <span className="text-[18px] leading-none">+</span>
                  </button>
                </div>
              </div>

              {selectionModeSubItems && (
                <div className="finder-actionbar">
                  <button
                    className={btnGhost}
                    onClick={async () => {
                      if (!user || selectedSubItemIds.length === 0) return;
                      await Promise.all(selectedSubItemIds.map(id =>
                        addMyDaySelection(user.uid, { dateKey: todayKey, refType: "subitem", refId: id })
                      ));
                      showToast("☀ Ajouté à Ma journée.");
                    }}
                  >Ma journée</button>
                  <button className={btnDanger} onClick={handleDelete}>Supprimer</button>
                  <button
                    className="text-[14px] text-tx-3 bg-transparent border-none cursor-pointer ml-auto"
                    onClick={() => { setSelectedSubItemIds([]); setSelectionModeSubItems(false); }}
                  >Annuler</button>
                </div>
              )}

              <div className="finder-list" ref={subitemsListRef}>
                {subItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-id={entry.id}
                    data-selected={selectedSubItemIds.includes(entry.id) ? "true" : undefined}
                    data-active={selectedSubItemId === entry.id ? "true" : undefined}
                    onClick={(e) =>
                      selectionModeSubItems
                        ? handleSelectSubItem(entry.id, { multi: true })
                        : handleSelectSubItem(entry.id, { multi: e.metaKey || e.ctrlKey, range: e.shiftKey })
                    }
                  >
                    {selectionModeSubItems && (
                      <input
                        type="checkbox"
                        checked={selectedSubItemIds.includes(entry.id)}
                        onChange={() => handleSelectSubItem(entry.id, { multi: true })}
                        onClick={e => e.stopPropagation()}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {myDayMarkerItemIds.has(entry.id) && (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0"
                            title="Dans Ma journée"
                          />
                        )}
                        <p className="text-[15px] text-tx truncate leading-snug">{entry.title}</p>
                      </div>
                      <p className="text-[12.5px] text-tx-3 mt-0.5 min-h-[1.25rem]">
                        {entry.dueDate ? formatDateFR(entry.dueDate) : ""}
                      </p>
                    </div>
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PANNEAU DÉTAIL ── */}
          {detailPanel}

          {/* Spacer pour coller la bande à droite si pas de détail */}
          {!showDetailColumn && <div className="flex-1" />}

          {/* ── BANDE "MA JOURNÉE" toujours à droite ── */}
          {settings.sideTabs && (
            <Link href="/my-day" className="side-tab side-tab-myday" title="Aller à Ma journée">
              <div className="side-tab-inner">
                <span className="side-tab-label">Ma journée</span>
              </div>
            </Link>
          )}

        </div>

      ) : (

        /* ══ VUE MA JOURNÉE — 2 colonnes ══ */
        <div className="flex flex-1 overflow-hidden bg-white">

          {/* ── BANDE "DOSSIERS" à gauche ── */}
          {settings.sideTabs && (
            <Link href="/" className="side-tab side-tab-dossiers" title="Retour aux Dossiers">
              <div className="side-tab-inner">
                <span className="side-tab-label">Dossiers</span>
              </div>
            </Link>
          )}

          {/* ── COL SUGGESTIONS : 20% ── */}
          <div className="flex flex-col overflow-hidden bg-bg-subtle" style={{flex:"0 0 20%", boxShadow:"inset -8px 0 12px -4px rgba(0,0,0,0.08)", zIndex:0}}>
            <div className="finder-header">
              <span>Suggestions</span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {suggestions.starred.length === 0 && suggestions.overdue.length === 0 && suggestions.dueToday.length === 0 && suggestions.recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
                  <p className="text-[12px] text-tx-3">Aucune suggestion.</p>
                </div>
              ) : (
                <>
                  {/* 1. Importantes */}
                  {suggestions.starred.length > 0 && (
                    <div className="px-3 pt-3 pb-1">
                      <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">⭐ Importantes</p>
                      {suggestions.starred.map(item => {
                        const parentItem = item.level === 3 ? items.find(i => i.id === item.parentItemId) : null;
                        const caseTitle = cases.find(c => c.id === item.caseId)?.title ?? "";
                        const subtitle = parentItem ? `${parentItem.title} · ${caseTitle}` : caseTitle;
                        return (
                          <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mb-0.5"
                            style={{background: "rgba(251,191,36,0.15)"}}
                            onClick={() => { playAdd(); addMyDaySelection(user.uid, { dateKey: todayKey, refType: item.level === 2 ? "item" : "subitem", refId: item.id }); }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium text-tx truncate">{item.title}</p>
                              {subtitle && <p className="text-[10px] text-tx-3 truncate">{subtitle}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. En retard */}
                  {suggestions.overdue.length > 0 && (
                    <div className="px-3 pt-3 pb-1">
                      <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">🔴 En retard</p>
                      {suggestions.overdue.map(item => {
                        const parentItem = item.level === 3 ? items.find(i => i.id === item.parentItemId) : null;
                        const caseTitle = cases.find(c => c.id === item.caseId)?.title ?? "";
                        const subtitle = parentItem ? `${parentItem.title} · ${caseTitle}` : caseTitle;
                        return (
                          <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mb-0.5"
                            style={{background: "rgba(239,68,68,0.1)"}}
                            onClick={() => { playAdd(); addMyDaySelection(user.uid, { dateKey: todayKey, refType: item.level === 2 ? "item" : "subitem", refId: item.id }); }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-tx truncate">{item.title}</p>
                              {subtitle && <p className="text-[10px] text-tx-3 truncate">{subtitle}</p>}
                              {item.dueDate && (() => {
                              const diff = Math.round((new Date(item.dueDate).getTime() - new Date().getTime()) / 86400000);
                              const label = diff < 0 ? `${Math.abs(diff)}j` : diff === 0 ? "auj." : `+${diff}j`;
                              return <span className={`text-[10px] font-semibold ${diff <= 0 ? "text-red-500" : diff <= 3 ? "text-amber-500" : "text-tx-3"}`}>{label}</span>;
                            })()}
                            </div>
                          </div>
                        );
                      })}

                    </div>
                  )}

                  {/* 3. Échéances aujourd'hui */}
                  {suggestions.dueToday.length > 0 && (
                    <div className="px-3 pt-3 pb-1">
                      <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">📅 Aujourd'hui</p>
                      {suggestions.dueToday.map(item => {
                        const parentItem = item.level === 3 ? items.find(i => i.id === item.parentItemId) : null;
                        const caseTitle = cases.find(c => c.id === item.caseId)?.title ?? "";
                        const subtitle = parentItem ? `${parentItem.title} · ${caseTitle}` : caseTitle;
                        return (
                          <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mb-0.5"
                            style={{background: "rgba(34,197,94,0.1)"}}
                            onClick={() => { playAdd(); addMyDaySelection(user.uid, { dateKey: todayKey, refType: item.level === 2 ? "item" : "subitem", refId: item.id }); }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-tx truncate">{item.title}</p>
                              {subtitle && <p className="text-[10px] text-tx-3 truncate">{subtitle}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 4. Ajoutées récemment */}
                  {suggestions.recent.length > 0 && (
                    <div className="px-3 pt-3 pb-1">
                      <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">🆕 Récentes</p>
                      {suggestions.recent.map(item => {
                        const parentItem = item.level === 3 ? items.find(i => i.id === item.parentItemId) : null;
                        const caseTitle = cases.find(c => c.id === item.caseId)?.title ?? "";
                        const subtitle = parentItem ? `${parentItem.title} · ${caseTitle}` : caseTitle;
                        return (
                          <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mb-0.5"
                            style={{background: "rgba(59,130,246,0.08)"}}
                            onClick={() => { playAdd(); addMyDaySelection(user.uid, { dateKey: todayKey, refType: item.level === 2 ? "item" : "subitem", refId: item.id }); }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] text-tx truncate">{item.title}</p>
                              {subtitle && <p className="text-[10px] text-tx-3 truncate">{subtitle}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* À venir est déplacé en bas de la colonne du jour (Liste centrale) */}
          </div>

          {/* ── COL LISTE : 40% ── */}
          <div className="flex flex-col overflow-hidden border-r border-border bg-white" style={{flex:"0 0 40%", zIndex:1, position:"relative"}}>
            <div className="finder-header relative">
              <span>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
              <div className="flex items-center gap-2">
                <span className="text-tx-3">{(() => { const n = myDayCombined.length; return `${n} élément${n > 1 ? "s" : ""}`; })()}</span>
                {upcoming.length > 0 && (
                  <button
                    onClick={() => setUpcomingExpanded(p => !p)}
                    className={`inline-flex items-center gap-1 text-[11px] font-[inherit] font-medium px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                      upcomingExpanded
                        ? "bg-tx text-bg border-tx"
                        : "bg-transparent text-tx-2 border-border hover:border-border-strong hover:text-tx"
                    }`}
                    title={`${upcoming.length} à venir`}
                  >
                    <Icon name="time" size={12} />
                    {upcoming.length}
                  </button>
                )}
              </div>
              {/* Popover À venir, ancré sous le bouton, dans la même colonne */}
              {upcomingExpanded && upcoming.length > 0 && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUpcomingExpanded(false)} />
                  <div
                    className="absolute right-2 top-full mt-1 w-[300px] max-h-[320px] overflow-y-auto bg-white border border-border-strong rounded-lg z-20"
                    style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                  >
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <span className="text-[10px] font-medium text-tx-3 uppercase tracking-wide">À venir · {upcoming.length}</span>
                      <button
                        onClick={() => setUpcomingExpanded(false)}
                        className="border-none bg-transparent cursor-pointer text-tx-3 hover:text-tx p-0 leading-none"
                        title="Fermer"
                      ><Icon name="close" size={14} /></button>
                    </div>
                    <div className="px-2 py-1">
                      {upcoming.map(entry => {
                        const days = Math.round((new Date(entry.dateKey + "T12:00:00").getTime() - new Date().getTime()) / 86400000);
                        const dayLabel = days === 1 ? "demain" : days <= 7 ? `dans ${days} j.` : days <= 30 ? `dans ${Math.round(days/7)} sem.` : formatDateFR(new Date(entry.dateKey + "T12:00:00").toISOString());
                        return (
                          <div key={`${entry.kind}-${entry.id}`}
                            className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-bg-subtle cursor-pointer"
                            onClick={() => {
                              if (entry.kind === "floating") {
                                setMyDayDetailId(myDayDetailId === `f-${entry.id}` ? null : `f-${entry.id}`);
                              } else {
                                setMyDayDetailId(myDayDetailId === entry.id ? null : entry.id);
                              }
                              setUpcomingExpanded(false);
                            }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-tx truncate">{entry.title}</p>
                              {entry.kind === "item" && entry.caseLabel && (
                                <p className="text-[11px] text-tx-3 truncate">{entry.caseLabel}</p>
                              )}
                            </div>
                            <span className="text-[11px] text-tx-3 shrink-0">{dayLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {myDayCombined.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                  <p className="text-[14px] text-tx-3">Journée vide</p>
                  <p className="text-[12px] text-tx-3">Utilisez <kbd>A</kbd> depuis les dossiers<br/>ou consultez les suggestions à droite.</p>
                </div>
              ) : (
                <div>
                  {myDayCombined.map(entry => {
                    const statusColor = {"Créé":"#d1d5db","Demandé":"#fbbf24","Reçu":"#60a5fa","Traité":"#34d399"}[entry.status as string] ?? "#d1d5db";
                    const isCompletingRow = entry.kind === "floating" && !!entry.floatingId && completingFloatingIds.has(entry.floatingId);
                    return (
                      <div key={entry.key} className="finder-row group"
                        data-active={myDayDetailId === entry.key ? "true" : undefined}
                        style={{
                          borderLeft: "none",
                          boxShadow: entry.kind === "floating" ? "none" : `inset 3px 0 0 ${statusColor}`,
                          background: entry.starred ? "rgba(251,191,36,0.10)" : undefined,
                          opacity: isCompletingRow ? 0.5 : 1,
                          transition: "opacity 0.3s ease",
                          alignItems: "flex-start",
                          paddingTop: "8px",
                        }}
                        onClick={() => setMyDayDetailId(myDayDetailId === entry.key ? null : entry.key)}>

                        {/* Élément de gauche : rond pour mémo, croix pour tâche — alignés sur le titre */}
                        {entry.kind === "floating" ? (
                          (() => {
                            const isCompleting = completingFloatingIds.has(entry.floatingId!);
                            return (
                              <button
                                className="shrink-0 cursor-pointer transition-all duration-200 flex items-center justify-center"
                                onClick={e => { e.stopPropagation(); handleMarkFloatingDone(entry.floatingId!); }}
                                title="Réalisée"
                                style={{
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "6px",
                                  border: isCompleting ? "none" : "2px solid #9ca3af",
                                  background: isCompleting ? "#16a34a" : "white",
                                  transform: isCompleting ? "scale(1.1)" : "scale(1)",
                                  marginTop: "1px",
                                }}
                              >
                                {isCompleting && <Icon name="check" size={14} className="text-white" strokeWidth={2.5} />}
                              </button>
                            );
                          })()
                        ) : (
                          <button
                            className="shrink-0 flex items-center justify-center text-tx-3 bg-transparent border-2 border-transparent cursor-pointer rounded-md hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors"
                            style={{ width: "22px", height: "22px", marginTop: "1px" }}
                            onClick={e => {
                              e.stopPropagation();
                              if (entry.selectionId) {
                                setPendingRemovalIds(prev => new Set([...prev, entry.selectionId!]));
                                setLegacyMyDaySelections(prev => prev.filter(s => s.id !== entry.selectionId));
                                deleteMyDaySelection(user.uid, entry.selectionId);
                              }
                            }}
                            title="Retirer de Ma journée"
                          ><Icon name="close" size={16} strokeWidth={1.75} /></button>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <p className={`text-[15px] text-tx truncate leading-snug flex-1 min-w-0 ${entry.starred ? "font-medium" : ""}`}>{entry.title}</p>
                            {entry.hasDue && (() => {
                              const startOfToday = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
                              const dueDay = (() => { const d = new Date(entry.dueTs); d.setHours(0,0,0,0); return d.getTime(); })();
                              const dayDiff = Math.round((dueDay - startOfToday) / 86400000);
                              if (dayDiff === 0) return null; // aujourd'hui = rien
                              const label = dayDiff > 0 ? `+${dayDiff}` : `${dayDiff}`;
                              return (
                                <span className={`inline-flex items-center gap-1 text-[11px] shrink-0 ${entry.overdue ? "text-red-500 font-medium" : "text-tx-3"}`}>
                                  {entry.overdue && <Icon name="warning" size={11} />}
                                  {label}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 min-h-[1.25rem]">
                            {entry.caseLabel ? (
                              <span className="text-[11px] text-tx-3 truncate flex-1 min-w-0">
                                {entry.parentLabel ? `${entry.caseLabel} › ${entry.parentLabel}` : entry.caseLabel}
                              </span>
                            ) : <span className="flex-1" />}
                            {entry.recurrence && (
                              <span className="inline-flex items-center text-tx-3 shrink-0" title={formatRecurrence(entry.recurrence)}>
                                <Icon name="recurrence" size={11} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Saisie mémo en bas ── */}
            <div className="border-t border-border bg-bg p-3">
              <div className="flex items-center gap-2 bg-white border border-border-strong rounded-lg px-3 py-2 transition-colors focus-within:border-tx-2">
                <span className="shrink-0 text-tx-3"><Icon name="edit" size={14} /></span>
                <input
                  className="flex-1 font-[inherit] text-[15px] text-tx bg-transparent border-none outline-none placeholder:text-tx-3"
                  placeholder="Nouveau mémo… (Entrée)"
                  onKeyDown={async e => {
                    if (e.key === "Enter") {
                      const t = e.target as HTMLInputElement;
                      const val = t.value.trim();
                      if (!val || !user) return;
                      await createFloatingTask(user.uid, { dateKey: todayKey, title: val, status: "Créé" });
                      t.value = "";
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── COL DÉTAIL : 40% ── */}
          <div className="flex flex-col overflow-hidden bg-bg-subtle" style={{flex:"0 0 40%"}}>

            {myDayDetailId ? (
              /* Détail tâche sélectionnée */
              (() => {
                if (myDayDetailId.startsWith("f-")) {
                  const targetId = myDayDetailId.slice(2);
                  const task = floatingTasks.find(t => t.id === targetId);
                  if (!task) return null;
                  return (
                    <>
                      {/* Header — fond post-it jaune */}
                      <div className="finder-header" style={{ background: "#fef9c3", borderBottom: "1px solid #fde68a" }}>
                        <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "#92400e" }}>Mémo</span>
                      </div>

                      <div className="flex-1 overflow-y-auto" style={{ scrollbarColor: "#fde68a transparent" }}>
                        {/* Zone post-it : titre + échéance */}
                        <div style={{ background: "#fef9c3", borderBottom: "1px solid #fde68a" }} className="px-5 pt-5 pb-4 space-y-4">
                          {/* Titre avec étoile à gauche */}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => updateFloatingTask(user.uid, task.id, { starred: !task.starred })}
                              className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-all hover:scale-110"
                              style={{ color: task.starred ? "#f59e0b" : "#d6a96b" }}
                              title={task.starred ? "Retirer l'étoile" : "Marquer important"}
                            >
                              <Icon name="star" size={26} filled={task.starred} strokeWidth={1.75} />
                            </button>
                            <input
                              ref={myDayTitleRef}
                              className="block flex-1 min-w-0 font-[inherit] text-[20px] font-semibold text-[#451a03] placeholder:text-[#a16207] outline-none transition-all"
                              style={{
                                lineHeight: 1.3,
                                background: "rgba(255,255,255,0.45)",
                                border: "1px solid #fde68a",
                                borderRadius: "6px",
                                padding: "6px 10px",
                              }}
                              onFocus={e => {
                                e.currentTarget.style.background = "white";
                                e.currentTarget.style.borderColor = "#f59e0b";
                                e.currentTarget.style.boxShadow = "0 1px 4px rgba(245,158,11,0.15)";
                              }}
                              onBlurCapture={e => {
                                e.currentTarget.style.background = "rgba(255,255,255,0.45)";
                                e.currentTarget.style.borderColor = "#fde68a";
                                e.currentTarget.style.boxShadow = "none";
                              }}
                              placeholder="Sans titre"
                              value={task.title}
                              onChange={e => updateFloatingTask(user.uid, task.id, { title: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === "Enter") { e.stopPropagation(); (e.target as HTMLInputElement).blur(); }
                              }}
                            />
                          </div>

                          {/* Échéance */}
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "#92400e" }}>Échéance</p>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {(() => {
                                const today = new Date(); today.setHours(12,0,0,0);
                                const nextMon = (() => { const d = new Date(today); const dow = d.getDay(); const diff = (1-dow+7)%7||7; d.setDate(d.getDate()+diff); return d; })();
                                const nextMonLabel = "Lun. " + nextMon.getDate() + "/" + (nextMon.getMonth()+1);
                                return [
                                  { label: "Aujourd'hui", date: new Date(today) },
                                  { label: "Demain", date: new Date(today.getTime() + 86400000) },
                                  { label: "Dans 2 j.", date: new Date(today.getTime() + 2*86400000) },
                                  { label: nextMonLabel, date: nextMon },
                                  { label: "Dans 1 sem.", date: new Date(today.getTime() + 7*86400000) },
                                  { label: "Dans 1 mois", date: new Date(today.getFullYear(), today.getMonth()+1, today.getDate(), 12) },
                                ].map(({ label, date }) => (
                                  <button key={label} onClick={() => handleFloatingDueDate(task.id, date)}
                                    className="text-[11px] font-[inherit] px-2 py-1 rounded border cursor-pointer transition-colors"
                                    style={{ background: "rgba(255,255,255,0.7)", borderColor: "#fde68a", color: "#92400e" }}>
                                    {label}
                                  </button>
                                ));
                              })()}
                              {task.dueDate && (
                                <button onClick={() => updateFloatingTask(user.uid, task.id, { dueDate: null })}
                                  className="text-[11px] font-[inherit] px-2 py-1 rounded border cursor-pointer transition-colors"
                                  style={{ background: "rgba(255,255,255,0.7)", borderColor: "#fca5a5", color: "#dc2626" }}>
                                  ✕ Retirer
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={e => { const inp = (e.currentTarget.parentElement?.querySelector("input[type=date]") as any); if (inp?.showPicker) inp.showPicker(); else inp?.focus(); }}
                                className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-opacity hover:opacity-70"
                                style={{ color: "#92400e" }}
                                title="Ouvrir le calendrier"
                              ><Icon name="calendar" size={20} /></button>
                              <input key={task.id + "-due"} type="date"
                                className="font-[inherit] text-[13px] rounded-lg px-3 py-1.5 outline-none flex-1 border"
                                style={{ background: "rgba(255,255,255,0.85)", borderColor: "#fde68a", color: "#451a03" }}
                                defaultValue={task.dueDate?.slice(0,10) ?? ""}
                                onBlur={e => { if (!e.target.value) { updateFloatingTask(user.uid, task.id, { dueDate: null, dateKey: todayKey }); return; } const [y,m,d] = e.target.value.split("-").map(Number); if (y < 1900 || y > 2100) return; handleFloatingDueDate(task.id, new Date(y,m-1,d,12)); }} />
                            </div>
                          </div>
                        </div>

                        {/* Zone blanche : récurrence, rattacher, commentaires */}
                        <div className="px-5 py-5 space-y-4">
                          {/* Récurrence — hauteur min pour éviter que la section suivante bouge à l'activation */}
                          <div style={{ minHeight: "120px" }}>
                            <RecurrencePicker value={task.recurrence ?? null} onChange={r => updateFloatingTask(user.uid, task.id, { recurrence: r ?? null })} />
                          </div>

                          {/* Rattacher à un dossier */}
                          <div>
                            <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Rattacher à un dossier</p>
                            <div className="space-y-1.5">
                              <input type="text" placeholder="Rechercher un dossier…"
                                value={dossierSearch} onChange={e => setDossierSearch(e.target.value)}
                                className="font-[inherit] text-[13px] text-tx bg-white border border-border-strong rounded-lg px-3 py-1.5 outline-none w-full focus:border-tx-2 transition-colors placeholder:text-tx-3"
                              />
                              {dossierSearch && (
                                <div className="border border-border rounded-lg overflow-hidden max-h-[160px] overflow-y-auto">
                                  {cases.filter(c => c.title.toLowerCase().includes(dossierSearch.toLowerCase())).length === 0
                                    ? <p className="text-[12px] text-tx-3 px-3 py-2">Aucun dossier trouvé</p>
                                    : cases.filter(c => c.title.toLowerCase().includes(dossierSearch.toLowerCase())).map(c => (
                                      <button key={c.id}
                                        className="w-full text-left font-[inherit] text-[13px] text-tx px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-bg-subtle transition-colors border-b border-border last:border-0"
                                        onClick={() => { handleAttachFloating(task, c.id); setDossierSearch(""); }}>
                                        {c.title}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Commentaires */}
                          <div>
                            <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Commentaires</p>
                            <textarea
                              className="font-[inherit] text-[13px] text-tx bg-white border border-border-strong rounded-lg px-3 py-2 outline-none w-full resize-none focus:border-tx-2 transition-colors"
                              rows={4} placeholder="Ajouter un commentaire…"
                              defaultValue={task.note ?? ""}
                              onBlur={e => updateFloatingTask(user.uid, task.id, { note: e.target.value || null })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Barre actions bas — fond blanc pour cohérence avec la zone blanche du détail mémo */}
                      <div className="detail-actions-bar" style={{ background: "white" }}>
                        <button className="detail-action-btn detail-action-danger" onClick={() => { deleteFloatingTasks(user.uid, [task.id]); setMyDayDetailId(null); }}>
                          <Icon name="delete" size={14} /> Supprimer
                        </button>
                      </div>
                    </>
                  );
                }
                                /* Détail tâche de dossier */
                return detailPanel ? (
                  <>
                    {detailPanel}
                  </>
                ) : null;
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                <p className="text-[13px] text-tx-3">Cliquez sur une tâche<br/>pour voir son détail.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── BOUTON ? RACCOURCIS ── */}
      {!isMyDay && (
        <>
          <button
            className="fixed bottom-5 right-5 w-8 h-8 rounded-full bg-tx text-bg text-[14px] font-semibold border-none cursor-pointer flex items-center justify-center shadow-lg hover:opacity-80 transition-opacity z-40"
            onClick={() => setIsShortcutsOpen(p => !p)}
            title="Raccourcis clavier"
          >?</button>
          {isShortcutsOpen && (
            <div className="fixed inset-0 bg-black/20 z-50 flex items-end justify-end p-16"
              onClick={() => setIsShortcutsOpen(false)}>
              <div className="bg-bg border border-border rounded-xl shadow-xl p-5 w-72"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[12px] font-semibold text-tx uppercase tracking-wide">Raccourcis clavier</p>
                  <button className="text-tx-3 text-[14px] bg-transparent border-none cursor-pointer hover:text-tx"
                    onClick={() => setIsShortcutsOpen(false)}>✕</button>
                </div>
                <div className="space-y-2">
                  {[
                    ["N", "Nouveau au niveau courant"],
                    ["⇧N", "Créer une sous-tâche"],
                    ["Espace", "Renommer"],
                    ["Entrée", "Valider le nom"],
                    ["A", "Ajouter à Ma journée"],
                    ["I", "Ouvrir / fermer le détail"],
                    ["R", "Rattacher une tâche"],
                    ["⌫", "Supprimer"],
                    ["1 – 4", "Changer le statut"],
                    ["S", "Rechercher un dossier"],
                    ["← →", "Naviguer entre colonnes"],
                    ["↑ ↓", "Déplacer la sélection"],
                  ].map(([k, label]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-[12.5px] text-tx-2">{label}</span>
                      <kbd className="text-[12.5px] bg-bg-subtle border border-border rounded px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SUGGESTION FLOTTANTE ── */}
      <>
        {!isFeedbackOpen && (
          <button
            onClick={() => { setIsFeedbackOpen(true); setFeedbackSent(false); setFeedbackText(""); }}
            className="fixed z-40 bg-tx text-bg text-[11px] font-medium font-[inherit] border-none cursor-pointer shadow-lg hover:opacity-90 transition-opacity"
            style={{writingMode:"vertical-rl", transform:"rotate(180deg)", padding:"10px 7px", borderRadius:"0 6px 6px 0", bottom:"80px", right:0}}
            title="Une suggestion ?"
          >Une suggestion ?</button>
        )}
        {isFeedbackOpen && (
          <div className="fixed bottom-6 right-6 z-50 bg-bg border border-border rounded-xl shadow-xl w-80 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
              <p className="text-[13px] font-medium text-tx">Une suggestion ?</p>
              <button className="text-tx-3 text-[14px] bg-transparent border-none cursor-pointer hover:text-tx"
                onClick={() => { setIsFeedbackOpen(false); setFeedbackText(""); setFeedbackSent(false); }}>✕</button>
            </div>
            <div className="p-4 space-y-3">
              {feedbackSent ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-[22px]">✓</p>
                  <p className="text-[13px] font-medium text-tx">Merci !</p>
                  <p className="text-[12px] text-tx-3">Votre suggestion a bien été enregistrée.</p>
                  <button onClick={() => { setIsFeedbackOpen(false); setFeedbackSent(false); }}
                    className="text-[12px] font-[inherit] px-3 py-1.5 bg-bg-subtle border border-border rounded-lg text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors">
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <textarea
                    className="w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-2 outline-none resize-none focus:border-border-strong transition-colors placeholder:text-tx-3"
                    rows={5}
                    placeholder="Bug, idée d'amélioration, retour d'usage…"
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setIsFeedbackOpen(false); setFeedbackText(""); }}
                      className="flex-1 font-[inherit] text-[12px] px-3 py-1.5 border border-border rounded-lg bg-bg-subtle text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors">
                      Annuler
                    </button>
                    <button
                      disabled={!feedbackText.trim()}
                      onClick={async () => {
                        if (!feedbackText.trim() || !user) return;
                        try {
                          await addDoc(collection(db, "feedbacks"), {
                            uid: user.uid,
                            email: user.email ?? "",
                            text: feedbackText.trim(),
                            createdAt: new Date().toISOString(),
                          });
                          setFeedbackSent(true);
                          setFeedbackText("");
                        } catch { showToast("Erreur lors de l'envoi."); }
                      }}
                      className="flex-1 font-[inherit] text-[12px] px-3 py-1.5 rounded-lg bg-tx text-bg border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default"
                    >Envoyer</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </>

      {/* ── ÉCRAN BIENVENUE ── */}
      {showWelcome && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          onClick={() => setShowWelcome(false)}>
          <div style={{ background: "white", borderRadius: "20px", maxWidth: "540px", width: "100%", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            {/* Header sombre */}
            <div style={{ background: "#111827", padding: "32px 36px", color: "white" }}>
              <img src="/logo-henri-transparent.png" alt="Henri" style={{ height: "36px", marginBottom: "20px", filter: "invert(1)" }} />
              <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", lineHeight: 1.3 }}>Une nouvelle manière de piloter vos dossiers.</h2>
              <p style={{ fontSize: "13px", lineHeight: 1.7, color: "#9ca3af" }}>
                Henri part d'un constat simple : un rédacteur gère simultanément des dizaines de dossiers, chacun contenant de multiples tâches à des stades d'avancement différents. L'enjeu n'est pas de tout faire — c'est de savoir <em>quoi</em> faire aujourd'hui.
              </p>
            </div>
            {/* Corps */}
            <div style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ fontSize: "13px", lineHeight: 1.7, color: "#374151" }}>
                Henri propose une organisation en deux temps : d'un côté, <strong>tous vos dossiers</strong> avec leurs tâches, organisés, classés, toujours disponibles. De l'autre, <strong>Ma journée</strong> — un espace de travail quotidien où vous extrayez uniquement les tâches sur lesquelles vous vous concentrez ce jour-là. Vous commencez la journée avec une liste claire, vous la traitez, et vous passez à autre chose.
              </p>
              <p style={{ fontSize: "13px", lineHeight: 1.7, color: "#374151" }}>
                Contrairement à un simple gestionnaire de tâches où les éléments disparaissent quand ils sont cochés, Henri reflète la réalité du notariat : chaque acte passe par plusieurs étapes — le besoin exprimé, la demande formulée, la réception des pièces, le traitement. Une tâche ne disparaît pas, elle <strong>avance</strong>.
              </p>
              <button
                onClick={() => setShowWelcome(false)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#111827", color: "white", border: "none", fontSize: "15px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: "4px" }}>
                Commencer →
              </button>
              <p style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center" }}>
                Retrouvez l'aide complète dans Préférences → Aide
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST UNDO DELETE ── */}
      {pendingDelete && (
        <div className="toast-bar">
          <span>{pendingDelete.message}</span>
          <span className="text-white/60">Annulation {undoCountdown}s</span>
          <button
            className="text-[12px] font-[inherit] bg-white/10 border border-white/20 text-white px-2 py-0.5 rounded cursor-pointer"
            onClick={handleUndoDelete}
          >Annuler</button>
        </div>
      )}

      {/* ── TOAST INFO ── */}
      {toast && (
        <div className="toast-bar" style={{ bottom: pendingDelete ? "64px" : "20px" }}>
          {toast}
        </div>
      )}

      {/* ── MODAL RATTACHEMENT ── */}
      {isReparentOpen && reparentTarget && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={handleCloseReparent}
        >
          <div
            className="bg-bg border border-border rounded-lg shadow-xl w-[360px] max-w-[90vw] p-5 space-y-4"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-tx">Rattacher la tâche</h3>
              <button className={iconBtn} onClick={handleCloseReparent}>✕</button>
            </div>
            <p className="text-[12px] text-tx-3">{reparentTarget.title}</p>
            <input
              className="w-full font-[inherit] text-[14px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong"
              placeholder="Rechercher un parent…"
              value={reparentSearch}
              onChange={e => setReparentSearch(e.target.value)}
              onKeyDown={handleReparentKeyDown}
              autoFocus
            />
            <div className="border border-border rounded max-h-56 overflow-auto text-[14px]">
              {reparentOptions.length === 0 ? (
                <p className="px-3 py-2 text-tx-3">Aucun parent disponible.</p>
              ) : reparentOptions.map((opt, i) => (
                <button
                  key={`${opt.kind}-${opt.id}`}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-tx font-[inherit] border-none bg-transparent cursor-pointer transition-colors ${
                    i === reparentCursor ? "bg-bg-active" : "hover:bg-bg-subtle"
                  }`}
                  onClick={() => handleConfirmReparent(opt)}
                  onMouseEnter={() => setReparentCursor(i)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] text-tx-3">↵ valider · Échap fermer</p>
          </div>
        </div>
      )}

    </div>
  );
}

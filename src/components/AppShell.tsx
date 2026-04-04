"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSettings, applySettings, type UserSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import {
  addMyDaySelection,
  createCase,
  createComment,
  createFloatingTask,
  createItem,
  deleteCaseCascade,
  deleteFloatingTasks,
  deleteItemsCascade,
  deleteMyDaySelection,
  ensureSeedData,
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
import { auth } from "@/lib/firebase";
import { seedData } from "@/lib/seed";
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

const isEditableElement = (element: EventTarget | null) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || element.isContentEditable;
};

type PendingDelete = {
  message: string;
  action: () => Promise<void>;
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
  const [importMode, setImportMode] = useState<"model" | "history">("history");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [myDayDetailId, setMyDayDetailId] = useState<string | null>(null); // "f-{id}" pour volante, selectionId pour dossier
  const toastTimeout = useRef<number | null>(null);
  const backfilledItemIds = useRef<Set<string>>(new Set());
  // Refs pour scroll automatique lors de la navigation clavier
  const casesListRef = useRef<HTMLDivElement | null>(null);
  const itemsListRef = useRef<HTMLDivElement | null>(null);
  const subitemsListRef = useRef<HTMLDivElement | null>(null);
  // Ref pour focus auto sur le titre après création
  const detailTitleRef = useRef<HTMLInputElement | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);

  const [caseSortKey, setCaseSortKey] = useState<"title" | "createdAt" | "legalDueDate">(settings.defaultSort);
  const [caseSortDirection, setCaseSortDirection] = useState<"asc" | "desc">(settings.defaultSortDir);

  const pathname = usePathname();
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
  }, []);

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
    ensureSeedData(user.uid, seedData);
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

  const sortedCases = useMemo(() => {
    const direction = caseSortDirection === "asc" ? 1 : -1;
    return cases
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
  }, [cases, caseSortDirection, caseSortKey]);

  const selectedCase = cases.find((entry) => entry.id === selectedCaseId) || null;
  const caseItems = selectedCase ? getItemsByCase(items, selectedCase.id) : [];
  const fallbackItems =
    selectedCase && caseItems.length === 0
      ? items.filter((item) => item.caseId === selectedCase.id && item.parentItemId)
      : [];
  const itemsColumnItems = caseItems.length > 0 ? caseItems : fallbackItems;
  const selectedItem = items.find((entry) => entry.id === selectedItemId) || null;
  const subItems = selectedItem ? getSubItems(items, selectedItem.id) : [];
  const selectedSubItem = items.find((entry) => entry.id === selectedSubItemId) || null;

  const detailItem = detailTarget?.type === "item" ? items.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailCase = detailTarget?.type === "case" ? cases.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailComments = detailItem ? comments.filter((comment) => comment.itemId === detailItem.id) : [];
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
    return Array.from(merged.values());
  }, [legacyMyDaySelections, liveMyDaySelections]);

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

  // PAS de focus auto sur le titre — ça bloquerait les raccourcis clavier
  // Le focus se fait uniquement via F2 ou double-clic sur le titre
  // (useEffect supprimé volontairement)

  // Sync myDayDetailId → detailTarget pour le panneau détail dossier/tâche
  useEffect(() => {
    if (!myDayDetailId || myDayDetailId.startsWith("f-")) {
      if (isMyDay) setDetailTarget(null);
      return;
    }
    // myDayDetailId est un selectionId → trouver le refId/refType
    const sel = myDaySelections.find(s => s.id === myDayDetailId);
    if (!sel) return;
    if (sel.refType === "case") {
      setDetailTarget({ type: "case", id: sel.refId });
    } else {
      setDetailTarget({ type: "item", id: sel.refId });
    }
  }, [myDayDetailId, myDaySelections, isMyDay]);

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
      "Créée":   "status-badge status-badge-0",
      "Demandé": "status-badge status-badge-1",
      "Reçu":    "status-badge status-badge-2",
      "Traité":  "status-badge status-badge-3",
    };
    return compat[s] ?? "status-badge status-badge-0";
  };

  // ── TÂCHES DU JOUR — tri priorité ─────────────────────────────────────────
  const todayFloating = floatingTasks.filter(t => t.dateKey === todayKey);

  // Construire la liste unifiée triée pour Ma journée
  const myDaySorted = useMemo(() => {
    type Entry = {
      key: string;
      title: string;
      hasDue: boolean;
      dueStr: string;
      overdue: boolean;
      dueTs: number;
      statusEl: React.ReactNode;
      removeBtn: React.ReactNode;
      selectionId: string;
    };
    const entries: Entry[] = myDayItems.map(entry => {
      if (!entry) return null;
      const { data, selectionId } = entry;
      const dueRaw = "dueDate" in data ? data.dueDate : ("legalDueDate" in data ? data.legalDueDate : null);
      const dueDate = dueRaw ? new Date(dueRaw) : null;
      const hasDue = Boolean(dueDate);
      const overdue = hasDue && dueDate! < new Date();
      const dueStr = dueDate ? formatDateFR(dueRaw) : "";
      const dueTs = dueDate ? dueDate.getTime() : Infinity;
      const statusEl = "status" in data
        ? <span className={statusClass(data.status)}>{data.status}</span>
        : <span className="text-[11px] text-tx-3">Dossier</span>;
      const removeBtn = (
        <button
          className="w-5 h-5 flex items-center justify-center text-[11px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-red-500 rounded shrink-0"
          onClick={e => { e.stopPropagation(); deleteMyDaySelection(user!.uid, selectionId); }}
          title="Retirer de Ma journée"
        >✕</button>
      );
      return { key: selectionId, title: data.title, hasDue, dueStr, overdue, dueTs, statusEl, removeBtn, selectionId } as Entry;
    }).filter(Boolean) as Entry[];

    // Trier : avec échéance d'abord (par date), sans échéance ensuite
    const withDue = entries.filter(e => e.hasDue).sort((a, b) => a.dueTs - b.dueTs);
    const withoutDue = entries.filter(e => !e.hasDue);
    return [...withDue, ...withoutDue];
  }, [myDayItems, formatDateFR, statusClass, user]);

  const suggestions = useMemo(() => {
    const dueToday = items.filter((item) => {
      const dueKey = getDateKeyFromValue(item.dueDate);
      return dueKey ? dueKey <= todayKey : false;
    });
    const yesterdaySelections = myDaySelections.filter((entry) => entry.dateKey === yesterdayKey);
    const floatingYesterday = floatingTasks.filter((task) => task.dateKey === yesterdayKey);
    return {
      dueToday,
      yesterdaySelections,
      floatingYesterday
    };
  }, [items, myDaySelections, floatingTasks, todayKey, yesterdayKey]);

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


  const scheduleDelete = (message: string, action: () => Promise<void>) => {
    if (pendingDelete?.timeoutId) {
      window.clearTimeout(pendingDelete.timeoutId);
    }
    const expiresAt = Date.now() + (settings.deleteDelay * 1000);
    const timeoutId = window.setTimeout(async () => {
      await action();
      setPendingDelete(null);
    }, settings.deleteDelay * 1000);
    setPendingDelete({ message, action, timeoutId, expiresAt });
  };

  const handleUndoDelete = () => {
    if (pendingDelete?.timeoutId) {
      window.clearTimeout(pendingDelete.timeoutId);
    }
    setPendingDelete(null);
  };

  const handleDelete = async () => {
    if (!user) return;
    if (isMyDay) {
      if (selectedFloatingIds.length > 0) {
        scheduleDelete(`Supprimer ${selectedFloatingIds.length} tâche(s) volante(s).`, async () => {
          await deleteFloatingTasks(user.uid, selectedFloatingIds);
          setSelectedFloatingIds([]);
        });
      }
      return;
    }
    if (activeColumn === "cases" && selectedCaseIds.length > 0) {
      scheduleDelete(`Supprimer ${selectedCaseIds.length} dossier(s) et leurs tâches.`, async () => {
        await Promise.all(selectedCaseIds.map((id) => deleteCaseCascade(user.uid, id, items)));
        setSelectedCaseIds([]);
      });
      return;
    }
    if (activeColumn === "detail" && detailTarget) {
      if (detailTarget.type === "case") {
        scheduleDelete("Supprimer le dossier et ses tâches.", async () => {
          await deleteCaseCascade(user.uid, detailTarget.id, items);
          setSelectedCaseIds([]);
          setSelectedCaseId(null);
          setDetailTarget(null);
        });
        return;
      }
      const ids = [detailTarget.id];
      const subCount = items.filter((item) => item.parentItemId && ids.includes(item.parentItemId)).length;
      const label = subCount > 0 ? `Supprimer 1 tâche et ${subCount} sous-tâche(s).` : "Supprimer la tâche.";
      scheduleDelete(label, async () => {
        await deleteItemsCascade(user.uid, ids, items);
        setSelectedItemIds([]);
        setSelectedSubItemIds([]);
        setDetailTarget(null);
      });
      return;
    }
    if (activeColumn !== "cases") {
      const ids = activeColumn === "items" ? selectedItemIds : selectedSubItemIds;
      if (ids.length === 0) return;
      const subCount = items.filter((item) => item.parentItemId && ids.includes(item.parentItemId)).length;
      const label = subCount > 0 ? `Supprimer ${ids.length} tâche(s) et ${subCount} sous-tâche(s).` : `Supprimer ${ids.length} tâche(s).`;
      scheduleDelete(label, async () => {
        await deleteItemsCascade(user.uid, ids, items);
        setSelectedItemIds([]);
        setSelectedSubItemIds([]);
      });
    }
  };

  const handleCreateInActiveColumn = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      await createFloatingTask(user.uid, {
        dateKey: todayKey,
        title: "Nouvelle tâche volante",
        status: "Créée"
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
        status: "Créée",
        parentItemId: null
      });
      setSelectedItemId(id);
      setSelectedItemIds([id]);
      setSelectedSubItemId(null);
      setSelectedSubItemIds([]);
      setDetailTarget({ type: "item", id });
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
      status: "Créée"
    });
    setSelectedSubItemId(id);
    setSelectedSubItemIds([id]);
    setDetailTarget({ type: "item", id });
  }, [isMyDay, resolvedActiveColumn, selectedCaseId, selectedItem?.caseId, selectedItemId, user, todayKey]);

  const handleCreateChildTask = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      await createFloatingTask(user.uid, {
        dateKey: todayKey,
        title: "Nouvelle tâche volante",
        status: "Créée"
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
        status: "Créée",
        parentItemId: null
      });
      setSelectedItemId(id);
      setSelectedItemIds([id]);
      setSelectedSubItemId(null);
      setSelectedSubItemIds([]);
      setDetailTarget({ type: "item", id });
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
        status: "Créée"
      });
      setSelectedSubItemId(id);
      setSelectedSubItemIds([id]);
      setDetailTarget({ type: "item", id });
      return;
    }
    showToast("Niveau maximal atteint.");
  }, [isMyDay, resolvedActiveColumn, selectedCaseId, selectedItem?.caseId, selectedItemId, user, todayKey]);

  const handleAddToMyDay = async () => {
    if (!user) return;
    if (detailTarget?.type === "case") {
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "case",
        refId: detailTarget.id
      });
      showToast("Ajouté à Ma journée.");
      return;
    }
    if (detailTarget?.type === "item" && detailItem) {
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: detailItem.level === 2 ? "item" : "subitem",
        refId: detailItem.id
      });
      showToast("Ajouté à Ma journée.");
      return;
    }
    if (selectedCaseId && activeColumn === "cases") {
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "case",
        refId: selectedCaseId
      });
      showToast("Ajouté à Ma journée.");
    }
    if (activeColumn === "items" && selectedItemId) {
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "item",
        refId: selectedItemId
      });
      showToast("Ajouté à Ma journée.");
    }
    if (activeColumn === "subitems" && selectedSubItemId) {
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "subitem",
        refId: selectedSubItemId
      });
      showToast("Ajouté à Ma journée.");
    }
  };

  const handleStatusChange = async (status: Status) => {
    if (!user || !detailItem) return;
    await updateItemProgress(user.uid, detailItem.id, status);
    await logStatusEvent(user.uid, detailItem.id, detailItem.status, status);
  };

  const handleMarkMyDayItemDone = async (item: Item, selectionId?: string) => {
    if (!user) return;
    playDone();
    await updateItemProgress(user.uid, item.id, "Traité");
    await logStatusEvent(user.uid, item.id, item.status, "Traité");
    if (selectionId) {
      await deleteMyDaySelection(user.uid, selectionId);
    }
    setMyDayDetailId(null);
  };

  const handleMarkFloatingDone = async (taskId: string) => {
    if (!user) return;
    playDone();
    await deleteFloatingTasks(user.uid, [taskId]);
    setMyDayDetailId(null);
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
        if (activeColumn === "detail") {
          if (detailTarget?.type === "case") {
            setActiveColumn("cases");
          } else if (selectedSubItemId && subItems.length > 0) {
            setActiveColumn("subitems");
          } else {
            setActiveColumn("items");
          }
          setDetailTarget(null);
        } else if (activeColumn === "subitems") {
          setActiveColumn("items");
          setSelectedSubItemId(null);
          setSelectedSubItemIds([]);
          setDetailTarget(detailTarget?.type === "item" && selectedItemId
            ? { type: "item", id: selectedItemId } : null);
        } else if (activeColumn === "items") {
          setActiveColumn("cases");
          setDetailTarget(null);
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (activeColumn === "cases" && selectedCaseId) {
          setActiveColumn("items");
          if (itemsColumnItems.length > 0) {
            const firstId = itemsColumnItems[0]?.id ?? null;
            if (firstId) {
              setSelectedItemId(firstId);
              setSelectedItemIds([firstId]);
              setLastItemId(firstId);
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
        showToast("Niveau maximal atteint");
        return;
      }
      if (event.key === "Escape") {
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
      if (event.key === " " && detailTarget) {
        // Espace : focus sur le titre pour renommer
        event.preventDefault();
        if (detailTitleRef.current) {
          detailTitleRef.current.readOnly = false;
          detailTitleRef.current.focus();
          detailTitleRef.current.select();
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
      detailTitleRef
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

  const handleDeleteCase = async (caseId: string) => {
    if (!user) return;
    scheduleDelete("Supprimer le dossier et ses tâches.", async () => {
      await deleteCaseCascade(user.uid, caseId, items);
      setSelectedCaseIds([]);
      setSelectedCaseId(null);
      setDetailTarget(null);
    });
  };

  const handleAttachFloating = async (task: FloatingTask, caseId: string) => {
    if (!user) return;
    await createItem(user.uid, {
      caseId,
      level: 2,
      title: task.title,
      status: "Créée",  // toujours "Créée" quand on rattache
      parentItemId: null
    });
    await deleteFloatingTasks(user.uid, [task.id]);
    setMyDayDetailId(null);
    showToast(`"${task.title}" rattachée au dossier.`);
  };

  const handleCopyFeedback = async () => {
    if (!feedbackText.trim()) {
      showToast("Ajoutez un commentaire avant de copier.");
      return;
    }
    try {
      await navigator.clipboard.writeText(feedbackText.trim());
      showToast("Feedback copié.");
    } catch (err) {
      showToast("Impossible de copier automatiquement.");
    }
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


  const btnGhost = "text-[11.5px] font-[inherit] bg-bg border border-border text-text-2 px-2 py-[2px] rounded cursor-pointer hover:border-border-strong hover:text-tx transition-all";
  const btnDanger = "text-[11.5px] font-[inherit] bg-bg border border-[#fecaca] text-red-600 px-2 py-[2px] rounded cursor-pointer hover:bg-red-50 hover:border-red-400 transition-all";
  const iconBtn = "w-6 h-6 flex items-center justify-center border-none bg-transparent rounded text-tx-3 text-sm cursor-pointer hover:bg-bg-hover hover:text-tx-2 transition-all";
  const propKey = "w-[120px] shrink-0 text-[13px] text-tx-3 py-1 flex items-center gap-1.5";
  const propVal = "flex-1 text-[13px] text-tx py-1 px-2 rounded min-h-[28px] flex items-center";

  // ── DETAIL PANEL ─────────────────────────────────────────────────────────

  const detailPanel = showDetailColumn && (detailItem || detailCase) ? (
    <section className="finder-detail">
      <div className="finder-header">
        <span>Détail</span>
        <div className="flex gap-1 items-center">
          <button className={iconBtn} title="Ajouter à Ma journée (A)" onClick={handleAddToMyDay}>☀</button>
          {detailItem && (
            <button className={iconBtn} title="Rattacher (R)" onClick={handleOpenReparent}>⇄</button>
          )}
          <button
            className={iconBtn + " !text-red-400 hover:!text-red-600"}
            title="Supprimer (⌫)"
            onClick={handleDelete}
          >✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-0">

        {/* ── DÉTAIL DOSSIER ── */}
        {detailCase ? (
          <>
            <input
              className="w-full text-[20px] font-semibold text-tx bg-transparent border-none outline-none tracking-tight mb-5 leading-snug cursor-default focus:cursor-text"
              value={detailCase.title}
              readOnly
              onDoubleClick={e => { (e.target as HTMLInputElement).readOnly = false; (e.target as HTMLInputElement).focus(); }}
              onBlur={e => { (e.target as HTMLInputElement).readOnly = true; }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).readOnly = true;
                  (e.target as HTMLInputElement).blur();
                  e.stopPropagation();
                }
                if (e.key === "Escape") {
                  (e.target as HTMLInputElement).value = detailCase.title;
                  (e.target as HTMLInputElement).readOnly = true;
                  (e.target as HTMLInputElement).blur();
                  e.stopPropagation();
                }
              }}
              onChange={(e) => updateCase(user.uid, detailCase.id, { title: e.target.value })}
            />

            {/* Échéance */}
            <div className="flex items-start py-1 rounded hover:bg-bg-subtle group">
              <div className={propKey}><span className="opacity-60">📅</span> Échéance</div>
              <div className={propVal}>
                <input
                  key={detailCase.id + "-due"}
                  type="date"
                  className="font-[inherit] text-[13px] text-tx bg-transparent border-none outline-none w-full"
                  defaultValue={detailCase.legalDueDate?.slice(0, 10) ?? ""}
                  onBlur={(e) => {
                    if (!e.target.value) {
                      updateCase(user.uid, detailCase.id, { legalDueDate: null });
                      return;
                    }
                    const [y, m, d] = e.target.value.split("-").map(Number);
                    if (y < 1900 || y > 2100) return;
                    const local = new Date(y, m - 1, d, 12, 0, 0);
                    updateCase(user.uid, detailCase.id, { legalDueDate: local.toISOString() });
                  }}
                />
              </div>
            </div>
            {detailCase.legalDueDate && (
              <p className="text-[11px] text-tx-3 ml-[128px] -mt-1 mb-1">{formatDateFR(detailCase.legalDueDate)}</p>
            )}

            {/* Note */}
            <div className="flex items-start py-1 rounded hover:bg-bg-subtle mt-1">
              <div className={propKey + " pt-1"}><span className="opacity-60">📝</span> Note</div>
              <div className="flex-1 px-2">
                <textarea
                  className="w-full font-[inherit] text-[13px] text-tx bg-transparent border-none outline-none resize-none leading-relaxed min-h-[60px]"
                  value={detailCase.caseNote ?? ""}
                  onChange={(e) => updateCase(user.uid, detailCase.id, { caseNote: e.target.value })}
                  placeholder="Ajouter une note…"
                />
              </div>
            </div>

            {/* Séparateur */}
            <div className="h-px bg-border my-4" />

            {/* Actions */}
            <p className="text-[11.5px] font-medium text-tx-3 uppercase tracking-wide mb-3">Actions</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} onClick={() => handleExport(detailCase)}>Exporter JSON</button>
              <select
                className="text-[11.5px] font-[inherit] bg-bg border border-border text-tx-2 px-2 py-[2px] rounded cursor-pointer"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "model" | "history")}
              >
                <option value="history">Import historique</option>
                <option value="model">Import modèle</option>
              </select>
              <label className={btnGhost + " cursor-pointer"}>
                Importer JSON
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => handleImport(e.target.files?.[0] ?? null, importMode)}
                />
              </label>
              <button
                className={btnDanger}
                onClick={() => {
                  if (window.confirm("Supprimer ce dossier et toutes ses tâches ?")) {
                    handleDeleteCase(detailCase.id);
                  }
                }}
              >
                Supprimer le dossier
              </button>
            </div>
          </>
        ) : null}

        {/* ── DÉTAIL TÂCHE ── */}
        {detailItem ? (
          <>
            {/* Titre */}
            <input
              ref={detailTitleRef}
              className="w-full text-[20px] font-semibold text-tx bg-transparent border-none outline-none tracking-tight mb-5 leading-snug cursor-default focus:cursor-text"
              value={detailItem.title}
              readOnly
              onDoubleClick={e => { (e.target as HTMLInputElement).readOnly = false; (e.target as HTMLInputElement).focus(); }}
              onBlur={e => { (e.target as HTMLInputElement).readOnly = true; }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).readOnly = true;
                  (e.target as HTMLInputElement).blur();
                  e.stopPropagation();
                }
                if (e.key === "Escape") {
                  // Restaurer l'ancienne valeur
                  (e.target as HTMLInputElement).value = detailItem.title;
                  (e.target as HTMLInputElement).readOnly = true;
                  (e.target as HTMLInputElement).blur();
                  e.stopPropagation();
                }
              }}
              onChange={(e) => updateItem(user.uid, detailItem.id, { title: e.target.value })}
            />

            {/* Statut */}
            <div className="flex items-start py-1 rounded hover:bg-bg-subtle">
              <div className={propKey}><span className="opacity-60">◎</span> Statut</div>
              <div className="flex-1 px-2 py-1 flex flex-wrap gap-1.5">
                {STATUSES.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`${statusClass(s)} cursor-pointer border-none transition-opacity ${
                      detailItem.status === s ? "opacity-100" : "opacity-30 hover:opacity-60"
                    }`}
                  >
                    <span className="text-[9px] mr-1 opacity-60">{i + 1}</span>{s}
                  </button>
                ))}
              </div>
            </div>

            {/* Échéance */}
            <div className="flex items-start py-1 rounded hover:bg-bg-subtle">
              <div className={propKey}><span className="opacity-60">📅</span> Échéance</div>
              <div className={propVal}>
                <input
                  key={detailItem.id + "-due"}
                  type="date"
                  className="font-[inherit] text-[13px] text-tx bg-transparent border-none outline-none w-full"
                  defaultValue={detailItem.dueDate?.slice(0, 10) ?? ""}
                  onBlur={(e) => {
                    if (!e.target.value) { updateItem(user.uid, detailItem.id, { dueDate: null }); return; }
                    const [y, m, d] = e.target.value.split("-").map(Number);
                    if (y < 1900 || y > 2100) return;
                    const local = new Date(y, m - 1, d, 12, 0, 0);
                    updateItem(user.uid, detailItem.id, { dueDate: local.toISOString() });
                  }}
                />
              </div>
            </div>
            {detailItem.dueDate && (
              <p className="text-[11px] text-tx-3 ml-[128px] -mt-1 mb-1">{formatDateFR(detailItem.dueDate)}</p>
            )}

            {/* Dossier */}
            <div className="flex items-center py-1 rounded hover:bg-bg-subtle">
              <div className={propKey}><span className="opacity-60">📁</span> Dossier</div>
              <div className={propVal + " text-tx-2"}>
                {cases.find(c => c.id === detailItem.caseId)?.title ?? "—"}
              </div>
            </div>

            {/* Parent (si N3) */}
            {detailItem.parentItemId && (
              <div className="flex items-center py-1 rounded hover:bg-bg-subtle">
                <div className={propKey}><span className="opacity-60">📋</span> Parent</div>
                <div className={propVal + " text-tx-2"}>
                  {items.find(i => i.id === detailItem.parentItemId)?.title ?? "—"}
                </div>
              </div>
            )}

            {/* Séparateur */}
            <div className="h-px bg-border my-4" />

            {/* Commentaires */}
            <p className="text-[11.5px] font-medium text-tx-3 uppercase tracking-wide mb-3">Commentaires</p>
            <div className="space-y-2 mb-3">
              {detailComments.map((c) => (
                <div key={c.id} className="bg-bg-subtle rounded px-3 py-2">
                  <p className="text-[13px] text-tx leading-relaxed">{c.body}</p>
                  <p className="text-[11px] text-tx-3 mt-1">{formatDateFR(c.createdAt)}{c.author ? ` — ${c.author}` : ""}</p>
                </div>
              ))}
            </div>
            <textarea
              className="w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-transparent rounded px-3 py-2 outline-none resize-none leading-relaxed min-h-[64px] focus:border-border-strong focus:bg-bg placeholder:text-tx-3 transition-colors"
              placeholder="Ajouter un commentaire… (Entrée pour valider)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const t = e.target as HTMLTextAreaElement;
                  if (t.value.trim()) {
                    handleCommentAdd(t.value.trim());
                    t.value = "";
                  }
                }
              }}
            />

            {/* Timeline */}
            {detailEvents.length > 0 && (
              <>
                <button
                  className="text-[11.5px] text-tx-3 underline mt-3 mb-1 bg-transparent border-none cursor-pointer"
                  onClick={() => setIsTimelineOpen(p => !p)}
                >
                  {isTimelineOpen ? "Masquer la timeline" : "Afficher la timeline"}
                </button>
                {isTimelineOpen && (
                  <div className="space-y-1.5 mt-2">
                    {detailEvents.map((ev) => (
                      <div key={ev.id} className="bg-bg-subtle rounded px-3 py-1.5">
                        <p className="text-[12px] text-tx">{ev.type}</p>
                        <p className="text-[11px] text-tx-3">{formatDateFR(ev.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Séparateur */}
            <div className="h-px bg-border my-4" />

            {/* Raccourcis */}
            <p className="text-[11.5px] font-medium text-tx-3 uppercase tracking-wide mb-2">Raccourcis</p>
            <div className="flex flex-wrap gap-2">
              {[
                ["N", "nouveau"],
                ["⇧N", "sous-tâche"],
                ["Espace", "renommer"],
                ["A", "ma journée"],
                ["I", "détail"],
                ["R", "rattacher"],
                ["⌫", "supprimer"],
                ["1–4", "statut"],
                ["← →", "naviguer"],
                ["↑ ↓", "déplacer"],
              ].map(([k, label]) => (
                <span key={k} className="flex items-center gap-1 text-[11.5px] text-tx-3">
                  <kbd>{k}</kbd> {label}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── HEADER ── */}
      <header className="h-[44px] flex items-center justify-between px-4 border-b border-border bg-bg shrink-0 z-10">
        <Link href="/">
          <img src="/logo-henri.png" alt="Henri" style={{width:"250px", height:"auto"}} />
        </Link>

        <nav className="flex gap-0.5">
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

        <div className="flex items-center gap-2.5 text-[12px] text-tx-3">
          <span>{user.email}</span>
          <Link href="/settings" className={btnGhost} style={{textDecoration:"none"}}>Préférences</Link>
          <button className={btnGhost} onClick={() => signOut(auth)}>Déconnexion</button>
        </div>
      </header>

      {/* ── RAPPEL ÉCHÉANCES ── */}
      {!isMyDay && reminderItems.length > 0 && (
        <div className="reminder-bar">
          <span><strong className="font-medium">{reminderItems.length} tâche{reminderItems.length > 1 ? "s" : ""}</strong> à échéance aujourd'hui ou en retard</span>
          <button
            className="text-[11.5px] font-[inherit] bg-transparent border border-[#fcd34d] text-[#92400e] px-2 py-[2px] rounded cursor-pointer"
            onClick={async () => {
              if (!user) return;
              await Promise.all(reminderItems.map(item =>
                updateItem(user.uid, item.id, { lastReminderAt: new Date().toISOString() })
              ));
              showToast("Rappel enregistré");
            }}
          >
            Marquer comme rappelé
          </button>
        </div>
      )}

      {/* ══ VUE DOSSIERS ══ */}
      {!isMyDay ? (
        <div className="flex flex-1 overflow-hidden">

          {/* ── COL DOSSIERS ── */}
          {showCasesColumn && (
            <div className="finder-column">
              <div className="finder-header">
                <span>Dossiers</span>
                <div className="flex items-center gap-1">
                  <select
                    className="text-[11px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer outline-none"
                    value={caseSortKey}
                    onChange={(e) => setCaseSortKey(e.target.value as "title" | "createdAt" | "legalDueDate")}
                  >
                    <option value="title">Nom</option>
                    <option value="createdAt">Ancienneté</option>
                    <option value="legalDueDate">Échéance</option>
                  </select>
                  <button
                    className={iconBtn}
                    onClick={() => setCaseSortDirection(p => p === "asc" ? "desc" : "asc")}
                    title={caseSortDirection === "asc" ? "Croissant" : "Décroissant"}
                  >
                    {caseSortDirection === "asc" ? "↑" : "↓"}
                  </button>
                  <button className={iconBtn} title="Nouveau dossier (N)" onClick={handleCreateInActiveColumn}>+</button>
                </div>
              </div>

              <div className="finder-list" ref={casesListRef}>
                {sortedCases.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-id={entry.id}
                    data-selected={selectedCaseIds.includes(entry.id) ? "true" : undefined}
                    data-active={selectedCaseId === entry.id ? "true" : undefined}
                    onClick={(e) => handleSelectCase(entry.id, { multi: e.metaKey || e.ctrlKey, range: e.shiftKey })}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-tx truncate leading-snug">{entry.title}</p>
                      <p className="text-[11px] text-tx-3 mt-0.5 truncate">
                        {entry.legalDueDate ? (
                          <>Éch. <span className={new Date(entry.legalDueDate) < new Date() ? "text-red-500" : ""}>{formatDateFR(entry.legalDueDate)}</span></>
                        ) : "Pas d'échéance"}
                      </p>
                    </div>
                    {entry.type && (
                      <span className="text-[11px] text-tx-3 shrink-0">{entry.type}</span>
                    )}
                  </div>
                ))}
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
                    className={iconBtn}
                    title="Mode sélection"
                    onClick={() => { setSelectionModeItems(p => !p); setSelectedItemIds([]); }}
                  >⊡</button>
                  <button className={iconBtn} title="Nouvelle tâche (N)" onClick={async () => { setActiveColumn("items"); if (!user || !selectedCaseId) { showToast("Sélectionnez un dossier d'abord."); return; } const id = await createItem(user.uid, { caseId: selectedCaseId, level: 2, title: "Nouvelle tâche", status: "Créée", parentItemId: null }); setSelectedItemId(id); setSelectedItemIds([id]); setDetailTarget({ type: "item", id }); }}>+</button>
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
                      showToast("Ajouté à Ma journée.");
                    }}
                  >Ma journée</button>
                  <button className={btnDanger} onClick={handleDelete}>Supprimer</button>
                  <button
                    className="text-[11.5px] text-tx-3 bg-transparent border-none cursor-pointer ml-auto"
                    onClick={() => { setSelectedItemIds([]); setSelectionModeItems(false); }}
                  >Annuler</button>
                </div>
              )}

              <div className="finder-list" ref={itemsListRef}>
                {itemsColumnItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-id={entry.id}
                    data-selected={selectedItemIds.includes(entry.id) ? "true" : undefined}
                    data-active={selectedItemId === entry.id ? "true" : undefined}
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
                      <p className="text-[13.5px] text-tx truncate leading-snug">{entry.title}</p>
                      <p className="text-[11px] text-tx-3 mt-0.5 truncate">
                        {entry.dueDate ? (
                          <>Éch. <span className={new Date(entry.dueDate) < new Date() ? "text-red-500" : ""}>{formatDateFR(entry.dueDate)}</span></>
                        ) : (
                          getSubItems(items, entry.id).length > 0
                            ? `${getSubItems(items, entry.id).length} sous-tâche${getSubItems(items, entry.id).length > 1 ? "s" : ""}`
                            : "Pas d'échéance"
                        )}
                      </p>
                    </div>
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                  </div>
                ))}
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
                    className={iconBtn}
                    title="Mode sélection"
                    onClick={() => { setSelectionModeSubItems(p => !p); setSelectedSubItemIds([]); }}
                  >⊡</button>
                  <button className={iconBtn} title="Nouvelle sous-tâche (⇧N)" onClick={async () => { setActiveColumn("subitems"); if (!user || !selectedItemId) { showToast("Sélectionnez une tâche d'abord."); return; } const parentCaseId = selectedItem?.caseId ?? selectedCaseId; if (!parentCaseId) return; const id = await createItem(user.uid, { caseId: parentCaseId, parentItemId: selectedItemId, level: 3, title: "Nouvelle sous-tâche", status: "Créée" }); setSelectedSubItemId(id); setSelectedSubItemIds([id]); setDetailTarget({ type: "item", id }); }}>+</button>
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
                      showToast("Ajouté à Ma journée.");
                    }}
                  >Ma journée</button>
                  <button className={btnDanger} onClick={handleDelete}>Supprimer</button>
                  <button
                    className="text-[11.5px] text-tx-3 bg-transparent border-none cursor-pointer ml-auto"
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
                      <p className="text-[13.5px] text-tx truncate leading-snug">{entry.title}</p>
                      <p className="text-[11px] text-tx-3 mt-0.5">
                        {entry.dueDate ? formatDateFR(entry.dueDate) : `Créée le ${formatDateFR(entry.createdAt)}`}
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

          {/* ── COL GAUCHE : LISTE DU JOUR ── */}
          <div className="flex flex-col flex-1 overflow-hidden border-r border-border bg-white">
            <div className="finder-header">
              <span>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
              <span className="text-tx-3">{(() => { const n = myDaySorted.length + todayFloating.length; return `${n} élément${n > 1 ? "s" : ""}`; })()}</span>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {myDaySorted.length === 0 && todayFloating.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                  <p className="text-[14px] text-tx-3">Journée vide</p>
                  <p className="text-[12px] text-tx-3">Utilisez <kbd>A</kbd> depuis les dossiers<br/>ou consultez les suggestions à droite.</p>
                </div>
              ) : (
                <div>
                  {/* ⭐ Volantes étoilées */}
                  {todayFloating.filter(t => t.starred).map(task => (
                    <div key={task.id} className="finder-row group"
                      data-active={myDayDetailId === `f-${task.id}` ? "true" : undefined}
                      onClick={() => setMyDayDetailId(myDayDetailId === `f-${task.id}` ? null : `f-${task.id}`)}>
                      <button className="w-4 h-4 shrink-0 rounded-full border-2 border-border-strong bg-transparent cursor-pointer hover:border-accent transition-colors"
                        onClick={e => { e.stopPropagation(); handleMarkFloatingDone(task.id); }} title="Réalisée" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px]">⭐</span>
                          <p className="text-[13.5px] font-medium text-tx truncate">{task.title}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={statusClass(task.status)}>{task.status}</span>
                          {task.dueDate && <span className={`text-[11px] ${new Date(task.dueDate) < new Date() ? "text-red-500" : "text-tx-3"}`}>Éch. {formatDateFR(task.dueDate)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Tâches avec échéance */}
                  {myDaySorted.filter(e => e.hasDue).map(entry => (
                    <div key={entry.key} className="finder-row group"
                      data-active={myDayDetailId === entry.key ? "true" : undefined}
                      onClick={() => setMyDayDetailId(myDayDetailId === entry.key ? null : entry.key)}>
                      <button className="w-4 h-4 shrink-0 rounded-full border-2 border-border-strong bg-transparent cursor-pointer hover:border-accent hover:bg-blue-50 transition-colors"
                        onClick={e => { e.stopPropagation(); const sel = myDaySelections.find(s => s.id === entry.selectionId); if (!sel) return; const item = items.find(i => i.id === sel.refId); if (item) handleMarkMyDayItemDone(item, entry.selectionId); }} title="Réalisée" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] text-tx truncate leading-snug">{entry.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {entry.statusEl}
                          <span className={`text-[11px] ${entry.overdue ? "text-red-500" : "text-tx-3"}`}>Éch. {entry.dueStr}</span>
                        </div>
                      </div>
                      {entry.removeBtn}
                    </div>
                  ))}

                  {/* Tâches sans échéance */}
                  {myDaySorted.filter(e => !e.hasDue).map(entry => (
                    <div key={entry.key} className="finder-row group"
                      data-active={myDayDetailId === entry.key ? "true" : undefined}
                      onClick={() => setMyDayDetailId(myDayDetailId === entry.key ? null : entry.key)}>
                      <button className="w-4 h-4 shrink-0 rounded-full border-2 border-border-strong bg-transparent cursor-pointer hover:border-accent hover:bg-blue-50 transition-colors"
                        onClick={e => { e.stopPropagation(); const sel = myDaySelections.find(s => s.id === entry.selectionId); if (!sel) return; const item = items.find(i => i.id === sel.refId); if (item) handleMarkMyDayItemDone(item, entry.selectionId); }} title="Réalisée" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] text-tx truncate leading-snug">{entry.title}</p>
                        <div className="mt-0.5">{entry.statusEl}</div>
                      </div>
                      {entry.removeBtn}
                    </div>
                  ))}

                  {/* Volantes non étoilées sans échéance */}
                  {todayFloating.filter(t => !t.starred && !t.dueDate).map(task => (
                    <div key={task.id} className="finder-row group"
                      data-active={myDayDetailId === `f-${task.id}` ? "true" : undefined}
                      onClick={() => setMyDayDetailId(myDayDetailId === `f-${task.id}` ? null : `f-${task.id}`)}>
                      <button className="w-4 h-4 shrink-0 rounded-full border-2 border-border-strong bg-transparent cursor-pointer hover:border-accent transition-colors"
                        onClick={e => { e.stopPropagation(); handleMarkFloatingDone(task.id); }} title="Réalisée" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] text-tx truncate">{task.title}</p>
                        <span className={statusClass(task.status)}>{task.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Saisie tâche volante */}
            <div className="border-t border-border bg-bg p-3">
              <div className="flex items-center gap-2 bg-bg-subtle border border-border rounded-lg px-3 py-2">
                <span className="text-[13px] text-tx-3">✏</span>
                <input
                  className="flex-1 font-[inherit] text-[13.5px] text-tx bg-transparent border-none outline-none placeholder:text-tx-3"
                  placeholder="Nouvelle tâche volante… (Entrée)"
                  onKeyDown={async e => {
                    if (e.key === "Enter") {
                      const t = e.target as HTMLInputElement;
                      const val = t.value.trim();
                      if (!val || !user) return;
                      await createFloatingTask(user.uid, { dateKey: todayKey, title: val, status: "Créée" });
                      t.value = "";
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── COL DROITE : DÉTAIL ou SUGGESTIONS ── */}
          <div className="flex flex-col overflow-hidden bg-white" style={{width:"300px", flexShrink:0}}>

            {myDayDetailId ? (
              /* Détail tâche sélectionnée */
              (() => {
                if (myDayDetailId.startsWith("f-")) {
                  const task = todayFloating.find(t => `f-${t.id}` === myDayDetailId);
                  if (!task) return null;
                  return (
                    <>
                      <div className="finder-header">
                        <span>Tâche volante</span>
                        <div className="flex gap-1">
                          <button className={iconBtn} title={task.starred ? "Retirer l'étoile" : "Prioritaire ⭐"}
                            onClick={() => updateFloatingTask(user.uid, task.id, { starred: !task.starred })}>{task.starred ? "⭐" : "☆"}</button>
                          <button className={iconBtn + " !text-green-500"} onClick={() => handleMarkFloatingDone(task.id)} title="Réalisée">✓</button>
                          <button className={iconBtn} onClick={() => setMyDayDetailId(null)} title="Fermer">✕</button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-1">
                        <input
                          className="w-full text-[18px] font-semibold text-tx bg-transparent border-none outline-none tracking-tight leading-snug cursor-default focus:cursor-text mb-4"
                          value={task.title} readOnly
                          onDoubleClick={e => { (e.target as HTMLInputElement).readOnly = false; (e.target as HTMLInputElement).focus(); }}
                          onBlur={e => { (e.target as HTMLInputElement).readOnly = true; }}
                          onChange={e => updateFloatingTask(user.uid, task.id, { title: e.target.value })}
                        />
                        <div className="flex items-center py-1 rounded hover:bg-bg-subtle">
                          <div className={propKey}><span className="opacity-60">◎</span> Statut</div>
                          <div className="flex-1 px-2 py-1 flex flex-wrap gap-1.5">
                            {STATUSES.map((s, i) => (
                              <button key={s} onClick={() => updateFloatingTask(user.uid, task.id, { status: s })}
                                className={`${statusClass(s)} cursor-pointer border-none transition-opacity text-[11px] ${task.status === s ? "opacity-100" : "opacity-30 hover:opacity-60"}`}>
                                <span className="text-[9px] mr-1 opacity-60">{i + 1}</span>{s}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center py-1 rounded hover:bg-bg-subtle">
                          <div className={propKey}><span className="opacity-60">📅</span> Échéance</div>
                          <div className="flex-1 px-2">
                            <input key={task.id + "-due"} type="date" className="font-[inherit] text-[13px] text-tx bg-transparent border-none outline-none"
                              defaultValue={task.dueDate?.slice(0,10) ?? ""}
                              onBlur={e => { if (!e.target.value) { updateFloatingTask(user.uid, task.id, { dueDate: null }); return; } const [y,m,d] = e.target.value.split("-").map(Number); if (y < 1900 || y > 2100) return; updateFloatingTask(user.uid, task.id, { dueDate: new Date(y,m-1,d,12).toISOString() }); }} />
                          </div>
                        </div>
                        <div className="flex items-center py-1 rounded hover:bg-bg-subtle">
                          <div className={propKey}><span className="opacity-60">📁</span> Rattacher</div>
                          <div className="flex-1 px-2">
                            <select className="font-[inherit] text-[13px] text-tx-2 bg-transparent border border-border rounded px-2 py-1 outline-none cursor-pointer w-full"
                              onChange={e => handleAttachFloating(task, e.target.value)} defaultValue="">
                              <option value="" disabled>Choisir un dossier…</option>
                              {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                            </select>
                          </div>
                        </div>
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
              /* Suggestions — colonne droite par défaut */
              <>
                <div className="finder-header">
                  <span>Suggestions</span>
                </div>
                <div className="flex-1 overflow-y-auto py-1">

                  {suggestions.floatingYesterday.length === 0 && suggestions.yesterdaySelections.length === 0 && suggestions.dueToday.length === 0 && stagnantSuggestions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                      <p className="text-[13px] text-tx-3">Aucune suggestion pour aujourd'hui.</p>
                    </div>
                  ) : (
                    <>
                      {suggestions.dueToday.length > 0 && (
                        <div className="px-3 pt-3 pb-1">
                          <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">Échéances</p>
                          {suggestions.dueToday.map(task => (
                            <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-subtle group cursor-default">
                              <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] text-tx truncate">{task.title}</p>
                                <p className="text-[11px] text-red-400">{task.dueDate ? formatDateFR(task.dueDate) : "—"}</p>
                              </div>
                              <button className="opacity-0 group-hover:opacity-100 shrink-0 text-[11px] text-accent border border-[#93c5fd] rounded px-2 py-0.5 bg-transparent cursor-pointer transition-opacity"
                                onClick={() => addMyDaySelection(user.uid, { dateKey: todayKey, refType: task.level === 2 ? "item" : "subitem", refId: task.id })}>+ Ajouter</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {suggestions.yesterdaySelections.length > 0 && (
                        <div className="px-3 pt-3 pb-1">
                          <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">Hier — non terminés</p>
                          {suggestions.yesterdaySelections.map(entry => {
                            const title = entry.refType === "case"
                              ? cases.find(c => c.id === entry.refId)?.title
                              : items.find(i => i.id === entry.refId)?.title;
                            if (!title) return null;
                            return (
                              <div key={entry.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-subtle group cursor-default">
                                <p className="flex-1 text-[12.5px] text-tx truncate">{title}</p>
                                <button className="opacity-0 group-hover:opacity-100 shrink-0 text-[11px] text-accent border border-[#93c5fd] rounded px-2 py-0.5 bg-transparent cursor-pointer transition-opacity"
                                  onClick={() => addMyDaySelection(user.uid, { dateKey: todayKey, refType: entry.refType, refId: entry.refId })}>+ Ajouter</button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {suggestions.floatingYesterday.length > 0 && (
                        <div className="px-3 pt-3 pb-1">
                          <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">Hier — volantes</p>
                          {suggestions.floatingYesterday.map(task => (
                            <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-subtle group cursor-default">
                              <p className="flex-1 text-[12.5px] text-tx truncate">{task.title}</p>
                              <button className="opacity-0 group-hover:opacity-100 shrink-0 text-[11px] text-accent border border-[#93c5fd] rounded px-2 py-0.5 bg-transparent cursor-pointer transition-opacity"
                                onClick={() => updateFloatingTask(user.uid, task.id, { dateKey: todayKey })}>↩ Reprendre</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {stagnantSuggestions.length > 0 && (
                        <div className="px-3 pt-3 pb-1">
                          <p className="text-[10px] font-medium text-tx-3 uppercase tracking-wide mb-1.5">Stagnantes</p>
                          {stagnantSuggestions.map(task => (
                            <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-subtle group cursor-default">
                              <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] text-tx truncate">{task.title}</p>
                                <span className={statusClass(task.status as Status)}>{task.status}</span>
                              </div>
                              <button className="opacity-0 group-hover:opacity-100 shrink-0 text-[11px] text-accent border border-[#93c5fd] rounded px-2 py-0.5 bg-transparent cursor-pointer transition-opacity"
                                onClick={() => addMyDaySelection(user.uid, { dateKey: todayKey, refType: task.level === 2 ? "item" : "subitem", refId: task.id })}>+ Ajouter</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
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
              className="w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong"
              placeholder="Rechercher un parent…"
              value={reparentSearch}
              onChange={e => setReparentSearch(e.target.value)}
              onKeyDown={handleReparentKeyDown}
              autoFocus
            />
            <div className="border border-border rounded max-h-56 overflow-auto text-[13px]">
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
            <p className="text-[11px] text-tx-3">↵ valider · Échap fermer</p>
          </div>
        </div>
      )}

    </div>
  );
}

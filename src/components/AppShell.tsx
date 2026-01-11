"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
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
  getTodayKey,
  getYesterdayKey,
  importCaseFromJson,
  logStatusEvent,
  subscribeCases,
  subscribeComments,
  subscribeEvents,
  subscribeFloatingTasks,
  subscribeItems,
  subscribeMyDaySelections,
  updateCase,
  updateFloatingTask,
  updateItem
} from "@/lib/firestore";
import { auth } from "@/lib/firebase";
import { seedData } from "@/lib/seed";
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

export default function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [floatingTasks, setFloatingTasks] = useState<FloatingTask[]>([]);
  const [myDaySelections, setMyDaySelections] = useState<MyDaySelection[]>([]);

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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"model" | "history">("history");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const toastTimeout = useRef<number | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);

  const [caseSortKey, setCaseSortKey] = useState<"title" | "createdAt" | "legalDueDate">("title");
  const [caseSortDirection, setCaseSortDirection] = useState<"asc" | "desc">("asc");

  const pathname = usePathname();
  const isMyDay = pathname === "/my-day";

  const todayKey = getTodayKey();
  const yesterdayKey = getYesterdayKey();

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
    const unsubMyDay = subscribeMyDaySelections(user.uid, setMyDaySelections);
    ensureSeedData(user.uid, seedData);
    return () => {
      unsubCases();
      unsubItems();
      unsubComments();
      unsubEvents();
      unsubFloating();
      unsubMyDay();
    };
  }, [user]);

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
        const aDate = a.entry.legalDueDate ? new Date(a.entry.legalDueDate).getTime() : 0;
        const bDate = b.entry.legalDueDate ? new Date(b.entry.legalDueDate).getTime() : 0;
        const result = aDate - bDate;
        return result !== 0 ? result * direction : a.index - b.index;
      })
      .map(({ entry }) => entry);
  }, [cases, caseSortDirection, caseSortKey]);

  const selectedCase = cases.find((entry) => entry.id === selectedCaseId) || null;
  const caseItems = selectedCase ? getItemsByCase(items, selectedCase.id) : [];
  const selectedItem = items.find((entry) => entry.id === selectedItemId) || null;
  const subItems = selectedItem ? getSubItems(items, selectedItem.id) : [];
  const selectedSubItem = items.find((entry) => entry.id === selectedSubItemId) || null;

  const detailItem = detailTarget?.type === "item" ? items.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailCase = detailTarget?.type === "case" ? cases.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailComments = detailItem ? comments.filter((comment) => comment.itemId === detailItem.id) : [];
  const detailEvents = detailItem ? events.filter((event) => event.itemId === detailItem.id) : [];
  const reminderItems = items.filter((item) => item.dueDate && item.dueDate.slice(0, 10) <= todayKey);
  const showDetailColumn = Boolean(detailTarget && (detailCase || detailItem));
  const showCasesColumn = true;
  const showItemsColumn = Boolean(selectedCase) && detailTarget?.type !== "case";
  const showSubItemsColumn = Boolean(selectedItem && subItems.length > 0) && detailTarget?.type !== "case";

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

  const suggestions = useMemo(() => {
    const dueToday = items.filter((item) => item.dueDate && item.dueDate.slice(0, 10) <= todayKey);
    const yesterdaySelections = myDaySelections.filter((entry) => entry.dateKey === yesterdayKey);
    const floatingYesterday = floatingTasks.filter((task) => task.dateKey === yesterdayKey);
    return {
      dueToday,
      yesterdaySelections,
      floatingYesterday
    };
  }, [items, myDaySelections, floatingTasks, todayKey, yesterdayKey]);

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
    setActiveColumn("items");
    setDetailTarget(null);
    if (options?.range) {
      setSelectedCaseIds(selectRange(sortedCases.map((entry) => entry.id), lastCaseId, id));
    } else if (options?.multi) {
      setSelectedCaseIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
    } else {
      setSelectedCaseIds([id]);
    }
    setLastCaseId(id);
  };

  const handleSelectItem = (id: string, options?: { multi?: boolean; range?: boolean; openDetail?: boolean }) => {
    setSelectedItemId(id);
    setSelectedSubItemId(null);
    setSelectedSubItemIds([]);
    setActiveColumn(options?.openDetail ? "detail" : "items");
    if (options?.openDetail) {
      setDetailTarget({ type: "item", id });
    } else {
      setDetailTarget(null);
    }
    if (options?.range) {
      setSelectedItemIds(selectRange(caseItems.map((entry) => entry.id), lastItemId, id));
    } else if (options?.multi) {
      setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
    } else {
      setSelectedItemIds([id]);
    }
    setLastItemId(id);
  };

  const handleSelectSubItem = (id: string, options?: { multi?: boolean; range?: boolean; openDetail?: boolean }) => {
    setSelectedSubItemId(id);
    setActiveColumn(options?.openDetail ? "detail" : "subitems");
    if (options?.openDetail) {
      setDetailTarget({ type: "item", id });
    } else {
      setDetailTarget(null);
    }
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

  const handleOpenDetail = () => {
    if (selectedSubItemId) {
      setDetailTarget({ type: "item", id: selectedSubItemId });
      setActiveColumn("detail");
      return;
    }
    if (selectedItemId) {
      setDetailTarget({ type: "item", id: selectedItemId });
      setActiveColumn("detail");
      return;
    }
    if (selectedCaseId) {
      setDetailTarget({ type: "case", id: selectedCaseId });
      setActiveColumn("detail");
    }
  };

  const showToast = (message: string) => setToast(message);

  const scheduleDelete = (message: string, action: () => Promise<void>) => {
    if (pendingDelete?.timeoutId) {
      window.clearTimeout(pendingDelete.timeoutId);
    }
    const expiresAt = Date.now() + 15000;
    const timeoutId = window.setTimeout(async () => {
      await action();
      setPendingDelete(null);
    }, 15000);
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

  const handleNew = async () => {
    if (!user) return;
    if (isMyDay) {
      await createFloatingTask(user.uid, {
        dateKey: todayKey,
        title: "Nouvelle tâche volante",
        status: "À faire"
      });
      return;
    }
    if (!selectedCaseId) {
      const id = await createCase(user.uid, { title: "Nouveau dossier", legalDueDate: null, caseNote: "" });
      setSelectedCaseId(id);
      setSelectedCaseIds([id]);
      setActiveColumn("items");
      return;
    }
    if (!selectedItemId) {
      const id = await createItem(user.uid, {
        caseId: selectedCaseId,
        level: 2,
        title: "Nouvelle tâche",
        status: "À faire",
        parentItemId: null
      });
      setSelectedItemId(id);
      setSelectedItemIds([id]);
      setDetailTarget({ type: "item", id });
      setActiveColumn("detail");
      return;
    }
    const parentItemId = selectedSubItem?.parentItemId ?? selectedItemId;
    const id = await createItem(user.uid, {
      caseId: selectedCaseId,
      parentItemId,
      level: 3,
      title: "Nouvelle sous-tâche",
      status: "À faire"
    });
    setSelectedSubItemId(id);
    setSelectedSubItemIds([id]);
    setDetailTarget({ type: "item", id });
    setActiveColumn("detail");
  };

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
    await updateItem(user.uid, detailItem.id, { status });
    await logStatusEvent(user.uid, detailItem.id, status);
  };

  const handleMarkMyDayItemDone = async (item: Item, selectionId?: string) => {
    if (!user) return;
    await updateItem(user.uid, item.id, { status: "Traité" });
    await logStatusEvent(user.uid, item.id, "Traité");
    if (selectionId) {
      await deleteMyDaySelection(user.uid, selectionId);
    }
  };

  const handleMarkFloatingDone = async (taskId: string) => {
    if (!user) return;
    await deleteFloatingTasks(user.uid, [taskId]);
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
          setDetailTarget(null);
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
          if (caseItems.length > 0) {
            const firstId = caseItems[0]?.id ?? null;
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
            setActiveColumn("detail");
          }
        } else if (activeColumn === "subitems" && selectedSubItemId) {
          setDetailTarget({ type: "item", id: selectedSubItemId });
          setActiveColumn("detail");
        }
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        if (activeColumn === "cases") {
          const ids = sortedCases.map((entry) => entry.id);
          if (ids.length === 0) return;
          const index = Math.max(0, ids.indexOf(selectedCaseId ?? ids[0]) + direction);
          const nextId = ids[index];
          if (nextId) {
            setSelectedCaseId(nextId);
            setSelectedCaseIds([nextId]);
          }
        }
        if (activeColumn === "items") {
          const ids = caseItems.map((entry) => entry.id);
          if (ids.length === 0) return;
          const index = Math.max(0, ids.indexOf(selectedItemId ?? ids[0]) + direction);
          const nextId = ids[index];
          if (nextId) {
            setSelectedItemId(nextId);
            setSelectedItemIds([nextId]);
          }
        }
        if (activeColumn === "subitems") {
          const ids = subItems.map((entry) => entry.id);
          if (ids.length === 0) return;
          const index = Math.max(0, ids.indexOf(selectedSubItemId ?? ids[0]) + direction);
          const nextId = ids[index];
          if (nextId) {
            setSelectedSubItemId(nextId);
            setSelectedSubItemIds([nextId]);
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
        await handleNew();
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
      if (event.key.toLowerCase() === "i") {
        handleOpenDetail();
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
          setSelectedItemIds(caseItems.map((entry) => entry.id));
        }
        if (activeColumn === "subitems") {
          setSelectedSubItemIds(subItems.map((entry) => entry.id));
        }
      }
    },
    [
      activeColumn,
      caseItems,
      subItems,
      selectedCaseId,
      selectedItemId,
      selectedSubItemId,
      detailItem,
      detailTarget,
      sortedCases,
      handleAddToMyDay,
      handleDelete,
      handleNew,
      handleStatusChange
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
      status: task.status,
      parentItemId: null
    });
    await deleteFloatingTasks(user.uid, [task.id]);
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

  if (!user) {
    return null;
  }

  const detailPanel = showDetailColumn && (detailItem || detailCase) ? (
    <section className="finder-detail">
      <div className="finder-header">Détail</div>
      {detailCase ? (
        <div className="p-3 space-y-4 text-sm">
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Titre du dossier</label>
            <input
              className="w-full border border-border rounded-md px-2 py-1 text-sm"
              value={detailCase.title}
              onChange={(event) => updateCase(user.uid, detailCase.id, { title: event.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Échéance juridique</label>
            <input
              type="date"
              className="w-full border border-border rounded-md px-2 py-1 text-sm"
              value={detailCase.legalDueDate?.slice(0, 10) ?? ""}
              onChange={(event) =>
                updateCase(user.uid, detailCase.id, {
                  legalDueDate: event.target.value ? new Date(event.target.value).toISOString() : null
                })
              }
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Note dossier</label>
            <textarea
              className="w-full border border-border rounded-md px-2 py-1 text-sm"
              rows={4}
              value={detailCase.caseNote ?? ""}
              onChange={(event) => updateCase(user.uid, detailCase.id, { caseNote: event.target.value })}
              placeholder="Ajouter une note globale"
            />
          </div>
          <div className="border border-border rounded-md p-3 bg-white space-y-2">
            <p className="text-xs text-slate-500">Actions dossier</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="text-xs border border-border rounded-md px-2 py-1"
                onClick={() => handleExport(detailCase)}
              >
                Exporter
              </button>
              <select
                className="text-xs border border-border rounded-md px-2 py-1"
                value={importMode}
                onChange={(event) => setImportMode(event.target.value as "model" | "history")}
              >
                <option value="history">Import historique</option>
                <option value="model">Import modèle</option>
              </select>
              <label className="text-xs border border-border rounded-md px-2 py-1 cursor-pointer">
                Importer
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => handleImport(event.target.files?.[0] ?? null, importMode)}
                />
              </label>
              <button
                className="text-xs border border-red-200 text-red-600 rounded-md px-2 py-1"
                onClick={() => {
                  if (window.confirm("Supprimer ce dossier et toutes ses tâches ?")) {
                    handleDeleteCase(detailCase.id);
                  }
                }}
              >
                Supprimer le dossier
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {detailItem ? (
        <div className="p-3 space-y-4 text-sm">
          <div>
            <input
              className="w-full border border-border rounded-md px-2 py-1 text-sm"
              value={detailItem.title}
              onChange={(event) => updateItem(user.uid, detailItem.id, { title: event.target.value })}
            />
            <p className="text-xs text-slate-500 mt-1">Statut actuel: {detailItem.status}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map((status, index) => (
              <button
                key={status}
                className={`text-xs rounded-md border px-2 py-1 ${
                  detailItem.status === status ? "bg-slate-900 text-white" : "bg-white"
                }`}
                onClick={() => handleStatusChange(status)}
              >
                {index + 1}. {status}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs text-slate-500">Échéance opérationnelle</label>
            <input
              type="date"
              className="w-full border border-border rounded-md px-2 py-1 text-sm"
              value={detailItem.dueDate?.slice(0, 10) ?? ""}
              onChange={(event) =>
                updateItem(user.uid, detailItem.id, {
                  dueDate: event.target.value ? new Date(event.target.value).toISOString() : null
                })
              }
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Commentaires</label>
            <div className="space-y-2">
              {detailComments.map((comment) => (
                <div key={comment.id} className="text-xs bg-white border border-border rounded-md p-2">
                  <p>{comment.body}</p>
                  <p className="text-[10px] text-slate-400">{comment.createdAt}</p>
                </div>
              ))}
            </div>
            <textarea
              className="w-full border border-border rounded-md px-2 py-1 text-sm mt-2"
              rows={2}
              placeholder="Ajouter un commentaire"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const target = event.target as HTMLTextAreaElement;
                  if (target.value.trim()) {
                    handleCommentAdd(target.value.trim());
                    target.value = "";
                  }
                }
              }}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Timeline</label>
            <div className="space-y-2">
              {detailEvents.map((eventEntry) => (
                <div key={eventEntry.id} className="text-xs border border-border rounded-md p-2 bg-white">
                  <p>{eventEntry.type}</p>
                  <p className="text-[10px] text-slate-400">{eventEntry.createdAt}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span>Raccourcis:</span>
            <span>
              <kbd>N</kbd> nouveau
            </span>
            <span>
              <kbd>A</kbd> Ma journée
            </span>
            <span>
              <kbd>Del</kbd> supprimer
            </span>
            <span>
              <kbd>1-6</kbd> statut
            </span>
          </div>
        </div>
      ) : null}
    </section>
  ) : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 bg-white border-b border-border z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-semibold tracking-wide">
              HENRI
            </Link>
            <nav className="flex gap-2">
              <Link
                className={`px-3 py-1 text-sm rounded-md ${
                  isMyDay ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
                href="/my-day"
              >
                Ma journée
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{user.email}</span>
            <button className="text-slate-700" onClick={() => signOut(auth)}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {!isMyDay ? (
        <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">
          {reminderItems.length > 0 ? (
            <section className="bg-panel border border-border rounded-lg px-4 py-3 text-sm flex items-center justify-between">
              <div>
                <p className="font-semibold">Rappels</p>
                <p className="text-xs text-slate-500">{reminderItems.length} tâche(s) à échéance aujourd'hui ou en retard.</p>
              </div>
              <button
                className="text-xs border border-border rounded-md px-2 py-1"
                onClick={async () => {
                  if (!user) return;
                  await Promise.all(
                    reminderItems.map((item) =>
                      updateItem(user.uid, item.id, { lastReminderAt: new Date().toISOString() })
                    )
                  );
                  showToast("Rappel enregistré");
                }}
              >
                Marquer comme rappelé
              </button>
            </section>
          ) : null}
          <section className="flex gap-4 items-stretch">
          {showCasesColumn ? (
          <section className="finder-column">
            <div className="finder-header flex items-center justify-between gap-2">
              <span>Dossiers</span>
              <div className="flex items-center gap-2">
                <select
                  className="text-xs border border-border rounded-md px-1 py-0.5"
                  value={caseSortKey}
                  onChange={(event) => setCaseSortKey(event.target.value as "title" | "createdAt" | "legalDueDate")}
                >
                  <option value="title">Nom</option>
                  <option value="createdAt">Ancienneté</option>
                  <option value="legalDueDate">Échéance</option>
                </select>
                <button
                  className="text-xs border border-border rounded-md px-2 py-0.5"
                  onClick={() => setCaseSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                >
                  {caseSortDirection === "asc" ? "Asc" : "Desc"}
                </button>
              </div>
            </div>
            <div className="finder-list">
              {sortedCases.map((entry) => (
                <div
                  key={entry.id}
                  className="finder-row"
                  data-selected={selectedCaseIds.includes(entry.id)}
                  data-active={activeColumn === "cases" && selectedCaseId === entry.id}
                  onClick={(event) =>
                    handleSelectCase(entry.id, {
                      multi: event.metaKey || event.ctrlKey,
                      range: event.shiftKey
                    })
                  }
                >
                  <div className="flex-1">
                    <p className="font-medium">{entry.title}</p>
                    <p className="text-xs text-slate-500">
                      Échéance juridique: {entry.legalDueDate?.slice(0, 10) ?? "-"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {selectedCaseId === entry.id ? (
                      <button
                        className="text-[11px] text-slate-600 underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetailTarget({ type: "case", id: entry.id });
                          setActiveColumn("detail");
                        }}
                      >
                        Infos
                      </button>
                    ) : null}
                    <span className="text-xs text-slate-500">{entry.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          ) : null}

          {showItemsColumn ? (
            <section className="finder-column">
              <div className="finder-header flex items-center justify-between">
                <span>Tâches</span>
                <button
                  className="text-xs border border-border rounded-md px-2 py-0.5"
                  onClick={() => {
                    setSelectionModeItems((prev) => !prev);
                    setSelectedItemIds([]);
                  }}
                >
                  {selectionModeItems ? "Annuler" : "Sélection"}
                </button>
              </div>
              {selectionModeItems ? (
                <div className="finder-actionbar">
                  <button className="text-xs border border-border rounded-md px-2 py-1" onClick={handleDelete}>
                    Supprimer
                  </button>
                  <button
                    className="text-xs border border-border rounded-md px-2 py-1"
                    onClick={async () => {
                      if (!user || selectedItemIds.length === 0) return;
                      await Promise.all(
                        selectedItemIds.map((id) =>
                          addMyDaySelection(user.uid, { dateKey: todayKey, refType: "item", refId: id })
                        )
                      );
                      showToast("Ajouté à Ma journée.");
                    }}
                  >
                    Ajouter à Ma journée
                  </button>
                  <button
                    className="text-xs text-slate-500"
                    onClick={() => {
                      setSelectedItemIds([]);
                      setSelectionModeItems(false);
                    }}
                  >
                    Annuler sélection
                  </button>
                </div>
              ) : null}
              <div className="finder-list">
                {caseItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-selected={selectedItemIds.includes(entry.id)}
                    data-active={activeColumn === "items" && selectedItemId === entry.id}
                    onClick={(event) =>
                      selectionModeItems
                        ? handleSelectItem(entry.id, {
                            multi: true
                          })
                        : handleSelectItem(entry.id, {
                            multi: event.metaKey || event.ctrlKey,
                            range: event.shiftKey,
                            openDetail: !(event.metaKey || event.ctrlKey || event.shiftKey)
                          })
                    }
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {selectionModeItems ? (
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(entry.id)}
                          onChange={() => handleSelectItem(entry.id, { multi: true })}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4"
                        />
                      ) : null}
                      <div className="flex-1">
                        <p className="font-medium">{entry.title}</p>
                        <p className="text-xs text-slate-500">
                          {entry.status} {entry.dueDate ? `• échéance ${entry.dueDate.slice(0, 10)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">N2</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {showSubItemsColumn ? (
            <section className="finder-column">
              <div className="finder-header flex items-center justify-between">
                <span>Sous-tâches</span>
                <button
                  className="text-xs border border-border rounded-md px-2 py-0.5"
                  onClick={() => {
                    setSelectionModeSubItems((prev) => !prev);
                    setSelectedSubItemIds([]);
                  }}
                >
                  {selectionModeSubItems ? "Annuler" : "Sélection"}
                </button>
              </div>
              {selectionModeSubItems ? (
                <div className="finder-actionbar">
                  <button className="text-xs border border-border rounded-md px-2 py-1" onClick={handleDelete}>
                    Supprimer
                  </button>
                  <button
                    className="text-xs border border-border rounded-md px-2 py-1"
                    onClick={async () => {
                      if (!user || selectedSubItemIds.length === 0) return;
                      await Promise.all(
                        selectedSubItemIds.map((id) =>
                          addMyDaySelection(user.uid, { dateKey: todayKey, refType: "subitem", refId: id })
                        )
                      );
                      showToast("Ajouté à Ma journée.");
                    }}
                  >
                    Ajouter à Ma journée
                  </button>
                  <button
                    className="text-xs text-slate-500"
                    onClick={() => {
                      setSelectedSubItemIds([]);
                      setSelectionModeSubItems(false);
                    }}
                  >
                    Annuler sélection
                  </button>
                </div>
              ) : null}
              <div className="finder-list">
                {subItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-selected={selectedSubItemIds.includes(entry.id)}
                    data-active={activeColumn === "subitems" && selectedSubItemId === entry.id}
                    onClick={(event) =>
                      selectionModeSubItems
                        ? handleSelectSubItem(entry.id, { multi: true })
                        : handleSelectSubItem(entry.id, {
                            multi: event.metaKey || event.ctrlKey,
                            range: event.shiftKey,
                            openDetail: !(event.metaKey || event.ctrlKey || event.shiftKey)
                          })
                    }
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {selectionModeSubItems ? (
                        <input
                          type="checkbox"
                          checked={selectedSubItemIds.includes(entry.id)}
                          onChange={() => handleSelectSubItem(entry.id, { multi: true })}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4"
                        />
                      ) : null}
                      <div className="flex-1">
                        <p className="font-medium">{entry.title}</p>
                        <p className="text-xs text-slate-500">{entry.status}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">N3</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {detailPanel}
          </section>
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          <section className="bg-panel border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">Tâches volantes</h2>
            <div className="space-y-2">
              {floatingTasks
                .filter((task) => task.dateKey === todayKey)
                .map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between bg-white border border-border rounded-md px-3 py-2"
                    onClick={() => setSelectedFloatingIds([task.id])}
                  >
                    <div className="flex-1 space-y-1">
                      <input
                        className="w-full text-sm font-medium bg-transparent border border-transparent focus:border-border rounded px-1 -ml-1"
                        value={task.title}
                        onChange={(event) => updateFloatingTask(user.uid, task.id, { title: event.target.value })}
                      />
                      <select
                        className="text-xs border border-border rounded-md px-2 py-1"
                        value={task.status}
                        onChange={(event) =>
                          updateFloatingTask(user.uid, task.id, { status: event.target.value as Status })
                        }
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        className="text-xs border border-border rounded-md px-2 py-1"
                        onChange={(event) => handleAttachFloating(task, event.target.value)}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Rattacher
                        </option>
                        {cases.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.title}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-xs border border-border rounded-md px-2 py-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleMarkFloatingDone(task.id);
                        }}
                      >
                        Réalisée
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="bg-panel border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">Travail du jour</h2>
            <div className="space-y-2">
              {myDayItems.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun élément ajouté.</p>
              ) : (
                myDayItems.map((entry) => {
                  if (!entry) return null;
                  return (
                    <div
                      key={entry.data.id}
                      className="flex items-center justify-between bg-white border border-border rounded-md px-3 py-2"
                      onClick={() => {
                        setDetailTarget({ type: entry.type, id: entry.data.id });
                        setActiveColumn("detail");
                      }}
                    >
                      <div>
                        <p className="text-sm font-medium">{entry.data.title}</p>
                        {"status" in entry.data ? (
                          <p className="text-xs text-slate-500">{entry.data.status}</p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            Échéance {entry.data.legalDueDate?.slice(0, 10)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs border border-border rounded-md px-2 py-1"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailTarget({ type: entry.type, id: entry.data.id });
                            setActiveColumn("detail");
                          }}
                        >
                          Détails
                        </button>
                        {entry.type === "item" ? (
                          <button
                            className="text-xs border border-border rounded-md px-2 py-1"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMarkMyDayItemDone(entry.data, entry.selectionId);
                            }}
                          >
                            Réalisée
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="bg-panel border border-border rounded-lg p-4">
            <h2 className="text-sm font-semibold mb-3">Suggestions</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-2">Échéances aujourd'hui / en retard</p>
                <div className="space-y-2">
                  {suggestions.dueToday.map((task) => (
                    <div key={task.id} className="flex items-center justify-between bg-white border border-border rounded-md px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-slate-500">{task.dueDate?.slice(0, 10)}</p>
                      </div>
                      <button
                        className="text-xs border border-border rounded-md px-2 py-1"
                        onClick={() =>
                          addMyDaySelection(user.uid, {
                            dateKey: todayKey,
                            refType: task.level === 2 ? "item" : "subitem",
                            refId: task.id
                          })
                        }
                      >
                        Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2">Hier (non terminés)</p>
                <div className="space-y-2">
                  {suggestions.yesterdaySelections.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between bg-white border border-border rounded-md px-3 py-2">
                      <p className="text-sm">
                        {entry.refType === "case"
                          ? cases.find((entryCase) => entryCase.id === entry.refId)?.title ?? entry.refId
                          : items.find((entryItem) => entryItem.id === entry.refId)?.title ?? entry.refId}
                      </p>
                      <button
                        className="text-xs border border-border rounded-md px-2 py-1"
                        onClick={() =>
                          addMyDaySelection(user.uid, {
                            dateKey: todayKey,
                            refType: entry.refType,
                            refId: entry.refId
                          })
                        }
                      >
                        Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2">Tâches volantes d'hier</p>
                <div className="space-y-2">
                  {suggestions.floatingYesterday.map((task) => (
                    <div key={task.id} className="flex items-center justify-between bg-white border border-border rounded-md px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-slate-500">Les reprendre aujourd'hui ?</p>
                      </div>
                      <button
                        className="text-xs border border-border rounded-md px-2 py-1"
                        onClick={() => updateFloatingTask(user.uid, task.id, { dateKey: todayKey })}
                      >
                        Reprendre
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          {detailPanel ? <div className="pt-2">{detailPanel}</div> : null}
        </main>
      )}

      {pendingDelete ? (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-sm px-4 py-3 rounded-md shadow-lg">
          <p>{pendingDelete.message}</p>
          <div className="flex items-center justify-between gap-3 mt-1 text-xs">
            <span>Annulation {undoCountdown}s</span>
            <button className="underline" onClick={handleUndoDelete}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-4 bg-white border border-border text-sm px-4 py-2 rounded-md shadow">
          {toast}
        </div>
      ) : null}

      <button
        className="fixed bottom-4 right-4 bg-slate-900 text-white text-sm px-4 py-2 rounded-full shadow-lg"
        onClick={() => setIsFeedbackOpen(true)}
      >
        Feedback
      </button>

      {isFeedbackOpen ? (
        <div className="fixed bottom-16 right-4 w-[320px] bg-white border border-border rounded-lg shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Feedback & corrections</h3>
            <button className="text-xs text-slate-500" onClick={() => setIsFeedbackOpen(false)}>
              Fermer
            </button>
          </div>
          <textarea
            className="w-full border border-border rounded-md px-2 py-1 text-sm"
            rows={5}
            placeholder="Tapez vos commentaires ici..."
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
          />
          <div className="flex items-center justify-between text-xs">
            <button className="border border-border rounded-md px-2 py-1" onClick={handleCopyFeedback}>
              Copier tout
            </button>
            <button
              className="text-slate-500"
              onClick={() => {
                setFeedbackText("");
                showToast("Feedback effacé.");
              }}
            >
              Effacer
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Collez ce texte pour me partager vos corrections.</p>
        </div>
      ) : null}
    </div>
  );
}

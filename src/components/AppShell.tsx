"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
};

export default function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [floatingTasks, setFloatingTasks] = useState<FloatingTask[]>([]);
  const [myDaySelections, setMyDaySelections] = useState<MyDaySelection[]>([]);

  const [activeTab, setActiveTab] = useState<"finder" | "myday">("finder");

  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(null);

  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedSubItemIds, setSelectedSubItemIds] = useState<string[]>([]);
  const [selectedFloatingIds, setSelectedFloatingIds] = useState<string[]>([]);

  const [activeColumn, setActiveColumn] = useState<"cases" | "items" | "subitems" | "detail">("cases");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"model" | "history">("history");
  const toastTimeout = useRef<number | null>(null);

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

  const selectedCase = cases.find((entry) => entry.id === selectedCaseId) || null;
  const caseItems = selectedCase ? getItemsByCase(items, selectedCase.id) : [];
  const selectedItem = items.find((entry) => entry.id === selectedItemId) || null;
  const subItems = selectedItem ? getSubItems(items, selectedItem.id) : [];
  const selectedSubItem = items.find((entry) => entry.id === selectedSubItemId) || null;

  const detailItem = selectedSubItem || selectedItem;
  const detailComments = detailItem
    ? comments.filter((comment) => comment.itemId === detailItem.id)
    : [];
  const detailEvents = detailItem ? events.filter((event) => event.itemId === detailItem.id) : [];
  const reminderItems = items.filter((item) => item.dueDate && item.dueDate.slice(0, 10) <= todayKey);
  const showDetailColumn = Boolean(detailItem && isDetailOpen);
  const showSubItemsColumn = Boolean(selectedItem && subItems.length > 0);
  const showCasesColumn = !showDetailColumn || (detailItem?.level === 2 && subItems.length === 0);
  const showItemsColumn = Boolean(selectedCase || detailItem);

  const myDayEntries = myDaySelections.filter((entry) => entry.dateKey === todayKey);
  const myDayItems = myDayEntries
    .map((entry) => {
      if (entry.refType === "case") {
        const caseItem = cases.find((entryCase) => entryCase.id === entry.refId);
        return caseItem ? { type: "case" as const, data: caseItem } : null;
      }
      const item = items.find((entryItem) => entryItem.id === entry.refId);
      return item ? { type: "item" as const, data: item } : null;
    })
    .filter((entry): entry is { type: "case" | "item"; data: Case | Item } => Boolean(entry));

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

  const handleSelectCase = (id: string, options?: { multi?: boolean; range?: boolean }) => {
    setSelectedCaseId(id);
    setSelectedItemId(null);
    setSelectedSubItemId(null);
    setActiveColumn("items");
    setIsDetailOpen(false);
    if (options?.multi) {
      setSelectedCaseIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
    } else {
      setSelectedCaseIds([id]);
    }
  };

  const handleSelectItem = (id: string, options?: { multi?: boolean }) => {
    setSelectedItemId(id);
    setSelectedSubItemId(null);
    setActiveColumn("items");
    setIsDetailOpen(false);
    if (options?.multi) {
      setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
    } else {
      setSelectedItemIds([id]);
    }
  };

  const handleSelectSubItem = (id: string, options?: { multi?: boolean }) => {
    setSelectedSubItemId(id);
    setActiveColumn("subitems");
    setIsDetailOpen(false);
    if (options?.multi) {
      setSelectedSubItemIds((prev) =>
        prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
      );
    } else {
      setSelectedSubItemIds([id]);
    }
  };

  const handleOpenDetail = () => {
    if (selectedItemId || selectedSubItemId) {
      setActiveColumn("detail");
      setIsDetailOpen(true);
    }
  };

  const showToast = (message: string) => setToast(message);

  const scheduleDelete = (message: string, action: () => Promise<void>) => {
    if (pendingDelete?.timeoutId) {
      window.clearTimeout(pendingDelete.timeoutId);
    }
    const timeoutId = window.setTimeout(async () => {
      await action();
      setPendingDelete(null);
    }, 3500);
    setPendingDelete({ message, action, timeoutId });
  };

  const handleUndoDelete = () => {
    if (pendingDelete?.timeoutId) {
      window.clearTimeout(pendingDelete.timeoutId);
    }
    setPendingDelete(null);
  };

  const handleDelete = async () => {
    if (!user) return;
    if (activeTab === "myday") {
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
    if (activeTab === "myday") {
      await createFloatingTask(user.uid, {
        dateKey: todayKey,
        title: "Nouvelle tâche volante",
        status: "À faire"
      });
      return;
    }
    if (activeColumn === "cases") {
      await createCase(user.uid, { title: "Nouveau dossier", legalDueDate: null });
      return;
    }
    if (activeColumn === "items" && selectedCaseId) {
      const id = await createItem(user.uid, {
        caseId: selectedCaseId,
        level: 2,
        title: "Nouvelle tâche",
        status: "À faire",
        parentItemId: null
      });
      setSelectedItemId(id);
      return;
    }
    if (activeColumn === "subitems" && selectedItemId && selectedCaseId) {
      const id = await createItem(user.uid, {
        caseId: selectedCaseId,
        parentItemId: selectedItemId,
        level: 3,
        title: "Nouvelle sous-tâche",
        status: "À faire"
      });
      setSelectedSubItemId(id);
    }
  };

  const handleAddToMyDay = async () => {
    if (!user) return;
    if (activeColumn === "cases" && selectedCaseId) {
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: "case",
        refId: selectedCaseId
      });
      showToast("Ajouté à Ma journée.");
    }
    if ((activeColumn === "items" || activeColumn === "subitems") && detailItem) {
      await addMyDaySelection(user.uid, {
        dateKey: todayKey,
        refType: detailItem.level === 2 ? "item" : "subitem",
        refId: detailItem.id
      });
      showToast("Ajouté à Ma journée.");
    }
  };

  const handleStatusChange = async (status: Status) => {
    if (!user || !detailItem) return;
    await updateItem(user.uid, detailItem.id, { status });
    await logStatusEvent(user.uid, detailItem.id, status);
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
          if (selectedSubItemId && subItems.length > 0) {
            setActiveColumn("subitems");
            setIsDetailOpen(false);
          } else {
            setActiveColumn("items");
            setIsDetailOpen(false);
          }
        } else if (activeColumn === "subitems") {
          setActiveColumn("items");
          setIsDetailOpen(false);
        } else if (activeColumn === "items") {
          setActiveColumn("cases");
          setIsDetailOpen(false);
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (activeColumn === "cases" && selectedCaseId) {
          setActiveColumn("items");
        } else if (activeColumn === "items" && selectedItemId) {
          if (subItems.length > 0) {
            setActiveColumn("subitems");
          } else {
            setActiveColumn("detail");
            setIsDetailOpen(true);
          }
        } else if (activeColumn === "subitems" && selectedSubItemId) {
          setActiveColumn("detail");
          setIsDetailOpen(true);
        }
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? -1 : 1;
        if (activeColumn === "cases") {
          const ids = cases.map((entry) => entry.id);
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
        setActiveColumn("items");
        setSelectedSubItemId(null);
        setIsDetailOpen(false);
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
      if (event.key === "Enter") {
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
      cases,
      caseItems,
      subItems,
      selectedCaseId,
      selectedItemId,
      selectedSubItemId,
      detailItem,
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

  const handleExport = async () => {
    if (!selectedCase) return;
    const json = exportCaseToJson(selectedCase, items);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedCase.title}.json`;
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

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 bg-white border-b border-border z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">Henri</h1>
            <nav className="flex gap-2">
              <button
                className={`px-3 py-1 text-sm rounded-md ${
                  activeTab === "finder" ? "bg-slate-900 text-white" : "bg-slate-100"
                }`}
                onClick={() => setActiveTab("finder")}
              >
                Finder
              </button>
              <button
                className={`px-3 py-1 text-sm rounded-md ${
                  activeTab === "myday" ? "bg-slate-900 text-white" : "bg-slate-100"
                }`}
                onClick={() => setActiveTab("myday")}
              >
                Ma journée
              </button>
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

      {activeTab === "finder" ? (
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
          <section className="flex gap-4">
          {showCasesColumn ? (
          <section className="finder-column">
            <div className="finder-header flex items-center justify-between">
              <span>Dossiers</span>
              <div className="flex gap-2">
                <button className="text-xs" onClick={handleExport}>
                  Export
                </button>
                <select
                  className="text-xs border border-border rounded-md px-1 py-0.5"
                  value={importMode}
                  onChange={(event) => setImportMode(event.target.value as "model" | "history")}
                >
                  <option value="history">Import historique</option>
                  <option value="model">Import modèle</option>
                </select>
                <label className="text-xs cursor-pointer">
                  Importer
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(event) => handleImport(event.target.files?.[0] ?? null, importMode)}
                  />
                </label>
              </div>
            </div>
            {selectedCase ? (
              <div className="px-3 py-2 border-b border-border bg-white space-y-2">
                <input
                  className="w-full border border-border rounded-md px-2 py-1 text-sm"
                  value={selectedCase.title}
                  onChange={(event) => updateCase(user.uid, selectedCase.id, { title: event.target.value })}
                />
                <input
                  type="date"
                  className="w-full border border-border rounded-md px-2 py-1 text-sm"
                  value={selectedCase.legalDueDate?.slice(0, 10) ?? ""}
                  onChange={(event) =>
                    updateCase(user.uid, selectedCase.id, {
                      legalDueDate: event.target.value ? new Date(event.target.value).toISOString() : null
                    })
                  }
                />
              </div>
            ) : null}
            <div className="finder-list">
              {cases.map((entry) => (
                <div
                  key={entry.id}
                  className="finder-row"
                  data-selected={selectedCaseIds.includes(entry.id)}
                  data-active={selectedCaseId === entry.id}
                  onClick={(event) =>
                    handleSelectCase(entry.id, { multi: event.metaKey || event.ctrlKey })
                  }
                >
                  <div>
                    <p className="font-medium">{entry.title}</p>
                    <p className="text-xs text-slate-500">
                      Échéance juridique: {entry.legalDueDate?.slice(0, 10) ?? "-"}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">{entry.type}</span>
                </div>
              ))}
            </div>
          </section>
          ) : null}

          {showItemsColumn ? (
            <section className="finder-column">
              <div className="finder-header">Tâches</div>
              <div className="finder-list">
                {caseItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-selected={selectedItemIds.includes(entry.id)}
                    data-active={selectedItemId === entry.id}
                    onClick={(event) =>
                      handleSelectItem(entry.id, { multi: event.metaKey || event.ctrlKey })
                    }
                    onDoubleClick={handleOpenDetail}
                  >
                    <div>
                      <p className="font-medium">{entry.title}</p>
                      <p className="text-xs text-slate-500">
                        {entry.status} {entry.dueDate ? `• échéance ${entry.dueDate.slice(0, 10)}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">N2</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {showSubItemsColumn ? (
            <section className="finder-column">
              <div className="finder-header">Sous-tâches</div>
              <div className="finder-list">
                {subItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="finder-row"
                    data-selected={selectedSubItemIds.includes(entry.id)}
                    data-active={selectedSubItemId === entry.id}
                    onClick={(event) =>
                      handleSelectSubItem(entry.id, { multi: event.metaKey || event.ctrlKey })
                    }
                    onDoubleClick={handleOpenDetail}
                  >
                    <div>
                      <p className="font-medium">{entry.title}</p>
                      <p className="text-xs text-slate-500">{entry.status}</p>
                    </div>
                    <span className="text-xs text-slate-500">N3</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {showDetailColumn ? (
            <section className="finder-column max-w-[360px]">
              <div className="finder-header">Détail</div>
              <div className="p-3 space-y-4 text-sm">
                <div>
                  <input
                    className="w-full border border-border rounded-md px-2 py-1 text-sm"
                    value={detailItem.title}
                    onChange={(event) =>
                      updateItem(user.uid, detailItem.id, { title: event.target.value })
                    }
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
            </section>
          ) : null}
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
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-slate-500">{task.status}</p>
                    </div>
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
                    <div key={entry.data.id} className="bg-white border border-border rounded-md px-3 py-2">
                      <p className="text-sm font-medium">{entry.data.title}</p>
                      {"status" in entry.data ? (
                        <p className="text-xs text-slate-500">{entry.data.status}</p>
                      ) : (
                        <p className="text-xs text-slate-500">Échéance {entry.data.legalDueDate?.slice(0, 10)}</p>
                      )}
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
        </main>
      )}

      {pendingDelete ? (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-sm px-4 py-3 rounded-md shadow-lg">
          <p>{pendingDelete.message}</p>
          <button className="text-xs underline mt-1" onClick={handleUndoDelete}>
            Annuler
          </button>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-4 bg-white border border-border text-sm px-4 py-2 rounded-md shadow">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

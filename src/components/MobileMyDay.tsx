"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
  deleteFloatingTasks,
  logStatusEvent,
} from "@/lib/firestore";
import type { Item, Case, FloatingTask, MyDaySelection, Status } from "@/lib/types";
import { getTodayKey } from "@/lib/dates";
import { getProgressLevel } from "@/lib/progress";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

const STATUSES: Status[] = ["Créée", "Demandé", "Reçu", "Traité"];
const STATUS_COLORS: Record<string, string> = {
  "Créée":   "#e5e7eb",
  "Demandé": "#fde68a",
  "Reçu":    "#a5f3fc",
  "Traité":  "#bbf7d0",
};
const STATUS_TEXT: Record<string, string> = {
  "Créée":   "#374151",
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

export default function MobileMyDay({ user }: { user: User }) {
  const todayKey = getTodayKey();

  // Data
  const [items, setItems] = useState<Item[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [floatingTasks, setFloatingTasks] = useState<FloatingTask[]>([]);
  const [myDaySelections, setMyDaySelections] = useState<MyDaySelection[]>([]);

  // UI
  const [detailEntry, setDetailEntry] = useState<SelectionEntry | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [memoDue, setMemoDue] = useState("");
  const [memoCaseId, setMemoCaseId] = useState("");
  const [memoCaseSearch, setMemoCaseSearch] = useState("");
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const playDone = () => {
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

  // Entrées du jour
  const todayEntries = useMemo<SelectionEntry[]>(() => {
    const sels = myDaySelections.filter(s => s.dateKey === todayKey && !pendingRemovalIds.has(s.id));
    const entries: SelectionEntry[] = [];
    for (const s of sels) {
      const item = items.find(i => i.id === s.refId);
      if (item) entries.push({ selectionId: s.id, type: "item", item });
    }
    const todayFloating = floatingTasks.filter(t => t.status !== "Traité" && t.dateKey != null && t.dateKey <= todayKey);
    for (const f of todayFloating) {
      entries.push({ selectionId: f.id, type: "floating", floating: f });
    }
    return entries;
  }, [myDaySelections, items, floatingTasks, todayKey, pendingRemovalIds]);

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
    await addMyDaySelection(user.uid, {
      dateKey: todayKey,
      refType: item.level === 2 ? "item" : "subitem",
      refId: item.id,
    });
    setSuggestionsOpen(false);
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

  const handleCreateMemo = async () => {
    const text = memoText.trim();
    if (!text) return;
    setMemoText(""); setMemoDue(""); setMemoCaseId(""); setMemoCaseSearch(""); setMemoOpen(false);

    if (memoCaseId) {
      // Rattaché à un dossier → créer une tâche item et l'ajouter à Ma journée
      const { createItem, addMyDaySelection } = await import("@/lib/firestore");
      const newItemId = await createItem(user.uid, {
        caseId: memoCaseId,
        level: 2,
        title: text,
        status: "Créée",
        parentItemId: null,
        dueDate: memoDue ? new Date(memoDue + "T12:00:00").toISOString() : null,
      });
      // L'ajouter immédiatement à Ma journée pour éviter le doublon en suggestion
      if (newItemId) await addMyDaySelection(user.uid, {
        refType: "item",
        refId: newItemId,
        dateKey: todayKey,
        selectionDate: null,
        dateTs: null,
      }).catch(() => {});
    } else {
      // Mémo libre — si échéance future, ne pas mettre dans Ma journée aujourd'hui
      const isFuture = memoDue && memoDue > todayKey;
      await createFloatingTask(user.uid, {
        title: text,
        dateKey: isFuture ? memoDue : todayKey, // apparaîtra le bon jour
        note: null,
        dueDate: memoDue ? new Date(memoDue + "T12:00:00").toISOString() : null,
        starred: false,
        status: "Créée",
      });
    }
  };

  const handleStatusChange = async (entry: SelectionEntry, status: Status) => {
    if (entry.type === "item" && entry.item) {
      const subItems = items.filter(i => i.parentItemId === entry.item!.id);
      const unfinished = subItems.filter(i => i.status !== "Traité");
      if (status === "Traité" && unfinished.length > 0) return; // bloqué
      await updateItemProgress(user.uid, entry.item.id, status);
      await logStatusEvent(user.uid, entry.item.id, entry.item.status, status);
      setDetailEntry(prev => prev ? { ...prev, item: { ...prev.item!, status } } : prev);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  const caseOf = (item: Item) => cases.find(c => c.id === item.caseId)?.title ?? "";
  const parentOf = (item: Item) => item.parentItemId ? items.find(i => i.id === item.parentItemId)?.title : null;

  // ── RENDU ──
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#f9fafb", overflow: "hidden", position: "relative" }}>

      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <img src="/logo-henri-new.png" alt="Henri" style={{ height: "28px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
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
            {todayEntries.map(entry => {
              const title = entry.item?.title ?? entry.floating?.title ?? "";
              const status = entry.item?.status ?? null;
              const dueDate = entry.item?.dueDate ?? entry.floating?.dueDate ?? null;
              const isOverdue = dueDate && dueDate.slice(0, 10) < todayKey;
              const isDueToday = dueDate && dueDate.slice(0, 10) === todayKey;
              return (
                <div key={entry.selectionId}
                  onClick={() => setDetailEntry(entry)}
                  style={{
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                    borderLeft: (() => {
                      if (entry.floating) return "1px solid #e5e7eb"; // mémo → pas de liseré
                      if (entry.item?.starred) return "4px solid #f59e0b"; // important → jaune
                      const statusColors: Record<string, string> = {
                        "Créée": "#d1d5db",
                        "Demandé": "#fbbf24",
                        "Reçu": "#60a5fa",
                        "Traité": "#34d399",
                      };
                      return `4px solid ${statusColors[entry.item?.status ?? "Créée"] ?? "#d1d5db"}`;
                    })(),
                  }}>
                  <div style={{ flex: 1, minWidth: 0, opacity: completingIds.has(entry.selectionId) ? 0.4 : 1, transition: "opacity 0.3s" }}>
                    <p style={{ fontSize: "15px", fontWeight: 500, color: "#111827", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {title}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {status && (
                        <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: STATUS_COLORS[status] ?? "#e5e7eb", color: STATUS_TEXT[status] ?? "#374151" }}>
                          {status}
                        </span>
                      )}
                      {entry.item && (
                        <span style={{ fontSize: "11px", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {caseOf(entry.item)}{parentOf(entry.item) ? ` › ${parentOf(entry.item)}` : ""}
                        </span>
                      )}
                      {dueDate && (
                        <span style={{ fontSize: "11px", color: isOverdue ? "#ef4444" : isDueToday ? "#16a34a" : "#6b7280", fontWeight: isOverdue || isDueToday ? 600 : 400 }}>
                          {isOverdue ? "⚠ " : "📅 "}{formatDate(dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeEntry(entry); }}
                    style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#9ca3af", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    ✕
                  </button>
                  {/* Rond à cocher à gauche + croix à droite */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const id = entry.selectionId;
                      if (completingIds.has(id)) return;
                      setCompletingIds(prev => new Set(prev).add(id));
                      playDone();
                      setTimeout(async () => {
                        if (entry.type === "item" && entry.item) {
                          await handleStatusChange(entry, "Traité");
                        } else if (entry.type === "floating" && entry.floating) {
                          await updateFloatingTask(user.uid, entry.floating.id, { status: "Traité" });
                        }
                        removeEntry(entry);
                        setCompletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
                      }, 350);
                    }}
                    style={{
                      width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                      border: completingIds.has(entry.selectionId) ? "none" : "2px solid #d1d5db",
                      background: completingIds.has(entry.selectionId) ? "#16a34a" : "white",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s ease", order: -1,
                    }}>
                    {completingIds.has(entry.selectionId) && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barre du bas */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #e5e7eb", padding: "10px 12px", display: "flex", gap: "8px", alignItems: "center" }}>
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
                status: "Créée",
              });
            }
          }}
          placeholder="Nouveau mémo…"
          style={{ flex: 1, height: "44px", borderRadius: "12px", border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: "15px", padding: "0 14px", outline: "none", fontFamily: "inherit", color: "#111827" }}
        />
        <button onClick={() => setMemoOpen(true)}
          style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#111827", color: "white", border: "none", fontSize: "22px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          +
        </button>
      </div>

      {/* ── POPUP NOUVEAU MÉMO ── */}
      {memoOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setMemoOpen(false)}>
          <div style={{ width: "100%", background: "white", borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>

            {/* Header popup */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "17px", fontWeight: 700, color: "#111827" }}>Nouveau mémo</p>
              <button onClick={() => setMemoOpen(false)}
                style={{ width: "32px", height: "32px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f9fafb", fontSize: "18px", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Titre */}
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Intitulé</p>
              <input
                autoFocus
                value={memoText}
                onChange={e => setMemoText(e.target.value)}
                placeholder="Que faut-il faire ?"
                style={{ width: "100%", fontSize: "16px", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "13px 16px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#111827", boxSizing: "border-box" }}
              />
            </div>

            {/* Échéance */}
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Échéance</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                {[
                  { label: "Aujourd'hui", days: 0 },
                  { label: "Demain", days: 1 },
                  { label: "Dans 2 j.", days: 2 },
                  { label: "Dans 1 sem.", days: 7 },
                  { label: "Dans 1 mois", days: 30 },
                ].map(({ label, days }) => {
                  const d = new Date(); d.setDate(d.getDate() + days); d.setHours(12,0,0,0);
                  const iso = d.toISOString().slice(0, 10);
                  const isSelected = memoDue === iso;
                  return (
                    <button key={label} onClick={() => setMemoDue(isSelected ? "" : iso)}
                      style={{ padding: "8px 14px", borderRadius: "20px", border: isSelected ? "2px solid #111827" : "1px solid #e5e7eb", background: isSelected ? "#111827" : "white", color: isSelected ? "white" : "#374151", fontSize: "13px", fontWeight: isSelected ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <input type="date" value={memoDue}
                onChange={e => setMemoDue(e.target.value)}
                style={{ width: "100%", fontSize: "15px", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "11px 16px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box" }}
              />
            </div>

            {/* Rattachement dossier */}
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Rattacher à un dossier <span style={{ fontWeight: 400, textTransform: "none", fontSize: "11px" }}>(optionnel)</span></p>
              <input
                value={memoCaseSearch}
                onChange={e => setMemoCaseSearch(e.target.value)}
                placeholder="Rechercher un dossier…"
                style={{ width: "100%", fontSize: "15px", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "11px 16px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box", marginBottom: "8px" }}
              />
              {memoCaseSearch.trim() && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", overflow: "hidden", maxHeight: "180px", overflowY: "auto" }}>
                  {cases.filter(c => c.title.toLowerCase().includes(memoCaseSearch.toLowerCase())).slice(0, 8).map(c => (
                    <button key={c.id} onClick={() => { setMemoCaseId(c.id); setMemoCaseSearch(c.title); }}
                      style={{ width: "100%", padding: "12px 16px", textAlign: "left", background: memoCaseId === c.id ? "#f0fdf4" : "white", border: "none", borderBottom: "1px solid #f3f4f6", fontSize: "14px", color: "#111827", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>📁</span> {c.title}
                    </button>
                  ))}
                  {cases.filter(c => c.title.toLowerCase().includes(memoCaseSearch.toLowerCase())).length === 0 && (
                    <p style={{ padding: "12px 16px", fontSize: "13px", color: "#9ca3af" }}>Aucun dossier trouvé</p>
                  )}
                </div>
              )}
              {memoCaseId && (
                <button onClick={() => { setMemoCaseId(""); setMemoCaseSearch(""); }}
                  style={{ marginTop: "6px", fontSize: "12px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                  ✕ Retirer le rattachement
                </button>
              )}
            </div>

            {/* Bouton créer */}
            <button
              disabled={!memoText.trim()}
              onClick={handleCreateMemo}
              style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: memoText.trim() ? "#111827" : "#e5e7eb", color: memoText.trim() ? "white" : "#9ca3af", fontSize: "16px", fontWeight: 700, cursor: memoText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Ajouter à Ma journée
            </button>
          </div>
        </div>
      )}

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
                          {subtitle && <p style={{ fontSize: "11px", color: "#6b7280" }}>{subtitle}</p>}
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
                  .filter(t => t.status !== "Traité" && t.dateKey && t.dateKey > todayKey)
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
                          onClick={() => { setSuggestionsOpen(false); setDetailEntry({ selectionId: `f-${t.id}`, type: "floating", floating: t }); }}
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

      {/* ── PANNEAU DÉTAIL (droite) ── */}
      {detailEntry && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setDetailEntry(null)}>
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "92vw", maxWidth: "420px", background: "white", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {detailEntry.item ? "Tâche" : "Mémo"}
              </p>
              <button onClick={() => setDetailEntry(null)}
                style={{ width: "30px", height: "30px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f9fafb", fontSize: "15px", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Contenu scrollable */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>

              {/* Titre éditable */}
              <div>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Intitulé</p>
                <input
                  defaultValue={detailEntry.item?.title ?? detailEntry.floating?.title}
                  onBlur={e => {
                    const val = e.target.value.trim();
                    if (!val) return;
                    if (detailEntry.item) updateItem(user.uid, detailEntry.item.id, { title: val });
                    else if (detailEntry.floating) updateFloatingTask(user.uid, detailEntry.floating.id, { title: val });
                  }}
                  style={{ width: "100%", fontSize: "16px", fontWeight: 600, color: "#111827", border: "1.5px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", boxSizing: "border-box" }}
                />
              </div>

              {/* Dossier d'origine (tâche) */}
              {detailEntry.item && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Dossier</p>
                  <p style={{ fontSize: "14px", color: "#374151" }}>
                    📁 {caseOf(detailEntry.item)}{parentOf(detailEntry.item) ? ` › ${parentOf(detailEntry.item)}` : ""}
                  </p>
                </div>
              )}

              {/* Étoile */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Important</p>
                <button onClick={() => {
                  if (detailEntry.item) updateItem(user.uid, detailEntry.item.id, { starred: !detailEntry.item.starred });
                  else if (detailEntry.floating) updateFloatingTask(user.uid, detailEntry.floating.id, { starred: !detailEntry.floating.starred });
                  setDetailEntry(prev => prev ? {
                    ...prev,
                    item: prev.item ? { ...prev.item, starred: !prev.item.starred } : undefined,
                    floating: prev.floating ? { ...prev.floating, starred: !prev.floating.starred } : undefined,
                  } : prev);
                }}
                  style={{ fontSize: "26px", background: "none", border: "none", cursor: "pointer", color: (detailEntry.item?.starred || detailEntry.floating?.starred) ? "#f59e0b" : "#d1d5db" }}>
                  ★
                </button>
              </div>

              {/* Statut — grille pour tâche, toggle pour mémo */}
              {detailEntry.item && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Statut</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {STATUSES.map(s => {
                      const isActive = detailEntry.item?.status === s;
                      const blocked = s === "Traité" && items.filter(i => i.parentItemId === detailEntry.item?.id && i.status !== "Traité").length > 0;
                      return (
                        <button key={s} onClick={() => { if (!blocked) handleStatusChange(detailEntry, s); }}
                          style={{ padding: "11px", borderRadius: "10px", border: isActive ? "2px solid #111827" : "1px solid #e5e7eb", background: isActive ? STATUS_COLORS[s] : "white", color: isActive ? STATUS_TEXT[s] : blocked ? "#d1d5db" : "#374151", fontSize: "13px", fontWeight: isActive ? 700 : 400, cursor: blocked ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: blocked ? 0.5 : 1 }}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  {items.filter(i => i.parentItemId === detailEntry.item?.id && i.status !== "Traité").length > 0 && (
                    <p style={{ fontSize: "11px", color: "#f59e0b", marginTop: "6px" }}>⚠ Des sous-tâches ne sont pas encore traitées</p>
                  )}
                </div>
              )}
              {detailEntry.floating && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Réalisé</p>
                  <button onClick={() => {
                    const done = detailEntry.floating?.status !== "Traité";
                    updateFloatingTask(user.uid, detailEntry.floating!.id, { status: done ? "Traité" : "Créée" });
                    setDetailEntry(prev => prev ? { ...prev, floating: { ...prev.floating!, status: done ? "Traité" : "Créée" } } : prev);
                  }}
                    style={{ width: "32px", height: "32px", borderRadius: "50%", border: detailEntry.floating?.status === "Traité" ? "none" : "2px solid #d1d5db", background: detailEntry.floating?.status === "Traité" ? "#16a34a" : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                    {detailEntry.floating?.status === "Traité" && (
                      <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {/* Échéance */}
              <div>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Échéance</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                  {[{ label: "Auj.", days: 0 }, { label: "Demain", days: 1 }, { label: "1 sem.", days: 7 }, { label: "1 mois", days: 30 }].map(({ label, days }) => {
                    const d = new Date(); d.setDate(d.getDate() + days); d.setHours(12, 0, 0, 0);
                    return (
                      <button key={label} onClick={() => {
                        if (detailEntry.item) updateItem(user.uid, detailEntry.item.id, { dueDate: d.toISOString() });
                        else if (detailEntry.floating) updateFloatingTask(user.uid, detailEntry.floating.id, { dueDate: d.toISOString(), dateKey: d.toISOString().slice(0, 10) <= todayKey ? todayKey : d.toISOString().slice(0, 10) });
                      }}
                        style={{ padding: "6px 12px", borderRadius: "20px", border: "1px solid #e5e7eb", background: "white", color: "#374151", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <input type="date"
                  value={(detailEntry.item?.dueDate ?? detailEntry.floating?.dueDate ?? "").slice(0, 10)}
                  onChange={e => {
                    if (!e.target.value) return;
                    const d = new Date(e.target.value + "T12:00:00");
                    if (detailEntry.item) updateItem(user.uid, detailEntry.item.id, { dueDate: d.toISOString() });
                    else if (detailEntry.floating) updateFloatingTask(user.uid, detailEntry.floating.id, { dueDate: d.toISOString(), dateKey: e.target.value <= todayKey ? todayKey : e.target.value });
                  }}
                  style={{ width: "100%", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box" }}
                />
                {(detailEntry.item?.dueDate || detailEntry.floating?.dueDate) && (
                  <button onClick={() => {
                    if (detailEntry.item) updateItem(user.uid, detailEntry.item.id, { dueDate: null });
                    else if (detailEntry.floating) updateFloatingTask(user.uid, detailEntry.floating.id, { dueDate: null });
                  }}
                    style={{ marginTop: "6px", fontSize: "12px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                    ✕ Supprimer l'échéance
                  </button>
                )}
              </div>

              {/* Observations (mémo) */}
              {detailEntry.floating && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Note</p>
                  <textarea
                    defaultValue={detailEntry.floating.note ?? ""}
                    onBlur={e => updateFloatingTask(user.uid, detailEntry.floating!.id, { note: e.target.value })}
                    placeholder="Ajouter une note…"
                    rows={3}
                    style={{ width: "100%", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", resize: "none", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box" }}
                  />
                </div>
              )}

              {/* Rattacher mémo à un dossier */}
              {detailEntry.floating && (
                <div>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Rattacher à un dossier</p>
                  <input
                    value={memoCaseSearch}
                    onChange={e => setMemoCaseSearch(e.target.value)}
                    placeholder="Rechercher un dossier…"
                    style={{ width: "100%", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box", marginBottom: "6px" }}
                  />
                  {memoCaseSearch.trim() && (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden", maxHeight: "160px", overflowY: "auto" }}>
                      {cases.filter(c => c.title.toLowerCase().includes(memoCaseSearch.toLowerCase())).slice(0, 6).map(c => (
                        <button key={c.id} onClick={async () => {
                          if (!detailEntry.floating) return;
                          const floating = detailEntry.floating;
                          setDetailEntry(null);
                          setMemoCaseSearch("");
                          const { createItem, addMyDaySelection, deleteFloatingTasks } = await import("@/lib/firestore");
                          const newItemId = await createItem(user.uid, { caseId: c.id, level: 2, title: floating.title, status: "Créée", parentItemId: null, dueDate: floating.dueDate ?? null });
                          await addMyDaySelection(user.uid, { refType: "item", refId: newItemId, dateKey: todayKey, selectionDate: null, dateTs: null }).catch(() => {});
                          await deleteFloatingTasks(user.uid, [floating.id]);
                        }}
                          style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: "white", border: "none", borderBottom: "1px solid #f3f4f6", fontSize: "13px", color: "#111827", cursor: "pointer", fontFamily: "inherit" }}>
                          📁 {c.title}
                        </button>
                      ))}
                      {cases.filter(c => c.title.toLowerCase().includes(memoCaseSearch.toLowerCase())).length === 0 && (
                        <p style={{ padding: "10px 14px", fontSize: "13px", color: "#9ca3af" }}>Aucun dossier trouvé</p>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Barre d'actions bas */}
            <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", gap: "8px", background: "#f9fafb" }}>
              {detailEntry.item && (
                <button onClick={() => { removeEntry(detailEntry); setDetailEntry(null); }}
                  style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #e5e7eb", background: "white", color: "#374151", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  Retirer de Ma journée
                </button>
              )}
              {detailEntry.floating && (
                <button onClick={() => { removeEntry(detailEntry); setDetailEntry(null); }}
                  style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #fca5a5", background: "#fff1f2", color: "#dc2626", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  🗑 Supprimer le mémo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

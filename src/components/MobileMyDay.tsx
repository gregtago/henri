"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
  deleteFloatingTasks,
  logStatusEvent,
} from "@/lib/firestore";
import type { Item, Case, FloatingTask, MyDaySelection, Status } from "@/lib/types";
import { getTodayKey } from "@/lib/dates";
import { getProgressLevel } from "@/lib/progress";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Icon } from "./Icon";
import { ReminderPicker } from "./ReminderPicker";

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
    const todayFloating = floatingTasks.filter(t => t.status !== "Traité" && t.dateKey != null && t.dateKey <= todayKey);
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
        status: "Créé",
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
        status: "Créé",
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
            {todayEntries.map(entry => {
              const title = entry.item?.title ?? entry.floating?.title ?? "";
              const status = entry.item?.status ?? null;
              const starred = Boolean(entry.item?.starred || entry.floating?.starred);
              const dueDate = entry.item?.dueDate ?? entry.floating?.dueDate ?? null;
              const isOverdue = dueDate && dueDate.slice(0, 10) < todayKey;
              const recurrence = entry.floating?.recurrence ?? null;

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

              return (
                <div key={entry.selectionId}
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
                  {/* Élément de gauche : rond complétion (mémo) ou croix retirer (tâche) */}
                  {entry.type === "floating" ? (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        const id = entry.selectionId;
                        if (completingIds.has(id)) return;
                        setCompletingIds(prev => new Set(prev).add(id));
                        playDone();
                        setTimeout(async () => {
                          if (entry.floating) await updateFloatingTask(user.uid, entry.floating.id, { status: "Traité" });
                          removeEntry(entry);
                          setCompletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
                        }, 350);
                      }}
                      style={{
                        width: "26px", height: "26px", borderRadius: "7px", flexShrink: 0, marginTop: "1px",
                        border: completingIds.has(entry.selectionId) ? "none" : "2px solid #9ca3af",
                        background: completingIds.has(entry.selectionId) ? "#16a34a" : "white",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s ease",
                      }}>
                      {completingIds.has(entry.selectionId) && (
                        <Icon name="check" size={16} strokeWidth={2.5} style={{ color: "white" }} />
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); removeEntry(entry); }}
                      style={{
                        width: "26px", height: "26px", borderRadius: "7px", border: "2px solid transparent",
                        background: "transparent", color: "#9ca3af", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px",
                      }}>
                      <Icon name="close" size={16} strokeWidth={1.75} />
                    </button>
                  )}

                  <div style={{ flex: 1, minWidth: 0, opacity: completingIds.has(entry.selectionId) ? 0.4 : 1, transition: "opacity 0.3s" }}>
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
                      {entry.item && (
                        <span style={{ fontSize: "11.5px", color: "#9ca3af", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {caseOf(entry.item)}{parentOf(entry.item) ? ` › ${parentOf(entry.item)}` : ""}
                        </span>
                      )}
                      {!entry.item && <span style={{ flex: 1 }} />}
                      {recurrence && (
                        <span style={{ color: "#9ca3af", flexShrink: 0, display: "inline-flex", alignItems: "center" }} title="Récurrent">
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

            {detailEntry.floating ? (
              /* ─── DÉTAIL MÉMO (post-it) ─── */
              <>
                {/* Header jaune */}
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fef9c3" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em" }}>Mémo</p>
                  <button onClick={() => setDetailEntry(null)}
                    style={{ width: "30px", height: "30px", border: "1px solid #fde68a", borderRadius: "8px", background: "rgba(255,255,255,0.7)", cursor: "pointer", color: "#92400e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {/* Zone post-it haute : titre (avec étoile) + échéance */}
                  <div style={{ background: "#fef9c3", borderBottom: "1px solid #fde68a", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Titre avec étoile à gauche */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button onClick={() => {
                        const newVal = !detailEntry.floating!.starred;
                        updateFloatingTask(user.uid, detailEntry.floating!.id, { starred: newVal });
                        setDetailEntry(prev => prev ? { ...prev, floating: { ...prev.floating!, starred: newVal } } : prev);
                      }}
                        style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0, color: detailEntry.floating.starred ? "#f59e0b" : "#d6a96b" }}
                        title={detailEntry.floating.starred ? "Retirer l'étoile" : "Marquer important"}>
                        <Icon name="star" size={24} filled={!!detailEntry.floating.starred} strokeWidth={1.75} />
                      </button>
                      <input
                        defaultValue={detailEntry.floating.title}
                        onBlur={e => {
                          const val = e.target.value.trim();
                          if (!val) return;
                          updateFloatingTask(user.uid, detailEntry.floating!.id, { title: val });
                        }}
                        placeholder="Sans titre"
                        style={{
                          flex: 1, minWidth: 0,
                          fontSize: "18px", fontWeight: 600, color: "#451a03",
                          background: "rgba(255,255,255,0.45)", border: "1px solid #fde68a", borderRadius: "8px",
                          padding: "8px 12px", outline: "none", fontFamily: "inherit",
                          lineHeight: 1.3,
                        }}
                      />
                    </div>

                    {/* Échéance avec calendrier à gauche */}
                    <div>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Échéance</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                        {[
                          { label: "Auj.", days: 0 },
                          { label: "Demain", days: 1 },
                          { label: "2 j.", days: 2 },
                          { label: "1 sem.", days: 7 },
                          { label: "1 mois", days: 30 },
                        ].map(({ label, days }) => {
                          const d = new Date(); d.setDate(d.getDate() + days); d.setHours(12, 0, 0, 0);
                          return (
                            <button key={label} onClick={() => {
                              const dk = d.toISOString().slice(0, 10) <= todayKey ? todayKey : d.toISOString().slice(0, 10);
                              updateFloatingTask(user.uid, detailEntry.floating!.id, { dueDate: d.toISOString(), dateKey: dk });
                              setDetailEntry(prev => prev ? { ...prev, floating: { ...prev.floating!, dueDate: d.toISOString(), dateKey: dk } } : prev);
                            }}
                              style={{ padding: "6px 12px", borderRadius: "20px", border: "1px solid #fde68a", background: "rgba(255,255,255,0.7)", color: "#92400e", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <button
                          type="button"
                          onClick={e => { const inp = (e.currentTarget.parentElement?.querySelector("input[type=date]") as any); if (inp?.showPicker) inp.showPicker(); else inp?.focus(); }}
                          style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0, color: "#92400e" }}
                          title="Ouvrir le calendrier">
                          <Icon name="calendar" size={20} />
                        </button>
                        <input type="date"
                          value={detailEntry.floating?.dueDate?.slice(0, 10) ?? ""}
                          onChange={e => {
                            if (!e.target.value) {
                              updateFloatingTask(user.uid, detailEntry.floating!.id, { dueDate: null });
                              setDetailEntry(prev => prev ? { ...prev, floating: { ...prev.floating!, dueDate: null } } : prev);
                              return;
                            }
                            const iso = new Date(e.target.value + "T12:00:00").toISOString();
                            const dk = e.target.value <= todayKey ? todayKey : e.target.value;
                            updateFloatingTask(user.uid, detailEntry.floating!.id, { dueDate: iso, dateKey: dk });
                            setDetailEntry(prev => prev ? { ...prev, floating: { ...prev.floating!, dueDate: iso, dateKey: dk } } : prev);
                          }}
                          style={{ flex: 1, fontSize: "14px", border: "1px solid #fde68a", borderRadius: "8px", padding: "8px 12px", outline: "none", fontFamily: "inherit", background: "rgba(255,255,255,0.85)", color: "#451a03", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    {/* Rappel push */}
                    <ReminderPicker
                      value={detailEntry.floating.reminderAt}
                      onChange={(iso) => {
                        updateFloatingTask(user.uid, detailEntry.floating!.id, { reminderAt: iso, reminderSentAt: null });
                        setDetailEntry(prev => prev ? { ...prev, floating: { ...prev.floating!, reminderAt: iso, reminderSentAt: null } } : prev);
                      }}
                      themeColor="#92400e"
                    />
                  </div>
                  <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Commentaires</p>
                      <textarea
                        defaultValue={detailEntry.floating.note ?? ""}
                        onBlur={e => updateFloatingTask(user.uid, detailEntry.floating!.id, { note: e.target.value })}
                        placeholder="Ajouter un commentaire…"
                        rows={3}
                        style={{ width: "100%", fontSize: "14px", border: "1.5px solid #d1d5db", borderRadius: "10px", padding: "10px 12px", resize: "none", outline: "none", fontFamily: "inherit", background: "white", color: "#374151", boxSizing: "border-box" }}
                      />
                    </div>

                    <div>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Rattacher à un dossier</p>
                      <input
                        value={memoCaseSearch}
                        onChange={e => setMemoCaseSearch(e.target.value)}
                        placeholder="Rechercher un dossier…"
                        style={{ width: "100%", fontSize: "14px", border: "1.5px solid #d1d5db", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "white", color: "#374151", boxSizing: "border-box", marginBottom: "6px" }}
                      />
                      {memoCaseSearch.trim() && (
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden", maxHeight: "160px", overflowY: "auto" }}>
                          {cases.filter(c => c.title.toLowerCase().includes(memoCaseSearch.toLowerCase())).slice(0, 6).map(c => (
                            <button key={c.id} onClick={async () => {
                              if (!detailEntry.floating) return;
                              const floating = detailEntry.floating;
                              setDetailEntry(null);
                              setMemoCaseSearch("");
                              const { createItem, addMyDaySelection, deleteFloatingTasks, createComment } = await import("@/lib/firestore");
                              const newItemId = await createItem(user.uid, {
                                caseId: c.id, level: 2, title: floating.title,
                                status: floating.status ?? "Créé",
                                starred: floating.starred ?? false,
                                parentItemId: null, dueDate: floating.dueDate ?? null,
                              });
                              if (floating.note && floating.note.trim().length > 0) {
                                try { await createComment(user.uid, { itemId: newItemId, body: floating.note, author: user.email ?? null }); }
                                catch (err) { console.warn("[Mobile attach] copie commentaire échouée", err); }
                              }
                              const memoDateKey = floating.dateKey && floating.dateKey > todayKey ? floating.dateKey : todayKey;
                              try {
                                const newSelectionId = await addMyDaySelection(user.uid, { refType: "item", refId: newItemId, dateKey: memoDateKey, selectionDate: null, dateTs: null });
                                setMyDaySelections(prev => [...prev, { id: newSelectionId, refType: "item", refId: newItemId, dateKey: memoDateKey }]);
                              } catch (err) { console.error("[Mobile attach] addMyDaySelection a échoué", err); }
                              await deleteFloatingTasks(user.uid, [floating.id]);
                            }}
                              style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: "white", border: "none", borderBottom: "1px solid #f3f4f6", fontSize: "13px", color: "#111827", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px" }}>
                              <Icon name="folder" size={14} />
                              {c.title}
                            </button>
                          ))}
                          {cases.filter(c => c.title.toLowerCase().includes(memoCaseSearch.toLowerCase())).length === 0 && (
                            <p style={{ padding: "10px 14px", fontSize: "13px", color: "#9ca3af" }}>Aucun dossier trouvé</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barre actions bas — fond blanc */}
                <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", gap: "8px", background: "white" }}>
                  <button onClick={() => { removeEntry(detailEntry); setDetailEntry(null); }}
                    style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #fca5a5", background: "#fff1f2", color: "#dc2626", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <Icon name="delete" size={14} /> Supprimer le mémo
                  </button>
                </div>
              </>
            ) : (
              /* ─── DÉTAIL TÂCHE ─── */
              <>
                {/* Header */}
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tâche</p>
                  <button onClick={() => setDetailEntry(null)}
                    style={{ width: "30px", height: "30px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f9fafb", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>

                {/* Contenu scrollable */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>

                  {/* Titre avec étoile à gauche */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button onClick={() => {
                      if (!detailEntry.item) return;
                      const newVal = !detailEntry.item.starred;
                      updateItem(user.uid, detailEntry.item.id, { starred: newVal });
                      setDetailEntry(prev => prev?.item ? { ...prev, item: { ...prev.item, starred: newVal } } : prev);
                    }}
                      style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0, color: detailEntry.item?.starred ? "#f59e0b" : "#d1d5db" }}
                      title={detailEntry.item?.starred ? "Retirer l'étoile" : "Marquer importante"}>
                      <Icon name="star" size={24} filled={!!detailEntry.item?.starred} strokeWidth={1.75} />
                    </button>
                    <input
                      defaultValue={detailEntry.item?.title ?? ""}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (!val) return;
                        if (detailEntry.item) updateItem(user.uid, detailEntry.item.id, { title: val });
                      }}
                      style={{ flex: 1, minWidth: 0, fontSize: "18px", fontWeight: 600, color: "#111827", border: "1.5px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", boxSizing: "border-box", lineHeight: 1.3 }}
                    />
                  </div>

                  {/* Statuts */}
                  {detailEntry.item && (() => {
                    const unfinishedSubs = items.filter(i => i.parentItemId === detailEntry.item!.id && i.status !== "Traité").length;
                    return (
                      <div>
                        <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Statut</p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {STATUSES.map(s => {
                            const isActive = detailEntry.item?.status === s;
                            const blocked = s === "Traité" && unfinishedSubs > 0;
                            return (
                              <button key={s} onClick={() => { if (!blocked) handleStatusChange(detailEntry, s); }}
                                style={{ padding: "11px", borderRadius: "10px", border: isActive ? "2px solid #111827" : "1px solid #e5e7eb", background: isActive ? STATUS_COLORS[s] : "white", color: isActive ? STATUS_TEXT[s] : blocked ? "#d1d5db" : "#374151", fontSize: "13px", fontWeight: isActive ? 700 : 400, cursor: blocked ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: blocked ? 0.5 : 1 }}>
                                {s}
                              </button>
                            );
                          })}
                        </div>
                        {unfinishedSubs > 0 && (
                          <p style={{ fontSize: "11px", color: "#f59e0b", marginTop: "8px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <Icon name="warning" size={11} /> {unfinishedSubs} sous-tâche{unfinishedSubs > 1 ? "s" : ""} non traitée{unfinishedSubs > 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Dossier */}
                  {detailEntry.item && (
                    <div>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Dossier</p>
                      <p style={{ fontSize: "14px", color: "#374151", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <Icon name="folder" size={14} />
                        {caseOf(detailEntry.item)}{parentOf(detailEntry.item) ? ` › ${parentOf(detailEntry.item)}` : ""}
                      </p>
                    </div>
                  )}

                  {/* Échéance avec calendrier à gauche */}
                  <div>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Échéance</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                      {[
                        { label: "Auj.", days: 0 },
                        { label: "Demain", days: 1 },
                        { label: "2 j.", days: 2 },
                        { label: "1 sem.", days: 7 },
                        { label: "1 mois", days: 30 },
                      ].map(({ label, days }) => {
                        const d = new Date(); d.setDate(d.getDate() + days); d.setHours(12, 0, 0, 0);
                        return (
                          <button key={label} onClick={() => {
                            if (detailEntry.item) {
                              const iso = d.toISOString();
                              updateItem(user.uid, detailEntry.item.id, { dueDate: iso });
                              setDetailEntry(prev => prev?.item ? { ...prev, item: { ...prev.item, dueDate: iso } } : prev);
                            }
                          }}
                            style={{ padding: "6px 12px", borderRadius: "20px", border: "1px solid #e5e7eb", background: "white", color: "#374151", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                            {label}
                          </button>
                        );
                      })}
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
                        value={(detailEntry.item?.dueDate ?? "").slice(0, 10)}
                        onChange={e => {
                          if (!e.target.value) {
                            if (detailEntry.item) {
                              updateItem(user.uid, detailEntry.item.id, { dueDate: null });
                              setDetailEntry(prev => prev?.item ? { ...prev, item: { ...prev.item, dueDate: null } } : prev);
                            }
                            return;
                          }
                          const iso = new Date(e.target.value + "T12:00:00").toISOString();
                          if (detailEntry.item) {
                            updateItem(user.uid, detailEntry.item.id, { dueDate: iso });
                            setDetailEntry(prev => prev?.item ? { ...prev, item: { ...prev.item, dueDate: iso } } : prev);
                          }
                        }}
                        style={{ flex: 1, fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 12px", outline: "none", fontFamily: "inherit", background: "#f9fafb", color: "#374151", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  {/* Rappel push */}
                  {detailEntry.item && (
                    <ReminderPicker
                      value={detailEntry.item.reminderAt}
                      onChange={(iso) => {
                        updateItem(user.uid, detailEntry.item!.id, { reminderAt: iso, reminderSentAt: null });
                        setDetailEntry(prev => prev?.item ? { ...prev, item: { ...prev.item, reminderAt: iso, reminderSentAt: null } } : prev);
                      }}
                    />
                  )}

                </div>

                {/* Barre d'actions bas */}
                <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 16px", background: "white" }}>
                  <button onClick={() => { removeEntry(detailEntry); setDetailEntry(null); }}
                    style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #e5e7eb", background: "white", color: "#374151", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <Icon name="myday" size={14} />
                    Retirer de Ma journée
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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

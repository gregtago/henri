"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSettings, applySettings, type UserSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Timestamp, addDoc, collection } from "firebase/firestore";
import {
  addMyDaySelection,
  createCase,
  convertItemToMemo,
  convertMemoToTask,
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
  exportItemsToJson,
  getItemsByCase,
  getSubItems,
  importCaseFromJson,
  importItemsIntoCase,
  logStatusEvent,
  queryMyDayByDate,
  subscribeCases,
  fetchProgressEvents,
  subscribeItemComments,
  subscribeItemEvents,
  subscribeFloatingTasks,
  subscribeItems,
  subscribeMyDaySelections,
  updateCase,
  updateFloatingTask,
  updateItem,
  updateItemProgress,
  subscribeCaseTemplates,
  createCaseTemplate,
  renameCaseTemplate,
  deleteCaseTemplate,
  buildTemplateItems,
  applyTemplateToCase,
  purgeExpiredMemos
} from "@/lib/firestore";
import { auth, db } from "@/lib/firebase";
import { seedOnboardingIfNeeded, seedExampleTemplateIfNeeded } from "@/lib/onboarding";
import {
  dateKeyToDate,
  formatDateFR,
  getDateKeyFromValue,
  getStartOfWindow,
  getTodayKey,
  atDueHour,
  getDueSuggestions,
  getWindowDateKeys,
  getYesterdayKey,
  toDate
} from "@/lib/dates";
import { getProgressLevel, getProgressStageLabel } from "@/lib/progress";
import {
  describeOpenChildren,
  getCaseLevelMemos,
  getCompletion,
  getContainerIds,
  getItemMemos
} from "@/lib/completion";
import { buildQuickMemo, listRecentlyDoneMemos } from "@/lib/memos";
import {
  isInstantToken,
  readToken,
  soleMatch,
  stripToken,
  suggestCases,
  suggestDues,
  suggestTasks,
} from "@/lib/memoTokens";
import { resolveDelai, latestLaunchDate } from "@/lib/delais";
import type { Case, CaseTemplate, Comment, Event, FloatingTask, Item, MyDaySelection, Status } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { RecurrencePicker } from "./RecurrencePicker";
import MemoDetail from "./MemoDetail";
import { Icon } from "./Icon";
import AccountMenu from "./AccountMenu";
import CaseTemplatesModal from "./CaseTemplatesModal";
import MemoComposer, { type MemoDraft } from "./MemoComposer";
import MemoSwitch from "./MemoSwitch";
import DueChips from "./DueChips";
import GuidedTour, { type TourStep } from "./GuidedTour";
import { EditableInput, EditableTextarea } from "./EditableField";
import { ReminderPicker } from "./ReminderPicker";
import { formatRecurrence } from "@/lib/recurrence";
import { useReminderPolicy, describeRepeat, dueReminderPatch } from "@/lib/reminderPolicy";

// Couleurs d'avancement (Créé, Demandé, Reçu, Traité), alignées sur les badges de statut.
const STATUS_COLORS = ["var(--s0-fg)", "var(--s1-fg)", "var(--s2-fg)", "var(--s3-fg)"];

// Étapes de la visite guidée (vue « bureau »).
const TOUR_STEPS: TourStep[] = [
  { title: "Bienvenue dans Henri 👋", body: "Une petite visite en quelques étapes. Vous pourrez la relancer à tout moment depuis Préférences → Aide." },
  { selector: '[data-tour="nav"]', title: "Deux espaces", body: "« Dossiers » regroupe tous vos dossiers et leurs tâches. « Ma journée » est votre plan de travail du jour, où vous extrayez les tâches à faire aujourd'hui." },
  { selector: '[data-tour="cases-actions"]', title: "Trier vos dossiers", body: "Le menu déroulant trie vos dossiers — par nom, échéance, ou « Charge restante » (qui remonte ceux où il reste le plus à faire)." },
  { selector: '[data-tour="cases-list"]', title: "Avancement en un coup d'œil", body: "Chaque dossier affiche 4 petits nombres colorés : le nombre de tâches et sous-tâches par statut — Créé, Demandé, Reçu, Traité." },
  { title: "Tâches & sous-tâches", body: "Sélectionnez un dossier pour afficher ses Tâches (niveau 2), puis une tâche pour ses Sous-tâches (niveau 3). Créez une tâche avec T, une sous-tâche avec Maj+T, un mémo avec M, un mémo sous la tâche sélectionnée avec Maj+M, et faites avancer le statut avec les touches 1 à 4." },
  { selector: '[data-tour="new-case"]', title: "Créer un dossier", body: "Le bouton + propose un dossier vierge ou un modèle. Un modèle d'exemple « Vente immobilière » est déjà intégré. Depuis un dossier, « Enregistrer comme modèle » crée le vôtre." },
  { selector: '[data-tour="import"]', title: "Import & export", body: "Depuis le détail d'un dossier, « Exporter » télécharge un fichier JSON ; « Importer » (ici) recrée un dossier depuis un fichier. Pratique pour dupliquer ou partager une trame." },
  { selector: '[data-tour="compte"]', title: "Votre compte, en un bouton", body: "Ce rond ouvre tout ce qui ne concerne pas le travail : activer les rappels sur cet appareil, installer l'application, les Préférences (apparence, aide, appareils, notes de version) et la déconnexion." },
  { title: "Raccourcis clavier", body: "Une lettre par nature : D dossier · T tâche · Maj+T sous-tâche · M mémo. Puis A : ajouter à Ma journée · 1 à 4 : changer le statut · ← → : naviguer entre colonnes · Suppr : supprimer. La liste complète est dans l'Aide." },
  { title: "C'est parti ! 🎯", body: "Vous êtes prêt. Bonne organisation ! Relancez cette visite quand vous voulez depuis Préférences → Aide." },
];

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
  | {
      // Un mémo rattaché, ouvert depuis la colonne Tâches de son dossier.
      type: "memo";
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
  // Réglages de relance (Préférences → Rappels) : servent de valeur par défaut
  // à l'interrupteur « Relancer tant que ce n'est pas fait ».
  const reminderPolicy = useReminderPolicy(user?.uid);
  const [cases, setCases] = useState<Case[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  // Les observations et l'historique de la tâche ouverte, et rien d'autre :
  // ces deux collections ne servent qu'au panneau de détail (voir plus bas
  // l'abonnement, ouvert à l'ouverture et refermé à la fermeture).
  const [detailComments, setDetailComments] = useState<Comment[]>([]);
  const [detailEvents, setDetailEvents] = useState<Event[]>([]);
  const [floatingTasks, setFloatingTasks] = useState<FloatingTask[]>([]);
  const [liveMyDaySelections, setLiveMyDaySelections] = useState<MyDaySelection[]>([]);
  const [legacyMyDaySelections, setLegacyMyDaySelections] = useState<MyDaySelection[]>([]);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set());
  const [completingFloatingIds, setCompletingFloatingIds] = useState<Set<string>>(new Set());
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [doneMemosExpanded, setDoneMemosExpanded] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"unknown" | "granted" | "denied" | "default" | "unsupported">("unknown");

  // Vérifier l'état des notifs au montage + rafraîchir le token si déjà accordé
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
      return;
    }
    setNotifStatus(Notification.permission as any);
    if (Notification.permission === "granted" && user) {
      import("@/lib/messaging").then(m => m.refreshPushToken(user.uid)).catch(() => {});
    }
  }, [user]);

  // Écouter les notifs reçues au premier plan → toast (Service Worker n'affiche
  // pas de notif quand l'onglet est actif, donc on affiche un toast custom)
  useEffect(() => {
    if (notifStatus !== "granted" || !user) return;
    let unsub: (() => void) | undefined;
    import("@/lib/messaging").then(m => {
      m.listenForegroundMessages(({ title, body }) => {
        showToast(`🔔 ${title ?? "Rappel"}${body ? ` — ${body}` : ""}`);
      }).then(fn => { unsub = fn; });
    });
    return () => { if (unsub) unsub(); };
  }, [notifStatus, user]);

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
  const [caseTemplates, setCaseTemplates] = useState<CaseTemplate[]>([]);
  const [templatesModal, setTemplatesModal] = useState<{ mode: "apply"; caseId: string } | { mode: "new" } | null>(null);
  const [caseActionMenu, setCaseActionMenu] = useState<"io" | "template" | null>(null);
  // Fenêtre de saisie d'un mémo. Contient le dossier pré-sélectionné, ou null
  // pour un mémo libre. `false` = fermée.
  const [memoComposer, setMemoComposer] = useState<{ caseId: string | null; parentItemId?: string | null } | null>(null);
  const [groupMyDay, setGroupMyDay] = useState(false);
  const [activeTour, setActiveTour] = useState<TourStep[] | null>(null);
  const [tourIsWalkthrough, setTourIsWalkthrough] = useState(false);
  const demoCaseIdRef = useRef<string | null>(null);
  const demoTaskIdRef = useRef<string | null>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
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
  // ── Saisie rapide d'un mémo dans Ma journée ──
  // Contrôlée, parce qu'elle lit ce qu'on tape : « # » un dossier, « @ » une
  // échéance, « > » une tâche, « ! » l'étoile (voir src/lib/memoTokens.ts). Ce
  // qui est retenu attend ici, en pastille, le temps qu'on écrive le mémo.
  const [myDayMemoText, setMyDayMemoText] = useState("");
  const [myDayMemoCaseId, setMyDayMemoCaseId] = useState<string | null>(null);
  const [myDayMemoParentId, setMyDayMemoParentId] = useState<string | null>(null);
  const [myDayMemoDue, setMyDayMemoDue] = useState<string | null>(null);
  const [myDayMemoStarred, setMyDayMemoStarred] = useState(false);
  const [myDayMemoCursor, setMyDayMemoCursor] = useState(0);
  const myDayMemoRef = useRef<HTMLInputElement | null>(null);
  const [dossierSearch, setDossierSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false); // "f-{id}" pour volante, selectionId pour dossier

  // ── MOBILE : colonne visible (slider horizontal) ──
  type MobileCol = "cases" | "items" | "subitems" | "detail";
  const [mobileCol, setMobileCol] = useState<MobileCol>("cases");
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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

  const [caseSortKey, setCaseSortKey] = useState<"title" | "createdAt" | "legalDueDate" | "progress">(settings.defaultSort);
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
    seedExampleTemplateIfNeeded(user.uid).catch(() => {});
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
    const unsubFloating = subscribeFloatingTasks(user.uid, setFloatingTasks);
    const unsubMyDay = subscribeMyDaySelections(user.uid, setLiveMyDaySelections, startOfWindow);
    const unsubTemplates = subscribeCaseTemplates(user.uid, setCaseTemplates);
    return () => {
      unsubCases();
      unsubItems();
      unsubFloating();
      unsubMyDay();
      unsubTemplates();
    };
  }, [user, startOfWindow]);

  // Observations et historique : lus à l'ouverture d'un détail, pas avant.
  //
  // Ils ne s'affichent que là, tâche par tâche. Les diffuser tous au démarrage
  // faisait attendre l'écran d'accueil pour un panneau encore fermé, et ces
  // deux collections sont celles qui grossissent sans fin — une observation
  // écrite reste, un changement de statut se journalise à chaque fois.
  const detailItemId = detailTarget?.type === "item" ? detailTarget.id : null;
  useEffect(() => {
    if (!user || !detailItemId) {
      setDetailComments([]);
      setDetailEvents([]);
      return;
    }
    const unsubComments = subscribeItemComments(user.uid, detailItemId, (list) =>
      setDetailComments(
        [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      )
    );
    const unsubEvents = subscribeItemEvents(user.uid, detailItemId, setDetailEvents);
    return () => {
      unsubComments();
      unsubEvents();
    };
  }, [user, detailItemId]);

  // Un mémo libre s'efface au bout de 7 jours (voir src/lib/memos.ts). La règle
  // est celle du modèle, pas celle d'un écran : on balaie ici aussi.
  const memosLoaded = floatingTasks.length > 0;
  useEffect(() => {
    if (!user || !memosLoaded) return;
    purgeExpiredMemos(user.uid, floatingTasks).catch(err =>
      console.warn("[AppShell] purge des mémos échouée", err)
    );
    // Au montage seulement : rejouer à chaque snapshot relancerait la
    // suppression en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, memosLoaded]);

  // ── Visite guidée & pas à pas ──
  const cleanupDemoCase = useCallback(async () => {
    if (user && demoCaseIdRef.current) {
      const id = demoCaseIdRef.current;
      demoCaseIdRef.current = null;
      demoTaskIdRef.current = null;
      await deleteCaseCascade(user.uid, id, itemsRef.current).catch(() => {});
    }
  }, [user]);

  const closeTour = useCallback(() => {
    if (tourIsWalkthrough) void cleanupDemoCase();
    setTourIsWalkthrough(false);
    setActiveTour(null);
  }, [tourIsWalkthrough, cleanupDemoCase]);

  const buildWalkthroughSteps = useCallback((): TourStep[] => [
    { title: "Pas à pas — Tâches & sous-tâches", body: "On va créer une tâche, une sous-tâche, puis tout supprimer, dans un dossier « 🎓 Entraînement » (retiré à la fin). Cliquez « Suivant » pour dérouler." },
    {
      selector: '[data-tour="cases-list"]', title: "1. Un dossier d'entraînement",
      body: "On ouvre un dossier d'entraînement. Pour de vrai, un dossier se crée avec le bouton + « Nouveau dossier » (ou la touche D).",
      action: async () => {
        if (!user) return;
        if (!demoCaseIdRef.current) {
          const id = await createCase(user.uid, { title: "🎓 Entraînement", legalDueDate: null, caseNote: "Dossier d'exercice — supprimé à la fin du pas à pas." });
          demoCaseIdRef.current = id;
        }
        setShowArchived(false);
        setSelectedCaseId(demoCaseIdRef.current);
        setSelectedCaseIds(demoCaseIdRef.current ? [demoCaseIdRef.current] : []);
        setSelectedItemId(null); setSelectedItemIds([]); setSelectedSubItemId(null); setSelectedSubItemIds([]);
        setActiveColumn("cases");
        setDetailTarget(demoCaseIdRef.current ? { type: "case", id: demoCaseIdRef.current } : null);
      },
    },
    {
      selector: '[data-tour="new-item"]', title: "2. Créer une tâche",
      body: "Une tâche se crée avec ce bouton + (colonne Tâches) ou la touche T. On en ajoute une : « Exemple : appeler le client ».",
      action: async () => {
        if (!user || !demoCaseIdRef.current) return;
        if (!demoTaskIdRef.current) {
          const id = await createItem(user.uid, { caseId: demoCaseIdRef.current, level: 2, title: "Exemple : appeler le client", status: "Créé", parentItemId: null });
          demoTaskIdRef.current = id;
        }
        setSelectedItemId(demoTaskIdRef.current);
        setSelectedItemIds(demoTaskIdRef.current ? [demoTaskIdRef.current] : []);
        setActiveColumn("items");
        setDetailTarget(demoTaskIdRef.current ? { type: "item", id: demoTaskIdRef.current } : null);
      },
    },
    {
      selector: '[data-tour="new-subitem"]', title: "3. Créer une sous-tâche",
      body: "Sélectionnez une tâche, puis ce bouton + (colonne Sous-tâches) ou Maj+T. On décompose : « Retrouver le numéro ».",
      action: async () => {
        if (!user || !demoCaseIdRef.current || !demoTaskIdRef.current) return;
        await createItem(user.uid, { caseId: demoCaseIdRef.current, parentItemId: demoTaskIdRef.current, level: 3, title: "Retrouver le numéro", status: "Créé" });
        setSelectedItemId(demoTaskIdRef.current);
        setActiveColumn("subitems");
      },
    },
    { title: "4. Faire avancer", body: "Sur une tâche sélectionnée, les touches 1 à 4 changent le statut (Créé → Demandé → Reçu → Traité), et l'étoile ★ marque l'importance." },
    {
      title: "5. Tout supprimer",
      body: "Pour supprimer : sélectionnez l'élément puis la touche Suppr, ou le bouton « Supprimer » du panneau de détail. On nettoie le dossier d'entraînement…",
      action: async () => {
        await cleanupDemoCase();
        setDetailTarget(null);
        setSelectedCaseId(null); setSelectedCaseIds([]);
        setSelectedItemId(null); setSelectedItemIds([]);
      },
    },
    { title: "Terminé ! 🎉", body: "Vous savez créer une tâche, une sous-tâche, et tout supprimer. Le dossier d'entraînement a été retiré." },
  ], [user, cleanupDemoCase]);

  // Lancement d'une visite / d'un pas à pas demandé depuis les Préférences (flag localStorage).
  const tourFlagChecked = useRef(false);
  useEffect(() => {
    if (!user || tourFlagChecked.current || typeof window === "undefined") return;
    tourFlagChecked.current = true;
    if (localStorage.getItem("henri:startTour") === "1") {
      localStorage.removeItem("henri:startTour");
      setActiveTour(TOUR_STEPS);
    } else if (localStorage.getItem("henri:startWalkthrough") === "1") {
      localStorage.removeItem("henri:startWalkthrough");
      setTourIsWalkthrough(true);
      setActiveTour(buildWalkthroughSteps());
    }
  }, [user, buildWalkthroughSteps]);

  // Préférence « grouper Ma journée par dossier » (partagée avec la vue mobile).
  useEffect(() => {
    try { setGroupMyDay(localStorage.getItem("henri:mydayGroup") === "1"); } catch {}
  }, []);
  const toggleGroupMyDay = () => setGroupMyDay(g => {
    const v = !g;
    try { localStorage.setItem("henri:mydayGroup", v ? "1" : "0"); } catch {}
    return v;
  });

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

  // Les tâches qui portent quelque chose : sous-tâches ou mémos. Ce sont des
  // contenants, pas des tâches — voir src/lib/completion.ts.
  const containerIds = useMemo(() => getContainerIds(items, floatingTasks), [items, floatingTasks]);

  // Décompte des tâches ET sous-tâches par statut, pour le mini-récap sur chaque
  // dossier et le tri par charge restante. Les contenants en sont exclus : leur
  // statut n'est que le résumé de ce qu'ils portent, et le compter reviendrait à
  // compter deux fois le même travail.
  const taskCountsByCase = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const it of items) {
      let arr = map.get(it.caseId);
      if (!arr) { arr = [0, 0, 0, 0]; map.set(it.caseId, arr); }
      if (containerIds.has(it.id)) continue;
      const idx = STATUSES.indexOf(it.status);
      if (idx >= 0) arr[idx]++;
    }
    return map;
  }, [items, containerIds]);

  // Score de « charge restante » d'un dossier : Créé=2, Demandé=1, Reçu=0,5, Traité=0.
  // Plus le score est élevé, plus il reste de travail.
  const caseWorkScore = (caseId: string) => {
    const c = taskCountsByCase.get(caseId);
    return c ? c[0] * 2 + c[1] * 1 + c[2] * 0.5 : 0;
  };

  const sortedCases = useMemo(() => {
    const direction = caseSortDirection === "asc" ? 1 : -1;
    const source = showArchived ? archivedCases : activeCases;
    return source
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        if (caseSortKey === "progress") {
          const result = caseWorkScore(a.entry.id) - caseWorkScore(b.entry.id);
          return result !== 0 ? result * direction : a.index - b.index;
        }
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
  }, [cases, caseSortDirection, caseSortKey, showArchived, activeCases, archivedCases, taskCountsByCase]);

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
  // Les mémos rattachés au dossier : même colonne que les tâches, mais après
  // elles et avec une case à cocher au lieu d'un statut. Ceux qui sont posés
  // sous une tâche descendent d'une colonne (voir `itemMemos`).
  const caseMemos = selectedCase
    ? sortByCreatedAt(getCaseLevelMemos(floatingTasks, selectedCase.id, items))
    : [];
  const selectedItem = items.find((entry) => entry.id === selectedItemId) || null;
  const subItems = selectedItem ? sortByCreatedAt(getSubItems(items, selectedItem.id)) : [];
  // Les mémos posés sous la tâche sélectionnée : colonne Sous-tâches, après les
  // sous-tâches. Sous une tâche, un mémo pèse ce que pèse une sous-tâche.
  const itemMemos = selectedItem ? sortByCreatedAt(getItemMemos(floatingTasks, selectedItem.id)) : [];
  const selectedSubItem = items.find((entry) => entry.id === selectedSubItemId) || null;

  const detailItem = detailTarget?.type === "item" ? items.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailCase = detailTarget?.type === "case" ? cases.find((entry) => entry.id === detailTarget.id) ?? null : null;
  const detailMemo = detailTarget?.type === "memo" ? floatingTasks.find((entry) => entry.id === detailTarget.id) ?? null : null;
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

  // Rattrapage de `lastProgressAt` sur les tâches antérieures à ce champ.
  //
  // L'historique se lit ici en **une fois**, et seulement s'il reste des tâches
  // à dater : un rattrapage exceptionnel ne justifie pas de diffuser tout
  // l'historique en permanence à l'écran d'accueil. Une fois l'affaire faite,
  // plus rien ne part.
  useEffect(() => {
    if (!user || items.length === 0) return;
    const missing = items.filter((item) => !item.lastProgressAt && !backfilledItemIds.current.has(item.id));
    if (missing.length === 0) return;
    let cancelled = false;
    const runBackfill = async () => {
      const progressEvents = await fetchProgressEvents(user.uid);
      if (cancelled) return;
      const latestEventByItem = new Map<string, Date>();
      progressEvents.forEach((eventEntry) => {
        const eventDate = toDate(eventEntry.createdAt);
        if (!eventDate) return;
        const current = latestEventByItem.get(eventEntry.itemId);
        if (!current || eventDate > current) {
          latestEventByItem.set(eventEntry.itemId, eventDate);
        }
      });
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
    runBackfill().catch((err) => console.warn("[AppShell] rattrapage lastProgressAt échoué", err));
    return () => {
      cancelled = true;
    };
  }, [items, user]);
  const reminderItems = items.filter((item) => {
    const dueKey = getDateKeyFromValue(item.dueDate);
    if (!dueKey || dueKey > todayKey) return false;
    // Exclure si déjà rappelé aujourd'hui
    const reminderKey = getDateKeyFromValue(item.lastReminderAt);
    return reminderKey !== todayKey;
  });
  const showDetailColumn = Boolean(detailTarget && (detailCase || detailItem || detailMemo));
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
    // `myDayDetailId` n'a de sens que dans Ma journée. Ailleurs (colonne
    // Tâches d'un dossier), la sélection appartient au finder — sans ce
    // garde-fou, un `myDayDetailId` resté d'une visite précédente écraserait
    // le détail ouvert au premier snapshot Firestore venu.
    if (!isMyDay) return;
    if (!myDayDetailId || myDayDetailId.startsWith("f-")) {
      setDetailTarget(null);
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

  // ── REPÈRES "Dans Ma journée" ─────────────────────────────────────────
  // Affichage d'un point jaune sur tâches/sous-tâches/dossiers qui ont une
  // sélection Ma journée *active*. Une sélection est active si :
  //  - sa date est aujourd'hui ou dans le futur (les sélections passées sont obsolètes)
  //  - la cible existe encore (pas supprimée)
  //  - la cible n'est pas Traité (terminée)
  const activeMyDaySelections = useMemo(() => {
    return myDaySelections.filter(sel => {
      if (sel.dateKey < todayKey) return false; // sélection passée
      if (sel.refType === "case") {
        // Vérifie que le dossier existe et n'est pas archivé
        const c = cases.find(cc => cc.id === sel.refId);
        return Boolean(c && !c.archived);
      }
      // item / subitem
      const it = items.find(i => i.id === sel.refId);
      if (!it) return false;          // orpheline
      if (it.status === "Traité") return false; // terminée
      return true;
    });
  }, [myDaySelections, items, cases, todayKey]);

  const myDayMarkerItemIds = useMemo(() => {
    const set = new Set<string>();
    activeMyDaySelections.forEach(sel => {
      if (sel.refType === "item" || sel.refType === "subitem") set.add(sel.refId);
    });
    return set;
  }, [activeMyDaySelections]);

  const myDayMarkerCaseIds = useMemo(() => {
    const set = new Set<string>();
    activeMyDaySelections.forEach(sel => {
      if (sel.refType === "case") {
        set.add(sel.refId);
      } else if (sel.refType === "item" || sel.refType === "subitem") {
        const it = items.find(i => i.id === sel.refId);
        if (it?.caseId) set.add(it.caseId);
      }
    });
    return set;
  }, [activeMyDaySelections, items]);

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
  // Un mémo réalisé quitte la journée : ce qui est fait n'a plus à l'occuper.
  // Il reste affiché le temps de l'animation de complétion, puis se retrouve
  // derrière le lien « réalisés » en bas de la colonne.
  const todayFloating = floatingTasks.filter(t =>
    t.status !== "Traité" &&
    t.dateKey != null && t.dateKey <= todayKey &&
    (!t.doneAt || completingFloatingIds.has(t.id))
  );

  // Les mémos réalisés récemment — ceux que le lien du bas rouvre.
  const doneMemos = useMemo(() => listRecentlyDoneMemos(floatingTasks), [floatingTasks]);

  // ── Les réglages d'un mémo, dits à la saisie ──
  // « # » un dossier, « @ » une échéance, « > » une tâche, « ! » l'étoile : le
  // caractère en tête de saisie ouvre la proposition, on en retient une, la
  // ligne repart à vide. La lecture de la saisie et l'ordre des propositions
  // vivent dans src/lib/memoTokens.ts, partagés avec mobile.
  const myDayMemoToken = readToken(myDayMemoText);
  const myDayMemoCase = myDayMemoCaseId
    ? cases.find(entry => entry.id === myDayMemoCaseId) ?? null
    : null;
  const myDayMemoParent = myDayMemoParentId
    ? items.find(entry => entry.id === myDayMemoParentId) ?? null
    : null;

  /** Retenir une proposition : la saisie repart à vide, le réglage attend au-dessus. */
  const takeMyDayMemo = (patch: {
    caseId?: string | null;
    parentItemId?: string | null;
    dueDate?: string | null;
  }) => {
    // Changer de dossier périme la tâche retenue : elle appartenait à l'autre.
    if (patch.caseId !== undefined && patch.caseId !== myDayMemoCaseId) setMyDayMemoParentId(null);
    if (patch.caseId !== undefined) setMyDayMemoCaseId(patch.caseId);
    if (patch.parentItemId !== undefined) setMyDayMemoParentId(patch.parentItemId);
    if (patch.dueDate !== undefined) setMyDayMemoDue(patch.dueDate);
    setMyDayMemoText("");
    setMyDayMemoCursor(0);
    myDayMemoRef.current?.focus();
  };

  // Les propositions du jeton ouvert, sous une seule forme : le rendu n'a plus à
  // savoir de quel jeton il s'agit.
  type MemoTokenRow = { key: string; label: string; meta?: string; take: () => void };
  const myDayMemoRows = useMemo<MemoTokenRow[]>(() => {
    if (!myDayMemoToken) return [];
    if (myDayMemoToken.kind === "case") {
      return suggestCases(cases, myDayMemoToken.query).map(entry => ({
        key: entry.id,
        label: entry.title,
        take: () => takeMyDayMemo({ caseId: entry.id }),
      }));
    }
    if (myDayMemoToken.kind === "due") {
      return suggestDues(myDayMemoToken.query).map(entry => ({
        key: entry.label,
        label: entry.label,
        meta: formatDateFR(entry.date.toISOString()),
        take: () => takeMyDayMemo({ dueDate: entry.date.toISOString() }),
      }));
    }
    if (myDayMemoToken.kind === "parent") {
      return suggestTasks(items, myDayMemoCaseId, myDayMemoToken.query).map(entry => ({
        key: entry.id,
        label: entry.title,
        take: () => takeMyDayMemo({ parentItemId: entry.id }),
      }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, items, myDayMemoCaseId, myDayMemoToken?.kind, myDayMemoToken?.query]);

  // Le curseur ne doit jamais désigner une ligne qui n'existe plus : la liste se
  // resserre à chaque lettre tapée.
  const myDayMemoIndex = myDayMemoRows.length === 0
    ? -1
    : Math.min(myDayMemoCursor, myDayMemoRows.length - 1);
  // Une seule proposition : la barre d'espace la retient (src/lib/memoTokens.ts).
  const myDayMemoSoleRow = soleMatch(myDayMemoRows);

  /**
   * Ce que dit la liste quand elle n'a rien à proposer — et ce que le clic fait
   * alors : retirer le jeton, pour écrire le mémo quand même.
   */
  const myDayMemoEmptyLabel = (() => {
    if (!myDayMemoToken) return "";
    const named = myDayMemoToken.query.length > 0;
    if (myDayMemoToken.kind === "parent") {
      if (!myDayMemoCaseId) return "Un mémo se pose sous une tâche de son dossier — commencez par « #dossier »";
      return named
        ? "Aucune tâche à ce nom dans ce dossier — écrire le mémo au niveau du dossier"
        : "Ce dossier n'a pas encore de tâche — écrire le mémo au niveau du dossier";
    }
    if (myDayMemoToken.kind === "due") return "Aucune proposition à ce nom — écrire le mémo sans échéance";
    return named
      ? "Aucun dossier à ce nom — écrire un mémo sans dossier"
      : "Aucun dossier ouvert — écrire un mémo sans dossier";
  })();

  /** Renoncer au jeton : le caractère tombe, ce qui restait devient le titre. */
  const dropMyDayMemoToken = () => {
    setMyDayMemoText(current => stripToken(current));
    setMyDayMemoCursor(0);
    myDayMemoRef.current?.focus();
  };

  /**
   * Lire la saisie. « ! » ne se choisit pas dans une liste : il se règle dès la
   * frappe et disparaît de la ligne.
   */
  const changeMyDayMemoText = (value: string) => {
    const token = readToken(value);
    if (isInstantToken(token)) {
      setMyDayMemoStarred(true);
      setMyDayMemoText(token!.query);
      setMyDayMemoCursor(0);
      return;
    }
    setMyDayMemoText(value);
    setMyDayMemoCursor(0);
  };

  /** Créer le mémo de la ligne de saisie, avec ce qu'elle a retenu. */
  const submitMyDayMemo = async () => {
    const title = myDayMemoText.trim();
    if (!title || !user) return;
    const draft = {
      title,
      caseId: myDayMemoParent?.caseId ?? myDayMemoCaseId,
      parentItemId: myDayMemoParentId,
      dueDate: myDayMemoDue,
      starred: myDayMemoStarred,
    };
    setMyDayMemoText("");
    setMyDayMemoCaseId(null);
    setMyDayMemoParentId(null);
    setMyDayMemoDue(null);
    setMyDayMemoStarred(false);
    await createFloatingTask(user.uid, buildQuickMemo(draft, { todayKey, policy: reminderPolicy }));
    showToast(
      myDayMemoParent ? `Mémo ajouté sous « ${myDayMemoParent.title} ».`
        : myDayMemoCase ? `Mémo ajouté au dossier « ${myDayMemoCase.title} ».`
        : "Mémo créé."
    );
  };

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
      done: boolean;   // mémo coché — vrai le temps de l'animation, puis la ligne sort
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
        done: !!task.doneAt,
        title: task.title,
        caseLabel: task.caseId ? (cases.find(c => c.id === task.caseId)?.title ?? "") : "",
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
      // Ce qui vient d'être coché descend, le temps de disparaître.
      if (a.done !== b.done) return a.done ? 1 : -1;
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

  // Ma journée regroupée par dossier (option). Sinon, ordre par priorité inchangé.
  const myDayDisplay = useMemo(() => {
    if (!groupMyDay) return myDayCombined.map(e => ({ entry: e, header: null as string | null }));
    const MEMO = "Sans dossier";
    const groups = new Map<string, typeof myDayCombined>();
    for (const e of myDayCombined) {
      const label = e.caseLabel || MEMO;
      const arr = groups.get(label) ?? [];
      arr.push(e);
      groups.set(label, arr);
    }
    const labels = [...groups.keys()].sort((a, b) => {
      if (a === MEMO) return 1;
      if (b === MEMO) return -1;
      return a.localeCompare(b, "fr");
    });
    const out: { entry: (typeof myDayCombined)[number]; header: string | null }[] = [];
    for (const label of labels) {
      groups.get(label)!.forEach((e, i) => out.push({ entry: e, header: i === 0 ? label : null }));
    }
    return out;
  }, [groupMyDay, myDayCombined]);

  // Liste "À venir" : mémos et tâches dont l'échéance est dans le futur, ré-utilisée
  // dans le bouton du header et dans le popover.
  type UpcomingEntry =
    | { kind: "floating"; id: string; title: string; dateKey: string }
    | { kind: "item"; id: string; title: string; dateKey: string; caseLabel: string };

  const upcoming = useMemo<UpcomingEntry[]>(() => {
    const upcomingFloating: UpcomingEntry[] = floatingTasks
      .filter(t => t.status !== "Traité" && !t.doneAt && t.dateKey && t.dateKey > todayKey)
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
    setMobileCol("items");
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
    // Mobile : sous-tâches si elles existent, sinon détail directement
    const hasSubs = items.some((entry) => entry.parentItemId === id);
    setMobileCol(hasSubs ? "subitems" : "detail");
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
    setMobileCol("detail");
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

  /** D — un dossier. */
  const handleCreateCase = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      showToast("Les dossiers se créent depuis la vue Dossiers.");
      return;
    }
    const id = await createCase(user.uid, { title: "Nouveau dossier", legalDueDate: null, caseNote: "" });
    setSelectedCaseId(id);
    setSelectedCaseIds([id]);
    setSelectedItemId(null);
    setSelectedSubItemId(null);
    setSelectedItemIds([]);
    setSelectedSubItemIds([]);
    setActiveColumn("cases");
    setDetailTarget({ type: "case", id });
    focusWhenReady(detailTitleRef);
  }, [isMyDay, user]);

  /**
   * T — une tâche dans le dossier courant. Depuis la colonne Sous-tâches, elle
   * se pose au même niveau que la sous-tâche sélectionnée (⇧T pour descendre
   * d'un cran, via handleCreateChildTask).
   */
  const handleCreateTask = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      showToast("Les tâches se créent depuis un dossier.");
      return;
    }
    if (resolvedActiveColumn === "subitems" && selectedItemId) {
      const parentCaseId = selectedItem?.caseId ?? selectedCaseId;
      if (!parentCaseId) { showToast("Sélectionnez un dossier d'abord."); return; }
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
    if (!selectedCaseId) {
      showToast("Sélectionnez un dossier d'abord.");
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
  }, [isMyDay, resolvedActiveColumn, selectedCaseId, selectedItem?.caseId, selectedItemId, user]);

  /**
   * M — ouvrir la fenêtre de saisie d'un mémo, pré-rattachée au dossier qu'on
   * regarde. Un mémo naît avec ses paramètres : le créer à l'aveugle obligeait
   * à le retrouver ensuite pour lui donner une échéance ou un rappel.
   */
  const handleOpenMemoComposer = useCallback(() => {
    // Le mémo naît là où on regarde : depuis la colonne Sous-tâches, il se pose
    // sous la tâche sélectionnée ; ailleurs, au niveau du dossier.
    const underItem = !isMyDay && resolvedActiveColumn === "subitems" ? selectedItemId : null;
    setMemoComposer({ caseId: isMyDay ? null : selectedCaseId, parentItemId: underItem });
  }, [isMyDay, resolvedActiveColumn, selectedCaseId, selectedItemId]);

  /**
   * ⇧M — un mémo sous la tâche sélectionnée, d'où qu'on le demande. Même
   * grammaire que ⇧T (la sous-tâche) : la majuscule descend d'un cran.
   */
  const handleOpenMemoComposerUnderItem = useCallback(() => {
    if (!selectedItemId) {
      showToast("Sélectionnez une tâche d'abord — ⇧M pose un mémo dessous.");
      return;
    }
    setMemoComposer({
      caseId: selectedItem?.caseId ?? selectedCaseId,
      parentItemId: selectedItemId,
    });
  }, [selectedCaseId, selectedItem?.caseId, selectedItemId]);

  // Conservé : les boutons « + » des en-têtes de colonne s'appuient dessus.
  const handleCreateInActiveColumn = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      // Dans Ma journée, le seul objet qu'on crée est un mémo : on ouvre sa
      // fenêtre de saisie plutôt que d'en poser un anonyme.
      handleOpenMemoComposer();
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
  }, [handleOpenMemoComposer, isMyDay, resolvedActiveColumn, selectedCaseId, selectedItem?.caseId, selectedItemId, user, todayKey]);

  const handleCreateMemoFromDraft = useCallback(async (draft: MemoDraft) => {
    if (!user) return;
    // Une échéance future sort le mémo de la journée du jour : il réapparaîtra
    // le bon jour, comme les tâches à venir.
    const dateKey = draft.dueDate ? getDateKeyFromValue(draft.dueDate) ?? todayKey : todayKey;
    // Un mémo posé sous une tâche appartient forcément au dossier de cette
    // tâche : le rattachement au dossier suit, sans quoi le mémo serait posé
    // quelque part sans être nulle part.
    const parentItem = draft.parentItemId ? items.find(i => i.id === draft.parentItemId) ?? null : null;
    await createFloatingTask(user.uid, {
      dateKey: dateKey > todayKey ? dateKey : todayKey,
      caseId: parentItem?.caseId ?? draft.caseId,
      parentItemId: parentItem?.id ?? null,
      title: draft.title,
      status: "Créé",
      starred: draft.starred,
      dueDate: draft.dueDate,
      reminderAt: draft.reminderAt,
      recurrence: draft.recurrence,
      note: draft.note,
    });
    setMemoComposer(null);
    showToast(
      parentItem ? `Mémo ajouté sous « ${parentItem.title} ».`
        : draft.caseId ? "Mémo ajouté au dossier."
        : "Mémo créé."
    );
  }, [items, todayKey, user]);

  const handleCreateChildTask = useCallback(async () => {
    if (!user) return;
    if (isMyDay) {
      handleOpenMemoComposer();
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
  }, [handleOpenMemoComposer, isMyDay, resolvedActiveColumn, selectedCaseId, selectedItem?.caseId, selectedItemId, user, todayKey]);

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
    // Un contenant n'a pas de statut à régler : il suit ce qu'il porte. Et ce
    // qu'il porte est la seule chose utile à dire ici.
    if (containerIds.has(detailItem.id)) {
      const blocking = describeOpenChildren(detailItem.id, items, floatingTasks);
      showToast(blocking
        ? `Son état suit ce qu'elle contient : ${blocking}`
        : "Son état suit ce qu'elle contient — et tout y est fait.");
      return;
    }
    await updateItemProgress(user.uid, detailItem.id, status);
    await logStatusEvent(user.uid, detailItem.id, detailItem.status, status);
    // Si la tâche est marquée Traité, supprimer toutes ses sélections Ma journée
    // pour éviter qu'elle continue à apparaître avec un point jaune
    if (status === "Traité") {
      const orphanSels = myDaySelections.filter(s =>
        (s.refType === "item" || s.refType === "subitem") && s.refId === detailItem.id
      );
      for (const sel of orphanSels) {
        setLegacyMyDaySelections(prev => prev.filter(x => x.id !== sel.id));
        deleteMyDaySelection(user.uid, sel.id).catch(() => {});
      }
    }
  };

  const handleMarkMyDayItemDone = async (item: Item, selectionId?: string) => {
    if (!user) return;
    const blocking = describeOpenChildren(item.id, items, floatingTasks);
    if (blocking) {
      showToast(blocking);
      return;
    }
    playDone();
    // L'échéance tombe avec le passage en « Traité » (updateItemProgress).
    await updateItemProgress(user.uid, item.id, "Traité");
    await logStatusEvent(user.uid, item.id, item.status, "Traité");
    if (selectionId) {
      await deleteMyDaySelection(user.uid, selectionId);
      setLegacyMyDaySelections(prev => prev.filter(s => s.id !== selectionId));
    }
    setMyDayDetailId(null);
  };

  /**
   * Cocher / décocher un mémo.
   *
   * Cocher ne supprime plus rien : on inscrit `doneAt` et le mémo reste en
   * place, barré. On doit pouvoir revoir ce qu'on a fait — et se déjuger d'un
   * clic si on a coché trop vite.
   */
  const handleToggleFloatingDone = async (task: FloatingTask) => {
    if (!user) return;
    const wasDone = !!task.doneAt;
    if (!wasDone) {
      // L'animation de complétion reste : c'est la récompense du geste.
      setCompletingFloatingIds(prev => new Set(prev).add(task.id));
      playDone();
      window.setTimeout(() => {
        setCompletingFloatingIds(prev => { const s = new Set(prev); s.delete(task.id); return s; });
      }, 350);
    }
    await updateFloatingTask(user.uid, task.id, { doneAt: wasDone ? null : new Date().toISOString() });
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
      // ── Famille de création : une lettre = une nature ──────────────────
      // D dossier · T tâche · ⇧T sous-tâche · M mémo.
      // On a abandonné le « N générique » qui créait un dossier, une tâche ou
      // un mémo selon la colonne active : il obligeait à savoir où on était.
      // Ici chaque lettre nomme ce qu'elle crée, et le fait au bon endroit.
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        if (event.shiftKey) {
          await handleCreateChildTask();
        } else {
          await handleCreateTask();
        }
        return;
      }
      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        await handleCreateCase();
        return;
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (event.shiftKey) {
          handleOpenMemoComposerUnderItem();
        } else {
          handleOpenMemoComposer();
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
      // Quatre statuts, quatre touches. « 5 » et « 6 » appelaient le changement
      // de statut avec `undefined` — un statut qui n'existe pas.
      if (event.key >= "1" && event.key <= String(STATUSES.length)) {
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
      handleCreateCase,
      handleCreateChildTask,
      handleCreateInActiveColumn,
      handleOpenMemoComposer,
      handleOpenMemoComposerUnderItem,
      handleCreateTask,
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

  const handleImportItemsIntoCase = async (caseId: string, file: File | null) => {
    if (!user || !file) return;
    const text = await file.text();
    try {
      await importItemsIntoCase(user.uid, caseId, text);
      showToast("Tâches importées.");
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  // ── Modèles de dossier ──
  const handleSaveCaseAsTemplate = async (caseData: Case) => {
    if (!user) return;
    const templateItems = buildTemplateItems(items, caseData.id);
    if (templateItems.length === 0) {
      showToast("Ce dossier n'a aucune tâche à enregistrer.");
      return;
    }
    const name = window.prompt("Nom du modèle :", caseData.title)?.trim();
    if (!name) return;
    await createCaseTemplate(user.uid, name, templateItems);
    showToast(`Modèle « ${name} » enregistré (${templateItems.length} tâche${templateItems.length > 1 ? "s" : ""}).`);
  };

  const handleApplyTemplateToCase = async (template: CaseTemplate, caseId: string) => {
    if (!user) return;
    await applyTemplateToCase(user.uid, caseId, template.items);
    setTemplatesModal(null);
    setDetailTarget({ type: "case", id: caseId });
    showToast(`Modèle « ${template.name} » appliqué.`);
  };

  const handleCreateCaseFromTemplate = async (template: CaseTemplate) => {
    if (!user) return;
    const id = await createCase(user.uid, { title: template.name, legalDueDate: null, caseNote: "" });
    await applyTemplateToCase(user.uid, id, template.items);
    setTemplatesModal(null);
    setSelectedCaseId(id);
    setSelectedCaseIds([id]);
    setSelectedItemId(null);
    setSelectedSubItemId(null);
    setSelectedItemIds([]);
    setSelectedSubItemIds([]);
    setActiveColumn("cases");
    setDetailTarget({ type: "case", id });
    focusWhenReady(detailCaseRef);
    showToast(`Dossier créé depuis « ${template.name} ».`);
  };

  const handleCreateBlankCase = async () => {
    if (!user) return;
    setTemplatesModal(null);
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
  };

  const handleRenameTemplate = async (template: CaseTemplate) => {
    if (!user) return;
    const name = window.prompt("Renommer le modèle :", template.name)?.trim();
    if (!name || name === template.name) return;
    await renameCaseTemplate(user.uid, template.id, name);
  };

  const handleDeleteTemplate = async (template: CaseTemplate) => {
    if (!user) return;
    if (!window.confirm(`Supprimer le modèle « ${template.name} » ? (Les dossiers déjà créés ne sont pas affectés.)`)) return;
    await deleteCaseTemplate(user.uid, template.id);
  };

  const handleExportSelectedItems = () => {
    if (selectedItemIds.length === 0) return;
    const selectedSet = new Set(selectedItemIds);
    // Inclure les tâches cochées + les sous-tâches des tâches de niveau 2
    // sélectionnées, pour conserver la hiérarchie à la réimportation.
    const toExport = items.filter(
      (it) => selectedSet.has(it.id) || (it.parentItemId ? selectedSet.has(it.parentItemId) : false)
    );
    const json = exportItemsToJson(toExport);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `taches-${todayKey}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${toExport.length} tâche(s) exportée(s).`);
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
    const task = floatingTasks.find(entry => entry.id === taskId) ?? null;
    const dueDateKey = dueDate ? dueDate.toISOString().slice(0, 10) : null;
    const isFuture = dueDateKey && dueDateKey > todayKey;
    const iso = dueDate ? dueDate.toISOString() : null;
    await updateFloatingTask(user.uid, taskId, {
      dueDate: iso,
      // Si échéance future, sortir de Ma journée actuelle et programmer pour le bon jour
      ...(isFuture ? { dateKey: dueDateKey } : { dateKey: todayKey }),
      // …et proposer le rappel du jour de l'échéance.
      ...dueReminderPatch({
        previousDue: task?.dueDate ?? null,
        nextDue: iso,
        currentReminder: task?.reminderAt ?? null,
        policy: reminderPolicy,
      }),
    });
  };

  /**
   * Transformer une tâche en mémo. La tâche perd son cycle de statut et gagne
   * une case à cocher ; elle ne bouge pas pour autant — même dossier, et même
   * tâche parente si c'était une sous-tâche. Ses commentaires sont recopiés
   * dans la note du mémo.
   */
  const handleConvertToMemo = async (item: Item) => {
    if (!user) return;
    const result = await convertItemToMemo(user.uid, item);
    if (!result.ok) { showToast(result.reason); return; }
    // Le mémo tout juste né reste ouvert sous les yeux — dans Ma journée, le
    // détail se pilote par `myDayDetailId` (préfixe « f- » pour un mémo) ;
    // ailleurs, par `detailTarget`.
    if (isMyDay) setMyDayDetailId(`f-${result.id}`);
    else { setMyDayDetailId(null); setDetailTarget({ type: "memo", id: result.id }); }
    showToast("Devenue un mémo — elle se coche, elle ne se traite plus.");
  };

  /**
   * L'inverse : un mémo redevient une tâche, avec ses quatre statuts. Il
   * reprend sa place — le dossier, et la tâche sous laquelle il était posé
   * (il en devient alors une sous-tâche). Sa note redevient un commentaire.
   *
   * Un mémo libre ne peut pas devenir une tâche : une tâche appartient à un
   * dossier, c'est ce qui la distingue d'un pense-bête.
   */
  const handleConvertToTask = async (memo: FloatingTask) => {
    if (!user) return;
    const result = await convertMemoToTask(user.uid, memo);
    if (!result.ok) { showToast(result.reason); return; }
    if (memo.parentItemId) {
      setSelectedItemId(memo.parentItemId);
      setSelectedSubItemId(result.id);
    } else {
      setSelectedItemId(result.id);
    }
    // Même raison que pour la bascule inverse : le détail de la tâche née se
    // pilote par `myDayDetailId` dans Ma journée, par `detailTarget` ailleurs.
    if (isMyDay) setMyDayDetailId(result.id);
    else setDetailTarget({ type: "item", id: result.id });
    showToast("Redevenue une tâche — elle se traite, elle ne se coche plus.");
  };

  /**
   * Rattacher / détacher un mémo. Aucune conversion : c'est le même objet,
   * il gagne ou perd son dossier. Rattaché, il apparaît dans la colonne
   * Tâches du dossier ; libre, il ne vit que dans Ma journée.
   *
   * Changer de dossier repose forcément le mémo au niveau du dossier : la tâche
   * sous laquelle il était posé appartient à l'ancien dossier, l'y laisser
   * accroché n'aurait plus de sens.
   */
  const handleAttachFloating = async (task: FloatingTask, caseId: string | null) => {
    if (!user) return;
    await updateFloatingTask(user.uid, task.id, { caseId, parentItemId: null });
    showToast(caseId ? "Mémo rattaché au dossier." : "Mémo détaché.");
  };

  /**
   * Poser un mémo sous une tâche, ou le remonter au niveau du dossier.
   * Le mémo suit le dossier de la tâche : on ne peut pas être sous une tâche
   * d'un dossier et rattaché à un autre.
   */
  const handleAttachFloatingToItem = async (task: FloatingTask, itemId: string | null) => {
    if (!user) return;
    const parent = itemId ? items.find(i => i.id === itemId) ?? null : null;
    if (itemId && !parent) return;
    await updateFloatingTask(user.uid, task.id, {
      parentItemId: parent?.id ?? null,
      ...(parent ? { caseId: parent.caseId } : {}),
    });
    showToast(parent ? `Mémo posé sous « ${parent.title} ».` : "Mémo remonté au dossier.");
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

  // Un mémo ouvert depuis la colonne Tâches de son dossier : même détail que
  // dans Ma journée, puisque c'est le même objet.
  const memoDetailPanel = showDetailColumn && detailMemo ? (
    <section className="finder-detail" style={{ boxShadow: "-3px 0 12px rgba(0,0,0,0.06)" }}>
      <MemoDetail
        task={detailMemo}
        cases={cases}
        items={items}
        onPatch={patch => user && updateFloatingTask(user.uid, detailMemo.id, patch)}
        onDueDate={date => handleFloatingDueDate(detailMemo.id, date)}
        onAttach={caseId => handleAttachFloating(detailMemo, caseId)}
        onAttachToItem={itemId => handleAttachFloatingToItem(detailMemo, itemId)}
        onConvertToTask={() => handleConvertToTask(detailMemo)}
        onToggleDone={() => handleToggleFloatingDone(detailMemo)}
        onDelete={() => {
          if (user) deleteFloatingTasks(user.uid, [detailMemo.id]);
          setDetailTarget(null);
        }}
        defaultRepeat={reminderPolicy.repeatEnabled}
        repeatLabel={describeRepeat(reminderPolicy)}
        dueReminderHour={reminderPolicy.dueReminderHour}
      />
    </section>
  ) : null;

  /**
   * Une ligne de mémo dans une colonne — celle du dossier comme celle des
   * sous-tâches. Un seul rendu, parce que c'est un seul objet : où qu'il soit
   * posé, un mémo se coche de la même façon et s'ouvre dans le même détail.
   */
  const renderMemoRow = (memo: FloatingTask, column: "items" | "subitems") => {
    const done = !!memo.doneAt;
    return (
      <div
        key={memo.id}
        className="finder-row"
        data-active={detailTarget?.type === "memo" && detailTarget.id === memo.id ? "true" : undefined}
        style={{ opacity: done ? 0.45 : 1 }}
        onClick={() => { setActiveColumn(column); setDetailTarget({ type: "memo", id: memo.id }); }}
      >
        <button
          className="shrink-0 cursor-pointer flex items-center justify-center transition-all duration-200"
          onClick={e => { e.stopPropagation(); handleToggleFloatingDone(memo); }}
          title={done ? `Fait le ${formatDateFR(memo.doneAt)} — cliquer pour décocher` : "Marquer réalisé"}
          style={{
            width: "20px", height: "20px", borderRadius: "6px",
            border: done ? "none" : "2px solid #9ca3af",
            background: done ? "#16a34a" : "white",
          }}
        >
          {done && <Icon name="check" size={13} className="text-white" strokeWidth={2.5} />}
        </button>
        <div className="flex-1 min-w-0">
          <p
            className="text-[15px] text-tx truncate leading-snug"
            style={done ? { textDecoration: "line-through" } : undefined}
          >{memo.title}</p>
          <p className="text-[12.5px] text-tx-3 mt-0.5 truncate min-h-[1.25rem]">
            {done ? `Fait le ${formatDateFR(memo.doneAt)}` : memo.dueDate ? `Éch. ${formatDateFR(memo.dueDate)}` : ""}
          </p>
        </div>
      </div>
    );
  };

  /**
   * Ce qu'affiche une tâche à droite de son titre : son statut si c'en est une,
   * son avancement (« 2/5 ») si c'est un contenant. Un contenant n'a pas de
   * statut à lui — il a ce qu'il reste à faire dedans.
   */
  const renderItemBadge = (item: Item) => {
    if (!containerIds.has(item.id)) {
      return <span className={statusClass(item.status)}>{item.status}</span>;
    }
    const { done, total } = getCompletion(item.id, items, floatingTasks);
    const finished = done === total;
    return (
      <span
        className="shrink-0 text-[11.5px] font-medium tabular-nums px-2 py-0.5 rounded-full border"
        style={finished
          ? { background: "#dcfce7", borderColor: "#86efac", color: "#166534" }
          : { background: "var(--bg-subtle)", borderColor: "var(--border)", color: "var(--tx-3)" }}
        title={finished
          ? "Tout ce que porte cette tâche est fait."
          : `${done} sur ${total} terminé${done > 1 ? "s" : ""} — sous-tâches et mémos`}
      >
        {done}/{total}
      </span>
    );
  };

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
            <EditableInput
              key={detailCase.id}
              ref={detailCaseRef}
              className="detail-title-input"
              value={detailCase.title}
              onCommit={(next) => updateCase(user.uid, detailCase.id, { title: next })}
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
                <div className="mb-2">
                  <DueChips
                    long
                    value={detailCase.legalDueDate ?? null}
                    onPick={date => updateCase(user.uid, detailCase.id, { legalDueDate: date.toISOString() })}
                    onClear={() => updateCase(user.uid, detailCase.id, { legalDueDate: null })}
                  />
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
                      updateCase(user.uid, detailCase.id, { legalDueDate: atDueHour(new Date(y, m-1, d)).toISOString() });
                    }}
                  />
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Note */}
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Note</p>
                <EditableTextarea
                  key={detailCase.id}
                  className="font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-2 outline-none w-full resize-none focus:border-border-strong transition-colors"
                  rows={4}
                  value={detailCase.caseNote ?? ""}
                  onCommit={(next) => updateCase(user.uid, detailCase.id, { caseNote: next })}
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
            {/* Case à cocher, étoile, titre — la case est grisée : une tâche ne
              * s'accomplit pas d'un geste, elle avance par statuts. Elle est là
              * quand même, à la place exacte qu'elle occupe sur un mémo, pour
              * qu'on voie ce que l'interrupteur « Mémo » échange. */}
            <div className="flex items-center gap-3 mb-5">
              <span
                title="Une tâche ne se coche pas : elle avance par statuts. Allumez « Mémo » pour la cocher."
                className="shrink-0 block"
                style={{
                  width: "22px", height: "22px", borderRadius: "6px",
                  border: "2px solid #e5e7eb", background: "var(--bg-subtle)",
                  cursor: "default",
                }}
              />
              <button
                title={detailItem.starred ? "Retirer l'étoile" : "Marquer importante"}
                onClick={() => updateItem(user.uid, detailItem.id, { starred: !detailItem.starred })}
                className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-all hover:scale-110"
                style={{ color: detailItem.starred ? "#f59e0b" : "#d1d5db" }}
              >
                <Icon name="star" size={26} filled={!!detailItem.starred} strokeWidth={1.75} />
              </button>
              <EditableInput
                key={detailItem.id}
                ref={detailTitleRef}
                className="detail-title-input"
                style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
                value={detailItem.title}
                onCommit={(next) => updateItem(user.uid, detailItem.id, { title: next })}
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
              {/* Statuts + retirer de Ma journée — un contenant n'a pas de
                * cycle : il affiche ce qu'il reste à faire dedans. */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {containerIds.has(detailItem.id) ? (() => {
                  const { done, total } = getCompletion(detailItem.id, items, floatingTasks);
                  const finished = done === total;
                  return (
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span
                        className="text-[13px] font-medium tabular-nums px-4 py-1.5 rounded-full border"
                        style={finished
                          ? { background: "#dcfce7", borderColor: "#86efac", color: "#166534" }
                          : { background: "var(--bg-subtle)", borderColor: "var(--border)", color: "var(--tx-2)" }}
                      >
                        {finished ? `Terminé · ${done}/${total}` : `${done}/${total} terminé${done > 1 ? "s" : ""}`}
                      </span>
                      <span className="text-[11.5px] text-tx-3 leading-snug">
                        Cette tâche contient ; son état suit ce qu'elle porte.
                      </span>
                    </div>
                  );
                })() : (
                  <>
                    {STATUSES.map(s => (
                      <button key={s} onClick={() => handleStatusChange(s)}
                        className={`${statusClass(s)} cursor-pointer border-none transition-all text-[13px] px-4 py-1.5 rounded-full ${detailItem.status === s ? "opacity-100" : "opacity-25 hover:opacity-60"}`}>
                        {s}
                      </button>
                    ))}
                    {/* La nature se décide ici, à côté des statuts : allumer
                      * l'interrupteur les fait disparaître, et la tâche devient
                      * un mémo qu'on coche. */}
                    <MemoSwitch on={false} onChange={() => handleConvertToMemo(detailItem)} />
                  </>
                )}
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
                    if (iso && latestSubDue && iso < latestSubDue) {
                      showToast("Échéance impossible : une sous-tâche a une échéance plus tardive.");
                      return;
                    }
                    updateItem(user.uid, detailItem.id, {
                      dueDate: iso,
                      // Poser une échéance propose le rappel du jour même.
                      ...dueReminderPatch({
                        previousDue: detailItem.dueDate ?? null,
                        nextDue: iso,
                        currentReminder: detailItem.reminderAt ?? null,
                        policy: reminderPolicy,
                      }),
                    });
                  };

                  return (
                    <>
                      {latestSubDue && (
                        <p className="text-[11px] text-tx-3 mb-2">
                          ⚠ Doit être au plus tôt le {new Date(latestSubDue).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} (échéance de la sous-tâche la plus tardive)
                        </p>
                      )}
                      <div className="mb-2">
                        <DueChips
                          value={detailItem.dueDate ?? null}
                          onPick={date => handleSetDue(date.toISOString())}
                          onClear={() => handleSetDue(null)}
                        />
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
                            handleSetDue(atDueHour(new Date(y, m-1, d)).toISOString());
                          }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Délai de retour — combien de temps la pièce met à revenir.
                * Toujours visible, jamais bloquant : Henri propose une estimation
                * déduite du libellé, le notaire la corrige d'un clic. C'est ce
                * chiffre qui donne la date de lancement dans la vue Calendrier. */}
              <div>
                {(() => {
                  const delai = resolveDelai(detailItem);
                  const due = toDate(detailItem.dueDate ?? null)
                    ?? toDate(cases.find(c => c.id === detailItem.caseId)?.legalDueDate ?? null);
                  const launch = due ? latestLaunchDate(due, delai.days) : null;
                  const setDelai = (days: number | null) =>
                    updateItem(user.uid, detailItem.id, { delaiDays: days });

                  return (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">Délai de retour</p>
                        <span className="text-[10px] text-tx-3">
                          {delai.source === "manual" ? "fixé à la main"
                            : delai.source === "rule" ? `estimé — ${delai.label.toLowerCase()}`
                            : "estimation par défaut"}
                        </span>
                        {delai.source === "manual" && (
                          <button
                            onClick={() => setDelai(null)}
                            className="ml-auto text-[10px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer hover:text-tx transition-colors"
                            title="Revenir à l'estimation d'Henri"
                          >Réinitialiser</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center mb-2">
                        {[7, 10, 15, 21, 30, 60].map(days => (
                          <button key={days} onClick={() => setDelai(days)}
                            className={`text-[11px] font-[inherit] px-2 py-1 rounded border cursor-pointer transition-colors ${
                              delai.days === days
                                ? "border-border-strong bg-bg-active text-tx"
                                : "border-border bg-bg-subtle text-tx-2 hover:border-border-strong hover:text-tx"
                            }`}>
                            {days} j
                          </button>
                        ))}
                        <input
                          key={detailItem.id + "-delai"}
                          type="number" min={1} max={365} inputMode="numeric"
                          className="w-[64px] font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-2 py-1 outline-none focus:border-border-strong transition-colors"
                          defaultValue={delai.days}
                          onBlur={(e) => {
                            const parsed = Number(e.target.value);
                            if (parsed > 0 && parsed <= 365 && parsed !== delai.days) setDelai(parsed);
                          }}
                          aria-label="Délai de retour en jours"
                        />
                      </div>
                      <p className="text-[11px] text-tx-3">
                        {launch
                          ? <>Pour tenir l&apos;échéance du {formatDateFR(due)}, la demande doit partir <strong className="font-medium text-tx-2">le {formatDateFR(launch)}</strong>.</>
                          : "Sans échéance, ce délai sert à dater le retour attendu une fois la pièce demandée."}
                      </p>
                    </>
                  );
                })()}
              </div>

              {/* Rappel push */}
              <div>
                <ReminderPicker
                  value={detailItem.reminderAt}
                  onChange={iso => updateItem(user.uid, detailItem.id, { reminderAt: iso, reminderSentAt: null, reminderCount: 0 })}
                  repeat={detailItem.reminderRepeat}
                  onRepeatChange={v => updateItem(user.uid, detailItem.id, { reminderRepeat: v })}
                  defaultRepeat={reminderPolicy.repeatEnabled}
                  repeatLabel={describeRepeat(reminderPolicy)}
                  dueDate={detailItem.dueDate ?? null}
                  dueReminderHour={reminderPolicy.dueReminderHour}
                />
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

              {/* Répétition — grisée : une tâche ne revient pas toute seule,
                * elle se traite une fois. Elle est là quand même, à la place
                * qu'elle occupe sur un mémo, pour que l'interrupteur « Mémo »
                * ne fasse apparaître ni disparaître aucune section. */}
              <div
                style={{ opacity: 0.4, pointerEvents: "none" }}
                aria-disabled
                title="Une tâche ne se répète pas : elle se traite une fois. Allumez « Mémo » pour la faire revenir."
              >
                <RecurrencePicker value={null} onChange={() => {}} />
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
            {/* Export / Import (menu) */}
            <div className="detail-menu-wrap">
              <button className="detail-action-btn" onClick={() => setCaseActionMenu(m => m === "io" ? null : "io")} title="Exporter le dossier, ou importer des tâches">
                <span>⇅</span> Export / Import <span style={{ opacity: 0.45 }}>▾</span>
              </button>
              {caseActionMenu === "io" && (
                <>
                  <div className="detail-menu-backdrop" onClick={() => setCaseActionMenu(null)} />
                  <div className="detail-menu">
                    <button className="detail-menu-item" onClick={() => { setCaseActionMenu(null); handleExport(detailCase); }}>
                      <span>↓</span> Exporter le dossier
                    </button>
                    <label className="detail-menu-item">
                      <span>↑</span> Importer des tâches
                      <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                        setCaseActionMenu(null);
                        await handleImportItemsIntoCase(detailCase.id, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }} />
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* Modèle (menu) */}
            <div className="detail-menu-wrap">
              <button className="detail-action-btn" onClick={() => setCaseActionMenu(m => m === "template" ? null : "template")} title="Enregistrer ce dossier comme modèle, ou appliquer un modèle">
                <span>📋</span> Modèle <span style={{ opacity: 0.45 }}>▾</span>
              </button>
              {caseActionMenu === "template" && (
                <>
                  <div className="detail-menu-backdrop" onClick={() => setCaseActionMenu(null)} />
                  <div className="detail-menu">
                    <button className="detail-menu-item" onClick={() => { setCaseActionMenu(null); handleSaveCaseAsTemplate(detailCase); }}>
                      <span>📋</span> Enregistrer comme modèle
                    </button>
                    <button className="detail-menu-item" onClick={() => { setCaseActionMenu(null); setTemplatesModal({ mode: "apply", caseId: detailCase.id }); }}>
                      <span>＋</span> Appliquer un modèle
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="detail-action-btn mobile-hide" onClick={() => handleArchiveCase(detailCase.id, !detailCase.archived)}>
              <span>{detailCase.archived ? "↩" : "📦"}</span> {detailCase.archived ? "Restaurer" : "Archiver"}
            </button>
            {detailCase.archived && (
              <button className="detail-action-btn detail-action-danger" onClick={() => {
                if (window.confirm("Supprimer définitivement ce dossier et toutes ses tâches ? Cette action est irréversible.")) {
                  deleteCaseCascade(user.uid, detailCase.id, items, floatingTasks).then(() => {
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
            {/* Devenir un mémo n'est plus un bouton perdu ici : c'est
              * l'interrupteur « Mémo », à côté des statuts. */}
            <button className="detail-action-btn detail-action-danger" onClick={handleDelete}>
              <span>✕</span> Supprimer
            </button>
          </>
        )}
      </div>

    </section>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE — slider, swipe, fil d'Ariane (vue Dossiers)
  // ─────────────────────────────────────────────────────────────────────────

  // Colonnes réellement présentes dans le slider, dans l'ordre
  const mobileAllCols: MobileCol[] = ["cases", "items", "subitems", "detail"];
  const mobileColVisible: Record<MobileCol, boolean> = {
    cases: showCasesColumn,
    items: showItemsColumn,
    subitems: showSubItemsColumn,
    detail: showDetailColumn,
  };
  const mobileVisibleCols = mobileAllCols.filter((k) => mobileColVisible[k]);

  // Position du slider = index de mobileCol parmi les colonnes visibles.
  // Si la colonne demandée est absente, on retombe sur la dernière visible avant elle.
  const mobileSliderPos = (() => {
    const idx = mobileVisibleCols.indexOf(mobileCol);
    if (idx >= 0) return idx;
    const targetOrder = mobileAllCols.indexOf(mobileCol);
    let best = 0;
    mobileVisibleCols.forEach((k, i) => {
      if (mobileAllCols.indexOf(k) < targetOrder) best = i;
    });
    return best;
  })();

  const mobileSliderStyle = { transform: `translateX(-${mobileSliderPos * 100}vw)` };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dy) > Math.abs(dx)) return; // geste vertical → on ignore
    if (Math.abs(dx) < 50) return;
    if (dx < 0) {
      // Swipe gauche → colonne suivante
      if (mobileSliderPos < mobileVisibleCols.length - 1) setMobileCol(mobileVisibleCols[mobileSliderPos + 1]);
    } else {
      // Swipe droite → colonne précédente
      if (mobileSliderPos > 0) setMobileCol(mobileVisibleCols[mobileSliderPos - 1]);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── HEADER ── */}
      <header className="h-[48px] md:h-[44px] flex items-center px-[16px] border-b border-border bg-bg shrink-0 z-10 relative">
        {/* Mobile : ☀ Ma journée + logo — à gauche (valeurs en px fixes pour matcher MobileMyDay) */}
        <div className="md:hidden flex items-center gap-[10px] z-10">
          <Link
            href="/my-day"
            className="w-[32px] h-[32px] flex items-center justify-center rounded-full border border-border bg-bg-subtle text-tx-2 hover:bg-bg-hover"
            style={{ textDecoration: "none" }}
            title="Ma journée"
            aria-label="Ma journée"
          >
            <Icon name="myday" size={16} />
          </Link>
          <img src="/logo-henri-new.png" alt="Henri" style={{ height: "24px", width: "auto" }} />
        </div>
        {/* Liens navigation — gauche (desktop uniquement) */}
        <nav data-tour="nav" className="hidden md:flex gap-0.5 z-10">
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
          <Link
            href="/calendrier"
            className="text-[13px] px-2.5 py-1 rounded border-none bg-transparent cursor-pointer transition-all text-tx-2 hover:bg-bg-hover hover:text-tx"
          >
            Calendrier
          </Link>
        </nav>

        {/* Logo — centré absolument (desktop uniquement) */}
        <div className="hidden md:flex absolute left-0 right-0 justify-center pointer-events-none">
          <Link href="/" className="pointer-events-auto">
            <img src="/logo-henri.png" alt="Henri" style={{height:"36px", width:"auto"}} />
          </Link>
        </div>

        {/* Actions — droite */}
        <div className="flex items-center gap-2.5 text-[12px] text-tx-3 ml-auto z-10">
          <AccountMenu
            uid={user.uid}
            email={user.email}
            onNotice={showToast}
            onNotifStatusChange={setNotifStatus}
          />
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
        <div
          className="flex flex-col flex-1 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >

          {/* ── COLONNES (desktop : flex row ; mobile : slider horizontal) ── */}
          <div className="flex flex-1 overflow-hidden">
            <div className="finder-mobile-slider" style={mobileSliderStyle}>

          {/* ── COL DOSSIERS ── */}
          {showCasesColumn && (
            <div className="finder-column">
              <div className="finder-header">
                <span>{showArchived ? "Dossiers archivés" : "Dossiers"}</span>
                <div data-tour="cases-actions" className="flex items-center gap-1">
                  <select
                    className="text-[12.5px] font-[inherit] bg-transparent border-none text-tx-2 cursor-pointer outline-none pr-1 hover:text-tx transition-colors"
                    value={caseSortKey}
                    onChange={(e) => setCaseSortKey(e.target.value as "title" | "createdAt" | "legalDueDate" | "progress")}
                    title="Trier par"
                  >
                    <option value="title">Nom</option>
                    <option value="createdAt">Ancienneté</option>
                    <option value="legalDueDate">Échéance</option>
                    <option value="progress">Charge restante</option>
                  </select>
                  <button
                    className={iconBtn}
                    onClick={() => setCaseSortDirection(p => p === "asc" ? "desc" : "asc")}
                    title={caseSortDirection === "asc" ? "Ordre croissant — cliquer pour inverser" : "Ordre décroissant — cliquer pour inverser"}
                  >
                    <Icon name={caseSortDirection === "asc" ? "chevron-up" : "chevron-down"} size={14} strokeWidth={2} />
                  </button>
                  <button data-tour="new-case" className={iconBtn} title="Nouveau dossier — vierge ou depuis un modèle (N)" onClick={() => setTemplatesModal({ mode: "new" })}>
                    <Icon name="myday" size={14} className="hidden" />
                    <span className="text-[18px] leading-none">+</span>
                  </button>
                </div>
              </div>

              <div className="finder-list" ref={casesListRef} data-tour="cases-list">
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
                      <div className="flex items-center justify-between gap-2 mt-0.5 min-h-[1.25rem]">
                        <p className="text-[12.5px] text-tx-3 truncate">
                          {entry.legalDueDate ? (
                            <>Éch. <span className={new Date(entry.legalDueDate) < new Date() ? "text-red-500" : ""}>{formatDateFR(entry.legalDueDate)}</span></>
                          ) : null}
                        </p>
                        {(() => {
                          const c = taskCountsByCase.get(entry.id);
                          const total = c ? c[0] + c[1] + c[2] + c[3] : 0;
                          if (!c || total === 0) return null;
                          return (
                            <span className="flex items-center gap-1 shrink-0 tabular-nums" title="Tâches et sous-tâches par statut — Créé · Demandé · Reçu · Traité">
                              {c.map((n, i) => (
                                <span key={i} style={{ color: STATUS_COLORS[i], fontSize: "10px", fontWeight: 700, lineHeight: 1, opacity: n === 0 ? 0.35 : 1 }}>{n}</span>
                              ))}
                            </span>
                          );
                        })()}
                      </div>
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

              {/* Pied de colonne : Archivés + Importer (côte à côte) — masqué sur mobile */}
              <div className="border-t border-border px-3 py-2 flex items-center gap-1.5 mobile-hide">
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
                <label data-tour="import" className="flex-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-[inherit] px-2.5 py-1.5 rounded border bg-transparent text-tx-2 border-border hover:border-border-strong hover:text-tx cursor-pointer transition-colors"
                  title="Importer un dossier depuis un fichier JSON">
                  <Icon name="import" size={14} />
                  <span>Importer</span>
                  <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !user) return;
                    const text = await file.text();
                    try {
                      await importCaseFromJson(user.uid, text);
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
                  <button className={iconBtn} title="Nouveau mémo (M) — une chose à cocher" onClick={() => { if (!selectedCaseId) { showToast("Sélectionnez un dossier d'abord."); return; } setMemoComposer({ caseId: selectedCaseId }); }}>
                    <span className="text-[13px] leading-none">☑</span>
                  </button>
                  <button data-tour="new-item" className={iconBtn} title="Nouvelle tâche (T)" onClick={async () => { setActiveColumn("items"); if (!user || !selectedCaseId) { showToast("Sélectionnez un dossier d'abord."); return; } const id = await createItem(user.uid, { caseId: selectedCaseId, level: 2, title: "Nouvelle tâche", status: "Créé", parentItemId: null }); setSelectedItemId(id); setSelectedItemIds([id]); setDetailTarget({ type: "item", id }); focusWhenReady(detailTitleRef); }}>
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
                  <button className={btnGhost} onClick={handleExportSelectedItems}>Exporter</button>
                  <button className={btnDanger} onClick={handleDelete}>Supprimer</button>
                  <button
                    className="text-[14px] text-tx-3 bg-transparent border-none cursor-pointer ml-auto"
                    onClick={() => { setSelectedItemIds([]); setSelectionModeItems(false); }}
                  >Annuler</button>
                </div>
              )}

              <div className="finder-list" ref={itemsListRef}>
                {itemsColumnItems.map((entry) => {
                  // « En retard » se compte en jours, pas en heures : une
                  // échéance posée aujourd'hui (à 9 h) ne doit pas virer au
                  // rouge à 9 h 01.
                  const dueKey = getDateKeyFromValue(entry.dueDate);
                  const isOverdue = !!dueKey && dueKey < todayKey && getProgressLevel(entry.status) !== 3;
                  const isDueToday = dueKey === todayKey && !isOverdue;
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
                          <>Éch. <span className={dueKey && dueKey < todayKey ? "text-red-500" : ""}>{formatDateFR(entry.dueDate)}</span></>
                        ) : (
                          (() => {
                            const subCount = getSubItems(items, entry.id).length;
                            const memoCount = getItemMemos(floatingTasks, entry.id).length;
                            const parts = [
                              subCount > 0 ? `${subCount} sous-tâche${subCount > 1 ? "s" : ""}` : null,
                              memoCount > 0 ? `${memoCount} mémo${memoCount > 1 ? "s" : ""}` : null,
                            ].filter(Boolean);
                            return parts.length > 0 ? parts.join(" · ") : null;
                          })()
                        )}
                      </p>
                    </div>
                    {renderItemBadge(entry)}
                  </div>
                  );
                })}

                {caseMemos.length > 0 && (
                  <>
                    <div className="px-[14px] pt-3 pb-1 text-[10px] font-medium text-tx-3 uppercase tracking-widest">
                      Mémos
                    </div>
                    {caseMemos.map((memo) => renderMemoRow(memo, "items"))}
                  </>
                )}
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
                  <button className={iconBtn} title="Nouveau mémo sous cette tâche (M) — une chose à cocher" onClick={() => { setActiveColumn("subitems"); if (!selectedItemId) { showToast("Sélectionnez une tâche d'abord."); return; } setMemoComposer({ caseId: selectedItem?.caseId ?? selectedCaseId, parentItemId: selectedItemId }); }}>
                    <span className="text-[13px] leading-none">☑</span>
                  </button>
                  <button data-tour="new-subitem" className={iconBtn} title="Nouvelle sous-tâche (⇧T)" onClick={async () => { setActiveColumn("subitems"); if (!user || !selectedItemId) { showToast("Sélectionnez une tâche d'abord."); return; } const parentCaseId = selectedItem?.caseId ?? selectedCaseId; if (!parentCaseId) return; const id = await createItem(user.uid, { caseId: parentCaseId, parentItemId: selectedItemId, level: 3, title: "Nouvelle sous-tâche", status: "Créé" }); setSelectedSubItemId(id); setSelectedSubItemIds([id]); setActiveColumn("subitems"); setDetailTarget({ type: "item", id }); focusWhenReady(detailTitleRef); }}>
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

                {/* Les mémos posés sous la tâche : mêmes voisins que les
                  * sous-tâches, parce qu'ils pèsent la même chose. */}
                {itemMemos.length > 0 && (
                  <>
                    <div className="px-[14px] pt-3 pb-1 text-[10px] font-medium text-tx-3 uppercase tracking-widest">
                      Mémos
                    </div>
                    {itemMemos.map((memo) => renderMemoRow(memo, "subitems"))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── PANNEAU DÉTAIL ── (tâche, dossier… ou mémo) */}
          {memoDetailPanel ?? detailPanel}

          {/* Spacer pour coller la bande à droite si pas de détail (desktop) */}
          {!showDetailColumn && <div className="flex-1 hidden md:block" />}

            </div>{/* fin .finder-mobile-slider */}

            {/* ── BANDE "MA JOURNÉE" à droite (desktop ; masquée sur mobile via CSS) ── */}
            {settings.sideTabs && (
              <Link href="/my-day" className="side-tab side-tab-myday" title="Aller à Ma journée">
                <div className="side-tab-inner">
                  <span className="side-tab-label">Ma journée</span>
                </div>
              </Link>
            )}
          </div>{/* fin wrapper colonnes */}

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
                <button
                  onClick={toggleGroupMyDay}
                  className={`inline-flex items-center gap-1 text-[11px] font-[inherit] font-medium px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${groupMyDay ? "bg-tx text-bg border-tx" : "bg-transparent text-tx-2 border-border hover:border-border-strong hover:text-tx"}`}
                  title="Grouper Ma journée par dossier"
                >
                  <Icon name="folder" size={12} /> Dossier
                </button>
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
                    className="absolute right-2 top-full mt-1 w-[420px] max-h-[480px] overflow-y-auto bg-white border border-border-strong rounded-lg z-20"
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
                            className="flex items-center gap-3 py-2 px-2.5 rounded hover:bg-bg-subtle cursor-pointer"
                            onClick={() => {
                              if (entry.kind === "floating") {
                                setMyDayDetailId(myDayDetailId === `f-${entry.id}` ? null : `f-${entry.id}`);
                              } else {
                                setMyDayDetailId(myDayDetailId === entry.id ? null : entry.id);
                              }
                              setUpcomingExpanded(false);
                            }}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] text-tx truncate leading-snug">{entry.title}</p>
                              {entry.kind === "item" && entry.caseLabel && (
                                <p className="text-[12px] text-tx-3 truncate mt-0.5">{entry.caseLabel}</p>
                              )}
                            </div>
                            <span className="text-[12px] text-tx-3 shrink-0">{dayLabel}</span>
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
                  {myDayDisplay.map(({ entry, header }) => {
                    const statusColor = {"Créé":"#d1d5db","Demandé":"#fbbf24","Reçu":"#60a5fa","Traité":"#34d399"}[entry.status as string] ?? "#d1d5db";
                    const isCompletingRow = entry.kind === "floating" && !!entry.floatingId && completingFloatingIds.has(entry.floatingId);
                    const isFloatingDone = entry.kind === "floating" && !!floatingTasks.find(t => t.id === entry.floatingId)?.doneAt;
                    return (
                      <React.Fragment key={entry.key}>
                      {header && (
                        <div className="sticky top-0 z-[1] bg-bg px-3 pt-2.5 pb-1 text-[10px] font-semibold text-tx-3 uppercase tracking-wide flex items-center gap-1.5">
                          <Icon name="folder" size={11} /> {header}
                        </div>
                      )}
                      <div className="finder-row group"
                        data-active={myDayDetailId === entry.key ? "true" : undefined}
                        style={{
                          borderLeft: "none",
                          boxShadow: entry.kind === "floating" ? "none" : `inset 3px 0 0 ${statusColor}`,
                          background: entry.starred ? "rgba(251,191,36,0.10)" : undefined,
                          // Un mémo fait reste visible — estompé, jamais supprimé.
                          opacity: isCompletingRow || isFloatingDone ? 0.45 : 1,
                          transition: "opacity 0.3s ease",
                          alignItems: "flex-start",
                          paddingTop: "8px",
                        }}
                        onClick={() => setMyDayDetailId(myDayDetailId === entry.key ? null : entry.key)}>

                        {/* Élément de gauche : rond pour mémo, croix pour tâche — alignés sur le titre */}
                        {entry.kind === "floating" ? (
                          (() => {
                            const floating = floatingTasks.find(t => t.id === entry.floatingId);
                            const isCompleting = completingFloatingIds.has(entry.floatingId!);
                            const done = !!floating?.doneAt;
                            const filled = done || isCompleting;
                            return (
                              <button
                                className="shrink-0 cursor-pointer transition-all duration-200 flex items-center justify-center"
                                onClick={e => { e.stopPropagation(); if (floating) handleToggleFloatingDone(floating); }}
                                title={done ? `Fait le ${formatDateFR(floating?.doneAt)} — cliquer pour décocher` : "Marquer réalisé"}
                                style={{
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "6px",
                                  border: filled ? "none" : "2px solid #9ca3af",
                                  background: filled ? "#16a34a" : "white",
                                  transform: isCompleting ? "scale(1.1)" : "scale(1)",
                                  marginTop: "1px",
                                }}
                              >
                                {filled && <Icon name="check" size={14} className="text-white" strokeWidth={2.5} />}
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
                            <p
                              className={`text-[15px] text-tx truncate leading-snug flex-1 min-w-0 ${entry.starred ? "font-medium" : ""}`}
                              style={isFloatingDone ? { textDecoration: "line-through" } : undefined}
                            >{entry.title}</p>
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
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Mémos réalisés ── Ce qui est fait sort de la liste, mais
                 doit rester à portée de clic : on doit pouvoir revoir sa
                 journée, et se déjuger si on a coché trop vite. */}
            {doneMemos.length > 0 && (
              <div className="border-t border-border bg-bg px-3 py-2 relative">
                <button
                  onClick={() => setDoneMemosExpanded(p => !p)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer hover:text-tx transition-colors p-0"
                >
                  <Icon name="check" size={13} strokeWidth={2} />
                  {doneMemos.length} mémo{doneMemos.length > 1 ? "s" : ""} réalisé{doneMemos.length > 1 ? "s" : ""}
                </button>

                {doneMemosExpanded && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDoneMemosExpanded(false)} />
                    <div
                      className="absolute left-2 right-2 bottom-full mb-1 max-h-[360px] overflow-y-auto bg-white border border-border-strong rounded-lg z-20"
                      style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.12)" }}
                    >
                      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                        <span className="text-[10px] font-medium text-tx-3 uppercase tracking-wide">Réalisés · {doneMemos.length}</span>
                        <button
                          onClick={() => setDoneMemosExpanded(false)}
                          className="border-none bg-transparent cursor-pointer text-tx-3 hover:text-tx p-0 leading-none"
                          title="Fermer"
                        ><Icon name="close" size={14} /></button>
                      </div>
                      <div className="px-2 py-1">
                        {doneMemos.map(memo => (
                          <div key={memo.id}
                            className="flex items-center gap-3 py-2 px-2.5 rounded hover:bg-bg-subtle cursor-pointer"
                            onClick={() => { setMyDayDetailId(`f-${memo.id}`); setDoneMemosExpanded(false); }}>
                            <button
                              className="shrink-0 cursor-pointer flex items-center justify-center"
                              onClick={e => { e.stopPropagation(); handleToggleFloatingDone(memo); }}
                              title="Remettre à faire"
                              style={{ width: "18px", height: "18px", borderRadius: "5px", border: "none", background: "#16a34a" }}
                            ><Icon name="check" size={12} className="text-white" strokeWidth={2.5} /></button>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] text-tx-3 truncate leading-snug line-through">{memo.title}</p>
                            </div>
                            <span className="text-[12px] text-tx-3 shrink-0">{formatDateFR(memo.doneAt)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="px-3 py-2 text-[11px] text-tx-3 border-t border-border leading-snug">
                        Un mémo sans dossier s'efface définitivement 7 jours après avoir été réalisé.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Saisie mémo en bas ──
                 Un mémo se tape en une ligne, réglages compris : « # » un
                 dossier, « @ » une échéance, « > » une tâche du dossier, « ! »
                 l'étoile. Chaque jeton retenu se consomme et va s'afficher en
                 pastille ; la ligne repart à vide pour le suivant, puis pour le
                 titre. Ce que la ligne crée reste un mémo — une chose qu'on
                 coche —, rattaché ou non.
                 Le clavier suffit de bout en bout : ↑↓ choisir, Entrée ou —
                 quand une seule proposition répond — Espace retenir, Échap
                 renoncer sans perdre ce qui est écrit. */}
            <div className="border-t border-border bg-bg p-3 relative">
              {/* Les propositions du jeton ouvert — au-dessus de la saisie,
                   comme le popover des mémos réalisés : la ligne ne bouge pas. */}
              {myDayMemoToken && !isInstantToken(myDayMemoToken) && (
                <>
                  <div className="fixed inset-0 z-10" onClick={dropMyDayMemoToken} />
                  <div
                    className="absolute left-3 right-3 bottom-full mb-1 max-h-[320px] overflow-y-auto bg-white border border-border-strong rounded-lg z-20"
                    style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.12)" }}
                  >
                    <div className="px-3 py-2 border-b border-border">
                      <span className="text-[10px] font-medium text-tx-3 uppercase tracking-wide">
                        {myDayMemoToken.query
                          ? `${myDayMemoToken.hint} « ${myDayMemoToken.query} »`
                          : `${myDayMemoToken.hint} du mémo`}
                      </span>
                    </div>
                    {myDayMemoRows.length > 0 ? (
                      <div className="px-2 py-1">
                        {myDayMemoRows.map((row, index) => (
                          <div
                            key={row.key}
                            className={`flex items-center gap-2 py-2 px-2.5 rounded cursor-pointer ${index === myDayMemoIndex ? "bg-bg-hover" : "hover:bg-bg-subtle"}`}
                            onMouseEnter={() => setMyDayMemoCursor(index)}
                            onClick={row.take}
                          >
                            <Icon name={myDayMemoToken.kind === "due" ? "calendar" : myDayMemoToken.kind === "parent" ? "arrow-right" : "folder"} size={13} className="shrink-0 text-tx-3" />
                            <p className="text-[14px] text-tx truncate flex-1 min-w-0">{row.label}</p>
                            {row.meta && <span className="text-[12px] text-tx-3 shrink-0">{row.meta}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={dropMyDayMemoToken}
                        className="w-full text-left font-[inherit] text-[13px] text-tx-2 bg-transparent border-none cursor-pointer px-3 py-2.5 hover:bg-bg-subtle transition-colors"
                      >
                        {myDayMemoEmptyLabel}
                      </button>
                    )}
                    <p className="px-3 py-2 text-[11px] text-tx-3 border-t border-border leading-snug">
                      {myDayMemoSoleRow ? (
                        <>
                          <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">Espace</kbd> ou{" "}
                          <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">Entrée</kbd> retenir ·{" "}
                        </>
                      ) : (
                        <>
                          <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">↑↓</kbd> choisir ·{" "}
                          <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">Entrée</kbd> retenir ·{" "}
                        </>
                      )}
                      <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">Échap</kbd> renoncer
                    </p>
                  </div>
                </>
              )}

              {/* Au-dessus du voile : la ligne de saisie reste vivante pendant
                   qu'on choisit — on tape la suite sans rien fermer. */}
              <div className="relative z-20">
                {/* Ce que la ligne a retenu, le temps qu'on écrive le mémo. */}
                {(myDayMemoCase || myDayMemoParent || myDayMemoDue || myDayMemoStarred) && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    {myDayMemoCase && (
                      <span className="inline-flex items-center gap-1.5 max-w-full bg-bg-subtle border border-border rounded px-1.5 py-0.5 text-[12px] text-tx-2">
                        <Icon name="folder" size={11} className="shrink-0" />
                        <span className="truncate">{myDayMemoCase.title}</span>
                        <button
                          onClick={() => { setMyDayMemoCaseId(null); setMyDayMemoParentId(null); myDayMemoRef.current?.focus(); }}
                          className="shrink-0 border-none bg-transparent cursor-pointer text-tx-3 hover:text-tx p-0 leading-none"
                          title="Détacher le dossier"
                          aria-label="Détacher le dossier"
                        ><Icon name="close" size={11} /></button>
                      </span>
                    )}
                    {myDayMemoParent && (
                      <span className="inline-flex items-center gap-1.5 max-w-full bg-bg-subtle border border-border rounded px-1.5 py-0.5 text-[12px] text-tx-2">
                        <Icon name="arrow-right" size={11} className="shrink-0" />
                        <span className="truncate">{myDayMemoParent.title}</span>
                        <button
                          onClick={() => { setMyDayMemoParentId(null); myDayMemoRef.current?.focus(); }}
                          className="shrink-0 border-none bg-transparent cursor-pointer text-tx-3 hover:text-tx p-0 leading-none"
                          title="Remonter au niveau du dossier"
                          aria-label="Remonter au niveau du dossier"
                        ><Icon name="close" size={11} /></button>
                      </span>
                    )}
                    {myDayMemoDue && (
                      <span className="inline-flex items-center gap-1.5 bg-bg-subtle border border-border rounded px-1.5 py-0.5 text-[12px] text-tx-2">
                        <Icon name="calendar" size={11} className="shrink-0" />
                        <span>{formatDateFR(myDayMemoDue)}</span>
                        <button
                          onClick={() => { setMyDayMemoDue(null); myDayMemoRef.current?.focus(); }}
                          className="shrink-0 border-none bg-transparent cursor-pointer text-tx-3 hover:text-tx p-0 leading-none"
                          title="Retirer l'échéance"
                          aria-label="Retirer l'échéance"
                        ><Icon name="close" size={11} /></button>
                      </span>
                    )}
                    {myDayMemoStarred && (
                      <span className="inline-flex items-center gap-1.5 bg-bg-subtle border border-border rounded px-1.5 py-0.5 text-[12px] text-tx-2">
                        <Icon name="star" size={11} filled className="shrink-0 text-amber-500" />
                        <span>Important</span>
                        <button
                          onClick={() => { setMyDayMemoStarred(false); myDayMemoRef.current?.focus(); }}
                          className="shrink-0 border-none bg-transparent cursor-pointer text-tx-3 hover:text-tx p-0 leading-none"
                          title="Retirer l'étoile"
                          aria-label="Retirer l'étoile"
                        ><Icon name="close" size={11} /></button>
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 bg-white border border-border-strong rounded-lg px-3 py-2 transition-colors focus-within:border-tx-2">
                  <span className="shrink-0 text-tx-3"><Icon name="edit" size={14} /></span>
                  <input
                    ref={myDayMemoRef}
                    value={myDayMemoText}
                    onChange={e => changeMyDayMemoText(e.target.value)}
                    className="flex-1 font-[inherit] text-[15px] text-tx bg-transparent border-none outline-none placeholder:text-tx-3"
                    placeholder={
                      // Le jeton « > » ne s'annonce qu'une fois un dossier retenu :
                      // c'est le seul moment où il veut dire quelque chose.
                      myDayMemoCase && !myDayMemoParent
                        ? "Que faut-il faire ? (> sous une tâche)"
                        : myDayMemoCase || myDayMemoParent || myDayMemoDue || myDayMemoStarred
                          ? "Que faut-il faire ? (Entrée)"
                          : "Nouveau mémo… (# dossier · @ échéance · ! important)"
                    }
                    onKeyDown={async e => {
                      // Tant qu'une liste est ouverte, le clavier lui appartient :
                      // Entrée retient une proposition, elle ne crée pas un mémo
                      // qui s'appellerait « #dup ».
                      if (myDayMemoToken && !isInstantToken(myDayMemoToken)) {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                          e.preventDefault();
                          if (myDayMemoRows.length === 0) return;
                          const direction = e.key === "ArrowDown" ? 1 : -1;
                          setMyDayMemoCursor(Math.min(Math.max(0, myDayMemoIndex + direction), myDayMemoRows.length - 1));
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          myDayMemoRows[myDayMemoIndex]?.take();
                          return;
                        }
                        // Une seule proposition répond : l'espace la retient plutôt
                        // que d'allonger un nom qui n'a plus de rival. À deux
                        // près, il reste une lettre du nom cherché.
                        if (e.key === " " && myDayMemoSoleRow) {
                          e.preventDefault();
                          myDayMemoSoleRow.take();
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          dropMyDayMemoToken();
                          return;
                        }
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        await submitMyDayMemo();
                      }
                    }}
                  />
                </div>
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
                    <MemoDetail
                      task={task}
                      cases={cases}
                      titleRef={myDayTitleRef}
                      onPatch={patch => updateFloatingTask(user.uid, task.id, patch)}
                      onDueDate={date => handleFloatingDueDate(task.id, date)}
                      onAttach={caseId => handleAttachFloating(task, caseId)}
                      onToggleDone={() => handleToggleFloatingDone(task)}
                      onDelete={() => { deleteFloatingTasks(user.uid, [task.id]); setMyDayDetailId(null); }}
                      defaultRepeat={reminderPolicy.repeatEnabled}
                      repeatLabel={describeRepeat(reminderPolicy)}
                      dueReminderHour={reminderPolicy.dueReminderHour}
                    />
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
                    ["D", "Nouveau dossier"],
                    ["T", "Nouvelle tâche"],
                    ["⇧T", "Nouvelle sous-tâche"],
                    ["M", "Nouveau mémo"],
                    ["⇧M", "Nouveau mémo sous la tâche"],
                    ["#", "Dossier du mémo (saisie Ma journée)"],
                    ["@", "Échéance du mémo"],
                    [">", "Poser le mémo sous une tâche"],
                    ["!", "Mémo important"],
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

      {/* ── VISITE GUIDÉE / PAS À PAS ── */}
      {activeTour && <GuidedTour steps={activeTour} onClose={closeTour} />}

      {/* ── MODÈLES DE DOSSIER ── */}
      {memoComposer && (
        <MemoComposer
          cases={cases}
          items={items}
          defaultCaseId={memoComposer.caseId}
          defaultParentItemId={memoComposer.parentItemId ?? null}
          onCreate={handleCreateMemoFromDraft}
          onClose={() => setMemoComposer(null)}
          defaultRepeat={reminderPolicy.repeatEnabled}
          repeatLabel={describeRepeat(reminderPolicy)}
          dueReminderHour={reminderPolicy.dueReminderHour}
        />
      )}

      {templatesModal && (
        <CaseTemplatesModal
          mode={templatesModal.mode}
          templates={caseTemplates}
          onApply={(t) => { if (templatesModal.mode === "apply") handleApplyTemplateToCase(t, templatesModal.caseId); }}
          onCreateNew={(t) => handleCreateCaseFromTemplate(t)}
          onRename={handleRenameTemplate}
          onDelete={handleDeleteTemplate}
          onCreateBlank={handleCreateBlankCase}
          onClose={() => setTemplatesModal(null)}
        />
      )}

      {/* ── ÉCRAN BIENVENUE ── */}
      {showWelcome && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          onClick={() => setShowWelcome(false)}>
          <div style={{ background: "white", borderRadius: "20px", maxWidth: "540px", width: "100%", maxHeight: "calc(100dvh - 48px)", overflowX: "hidden", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
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
              <p style={{ fontSize: "13px", lineHeight: 1.7, color: "#374151" }}>
                Henri s'installe comme une <strong>application</strong> sur votre ordinateur ou votre téléphone (bouton <strong>Installer l'app</strong>) et peut vous envoyer des <strong>rappels</strong> au bon moment sur vos tâches et mémos — activez-les d'un clic sur <strong>Rappels</strong>, en haut.
              </p>
              <button
                onClick={() => { setShowWelcome(false); setActiveTour(TOUR_STEPS); }}
                style={{ width: "100%", padding: "13px", borderRadius: "12px", background: "white", color: "#111827", border: "1px solid #e5e7eb", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: "4px" }}>
                ▶ Faire la visite guidée
              </button>
              <button
                onClick={() => setShowWelcome(false)}
                style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#111827", color: "white", border: "none", fontSize: "15px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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

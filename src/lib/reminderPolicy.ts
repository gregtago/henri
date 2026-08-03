// Politique de rappel : réglages qui pilotent les RELANCES et le RÉCAP quotidien.
//
// Contrairement aux préférences d'apparence (localStorage), ces réglages sont
// lus côté serveur par les Cloud Functions (sendDueReminders, sendDailyDigest) :
// ils vivent donc dans Firestore, dans users/{uid}/settings/reminders.
//
// ⚠ Toute modification de ce fichier doit être répercutée dans
// functions/index.js (DEFAULT_POLICY), qui en est la copie côté serveur.

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

export type ReminderPolicy = {
  /** Relancer par défaut tant que la tâche n'est pas traitée. */
  repeatEnabled: boolean;
  /** Délai entre deux relances, en heures. */
  repeatIntervalHours: number;
  /** Nombre maximum de relances après la notification initiale. */
  repeatMax: number;
  /** Heure (Paris) avant laquelle aucune notification n'est envoyée. */
  dayStartHour: number;
  /** Heure (Paris) après laquelle les relances sont reportées au lendemain matin. */
  dayEndHour: number;
  /** Récapitulatif des tâches non traitées (soir + lendemain matin). */
  recapEnabled: boolean;
  /** Heure du récap du soir (tâches encore ouvertes aujourd'hui). */
  recapEveningHour: number;
  /** Heure du récap du matin (tâches d'hier restées ouvertes). */
  recapMorningHour: number;
  /**
   * Heure du rappel proposé le jour de l'échéance.
   * `DUE_REMINDER_OFF` (-1) = ne rien proposer.
   */
  dueReminderHour: number;
};

/** Valeur de `dueReminderHour` qui coupe la proposition systématique. */
export const DUE_REMINDER_OFF = -1;

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  repeatEnabled: true,
  repeatIntervalHours: 3,
  repeatMax: 3,
  dayStartHour: 8,
  dayEndHour: 20,
  recapEnabled: true,
  recapEveningHour: 18,
  recapMorningHour: 8,
  dueReminderHour: 9,
};

const policyRef = (uid: string) => doc(db, `users/${uid}/settings/reminders`);

/** Normalise un document Firestore (partiel, éventuellement corrompu) en politique complète. */
export function normalizeReminderPolicy(raw: unknown): ReminderPolicy {
  const data = (raw ?? {}) as Partial<ReminderPolicy>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    repeatEnabled: typeof data.repeatEnabled === "boolean" ? data.repeatEnabled : DEFAULT_REMINDER_POLICY.repeatEnabled,
    repeatIntervalHours: num(data.repeatIntervalHours, DEFAULT_REMINDER_POLICY.repeatIntervalHours, 1, 24),
    repeatMax: num(data.repeatMax, DEFAULT_REMINDER_POLICY.repeatMax, 1, 10),
    dayStartHour: num(data.dayStartHour, DEFAULT_REMINDER_POLICY.dayStartHour, 0, 23),
    dayEndHour: num(data.dayEndHour, DEFAULT_REMINDER_POLICY.dayEndHour, 1, 24),
    recapEnabled: typeof data.recapEnabled === "boolean" ? data.recapEnabled : DEFAULT_REMINDER_POLICY.recapEnabled,
    recapEveningHour: num(data.recapEveningHour, DEFAULT_REMINDER_POLICY.recapEveningHour, 0, 23),
    recapMorningHour: num(data.recapMorningHour, DEFAULT_REMINDER_POLICY.recapMorningHour, 0, 23),
    dueReminderHour: num(data.dueReminderHour, DEFAULT_REMINDER_POLICY.dueReminderHour, DUE_REMINDER_OFF, 23),
  };
}

export const subscribeReminderPolicy = (uid: string, cb: (policy: ReminderPolicy) => void) =>
  onSnapshot(
    policyRef(uid),
    (snap) => cb(normalizeReminderPolicy(snap.exists() ? snap.data() : null)),
    () => cb(DEFAULT_REMINDER_POLICY)
  );

export const saveReminderPolicy = (uid: string, policy: ReminderPolicy) =>
  setDoc(policyRef(uid), { ...policy, updatedAt: new Date().toISOString() }, { merge: true });

/**
 * Politique de rappel de l'utilisateur courant, tenue à jour en direct.
 * Renvoie les valeurs par défaut tant que rien n'est chargé (ou hors connexion).
 */
export function useReminderPolicy(uid: string | null | undefined): ReminderPolicy {
  const [policy, setPolicy] = useState<ReminderPolicy>(DEFAULT_REMINDER_POLICY);
  useEffect(() => {
    if (!uid) {
      setPolicy(DEFAULT_REMINDER_POLICY);
      return;
    }
    const unsub = subscribeReminderPolicy(uid, setPolicy);
    return () => unsub();
  }, [uid]);
  return policy;
}

/** Libellé court décrivant la cadence des relances (« toutes les 3 h, 3 fois »). */
export function describeRepeat(policy: ReminderPolicy): string {
  const h = policy.repeatIntervalHours;
  const n = policy.repeatMax;
  return `toutes les ${h} h, ${n} fois maximum`;
}

// ── Le rappel du jour de l'échéance ─────────────────────────────────────────
//
// Poser une échéance et poser un rappel étaient deux gestes distincts, et le
// second se perdait : on datait une pièce pour le 12, et le 12 personne ne
// prévenait. Henri propose donc **systématiquement** un rappel le jour de
// l'échéance, à l'heure réglée dans Préférences → Rappels.
//
// « Proposer » veut dire : posé d'avance, visible dans le sélecteur de rappel,
// et retirable d'un clic. Deux garde-fous, qui tiennent en une phrase chacun :
//
// - **Henri ne marche jamais sur un rappel posé à la main.** Il ne remplace que
//   celui qu'il avait proposé lui-même — reconnaissable à ce qu'il tombe
//   exactement sur la proposition de l'échéance précédente. Nul besoin de
//   stocker d'où vient un rappel : la valeur suffit à le dire.
// - **Il ne propose rien pour un instant déjà passé.** Une échéance posée à
//   15 h pour aujourd'hui n'a que faire d'un rappel de 9 h ; elle est de toute
//   façon dans Ma journée, et le récap du soir la reprendra.

/** Le seul réglage dont dépend la proposition — un brouillon suffit à la porter. */
export type DueReminderSetting = Pick<ReminderPolicy, "dueReminderHour">;

/**
 * L'instant du rappel qui accompagne une échéance : le jour de l'échéance, à
 * l'heure réglée. Purement calculatoire — ne dit pas s'il vaut la peine d'être
 * posé (voir `dueDayReminder`).
 */
export function dueDayReminderAt(
  due: string | Date | null | undefined,
  hour: number
): Date | null {
  if (!due || hour < 0 || hour > 23) return null;
  const at = new Date(due);
  if (Number.isNaN(at.getTime())) return null;
  at.setHours(hour, 0, 0, 0);
  return at;
}

/**
 * Le rappel à proposer pour une échéance, en ISO — ou `null` s'il n'y a rien à
 * proposer : pas d'échéance, proposition coupée dans les Préférences, ou heure
 * déjà passée.
 */
export function dueDayReminder(
  due: string | Date | null | undefined,
  policy: DueReminderSetting,
  now: Date = new Date()
): string | null {
  const at = dueDayReminderAt(due, policy.dueReminderHour);
  if (!at || at.getTime() <= now.getTime()) return null;
  return at.toISOString();
}

type DueReminderChange = {
  /** L'échéance qu'on quitte — sert à reconnaître le rappel proposé par Henri. */
  previousDue?: string | Date | null;
  /** L'échéance qu'on pose (`null` = on la retire). */
  nextDue?: string | Date | null;
  /** Le rappel actuellement armé. */
  currentReminder?: string | null;
  policy: DueReminderSetting;
};

/**
 * Ce que devient le rappel quand on pose ou retire une échéance.
 *
 * Renvoie l'ISO du nouveau rappel, `null` pour le retirer, ou `undefined`
 * quand il n'y a rien à écrire — soit que le rappel ait été posé à la main,
 * soit qu'il soit déjà à la bonne valeur.
 */
export function proposeDueReminder(change: DueReminderChange): string | null | undefined {
  const { previousDue = null, nextDue = null, currentReminder = null, policy } = change;

  const previousProposal = dueDayReminderAt(previousDue, policy.dueReminderHour);
  const isHenris =
    !!currentReminder &&
    !!previousProposal &&
    new Date(currentReminder).getTime() === previousProposal.getTime();

  // Un rappel choisi par le notaire prime toujours sur la proposition.
  if (currentReminder && !isHenris) return undefined;

  const next = dueDayReminder(nextDue, policy);
  return next === currentReminder ? undefined : next;
}

/**
 * Les champs à écrire en même temps que l'échéance — `{}` s'il n'y a rien à
 * changer, ce qui rend l'appel sûr à étaler dans n'importe quel patch.
 *
 * Le compteur de relances repart à zéro : c'est un rappel neuf, pas la suite
 * du précédent.
 */
export function dueReminderPatch(change: DueReminderChange): {
  reminderAt?: string | null;
  reminderSentAt?: null;
  reminderCount?: number;
} {
  const next = proposeDueReminder(change);
  if (next === undefined) return {};
  return { reminderAt: next, reminderSentAt: null, reminderCount: 0 };
}

/** Libellé de l'heure du rappel d'échéance (« 9h »), ou `null` si la proposition est coupée. */
export function describeDueReminder(policy: DueReminderSetting): string | null {
  if (policy.dueReminderHour < 0 || policy.dueReminderHour > 23) return null;
  return `${String(policy.dueReminderHour).padStart(2, "0")}h`;
}

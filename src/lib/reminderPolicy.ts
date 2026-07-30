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
};

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  repeatEnabled: true,
  repeatIntervalHours: 3,
  repeatMax: 3,
  dayStartHour: 8,
  dayEndHour: 20,
  recapEnabled: true,
  recapEveningHour: 18,
  recapMorningHour: 8,
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

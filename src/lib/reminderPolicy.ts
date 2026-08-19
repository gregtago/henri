// Politique de rappel : la lecture et l'écriture du réglage de l'utilisateur.
//
// Les règles elles-mêmes — ce qu'est une politique, ses valeurs par défaut, le
// rappel qu'une échéance arme — vivent dans `reminderRules.ts`, sans Firestore
// ni React, pour pouvoir servir aussi côté serveur. Ce fichier n'ajoute que
// l'accès au document `users/{uid}/settings/reminders`, et **réexporte tout le
// reste** : rien à changer là où l'on importait déjà depuis ici.

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { DEFAULT_REMINDER_POLICY, normalizeReminderPolicy, type ReminderPolicy } from "./reminderRules";

export * from "./reminderRules";

const policyRef = (uid: string) => doc(db, `users/${uid}/settings/reminders`);

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

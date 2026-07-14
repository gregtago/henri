// Côté client : gestion FCM (récupération du token + écoute des messages au premier plan).
// La permission est demandée à la demande, pas au chargement, pour respecter l'utilisateur.

import { firebaseApp } from "./firebase";
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from "firebase/messaging";
import { db } from "./firebase";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

// Scope DÉDIÉ pour le service worker de messagerie.
// Le SW applicatif (/sw.js) est enregistré sur le scope "/". Comme une seule
// registration peut exister par scope, enregistrer le SW FCM sur "/" aussi les
// fait s'évincer mutuellement à chaque rechargement : quand /sw.js reprend "/",
// il n'y a plus de handler push et les notifs ne s'affichent pas (alors que FCM
// les envoie avec succès). On isole donc le SW FCM sur son propre scope
// (celui utilisé par défaut par le SDK Firebase) pour qu'ils coexistent.
const FCM_SW_SCOPE = "/firebase-cloud-messaging-push-scope";

// Enregistre (idempotent) le SW de messagerie sur son scope dédié et renvoie
// la registration à passer à getToken.
async function registerMessagingSW(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: FCM_SW_SCOPE });
}

let messagingInstance: Messaging | null = null;

/**
 * Initialise le messaging si supporté par le navigateur.
 * Retourne null sur :
 * - environnement non-browser (SSR)
 * - navigateurs sans support (Firefox PWA, vieux Safari, etc.)
 * - service worker absent
 */
export async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (messagingInstance) return messagingInstance;
  try {
    const ok = await isSupported();
    if (!ok) return null;
    messagingInstance = getMessaging(firebaseApp);
    return messagingInstance;
  } catch (err) {
    console.warn("[FCM] getMessaging failed", err);
    return null;
  }
}

/**
 * Demande la permission de notification et récupère le token FCM.
 * Stocke le token dans Firestore (users/{uid}/pushTokens/{token}).
 *
 * Retourne :
 *  { ok: true, token } si tout marche
 *  { ok: false, reason: 'denied' | 'unsupported' | 'no-vapid' | 'error', error? }
 */
export async function enablePushNotifications(uid: string): Promise<
  | { ok: true; token: string }
  | { ok: false; reason: "denied" | "unsupported" | "no-vapid" | "error"; error?: unknown }
> {
  if (!VAPID_KEY) {
    return { ok: false, reason: "no-vapid" };
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return { ok: false, reason: "unsupported" };

  // Permission notification
  let permission: NotificationPermission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  try {
    // L'enregistrement du SW pour FCM se fait via /firebase-messaging-sw.js
    // qui doit exister à la racine.
    const swReg = await registerMessagingSW();

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) return { ok: false, reason: "error" };

    // Stocker en base, indexé par token (un même user peut avoir plusieurs devices)
    await setDoc(doc(db, `users/${uid}/pushTokens/${token}`), {
      token,
      userAgent: navigator.userAgent,
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }, { merge: true });

    return { ok: true, token };
  } catch (err) {
    console.warn("[FCM] enable failed", err);
    return { ok: false, reason: "error", error: err };
  }
}

/**
 * Récupère le token courant (sans demander la permission) et met à jour
 * son timestamp 'lastSeenAt'. À appeler au démarrage si la permission est déjà
 * accordée, pour garder la base à jour et nettoyer les tokens orphelins.
 */
export async function refreshPushToken(uid: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (Notification.permission !== "granted") return null;
  if (!VAPID_KEY) return null;
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  try {
    const swReg = await registerMessagingSW();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (!token) return null;
    await setDoc(doc(db, `users/${uid}/pushTokens/${token}`), {
      token,
      userAgent: navigator.userAgent,
      lastSeenAt: serverTimestamp(),
    }, { merge: true });
    return token;
  } catch (err) {
    console.warn("[FCM] refresh failed", err);
    return null;
  }
}

/**
 * Renvoie le token FCM de l'appareil courant si la permission est déjà accordée,
 * sinon null. Ne demande PAS la permission. Sert à repérer « cet appareil »
 * dans la liste des appareils (Préférences).
 */
export async function getCurrentToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window) || Notification.permission !== "granted") return null;
  if (!VAPID_KEY) return null;
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  try {
    const swReg = await registerMessagingSW();
    return await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  } catch {
    return null;
  }
}

/**
 * Désactive les notifs pour le device courant : retire le token de Firestore.
 * (La permission OS reste accordée, l'utilisateur doit la retirer manuellement.)
 */
export async function disablePushNotifications(uid: string): Promise<void> {
  if (typeof window === "undefined") return;
  const messaging = await getMessagingInstance();
  if (!messaging) return;
  try {
    const swReg = await registerMessagingSW();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      await deleteDoc(doc(db, `users/${uid}/pushTokens/${token}`));
    }
  } catch (err) {
    console.warn("[FCM] disable failed", err);
  }
}

/**
 * Écoute les messages reçus quand l'app est au premier plan.
 * Affiche un toast custom (passé en callback) au lieu de laisser le système
 * afficher une notif (qui n'apparaît pas quand l'onglet est actif).
 */
export async function listenForegroundMessages(onMessageReceived: (payload: { title?: string; body?: string }) => void) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? (payload.data?.title as string | undefined);
    const body = payload.notification?.body ?? (payload.data?.body as string | undefined);
    onMessageReceived({ title, body });
  });
}

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyBJXs19U2kUzY0EOedIL4AFihuKMLkhL3Y",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "henri-11598.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "henri-11598",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "henri-11598.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "711616064524",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:711616064524:web:55f1d00fbf694f83bf9229"
};

export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);

/**
 * La base, et l'endroit où elle garde ce qu'elle sait.
 *
 * Sans réglage, Firestore ne garde rien : chaque lancement retélécharge les
 * dossiers, les tâches et les mémos avant de pouvoir afficher la moindre ligne.
 * Sur un iPhone en 4G, dans un couloir, c'est là que passe l'attente — et c'est
 * une attente que l'on paie chaque fois, pour des données qui n'ont pas bougé.
 *
 * Le cache persistant range donc tout dans IndexedDB : au lancement suivant,
 * l'écran se peint depuis le disque, puis le réseau vient corriger ce qui a
 * changé pendant l'absence. Les écritures faites hors ligne partent à la
 * reconnexion — c'est le même mécanisme, et c'est le SDK qui l'orchestre, pas
 * nous.
 *
 * `persistentMultipleTabManager` parce qu'un notaire ouvre volontiers Henri dans
 * deux onglets : sans lui, le second se verrait refuser le cache.
 */
const openDatabase = (): Firestore => {
  // Au rendu serveur, il n'y a ni IndexedDB ni rien à garder d'une requête à
  // l'autre : la base en mémoire est la seule qui ait un sens.
  if (typeof window === "undefined") return getFirestore(firebaseApp);
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Base déjà démarrée (rechargement à chaud), ou stockage refusé (navigation
    // privée) : on retombe sur la mémoire. Henri est plus lent, il fonctionne.
    return getFirestore(firebaseApp);
  }
};

export const db = openDatabase();

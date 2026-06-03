import * as admin from "firebase-admin";

let appInstance: admin.app.App | null = null;

// Initialisation paresseuse : l'app n'est créée qu'au premier usage réel
// (au runtime, lors d'une requête), jamais à l'import du module. Sans ça,
// `next build` plante en collectant les données de page car le service
// account n'est pas disponible à la compilation.
function getApp(): admin.app.App {
  if (appInstance) return appInstance;
  appInstance = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
  return appInstance;
}

// Proxies paresseux : conservent l'API valeur (`adminAuth.verifyIdToken(...)`,
// `adminDb.collection(...)`) tout en différant l'initialisation au premier
// accès de propriété. Aucun site d'appel n'a besoin d'être modifié.
const lazy = <T extends object>(resolve: () => T): T =>
  new Proxy({} as T, {
    get: (_target, prop) => {
      const target = resolve();
      const value = (target as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });

export const adminAuth = lazy<admin.auth.Auth>(() => getApp().auth());
export const adminDb = lazy<admin.firestore.Firestore>(() => getApp().firestore());

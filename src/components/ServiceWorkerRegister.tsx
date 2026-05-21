"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker pour la PWA.
 * Doit être inclus une seule fois dans le layout racine.
 * Pas de feedback UI : enregistrement silencieux en arrière-plan.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    // En dev, on évite d'enregistrer le SW pour ne pas mettre en cache
    // des fichiers volatiles (HMR, etc.).
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[SW] échec d'enregistrement", err);
        });
    };

    // Attendre que la page soit chargée avant d'enregistrer le SW
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}

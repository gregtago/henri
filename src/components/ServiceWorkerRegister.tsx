"use client";

import { useEffect } from "react";
import { initInstallCapture } from "@/lib/pwaInstall";

/**
 * Enregistre le service worker pour la PWA et gère sa mise à jour automatique.
 *
 * Comportement :
 * 1. Au montage : enregistre /sw.js, vérifie immédiatement une update
 * 2. Toutes les 30 min : re-check (utile pour les sessions longues)
 * 3. Quand un nouveau SW prend le contrôle : reload silencieux de la page
 *
 * Critique en PWA iOS : sans ça, après un déploiement il faut forcer la fermeture
 * de l'app pour voir la nouvelle version. Avec ça, l'app détecte l'update,
 * l'active et se rafraîchit automatiquement.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Capter l'événement d'installabilité dans tous les environnements
    // (le navigateur ne le déclenche de toute façon que si les critères PWA
    // sont remplis, ce qui suppose le SW de production servi en HTTPS).
    initInstallCapture();

    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let registration: ServiceWorkerRegistration | null = null;
    let isReloading = false;

    const checkForUpdate = async () => {
      if (!registration) return;
      try {
        await registration.update();
      } catch {
        // pas de réseau ou autre — silencieux
      }
    };

    // Quand un nouveau SW prend le contrôle, reload la page.
    // L'événement 'controllerchange' est tiré juste après l'activation
    // d'un nouveau SW qui a fait skipWaiting (notre cas).
    const handleControllerChange = () => {
      if (isReloading) return;
      isReloading = true;
      window.location.reload();
    };

    const onLoad = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

        // Check immédiat puis toutes les 30 min
        await checkForUpdate();
        intervalId = setInterval(checkForUpdate, 30 * 60 * 1000);

        // Si une mise à jour est trouvée pendant qu'on est sur la page,
        // activer immédiatement (skipWaiting est déjà appelé côté SW).
        registration.addEventListener("updatefound", () => {
          const newWorker = registration!.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Nouveau SW prêt mais en attente → on lui demande de prendre la main
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch (err) {
        console.warn("[SW] enregistrement échoué", err);
      }
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}

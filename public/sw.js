// Service worker Henri — version minimale
// But : permettre l'installation PWA et le lancement offline (app shell).
// Les données Firestore ne sont PAS cachées ici — elles sont gérées par le
// cache offline natif de Firestore (côté client SDK) qui sait gérer la
// reconnexion et la résolution de conflits proprement.

const CACHE_VERSION = "henri-v4";
const APP_SHELL = [
  "/",
  "/my-day",
  "/site.webmanifest",
  "/logo-henri-new.png",
  "/favicon.ico",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
];

// Permettre au client de pousser le SW à prendre la main immédiatement
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// À l'install : pré-cacher le shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => {
      // Si une URL du shell échoue (ex: pas encore générée), on ignore
      // pour ne pas bloquer toute l'installation du SW.
    }))
  );
  self.skipWaiting();
});

// À l'activation : nettoyer les anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stratégie fetch : network-first pour HTML, cache-first pour assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // On ne touche pas aux requêtes :
  // - Firebase / Firestore (live data)
  // - Méthodes non-GET
  // - Autres origines que la nôtre
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("googleapis")
  ) {
    return;
  }

  // Manifest PWA : network-first impératif. En cache-first, Chrome lirait un
  // ancien manifest (nom/icônes) et l'invite d'installation resterait périmée.
  // On rafraîchit toujours depuis le réseau, avec fallback cache pour l'offline.
  if (url.pathname === "/site.webmanifest") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Pages HTML : network-first (pour avoir la dernière version), fallback cache
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Mettre en cache la réponse fraîche
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/my-day")))
    );
    return;
  }

  // Assets : cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache uniquement les réponses OK
        if (response.ok && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

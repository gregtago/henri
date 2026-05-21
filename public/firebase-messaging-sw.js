// Service worker dédié FCM — affiche les notifs quand l'app est en arrière-plan.
// Le path /firebase-messaging-sw.js est imposé par Firebase Messaging.

// Compat scripts : pas de bundler dans un SW, donc on importe les scripts CDN compat.
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// La config est dupliquée ici (les env vars ne sont pas accessibles dans un SW).
// Note : ces valeurs sont publiques (clés Firebase web) — pas de secret.
firebase.initializeApp({
  apiKey: "AIzaSyBJXs19U2kUzY0EOedIL4AFihuKMLkhL3Y",
  authDomain: "henri-11598.firebaseapp.com",
  projectId: "henri-11598",
  storageBucket: "henri-11598.firebasestorage.app",
  messagingSenderId: "711616064524",
  appId: "1:711616064524:web:55f1d00fbf694f83bf9229",
});

const messaging = firebase.messaging();

// Personnalisation de la notif en arrière-plan
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title)
    || (payload.data && payload.data.title)
    || "Henri";
  const options = {
    body: (payload.notification && payload.notification.body)
      || (payload.data && payload.data.body)
      || "",
    icon: "/web-app-manifest-192x192.png",
    badge: "/favicon-32x32.png",
    tag: (payload.data && payload.data.tag) || undefined,
    data: payload.data || {},
    requireInteraction: false,
  };
  self.registration.showNotification(title, options);
});

// Clic sur la notif : ouvrir l'app à l'URL fournie en data.url (ou /my-day)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/my-day";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Si une fenêtre Henri est déjà ouverte, on la focus
      for (const w of wins) {
        if (w.url.includes(self.location.host)) {
          w.focus();
          if ("navigate" in w) w.navigate(url);
          return;
        }
      }
      // Sinon, on en ouvre une
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

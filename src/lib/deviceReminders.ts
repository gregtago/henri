"use client";

// Les rappels de **cet** appareil.
//
// Activer les rappels ici, c'est deux choses à la fois : la permission du
// navigateur, et un jeton propre à cet appareil enregistré au compte. Les
// désactiver ne retire que le jeton — la permission du navigateur, elle, reste
// accordée, et on ne prétend donc pas l'avoir révoquée.
//
// Ce geste vivait dans le menu du rond du compte. Il vit maintenant à deux
// endroits — ce rond sur grand écran, Préférences → Compte sur téléphone — et
// il n'était pas question d'en tenir deux versions : les deux écrans appellent
// le même crochet, et se contentent de dire comment l'annoncer.

import { useCallback, useEffect, useState } from "react";

export type NotifStatus = "unknown" | "granted" | "denied" | "default" | "unsupported";

type Options = {
  uid: string;
  /** Comment l'écran annonce ce qui vient de se passer (toast, bandeau, alerte…). */
  onNotice: (message: string) => void;
  /** L'écran qui suit l'état pour son propre compte. */
  onStatusChange?: (status: NotifStatus) => void;
};

export function useDeviceReminders({ uid, onNotice, onStatusChange }: Options) {
  const [status, setStatus] = useState<NotifStatus>("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current: NotifStatus = "Notification" in window ? (Notification.permission as NotifStatus) : "unsupported";
    setStatus(current);
    onStatusChange?.(current);
    // `onStatusChange` n'est lu qu'au montage : le prévenir plus souvent ferait
    // de cette ligne une boucle de rendu, pour un état qui ne bouge que sur
    // action de l'utilisateur (ci-dessous, `toggle`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const announce = useCallback((next: NotifStatus) => {
    setStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const messaging = await import("@/lib/messaging");
      if (status === "granted") {
        await messaging.disablePushNotifications(uid);
        onNotice("Rappels désactivés sur cet appareil.");
        return;
      }
      const result = await messaging.enablePushNotifications(uid);
      if (result.ok) {
        announce("granted");
        onNotice("Rappels activés sur cet appareil.");
      } else if (result.reason === "denied") {
        announce("denied");
        onNotice("Permission refusée : à rouvrir dans les réglages du navigateur.");
      } else if (result.reason === "no-vapid") {
        onNotice("Configuration serveur incomplète.");
      } else if (result.reason === "unsupported") {
        announce("unsupported");
        onNotice("Sur iPhone, installez d'abord Henri sur l'écran d'accueil.");
      } else {
        onNotice("L'activation a échoué. Réessayez dans un instant.");
      }
    } finally {
      setBusy(false);
    }
  }, [announce, busy, onNotice, status, uid]);

  return { status, busy, toggle };
}

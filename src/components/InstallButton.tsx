"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { canInstall, promptInstall, subscribeInstall, isStandalone } from "@/lib/pwaInstall";

/**
 * Bouton "Installer l'application".
 *
 * Visible uniquement quand le navigateur signale que l'app est installable
 * (Chrome / Edge / Android via `beforeinstallprompt`) et qu'elle ne tourne pas
 * déjà en mode installé. Un clic ouvre la fenêtre native d'installation du
 * navigateur — aucun store, tout passe par le navigateur.
 */
export default function InstallButton({ className }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sync = () => setShow(canInstall());
    sync();
    return subscribeInstall(sync);
  }, []);

  if (!show || isStandalone()) return null;

  return (
    <button
      type="button"
      className={
        className ??
        "inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-tx-2 bg-transparent cursor-pointer transition-colors hover:border-border-strong hover:text-tx"
      }
      title="Installer Henri comme application sur cet appareil"
      onClick={() => {
        void promptInstall();
      }}
    >
      <Icon name="import" size={13} />
      <span>Installer l'app</span>
    </button>
  );
}

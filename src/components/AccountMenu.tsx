"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Icon } from "./Icon";
import InstallButton from "./InstallButton";
import { useDeviceReminders, type NotifStatus } from "@/lib/deviceReminders";

/**
 * Le compte, en un seul bouton.
 *
 * Les commandes qui ne concernent pas le travail — les rappels de cet appareil,
 * l'installation, les préférences, la déconnexion — occupaient jusqu'à cinq
 * boutons en haut à droite de « Dossiers », et un menu tout autre dans « Ma
 * journée » : un rond « personne » qui, lui, ne menait même pas aux
 * préférences. Deux grammaires pour la même chose, et une barre encombrée là
 * où l'œil cherche des dossiers.
 *
 * Tout tient désormais derrière **un rond, au même endroit sur chaque écran**.
 * Ce qui est rare se replie ; ce qui est fréquent — créer, trier, cocher —
 * garde la place. La lettre affichée est celle de l'adresse connectée : de quoi
 * distinguer d'un coup d'œil le compte de travail du compte d'administration,
 * qui sont désormais deux comptes distincts.
 */

type AccountMenuProps = {
  uid: string;
  email: string | null;
  /** Comment l'écran annonce ce qui vient de se passer (toast, bandeau…). */
  onNotice: (message: string) => void;
  /** L'écran qui suit l'état des notifications pour son propre compte. */
  onNotifStatusChange?: (status: NotifStatus) => void;
  /**
   * De quel côté le menu se déplie. Depuis la barre du bas du téléphone, un
   * menu qui descend sortirait de l'écran : il monte (`"top"`).
   */
  placement?: "bottom" | "top";
};

const rowClass =
  "flex items-center gap-2 w-full text-left px-3.5 py-2.5 text-[13px] font-[inherit] bg-transparent border-none cursor-pointer text-tx-2 hover:bg-bg-hover transition-colors no-underline";

export default function AccountMenu({ uid, email, onNotice, onNotifStatusChange, placement = "bottom" }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { status: notifStatus, busy, toggle } = useDeviceReminders({ uid, onNotice, onStatusChange: onNotifStatusChange });

  // Fermeture : un clic ailleurs, ou Échap. Pas de voile transparent — il
  // laisserait passer ce qui se dessine au-dessus de l'en-tête.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Le menu se referme sur le geste, quel qu'en soit le résultat.
  const toggleReminders = async () => { await toggle(); setOpen(false); };

  const initial = email?.trim()?.[0]?.toUpperCase() ?? "";

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        data-tour="compte"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Compte, rappels et préférences"
        aria-label="Compte, rappels et préférences"
        className={`w-[32px] h-[32px] shrink-0 flex items-center justify-center rounded-full border cursor-pointer transition-colors text-[13px] font-medium ${
          open ? "bg-tx text-bg border-tx" : "bg-bg-subtle text-tx-2 border-border hover:bg-bg-hover hover:text-tx"
        }`}
      >
        {initial || <Icon name="user" size={16} />}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 min-w-[240px] bg-bg border border-border rounded-xl shadow-lg overflow-hidden z-50 ${
            placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          }`}
        >
          <div className="px-3.5 py-3 border-b border-border">
            <p className="text-[10px] font-semibold text-tx-3 uppercase tracking-widest">Connecté</p>
            <p className="text-[13px] text-tx mt-1 break-all">{email ?? "—"}</p>
          </div>

          {notifStatus !== "unsupported" && (
            <button type="button" role="menuitem" disabled={busy} onClick={toggleReminders} className={`${rowClass} border-b border-border disabled:opacity-50`}>
              <Icon name="time" size={15} />
              <span className="flex-1">{notifStatus === "granted" ? "Rappels sur cet appareil" : "Activer les rappels ici"}</span>
              {notifStatus === "granted" && <span className="text-[11px] font-semibold text-ok">✓</span>}
            </button>
          )}

          <InstallButton className={`${rowClass} border-b border-border`} />

          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={`${rowClass} border-b border-border`}>
            <Icon name="settings" size={15} />
            <span>Préférences</span>
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut(auth);
            }}
            className={`${rowClass} text-danger hover:text-danger`}
          >
            <Icon name="log-out" size={15} />
            <span>Déconnexion</span>
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { type User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import AppShell from "@/components/AppShell";
import MobileMyDay from "@/components/MobileMyDay";

/**
 * Mes dossiers et Ma journée, sous un seul toit.
 *
 * Les deux vues gardent leur adresse — `/` et `/my-day` : les liens, les
 * notifications et le raccourci de l'écran d'accueil continuent d'y mener, et
 * l'application démarre sur `/my-day`. Mais passer de l'une à l'autre n'est
 * plus une navigation : c'est un état de ce composant. Rien ne se démonte,
 * rien ne se rabonne à Firestore, rien ne se retélécharge — d'où la bascule
 * immédiate, là où la navigation rendait un écran vide le temps que la page
 * d'en face se remonte.
 *
 * L'URL suit quand même, par `history.pushState` : la barre d'adresse reste
 * juste, un rechargement retombe sur la vue qu'on regardait, et le geste
 * « retour » ramène à la précédente sans démonter quoi que ce soit (Next
 * intercepte cette API et se contente d'y accorder son routeur).
 */
export type HenriView = "cases" | "myday";

const PATHS: Record<HenriView, string> = { cases: "/", myday: "/my-day" };

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

/**
 * La porte d'abord, les deux vues ensuite.
 *
 * Attendre Firebase, montrer la connexion, exiger l'adresse confirmée, proposer
 * le second facteur : tout cela vit dans `AuthGate`, pour Mes dossiers, Ma
 * journée et le Calendrier à la fois. Ce qui suit ne se monte qu'une fois le
 * trajet fini — et reçoit donc un compte, jamais un `null`.
 */
export default function HenriApp({ initialView }: { initialView: HenriView }) {
  return <AuthGate>{(user) => <HenriViews user={user} initialView={initialView} />}</AuthGate>;
}

function HenriViews({ user, initialView }: { user: User; initialView: HenriView }) {
  const [view, setView] = useState<HenriView>(initialView);
  const isMobile = useIsMobile();
  // Sur mobile les deux vues sont deux composants distincts. Celui qu'on ne
  // regarde pas se monte quand même, une fois l'écran peint : c'est ce montage
  // d'avance qui rend la toute première bascule aussi vive que les suivantes.
  const [bothMounted, setBothMounted] = useState(false);

  useEffect(() => {
    if (!isMobile || bothMounted) return;
    const start = () => setBothMounted(true);
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof idle.requestIdleCallback === "function") {
      const id = idle.requestIdleCallback(start, { timeout: 3000 });
      return () => idle.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(start, 1200);
    return () => window.clearTimeout(id);
  }, [isMobile, bothMounted]);

  const goTo = useCallback((next: HenriView) => {
    setBothMounted(true);
    setView(next);
    if (typeof window !== "undefined" && window.location.pathname !== PATHS[next]) {
      try { window.history.pushState(null, "", PATHS[next]); } catch {}
    }
  }, []);

  // Geste « retour » : l'URL a déjà changé, la vue se remet d'accord avec elle.
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      if (path === PATHS.myday) setView("myday");
      else if (path === PATHS.cases) setView("cases");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Sur grand écran, une seule coquille tient les deux vues : elle change de
  // visage sans se démonter, il n'y a rien à garder en réserve.
  if (!isMobile) return <AppShell view={view} onViewChange={goTo} />;

  const onMyDay = view === "myday";
  return (
    <>
      {(!onMyDay || bothMounted) && (
        <div style={{ display: onMyDay ? "none" : "contents" }}>
          <AppShell view="cases" onViewChange={goTo} active={!onMyDay} />
        </div>
      )}
      {(onMyDay || bothMounted) && (
        <div style={{ display: onMyDay ? "contents" : "none" }}>
          <MobileMyDay user={user} onGoCases={() => goTo("cases")} />
        </div>
      )}
    </>
  );
}

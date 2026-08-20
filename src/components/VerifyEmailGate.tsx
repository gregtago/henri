"use client";

// L'adresse se confirme avant d'entrer.
//
// Henri garde des dossiers couverts par le secret professionnel, et le seul
// lien entre un compte et une personne, c'est son adresse. Tant que personne
// n'a prouvé qu'il la relève, ce lien n'est qu'une déclaration : n'importe qui
// pouvait s'inscrire avec l'adresse d'un confrère.
//
// La confirmation commande aussi la suite. Identity Platform refuse d'inscrire
// un second facteur tant que l'adresse n'est pas vérifiée — sans quoi on
// s'inscrirait avec l'adresse d'un autre puis on l'enfermerait dehors avec son
// propre téléphone. La double authentification devenant obligatoire à
// l'échéance de chaque compte (`mfaPolicy.ts`), une adresse non confirmée est
// une porte qui se fermera toute seule le jour dit. Autant la régler
// maintenant, en une minute, plutôt qu'un matin de signature.
//
// D'où cet écran, qui **barre la route** au lieu de conseiller. Il n'est pas
// une punition : le courriel part tout seul en arrivant, l'écran se déverrouille
// de lui-même dès que le lien est ouvert — même dans un autre onglet, même sur
// le téléphone —, et « Se déconnecter » reste offert à qui s'est trompé
// d'adresse. On ne laisse jamais quelqu'un devant une porte sans poignée.

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

/** Le courriel ne part qu'une fois par session et par compte, tout seul. */
const AUTO_SENT_KEY = "henri_verify_auto_sent";

/** Le rythme auquel l'écran regarde si le lien a été ouvert ailleurs. */
const POLL_MS = 5000;

type SendState = "idle" | "sending" | "sent" | "error";

export default function VerifyEmailGate({ user, onVerified }: { user: User; onVerified: () => void }) {
  const [sendState, setSendState] = useState<SendState>("idle");
  const [checking, setChecking] = useState(false);
  const [checkedInVain, setCheckedInVain] = useState(false);
  // `onVerified` remonte au parent : on le garde dans une référence pour que
  // le minuteur ne se remonte pas à chaque rendu du parent.
  const verified = useRef(onVerified);
  verified.current = onVerified;

  /** Redemander à Firebase où en est ce compte. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      await user.reload();
    } catch {
      // Session expirée ou compte retiré : rien à faire ici, la connexion s'en
      // apercevra. Surtout, ne pas transformer un incident réseau en impasse.
      return false;
    }
    if (auth.currentUser?.emailVerified) {
      verified.current();
      return true;
    }
    return false;
  }, [user]);

  const send = useCallback(async () => {
    setSendState("sending");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/verify-email", { method: "POST", headers: { authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json().catch(() => null);
      // L'adresse était déjà confirmée entre-temps : inutile d'attendre le lien.
      if (data?.alreadyVerified) { await refresh(); return; }
      setSendState("sent");
    } catch {
      setSendState("error");
    }
  }, [user, refresh]);

  // Le courriel part de lui-même : personne n'a à demander ce qu'on lui impose.
  useEffect(() => {
    let alive = true;
    const key = `${AUTO_SENT_KEY}:${user.uid}`;
    let already = false;
    try { already = window.sessionStorage.getItem(key) === "1"; } catch {}
    if (already) return;
    try { window.sessionStorage.setItem(key, "1"); } catch {}
    void (async () => { if (alive) await send(); })();
    return () => { alive = false; };
  }, [user.uid, send]);

  // Le lien s'ouvre le plus souvent ailleurs — dans la boîte aux lettres, sur
  // le téléphone. L'écran regarde donc tout seul, et se retire sans qu'on ait
  // à revenir cliquer quoi que ce soit. Rien ne tourne dans un onglet caché.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      await refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    setCheckedInVain(false);
    const ok = await refresh();
    if (!ok) setCheckedInVain(true);
    setChecking(false);
  };

  const btnPrimary = "w-full font-[inherit] text-[13.5px] bg-tx text-bg border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50";
  const btnSecondary = "w-full font-[inherit] text-[13.5px] bg-bg border border-border text-tx-2 rounded py-2 cursor-pointer hover:bg-bg-hover hover:text-tx transition-all disabled:opacity-50";

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8" style={{ background: "var(--text)" }}>
      <div className="w-full max-w-sm bg-bg rounded-[20px] shadow-lg p-7 space-y-5">

        <div className="flex flex-col items-center text-center space-y-2 pb-1">
          <img src="/logo-henri-new.png" alt="Henri" style={{ width: "200px", height: "auto" }} />
          <p className="text-[13.5px] text-tx-3 leading-snug">Confirmez votre adresse pour entrer.</p>
        </div>

        <div className="space-y-2.5">
          <p className="text-[13px] text-tx-2 leading-relaxed">Un lien vient de partir à :</p>
          {/* L'adresse a sa ligne : dans le fil du texte, elle se coupait en
            * plein milieu du domaine — et une adresse coupée se relit mal
            * quand on la cherche dans sa boîte. */}
          <p className="text-[13px] font-medium text-tx bg-bg-subtle border border-border rounded px-3 py-2 text-center" style={{ overflowWrap: "anywhere" }}>
            {user.email}
          </p>
          <p className="text-[13px] text-tx-2 leading-relaxed">
            Ouvrez-le : cet écran se retire de lui-même, ici comme sur votre téléphone.
          </p>
          <p className="text-[12px] text-tx-3 leading-relaxed">
            Henri garde des dossiers couverts par le secret professionnel. Confirmer votre adresse prouve qu&apos;elle est bien la vôtre — et c&apos;est le préalable à la double authentification.
          </p>
        </div>

        <div className="space-y-2.5">
          <button className={btnPrimary} disabled={checking} onClick={handleCheck}>
            {checking ? "Vérification…" : "J'ai ouvert le lien"}
          </button>
          <button className={btnSecondary} disabled={sendState === "sending"} onClick={send}>
            {sendState === "sending" ? "Envoi…" : "Renvoyer le lien"}
          </button>
        </div>

        {sendState === "sent" && (
          <p className="text-[12px] text-ok-strong leading-relaxed">Lien envoyé. Pensez aux indésirables s&apos;il tarde.</p>
        )}
        {sendState === "error" && (
          <p className="text-[12px] text-danger leading-relaxed">L&apos;envoi a échoué. Réessayez dans un instant.</p>
        )}
        {checkedInVain && sendState !== "sent" && (
          <p className="text-[12px] text-tx-3 leading-relaxed">Rien de nouveau pour l&apos;instant : le lien n&apos;a pas encore été ouvert.</p>
        )}

        <div className="pt-1 text-center">
          <button
            className="text-[12px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-tx-2 underline"
            onClick={() => void signOut(auth)}
          >
            Ce n&apos;est pas mon adresse — me déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  const handleEmailLogin = async () => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("Connexion impossible. Vérifiez vos identifiants.");
    }
  };

  const handleReset = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Saisissez votre email d'abord.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: window.location.origin,
      });
      setResetSent(true);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/user-not-found") {
        setError("Aucun compte trouvé avec cet email.");
      } else if (code === "auth/invalid-email") {
        setError("Adresse email invalide.");
      } else if (code === "auth/too-many-requests") {
        setError("Trop de tentatives. Réessayez dans quelques minutes.");
      } else {
        setError(`Erreur : ${code || err?.message || "inconnue"}`);
      }
    }
  };

  const inputClass = "w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3";
  const btnPrimary = "w-full font-[inherit] text-[13.5px] bg-tx text-bg border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity";
  const btnSecondary = "w-full font-[inherit] text-[13.5px] bg-bg border border-border text-tx-2 rounded py-2 cursor-pointer hover:bg-bg-hover hover:text-tx transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
      <div className="w-full max-w-sm bg-bg border border-border rounded-xl shadow-sm p-7 space-y-5">

        <div className="space-y-1">
          <img src="/logo-henri.png" alt="Henri" style={{width:"220px", height:"auto"}} />
          <p className="text-[13px] text-tx-3">s'occupe de l'organisation de vos dossiers&nbsp;!</p>
        </div>

        {mode === "login" ? (
          <>
            <div className="space-y-2.5">
              <input
                className={inputClass}
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
              />
              <input
                className={inputClass}
                placeholder="Mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
              />
              <button className={btnPrimary} onClick={handleEmailLogin}>
                Se connecter
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                className="text-[12px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-tx-2 underline"
                onClick={() => { setMode("reset"); setError(null); }}
              >
                Mot de passe oublié ?
              </button>
            </div>


          </>
        ) : (
          <>
            {resetSent ? (
              <div className="bg-bg-subtle border border-border rounded px-4 py-3 text-[13px] text-tx space-y-1">
                <p className="font-medium">Email envoyé ✓</p>
                <p className="text-tx-3">Vérifiez votre boîte mail et suivez le lien pour réinitialiser votre mot de passe.</p>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-tx-2">Saisissez votre email pour recevoir un lien de réinitialisation.</p>
                <div className="space-y-2.5">
                  <input
                    className={inputClass}
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleReset()}
                    autoFocus
                  />
                  <button className={btnPrimary} onClick={handleReset}>
                    Envoyer le lien
                  </button>
                </div>
              </>
            )}

            <button
              className="text-[12px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-tx-2 underline"
              onClick={() => { setMode("login"); setError(null); setResetSent(false); }}
            >
              ← Retour à la connexion
            </button>
          </>
        )}

        {error && <p className="text-[12px] text-red-500">{error}</p>}
      </div>
    </div>
  );
}

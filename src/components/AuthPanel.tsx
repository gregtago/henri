"use client";

import { useState } from "react";
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup
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

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError("Connexion Google impossible.");
    }
  };

  const handleReset = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Saisissez votre email d'abord.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch {
      setError("Impossible d'envoyer l'email. Vérifiez l'adresse.");
    }
  };

  const inputClass = "w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3";
  const btnPrimary = "w-full font-[inherit] text-[13.5px] bg-tx text-bg border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity";
  const btnSecondary = "w-full font-[inherit] text-[13.5px] bg-bg border border-border text-tx-2 rounded py-2 cursor-pointer hover:bg-bg-hover hover:text-tx transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
      <div className="w-full max-w-sm bg-bg border border-border rounded-xl shadow-sm p-7 space-y-5">

        <div className="space-y-1">
          <img src="/logo-henri.png" alt="Henri" className="h-9 w-auto" />
          <p className="text-[13px] text-tx-3">Gestion notariale</p>
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

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-bg px-2 text-[11px] text-tx-3">ou</span>
              </div>
            </div>

            <button className={btnSecondary} onClick={handleGoogleLogin}>
              Continuer avec Google
            </button>
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

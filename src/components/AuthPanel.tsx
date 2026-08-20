"use client";

import { useState } from "react";
import {
  signInWithEmailAndPassword,
  type MultiFactorResolver,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { SIGNUP_DOMAIN } from "@/lib/signupDomain";
import {
  completeSignInWithCode,
  mfaMessage,
  needsSecondFactor,
  secondFactorResolver,
} from "@/lib/mfa";

export default function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<"login" | "reset" | "signup">("login");
  const [signupSent, setSignupSent] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);

  // Un compte protégé par un second facteur ne se connecte pas en une fois :
  // le mot de passe accepté, Firebase interrompt la connexion et réclame le
  // code. Ce n'est donc pas un échec — c'est la deuxième moitié du geste, et
  // l'écran demande simplement les six chiffres.
  const handleEmailLogin = async () => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (needsSecondFactor(err)) {
        setResolver(secondFactorResolver(auth, err));
        setCode("");
        return;
      }
      setError("Connexion impossible. Vérifiez vos identifiants.");
    }
  };

  const handleSecondFactor = async () => {
    if (!resolver || codeLoading) return;
    if (code.trim().length < 6) { setError("Le code compte six chiffres."); return; }
    setError(null);
    setCodeLoading(true);
    try {
      await completeSignInWithCode(resolver, code);
    } catch (err) {
      setError(mfaMessage(err));
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCancelSecondFactor = () => {
    setResolver(null);
    setCode("");
    setError(null);
    setPassword("");
  };

  const handleReset = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Saisissez votre email d'abord.");
      return;
    }
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Erreur lors de l'envoi.");
        return;
      }
      setResetSent(true);
    } catch (err: any) {
      setError("Impossible de contacter le serveur. Réessayez.");
    }
  };

  // L'inscription ne crée pas de compte : elle demande le lien qui permettra
  // d'en créer un. C'est ce lien, reçu à l'adresse saisie, qui prouve que
  // l'adresse est bien celle de la personne — le domaine, lui, est vérifié par
  // le serveur (`/api/signup`), jamais ici : un écran ne garde rien.
  const handleSignup = async () => {
    const trimmed = email.trim().toLowerCase();
    setError(null);
    if (!trimmed) { setError("Saisissez votre adresse professionnelle."); return; }
    setSignupLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "L'inscription a échoué.");
        return;
      }
      setSignupSent(true);
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setSignupLoading(false);
    }
  };

  const inputClass = "w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3";
  const btnPrimary = "w-full font-[inherit] text-[13.5px] bg-tx text-bg border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity";
  const btnSecondary = "w-full font-[inherit] text-[13.5px] bg-bg border border-border text-tx-2 rounded py-2 cursor-pointer hover:bg-bg-hover hover:text-tx transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
      <div className="w-full max-w-sm bg-bg border border-border rounded-xl shadow-sm p-7 space-y-5">

        <div className="flex flex-col items-center text-center space-y-2 pb-1">
          <img src="/logo-henri-new.png" alt="Henri" style={{width:"200px", height:"auto"}} />
          <p className="text-[13.5px] text-tx-3 leading-snug">Une nouvelle manière de piloter vos dossiers.</p>
        </div>

        {resolver ? (
          <>
            <div className="space-y-2.5">
              <p className="text-[13px] text-tx-2">
                Votre compte demande un second code. Ouvrez votre application d&apos;authentification et recopiez les six chiffres qu&apos;elle affiche.
              </p>
              <input
                className={`${inputClass} text-[15px] tracking-[0.3em]`}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleSecondFactor()}
                autoFocus
              />
              <button className={btnPrimary} disabled={codeLoading || code.length < 6} onClick={handleSecondFactor}>
                {codeLoading ? "Vérification…" : "Se connecter"}
              </button>
            </div>

            <button
              className="text-[12px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-tx-2 underline"
              onClick={handleCancelSecondFactor}
            >
              ← Retour à la connexion
            </button>
          </>
        ) : mode === "login" ? (
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
              <button
                className="text-[12px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-tx-2 underline"
                onClick={() => { setMode("signup"); setError(null); }}
              >
                Créer un compte
              </button>
            </div>


          </>
        ) : mode === "signup" ? (
          <>
            {signupSent ? (
              <div className="bg-bg-subtle border border-border rounded px-4 py-3 text-[13px] text-tx space-y-1">
                <p className="font-medium">C&apos;est parti ✓</p>
                <p className="text-tx-3">Si cette adresse ouvre droit à l&apos;inscription, un lien vient de vous être envoyé. Il est valable 7 jours et c&apos;est lui qui vous fera créer votre mot de passe.</p>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-tx-2">
                  Henri est réservé aux professionnels du notariat : l&apos;inscription se fait avec une adresse en <strong className="text-tx">{SIGNUP_DOMAIN}</strong>. Vous recevrez un lien pour créer votre compte.
                </p>
                <div className="space-y-2.5">
                  <input
                    className={inputClass}
                    placeholder={`prenom.nom@${SIGNUP_DOMAIN}`}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                    autoFocus
                  />
                  <button className={btnPrimary} disabled={signupLoading} onClick={handleSignup}>
                    {signupLoading ? "Envoi…" : "Recevoir mon lien d'inscription"}
                  </button>
                </div>
              </>
            )}

            <button
              className="text-[12px] text-tx-3 bg-transparent border-none cursor-pointer hover:text-tx-2 underline"
              onClick={() => { setMode("login"); setError(null); setSignupSent(false); }}
            >
              ← Retour à la connexion
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

        {error && <p className="text-[12px] text-danger-soft">{error}</p>}
      </div>
    </div>
  );
}

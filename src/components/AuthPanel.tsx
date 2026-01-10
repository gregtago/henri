"use client";

import { useState } from "react";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async () => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError("Connexion impossible. Vérifiez vos identifiants.");
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError("Connexion Google impossible.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Henri</h1>
          <p className="text-sm text-slate-500">Organisation notariale, mode Finder.</p>
        </div>
        <div className="space-y-3">
          <input
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            placeholder="Mot de passe"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="w-full bg-slate-900 text-white rounded-md py-2 text-sm"
            onClick={handleEmailLogin}
          >
            Se connecter
          </button>
        </div>
        <button
          className="w-full border border-slate-200 rounded-md py-2 text-sm"
          onClick={handleGoogleLogin}
        >
          Continuer avec Google
        </button>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </div>
    </div>
  );
}

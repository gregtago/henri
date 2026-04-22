"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getInvitation, markInvitationUsed, type Invitation } from "@/lib/firestore";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    getInvitation(token).then((inv) => {
      setLoading(false);
      if (!inv) { setError("Ce lien d'invitation est invalide."); return; }
      if (inv.status === "used") { setError("Ce lien a déjà été utilisé."); return; }
      if (new Date(inv.expiresAt) < new Date()) { setError("Ce lien a expiré."); return; }
      setInvitation(inv);
    });
  }, [token]);

  const handleCreate = async () => {
    if (!invitation) return;
    if (password.length < 8) { setError("Le mot de passe doit faire au moins 8 caractères."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await createUserWithEmailAndPassword(auth, invitation.email, password);
      // Marquer l'invitation comme utilisée — ne bloque pas si ça échoue
      markInvitationUsed(token).catch(() => {});
      setDone(true);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") {
        setError("Un compte existe déjà avec cet email.");
      } else {
        setError("Erreur lors de la création du compte.");
      }
      setSubmitting(false);
    }
  };

  const inputClass = "w-full font-[inherit] text-[13px] bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3";
  const btnClass = "w-full font-[inherit] text-[13.5px] bg-tx text-bg border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
      <div className="w-full max-w-sm bg-bg border border-border rounded-xl shadow-sm p-7 space-y-5">

        <div className="flex flex-col items-center text-center space-y-2 pb-1">
          <img src="/logo-henri-new.png" alt="Henri" style={{width:"180px", height:"auto"}} />
          <p className="text-[13px] text-tx-3">Une nouvelle manière de piloter vos dossiers.</p>
        </div>

        {loading && (
          <p className="text-[13px] text-tx-3 text-center">Vérification du lien…</p>
        )}

        {!loading && error && !invitation && (
          <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-[13px] text-red-600">
            {error}
          </div>
        )}

        {!loading && done && (
          <div className="bg-green-50 border border-green-200 rounded px-4 py-3 text-[13px] text-green-700 space-y-1">
            <p className="font-medium">Compte créé avec succès ✓</p>
              <p className="text-green-600">Bienvenue dans Henri !</p>
              <button onClick={() => router.push("/")} className="w-full font-[inherit] text-[13.5px] bg-green-700 text-white border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity mt-2">
                Accéder à Henri →
              </button>
          </div>
        )}

        {!loading && invitation && !done && (
          <>
            <div className="bg-bg-subtle border border-border rounded px-4 py-3 text-[13px] text-tx space-y-0.5">
              <p className="text-tx-3">Vous avez été invité à rejoindre Henri.</p>
              <p className="font-medium">{invitation.email}</p>
            </div>

            <div className="space-y-2.5">
              <input
                className={inputClass}
                type="password"
                placeholder="Choisissez un mot de passe"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <input
                className={inputClass}
                type="password"
                placeholder="Confirmez le mot de passe"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
              <button
                className={btnClass}
                onClick={handleCreate}
                disabled={submitting}
              >
                {submitting ? "Création…" : "Créer mon compte"}
              </button>
            </div>

            {error && <p className="text-[12px] text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

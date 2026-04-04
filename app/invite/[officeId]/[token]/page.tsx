"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  type User
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { acceptInvitation, getOffice } from "@/lib/office-firestore";
import type { Invitation } from "@/lib/office-types";
import type { OfficeRole } from "@/lib/office-types";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const officeId = params.officeId as string;
  const token = params.token as string;

  const [user, setUser] = useState<User | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [officeName, setOfficeName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Charger l'invitation
  useEffect(() => {
    const loadInvitation = async () => {
      try {
        // Chercher l'invitation par token dans les invitations de l'étude
        const snap = await getDoc(doc(db, `offices/${officeId}`));
        if (!snap.exists()) { setError("Étude introuvable."); setLoading(false); return; }
        setOfficeName(snap.data().name);

        // Chercher l'invitation correspondant au token
        const { getDocs, collection, query, where } = await import("firebase/firestore");
        const q = query(collection(db, `offices/${officeId}/invitations`), where("token", "==", token));
        const invSnap = await getDocs(q);

        if (invSnap.empty) { setError("Invitation introuvable ou expirée."); setLoading(false); return; }

        const invData = { id: invSnap.docs[0].id, ...invSnap.docs[0].data() } as Invitation;

        if (invData.usedAt) { setError("Cette invitation a déjà été utilisée."); setLoading(false); return; }
        if (new Date(invData.expiresAt) < new Date()) { setError("Cette invitation a expiré."); setLoading(false); return; }

        setInvitation(invData);
        setEmail(invData.email);
      } catch {
        setError("Erreur lors du chargement de l'invitation.");
      }
      setLoading(false);
    };
    loadInvitation();
  }, [officeId, token]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  const handleAccept = async () => {
    if (!invitation || !user) return;
    setSubmitting(true);
    try {
      await acceptInvitation(user.uid, user.email!, officeId, invitation.id, invitation.role);
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    } catch {
      setError("Erreur lors de l'acceptation.");
    }
    setSubmitting(false);
  };

  const handleRegister = async () => {
    if (!invitation) return;
    setSubmitting(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await acceptInvitation(cred.user.uid, email, officeId, invitation.id, invitation.role);
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") setError("Cet email est déjà utilisé. Connectez-vous.");
      else if (code === "auth/weak-password") setError("Mot de passe trop court (min. 6 caractères).");
      else setError(err.message ?? "Erreur.");
    }
    setSubmitting(false);
  };

  const handleLogin = async () => {
    if (!invitation) return;
    setSubmitting(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await acceptInvitation(cred.user.uid, email, officeId, invitation.id, invitation.role);
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    } catch (err: any) {
      setError("Connexion impossible. Vérifiez vos identifiants.");
    }
    setSubmitting(false);
  };

  const inputClass = "font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors w-full";
  const btnPrimary = "w-full font-[inherit] text-[14px] bg-tx text-bg border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity";

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-tx-3">Chargement…</div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
      <div className="w-full max-w-sm bg-bg border border-border rounded-xl shadow-sm p-7 space-y-5">
        <div>
          <img src="/logo-henri.png" alt="Henri" style={{width:"180px", height:"auto"}} className="mb-3" />
          {error ? (
            <p className="text-[13px] text-red-500">{error}</p>
          ) : done ? (
            <p className="text-[13px] text-green-600 font-medium">Bienvenue ! Redirection…</p>
          ) : invitation ? (
            <>
              <p className="text-[15px] font-semibold text-tx">Rejoindre {officeName}</p>
              <p className="text-[13px] text-tx-3 mt-1">
                Vous avez été invité comme <strong>{invitation.role === "admin" ? "administrateur" : "collaborateur"}</strong>.
              </p>
            </>
          ) : null}
        </div>

        {!error && !done && invitation && (
          <>
            {user ? (
              <div className="space-y-3">
                <p className="text-[13px] text-tx-2">
                  Connecté en tant que <strong>{user.email}</strong>.
                </p>
                <button className={btnPrimary} onClick={handleAccept} disabled={submitting}>
                  {submitting ? "Acceptation…" : "Rejoindre l'étude"}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 text-[13px] py-1.5 rounded border cursor-pointer font-[inherit] transition-all ${mode === "register" ? "bg-tx text-bg border-tx" : "bg-bg-subtle border-border text-tx-2"}`}
                    onClick={() => setMode("register")}>Créer un compte</button>
                  <button
                    className={`flex-1 text-[13px] py-1.5 rounded border cursor-pointer font-[inherit] transition-all ${mode === "login" ? "bg-tx text-bg border-tx" : "bg-bg-subtle border-border text-tx-2"}`}
                    onClick={() => setMode("login")}>Se connecter</button>
                </div>

                <div className="space-y-2.5">
                  <input className={inputClass} type="email" placeholder="Email" value={email}
                    onChange={e => setEmail(e.target.value)} />
                  <input className={inputClass} type="password" placeholder="Mot de passe (min. 6 car.)"
                    value={password} onChange={e => setPassword(e.target.value)} />
                  {error && <p className="text-[12px] text-red-500">{error}</p>}
                  <button className={btnPrimary}
                    onClick={mode === "register" ? handleRegister : handleLogin}
                    disabled={submitting}>
                    {submitting ? "…" : mode === "register" ? "Créer le compte et rejoindre" : "Se connecter et rejoindre"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

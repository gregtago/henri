"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
  checkActionCode,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import LoadingScreen from "@/components/LoadingScreen";

function ActionContent() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");

  const [phase, setPhase] = useState<"loading" | "form" | "done" | "error">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Vérification du code à l'arrivée
  useEffect(() => {
    if (!mode || !oobCode) {
      setErrorMsg("Lien incomplet ou invalide.");
      setPhase("error");
      return;
    }
    (async () => {
      try {
        if (mode === "resetPassword") {
          const userEmail = await verifyPasswordResetCode(auth, oobCode);
          setEmail(userEmail);
          setPhase("form");
        } else if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          setPhase("done");
        } else if (mode === "recoverEmail") {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setEmail(info.data.email ?? null);
          setPhase("done");
        } else {
          setErrorMsg("Action inconnue.");
          setPhase("error");
        }
      } catch (err: any) {
        const code = err?.code ?? "";
        if (code === "auth/expired-action-code") {
          setErrorMsg("Le lien a expiré. Recommencez depuis la page de connexion.");
        } else if (code === "auth/invalid-action-code") {
          setErrorMsg("Le lien est invalide ou a déjà été utilisé.");
        } else if (code === "auth/user-not-found" || code === "auth/user-disabled") {
          setErrorMsg("Ce compte n'existe plus.");
        } else {
          setErrorMsg("Erreur : " + (err?.message ?? "inconnue"));
        }
        setPhase("error");
      }
    })();
  }, [mode, oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode) return;
    if (newPassword.length < 8) {
      setErrorMsg("Mot de passe trop court (8 caractères minimum).");
      return;
    }
    if (newPassword !== confirmPwd) {
      setErrorMsg("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setPhase("done");
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/weak-password") {
        setErrorMsg("Mot de passe trop faible.");
      } else if (code === "auth/expired-action-code") {
        setErrorMsg("Le lien a expiré. Recommencez depuis la page de connexion.");
      } else {
        setErrorMsg("Erreur : " + (err?.message ?? "inconnue"));
      }
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-subtle)", padding: "20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "var(--bg)", borderRadius: "16px", boxShadow: "0 2px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        {/* Bandeau ambré */}
        <div style={{ height: "4px", background: "var(--warn-accent)" }} />

        <div style={{ padding: "40px 36px" }}>
          <Link href="/" style={{ display: "inline-block", marginBottom: "28px" }}>
            <img src="/logo-henri.png" alt="Henri" style={{ height: "40px" }} />
          </Link>

          {phase === "loading" && (
            <>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>Vérification…</h1>
              <p style={{ fontSize: "14px", color: "var(--text-2)" }}>Un instant.</p>
            </>
          )}

          {phase === "form" && mode === "resetPassword" && (
            <>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
                Nouveau mot de passe
              </h1>
              <p style={{ fontSize: "14px", color: "var(--text-2)", marginBottom: "24px", lineHeight: 1.6 }}>
                Choisis un nouveau mot de passe pour <strong style={{ color: "var(--text)" }}>{email}</strong>.
              </p>
              <form onSubmit={handleSubmit}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ width: "100%", padding: "12px 14px", fontSize: "15px", border: "1.5px solid var(--border)", borderRadius: "10px", outline: "none", boxSizing: "border-box", marginBottom: "16px", fontFamily: "inherit" }}
                />
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                  Confirmer
                </label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ width: "100%", padding: "12px 14px", fontSize: "15px", border: "1.5px solid var(--border)", borderRadius: "10px", outline: "none", boxSizing: "border-box", marginBottom: "20px", fontFamily: "inherit" }}
                />
                {errorMsg && (
                  <p style={{ fontSize: "13px", color: "var(--danger-fg)", marginBottom: "16px", padding: "10px 12px", background: "var(--danger-bg-soft)", borderRadius: "8px", border: "1px solid var(--danger-border)" }}>
                    {errorMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ width: "100%", padding: "13px", fontSize: "15px", fontWeight: 600, color: "var(--bg)", background: submitting ? "var(--text-3)" : "var(--text)", border: "none", borderRadius: "10px", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {submitting ? "Enregistrement…" : "Définir le mot de passe"}
                </button>
              </form>
            </>
          )}

          {phase === "done" && (
            <>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
                {mode === "resetPassword" ? "Mot de passe modifié" : mode === "verifyEmail" ? "Email vérifié" : "Action confirmée"}
              </h1>
              <p style={{ fontSize: "14px", color: "var(--text-2)", marginBottom: "28px", lineHeight: 1.6 }}>
                {mode === "resetPassword"
                  ? "Tu peux maintenant te connecter avec ton nouveau mot de passe."
                  : "C'est validé. Tu peux retourner sur l'application."}
              </p>
              <button
                onClick={() => router.push("/")}
                style={{ width: "100%", padding: "13px", fontSize: "15px", fontWeight: 600, color: "var(--bg)", background: "var(--text)", border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                Aller à la connexion
              </button>
            </>
          )}

          {phase === "error" && (
            <>
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
                Lien invalide
              </h1>
              <p style={{ fontSize: "14px", color: "var(--text-2)", marginBottom: "20px", lineHeight: 1.6 }}>
                {errorMsg ?? "Ce lien n'est plus utilisable."}
              </p>
              <button
                onClick={() => router.push("/")}
                style={{ width: "100%", padding: "13px", fontSize: "15px", fontWeight: 600, color: "var(--bg)", background: "var(--text)", border: "none", borderRadius: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                Retour à la connexion
              </button>
            </>
          )}
        </div>

        <div style={{ background: "#fafafa", borderTop: "1px solid var(--bg-hover)", padding: "16px 36px", textAlign: "center" }}>
          <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>
            Henri · henri.tagot.fr
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ActionContent />
    </Suspense>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  createInvitation,
  subscribeInvitations,
  type Invitation,
} from "@/lib/firestore";

const ADMIN_UID = "ByHcIefOjWVdQBcikq5oZtJGGZA2";
const BASE_URL = "https://henri.tagot.fr";

export default function InviteManager({ uid }: { uid: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (uid !== ADMIN_UID) return null;

  useEffect(() => {
    const unsub = subscribeInvitations(setInvitations);
    return () => unsub();
  }, []);

  const handleInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Email invalide.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const token = await createInvitation(uid, trimmed);
      setEmail("");
      const link = `${BASE_URL}/invite/${token}`;
      await navigator.clipboard.writeText(link);
      setCopied(token);
      setTimeout(() => setCopied(null), 3000);
    } catch {
      setError("Erreur lors de la création de l'invitation.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(`${BASE_URL}/invite/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (inv: Invitation) =>
    new Date(inv.expiresAt) < new Date();

  const inputClass =
    "flex-1 font-[inherit] text-[13px] bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-2">
          Inviter un beta testeur
        </p>
        <div className="flex gap-2">
          <input
            className={inputClass}
            type="email"
            placeholder="email@exemple.fr"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleInvite()}
          />
          <button
            onClick={handleInvite}
            disabled={loading}
            className="font-[inherit] text-[13px] px-4 py-1.5 bg-tx text-bg rounded-lg border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            {loading ? "…" : "Inviter"}
          </button>
        </div>
        {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
        {copied && (
          <p className="text-[11px] text-green-600 mt-1">
            ✓ Lien copié dans le presse-papier
          </p>
        )}
      </div>

      {invitations.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-2">
            Invitations envoyées
          </p>
          <div className="space-y-1.5">
            {invitations.map(inv => (
              <div
                key={inv.token}
                className="flex items-center gap-2 px-3 py-2 bg-bg-subtle border border-border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-tx truncate">{inv.email}</p>
                  <p className="text-[10px] text-tx-3">
                    {new Date(inv.createdAt).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {inv.status === "used" ? (
                      <span className="text-green-600">Utilisée</span>
                    ) : isExpired(inv) ? (
                      <span className="text-red-500">Expirée</span>
                    ) : (
                      <span className="text-tx-3">
                        Expire le{" "}
                        {new Date(inv.expiresAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                  </p>
                </div>
                {inv.status === "pending" && !isExpired(inv) && (
                  <button
                    onClick={() => copyLink(inv.token)}
                    className="text-[11px] font-[inherit] px-2 py-1 border border-border rounded bg-bg text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors shrink-0"
                  >
                    {copied === inv.token ? "✓ Copié" : "Copier le lien"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

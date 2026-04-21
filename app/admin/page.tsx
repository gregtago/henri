"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  createInvitation,
  subscribeInvitations,
  type Invitation,
} from "@/lib/firestore";
import Link from "next/link";

const ADMIN_UID = "ByHcIefOjWVdQBcikq5oZtJGGZA2";
const BASE_URL = "https://henri.tagot.fr";

type UserRecord = {
  uid: string;
  email: string;
  disabled: boolean;
  createdAt: string;
  lastSignIn: string;
  lastActivity: string | null;
  casesCount: number;
  itemsCount: number;
  floatingCount: number;
  doneCount: number;
};

type Tab = "users" | "invitations";

export default function AdminPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("users");

  // Users
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ uid: string; msg: string; type: "ok" | "err" } | null>(null);

  // Invitations
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ok: number; skipped: string[]} | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/"); return; }
      if (u.uid !== ADMIN_UID) { router.push("/"); return; }
      setUid(u.uid);
      const t = await getIdToken(u);
      setToken(t);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeInvitations(setInvitations);
    return () => unsub();
  }, [uid]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && tab === "users") fetchUsers();
  }, [token, tab, fetchUsers]);

  const doAction = async (targetUid: string, action: string) => {
    if (!token) return;
    setActionLoading(`${targetUid}-${action}`);
    setActionResult(null);
    try {
      const res = await fetch("/api/admin/user-action", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: targetUid, action }),
      });
      const data = await res.json();
      if (data.success) {
        setActionResult({ uid: targetUid, msg: data.message ?? data.link ?? "OK", type: "ok" });
        fetchUsers();
      } else {
        setActionResult({ uid: targetUid, msg: data.error, type: "err" });
      }
    } catch {
      setActionResult({ uid: targetUid, msg: "Erreur réseau", type: "err" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async () => {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setInviteError("Email invalide."); return;
    }
    setInviteError(null);
    setInviteLoading(true);
    try {
      const tok = await createInvitation(uid!, trimmed);
      setInviteEmail("");
      const link = `${BASE_URL}/invite/${tok}`;
      await navigator.clipboard.writeText(link);
      setCopied(tok);
      setTimeout(() => setCopied(null), 3000);
    } catch {
      setInviteError("Erreur lors de la création.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCsvImport = async (file: File) => {
    if (!uid) return;
    setCsvImporting(true);
    setCsvResult(null);
    setInviteError(null);
    try {
      const text = await file.text();
      // Extraire tous les emails valides du CSV (n'importe quelle colonne)
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const found = text.match(emailRegex) ?? [];
      const unique = [...new Set(found.map(e => e.toLowerCase().trim()))];
      if (unique.length === 0) { setInviteError("Aucun email trouvé dans le fichier."); setCsvImporting(false); return; }

      const skipped: string[] = [];
      let ok = 0;
      for (const email of unique) {
        try {
          await createInvitation(uid, email);
          ok++;
        } catch {
          skipped.push(email);
        }
      }
      setCsvResult({ ok, skipped });
    } catch {
      setInviteError("Erreur lors de la lecture du fichier.");
    } finally {
      setCsvImporting(false);
    }
  };

  const copyLink = async (tok: string) => {
    await navigator.clipboard.writeText(`${BASE_URL}/invite/${tok}`);
    setCopied(tok);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (inv: Invitation) => new Date(inv.expiresAt) < new Date();

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric"
  });

  if (!uid) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
      <p className="text-tx-3 text-[13px]">Vérification des droits…</p>
    </div>
  );

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-[13px] font-medium border-none cursor-pointer transition-colors rounded-lg ${
      tab === t ? "bg-tx text-bg" : "bg-transparent text-tx-3 hover:text-tx hover:bg-bg-hover"
    }`;

  return (
    <div className="min-h-screen bg-bg-subtle">
      {/* Header */}
      <header className="h-[52px] bg-bg border-b border-border flex items-center px-6 gap-4">
        <Link href="/" className="text-[13px] text-tx-3 hover:text-tx transition-colors">← Henri</Link>
        <span className="text-border">|</span>
        <img src="/logo-henri-new.png" alt="Henri" style={{ height: "28px", width: "auto" }} />
        <span className="text-[13px] font-medium text-tx ml-1">Administration</span>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Tabs */}
        <div className="flex gap-2">
          <button className={tabClass("users")} onClick={() => setTab("users")}>
            Utilisateurs {users.length > 0 && `(${users.length})`}
          </button>
          <button className={tabClass("invitations")} onClick={() => setTab("invitations")}>
            Invitations {invitations.length > 0 && `(${invitations.length})`}
          </button>
        </div>

        {/* ── USERS ── */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">
                {users.length} compte{users.length > 1 ? "s" : ""}
              </p>
              <button
                onClick={fetchUsers}
                disabled={loadingUsers}
                className="text-[12px] font-[inherit] px-3 py-1 border border-border rounded-lg bg-bg text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors disabled:opacity-50"
              >
                {loadingUsers ? "Chargement…" : "↻ Actualiser"}
              </button>
            </div>

            {loadingUsers && users.length === 0 ? (
              <p className="text-[13px] text-tx-3">Chargement des utilisateurs…</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                const sorted = [...users].sort((a, b) => {
                  const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : a.lastSignIn ? new Date(a.lastSignIn).getTime() : 0;
                  const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : b.lastSignIn ? new Date(b.lastSignIn).getTime() : 0;
                  return bTime - aTime;
                });
                const active7 = users.filter(u => u.lastActivity && (Date.now() - new Date(u.lastActivity).getTime()) < 7 * 86400000).length;
                const active30 = users.filter(u => u.lastActivity && (Date.now() - new Date(u.lastActivity).getTime()) < 30 * 86400000).length;
                const neverUsed = users.filter(u => u.casesCount === 0 && u.floatingCount === 0).length;
                return (
                  <>
                    <div className="flex gap-3 flex-wrap mb-2">
                      {[
                        { label: "Actifs 7j", value: active7, color: "bg-green-50 text-green-700 border-green-200" },
                        { label: "Actifs 30j", value: active30, color: "bg-blue-50 text-blue-700 border-blue-200" },
                        { label: "Jamais utilisé", value: neverUsed, color: neverUsed > 0 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-bg-subtle text-tx-3 border-border" },
                        { label: "Total", value: users.length, color: "bg-bg-subtle text-tx-2 border-border" },
                      ].map(({ label, value, color }) => (
                        <span key={label} className={`text-[12px] font-medium px-3 py-1 rounded-lg border ${color}`}>
                          {value} {label}
                        </span>
                      ))}
                    </div>
                    {sorted.map((u) => (
                  <div key={u.uid}
                    className={`bg-bg border rounded-xl p-4 flex items-start gap-4 transition-colors ${
                      u.disabled ? "border-red-200 opacity-60" : "border-border"
                    }`}
                  >
                    {/* Identité + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-[14px] font-medium text-tx truncate">{u.email}</p>
                        {u.uid === ADMIN_UID && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">ADMIN</span>
                        )}
                        {u.disabled && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">DÉSACTIVÉ</span>
                        )}
                      </div>
                      {/* Dates */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-tx-3 mb-2">
                        <span>Inscrit le {formatDate(u.createdAt)}</span>
                        {u.lastSignIn && <span>Connecté le {formatDate(u.lastSignIn)}</span>}
                        {u.lastActivity
                          ? <span className="text-green-600 font-medium">Actif le {formatDate(u.lastActivity)}</span>
                          : u.casesCount === 0
                            ? <span className="text-orange-500 font-medium">Jamais utilisé</span>
                            : null
                        }
                      </div>
                      {/* Stats pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "dossier", value: u.casesCount, active: "bg-blue-50 text-blue-700 border-blue-200" },
                          { label: "tâche", value: u.itemsCount, active: "bg-purple-50 text-purple-700 border-purple-200" },
                          { label: "traitée", value: u.doneCount, active: "bg-green-50 text-green-700 border-green-200" },
                          { label: "mémo", value: u.floatingCount, active: "bg-amber-50 text-amber-700 border-amber-200" },
                        ].map(({ label, value, active }) => (
                          <span key={label} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${value > 0 ? active : "bg-bg-subtle text-tx-3 border-border"}`}>
                            {value} {label}{value > 1 ? "s" : ""}
                          </span>
                        ))}
                      </div>
                      {actionResult?.uid === u.uid && (
                        <p className={`text-[11px] mt-1.5 ${actionResult.type === "ok" ? "text-green-600" : "text-red-500"}`}>
                          {actionResult.msg}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {u.uid !== ADMIN_UID && (
                      <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                        <button
                          onClick={() => doAction(u.uid, u.disabled ? "enable" : "disable")}
                          disabled={actionLoading === `${u.uid}-${u.disabled ? "enable" : "disable"}`}
                          className="text-[11px] font-[inherit] px-2.5 py-1 border border-border rounded-lg bg-bg-subtle text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors disabled:opacity-50"
                        >
                          {u.disabled ? "Réactiver" : "Désactiver"}
                        </button>
                        <button
                          onClick={() => doAction(u.uid, "resetPassword")}
                          disabled={actionLoading === `${u.uid}-resetPassword`}
                          className="text-[11px] font-[inherit] px-2.5 py-1 border border-border rounded-lg bg-bg-subtle text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors disabled:opacity-50"
                        >
                          Réinitialiser mdp
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer définitivement ${u.email} ?`)) doAction(u.uid, "delete");
                          }}
                          disabled={!!actionLoading}
                          className="text-[11px] font-[inherit] px-2.5 py-1 border border-red-200 rounded-lg bg-bg-subtle text-red-500 cursor-pointer hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                    ))}
                  </>
                );
              })()}
              </div>
            )}
          </div>
        )}

        {/* ── INVITATIONS ── */}
        {tab === "invitations" && (
          <div className="space-y-6">
            {/* Formulaire */}
            <div className="bg-bg border border-border rounded-xl p-5 space-y-3">
              <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">Inviter un beta testeur</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="email@exemple.fr"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                  className="flex-1 font-[inherit] text-[13px] bg-bg-subtle border border-border rounded-lg px-3 py-2 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3"
                />
                <button
                  onClick={handleInvite}
                  disabled={inviteLoading}
                  className="font-[inherit] text-[13px] px-5 py-2 bg-tx text-bg rounded-lg border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {inviteLoading ? "…" : "Inviter"}
                </button>
              </div>
              {inviteError && <p className="text-[11px] text-red-500">{inviteError}</p>}
              {copied && <p className="text-[11px] text-green-600">✓ Lien copié dans le presse-papier !</p>}

              {/* Import CSV */}
              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-2">Importer une liste d'emails</p>
                <div className="flex items-center gap-3">
                  <label className={`font-[inherit] text-[13px] px-4 py-2 border border-border rounded-lg cursor-pointer transition-colors ${csvImporting ? "opacity-50 pointer-events-none" : "bg-bg-subtle text-tx-2 hover:bg-bg-hover"}`}>
                    {csvImporting ? "Import en cours…" : "📄 Choisir un fichier CSV"}
                    <input type="file" accept=".csv,.txt" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { handleCsvImport(f); e.target.value = ""; } }} />
                  </label>
                  <p className="text-[11px] text-tx-3">Fichier CSV ou TXT — un email par ligne (ou séparés par virgule/point-virgule)</p>
                </div>
                {csvResult && (
                  <div className="mt-2 p-3 bg-bg-subtle border border-border rounded-lg space-y-1">
                    <p className="text-[12px] text-green-600 font-medium">✓ {csvResult.ok} invitation{csvResult.ok > 1 ? "s" : ""} créée{csvResult.ok > 1 ? "s" : ""}</p>
                    {csvResult.skipped.length > 0 && (
                      <p className="text-[11px] text-red-500">Échec : {csvResult.skipped.join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Liste */}
            {invitations.length === 0 ? (
              <p className="text-[13px] text-tx-3">Aucune invitation envoyée.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">
                  {invitations.length} invitation{invitations.length > 1 ? "s" : ""}
                </p>
                {invitations.map(inv => (
                  <div key={inv.token}
                    className="bg-bg border border-border rounded-xl p-4 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-tx truncate">{inv.email}</p>
                      <div className="flex gap-3 text-[11px] text-tx-3 mt-0.5">
                        <span>Envoyée le {formatDate(inv.createdAt)}</span>
                        {inv.status === "used" ? (
                          <span className="text-green-600 font-medium">✓ Utilisée</span>
                        ) : isExpired(inv) ? (
                          <span className="text-red-500">Expirée</span>
                        ) : (
                          <span>Expire le {formatDate(inv.expiresAt)}</span>
                        )}
                      </div>
                    </div>
                    {inv.status === "pending" && !isExpired(inv) && (
                      <button
                        onClick={() => copyLink(inv.token)}
                        className="text-[11px] font-[inherit] px-3 py-1.5 border border-border rounded-lg bg-bg-subtle text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors shrink-0"
                      >
                        {copied === inv.token ? "✓ Copié" : "Copier le lien"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

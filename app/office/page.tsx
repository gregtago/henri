"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useOffice, OfficeProvider } from "@/lib/office-context";
import {
  createOffice,
  createInvitation,
  subscribeInvitations,
  deleteInvitation,
  updateMemberRole,
  removeMember,
} from "@/lib/office-firestore";
import type { Invitation, OfficeRole } from "@/lib/office-types";

function OfficePageContent({ user }: { user: User }) {
  const { officeId, office, members, currentMember, isAdmin, loading } = useOffice();
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  // Formulaire création étude
  const [crpcen, setCrpcen] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Formulaire invitation
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OfficeRole>("member");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!officeId) return;
    const unsub = subscribeInvitations(officeId, setInvitations);
    return () => unsub();
  }, [officeId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateOffice = async () => {
    if (!crpcen.trim() || !officeName.trim()) {
      setCreateError("CRPCEN et nom requis.");
      return;
    }
    if (!/^\d{5}$/.test(crpcen.trim())) {
      setCreateError("Le CRPCEN doit être composé de 5 chiffres.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createOffice(user.uid, user.email!, crpcen.trim(), officeName.trim());
      showToast("Étude créée.");
    } catch (err: any) {
      setCreateError(err.message ?? "Erreur lors de la création.");
    }
    setCreating(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !officeId) return;
    setInviting(true);
    try {
      const inv = await createInvitation(officeId, inviteEmail.trim(), inviteRole);
      const link = `${window.location.origin}/invite/${officeId}/${inv.token}`;
      setInviteLink(link);
      await navigator.clipboard.writeText(link).catch(() => {});
      showToast("Lien d'invitation copié !");
      setInviteEmail("");
    } catch {
      showToast("Erreur lors de la création de l'invitation.");
    }
    setInviting(false);
  };

  const btnGhost = "text-[13px] font-[inherit] bg-bg border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong hover:text-tx transition-all";
  const btnPrimary = "text-[13px] font-[inherit] bg-tx text-bg border-none px-4 py-1.5 rounded cursor-pointer hover:opacity-90 transition-opacity";
  const btnDanger = "text-[13px] font-[inherit] bg-bg border border-[#fecaca] text-red-600 px-3 py-1.5 rounded cursor-pointer hover:bg-red-50 transition-all";
  const input = "font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors w-full";
  const sectionTitle = "text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-4";
  const card = "bg-bg border border-border rounded-xl overflow-hidden px-4 py-4 space-y-3";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-tx-3 text-[14px]">
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-5 py-10 space-y-8">

        {!officeId ? (
          /* ── PAS D'ÉTUDE — CRÉER ── */
          <section>
            <h2 className={sectionTitle}>Créer votre étude</h2>
            <div className={card}>
              <p className="text-[13px] text-tx-2">
                Henri est organisé par étude notariale. Créez votre étude pour inviter vos collaborateurs et partager vos dossiers.
              </p>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[12px] text-tx-3 mb-1 block">CRPCEN (5 chiffres)</label>
                  <input className={input} placeholder="75056" value={crpcen}
                    onChange={e => setCrpcen(e.target.value)} maxLength={5} />
                </div>
                <div>
                  <label className="text-[12px] text-tx-3 mb-1 block">Nom de l'étude</label>
                  <input className={input} placeholder="Tagot Notaires" value={officeName}
                    onChange={e => setOfficeName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreateOffice()} />
                </div>
                {createError && <p className="text-[12px] text-red-500">{createError}</p>}
                <button className={btnPrimary} onClick={handleCreateOffice} disabled={creating}>
                  {creating ? "Création…" : "Créer l'étude"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* ── ÉTUDE ── */}
            <section>
              <h2 className={sectionTitle}>Étude</h2>
              <div className={card}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-semibold text-tx">{office?.name}</p>
                    <p className="text-[12.5px] text-tx-3 mt-0.5">CRPCEN {officeId}</p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                    isAdmin ? "bg-blue-50 text-blue-700" : "bg-bg-subtle text-tx-3"
                  }`}>
                    {isAdmin ? "Admin" : "Collaborateur"}
                  </span>
                </div>
              </div>
            </section>

            {/* ── MEMBRES ── */}
            <section>
              <h2 className={sectionTitle}>Membres ({members.length})</h2>
              <div className="bg-bg border border-border rounded-xl overflow-hidden">
                {members.map((m, i) => (
                  <div key={m.uid}
                    className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-tx font-medium truncate">
                        {m.displayName || m.email}
                      </p>
                      {m.displayName && (
                        <p className="text-[12px] text-tx-3 truncate">{m.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && m.uid !== user.uid ? (
                        <>
                          <select
                            className="text-[12px] font-[inherit] bg-bg-subtle border border-border text-tx-2 px-2 py-1 rounded cursor-pointer outline-none"
                            value={m.role}
                            onChange={e => updateMemberRole(officeId, m.uid, e.target.value as OfficeRole)}
                          >
                            <option value="member">Collaborateur</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button className={btnDanger}
                            onClick={() => {
                              if (window.confirm(`Retirer ${m.email} de l'étude ?`)) {
                                removeMember(officeId, m.uid);
                              }
                            }}>
                            Retirer
                          </button>
                        </>
                      ) : (
                        <span className={`text-[11px] px-2.5 py-1 rounded-full ${
                          m.role === "admin" ? "bg-blue-50 text-blue-700" : "bg-bg-subtle text-tx-3"
                        }`}>
                          {m.role === "admin" ? "Admin" : "Collaborateur"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── INVITATIONS ── */}
            {isAdmin && (
              <section>
                <h2 className={sectionTitle}>Inviter un collaborateur</h2>
                <div className={card}>
                  <div className="flex gap-2">
                    <input
                      className={input}
                      type="email"
                      placeholder="email@etude.fr"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleInvite()}
                    />
                    <select
                      className="text-[13px] font-[inherit] bg-bg-subtle border border-border text-tx-2 px-2 py-2 rounded cursor-pointer outline-none shrink-0"
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as OfficeRole)}
                    >
                      <option value="member">Collaborateur</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className={btnPrimary} onClick={handleInvite} disabled={inviting}>
                      {inviting ? "…" : "Inviter"}
                    </button>
                  </div>

                  {inviteLink && (
                    <div className="bg-bg-subtle border border-border rounded px-3 py-2 space-y-1">
                      <p className="text-[12px] text-tx-2">Lien d'invitation (copié dans le presse-papier) :</p>
                      <p className="text-[11.5px] text-accent font-mono break-all">{inviteLink}</p>
                      <p className="text-[11px] text-tx-3">Valable 7 jours. Partagez ce lien avec votre collaborateur.</p>
                    </div>
                  )}

                  {/* Invitations en cours */}
                  {invitations.filter(i => !i.usedAt && new Date(i.expiresAt) > new Date()).length > 0 && (
                    <div>
                      <p className="text-[12px] text-tx-3 mb-2">Invitations en attente</p>
                      <div className="space-y-1.5">
                        {invitations
                          .filter(i => !i.usedAt && new Date(i.expiresAt) > new Date())
                          .map(inv => (
                            <div key={inv.id} className="flex items-center justify-between bg-bg-subtle rounded px-3 py-2">
                              <div>
                                <p className="text-[13px] text-tx">{inv.email}</p>
                                <p className="text-[11px] text-tx-3">
                                  Expire le {new Date(inv.expiresAt).toLocaleDateString("fr-FR")}
                                </p>
                              </div>
                              <button className={btnGhost}
                                onClick={() => deleteInvitation(officeId, inv.id)}>
                                Annuler
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-tx text-bg text-[13px] px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function OfficePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-tx-3">Chargement…</div>
  );

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
      <a href="/" className="text-accent underline">Se connecter</a>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-bg-subtle">
      <header className="h-[44px] flex items-center justify-between px-5 border-b border-border bg-bg shrink-0 relative">
        <div className="flex items-center gap-3 z-10">
          <Link href="/settings" className="text-[13px] text-tx-2 hover:text-tx transition-colors">
            ← Préférences
          </Link>
        </div>
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
          <Link href="/" className="pointer-events-auto">
            <img src="/logo-henri.png" alt="Henri" style={{height:"36px", width:"auto"}} />
          </Link>
        </div>
        <div className="z-10">
          <span className="text-[12px] text-tx-3">{user.email}</span>
        </div>
      </header>

      <OfficeProvider uid={user.uid}>
        <OfficePageContent user={user} />
      </OfficeProvider>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged, type User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  isSuperAdmin, getAllOffices, getOfficeMembers,
  createOfficeAsAdmin, deleteOffice
} from "@/lib/superadmin-firestore";
import {
  createInvitation, subscribeInvitations, deleteInvitation,
  updateMemberRole, removeMember
} from "@/lib/office-firestore";
import type { Office, OfficeMember, Invitation, OfficeRole } from "@/lib/office-types";
import Link from "next/link";

type OfficeWithMembers = Office & { members: OfficeMember[]; invitations?: Invitation[] };

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [offices, setOffices] = useState<OfficeWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Record<string, Invitation[]>>({});
  const [toast, setToast] = useState<string | null>(null);

  // Formulaire création utilisateur + étude
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newCrpcen, setNewCrpcen] = useState("");
  const [newOfficeName, setNewOfficeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Formulaire invitation par étude
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [inviteRole, setInviteRole] = useState<Record<string, OfficeRole>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadOffices = async () => {
    const all = await getAllOffices();
    const withMembers = await Promise.all(
      all.map(async o => ({
        ...o,
        members: await getOfficeMembers(o.id),
      }))
    );
    setOffices(withMembers.sort((a, b) => a.name.localeCompare(b.name)));
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ok = await isSuperAdmin(u.uid);
        setAuthorized(ok);
        if (ok) await loadOffices();
      } else {
        setAuthorized(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Souscrire aux invitations d'une étude quand elle est dépliée
  useEffect(() => {
    if (!expandedOffice) return;
    const unsub = subscribeInvitations(expandedOffice, (invs) => {
      setInvitations(prev => ({ ...prev, [expandedOffice]: invs }));
    });
    return () => unsub();
  }, [expandedOffice]);

  const handleCreateUserAndOffice = async () => {
    if (!newEmail.trim() || !newPassword.trim() || !newCrpcen.trim() || !newOfficeName.trim()) {
      setCreateError("Tous les champs sont requis.");
      return;
    }
    if (!/^\d{5}$/.test(newCrpcen.trim())) {
      setCreateError("CRPCEN = 5 chiffres.");
      return;
    }
    if (newPassword.length < 6) {
      setCreateError("Mot de passe : 6 caractères minimum.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // Créer l'utilisateur Firebase Auth
      // On utilise un auth secondaire pour ne pas déconnecter le super-admin
      const { initializeApp, getApps } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword: createUser } = await import("firebase/auth");
      
      // App secondaire temporaire
      const secondaryApp = initializeApp(
        (await import("@/lib/firebase")).firebaseApp.options,
        `secondary-${Date.now()}`
      );
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUser(secondaryAuth, newEmail.trim(), newPassword.trim());
      const newUid = cred.user.uid;
      await secondaryAuth.signOut();
      
      // Créer l'étude avec ce nouvel utilisateur comme admin
      await createOfficeAsAdmin(newCrpcen.trim(), newOfficeName.trim(), newUid, newEmail.trim());
      
      showToast(`Utilisateur et étude ${newCrpcen.trim()} créés.`);
      setNewEmail(""); setNewPassword(""); setNewCrpcen(""); setNewOfficeName("");
      await loadOffices();
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") setCreateError("Email déjà utilisé.");
      else if (code === "auth/invalid-email") setCreateError("Email invalide.");
      else setCreateError(err.message ?? "Erreur.");
    }
    setCreating(false);
  };

  const handleInvite = async (officeId: string) => {
    const email = inviteEmail[officeId]?.trim();
    const role = inviteRole[officeId] ?? "member";
    if (!email) return;
    try {
      const inv = await createInvitation(officeId, email, role);
      const link = `${window.location.origin}/invite/${officeId}/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      showToast("Lien copié !");
      setInviteEmail(prev => ({ ...prev, [officeId]: "" }));
    } catch {
      showToast("Erreur invitation.");
    }
  };

  const handleDeleteOffice = async (officeId: string, name: string) => {
    if (!window.confirm(`Supprimer "${name}" (${officeId}) et tous ses membres ?`)) return;
    await deleteOffice(officeId);
    showToast("Étude supprimée.");
    await loadOffices();
  };

  const handleRemoveMember = async (officeId: string, uid: string) => {
    if (!window.confirm("Retirer ce membre de l'étude ?")) return;
    await removeMember(officeId, uid);
    showToast("Membre retiré.");
    await loadOffices();
  };

  const handleChangeRole = async (officeId: string, uid: string, role: OfficeRole) => {
    await updateMemberRole(officeId, uid, role);
    showToast("Rôle modifié.");
    await loadOffices();
  };

  const input = "w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors";
  const btn = "font-[inherit] text-[13px] bg-tx text-bg border-none rounded px-4 py-2 cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50";
  const btnSm = "font-[inherit] text-[12px] bg-tx text-bg border-none rounded px-3 py-1 cursor-pointer hover:opacity-90 transition-opacity";
  const btnDanger = "font-[inherit] text-[12px] bg-transparent border border-red-300 text-red-500 rounded px-2 py-0.5 cursor-pointer hover:bg-red-50 transition-colors";
  const btnGhost = "font-[inherit] text-[12px] bg-transparent border border-border text-tx-2 rounded px-2 py-0.5 cursor-pointer hover:border-border-strong transition-colors";

  if (loading) return <div className="min-h-screen flex items-center justify-center text-tx-3">Chargement…</div>;
  if (!user) return <div className="min-h-screen flex items-center justify-center text-tx-3">Non connecté. <Link href="/" className="ml-2 text-accent">← App</Link></div>;
  if (!authorized) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-tx font-medium">Accès refusé.</p>
        <p className="text-tx-3 text-[13px]">Page réservée aux super-admins.</p>
        <Link href="/" className="text-accent text-[13px]">← Retour</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-subtle">
      <header className="h-[44px] flex items-center justify-between px-6 border-b border-border bg-bg relative">
        <Link href="/" className="text-[12px] text-tx-3 hover:text-tx z-10">← App</Link>
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
          <img src="/logo-henri.png" alt="Henri" style={{height:"28px", width:"auto"}} />
        </div>
        <span className="text-[12px] text-tx-3 z-10">Super-admin · {user.email}</span>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Créer utilisateur + étude */}
        <section className="bg-bg border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-[14px] font-semibold text-tx">Créer un compte et une étude</h2>
          <p className="text-[12px] text-tx-3">Crée le compte utilisateur Firebase et l'étude en une seule action. Le responsable recevra ses identifiants par vos soins.</p>
          <div className="grid grid-cols-2 gap-3">
            <input className={input} placeholder="Email du responsable" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <input className={input} placeholder="Mot de passe provisoire" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <input className={input} placeholder="CRPCEN (5 chiffres)" value={newCrpcen} onChange={e => setNewCrpcen(e.target.value)} maxLength={5} />
            <input className={input} placeholder="Nom de l'étude" value={newOfficeName} onChange={e => setNewOfficeName(e.target.value)} />
          </div>
          {createError && <p className="text-[12px] text-red-500">{createError}</p>}
          <button className={btn} onClick={handleCreateUserAndOffice} disabled={creating}>
            {creating ? "Création en cours…" : "Créer le compte et l'étude"}
          </button>
        </section>

        {/* Liste études */}
        <section className="space-y-3">
          <h2 className="text-[14px] font-semibold text-tx">{offices.length} étude{offices.length !== 1 ? "s" : ""}</h2>

          {offices.length === 0 && <p className="text-[13px] text-tx-3">Aucune étude.</p>}

          {offices.map(o => {
            const expanded = expandedOffice === o.id;
            const invs = invitations[o.id] ?? [];
            const pendingInvs = invs.filter(i => !i.usedAt);
            return (
              <div key={o.id} className="bg-bg border border-border rounded-xl overflow-hidden">
                {/* Header étude */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-bg-subtle transition-colors"
                  onClick={() => setExpandedOffice(expanded ? null : o.id)}
                >
                  <div>
                    <p className="font-semibold text-tx">{o.name}</p>
                    <p className="text-[12px] text-tx-3">CRPCEN {o.id} · {o.members.length} membre{o.members.length !== 1 ? "s" : ""} · créée le {new Date(o.createdAt).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className={btnDanger} onClick={e => { e.stopPropagation(); handleDeleteOffice(o.id, o.name); }}>
                      Supprimer
                    </button>
                    <span className="text-tx-3 text-[12px]">{expanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border px-5 py-4 space-y-5">

                    {/* Membres */}
                    <div>
                      <p className="text-[12px] font-medium text-tx-3 uppercase tracking-wide mb-3">Membres</p>
                      <div className="space-y-2">
                        {o.members.map(m => (
                          <div key={m.uid} className="flex items-center justify-between py-1.5 px-3 rounded bg-bg-subtle">
                            <div>
                              <span className="text-[13px] text-tx font-medium">{m.displayName || m.email}</span>
                              {m.displayName && <span className="text-[12px] text-tx-3 ml-2">{m.email}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                className="font-[inherit] text-[12px] bg-bg border border-border rounded px-2 py-0.5 cursor-pointer outline-none"
                                value={m.role}
                                onChange={e => handleChangeRole(o.id, m.uid, e.target.value as OfficeRole)}
                              >
                                <option value="admin">Admin</option>
                                <option value="member">Membre</option>
                              </select>
                              <button className={btnDanger} onClick={() => handleRemoveMember(o.id, m.uid)}>
                                Retirer
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Invitations en cours */}
                    {pendingInvs.length > 0 && (
                      <div>
                        <p className="text-[12px] font-medium text-tx-3 uppercase tracking-wide mb-3">Invitations en attente</p>
                        <div className="space-y-1.5">
                          {pendingInvs.map(inv => (
                            <div key={inv.id} className="flex items-center justify-between py-1.5 px-3 rounded bg-bg-subtle text-[12.5px]">
                              <span className="text-tx">{inv.email}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-tx-3">{inv.role}</span>
                                <button
                                  className={btnGhost}
                                  onClick={() => {
                                    const link = `${window.location.origin}/invite/${o.id}/${inv.token}`;
                                    navigator.clipboard.writeText(link).then(() => showToast("Lien copié !"));
                                  }}
                                >Copier le lien</button>
                                <button className={btnDanger} onClick={() => deleteInvitation(o.id, inv.id).then(() => showToast("Invitation supprimée."))}>
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inviter un nouveau membre */}
                    <div>
                      <p className="text-[12px] font-medium text-tx-3 uppercase tracking-wide mb-3">Inviter un membre</p>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-1.5 outline-none focus:border-border-strong"
                          placeholder="Email"
                          type="email"
                          value={inviteEmail[o.id] ?? ""}
                          onChange={e => setInviteEmail(prev => ({ ...prev, [o.id]: e.target.value }))}
                          onKeyDown={e => e.key === "Enter" && handleInvite(o.id)}
                        />
                        <select
                          className="font-[inherit] text-[12px] bg-bg-subtle border border-border rounded px-2 cursor-pointer outline-none"
                          value={inviteRole[o.id] ?? "member"}
                          onChange={e => setInviteRole(prev => ({ ...prev, [o.id]: e.target.value as OfficeRole }))}
                        >
                          <option value="member">Membre</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className={btnSm} onClick={() => handleInvite(o.id)}>
                          Inviter
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-tx text-bg text-[13px] px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

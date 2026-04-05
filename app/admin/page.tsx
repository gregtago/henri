"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  isSuperAdmin, getAllOffices, getOfficeMembers,
  createOfficeAsAdmin, deleteOffice
} from "@/lib/superadmin-firestore";
import type { Office, OfficeMember } from "@/lib/office-types";
import Link from "next/link";

type OfficeWithMembers = Office & { members: OfficeMember[] };

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [offices, setOffices] = useState<OfficeWithMembers[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulaire création
  const [crpcen, setCrpcen] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [adminUid, setAdminUid] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const handleCreate = async () => {
    if (!crpcen.trim() || !officeName.trim() || !adminUid.trim() || !adminEmail.trim()) {
      setCreateError("Tous les champs sont requis.");
      return;
    }
    if (!/^\d{5}$/.test(crpcen.trim())) {
      setCreateError("CRPCEN = 5 chiffres.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createOfficeAsAdmin(crpcen.trim(), officeName.trim(), adminUid.trim(), adminEmail.trim());
      showToast("Étude créée.");
      setCrpcen(""); setOfficeName(""); setAdminUid(""); setAdminEmail("");
      await loadOffices();
    } catch (err: any) {
      setCreateError(err.message ?? "Erreur.");
    }
    setCreating(false);
  };

  const handleDelete = async (officeId: string, officeName: string) => {
    if (!window.confirm(`Supprimer l'étude "${officeName}" (${officeId}) et tous ses membres ?`)) return;
    await deleteOffice(officeId);
    showToast("Étude supprimée.");
    await loadOffices();
  };

  const input = "w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-3 py-2 outline-none focus:border-border-strong transition-colors";
  const btn = "font-[inherit] text-[13px] bg-tx text-bg border-none rounded px-4 py-2 cursor-pointer hover:opacity-90 transition-opacity";
  const btnDanger = "font-[inherit] text-[12px] bg-transparent border border-red-300 text-red-500 rounded px-3 py-1 cursor-pointer hover:bg-red-50 transition-colors";

  if (loading) return <div className="min-h-screen flex items-center justify-center text-tx-3">Chargement…</div>;
  if (!user) return <div className="min-h-screen flex items-center justify-center text-tx-3">Non connecté.</div>;
  if (!authorized) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-tx font-medium">Accès refusé.</p>
        <p className="text-tx-3 text-[13px]">Cette page est réservée aux super-admins.</p>
        <Link href="/" className="text-accent text-[13px]">← Retour</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-subtle">
      {/* Header */}
      <header className="h-[44px] flex items-center justify-between px-6 border-b border-border bg-bg">
        <div className="flex items-center gap-3">
          <img src="/logo-henri.png" alt="Henri" style={{height:"28px", width:"auto"}} />
          <span className="text-[12px] text-tx-3">/ Super-admin</span>
        </div>
        <Link href="/" className="text-[12px] text-tx-3 hover:text-tx transition-colors">← App</Link>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Créer une étude */}
        <section className="bg-bg border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-[13px] font-semibold text-tx">Créer une étude</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className={input} placeholder="CRPCEN (5 chiffres)" value={crpcen} onChange={e => setCrpcen(e.target.value)} />
            <input className={input} placeholder="Nom de l'étude" value={officeName} onChange={e => setOfficeName(e.target.value)} />
            <input className={input} placeholder="UID du responsable" value={adminUid} onChange={e => setAdminUid(e.target.value)} />
            <input className={input} placeholder="Email du responsable" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
          </div>
          {createError && <p className="text-[12px] text-red-500">{createError}</p>}
          <button className={btn} onClick={handleCreate} disabled={creating}>
            {creating ? "Création…" : "Créer l'étude"}
          </button>
        </section>

        {/* Liste des études */}
        <section className="space-y-4">
          <h2 className="text-[13px] font-semibold text-tx">{offices.length} étude{offices.length > 1 ? "s" : ""}</h2>
          {offices.map(o => (
            <div key={o.id} className="bg-bg border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-tx">{o.name}</p>
                  <p className="text-[12px] text-tx-3">CRPCEN {o.id} · créée le {new Date(o.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <button className={btnDanger} onClick={() => handleDelete(o.id, o.name)}>Supprimer</button>
              </div>
              {o.members.length > 0 && (
                <div className="space-y-1 border-t border-border pt-3">
                  {o.members.map(m => (
                    <div key={m.uid} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-tx">{m.displayName || m.email}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-tx-3">{m.email}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded ${m.role === "admin" ? "bg-accent/10 text-accent" : "bg-bg-subtle text-tx-3"}`}>
                          {m.role === "admin" ? "Admin" : "Membre"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {offices.length === 0 && (
            <p className="text-[13px] text-tx-3">Aucune étude pour le moment.</p>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-tx text-bg text-[13px] px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

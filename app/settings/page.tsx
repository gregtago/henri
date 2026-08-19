"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  applySettings,
  type UserSettings,
  type FontChoice,
  type DensityChoice,
  type SortChoice,
} from "@/lib/settings";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribePushTokens, deletePushToken, subscribeCaseTemplates, renameCaseTemplate, deleteCaseTemplate, subscribeShortcutKey, type PushTokenInfo, type ShortcutKeyInfo } from "@/lib/firestore";
import type { CaseTemplate } from "@/lib/types";
import { maskShortcutKey } from "@/lib/shortcutKey";
import { getCurrentToken } from "@/lib/messaging";
import {
  DEFAULT_REMINDER_POLICY,
  DUE_REMINDER_OFF,
  subscribeReminderPolicy,
  saveReminderPolicy,
  type ReminderPolicy,
} from "@/lib/reminderPolicy";

// Nom lisible d'un appareil à partir de son User-Agent.
function describeDevice(ua?: string): { name: string; os: string } {
  if (!ua) return { name: "Appareil", os: "" };
  let os = "";
  if (/iphone/i.test(ua)) os = "iPhone";
  else if (/ipad/i.test(ua)) os = "iPad";
  else if (/android/i.test(ua)) os = "Android";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os x|macintosh/i.test(ua)) os = "Mac";
  else if (/linux/i.test(ua)) os = "Linux";
  let name = "Navigateur";
  if (/\bedg(e|ios|a)?\//i.test(ua)) name = "Edge";
  else if (/chrome|crios/i.test(ua)) name = "Chrome";
  else if (/firefox|fxios/i.test(ua)) name = "Firefox";
  else if (/safari/i.test(ua)) name = "Safari";
  return { name, os };
}

// Convertit un champ date Firestore (Timestamp | ISO string | {seconds}) en Date.
function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  const anyV = v as { toDate?: () => Date; seconds?: number };
  if (typeof anyV.toDate === "function") return anyV.toDate();
  if (typeof anyV.seconds === "number") return new Date(anyV.seconds * 1000);
  if (typeof v === "string") { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}

type Tab = "apparence" | "securite" | "rappels" | "appareils" | "raccourci" | "modeles" | "aide" | "versions" | "legal";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const formatHour = (h: number) => `${String(h).padStart(2, "0")}h`;

export default function SettingsPage() {
  const [s, setS] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("apparence");
  const [aideSection, setAideSection] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<PushTokenInfo[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [notifSupported, setNotifSupported] = useState(true);
  const [caseTemplates, setCaseTemplates] = useState<CaseTemplate[]>([]);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ReminderPolicy>(DEFAULT_REMINDER_POLICY);
  const [policySaved, setPolicySaved] = useState(false);
  const [shortcut, setShortcut] = useState<ShortcutKeyInfo | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const [shortcutShown, setShortcutShown] = useState(false);
  const [shortcutCopied, setShortcutCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    const loaded = loadSettings();
    setS(loaded);
    applySettings(loaded);
  }, []);

  // Auth + support notifications
  useEffect(() => {
    if (typeof window !== "undefined") {
      setNotifSupported("Notification" in window && "serviceWorker" in navigator);
    }
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  // Liste des appareils (tokens push) + token de l'appareil courant
  useEffect(() => {
    if (!user) { setTokens([]); return; }
    const unsub = subscribePushTokens(user.uid, setTokens);
    getCurrentToken().then(setCurrentToken).catch(() => {});
    return () => unsub();
  }, [user]);

  const handleForget = (tokenId: string) => {
    if (!user) return;
    deletePushToken(user.uid, tokenId).catch(() => {});
  };

  const handleForgetOthers = () => {
    if (!user || !currentToken) return;
    const others = tokens.filter((t) => t.id !== currentToken);
    if (others.length === 0) return;
    const n = others.length;
    if (!window.confirm(`Oublier ${n} autre${n > 1 ? "s" : ""} appareil${n > 1 ? "s" : ""} ? ${n > 1 ? "Ils ne recevront" : "Il ne recevra"} plus de rappels tant que les notifications n'y sont pas réactivées.`)) return;
    others.forEach((t) => deletePushToken(user.uid, t.id).catch(() => {}));
  };

  // Réglages de relance (stockés dans Firestore : les Cloud Functions les lisent)
  useEffect(() => {
    if (!user) { setPolicy(DEFAULT_REMINDER_POLICY); return; }
    const unsub = subscribeReminderPolicy(user.uid, setPolicy);
    return () => unsub();
  }, [user]);

  const updatePolicy = <K extends keyof ReminderPolicy>(key: K, value: ReminderPolicy[K]) => {
    if (!user) return;
    const next = { ...policy, [key]: value };
    setPolicy(next);
    saveReminderPolicy(user.uid, next)
      .then(() => {
        setPolicySaved(true);
        setTimeout(() => setPolicySaved(false), 1800);
      })
      .catch(() => {});
  };

  // ── Vérification de l'adresse ───────────────────────────────────────────
  //
  // Elle ne sert pas qu'à faire joli : Identity Platform refuse d'inscrire un
  // second facteur (TOTP) tant que l'adresse n'est pas vérifiée. C'est donc la
  // première marche de la double authentification, et elle vit ici, dans
  // l'onglet où celle-ci se réglera.
  const handleSendVerification = async () => {
    if (!user || verifyState === "sending") return;
    setVerifyState("sending");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/verify-email", { method: "POST", headers: { authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error(String(res.status));
      setVerifyState("sent");
    } catch {
      setVerifyState("error");
    }
  };

  // Firebase ne prévient pas quand l'adresse vient d'être confirmée : l'état
  // est dans le jeton, et le jeton date d'avant le clic. On le relit.
  const handleRefreshUser = async () => {
    if (!user) return;
    await user.reload().catch(() => {});
    setUser(auth.currentUser);
  };

  // ── Raccourci iPhone ────────────────────────────────────────────────────
  //
  // La clé s'affiche ici et **nulle part ailleurs** : c'est le seul écran où
  // l'on peut la lire, la remplacer ou la retirer. Elle est masquée par défaut
  // — un écran de préférences se montre volontiers à un tiers.
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!user) { setShortcut(null); return; }
    const unsub = subscribeShortcutKey(user.uid, setShortcut);
    return () => unsub();
  }, [user]);

  const callKeyApi = async (method: "POST" | "DELETE") => {
    if (!user || shortcutBusy) return;
    setShortcutBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/memo/key", { method, headers: { authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error(String(res.status));
      setShortcutShown(method === "POST");
    } catch {
      window.alert("L'opération a échoué. Réessayez dans un instant.");
    } finally {
      setShortcutBusy(false);
    }
  };

  const handleCreateKey = () => callKeyApi("POST");

  const handleRotateKey = () => {
    if (!window.confirm("Remplacer la clé ? L'ancienne cesse d'écrire aussitôt : le raccourci de l'iPhone devra recevoir la nouvelle.")) return;
    callKeyApi("POST");
  };

  const handleRevokeKey = () => {
    if (!window.confirm("Retirer la clé ? Le raccourci cessera d'ajouter des mémos.")) return;
    callKeyApi("DELETE");
  };

  const copyToClipboard = (value: string, what: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setShortcutCopied(what);
        setTimeout(() => setShortcutCopied(null), 1800);
      },
      () => window.alert("Copie impossible — sélectionnez le texte à la main.")
    );
  };

  // Modèles de dossier
  useEffect(() => {
    if (!user) { setCaseTemplates([]); return; }
    const unsub = subscribeCaseTemplates(user.uid, setCaseTemplates);
    return () => unsub();
  }, [user]);

  const handleRenameTemplate = (t: CaseTemplate) => {
    if (!user) return;
    const name = window.prompt("Renommer le modèle :", t.name)?.trim();
    if (!name || name === t.name) return;
    renameCaseTemplate(user.uid, t.id, name).catch(() => {});
  };
  const handleDeleteTemplate = (t: CaseTemplate) => {
    if (!user) return;
    if (!window.confirm(`Supprimer le modèle « ${t.name} » ? (Les dossiers déjà créés ne sont pas affectés.)`)) return;
    deleteCaseTemplate(user.uid, t.id).catch(() => {});
  };

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const next = { ...s, [key]: value };
    setS(next);
    applySettings(next);
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(s);
    applySettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setS(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    applySettings(DEFAULT_SETTINGS);
  };

  const row = "flex items-center justify-between py-3 border-b border-border last:border-0";
  const lbl = "text-[13.5px] text-tx";
  const sublbl = "text-[11.5px] text-tx-3 mt-0.5";
  const sel = "font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded px-2.5 py-1.5 outline-none cursor-pointer hover:border-border-strong transition-colors";

  return (
    <div className="h-screen bg-bg-subtle flex flex-col">

      {/* Header */}
      <header className="h-[44px] flex items-center justify-between px-5 border-b border-border bg-bg shrink-0 relative">
        <div className="flex items-center gap-3 z-10">
          <span className="text-[13px] text-tx-2 select-none">← <Link href="/" className="hover:text-tx transition-colors">Retour</Link></span>
        </div>
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
          <Link href="/" className="pointer-events-auto">
            <img src="/logo-henri-new.png" alt="Henri" style={{height:"28px", width:"auto"}} />
          </Link>
        </div>
        <div className="z-10 flex gap-2">
          {tab === "apparence" && <>
            <button onClick={handleReset} className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-3 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong hover:text-tx-2 transition-all">Réinitialiser</button>
            <button onClick={handleSave} className={`text-[12px] font-[inherit] px-4 py-1.5 rounded cursor-pointer transition-all ${saved ? "bg-green-600 text-white border border-green-600" : "bg-tx text-bg border border-tx hover:opacity-90"}`}>{saved ? "Enregistré ✓" : "Enregistrer"}</button>
          </>}
        </div>
      </header>

      {/* Corps : onglets verticaux + contenu */}
      <div className="flex-1 flex min-h-0">
        {/* Onglets verticaux */}
        <nav className="w-40 sm:w-52 shrink-0 border-r border-border bg-bg overflow-y-auto py-2">
          {(["apparence", "securite", "rappels", "appareils", "raccourci", "modeles", "aide", "versions", "legal"] as Tab[]).map((t) => {
            const labels: Record<Tab, string> = { apparence: "Apparence", securite: "Sécurité", rappels: "Rappels", appareils: "Appareils", raccourci: "Raccourci iPhone", modeles: "Modèles", aide: "Aide", versions: "Notes de version", legal: "Mentions légales" };
            return (
              <button key={t} onClick={() => setTab(t)}
                className="w-full text-left text-[13px] font-medium font-[inherit] px-4 py-2.5 border-none bg-transparent cursor-pointer transition-colors"
                style={{ color: tab === t ? "var(--text)" : "var(--text-2)", background: tab === t ? "var(--bg-active)" : "transparent", borderLeft: tab === t ? "3px solid var(--text)" : "3px solid transparent" }}>
                {labels[t]}
              </button>
            );
          })}
        </nav>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto">
        <div className={"max-w-4xl mx-auto px-6 py-8 space-y-6"}>

          {tab === "apparence" && <>
            <section>
              <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Apparence</h2>
              <div className="bg-bg border border-border rounded-xl overflow-hidden px-4">
                <div className={row}>
                  <div><p className={lbl}>Police d'interface</p><p className={sublbl}>Affectée à toute l'application</p></div>
                  <select className={sel} value={s.font} onChange={e => update("font", e.target.value as FontChoice)}>
                    <option value="inter">Inter — moderne</option>
                    <option value="dm-sans">DM Sans — arrondi</option>
                    <option value="georgia">Georgia — serif classique</option>
                    <option value="lora">Lora — serif élégant</option>
                  </select>
                </div>
                <div className={row}>
                  <div><p className={lbl}>Taille du texte</p><p className={sublbl}>Actuellement {s.textSize}px</p></div>
                  <div className="flex items-center gap-2">
                    <button className="w-7 h-7 flex items-center justify-center border border-border rounded bg-bg-subtle text-tx-2 text-[15px] cursor-pointer hover:bg-bg-hover transition-colors" onClick={() => update("textSize", Math.max(11, s.textSize - 1))}>−</button>
                    <span className="text-[13px] text-tx w-8 text-center">{s.textSize}</span>
                    <button className="w-7 h-7 flex items-center justify-center border border-border rounded bg-bg-subtle text-tx-2 text-[15px] cursor-pointer hover:bg-bg-hover transition-colors" onClick={() => update("textSize", Math.min(17, s.textSize + 1))}>+</button>
                  </div>
                </div>
                <div className={row}>
                  <div><p className={lbl}>Densité des lignes</p><p className={sublbl}>Hauteur des éléments dans les colonnes</p></div>
                  <div className="flex gap-1">
                    {(["compact", "normal", "relaxed"] as DensityChoice[]).map(d => (
                      <button key={d} onClick={() => update("density", d)} className={`text-[11.5px] px-3 py-1.5 rounded border cursor-pointer font-[inherit] transition-all ${s.density === d ? "bg-tx text-bg border-tx" : "bg-bg-subtle border-border text-tx-2 hover:border-border-strong"}`}>
                        {d === "compact" ? "Compact" : d === "normal" ? "Normal" : "Aéré"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Navigation</h2>
              <div className="bg-bg border border-border rounded-xl overflow-hidden px-4">
                <div className={row}>
                  <div><p className={lbl}>Bandes de navigation latérales</p><p className={sublbl}>Bandes "Dossiers" / "Ma journée" sur les côtés</p></div>
                  <button onClick={() => update("sideTabs", !s.sideTabs)} style={{background: s.sideTabs ? "var(--accent)" : "var(--border-strong)", position:"relative", width:40, height:22, borderRadius:11, cursor:"pointer", border:"none", flexShrink:0, transition:"background 0.2s"}}>
                    <span style={{position:"absolute", top:3, left: s.sideTabs ? 21 : 3, width:16, height:16, background:"white", borderRadius:"50%", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"left 0.2s", display:"block"}} />
                  </button>
                </div>
                <div className={row}>
                  <div><p className={lbl}>Tri des dossiers par défaut</p><p className={sublbl}>Appliqué à l'ouverture</p></div>
                  <div className="flex items-center gap-2">
                    <select className={sel} value={s.defaultSort} onChange={e => update("defaultSort", e.target.value as SortChoice)}>
                      <option value="title">Nom</option>
                      <option value="createdAt">Ancienneté</option>
                      <option value="legalDueDate">Échéance</option>
                    </select>
                    <button onClick={() => update("defaultSortDir", s.defaultSortDir === "asc" ? "desc" : "asc")} className="w-8 h-8 flex items-center justify-center border border-border rounded bg-bg-subtle text-tx-2 cursor-pointer hover:bg-bg-hover transition-colors text-[13px]" title={s.defaultSortDir === "asc" ? "Croissant" : "Décroissant"}>
                      {s.defaultSortDir === "asc" ? "↑" : "↓"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Comportement</h2>
              <div className="bg-bg border border-border rounded-xl overflow-hidden px-4">
                <div className={row}>
                  <div><p className={lbl}>Délai avant suppression</p><p className={sublbl}>Fenêtre d'annulation après suppression</p></div>
                  <div className="flex gap-1">
                    {[3, 5, 10, 15].map(sec => (
                      <button key={sec} onClick={() => update("deleteDelay", sec)} className={`text-[11.5px] px-2.5 py-1.5 rounded border cursor-pointer font-[inherit] transition-all ${s.deleteDelay === sec ? "bg-tx text-bg border-tx" : "bg-bg-subtle border-border text-tx-2 hover:border-border-strong"}`}>{sec}s</button>
                    ))}
                  </div>
                </div>
                <div className={row}>
                  <div><p className={lbl}>Son de complétion</p><p className={sublbl}>Petit bip quand une tâche est marquée réalisée</p></div>
                  <button onClick={() => update("sound", !s.sound)} style={{background: s.sound ? "var(--accent)" : "var(--border-strong)", position:"relative", width:40, height:22, borderRadius:11, cursor:"pointer", border:"none", flexShrink:0, transition:"background 0.2s"}}>
                    <span style={{position:"absolute", top:3, left: s.sound ? 21 : 3, width:16, height:16, background:"white", borderRadius:"50%", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"left 0.2s", display:"block"}} />
                  </button>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Aperçu</h2>
              <div className="bg-bg border border-border rounded-xl p-5 space-y-2" style={{ fontFamily: "var(--font-ui)", fontSize: `${s.textSize}px` }}>
                <p className="font-semibold text-tx" style={{ fontSize: `${s.textSize + 4}px` }}>Succession Martin</p>
                <div className="flex items-center gap-2">
                  <span className="status-badge status-badge-1">Demandé</span>
                  <span className="text-tx-3" style={{ fontSize: `${s.textSize - 2}px` }}>Éch. 19/04/2026</span>
                </div>
                <p className="text-tx-2" style={{ height: `${s.density === "compact" ? 28 : s.density === "normal" ? 36 : 44}px`, display: "flex", alignItems: "center" }}>Contacter les héritiers avant l'échéance fiscale</p>
              </div>
            </section>
          </>}

          {tab === "securite" && (
            <div className="space-y-4">
              <div className="bg-bg border border-border rounded-xl p-5">
                <p className="text-[14px] font-semibold text-tx mb-1">Votre adresse</p>
                <p className="text-[13px] text-tx-2 leading-relaxed">
                  Confirmer votre adresse prouve qu'elle est bien la vôtre. C'est aussi la <strong>condition préalable à la double authentification</strong> : sans adresse vérifiée, aucun second facteur ne peut être inscrit — sans quoi il suffirait de s'inscrire avec l'adresse d'un autre pour l'enfermer dehors avec son propre téléphone.
                </p>
              </div>

              {!user ? (
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2">Connectez-vous pour gérer votre compte.</div>
              ) : (
                <section>
                  <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Adresse du compte</h2>
                  <div className="bg-bg border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13.5px] text-tx">{user.email}</p>
                      {user.emailVerified ? (
                        <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">VÉRIFIÉE</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">NON VÉRIFIÉE</span>
                      )}
                    </div>

                    {user.emailVerified ? (
                      <p className="text-[12px] text-tx-3 mt-2 leading-relaxed">Rien à faire — cette adresse est confirmée.</p>
                    ) : (
                      <>
                        <div className="flex gap-2 mt-4 flex-wrap">
                          <button disabled={verifyState === "sending"} onClick={handleSendVerification}
                            className="text-[12px] font-[inherit] bg-tx text-bg border border-tx px-4 py-1.5 rounded cursor-pointer hover:opacity-90 transition-all disabled:opacity-50">
                            {verifyState === "sending" ? "Envoi…" : verifyState === "sent" ? "Renvoyer le lien" : "M'envoyer le lien"}
                          </button>
                          <button onClick={handleRefreshUser}
                            className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong transition-all">
                            J'ai cliqué — actualiser
                          </button>
                        </div>
                        {verifyState === "sent" && (
                          <p className="text-[12px] text-green-700 mt-2 leading-relaxed">Lien envoyé à {user.email}. Ouvrez-le, puis revenez cliquer « actualiser ».</p>
                        )}
                        {verifyState === "error" && (
                          <p className="text-[12px] text-red-600 mt-2">L&apos;envoi a échoué. Réessayez dans un instant.</p>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Double authentification</h2>
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2 leading-relaxed">
                  L&apos;inscription d&apos;une application d&apos;authentification (code à six chiffres) se réglera ici. Elle demande deux choses : une adresse vérifiée — ci-dessus —, et l&apos;activation d&apos;Identity Platform sur le projet Firebase.
                </div>
              </section>
            </div>
          )}

          {tab === "rappels" && (
            <div className="space-y-6">
              <div className="bg-bg border border-border rounded-xl p-5">
                <p className="text-[14px] font-semibold text-tx mb-1">Relances</p>
                <p className="text-[13px] text-tx-2 leading-relaxed">
                  Une notification s'évacue d'un geste, et la tâche est oubliée. Henri peut donc <strong>revenir à la charge</strong> : tant qu'une tâche avec rappel n'est pas passée « Traité », il renotifie à intervalle régulier, puis le lendemain matin si la journée est finie. Ces réglages valent pour tous vos appareils.
                </p>
                {!user && <p className="text-[12.5px] text-tx-3 mt-2">Connectez-vous pour modifier ces réglages.</p>}
                {policySaved && <p className="text-[12px] text-green-700 mt-2">Enregistré ✓</p>}
              </div>

              <section>
                <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Rappel du jour de l&apos;échéance</h2>
                <div className="bg-bg border border-border rounded-xl overflow-hidden px-4">
                  <div className={row}>
                    <div><p className={lbl}>Heure du rappel</p><p className={sublbl}>Posé d&apos;avance à chaque échéance ; retirable tâche par tâche</p></div>
                    <select disabled={!user} className={sel} value={policy.dueReminderHour} onChange={e => updatePolicy("dueReminderHour", Number(e.target.value))}>
                      <option value={DUE_REMINDER_OFF}>Ne rien proposer</option>
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[12px] text-tx-3 mt-2 leading-relaxed">
                  {policy.dueReminderHour < 0
                    ? <>Aucun rappel n&apos;est proposé avec les échéances : à poser à la main, tâche par tâche.</>
                    : <>Dès qu&apos;une échéance est posée, Henri arme un rappel <strong className="font-medium text-tx-2">le jour même à {formatHour(policy.dueReminderHour)}</strong> — sur une tâche comme sur un mémo. Il apparaît aussitôt sous « Rappel » et se retire d&apos;un clic. Un rappel que vous avez choisi vous-même n&apos;est jamais remplacé, et rien n&apos;est proposé pour une heure déjà passée.</>}
                </p>
              </section>

              <section>
                <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Relance des rappels</h2>
                <div className="bg-bg border border-border rounded-xl overflow-hidden px-4">
                  <div className={row}>
                    <div><p className={lbl}>Relancer par défaut</p><p className={sublbl}>S'applique aux nouveaux rappels ; réglable tâche par tâche</p></div>
                    <button disabled={!user} onClick={() => updatePolicy("repeatEnabled", !policy.repeatEnabled)} style={{background: policy.repeatEnabled ? "var(--accent)" : "var(--border-strong)", position:"relative", width:40, height:22, borderRadius:11, cursor: user ? "pointer" : "not-allowed", border:"none", flexShrink:0, transition:"background 0.2s", opacity: user ? 1 : 0.5}}>
                      <span style={{position:"absolute", top:3, left: policy.repeatEnabled ? 21 : 3, width:16, height:16, background:"white", borderRadius:"50%", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"left 0.2s", display:"block"}} />
                    </button>
                  </div>
                  <div className={row}>
                    <div><p className={lbl}>Intervalle entre deux relances</p><p className={sublbl}>Délai avant que la tâche ne resonne</p></div>
                    <select disabled={!user} className={sel} value={policy.repeatIntervalHours} onChange={e => updatePolicy("repeatIntervalHours", Number(e.target.value))}>
                      {[1, 2, 3, 4, 6, 8, 12, 24].map(h => <option key={h} value={h}>{h} h</option>)}
                    </select>
                  </div>
                  <div className={row}>
                    <div><p className={lbl}>Nombre de relances</p><p className={sublbl}>Après quoi Henri se tait — le récap prend le relais</p></div>
                    <select disabled={!user} className={sel} value={policy.repeatMax} onChange={e => updatePolicy("repeatMax", Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n} fois</option>)}
                    </select>
                  </div>
                  <div className={row}>
                    <div><p className={lbl}>Ne pas déranger avant</p><p className={sublbl}>Une relance plus matinale est décalée à cette heure</p></div>
                    <select disabled={!user} className={sel} value={policy.dayStartHour} onChange={e => updatePolicy("dayStartHour", Number(e.target.value))}>
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                  <div className={row}>
                    <div><p className={lbl}>Plus de relance après</p><p className={sublbl}>Les relances du soir repartent le lendemain à {formatHour(policy.dayStartHour)}</p></div>
                    <select disabled={!user} className={sel} value={policy.dayEndHour} onChange={e => updatePolicy("dayEndHour", Number(e.target.value))}>
                      {HOURS.filter(h => h > policy.dayStartHour).map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[12px] text-tx-3 mt-2 leading-relaxed">
                  Exemple : un rappel à 14h non traité revient {14 + policy.repeatIntervalHours >= policy.dayEndHour
                    ? `le lendemain à ${formatHour(policy.dayStartHour)}`
                    : `à ${formatHour(14 + policy.repeatIntervalHours)}`}, et ainsi de suite jusqu'à {policy.repeatMax} relance{policy.repeatMax > 1 ? "s" : ""} — sauf si vous passez la tâche « Traité » entre-temps.
                </p>
              </section>

              <section>
                <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Récapitulatif des tâches non traitées</h2>
                <div className="bg-bg border border-border rounded-xl overflow-hidden px-4">
                  <div className={row}>
                    <div><p className={lbl}>Récapitulatif quotidien</p><p className={sublbl}>Le soir : ce qu'il reste. Le matin : ce qui n'a pas été fait hier</p></div>
                    <button disabled={!user} onClick={() => updatePolicy("recapEnabled", !policy.recapEnabled)} style={{background: policy.recapEnabled ? "var(--accent)" : "var(--border-strong)", position:"relative", width:40, height:22, borderRadius:11, cursor: user ? "pointer" : "not-allowed", border:"none", flexShrink:0, transition:"background 0.2s", opacity: user ? 1 : 0.5}}>
                      <span style={{position:"absolute", top:3, left: policy.recapEnabled ? 21 : 3, width:16, height:16, background:"white", borderRadius:"50%", boxShadow:"0 1px 3px rgba(0,0,0,0.2)", transition:"left 0.2s", display:"block"}} />
                    </button>
                  </div>
                  <div className={row}>
                    <div><p className={lbl}>Bilan du soir</p><p className={sublbl}>Tâches de Ma journée encore ouvertes</p></div>
                    <select disabled={!user || !policy.recapEnabled} className={sel} value={policy.recapEveningHour} onChange={e => updatePolicy("recapEveningHour", Number(e.target.value))}>
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                  <div className={row}>
                    <div><p className={lbl}>Rappel du lendemain</p><p className={sublbl}>Les tâches de la veille restées non traitées</p></div>
                    <select disabled={!user || !policy.recapEnabled} className={sel} value={policy.recapMorningHour} onChange={e => updatePolicy("recapMorningHour", Number(e.target.value))}>
                      {HOURS.map(h => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[12px] text-tx-3 mt-2 leading-relaxed">
                  Le récapitulatif ne dépend pas des rappels : il couvre <em>toutes</em> les tâches de Ma journée, même celles pour lesquelles vous n'aviez posé aucun rappel.
                </p>
              </section>
            </div>
          )}

          {tab === "appareils" && (
            <div className="space-y-4">
              <div className="bg-bg border border-border rounded-xl p-5">
                <p className="text-[14px] font-semibold text-tx mb-1">Appareils recevant les rappels</p>
                <p className="text-[13px] text-tx-2 leading-relaxed">
                  Vos rappels sont envoyés à <strong>tous</strong> les appareils listés ici. Retirez-en un pour qu'il cesse de recevoir des notifications. Pour ajouter un appareil, ouvrez Henri dessus et activez « Rappels » dans l'en-tête.
                </p>
              </div>

              {!user ? (
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2">Connectez-vous pour gérer vos appareils.</div>
              ) : !notifSupported ? (
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2">Ce navigateur ne supporte pas les notifications push.</div>
              ) : tokens.length === 0 ? (
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2">
                  Aucun appareil enregistré pour l'instant. Activez « Rappels » (bouton en haut de l'application) sur un appareil pour l'ajouter ici.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentToken && tokens.some((t) => t.id !== currentToken) && (
                    <div className="flex justify-end pb-1">
                      <button onClick={handleForgetOthers}
                        className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-red-300 hover:text-red-600 transition-all">
                        Oublier tous les autres appareils
                      </button>
                    </div>
                  )}
                  {[...tokens]
                    .sort((a, b) => (tsToDate(b.lastSeenAt)?.getTime() ?? 0) - (tsToDate(a.lastSeenAt)?.getTime() ?? 0))
                    .map((t) => {
                      const { name, os } = describeDevice(t.userAgent);
                      const isCurrent = !!currentToken && t.id === currentToken;
                      const last = tsToDate(t.lastSeenAt);
                      return (
                        <div key={t.id} className="bg-bg border border-border rounded-xl p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13.5px] text-tx font-medium flex items-center gap-2 flex-wrap">
                              <span>{name}{os ? ` · ${os}` : ""}</span>
                              {isCurrent && <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">Cet appareil</span>}
                            </p>
                            <p className="text-[11.5px] text-tx-3 mt-0.5">{last ? `Dernière activité le ${last.toLocaleDateString("fr-FR")}` : "Activité inconnue"}</p>
                          </div>
                          <button onClick={() => handleForget(t.id)}
                            className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-red-300 hover:text-red-600 transition-all shrink-0">
                            Oublier
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {tab === "raccourci" && (
            <div className="space-y-4">
              <div className="bg-bg border border-border rounded-xl p-5">
                <p className="text-[14px] font-semibold text-tx mb-1">Noter un mémo sans ouvrir Henri</p>
                <p className="text-[13px] text-tx-2 leading-relaxed">
                  Un mémo naît rarement devant l&apos;écran : il naît dans un couloir, au téléphone, en sortant d&apos;un rendez-vous. La <strong>touche Action</strong> de l&apos;iPhone (ou l&apos;écran verrouillé, ou « Dis Siri ») peut ouvrir un champ, et ce que vous y tapez ou dictez arrive directement dans <strong>Ma journée</strong> — sans déverrouiller l&apos;application, sans l&apos;ouvrir du tout.
                </p>
                <p className="text-[13px] text-tx-2 leading-relaxed mt-2">
                  Les jetons de la ligne de saisie fonctionnent aussi : <code className="text-[12px] bg-bg-subtle border border-border rounded px-1 py-0.5">#dupont @lundi ! relancer le syndic</code>. Un jeton dont la requête laisse un doute revient dans le titre du mémo plutôt que d&apos;être deviné — vous le corrigez d&apos;un geste dans Ma journée. Une ligne = un mémo.
                </p>
              </div>

              {!user ? (
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2">Connectez-vous pour créer votre clé.</div>
              ) : (
                <section>
                  <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Votre clé</h2>
                  <div className="bg-bg border border-border rounded-xl p-5">
                    {!shortcut?.key ? (
                      <>
                        <p className="text-[13px] text-tx-2 leading-relaxed mb-3">
                          La clé autorise votre iPhone à ajouter des mémos, et rien d&apos;autre : elle ne donne accès ni aux dossiers ni à leur contenu. Elle se retire d&apos;un bouton.
                        </p>
                        <button disabled={shortcutBusy} onClick={handleCreateKey}
                          className="text-[12px] font-[inherit] bg-tx text-bg border border-tx px-4 py-1.5 rounded cursor-pointer hover:opacity-90 transition-all disabled:opacity-50">
                          {shortcutBusy ? "…" : "Créer la clé"}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-[12.5px] text-tx bg-bg-subtle border border-border rounded px-2.5 py-1.5 select-all break-all">
                            {shortcutShown ? shortcut.key : maskShortcutKey(shortcut.key)}
                          </code>
                          <button onClick={() => setShortcutShown(v => !v)}
                            className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong transition-all">
                            {shortcutShown ? "Masquer" : "Afficher"}
                          </button>
                          <button onClick={() => copyToClipboard(`Bearer ${shortcut.key}`, "cle")}
                            className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong transition-all">
                            {shortcutCopied === "cle" ? "Copié ✓" : "Copier « Bearer … »"}
                          </button>
                        </div>
                        <p className="text-[11.5px] text-tx-3 mt-2">
                          Créée le {shortcut.createdAt ? new Date(shortcut.createdAt).toLocaleDateString("fr-FR") : "—"} · à coller une seule fois dans le raccourci, puis à oublier.
                        </p>
                        <div className="flex gap-2 mt-4">
                          <button disabled={shortcutBusy} onClick={handleRotateKey}
                            className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong transition-all disabled:opacity-50">
                            Remplacer
                          </button>
                          <button disabled={shortcutBusy} onClick={handleRevokeKey}
                            className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-red-300 hover:text-red-600 transition-all disabled:opacity-50">
                            Retirer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-[11px] font-medium text-tx-3 uppercase tracking-widest mb-3">Le raccourci, pas à pas</h2>
                <div className="bg-bg border border-border rounded-xl p-5 space-y-3 text-[13px] text-tx-2 leading-relaxed">
                  <p><strong className="text-tx">1.</strong> Application <strong>Raccourcis</strong> → <strong>+</strong> → nommez-le « Mémo Henri ».</p>
                  <p><strong className="text-tx">2.</strong> Action <strong>« Demander une entrée »</strong> — Type : Texte, Invite : « Mémo ».</p>
                  <p>
                    <strong className="text-tx">3.</strong> Action <strong>« Obtenir le contenu de »</strong> avec l&apos;adresse ci-dessous, puis, dans « Afficher plus » : Méthode <strong>POST</strong>, En-tête <code className="text-[12px] bg-bg-subtle border border-border rounded px-1 py-0.5">Authorization</code> = la clé copiée ci-dessus (« Bearer … »), Corps de la requête <strong>JSON</strong> avec un champ texte nommé <code className="text-[12px] bg-bg-subtle border border-border rounded px-1 py-0.5">text</code> dont la valeur est la <strong>Entrée fournie</strong> de l&apos;étape 2.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-[12.5px] text-tx bg-bg-subtle border border-border rounded px-2.5 py-1.5 select-all break-all">{origin || "https://…"}/api/memo</code>
                    <button onClick={() => copyToClipboard(`${origin}/api/memo`, "url")}
                      className="text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong transition-all">
                      {shortcutCopied === "url" ? "Copié ✓" : "Copier l'adresse"}
                    </button>
                  </div>
                  <p><strong className="text-tx">4.</strong> Action <strong>« Afficher une notification »</strong> avec, pour texte, la valeur <code className="text-[12px] bg-bg-subtle border border-border rounded px-1 py-0.5">message</code> du dictionnaire reçu — c&apos;est l&apos;accusé de réception : « Noté : relancer le syndic (DUPONT · éch. 24/08/2026) ».</p>
                  <p><strong className="text-tx">5.</strong> <strong>Réglages</strong> → <strong>Touche Action</strong> → <strong>Raccourci</strong> → choisissez « Mémo Henri ». (Sans touche Action : ajoutez le raccourci à l&apos;écran d&apos;accueil, ou dites « Dis Siri, Mémo Henri ».)</p>
                </div>
                <p className="text-[12px] text-tx-3 mt-2 leading-relaxed">
                  Le mémo part dans la journée en cours, sauf échéance à venir — auquel cas il part directement au bon jour, avec son rappel, exactement comme s&apos;il avait été tapé dans Ma journée.
                </p>
              </section>
            </div>
          )}

          {tab === "modeles" && (
            <div className="space-y-4">
              <div className="bg-bg border border-border rounded-xl p-5">
                <p className="text-[14px] font-semibold text-tx mb-1">Modèles de dossier</p>
                <p className="text-[13px] text-tx-2 leading-relaxed">
                  Un modèle est une liste de tâches réutilisable pour pré-remplir un dossier. Pour en créer un : ouvrez un dossier, puis « Modèle → Enregistrer comme modèle ». Pour l'utiliser : bouton + « Nouveau dossier », ou « Modèle → Appliquer un modèle » dans un dossier existant.
                </p>
              </div>

              {!user ? (
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2">Connectez-vous pour gérer vos modèles.</div>
              ) : caseTemplates.length === 0 ? (
                <div className="bg-bg border border-border rounded-xl p-5 text-[13px] text-tx-2">Aucun modèle enregistré pour l'instant.</div>
              ) : (
                <div className="space-y-2">
                  {[...caseTemplates].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((t) => {
                    const tasks = t.items.filter((it) => it.level === 2);
                    return (
                      <div key={t.id} className="bg-bg border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <button onClick={() => setExpandedTemplate((id) => (id === t.id ? null : t.id))} className="min-w-0 flex-1 text-left bg-transparent border-none cursor-pointer p-0">
                            <p className="text-[13.5px] text-tx font-medium truncate">{t.name}</p>
                            <p className="text-[11.5px] text-tx-3 mt-0.5">{t.items.length} tâche{t.items.length > 1 ? "s" : ""} · {expandedTemplate === t.id ? "masquer le détail" : "voir le détail"}</p>
                          </button>
                          <button onClick={() => handleRenameTemplate(t)} className="shrink-0 text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-border-strong hover:text-tx transition-all">Renommer</button>
                          <button onClick={() => handleDeleteTemplate(t)} className="shrink-0 text-[12px] font-[inherit] bg-transparent border border-border text-tx-2 px-3 py-1.5 rounded cursor-pointer hover:border-red-300 hover:text-red-600 transition-all">Supprimer</button>
                        </div>
                        {expandedTemplate === t.id && (
                          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                            {tasks.length === 0 ? (
                              <p className="text-[12px] text-tx-3">Aucune tâche dans ce modèle.</p>
                            ) : (
                              tasks.map((task) => (
                                <div key={task.id}>
                                  <p className="text-[12.5px] text-tx">• {task.title}</p>
                                  {t.items.filter((sub) => sub.parentItemId === task.id).map((sub) => (
                                    <p key={sub.id} className="text-[12px] text-tx-3 ml-4">— {sub.title}</p>
                                  ))}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "aide" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-bg border border-border rounded-xl px-5 py-3 mb-3">
                <p className="text-[13px] text-tx-2">Nouveau sur Henri ? Suivez la visite guidée, ou le pas à pas « tâches & sous-tâches ».</p>
                <div className="flex gap-2 shrink-0">
                  <Link href="/" onClick={() => { try { localStorage.setItem("henri:startTour", "1"); } catch {} }} className="text-[12px] font-[inherit] bg-tx text-bg border border-tx rounded px-3 py-1.5 hover:opacity-90 transition-all" style={{ textDecoration: "none" }}>▶ Visite guidée</Link>
                  <Link href="/" onClick={() => { try { localStorage.setItem("henri:startWalkthrough", "1"); } catch {} }} className="text-[12px] font-[inherit] bg-transparent text-tx-2 border border-border rounded px-3 py-1.5 hover:border-border-strong hover:text-tx transition-all" style={{ textDecoration: "none" }}>▶ Pas à pas : une tâche</Link>
                </div>
              </div>
              <div className="flex gap-0 min-h-[600px] bg-bg border border-border rounded-xl overflow-hidden">

              {/* Menu gauche */}
              <div className="w-52 shrink-0 border-r border-border bg-bg-subtle flex flex-col py-2">
                {[["📁", "Structure"],
                ["☀️", "Ma journée"],
                ["📱", "Vue mobile"],
                ["◎", "Statuts"],
                ["✎", "Mémos"],
                ["★", "Importance & échéances"],
                ["🔔", "Rappels"],
                ["📲", "Installer l'app"],
                ["📤", "Export & import"],
                ["📋", "Modèles"],
                ["⌨", "Raccourcis clavier"]].map(([icon, label], i) => (
                  <button key={i} onClick={() => setAideSection(i)}
                    className={`text-left px-4 py-2.5 text-[13px] font-[inherit] border-none cursor-pointer transition-colors flex items-center gap-2 ${aideSection === i ? "bg-bg font-semibold text-tx border-r-2 border-tx" : "bg-transparent text-tx-2 hover:text-tx hover:bg-bg"}`}
                    style={{ borderRight: aideSection === i ? "2px solid var(--text)" : "2px solid transparent" }}>
                    <span className="text-[14px]">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Contenu droite */}
              <div className="flex-1 overflow-y-auto p-6">
                {[{
                  icon: "📁", title: "Structure",
                  items: [{t: "Dossiers, tâches, sous-tâches", c: "Henri s'organise sur trois niveaux. Le premier niveau regroupe vos dossiers — chaque dossier correspond généralement à un client ou à une affaire. Le deuxième niveau contient les tâches associées à ce dossier (appeler le client, récupérer le titre de propriété, rédiger l'avant-contrat…). Le troisième niveau permet d'ajouter des sous-tâches pour décomposer le travail en actions précises."}, {t: "Navigation entre colonnes", c: "La navigation se fait colonne par colonne, à la souris ou au clavier (← →). Le panneau de détail à droite affiche les informations complètes de l'élément sélectionné : statut, échéance, commentaires, historique."}, {t: "Recherche de dossier", c: "Un champ de recherche est disponible en bas de la colonne Dossiers. Tapez quelques lettres pour filtrer instantanément parmi tous vos dossiers."}]
                },
                {
                  icon: "☀️", title: "Ma journée",
                  items: [{t: "Le principe du focus quotidien", c: "Plutôt que de parcourir tous vos dossiers chaque matin, vous sélectionnez les tâches prioritaires et vous les ajoutez à Ma journée (touche A ou bouton ☀ dans le détail). Vous disposez alors d'une liste courte et claire sur laquelle vous concentrer."}, {t: "Les suggestions", c: "La colonne de gauche propose automatiquement quatre catégories : les tâches marquées importantes (★), celles en retard, celles à échéance aujourd'hui, et celles créées récemment. Un clic suffit pour les ajouter à votre journée."}, {t: "Réinitialisation quotidienne", c: "En fin de journée, les tâches non traitées restent dans vos dossiers — elles ne disparaissent pas. Ma journée se recompose chaque matin, vous permettant de repartir d'une page blanche."}]
                },
                {
                  icon: "📱", title: "Vue mobile",
                  items: [{t: "Ma journée sur téléphone", c: "Sur téléphone, Henri s'ouvre directement sur Ma journée. Les tâches s'affichent en grandes cartes tactiles, avec le statut et l'échéance visibles d'un coup d'œil. Appuyez sur une tâche pour ouvrir son détail."}, {t: "Cocher une ligne", c: "Mémos et tâches ont la même apparence dans Ma journée : une case à cocher à gauche. Cochez un mémo, il est réalisé et quitte la liste. Cochez une tâche, Henri demande d'abord où elle en est (Créé, Demandé, Reçu, Traité) — puis elle quitte la journée en restant, bien sûr, dans son dossier. Seule la tâche porte un filet coloré, qui dit son avancement, et une croix à droite pour la retirer de la journée sans rien changer."}, {t: "Panneau détail et suggestions", c: "Le panneau détail s'ouvre depuis la droite : changez le statut, consultez le dossier rattaché, gérez l'échéance. Le bouton 🔭 affiche les suggestions depuis la gauche — appuyez pour ajouter une tâche à votre journée."}, {t: "Créer un mémo rapide", c: "Le bouton + Nouveau mémo en bas permet de créer une tâche avec échéance et rattachement à un dossier, sans quitter Ma journée. Idéal pour capturer une action en déplacement ou entre deux rendez-vous."}]
                },
                {
                  icon: "◎", title: "Statuts",
                  items: [{t: "Le cycle en quatre étapes", c: "Chaque tâche possède un statut : Créée → Demandé → Reçu → Traité. Cette progression reflète fidèlement le cycle de vie d'une action notariale : le besoin exprimé, la demande formulée, la réception des pièces, le traitement."}, {t: "Signification de chaque statut", c: "Demandé signifie qu'on attend quelque chose de quelqu'un — vous pouvez relancer. Reçu signifie que vous avez les éléments en main et devez passer à l'acte. Traité reste visible et consultable dans l'historique du dossier."}, {t: "Changer le statut", c: "Depuis le panneau de détail ou au clavier avec les touches 1, 2, 3, 4. Une tâche ne peut pas être marquée Traitée si ses sous-tâches ne le sont pas."}]
                },
                {
                  icon: "✎", title: "Mémos",
                  items: [{t: "Notes libres sans dossier", c: "Les mémos sont des tâches légères créées directement dans Ma journée, sans dossier parent. Idéaux pour les actions ponctuelles : appeler la chambre, renouveler un abonnement, préparer une réunion."}, {t: "Enrichissement d'un mémo", c: "Un mémo peut recevoir une échéance, des observations libres, et être rattaché à un dossier existant — il reste un mémo, avec sa case à cocher, et s'affiche sous les tâches du dossier. Sur téléphone, c'est le même écran qui sert à le créer et à le modifier."}, {t: "Récurrence", c: "Configurez un mémo pour se répéter chaque semaine, mois, ou à une fréquence personnalisée. Henri génère automatiquement la prochaine occurrence quand vous marquez la tâche comme réalisée."}, {t: "Un mémo réalisé s'efface", c: "Cochez un mémo : il quitte Ma journée, sur ordinateur comme sur téléphone. Vous le retrouvez par le lien « n mémos réalisés » en bas de la colonne, d'où vous pouvez le rouvrir ou le décocher. Un mémo sans dossier disparaît définitivement 7 jours après avoir été réalisé. Un mémo que vous n'avez pas coché ne disparaît jamais, quel que soit son âge ; rattaché à un dossier, il reste aussi longtemps que le dossier."}]
                },
                {
                  icon: "★", title: "Importance & échéances",
                  items: [{t: "Marquer une tâche importante", c: "L'étoile ★ dans le panneau de détail marque une tâche comme prioritaire. Les éléments importants s'affichent avec un fond jaune dans toutes les vues et apparaissent en tête des suggestions de Ma journée."}, {t: "Définir une échéance", c: "Des raccourcis rapides évitent de manipuler un calendrier : Aujourd'hui, Demain, Dans 1 semaine, Dans 1 mois. Une échéance dépassée apparaît en rouge dans les colonnes et remonte dans les suggestions."}, {t: "Cohérence tâche / sous-tâches", c: "Une tâche ne peut pas avoir une échéance antérieure à celle de ses sous-tâches, garantissant la cohérence de votre planification."}]
                },
                {
                  icon: "🔔", title: "Rappels",
                  items: [{t: "Poser un rappel", c: "Depuis le panneau de détail d'une tâche ou d'un mémo, ouvrez « Rappel » et choisissez un moment : Dans 1h, Demain 9h, ou une date et une heure personnalisées. Henri vous préviendra au moment voulu, même si vous avez quitté l'application."}, {t: "Le rappel du jour de l'échéance", c: "Poser une échéance suffit : Henri arme aussitôt un rappel pour le jour même, à 9h par défaut. Il s'affiche sous « Rappel » et se retire d'un clic s'il n'a pas lieu d'être. Déplacer l'échéance déplace le rappel avec elle ; un rappel que vous avez choisi vous-même n'est jamais remplacé. L'heure se règle — ou la proposition se coupe — dans Préférences → Rappels."}, {t: "Activer les notifications", c: "Cliquez une fois sur « Rappels » dans l'en-tête pour autoriser les notifications sur cet appareil — le bouton passe au vert « Rappels ✓ ». À refaire sur chaque navigateur ou appareil où vous souhaitez être prévenu."}, {t: "Comment arrivent les rappels", c: "À l'échéance, vous recevez une notification. Si Henri est ouvert devant vous, un bandeau discret s'affiche dans l'application ; s'il est en arrière-plan ou fermé (navigateur toujours ouvert), c'est une véritable notification système. Un clic sur la notification ouvre Ma journée."}, {t: "Les relances : une notification qui revient", c: "Une notification s'évacue d'un geste — et la tâche est oubliée. Henri revient donc à la charge : tant que la tâche n'est pas passée « Traité », il renotifie toutes les 3 heures (jusqu'à 3 fois par défaut). Une relance reste affichée à l'écran jusqu'à ce que vous la traitiez, contrairement au premier rappel. L'interrupteur « Relancer tant que ce n'est pas fait », sous les présets de rappel, permet de couper la relance pour une tâche donnée."}, {t: "Les relances de nuit", c: "Aucune relance entre 20h et 8h : une relance qui tomberait le soir est reportée au lendemain matin. C'est ainsi qu'une tâche du jour J vous revient le lendemain. Ces horaires se règlent dans Préférences → Rappels."}, {t: "Le récapitulatif du soir et du matin", c: "Indépendamment des rappels, Henri envoie chaque soir à 18h la liste des tâches de Ma journée encore ouvertes, et le lendemain à 8h celles de la veille restées non traitées. Il couvre toutes les tâches du jour, même celles sans rappel. Réglable ou désactivable dans Préférences → Rappels."}]
                },
                {
                  icon: "📲", title: "Installer l'app",
                  items: [{t: "Sur ordinateur (Chrome / Edge)", c: "Cliquez sur « Installer l'app » dans l'en-tête, ou sur l'icône d'installation dans la barre d'adresse. Henri s'ouvre alors dans sa propre fenêtre, avec une icône dans la barre des tâches — comme un logiciel classique, sans passer par un magasin d'applications."}, {t: "Sur mobile", c: "Sur Android (Chrome) : menu ⋮ → « Installer l'application ». Sur iPhone / iPad (Safari) : bouton Partager → « Sur l'écran d'accueil »."}, {t: "Pourquoi l'installer", c: "L'application installée démarre plus vite, s'affiche en plein écran et reçoit les rappels de façon plus fiable. Les mises à jour sont automatiques : rien à réinstaller."}]
                },
                {
                  icon: "📤", title: "Export & import",
                  items: [{t: "Exporter un dossier", c: "Depuis le panneau de détail d'un dossier, le bouton Exporter JSON génère un fichier contenant la structure complète : toutes ses tâches, sous-tâches, statuts, commentaires et échéances."}, {t: "Importer et réutiliser", c: "Le lien Importer un dossier en bas de la colonne Dossiers permet de recréer une structure complète depuis un fichier JSON. Idéal pour dupliquer un dossier modèle à chaque nouvelle affaire du même type."}, {t: "Voir aussi : Modèles", c: "Plus simple que l'export/import pour réutiliser une trame : la rubrique « Modèles » ci-dessous permet d'enregistrer les tâches d'un dossier et de les réappliquer en un clic."}]
                },
                {
                  icon: "📋", title: "Modèles",
                  items: [{t: "À quoi ça sert", c: "Un modèle est une liste de tâches type (avec sous-tâches) réutilisable pour pré-remplir un dossier — par exemple une trame « Vente immobilière ». Un modèle d'exemple est déjà fourni."}, {t: "Créer un modèle", c: "Ouvrez un dossier, puis dans sa barre d'actions : « Modèle → Enregistrer comme modèle », et donnez-lui un nom. Seule la structure des tâches est enregistrée (ni statuts, ni échéances)."}, {t: "Appliquer un modèle", c: "À la création : le bouton + « Nouveau dossier » propose un dossier vierge ou l'un de vos modèles. Dans un dossier existant : « Modèle → Appliquer un modèle » ajoute les tâches. Elles repartent du statut « Créé »."}, {t: "Gérer vos modèles", c: "Dans Préférences → Modèles : renommez, supprimez, et consultez le détail (tâches et sous-tâches) de chaque modèle."}]
                },
                {
                  icon: "⌨", title: "Raccourcis clavier",
                  items: [{t: "Une lettre par nature", c: "D : dossier · T : tâche · Shift+T : sous-tâche · M : mémo. Chaque touche crée exactement ce qu'elle nomme, dans le dossier courant — plus besoin de savoir quelle colonne est active."}, {t: "Éditer", c: "Espace : renommer · Entrée : valider · Échap : annuler"}, {t: "Actions", c: "A : ajouter à Ma journée · I : ouvrir/fermer le détail · R : rattacher une tâche · ⌫ : supprimer"}, {t: "Navigation et statuts", c: "← → : naviguer entre colonnes · ↑ ↓ : déplacer la sélection · 1–4 : changer le statut (Créée / Demandé / Reçu / Traité)"}]
                }].map((section, i) => aideSection !== i ? null : (
                  <div key={i} className="space-y-6">
                    <div className="flex items-center gap-3 pb-4 border-b border-border">
                      <span className="text-[24px]">{section.icon}</span>
                      <h2 className="text-[18px] font-semibold text-tx">{section.title}</h2>
                    </div>
                    {section.items.map((item, j) => (
                      <div key={j} className="space-y-2">
                        <p className="text-[14px] font-semibold text-tx">{item.t}</p>
                        <p className="text-[14px] text-tx-2 leading-relaxed">{item.c}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

            </div>
            </>
          )}

          {tab === "versions" && (
            <div className="space-y-4">
              {[
                { v: "Alpha 1.8", date: "Août 2026", items: ["Poser une échéance propose désormais systématiquement un rappel le jour de l'échéance — sur une tâche comme sur un mémo, à l'ordinateur comme au téléphone", "L'heure de ce rappel se règle dans Préférences → Rappels (9h par défaut), et la proposition peut y être coupée", "Déplacer l'échéance déplace le rappel proposé ; la retirer le retire. Un rappel posé à la main n'est jamais remplacé", "Nouvelle puce « Échéance 09h » sous « Rappel », pour réarmer la proposition après l'avoir retirée"] },
                { v: "Alpha 1.7", date: "Juillet 2026", items: ["Mobile — Ma journée : mémos et tâches ont désormais la même ligne (case à cocher à gauche) ; la tâche garde son filet d'avancement et une croix pour la retirer de la journée", "Cocher un mémo le fait disparaître de Ma journée : il est réalisé. Un lien discret en bas de la colonne rouvre les mémos réalisés, pour les consulter ou les décocher (ordinateur et téléphone)", "Mobile — cocher une tâche demande où elle en est, puis la retire de Ma journée : elle reste dans son dossier avec son nouveau statut", "Mobile — un mémo se crée et se modifie dans le même écran : mêmes champs, même disposition (étoile, échéance, rappel, dossier, répétition, observations)", "Rattacher un mémo à un dossier ne le transforme plus en tâche : il garde sa case à cocher et s'affiche sous les tâches du dossier", "Un mémo sans dossier s'efface définitivement 7 jours après avoir été réalisé — un pense-bête n'est pas une archive. Un mémo que vous n'avez pas coché, lui, ne disparaît jamais", "Un mémo s'ouvre en cliquant son texte, depuis Ma journée comme depuis la liste des tâches de son dossier"] },
                { v: "Alpha 1.6", date: "Juillet 2026", items: ["Relances : une tâche avec rappel non traitée fait l'objet d'une nouvelle notification (toutes les 3 h par défaut, jusqu'à 3 fois)", "Une relance reste affichée jusqu'à ce que vous vous en occupiez — plus difficile à balayer qu'un simple rappel", "Pas de relance la nuit : une relance du soir est reportée au lendemain matin", "Récapitulatif du soir (18h) : les tâches de Ma journée encore ouvertes", "Rappel du lendemain (8h) : les tâches de la veille restées non traitées", "Interrupteur « Relancer tant que ce n'est pas fait » sur chaque rappel", "Nouvel onglet Préférences → Rappels : intervalle, nombre de relances, plage horaire, récapitulatifs"] },
                { v: "Alpha 1.5", date: "Juillet 2026", items: ["Modèles de dossier : enregistrez la liste de tâches d'un dossier sous un nom et réutilisez-la", "Appliquez un modèle à un nouveau dossier (bouton 📋) ou à un dossier existant (« Appliquer un modèle »)", "Gérez vos modèles : renommer, supprimer", "Mini-récap d'avancement sur chaque dossier : 4 compteurs colorés (tâches et sous-tâches) — Créé · Demandé · Reçu · Traité", "Tri des dossiers par « charge restante » (Créé=2, Demandé=1, Reçu=0,5, Traité=0)", "Visite guidée interactive : tâches, sous-tâches, import/export, modèles, raccourcis clavier (relançable dans l'Aide)", "Modèle de dossier d'exemple intégré (« Vente immobilière »)", "Pas à pas interactif : créer une tâche, une sous-tâche, puis tout supprimer (dossier d'entraînement) ; bulles d'aide repositionnées près des boutons", "À la création d'un dossier, choix entre dossier vierge ou modèle", "Actions d'un dossier regroupées en deux menus : « Export / Import » et « Modèle »", "Préférences → Modèles : gérer ses modèles (renommer, supprimer, consulter le détail)", "Préférences : navigation par onglets verticaux (colonne à gauche)", "Ma journée : option « grouper par dossier » (desktop et mobile), avec en-têtes de dossier"] },
                { v: "Alpha 1.4", date: "Juillet 2026", items: ["Rappels par notification désormais fiables : sur ordinateur, et même lorsque Henri est en arrière-plan ou fermé", "Réception des rappels au bon moment rétablie (l'application pouvait auparavant n'afficher aucune notification)", "Installation en application peaufinée : nom « Henri » et icône corrigés", "Aide enrichie : nouvelles rubriques « Rappels » et « Installer l'app »", "Préférences → Appareils : liste des appareils recevant les rappels, avec possibilité d'en retirer"] },
                { v: "Alpha 1.3", date: "Juin 2026", items: ["« Mes dossiers » désormais accessible sur mobile : navigation en pleine largeur, une colonne à la fois", "Balayez horizontalement (swipe) pour passer de Dossiers → Tâches → Sous-tâches → Détail, et revenir en arrière", "Icône ☀ pour aller à Ma journée, icône dossier pour revenir à Mes dossiers", "En-têtes mobiles uniformisés (logo et icônes)"] },
                { v: "Alpha 1.2", date: "Juin 2026", items: ["Import de tâches dans un dossier existant et export d'une sélection de tâches", "Installation de l'app sur Chrome et Edge (bouton dédié, icônes, nom corrigé)", "Correction du curseur qui sautait en fin de champ pendant la saisie"] },
                { v: "Alpha 1.1", date: "Mai 2026", items: ["Notifications push : rappels configurables par tâche et par mémo", "Rappels sur ordinateur et notifications même app au premier plan", "Application installable (PWA) avec fonctionnement hors ligne", "Nouvelle page de réinitialisation de mot de passe et de vérification d'email", "Réinitialisation du mot de passe envoyée via Brevo"] },
                { v: "Alpha 1.0", date: "Mai 2026", items: ["Refonte de la vue mobile : détail tâche et mémo alignés sur l'ordinateur", "Menu compte sur mobile (déconnexion, préférences)", "« À venir » : popover regroupant tâches et mémos à venir", "Nouvelles icônes SVG dans toute l'application", "Lignes et listes de Ma journée affinées", "Désactivation du zoom involontaire sur mobile"] },
                { v: "Alpha 0.9", date: "Avr. 2025", items: ["Suggestions Ma journée : importantes, en retard, aujourd'hui, récentes", "Fonds colorés sur les tâches selon priorité", "Focus automatique à la création d'un élément", "Recherche de dossier", "Système d'invitation et page d'administration", "Raccourcis clavier et encoche feedback"] },
                { v: "Alpha 0.8", date: "Avr. 2025", items: ["Refonte complète du panneau détail (dossier, tâche, mémo)", "Raccourcis d'échéance (Aujourd'hui, Demain, Dans 1 sem…)", "Étoile ★ pour marquer une tâche importante", "Observations sur les mémos"] },
                { v: "Alpha 0.7", date: "Avr. 2025", items: ["Ma journée : colonne suggestions", "Mémos : récurrence, rattachement dossier", "Suppression immédiate avec annulation", "Sons (validation, ajout)"] },
              ].map(({ v, date, items }) => (
                <div key={v} className="bg-bg border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-tx bg-bg-subtle border border-border rounded px-1.5 py-0.5">{v}</span>
                    <span className="text-[11px] text-tx-3">{date}</span>
                  </div>
                  <ul className="space-y-1">
                    {items.map(item => (
                      <li key={item} className="flex items-start gap-1.5">
                        <span className="text-tx-3 text-[10px] mt-0.5">•</span>
                        <span className="text-[12px] text-tx-2">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {tab === "legal" && (
            <div className="bg-bg border border-border rounded-xl p-5 space-y-4 text-[13px] text-tx-2 leading-relaxed">
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1">Éditeur</p>
                <p>Grégoire TAGOT<br />2 rue Dante – 75005 Paris<br /><a href="mailto:gregoire@tagot.fr" className="text-accent underline">gregoire@tagot.fr</a></p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1">Hébergement</p>
                <p>Application hébergée par Vercel Inc. (San Francisco, USA). Données stockées sur Google Firebase.</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1">Données personnelles</p>
                <p>Henri collecte uniquement les données nécessaires à son fonctionnement (email, dossiers, tâches). Ces données sont strictement personnelles et ne sont jamais cédées à des tiers.</p>
                <p className="mt-1">Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression : <a href="mailto:gregoire@tagot.fr" className="text-accent underline">gregoire@tagot.fr</a></p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1">Accès</p>
                <p>L'accès à Henri est réservé aux personnes ayant reçu une invitation. Toute utilisation non autorisée est interdite.</p>
              </div>
              <p className="text-[11px] text-tx-3 pt-1">© {new Date().getFullYear()} Grégoire TAGOT — Henri version Alpha</p>
            </div>
          )}

        </div>
      </div>
      </div>
    </div>
  );
}

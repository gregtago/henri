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

type Tab = "apparence" | "aide" | "versions" | "legal";

export default function SettingsPage() {
  const [s, setS] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("apparence");

  useEffect(() => {
    const loaded = loadSettings();
    setS(loaded);
    applySettings(loaded);
  }, []);

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

      {/* Onglets */}
      <div className="flex bg-bg border-b border-border shrink-0">
        {(["apparence", "aide", "versions", "legal"] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = { apparence: "Apparence", aide: "Aide", versions: "Notes de version", legal: "Mentions légales" };
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 text-[13px] font-medium font-[inherit] py-2.5 border-none bg-transparent cursor-pointer transition-colors"
              style={{ color: tab === t ? "var(--text)" : "var(--text-3)", borderBottom: tab === t ? "2px solid var(--text)" : "2px solid transparent" }}>
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-5 py-8 space-y-6">

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

          {tab === "aide" && (
            <div className="space-y-5">
              {[
                {
                  title: "Dossiers",
                  icon: "📁",
                  content: "Henri s'organise autour de dossiers. Chaque dossier contient des tâches, qui peuvent elles-mêmes contenir des sous-tâches. Naviguez entre les colonnes avec les touches ← → ou en cliquant."
                },
                {
                  title: "Créer un élément",
                  icon: "✚",
                  content: "Appuyez sur N pour créer un dossier ou une tâche dans la colonne active. Shift+N crée une sous-tâche. Le + en haut de chaque colonne fait la même chose. Tapez le nom puis Entrée pour valider — Échap pour annuler."
                },
                {
                  title: "Ma journée",
                  icon: "☀",
                  content: "Ma journée est votre espace de travail quotidien. Sélectionnez une tâche et appuyez sur A pour l'y ajouter. La colonne de gauche vous propose des suggestions : tâches importantes (★), en retard, à échéance aujourd'hui, ou récemment créées. Cliquez sur une suggestion pour l'ajouter immédiatement."
                },
                {
                  title: "Mémos",
                  icon: "✎",
                  content: "Les mémos sont des notes libres dans Ma journée — sans dossier parent. Tapez dans le champ en bas de la liste pour en créer un. Vous pouvez leur ajouter une échéance, une récurrence, des observations, ou les rattacher à un dossier."
                },
                {
                  title: "Statuts",
                  icon: "◎",
                  content: "Chaque tâche a un statut : Créée → Demandé → Reçu → Traité. Changez-le depuis le panneau de détail ou avec les touches 1 à 4 au clavier. Une tâche Traitée est considérée comme terminée."
                },
                {
                  title: "Tâches importantes",
                  icon: "★",
                  content: "Marquez une tâche ou un mémo comme important avec l'étoile ★ dans le panneau détail. Les éléments importants apparaissent en priorité dans les suggestions de Ma journée, avec un fond jaune."
                },
                {
                  title: "Échéances",
                  icon: "📅",
                  content: "Définissez une échéance sur n'importe quelle tâche ou mémo. Des raccourcis rapides sont disponibles : Aujourd'hui, Demain, Dans 1 sem… Les tâches en retard apparaissent en rouge dans les suggestions et dans les colonnes."
                },
                {
                  title: "Raccourcis clavier",
                  icon: "⌨",
                  content: "N : nouveau · Shift+N : sous-tâche · Espace : renommer · Entrée : valider · A : ajouter à Ma journée · I : détail · R : rattacher · ⌫ : supprimer · 1–4 : changer statut · ← → : naviguer · ↑ ↓ : déplacer"
                },
                {
                  title: "Suppression",
                  icon: "🗑",
                  content: "La suppression est immédiate mais réversible. Un bandeau s'affiche en bas avec un bouton Annuler. Le délai d'annulation est configurable dans les Préférences (3 à 15 secondes)."
                },
              ].map(({ title, icon, content: text }) => (
                <div key={title} className="bg-bg border border-border rounded-xl p-4 flex gap-3">
                  <span className="text-[18px] shrink-0 mt-0.5">{icon}</span>
                  <div>
                    <p className="text-[13px] font-semibold text-tx mb-1">{title}</p>
                    <p className="text-[12.5px] text-tx-2 leading-relaxed">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "versions" && (
            <div className="space-y-4">
              {[
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
  );
}

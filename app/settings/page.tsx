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
  const [aideSection, setAideSection] = useState(0);

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
            <div className="flex gap-0 min-h-[500px] bg-bg border border-border rounded-xl overflow-hidden">

              {/* Menu gauche */}
              <div className="w-44 shrink-0 border-r border-border bg-bg-subtle flex flex-col py-2">
                {[["📁", "Structure"],
                ["☀️", "Ma journée"],
                ["📱", "Vue mobile"],
                ["◎", "Statuts"],
                ["✎", "Mémos"],
                ["★", "Importance & échéances"],
                ["📤", "Export & import"],
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
                  items: [{t: "Ma journée sur téléphone", c: "Sur téléphone, Henri s'ouvre directement sur Ma journée. Les tâches s'affichent en grandes cartes tactiles, avec le statut et l'échéance visibles d'un coup d'œil. Appuyez sur une tâche pour ouvrir son détail."}, {t: "Panneau détail et suggestions", c: "Le panneau détail s'ouvre depuis la droite : changez le statut, consultez le dossier rattaché, gérez l'échéance. Le bouton 🔭 affiche les suggestions depuis la gauche — appuyez pour ajouter une tâche à votre journée."}, {t: "Créer un mémo rapide", c: "Le bouton + Nouveau mémo en bas permet de créer une tâche avec échéance et rattachement à un dossier, sans quitter Ma journée. Idéal pour capturer une action en déplacement ou entre deux rendez-vous."}]
                },
                {
                  icon: "◎", title: "Statuts",
                  items: [{t: "Le cycle en quatre étapes", c: "Chaque tâche possède un statut : Créée → Demandé → Reçu → Traité. Cette progression reflète fidèlement le cycle de vie d'une action notariale : le besoin exprimé, la demande formulée, la réception des pièces, le traitement."}, {t: "Signification de chaque statut", c: "Demandé signifie qu'on attend quelque chose de quelqu'un — vous pouvez relancer. Reçu signifie que vous avez les éléments en main et devez passer à l'acte. Traité reste visible et consultable dans l'historique du dossier."}, {t: "Changer le statut", c: "Depuis le panneau de détail ou au clavier avec les touches 1, 2, 3, 4. Une tâche ne peut pas être marquée Traitée si ses sous-tâches ne le sont pas."}]
                },
                {
                  icon: "✎", title: "Mémos",
                  items: [{t: "Notes libres sans dossier", c: "Les mémos sont des tâches légères créées directement dans Ma journée, sans dossier parent. Idéaux pour les actions ponctuelles : appeler la chambre, renouveler un abonnement, préparer une réunion."}, {t: "Enrichissement d'un mémo", c: "Un mémo peut recevoir une échéance, des observations libres, et être rattaché à un dossier existant — il devient alors une tâche à part entière dans ce dossier."}, {t: "Récurrence", c: "Configurez un mémo pour se répéter chaque semaine, mois, ou à une fréquence personnalisée. Henri génère automatiquement la prochaine occurrence quand vous marquez la tâche comme réalisée."}]
                },
                {
                  icon: "★", title: "Importance & échéances",
                  items: [{t: "Marquer une tâche importante", c: "L'étoile ★ dans le panneau de détail marque une tâche comme prioritaire. Les éléments importants s'affichent avec un fond jaune dans toutes les vues et apparaissent en tête des suggestions de Ma journée."}, {t: "Définir une échéance", c: "Des raccourcis rapides évitent de manipuler un calendrier : Aujourd'hui, Demain, Dans 1 semaine, Dans 1 mois. Une échéance dépassée apparaît en rouge dans les colonnes et remonte dans les suggestions."}, {t: "Cohérence tâche / sous-tâches", c: "Une tâche ne peut pas avoir une échéance antérieure à celle de ses sous-tâches, garantissant la cohérence de votre planification."}]
                },
                {
                  icon: "📤", title: "Export & import",
                  items: [{t: "Exporter un dossier", c: "Depuis le panneau de détail d'un dossier, le bouton Exporter JSON génère un fichier contenant la structure complète : toutes ses tâches, sous-tâches, statuts, commentaires et échéances."}, {t: "Importer et réutiliser", c: "Le lien Importer un dossier en bas de la colonne Dossiers permet de recréer une structure complète depuis un fichier JSON. Idéal pour dupliquer un dossier modèle à chaque nouvelle affaire du même type."}, {t: "Créer des modèles", c: "Exemple : constituez un dossier modèle Vente immobilière avec toutes les tâches standard (appel de fonds, diagnostics, documents d'urbanisme…), exportez-le, réimportez-le à chaque nouvelle vente."}]
                },
                {
                  icon: "⌨", title: "Raccourcis clavier",
                  items: [{t: "Créer et éditer", c: "N : nouveau dans la colonne active · Shift+N : sous-tâche · Espace : renommer · Entrée : valider · Échap : annuler"}, {t: "Actions", c: "A : ajouter à Ma journée · I : ouvrir/fermer le détail · R : rattacher une tâche · ⌫ : supprimer"}, {t: "Navigation et statuts", c: "← → : naviguer entre colonnes · ↑ ↓ : déplacer la sélection · 1–4 : changer le statut (Créée / Demandé / Reçu / Traité)"}]
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

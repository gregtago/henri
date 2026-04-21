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
            <div className="space-y-6">

              {/* Présentation */}
              <div className="bg-tx text-bg rounded-xl p-5 space-y-3">
                <p className="text-[15px] font-semibold leading-snug">Une nouvelle manière de piloter vos dossiers.</p>
                <p className="text-[13px] leading-relaxed opacity-90">
                  Henri part d'un constat simple : un notaire gère simultanément des dizaines de dossiers, chacun contenant de multiples tâches à des stades d'avancement différents. L'enjeu n'est pas de tout faire — c'est de savoir <em>quoi</em> faire aujourd'hui.
                </p>
                <p className="text-[13px] leading-relaxed opacity-90">
                  Henri propose une organisation en deux temps : d'un côté, <strong>tous vos dossiers</strong> avec leurs tâches, organisés, classés, toujours disponibles. De l'autre, <strong>Ma journée</strong> — un espace de travail quotidien où vous extrayez uniquement les tâches sur lesquelles vous vous concentrez ce jour-là. Vous commencez la journée avec une liste claire, vous la traitez, et vous passez à autre chose.
                </p>
                <p className="text-[13px] leading-relaxed opacity-90">
                  Contrairement à un simple gestionnaire de tâches où les éléments disparaissent quand ils sont cochés, Henri reflète la réalité du notariat : chaque acte passe par plusieurs étapes — le besoin exprimé, la demande formulée, la réception des pièces, le traitement, la signature. Une tâche ne disparaît pas, elle <strong>avance</strong>. Henri vous permet de suivre précisément à quel stade en est chaque action.
                </p>
              </div>

              {/* Sections */}
              {[
                {
                  icon: "📁",
                  title: "La structure : dossiers, tâches, sous-tâches",
                  content: [
                    "Henri s'organise sur trois niveaux. Le premier niveau regroupe vos dossiers — chaque dossier correspond généralement à un client ou à une affaire. Le deuxième niveau contient les tâches associées à ce dossier — par exemple « Appeler le client », « Récupérer le titre de propriété », « Rédiger l'avant-contrat ». Le troisième niveau permet d'ajouter des sous-tâches à chaque tâche pour décomposer le travail en actions précises.",
                    "La navigation se fait colonne par colonne, à la souris ou au clavier (← →). Le panneau de détail à droite affiche les informations complètes de l'élément sélectionné : statut, échéance, commentaires, historique.",
                    "Utilisez le champ de recherche en bas de la colonne Dossiers pour retrouver instantanément n'importe quel dossier parmi tous ceux que vous gérez.",
                  ]
                },
                {
                  icon: "☀",
                  title: "Ma journée : le focus quotidien",
                  content: [
                    "Ma journée est le cœur de votre usage quotidien. Plutôt que de parcourir tous vos dossiers chaque matin, vous sélectionnez en début de journée les tâches prioritaires et vous les ajoutez à Ma journée (touche A ou bouton ☀ dans le détail). Vous disposez alors d'une liste courte et claire sur laquelle vous concentrer.",
                    "La colonne de gauche, « Suggestions », vous aide à composer cette liste. Elle propose automatiquement quatre catégories : les tâches marquées importantes (★), celles en retard, celles à échéance aujourd'hui, et celles créées récemment. Un clic suffit pour les ajouter à votre journée.",
                    "En fin de journée, les tâches que vous n'avez pas traitées restent dans vos dossiers — elles ne disparaissent pas. Ma journée se recompose chaque matin, vous permettant de repartir d'une page blanche.",
                  ]
                },
                {
                  icon: "◎",
                  title: "Les statuts : suivre l'avancement réel",
                  content: [
                    "Chaque tâche possède un statut qui reflète son avancement : Créée (la tâche existe, rien n'a encore été fait), Demandé (la demande a été formulée — au client, au confrère, à l'administration), Reçu (les éléments attendus sont arrivés), Traité (la tâche est accomplie).",
                    "Cette progression en quatre étapes reflète fidèlement le cycle de vie d'une action notariale. Une tâche « Demandé » signifie qu'on attend quelque chose de quelqu'un — vous pouvez relancer. Une tâche « Reçu » signifie que vous avez les éléments en main et devez passer à l'acte. Une tâche « Traité » reste visible et consultable — elle n'est pas supprimée, elle est archivée dans l'historique du dossier.",
                    "Changez le statut depuis le panneau de détail, ou directement au clavier avec les touches 1, 2, 3 ou 4. Les tâches traitées disparaissent des suggestions et de Ma journée, mais restent accessibles dans le dossier.",
                  ]
                },
                {
                  icon: "✎",
                  title: "Les mémos : notes libres et récurrences",
                  content: [
                    "Les mémos sont des tâches légères, sans dossier parent, créées directement dans Ma journée. Ils sont idéaux pour les actions ponctuelles qui ne se rattachent pas à un dossier précis : « Appeler la chambre des notaires », « Renouveler l'abonnement », « Préparer la réunion de lundi ».",
                    "Un mémo peut être enrichi : ajoutez-lui une échéance, des observations (notes libres), et rattachez-le à un dossier existant si nécessaire. Il devient alors une tâche à part entière.",
                    "La récurrence est particulièrement utile pour les actions régulières. Configurez un mémo pour se répéter chaque semaine, chaque mois, ou le deuxième lundi du mois — Henri génère automatiquement la prochaine occurrence quand vous marquez la tâche comme réalisée.",
                  ]
                },
                {
                  icon: "★",
                  title: "L'importance et les échéances",
                  content: [
                    "Marquez une tâche ou un mémo comme important avec l'étoile ★ dans le panneau de détail. Les éléments importants sont signalés par un fond jaune dans toutes les vues et apparaissent en tête des suggestions de Ma journée.",
                    "Les échéances permettent de planifier précisément votre travail. Des raccourcis rapides vous évitent de manipuler un calendrier : Aujourd'hui, Demain, Dans 2 jours, Lundi prochain, Dans 1 semaine, Dans 1 mois. Une échéance dépassée apparaît en rouge dans les colonnes et remonte automatiquement dans les suggestions.",
                    "Combinez importance et échéance pour identifier immédiatement ce qui est à la fois urgent et prioritaire. Henri vous donne une vue claire de votre charge de travail sans vous imposer une méthodologie rigide.",
                  ]
                },
                {
                  icon: "🔁",
                  title: "La récurrence",
                  content: [
                    "La récurrence s'applique aux mémos. Elle permet de créer des tâches qui se régénèrent automatiquement selon un rythme défini. Exemples d'usage : vérification hebdomadaire des délais légaux, envoi mensuel d'un rapport, relance trimestrielle d'un client.",
                    "Trois modes sont disponibles : quotidien, hebdomadaire (choisissez le jour), mensuel (un jour fixe du mois, ou un jour nommé comme « le 2ème lundi »). Quand vous marquez un mémo récurrent comme réalisé, Henri crée automatiquement la prochaine occurrence avec la bonne date.",
                    "La récurrence s'active et se désactive en un clic dans le panneau de détail du mémo. Vous pouvez modifier le rythme à tout moment sans perdre l'historique.",
                  ]
                },
                {
                  icon: "⇄",
                  title: "Rattacher une tâche à un dossier",
                  content: [
                    "Il arrive qu'une tâche créée dans un dossier doive être déplacée dans un autre, ou qu'un mémo doive être rattaché à un dossier existant. Henri propose deux façons de faire.",
                    "Pour déplacer une tâche de dossier : sélectionnez la tâche et appuyez sur R (ou cliquez sur le bouton ⇄ dans le détail). Une fenêtre s'ouvre avec la liste de vos dossiers et de vos tâches — cherchez et sélectionnez la nouvelle destination. La tâche et toutes ses sous-tâches sont déplacées en un clic.",
                    "Pour rattacher un mémo à un dossier : ouvrez le panneau de détail du mémo, utilisez le champ « Dossier » avec recherche intégrée. Une fois rattaché, le mémo devient une tâche de ce dossier et n'apparaît plus dans la liste des mémos libres.",
                  ]
                },
                {
                  icon: "📤",
                  title: "Export et import de dossiers",
                  content: [
                    "Henri permet d'exporter n'importe quel dossier au format JSON depuis le panneau de détail (bouton « Exporter JSON »). Ce fichier contient la structure complète du dossier : toutes ses tâches, sous-tâches, statuts, commentaires et échéances. Il peut servir de modèle ou d'archive.",
                    "Pour importer un dossier, utilisez le lien « Importer un dossier » en bas de la colonne Dossiers. Sélectionnez un fichier JSON exporté précédemment — Henri recrée la structure complète du dossier dans votre espace. C'est particulièrement utile pour dupliquer un dossier type et repartir d'une structure éprouvée pour une nouvelle affaire.",
                    "Exemple d'usage : créez un dossier modèle « Vente immobilière » avec toutes les tâches standard (appel de fonds, documents d'urbanisme, diagnostics, etc.), exportez-le, et réimportez-le à chaque nouvelle vente. Vous partez d'une checklist complète sans ressaisir chaque étape.",
                  ]
                },
                {
                  icon: "⌨",
                  title: "Raccourcis clavier",
                  content: [
                    "Henri est conçu pour être utilisé rapidement au clavier. Les raccourcis les plus utiles : N pour créer un élément dans la colonne active, Shift+N pour créer une sous-tâche, A pour ajouter la tâche sélectionnée à Ma journée, Espace pour renommer, Entrée pour valider, Échap pour annuler.",
                    "Navigation : les touches ← → permettent de passer d'une colonne à l'autre, ↑ ↓ déplacent la sélection dans la liste. La touche I ouvre et ferme le panneau de détail, R ouvre la fenêtre de rattachement, et ⌫ supprime l'élément sélectionné.",
                    "Les touches 1 à 4 changent instantanément le statut de la tâche sélectionnée : 1 = Créée, 2 = Demandé, 3 = Reçu, 4 = Traité. Combinées à la navigation clavier, elles permettent de passer en revue rapidement toutes les tâches d'un dossier.",
                  ]
                },
              ].map(({ icon, title, content }) => (
                <div key={title} className="bg-bg border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-subtle">
                    <span className="text-[16px]">{icon}</span>
                    <p className="text-[13px] font-semibold text-tx">{title}</p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {content.map((para, i) => (
                      <p key={i} className="text-[12.5px] text-tx-2 leading-relaxed">{para}</p>
                    ))}
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

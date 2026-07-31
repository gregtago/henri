# Henri (prototype)

Interface Finder-like pour l'organisation notariale, construite avec Next.js + Firebase.

## Prérequis
- Node.js 18+
- Un projet Firebase (Auth + Firestore activés)

## Variables d'environnement
Créer un fichier `.env.local` :

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

## Lancer en local

```
npm install
npm run dev
```

## Déploiement Vercel
- Framework: Next.js
- Build command: `npm run build`
- Output: `.next`
- Variables d'environnement: ajouter les `NEXT_PUBLIC_FIREBASE_*` dans Vercel.

## Notes
- Les données sont stockées dans Firestore, par utilisateur :
  - `users/{uid}/cases`
  - `users/{uid}/items`
  - `users/{uid}/comments`
  - `users/{uid}/events`
  - `users/{uid}/myDaySelections`
  - `users/{uid}/floatingTasks`
  - `users/{uid}/pushTokens` (appareils recevant les notifications)
  - `users/{uid}/settings/reminders` (réglages de relance, lus par les Cloud Functions)
  - `users/{uid}/reminderDigests` (garde anti-doublon des récapitulatifs quotidiens)
- Un seed est inséré au premier login si aucun dossier n'existe.
- Les sélections "Ma journée" stockent `selectionDate` (Timestamp) pour requêter facilement les 7 derniers jours.
- Les sélections "Ma journée" stockent aussi `dateTs` (Timestamp à minuit) pour requêter par fenêtre glissante.
- Les suggestions "À reproposer" listent les tâches vues dans Ma journée sur les 7 derniers jours (hors aujourd'hui), sans évolution de statut sur la période (`lastProgressAt` <= maintenant - 7 jours), non traitées et absentes d'aujourd'hui.
- L'historique (timeline) des événements d'une tâche est masqué par défaut et accessible via “Afficher la timeline”.
- Toutes les dates affichées dans l'UI utilisent le format JJ/MM/AAAA (helper `formatDateFR`).
- Raccourcis de création : une lettre par nature — `D` dossier · `T` tâche · `⇧T` sous-tâche ·
  `M` mémo. Remplace l'ancien `N` contextuel (qui créait un dossier, une tâche ou un mémo
  selon la colonne active) et l'ancien `⇧N`.
- Deux natures d'objets, et deux seulement :
  - une **tâche** (`items`) se *traite* — cycle Créé → Demandé → Reçu → Traité ;
  - un **mémo** (`floatingTasks`) se *réalise* — une case à cocher, rien d'autre.
- Un mémo peut être rattaché à un dossier (`floatingTasks.caseId`) ou libre : c'est le même
  objet, on le rattache et on le détache à volonté. Rattaché, il s'affiche sous les tâches
  du dossier — toujours avec sa case à cocher, jamais converti en tâche ; libre, il ne vit
  que dans Ma journée. Il ne compte jamais dans l'avancement.
- Sur desktop, un mémo se crée par une **fenêtre de saisie** (`M`, ou le bouton ☑ de la
  colonne Tâches) : titre, dossier, échéance, rappel, étoile, répétition et observations
  en un seul geste. Entrée crée, Échap annule. Un mémo avec une échéance future part
  directement au bon jour plutôt que dans la journée en cours.
- Sur mobile, le **même écran** (`MemoSheet`) sert à créer et à modifier un mémo : mêmes
  champs, seuls le titre et le bouton changent.
- **Cocher un mémo** inscrit `floatingTasks.doneAt`. Sur desktop la ligne reste, barrée, en bas
  de Ma journée. Sur mobile elle quitte la journée et se retrouve derrière le lien
  « n mémos réalisés » en bas de liste, d'où on peut la décocher.
- **Cocher une tâche dans Ma journée (mobile)** ouvre une question — « Où en est cette tâche ? »,
  les quatre statuts — puis la tâche quitte la journée et reste dans son dossier.
- **Un mémo non rattaché s'efface au bout de 7 jours** (`src/lib/memos.ts`), comptés depuis sa
  réalisation s'il a été coché, depuis sa création sinon. Jamais un mémo rattaché à un dossier,
  jamais un mémo récurrent, jamais un mémo programmé ou dont l'échéance est encore devant.
- La vue Calendrier (`/calendrier`) affiche trois bandes, dans l'ordre du cycle d'une tâche :
  « à faire » (ce qu'on réalise ce jour-là), « j'attends » (les demandes sans réponse, en barres
  de durée), « échéances » (ce qui tombe). Une tâche « Traité » quitte les trois bandes et
  réapparaît, sur le jour où elle a été traitée, dans « à faire » des jours passés.
  Elle lit les mêmes collections ; elle n'ajoute qu'un champ,
  `items.delaiDays` (délai de retour d'une pièce, en jours). Nul = Henri l'estime d'après
  le libellé via le barème de `src/lib/delais.ts`. Le raisonnement de la vue est dans
  `CALENDRIER.md`.

## Rappels et relances (Cloud Functions)

Trois fonctions planifiées dans `functions/index.js` (fuseau `Europe/Paris`) :

| Fonction | Cadence | Rôle |
| --- | --- | --- |
| `generateRecurringTasks` | 6h | crée les tâches récurrentes du jour |
| `sendDueReminders` | toutes les 5 min | envoie les rappels échus **et replanifie les relances** |
| `sendDailyDigest` | toutes les heures | envoie le récap du soir / du lendemain matin aux créneaux configurés |

Relance : quand un rappel part et que la tâche n'est pas « Traité », `sendDueReminders`
réarme le rappel (`reminderAt` = maintenant + `repeatIntervalHours`, `reminderSentAt`
remis à `null`, `reminderCount` incrémenté) jusqu'à `repeatMax` relances. Une relance
qui tomberait hors de la plage `dayStartHour` → `dayEndHour` est reportée au lendemain
matin. La relance se règle par tâche (`reminderRepeat`) ou globalement
(`users/{uid}/settings/reminders`, cf. `src/lib/reminderPolicy.ts` — à garder aligné
avec `DEFAULT_POLICY` côté functions).

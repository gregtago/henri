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
  `N` note · `M` mémo. Remplace l'ancien `N` contextuel (qui créait un dossier, une tâche ou
  un mémo selon la colonne active) et l'ancien `⇧N`.
- `items.kind` distingue les tâches (`undefined` ou `"tache"`) des **notes** (`"note"`) :
  une note est une information rattachée à un dossier, sans statut ni échéance, exclue des
  compteurs d'avancement, du tri « charge restante », du bandeau d'échéances et des rives du
  calendrier. Elle accepte un rappel. Un mémo rattaché à un dossier devient une note.
- La vue Calendrier (`/calendrier`) lit les mêmes collections ; elle n'ajoute qu'un champ,
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

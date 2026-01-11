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
- Un seed est inséré au premier login si aucun dossier n'existe.
- Les sélections "Ma journée" stockent `selectionDate` (Timestamp) pour requêter facilement les 7 derniers jours.
- Les suggestions "Stagnantes (7 jours)" listent les tâches présentes dans Ma journée sur la fenêtre, sans évolution de statut sur la période.
- L'historique des événements d'une tâche est masqué par défaut et accessible via “Afficher l'historique”.
- Toutes les dates affichées dans l'UI utilisent le format JJ/MM/AAAA.

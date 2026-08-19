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
- **Vibration** (`src/lib/haptics.ts`) : `tapFeedback` (appui), `successFeedback` (accompli),
  `refusedFeedback` (refus). Fonctionne sur Android ; **iOS n'expose pas l'API** à une page
  web — c'est donc toujours un bonus, jamais le seul retour d'un geste.
- **Les propositions d'échéance sont les mêmes partout** — Aujourd'hui · Demain · Dans 2 j. ·
  Lundi prochain · Dans 1 sem. · Dans 1 mois (+ 3 et 6 mois pour l'échéance légale d'un
  dossier) : la liste dans `getDueSuggestions` (`src/lib/dates.ts`), le rendu dans `DueChips`,
  et nulle part ailleurs. La puce retenue est pleine, et l'appui l'enfonce (`.due-chip`). Toute échéance posée par
  Henri tombe à **9 h** (`DUE_HOUR`), saisie manuelle comprise. « En retard » se compare donc
  en jours et non en heures : une échéance posée pour aujourd'hui ne vire pas au rouge à 9 h 01.
- **Poser une échéance arme un rappel le jour même**, à l'heure réglée dans Préférences →
  Rappels (`dueReminderHour`, 9 h par défaut ; `-1` = ne rien proposer). Toute la logique est
  dans `dueReminderPatch` / `proposeDueReminder` (`src/lib/reminderPolicy.ts`), appelée partout
  où l'on écrit une échéance — jamais recopiée. Deux garde-fous : un rappel posé à la main n'est
  jamais remplacé (Henri ne déplace que celui qui tombe exactement sur sa propre proposition
  précédente), et rien n'est proposé pour une heure déjà passée. Retirer l'échéance retire le
  rappel proposé ; la puce « Échéance 09h » du `ReminderPicker` le réarme.
- Raccourcis de création : une lettre par nature — `D` dossier · `T` tâche · `⇧T` sous-tâche ·
  `M` mémo · `⇧M` mémo sous la tâche sélectionnée. La majuscule descend d'un cran, pour la
  tâche comme pour le mémo. Remplace l'ancien `N` contextuel (qui créait un dossier, une
  tâche ou un mémo selon la colonne active) et l'ancien `⇧N`.
- **La nature d'un objet se règle avec l'interrupteur « Mémo »**, posé à côté des quatre
  statuts dans le panneau de détail (`MemoSwitch`) : éteint, les statuts sont actifs et c'est
  une tâche ; allumé, ils passent en grisé et c'est un mémo. Présent sur desktop **et sur
  mobile** (Mes dossiers comme Ma journée). La bascule est une seule fonction pour tous les
  écrans — `convertItemToMemo` / `convertMemoToTask` (`src/lib/firestore.ts`) —, refus
  compris. Dans Ma journée, l'objet transformé y reste : le mémo devenu tâche garde sa place
  dans la journée, et le panneau reste ouvert sur lui.
- **Le panneau de détail est le même pour une tâche et pour un mémo** — mêmes sections, dans
  le même ordre, aux mêmes couleurs (le fond post-it jaune du détail d'un mémo a disparu).
  Basculer l'interrupteur ne fait rien apparaître ni disparaître : seul l'actif change de
  côté. La case à cocher est active sur un mémo et grisée sur une tâche ; les quatre statuts
  et la répétition, l'inverse. Tout reste affiché des deux côtés — c'est ce qui rend lisible
  ce que l'interrupteur échange. Aucun texte d'explication n'apparaît avec la bascule (ce
  serait encore une page qui bouge) : seul un refus affiche un message. Un mémo qui existe
  s'ouvre donc dans ce panneau, desktop (`MemoDetail`) comme mobile ; `MemoComposer` et
  `MemoSheet` ne servent plus qu'à la **création**. La bascule marche dans les deux sens et
  conserve titre, étoile, échéance et rappel — les commentaires d'une tâche deviennent la note
  du mémo, et réciproquement. L'objet ne bouge pas de place : même dossier, et même tâche
  parente s'il en avait une. Une tâche qui porte des sous-tâches ou des mémos ne peut pas
  devenir un mémo (un mémo ne porte rien) ; un mémo sans dossier ne peut pas devenir une tâche
  (une tâche appartient à un dossier).
- Deux natures d'objets, et deux seulement :
  - une **tâche** (`items`) se *traite* — cycle Créé → Demandé → Reçu → Traité ;
  - un **mémo** (`floatingTasks`) se *réalise* — une case à cocher, rien d'autre.
- Un mémo peut être rattaché à un dossier (`floatingTasks.caseId`), posé sous une tâche de
  ce dossier (`floatingTasks.parentItemId`) ou libre : c'est le même objet, on le déplace à
  volonté. Rattaché, il s'affiche sous les tâches du dossier ; posé sous une tâche, dans la
  colonne Sous-tâches à côté des sous-tâches ; libre, il ne vit que dans Ma journée —
  toujours avec sa case à cocher, jamais converti en tâche. Il descend d'un cran, jamais de
  deux (pas de mémo sous une sous-tâche). Un mémo dont la tâche a été supprimée remonte au
  niveau du dossier plutôt que de disparaître.
- **Une tâche qui porte quelque chose est un contenant, plus une tâche** (`src/lib/completion.ts`).
  Dès qu'elle a une sous-tâche ou un mémo : plus de statut à régler à la main (les quatre
  statuts et les raccourcis 1–4 ne s'y appliquent plus), plus de présence dans le calendrier,
  plus de poids dans les compteurs du dossier ni dans le tri « charge restante ». Elle affiche
  à la place son avancement — « 2/5 ». Elle garde titre, étoile, commentaires, échéance et
  rappel ; cette échéance ne s'affiche donc plus dans le calendrier.
- **Une tâche dont tout est fait est faite** : quand la dernière sous-tâche est traitée ou le
  dernier mémo coché, la tâche mère passe « Traité » d'elle-même, avec l'événement dans sa
  timeline (`completeParentIfAllChildrenDone`, branché sur `updateItemProgress` et
  `updateFloatingTask`). Une tâche **sans** enfant ne conclut jamais rien toute seule.
- Sur desktop, un mémo se crée par une **fenêtre de saisie** (`M`, ou le bouton ☑ de la
  colonne Tâches) : titre, dossier, échéance, rappel, étoile, répétition et observations
  en un seul geste. Entrée crée, Échap annule. Un mémo avec une échéance future part
  directement au bon jour plutôt que dans la journée en cours.
- **Les réglages d'un mémo se disent à la saisie** (`src/lib/memoTokens.ts`) : dans la ligne de
  saisie de Ma journée — desktop et mobile —, un caractère en tête ouvre la proposition
  correspondante ; on en retient une, la ligne repart à vide, puis on écrit le mémo.
  `#` le **dossier** (derniers dossiers touchés, ou filtrés par la requête ; accents ignorés,
  titres qui *commencent* par la requête d'abord ; jamais d'archivé) · `@` l'**échéance** (les
  mêmes six propositions que partout ailleurs, `getDueSuggestions`, et donc le rappel du jour
  même) · `>` la **tâche** sous laquelle le poser (tâches de premier niveau du dossier retenu —
  rien sans dossier) · `!` l'**étoile** (réglée dès la frappe : il n'y a rien à choisir).
  Ce que la ligne crée reste un **mémo** (`floatingTasks`), rattaché ou non : les jetons règlent
  le mémo, ils ne changent pas sa nature.
  Un jeton n'est lu qu'**en tête** de saisie — « lot #3 » reste un titre de mémo. Tant qu'une
  liste est ouverte, Entrée retient une proposition au lieu de créer le mémo ; ↑↓ choisissent,
  Échap (ou la ligne « écrire un mémo sans dossier ») retire le caractère et rend le texte au
  titre. **Quand une seule proposition répond, la barre d'espace la retient** (`soleMatch`) — à
  deux près, l'espace reste une lettre du nom cherché (« #vente dup »). Ce que la ligne écrit
  est un seul payload partagé, `buildQuickMemo` (`src/lib/memos.ts`) : dateKey (une échéance à
  venir programme le mémo pour ce jour-là), rappel du jour de l'échéance, dossier, tâche,
  étoile.
- Sur mobile, `MemoSheet` ne sert plus qu'à **créer** un mémo (titre, dossier, tâche,
  échéance, rappel, répétition, observations en un seul geste) : un mémo qui existe s'ouvre
  dans le panneau de détail, comme une tâche.
- **Cocher un mémo** inscrit `floatingTasks.doneAt` et le fait quitter Ma journée — desktop et
  mobile. On le retrouve derrière le lien « n mémos réalisés » en bas de la colonne, d'où on
  peut le rouvrir ou le décocher. Dans son dossier, en revanche, il reste affiché, barré.
- **Cocher une tâche dans Ma journée (mobile)** ouvre une question — « Où en est cette tâche ? »,
  les quatre statuts — puis la tâche quitte la journée et reste dans son dossier.
- **Passer une tâche en « Traité » supprime son échéance** (`items.dueDate` remis à `null`).
  Une échéance dit quand une tâche est attendue ; traitée, elle ne l'est plus. Elle sort donc
  des listes « en retard » et « à échéance aujourd'hui », de la bande « échéances » du calendrier
  et de la contrainte d'échéance de sa tâche parente. La règle est portée par
  `updateItemProgress` (`src/lib/firestore.ts`), seul chemin de changement de statut, et vaut
  donc partout : détail, raccourcis 1–4, Ma journée, calendrier. Rouvrir la tâche ne rend pas
  l'échéance. Un mémo coché, lui, garde la sienne.
- **Un mémo réalisé et non rattaché s'efface au bout de 7 jours** (`src/lib/memos.ts`), comptés
  depuis sa réalisation. Un mémo **non coché ne disparaît jamais**, quel que soit son âge ; un
  mémo rattaché — à un dossier comme à une tâche — ni un mémo récurrent non plus.
- Le détail d'un mémo est le même partout (`MemoDetail` sur desktop, le panneau de détail de
  `MobileMyDay` sur mobile) : on l'ouvre en cliquant son texte, depuis Ma journée comme depuis
  la colonne Tâches de son dossier — et c'est le même panneau que celui d'une tâche.
- **Un mémo se note depuis l'iPhone sans ouvrir Henri** (`app/api/memo`, onglet Préférences →
  « Raccourci iPhone »). La touche Action ouvre un champ, ce qu'on y tape ou dicte arrive dans
  Ma journée. Le raccourci s'authentifie par une **clé** propre à l'utilisateur
  (`src/lib/shortcutKey.ts`), créée et révoquée depuis les Préférences via `/api/memo/key` :
  `users/{uid}/settings/shortcut` porte la clé qui fait foi ; `shortcutKeys/{empreinte}` donne
  le chemin inverse clé → utilisateur, rangé sous l'**empreinte SHA-256** de la clé et sans
  jamais la contenir — lire cet annuaire n'apprend donc rien, même si les règles Firestore
  l'exposaient. Régénérer casse l'ancienne aussitôt.
  La lecture du texte est dans `src/lib/quickCapture.ts` et **nulle part ailleurs** : mêmes
  jetons qu'à la saisie (`#` `@` `>` `!`, arrêtés au premier espace faute de liste à choisir),
  une ligne = un mémo (20 au plus), et **ce qui n'est pas certain n'est pas retenu** — un jeton
  ambigu revient dans le titre (« #dup relancer le syndic ») plutôt que d'être deviné, parce
  qu'un mémo classé dans le mauvais dossier ne se voit pas passer. Le mémo écrit est celui de
  `buildQuickMemo`, rappel du jour de l'échéance compris. La route force `TZ=Europe/Paris` :
  la journée d'un notaire change à minuit à Paris, pas en UTC.
  Rien à changer dans les règles Firestore : une collection de premier niveau sans règle est
  refusée par défaut, et le SDK admin ne passe pas par les règles. `allow read, write: if false`
  sur `shortcutKeys/**` reste la déclaration la plus claire si les règles portent un joker.
- La vue Calendrier (`/calendrier`) affiche trois bandes, dans l'ordre du cycle d'une tâche :
  « à faire » (ce qu'on réalise ce jour-là), « j'attends » (les demandes sans réponse, en barres
  de durée), « échéances » (ce qui tombe). Une tâche « Traité » quitte les trois bandes et
  réapparaît, sur le jour où elle a été traitée, dans « à faire » des jours passés. Un
  contenant n'y entre jamais : on ne fait pas un contenant, on fait ce qu'il contient.
  Elle lit les mêmes collections ; elle n'ajoute qu'un champ,
  `items.delaiDays` (délai de retour d'une pièce, en jours). Nul = Henri l'estime d'après
  le libellé via le barème de `src/lib/delais.ts`. Le raisonnement de la vue est dans
  `CALENDRIER.md`.

## Administration

Les comptes administrateurs sont **une donnée, pas une constante** : un document par
administrateur dans la collection `superAdmins` (l'identifiant du compte pour nom, rien
dedans) — la même liste que lisent les règles de sécurité Firestore (`isSuperAdmin()`).
Nommer un administrateur, c'est créer le document depuis la console ; le révoquer, c'est
l'effacer. Aucun redéploiement.

- `src/lib/superAdmin.ts` — la doctrine. **Aucun compte n'est reconnu sans document** : plus
  aucun identifiant dans le code, la collection est la seule réponse à « qui administre
  Henri ? ». Se renommer soi-même administrateur passe donc par la console.
- `src/lib/superAdminServer.ts` — `requireSuperAdmin(req)` pour les routes d'API (jeton
  Firebase dans `Authorization`). C'est là que se joue l'autorisation : le SDK admin ne passe
  pas par les règles.
- `src/lib/superAdminClient.ts` — `isSuperAdmin(uid)` pour l'écran `/admin`. Il ne protège
  rien (un écran qui se cache reste un écran) : il évite d'afficher une page à qui n'y a rien
  à faire. Les règles n'autorisent chacun qu'à lire **sa propre** ligne de `superAdmins` —
  la liste des comptes de l'écran d'administration reçoit donc du serveur, par utilisateur,
  le drapeau `isSuperAdmin`.
- Un administrateur ne peut être ni désactivé ni supprimé depuis l'écran d'administration :
  deux administrateurs ne doivent pas pouvoir se démettre l'un l'autre d'un clic.
- `/api/send-invite` exige un administrateur à chaque envoi. La vérification était
  conditionnée à la présence du champ `authToken` — donc contournable en l'omettant, ce qui
  ouvrait l'envoi de courriels depuis l'adresse de l'Office à n'importe qui.

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

`dueReminderHour` fait exception dans ce document : il est **posé côté client**, au moment où
l'échéance est choisie, et le serveur ne s'en sert pas. La clé figure quand même dans
`DEFAULT_POLICY` (functions) parce que `loadPolicy` n'itère que sur les clés qu'elle y trouve.

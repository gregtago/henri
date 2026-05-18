# Henri — Design system

Ce document décrit les choix de design d'Henri : tokens, typographie, espacements, composants, conventions. Il sert de référence pour rester cohérent en ajoutant des écrans ou en modifiant l'existant.

---

## Esprit général

Henri vise un look de **logiciel de bureau natif** plutôt qu'une application web moderne. Inspirations : le Finder macOS, Notion, les outils pro à grand débit d'information (Linear, Things, mail.app). Les principes qui en découlent :

- **Densité d'information** assumée. On préfère afficher beaucoup et bien organisé plutôt que peu et aéré.
- **Pas de chrome décoratif**. Pas de dégradés, pas d'ombres portées spectaculaires, pas d'illustrations vectorielles. Le décor sert le contenu.
- **Le contenu d'abord, l'UI s'efface**. Les titres et les données sont noirs sur blanc ; tout le reste (libellés de section, métadonnées) part dans des gris hiérarchisés.
- **Réactivité immédiate**. Toute action a un retour visuel en < 100 ms. Les délais réseau sont masqués par des injections optimistes côté client.
- **Clavier first sur desktop**. Les raccourcis sont des citoyens de première classe (A pour Ma journée, R pour Rattacher, espace pour le détail…). La souris doit rester optionnelle.
- **Mobile = compagnon, pas application complète**. Sur mobile on consulte Ma journée et on ajoute des mémos. Le reste est secondaire.

---

## Tokens

Tous les tokens sont des CSS variables définies dans `app/globals.css`, exposées à Tailwind via `tailwind.config.js`.

### Couleurs neutres

| Token | Valeur | Usage |
|---|---|---|
| `--bg` | `#ffffff` | Fond principal des colonnes et du détail |
| `--bg-subtle` | `#f7f7f5` | Fond des inputs, action bars, sections secondaires |
| `--bg-hover` | `#f1f1ef` | État hover des lignes et boutons |
| `--bg-active` | `#e9e9e6` | État actif/pressé |
| `--border` | `#e9e9e6` | Filets de séparation, bordures d'inputs |
| `--border-strong` | `#c9c9c4` | Bordures au focus, séparateurs marqués |
| `--text` | `#1a1a18` | Texte principal (titres, contenu) |
| `--text-2` | `#787774` | Texte secondaire (libellés, métadonnées) |
| `--text-3` | `#acaba8` | Texte tertiaire (placeholders, hints) |
| `--accent` | `#2f6eff` | Sélection active, focus, liens (utilisation parcimonieuse) |

Le ton volontairement légèrement chaud (gris-beige plutôt que gris pur, beige `#f7f7f5` plutôt que `#f5f5f5`) renforce l'aspect « bureau » et fatigue moins l'œil sur de longues sessions.

### Couleurs sémantiques — statuts de tâche

Le filet vertical à gauche des lignes Ma journée porte cette info ; les badges existent pour les contextes où le filet n'est pas disponible.

| Statut | Couleur filet | Badge (fond / texte) |
|---|---|---|
| Créé / À faire | `#d1d5db` (gris) | `#f1f1ef` / `#787774` |
| Demandé | `#fbbf24` (ambre) | `#fbf3db` / `#9a6700` |
| Reçu | `#60a5fa` (bleu) | `#dbeafe` / `#1d4ed8` |
| Traité | `#34d399` (vert) | `#dcfce7` / `#15803d` |

Règle : le statut « Créé » ne s'affiche **jamais en badge** dans les listes principales. Il n'apporte aucune information utile (état initial par défaut) et pollue visuellement. Le filet gris suffit. Les mémos n'ont **pas de filet** du tout — la couleur du filet est réservée aux items de dossier qui ont un statut réel à porter.

### Couleur d'accentuation pour les éléments importants

`#fbbf24` (ambre) — appliqué en fond très dilué (`rgba(251,191,36,0.09)`) sur les lignes étoilées de Ma journée, et en filet plein 4 px sur mobile pour la même chose. L'étoile elle-même est `⭐` (emoji).

### Couleurs sémantiques — repères temporels

| Cas | Couleur texte | Usage |
|---|---|---|
| En retard | `#ef4444` (rouge) | Échéance < aujourd'hui |
| Aujourd'hui | `#16a34a` (vert) (mobile) ou couleur de texte normale (desktop) | Échéance = aujourd'hui |
| Futur normal | `var(--text-3)` | Échéance > aujourd'hui |

### Repère « Dans Ma journée »

Un point jaune de 8 px (`bg-amber-400`) à gauche du titre — dans la colonne Dossiers comme dans la colonne Tâches — signale qu'une tâche est dans Ma journée. C'est purement informatif, non cliquable.

### Couleurs d'action

- **Action primaire** : `#111827` (noir profond) avec texte blanc. Boutons « Ma journée », « Confirmer », « Enregistrer ». L'usage est rare : un seul bouton primaire par contexte.
- **Action destructive** : texte `#ef4444` avec bordure `#fecaca`, hover fond `#fef2f2`. Les boutons Supprimer.
- **Action standard** : fond `--bg`, texte `--text-2`, bordure `--border`. Devient `--text` au hover. C'est l'écrasante majorité.

### Bannières et alertes

| Variante | Fond | Bordure | Texte |
|---|---|---|---|
| Rappel doux (échéance) | `#fffbeb` | `#fde68a` | `#92400e` |
| Erreur | `#fef2f2` | `#fecaca` | `#ef4444` |

---

## Typographie

- **Famille** : Inter en premier choix, fallback système (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif). Aucune Google Fonts custom à charger : Inter est inclus via le système ou ignoré silencieusement.
- **Échelle** : pas de tailles arbitraires. On reste sur la grille suivante :

| Usage | Taille | Poids | Couleur typique |
|---|---|---|---|
| Titre détail (input) | 19 px | 600 | `--text` |
| Texte principal de ligne | 15 px | 400-500 (600 si actif) | `--text` |
| Texte de body | 13-13.5 px | 400 | `--text` |
| Métadonnées en ligne | 11-12.5 px | 400 | `--text-2` ou `--text-3` |
| Libellés de section (uppercase) | 10-11 px | 500-700 | `--text-3` |
| Touche clavier (`<kbd>`) | 10.5 px | 400 | `--text-2` |
| Header de colonne | 11.5 px | 500 | `--text-2` |

- **Libellés de section** : toujours en `UPPERCASE` avec `tracking-widest` (`letter-spacing: 0.08em`). C'est l'unique cas où on monte en uppercase.
- **Texte courant** : jamais d'italique pour autre chose qu'une citation. Pas de souligné (sauf liens hypertexte rares).
- **Numbers** : pas de variant `font-numeric: tabular-nums` pour l'instant. À considérer si on ajoute des tableaux de chiffres alignés.

---

## Espacements et tailles

Pas d'échelle Tailwind par défaut hors usage : on respecte les multiples de 2 px (`gap-1.5` = 6 px, `gap-2` = 8 px, `mb-2` = 8 px, etc.). Valeurs récurrentes :

- **Hauteur de ligne** (`--row-height`) : 36 px
- **Hauteur de header** (`--header-h`) : 44 px (mais les headers de colonne tournent à 34 px en pratique)
- **Largeur de colonne par défaut** (`--col-w`) : 280 px
- **Padding horizontal de ligne** : 14 px
- **Padding interne d'un input** : 6-10 px vertical × 12-14 px horizontal
- **Border radius standard** (`--r`) : 4 px pour les éléments structuraux, 6-8 px pour les boutons, 10 px pour les inputs de titre, 20 px pour les chips/pills mobiles

### Rayons

| Élément | Rayon |
|---|---|
| Badge de statut | 3 px |
| Ligne, séparateur | 0 (anguleux) |
| Bouton standard, input | 6-8 px |
| Input de titre détail | 10 px |
| Case à cocher mémo | 6 px (desktop), 8 px (mobile) |
| Chip preset d'échéance (mobile) | 20 px (pill) |
| Toast | 6 px |

---

## Layout

### Desktop — métaphore Finder à colonnes

La vue principale est un **Miller column browser** : trois colonnes glissantes (Dossiers → Tâches → Sous-tâches) plus un panneau de détail à droite. Une 4ᵉ colonne contextuelle apparaît pour « Ma journée » et « Suggestions ».

- Chaque colonne fait `var(--col-w)` (280 px par défaut), shrink interdit, scroll vertical interne.
- Filet de 1 px `--border` entre chaque colonne.
- Header de colonne de 34 px contenant le titre et un compteur d'éléments.
- La colonne **active** (focus clavier) a ses lignes en bleu vif (`#dbeafe` fond, `#2f6eff` filet gauche 3 px, texte 600).
- Les colonnes **parentes** (qui portent la sélection menant à la colonne active) ont leurs lignes en gris discret (`--bg-subtle`, `--border-strong` filet, opacity 0.75). Le contraste hiérarchique est clé pour comprendre la navigation.

### Mobile

Layout vertical empilé. Pas de colonnes. Un seul écran à la fois (Ma journée / Mémos / Dossiers en onglets bas). Les éléments tactiles font ≥ 30 px de côté, les chips de date sont en pill 20 px de rayon.

---

## Composants

### `.finder-row`

La ligne de base de presque toutes les listes. Hauteur min 36 px, padding `5px 14px`, bordure basse 1 px `--border`, hover `--bg-subtle`. Transitions courtes (80 ms) pour le hover.

États accessibles via data-attributes :
- `data-active="true"` → sélection active (bleu vif)
- `data-selected="true"` → sélection parente (gris discret)

### `.finder-row-create`

Variante en mode création inline. Fond `--bg-subtle`, filet gauche 2 px `--accent`, input transparent qui hérite de la typographie de la ligne. Toujours auto-focus à l'apparition.

### `.detail-action-btn`

Boutons de l'action bar en bas du panneau détail. Trois variantes :
- **Standard** : `--bg-2` texte, bordure douce, fond blanc. Majoritaire.
- **`.detail-action-primary`** : fond `#111827`, texte blanc. Une seule par barre, max.
- **`.detail-action-danger`** : texte rouge, bordure rouge claire. Toujours en dernier.

Chaque bouton porte une icône-glyphe ASCII/Unicode en préfixe (`☀`, `⇄`, `✕`, `⭐`…). Pas d'icônes SVG : c'est délibéré, ça reste léger et cohérent avec l'esprit « terminal-like ».

### Cases à cocher des mémos

Carré arrondi 20 px (desktop) / 30 px (mobile), border 2 px `#9ca3af` (`d1d5db` sur mobile), fond blanc. Au clic :
1. Animation immédiate : fond vert `#16a34a`, coche blanche SVG, scale 1.1.
2. La ligne entière passe à `opacity: 0.5` (transition 300 ms).
3. Après 350 ms, suppression effective.

C'est l'un des rares endroits où on s'autorise une animation un peu marquée — la complétion d'un mémo doit *récompenser*.

### Repère « Dans Ma journée »

Un span inline `<span class="w-2 h-2 rounded-full bg-amber-400 shrink-0">`, posé à gauche du titre dans toutes les vues qui listent dossiers, tâches, sous-tâches. Pas d'animation, pas de hover.

### Badges de statut

Voir tokens plus haut. Display `inline-flex`, padding `2px 8px`, radius 3 px, font 12 px / 500. Pas d'icône à l'intérieur. Jamais utilisés dans Ma journée (le filet remplace) ; utilisés dans les colonnes Tâches/Sous-tâches.

### Toasts

Position bottom-center, fond `--text` (noir), texte blanc, fade-up 180 ms. Toujours brefs (3-6 mots). Auto-dismiss après ~3 s. Pas d'icônes, sauf préfixe `⚠ ` pour les erreurs et `☀ ` pour les ajouts à Ma journée.

### Panneau détail

Colonne flexible (min-width 300 px) à droite. Titre éditable en grand (input 19 px / 600, fond blanc, shadow douce de 1-2 px). Sections séparées par `mb-5` à `mb-6`, chacune introduite par un libellé uppercase 10 px en `--text-3`. Action bar en bas avec ses boutons.

---

## Patterns d'interaction

### Garde-fous contre les doublons

Les opérations qui pourraient créer des doublons (ajout à Ma journée, etc.) sont **idempotentes côté Firestore** : on cherche d'abord une entrée existante avant d'écrire. Le client peut donc cliquer plusieurs fois sans risque. Si un doublon est détecté, on retourne l'ID existant et on affiche un toast `"Déjà dans Ma journée."` au lieu d'un message d'erreur.

### Injections optimistes

Quand une mutation Firestore a un effet visible (ajout à Ma journée, retrait, complétion), on met à jour l'état React **avant** que la souscription Firestore ne propage le snapshot (qui peut prendre ~1 s). C'est ce qui fait qu'Henri ne « clignote » jamais.

### Suppressions avec undo

Les suppressions de tâches, sous-tâches, mémos ou dossiers passent par `scheduleDelete` qui :
1. Retire l'item de l'état local immédiatement (apparence de suppression).
2. Affiche un toast « Supprimer X » avec un bouton **Annuler** pendant 5-6 s.
3. Au timeout, exécute la vraie suppression Firestore en cascade.
4. Si Annuler est cliqué, restaure tout localement et n'écrit rien.

Aucune confirmation modale pour les actions destructives standard. L'undo est suffisant et plus fluide.

### Raccourcis clavier

- `A` — ajouter à Ma journée
- `R` — rattacher la tâche sélectionnée à un autre parent
- `Espace` — basculer le panneau de détail
- `N` — créer une nouvelle entrée dans la colonne active
- `⌘/Ctrl + Click` — sélection multiple
- `Shift + Click` — sélection en plage

Toujours désactivés quand le focus est dans un input éditable.

### Tri unifié Ma journée

Ordre fixe (desktop et mobile) :
1. **Étoilés (importants)** — toutes catégories confondues
2. **En retard** — échéance < aujourd'hui
3. **Aujourd'hui** — échéance = aujourd'hui
4. **Futur avec date** — trié par date croissante
5. **Sans date**

À bucket et date égales : **tâches de dossier avant mémos**, puis tri alphabétique.

---

## Mobile : conventions spécifiques

- Le style mobile utilise **du `style={{…}}` inline** plus que Tailwind. Historique : le composant `MobileMyDay` a été écrit pour fonctionner en dehors du contexte Tailwind initial. Pas de migration prévue.
- Les boutons d'action sont en **pill** (radius 20 px) plutôt qu'en rounded-md.
- Les chips de date pré-remplie sont volontairement plus grandes (padding 8×14 px) que sur desktop pour rester tactiles.
- L'interaction « Réalisé » d'un mémo a la même séquence d'animation que sur desktop, mais avec des dimensions plus généreuses (30 px au lieu de 20 px).

---

## Anti-patterns à éviter

- **Ne pas ajouter de modales**. Les actions se font inline ou via le panneau détail. Une modale = un point de friction. Seule exception possible : confirmation d'une action vraiment irréversible et non-undoable (suppression de compte, par exemple — qui n'existe pas encore).
- **Ne pas ajouter d'icônes SVG décoratives**. Les glyphes Unicode (`☀`, `⇄`, `✕`, `⭐`, `🔁`) suffisent et restent cohérents.
- **Ne pas afficher le statut « Créé »** en badge ou en texte explicite dans les listes. C'est le défaut, ça n'apporte rien.
- **Ne pas mettre de filet coloré sur les mémos**. Le filet est réservé aux items de dossier qui portent un statut métier.
- **Ne pas inventer de nouvelle couleur**. Si un cas nécessite une nuance qui n'existe pas dans les tokens, c'est probablement le moment de réfléchir au token et de l'ajouter à `globals.css` proprement.
- **Ne pas multiplier les tailles de police**. Si un texte semble nécessiter 14 px, demander si 13 ou 15 fait l'affaire.
- **Ne pas mettre de confirmation `confirm()` JS**. Toujours préférer l'undo via toast.

---

## Inspirations et références

- **Finder macOS** — pour les colonnes Miller, la sélection contextuelle, la densité.
- **Notion** — pour les libellés de section discrets, le panneau détail à droite, l'esprit « contenu d'abord ».
- **Linear** — pour la sobriété chromatique, l'usage parcimonieux du bleu d'accent, les raccourcis clavier.
- **Things 3** — pour l'esthétique des cases à cocher, les animations de complétion, le tri Ma journée.

---

*Dernière mise à jour : mai 2026.*

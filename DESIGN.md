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

## Deux natures d'objets

Tout Henri repose sur une distinction, et elle se lit dans l'interface avant de se lire dans le code :

| | Se distingue par | Porte |
|---|---|---|
| **Tâche** | on la **traite** | statut Créé → Demandé → Reçu → Traité, échéance, délai de retour, poids dans l'avancement du dossier |
| **Mémo** | on le **réalise** | une case à cocher, rien d'autre |

Un mémo peut être rattaché à un dossier, **posé sous une tâche** de ce dossier, ou libre — c'est le même objet, seul l'endroit change. Rattaché, il s'affiche sous les tâches du dossier ; posé sous une tâche, dans la colonne Sous-tâches, à côté des sous-tâches ; libre, il ne vit que dans Ma journée. Le rattacher ne le transforme jamais en tâche : il garde sa case à cocher, et il n'a jamais de statut.

Un mémo descend d'un cran, jamais de deux : il se pose sous une tâche, pas sous une sous-tâche, et ne porte rien lui-même.

### La nature se règle là où se règlent les statuts

« De quelle nature est cette chose ? » et « où en est-elle ? » sont la même question posée au même moment. L'interrupteur **« Mémo »** est donc posé à côté des quatre statuts, dans le panneau de détail, et se lit dans les deux sens : **éteint**, les statuts sont actifs — c'est une tâche ; **allumé**, ils passent en grisé et la case à cocher prend la main — c'est un mémo.

C'est un seul interrupteur vu de ses deux côtés (`MemoSwitch`), le même composant dans le détail d'une tâche et dans celui d'un mémo, **sur desktop comme sur mobile** — Mes dossiers et Ma journée. Il remplace le bouton « En faire un mémo », qui était rangé en bas du panneau à côté de « Supprimer », et que mobile n'affichait même pas : une bascule de nature n'est pas une action de fin de course, et personne ne va la chercher là.

La bascule elle-même est une seule fonction (`convertItemToMemo` / `convertMemoToTask`, `src/lib/firestore.ts`), refus compris. Deux écrans qui la refont chacun à leur façon, c'est l'assurance que l'un des deux oubliera quelque chose — les commentaires, la tâche parente, un garde-fou.

**Le panneau, lui, ne bouge pas.** Rien n'apparaît, rien ne disparaît, rien ne se déplace quand on bascule : mêmes sections, dans le même ordre, à la même place, aux mêmes couleurs — le fond post-it jaune du détail d'un mémo a disparu pour cette raison. **Seul l'actif change de côté**, et c'est toute la pédagogie :

| | Tâche | Mémo |
|---|---|---|
| le mot en haut | « Tâche » | « Mémo » |
| la **case à cocher** (à gauche du titre) | grisée — une tâche ne s'accomplit pas d'un geste | active |
| les **quatre statuts** | actifs | grisés |
| la **répétition** | grisée — une tâche ne revient pas toute seule | active |

Tout reste affiché des deux côtés : c'est ce qui rend l'échange lisible avant de le faire. On voit ce qu'on perd et ce qu'on gagne — accomplir d'un côté, faire avancer de l'autre — sans qu'une seule ligne se déplace sous le doigt.

Aucun texte d'explication n'apparaît ou ne change avec l'interrupteur : ce serait, là encore, une page qui bouge. Ce qu'il faut comprendre est dit par le grisé, et par les infobulles. Seul un **refus** (un contenant, un mémo sans dossier) affiche un message, parce qu'il faut bien dire pourquoi rien ne s'est passé.

Conséquence : un mémo qui existe s'ouvre dans le **panneau de détail**, jamais dans un formulaire à part. `MemoSheet` (mobile) et `MemoComposer` (desktop) ne servent plus qu'à la **création**, où l'objet n'existe pas encore et où tous ses réglages doivent tenir en un geste.

La bascule ne déplace rien et ne perd rien : même dossier, même tâche parente s'il y en avait une (une sous-tâche devient un mémo posé sous la même tâche), et titre, étoile, échéance et rappel suivent. Les commentaires d'une tâche deviennent la note du mémo, la note du mémo redevient un commentaire.

Deux refus, qui découlent des définitions : une tâche qui **porte** quelque chose ne peut pas devenir un mémo (un mémo ne porte rien), et un mémo **sans dossier** ne peut pas devenir une tâche (une tâche appartient à un dossier).

Conséquences visuelles, appliquées partout :

- une tâche porte un **badge de statut** (colonnes Tâches/Sous-tâches) ou un **filet coloré** (Ma journée), un mémo n'a ni l'un ni l'autre — c'est ce qui les distingue dans le dossier ;
- les deux portent la **même case à cocher**, mais elle ne veut pas dire la même chose : un mémo se réalise d'un geste, une tâche demande d'abord où elle en est ;
- une tâche affichée dans Ma journée porte en plus une **croix** pour l'en retirer sans rien changer à son dossier ; un mémo n'en a pas — il n'existe pas ailleurs ;
- un mémo ne compte **jamais** dans les compteurs d'avancement du dossier ni dans le tri « charge restante » — il compte en revanche dans l'avancement de la tâche sous laquelle il est posé, où il pèse ce que pèse une sous-tâche.

### Une tâche qui contient n'est plus une tâche

Dès qu'une tâche porte quelque chose — une sous-tâche ou un mémo —, ce n'est plus une tâche : c'est un **contenant**. Le travail réel est descendu d'un cran ; elle, elle ne fait plus que le rassembler.

Ce n'est pas une troisième nature, c'est une situation : une tâche devient un contenant quand on lui pose un enfant, et redevient une tâche ordinaire quand on les enlève tous. Rien à cocher nulle part, rien de nouveau à stocker (`src/lib/completion.ts`).

Ce qu'un contenant cesse d'avoir :

- **pas de statut à régler à la main.** Les quatre statuts disparaissent de son détail et les raccourcis 1–4 ne s'y appliquent plus. Son état se déduit de ce qu'il porte, et s'affiche à sa place : « 2/5 » dans les colonnes, « 2/5 terminés » dans le détail ;
- **pas de place dans le calendrier.** Le calendrier répond à « qu'est-ce que je fais ce jour-là ? » : on ne fait pas un contenant, on fait ce qu'il contient. L'y laisser affichait deux fois le même travail — la chose et son rangement ;
- **pas de poids dans les compteurs du dossier.** Les quatre nombres colorés et le tri « charge restante » ignorent les contenants, pour la même raison : leur statut n'est que le résumé de celui de leurs enfants.

Ce qu'un contenant garde : son titre, son étoile, ses commentaires, son échéance et son rappel. Une date-butoir posée sur l'ensemble reste utile — elle s'affiche dans le dossier et dans Ma journée, mais plus dans le calendrier.

**Une tâche dont tout est fait est faite.** Quand le dernier enfant se ferme — dernière sous-tâche traitée ou dernier mémo coché —, le contenant passe « Traité » de lui-même, avec l'événement correspondant dans sa timeline. La règle inverse existait déjà (on ne peut pas déclarer traité ce qui porte encore quelque chose d'ouvert) : il ne restait que la conclusion, et la demander revenait à faire confirmer ce qu'on venait de faire.

Le sens de lecture importe : une tâche **sans** enfant ne conclut jamais rien toute seule — sinon toute tâche naîtrait traitée. La règle vit dans `src/lib/firestore.ts` (`completeParentIfAllChildrenDone`), branchée sur les deux seuls gestes qui ferment un enfant : `updateItemProgress` et `updateFloatingTask`. Elle relit l'état au serveur plutôt que de croire la vue appelante — deux enfants fermés coup sur coup depuis deux écrans donnent quand même la bonne conclusion.

### Les réglages se disent à la saisie — `#` `@` `>` `!`

Dans Ma journée, un mémo se tape en une ligne, et cette ligne ne savait rien dire de ses réglages. Les poser supposait d'ouvrir la fenêtre de création, ou de retrouver le mémo après coup — précisément le geste qu'une ligne de saisie existe pour éviter. **Un caractère en tête de saisie ouvre donc la proposition correspondante** : on en retient une, la ligne repart à vide, et on écrit le mémo.

| Jeton | Ce qu'il règle | Ce qu'il propose |
|---|---|---|
| `#` | le **dossier** | les derniers dossiers touchés, ou ceux dont le titre contient la requête |
| `@` | l'**échéance** | **les mêmes six propositions que partout ailleurs** (`getDueSuggestions`), et donc le rappel du jour même |
| `>` | la **tâche** sous laquelle le poser | les tâches de premier niveau du dossier retenu |
| `!` | l'**étoile** | rien — il n'y a rien à choisir entre important et pas important, il se règle dès la frappe |

```
#dupr  @lundi  !  relancer le syndic pour l'état daté
└ dossier      └ échéance + rappel 9 h              └ le mémo
```

Ce que la ligne crée reste un **mémo**, rattaché ou non : une chose qu'on coche, sans statut. Les jetons règlent le mémo, ils ne changent pas sa nature — c'est toute la première section de ce document, et la saisie rapide n'y fait pas exception. Une tâche se crée depuis son dossier (`T`), jamais depuis la ligne du jour.

C'est la même convention à l'ordinateur et au téléphone, et elle vit dans `src/lib/memoTokens.ts` — rien ne doit la réimplémenter, sinon les deux écrans finiront par proposer des choses différentes dans un ordre différent. Ce que la ligne écrit ensuite est un seul payload, `buildQuickMemo` (`src/lib/memos.ts`) : les deux écrans n'y mettaient déjà pas les mêmes champs.

Les règles sont les mêmes pour les quatre jetons :

- **Un jeton ne se lit qu'en tête de saisie.** « rappeler le client au sujet du lot #3 » est un mémo, pas une recherche de dossier : un caractère au milieu d'une phrase ne doit jamais ouvrir une liste.
- **Un jeton retenu se consomme** : il disparaît de la ligne et va s'afficher en **pastille** au-dessus, avec sa croix. La ligne est de nouveau vide, prête pour le jeton suivant ou pour le titre — et elle ne bouge pas, la liste s'ouvrant au-dessus comme le popover des mémos réalisés.
- **Tant qu'une liste est ouverte, la touche Entrée lui appartient** : elle retient une proposition, elle ne crée pas un mémo qui s'appellerait « #dup ». `↑↓` choisissent, `Échap` renonce.
- **Une seule proposition répond ? La barre d'espace la retient**, au clavier comme au pouce. L'espace qu'on allait taper pour continuer le nom n'a plus de rival à écarter : autant qu'il fasse passer à la suite. À deux propositions près il reste une lettre du nom cherché — un titre de dossier en contient (« #vente dup » doit pouvoir se taper). La liste le dit sur la ligne concernée (`Espace`), plutôt que de le faire deviner.
- **Renoncer ne perd pas ce qui est écrit** : le caractère tombe et le texte devient le titre. Quand rien ne répond, c'est dit et proposé sur une ligne cliquable — « Aucun dossier à ce nom — écrire un mémo sans dossier ». Un geste ne doit jamais rester sans issue.
- **Un jeton ne s'annonce que quand il veut dire quelque chose.** `>` n'apparaît dans le libellé de la saisie qu'une fois un dossier retenu : un mémo se pose sous une tâche *de son dossier*, et le proposer avant serait promettre une liste vide. Les dossiers **archivés** ne sont jamais proposés, pour la même raison — on n'y ajoute plus rien.

### Le même mémo depuis l'iPhone — la touche Action

Un mémo naît rarement devant l'écran. Il naît dans un couloir, au téléphone, en sortant d'un rendez-vous — et la ligne de saisie de Ma journée, si rapide soit-elle, suppose l'application déverrouillée, ouverte, à la bonne page. **La touche Action de l'iPhone ouvre donc un champ, et ce qu'on y tape ou dicte arrive dans Ma journée sans qu'Henri s'ouvre.** Le réglage tient dans Préférences → « Raccourci iPhone » : une clé à coller une fois dans le raccourci, et on n'y revient plus.

Ce que la capture écrit est **le mémo de la ligne de saisie**, pas un objet d'une autre espèce : même `buildQuickMemo`, mêmes jetons `#` `@` `>` `!`, même rappel armé le jour de l'échéance. Un notaire qui a appris « #dupr » à l'écran ne doit rien apprendre d'autre pour son pouce.

Deux différences, et une seule règle nouvelle :

- **le jeton s'arrête au premier espace.** « #vente dup » se tape à l'écran parce qu'une liste répond à chaque lettre ; dicté d'un trait, rien ne dirait où finit le nom du dossier et où commence le mémo ;
- **ce qui n'est pas certain n'est pas retenu.** À l'écran on choisit dans une liste ; ici personne n'est là pour trancher, et deviner classerait un mémo dans le mauvais dossier — l'erreur qu'on ne voit pas passer. Un jeton ambigu **revient donc dans le titre** : le mémo s'appelle « #dup relancer le syndic », il est sous les yeux dans Ma journée, il se corrige d'un geste. Perdre un rattachement est réparable, se tromper de dossier ne l'est pas ;
- **une ligne, un mémo** (vingt au plus) : une dictée en produit une, un texte collé peut en produire plusieurs.

Le raccourci reçoit en retour **une phrase, et c'est son seul accusé de réception** — « Noté : relancer le syndic (DUPONT · éch. 24/08/2026) ». Elle dit le dossier et l'échéance retenus, ce qui est la seule façon de repérer un jeton mal compris sans ouvrir l'application.

La lecture du texte vit dans `src/lib/quickCapture.ts`, la clé dans `src/lib/shortcutKey.ts`, la route dans `app/api/memo`. La clé n'ouvre que l'écriture d'un mémo — jamais la lecture des dossiers — et se retire d'un bouton.

**L'installer tient en un lien — et ce lien vient d'Apple, pas d'Henri.** Monter le raccourci à la main demande d'assembler cinq actions dans l'éditeur de Raccourcis : personne ne le fait deux fois, beaucoup ne le font pas une, et un outil qu'on n'installe pas ne sert à rien. On aurait donc voulu qu'Henri fabrique le raccourci, clé comprise, et le serve à une adresse à lui. **Apple l'interdit** : depuis iOS 15, un fichier `.shortcut` doit être *signé* pour être importé, la signature réclame les clés d'un appareil Apple, et la brèche qui laissait passer les fichiers non signés a été refermée dès la deuxième bêta. Un fichier hébergé par nos soins serait refusé, qu'on le télécharge depuis Safari ou qu'on l'ouvre par `shortcuts://import-shortcut`. Le seul lien qui installe un raccourci en un geste est le **lien iCloud** que produit l'application Raccourcis quand on partage.

D'où le partage des rôles. **L'office monte le raccourci une seule fois** — un iPhone, cinq minutes, la recette est dans les Préférences — et colle le lien iCloud obtenu : il est publié pour toute l'étude (`app/api/memo/lien`, `config/shortcut`, écriture réservée à l'administrateur, car ce lien commande un bouton affiché à tout le monde). **Chacun l'installe ensuite d'un tap.**

Le raccourci partagé, lui, **ne contient aucune clé** : un lien iCloud est public pour qui l'a, et un secret qui voyagerait dedans serait le secret de tous. À la place, sa première case `Texte` porte le repère `hnr_votre_cle`, que chacun remplace par la sienne après l'installation. C'est le seul geste qui reste — copier sa clé dans les Préférences, la coller dans le raccourci — et il ne se fait qu'une fois.

### Durée de vie d'un mémo

Un mémo est un pense-bête, pas une archive. Un mémo **coché** et **non rattaché** disparaît définitivement **7 jours après avoir été réalisé**.

Deux conditions, toutes les deux nécessaires — et c'est ce qui rend la règle sûre :

- **un mémo non coché ne disparaît jamais**, quel que soit son âge. Effacer ce qui n'a pas été fait, ce serait perdre du travail sans l'avoir demandé ;
- un mémo **rattaché** n'expire pas non plus — ni à un dossier, ni à une tâche : il appartient à ce qui le porte, il vit et meurt avec lui.

Un mémo récurrent est également épargné — il est appelé à revenir. La règle vit dans `src/lib/memos.ts` et rien d'autre ne doit la réimplémenter.

### Échéance d'une tâche

Une échéance dit **quand une tâche est attendue**. Une tâche passée en « Traité » n'est plus attendue nulle part : son échéance tombe avec elle, automatiquement.

C'est ce qui évite qu'une tâche accomplie continue de réclamer quelque chose — de s'afficher « en retard » en rouge, de remonter dans « à échéance aujourd'hui », d'occuper une case de la bande « échéances » du calendrier. Le statut porte l'information ; la date n'a plus rien à dire.

La règle vit dans `updateItemProgress` (`src/lib/firestore.ts`), le seul chemin par lequel une tâche change de statut — détail, raccourcis 1–4, Ma journée, calendrier. Aucune vue ne doit la refaire de son côté. Rouvrir une tâche traitée ne rend pas l'échéance : on la repose si elle a encore un sens.

Un mémo, lui, garde son échéance quand on le coche : il reste consultable tel qu'on l'a laissé, et disparaîtra de lui-même.

#### Le retour au doigt

Trois retours possibles à un geste, et **aucun n'est obligatoire** : le visuel (toujours), le son (`playDone`, coupé en mode silencieux), la vibration (`src/lib/haptics.ts`). La règle est que ce qu'il faut comprendre passe par l'écran ; le reste vient en plus.

La vibration marche sur **Android** ; **iOS ne l'implémente pas** depuis une page web, quel que soit le navigateur — c'est donc un bonus, jamais un canal d'information. Trois intensités, pour trois sens : `tapFeedback` (un appui pris en compte), `successFeedback` (quelque chose d'accompli), `refusedFeedback` (le geste n'a rien fait).

#### Les propositions d'échéance

Les mêmes six propositions partout où l'on pose une échéance — détail d'une tâche, détail d'un mémo, fenêtre de création, mobile : **Aujourd'hui · Demain · Dans 2 j. · Lundi prochain · Dans 1 sem. · Dans 1 mois** (le dossier, dont l'échéance légale se compte en mois, y ajoute 3 et 6 mois). La liste vit dans `getDueSuggestions` (`src/lib/dates.ts`) et le rendu dans `DueChips` — ni l'une ni l'autre recopiés ailleurs : les cinq écrans avaient fini par diverger, et « lundi prochain » manquait là où on en avait le plus besoin.

Une puce d'échéance doit dire deux choses, et les taisait toutes les deux : **laquelle est posée** (elle est pleine, et le reste quand on rouvre le détail) et **qu'on vient d'appuyer**. Sans retour au doigt, on tape deux fois en croyant avoir raté — sur mobile il n'y a pas de survol pour rassurer. L'appui enfonce donc la puce (`.due-chip:active`) et fait vibrer l'appareil quand il sait le faire.

**Toutes tombent à 9 h**, l'heure à laquelle on ouvre le dossier — y compris la date saisie à la main. Une échéance n'est pas un rendez-vous : ce qui compte est le jour, mais l'heure doit être tôt et la même partout, sinon deux échéances du même jour ne se comparent pas. Corollaire : « en retard » se compte en **jours**, jamais en heures — une échéance posée pour aujourd'hui ne vire pas au rouge à 9 h 01.

#### Le rappel du jour de l'échéance

Poser une échéance et poser un rappel étaient deux gestes, et le second se perdait : on datait une pièce pour le 12, et le 12 personne ne prévenait. Une échéance sans rappel est une intention, pas un engagement. **Poser une échéance arme donc systématiquement un rappel le jour même**, à l'heure réglée dans Préférences → Rappels (9 h par défaut, `dueReminderHour`) — sur une tâche comme sur un mémo, à l'ordinateur comme au téléphone, aux puces comme au calendrier saisi à la main.

« Proposer » n'est pas « imposer », et la nuance tient dans trois règles, toutes dans `src/lib/reminderPolicy.ts` :

- **Le rappel est posé d'avance, pas caché.** Il s'affiche aussitôt dans le sélecteur de rappel et se retire d'un clic, comme n'importe quel rappel. La puce « Échéance 09h » le réarme si on l'a retiré à tort.
- **Un rappel choisi à la main n'est jamais remplacé.** Henri ne déplace que le rappel qu'il avait proposé lui-même, reconnaissable à ce qu'il tombe exactement sur la proposition de l'échéance précédente — la valeur suffit à dire d'où vient un rappel, sans stocker sa provenance. Déplacer l'échéance déplace ce rappel ; retirer l'échéance le retire.
- **Rien n'est proposé pour une heure déjà passée.** Une échéance posée à 15 h pour aujourd'hui n'a que faire d'un rappel de 9 h : elle est déjà dans Ma journée, et le récap du soir la reprendra.

Une seule heure pour tous les rappels d'échéance, et non une par tâche : c'est le même geste de bureau — ouvrir la journée et voir ce qui tombe aujourd'hui. Qui n'en veut pas la coupe une fois pour toutes (« Ne rien proposer »), plutôt que de la refuser à chaque échéance.

N'inventer ni troisième nature ni statut intermédiaire : si un objet ne rentre dans aucune des deux cases, c'est la définition qu'il faut revoir, pas le modèle qu'il faut étendre. Le contenant n'en est pas une : c'est une tâche dans une certaine situation, et rien n'est stocké pour lui.

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

### La nuit

Un notaire ouvre Henri le soir, et un écran blanc à 23 h se paie en fatigue. Le thème se choisit dans **Préférences → Apparence** — *Clair*, *Sombre*, ou *Système*, ce dernier suivant l'appareil, y compris quand il bascule tout seul au coucher du soleil.

Techniquement : un attribut `data-theme` sur `<html>`, une seconde table de variables dans `globals.css`, et rien d'autre à changer — **tout passe par les tokens**. Un petit script inline dans `app/layout.tsx` pose l'attribut avant le premier pixel : sans lui, l'application ouverte la nuit commencerait par un éclair blanc, ce qui est exactement ce qu'on cherchait à éviter.

Trois principes ont guidé la table sombre :

- **ce n'est pas un négatif.** Le fond est un gris très sombre, légèrement chaud (`#1a1a19`) : un noir pur fait vibrer le texte clair, et l'aspect « bureau » du thème clair se perdrait ;
- **les couleurs sémantiques sont reprises une à une, pas inversées.** L'ambre de l'échéance s'éclaircit (`#e9b661`) au lieu de s'assombrir ; sans quoi un texte ambre foncé sur fond ambre sombre deviendrait illisible ;
- **une paire encre/papier bascule ensemble.** Un bouton « fond `--text`, texte `--bg` » reste lisible dans les deux thèmes sans une ligne de code de plus. C'est pourquoi les couleurs ne s'écrivent jamais en dur dans un composant : elles s'écrivaient ainsi partout, et c'est ce qui rendait la nuit impossible.

Le logo, lettrage noir sur fond transparent, est renversé par un filtre CSS plutôt que dupliqué en second fichier — deux fichiers finiraient par diverger.

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

### La barre du haut — un rond pour le compte, et rien d'autre

Ce qui ne sert pas au travail se replie. Les rappels de cet appareil, l'installation, les Préférences et la déconnexion tenaient cinq boutons en haut à droite de « Dossiers » — et « Ma journée » avait, pour les mêmes choses, un menu tout autre, qui ne menait même pas aux Préférences. Deux grammaires, une barre encombrée à l'endroit précis où l'œil cherche des dossiers.

**Tout tient désormais derrière un rond unique, en haut à droite du grand écran** (`src/components/AccountMenu.tsx`). Il porte la première lettre de l'adresse connectée : de quoi distinguer d'un coup d'œil le compte de travail du compte d'administration, qui sont deux comptes distincts. Le menu qu'il ouvre dit l'adresse en entier, puis les quatre commandes, dans cet ordre : les rappels sur cet appareil, l'installation (quand elle est possible), les Préférences, la déconnexion.

La règle qui vaut au-delà de ce rond : **une commande qu'on touche une fois par mois n'a pas à occuper la barre que l'on regarde toute la journée.** Ce qui est fréquent — créer, trier, cocher — garde la place ; le reste se replie derrière un geste.

**Sur téléphone, ce rond n'existe pas** : le compte est devenu la **page d'accueil des Préférences** (`Préférences → Accueil` — c'est sur elle que la page s'ouvre) : le logo, la version, puis l'adresse connectée, les notifications de cet appareil, l'installation, la déconnexion. Le logo y a sa place pour la même raison qu'à l'écran d'attente : on y arrive, on n'y travaille pas. Il n'était de toute façon qu'un raccourci vers elles, et deux destinations pour la même chose coûtaient au téléphone la seule largeur qui lui manquait — celle des trois noms de la barre du bas. Le geste des rappels de cet appareil, lui, ne vit qu'une fois : `useDeviceReminders` (`src/lib/deviceReminders.ts`), que le rond et l'onglet appellent tous les deux.

Le logo suit la même règle et **ne figure plus dans l'en-tête du téléphone** : il ne se touche pas, il ne dit rien qu'on ne sache déjà une fois entré, et il occupait la largeur exacte qui manquait au reste. Il tient sa place là où l'on arrive — connexion, invitation, écran d'attente —, pas là où l'on travaille. Sur grand écran, où la place ne manque pas, il reste centré dans la barre du haut.

### Les réglages — un rail de titres, pas une colonne

Les Préférences s'ouvraient sur une colonne d'onglets verticale : un quart de la largeur pour neuf mots, et autant de moins pour ce qu'on est venu régler — sur un téléphone, la moitié de l'écran.

Les titres passent donc **à l'horizontale, en haut, sur un rail qui défile** (`.pivot`, `app/globals.css`). Le titre courant se range au bord gauche, en pleine encre ; les suivants restent gris, et **celui qui vient dépasse du bord** — c'est lui qui dit qu'il y en a d'autres, sans avoir à les montrer tous. Le pouce fait défiler les sections comme il fait défiler les colonnes ailleurs dans Henri : un geste franchement horizontal, jamais un geste vertical, qui reste un défilement de page.

Sur grand écran les neuf titres tiennent d'une traite ; sur téléphone le rail glisse. Le même composant, sans variante à maintenir.

### Un réglage se pose, il ne se signe pas

Huit des dix onglets des Préférences enregistraient au geste — les Rappels écrivent la règle dès le clic (`saveReminderPolicy`), le Raccourci à la validation du lien, les Modèles au renommage. Seul **Apparence** demandait encore une signature : un bouton « Enregistrer » en haut à droite, qui n'apparaissait que là et que rien n'annonçait ailleurs.

Le piège n'était pas la place perdue, c'était la promesse tenue à moitié : le choix s'appliquait à l'écran dès le clic — la police changeait, le thème basculait —, mais n'était écrit qu'après le bouton. Qui réglait sa densité et repartait par « Retour » emportait une interface changée qui redeviendrait celle d'avant au rechargement. Un réglage qu'on voit appliqué et qui ne l'est pas est pire qu'un réglage qui refuse.

**Apparence écrit donc au geste, comme les autres**, et le bouton disparaît plutôt que de se répandre sur les neuf autres onglets, où il n'aurait rien eu à enregistrer. À sa place, le même « Enregistré ✓ » discret que les Rappels affichent : il paraît une seconde et s'efface, il confirme sans rien réclamer.

**« Réinitialiser » reste** : c'est une action, pas une confirmation — la seule commande de cet onglet qui fasse quelque chose qu'un réglage ne fait pas. Elle se tient avec le « Enregistré ✓ » **dans le contenu de l'onglet**, en tête des sections, et non dans l'en-tête : celui-ci n'existe pas sur téléphone (voir ci-dessous), et une commande qui ne vit que sur grand écran est une commande que le téléphone n'a pas.

### Les Préférences n'ont pas de barre en haut sur téléphone

« Rien en haut » vaut pour les Préférences comme pour le reste : elles gardaient pourtant une barre de 44 px portant « ← Retour » — et ce retour ne menait qu'aux dossiers, là où la barre du bas emmène déjà d'un pouce, sans remonter au point le plus loin de la main. Un mot en double, payé d'une barre entière, et le seul écran d'Henri à en garder une.

**L'en-tête est donc réservé au grand écran** (`hidden md:flex`) : sur téléphone, l'écran commence par le rail des titres, comme Ma journée commence par ses tâches. Le logo n'y perd rien — il n'était déjà montré qu'à partir de `sm`, et la page d'accueil des Préférences le porte en propre.

### Desktop — métaphore Finder à colonnes

La vue principale est un **Miller column browser** : trois colonnes glissantes (Dossiers → Tâches → Sous-tâches) plus un panneau de détail à droite. Une 4ᵉ colonne contextuelle apparaît pour « Ma journée » et « Suggestions ».

- Chaque colonne fait `var(--col-w)` (280 px par défaut), shrink interdit, scroll vertical interne.
- Filet de 1 px `--border` entre chaque colonne.
- Header de colonne de 34 px : le titre à gauche, son compteur d'éléments juste après, les commandes à droite. Ces commandes parlent une seule langue — des **pastilles** de 11 px (bordure, coin arrondi, pleine encre quand elles sont actives), jamais un contrôle natif : le menu déroulant du tri des dossiers imposait sa police, sa taille et son chevron, et jurait avec les pastilles « Sélection » ou « Dossier » des colonnes voisines. Le tri tient donc dans une pastille unique qui dit le critère courant et son sens (« Nom ↑ »), et ouvre un menu où l'on choisit l'un des quatre critères, puis le sens.
- La colonne **active** (focus clavier) a ses lignes en bleu vif (`#dbeafe` fond, `#2f6eff` filet gauche 3 px, texte 600).
- Les colonnes **parentes** (qui portent la sélection menant à la colonne active) ont leurs lignes en gris discret (`--bg-subtle`, `--border-strong` filet, opacity 0.75). Le contraste hiérarchique est clé pour comprendre la navigation.

### Desktop — vue Calendrier

Pas de grille horaire : Henri n'a pas de rendez-vous, et une grille serait vide à 95 %. L'axe du temps est horizontal et porte trois bandes, nommées dans le vocabulaire du cycle d'une tâche (*je la crée, je la réalise, j'attends le retour, elle est traitée*) :

| Bande | Contenu |
|---|---|
| **À faire** | ce qu'on réalise ce jour-là. En tête, parce que c'est ce qu'on regarde le matin |
| **J'attends** | les demandes parties sans réponse, dessinées comme des **durées** et non des points |
| **Échéances** | ce qui tombe ce jour-là |

Plus une colonne fixe **En retard** à gauche, hors du flux : dans un calendrier, le retard n'a pas de jour.

Règles propres à cette vue :

- les libellés parlent la langue de l'utilisateur, jamais la métaphore du concepteur — pas de « rive », pas de « flux entrant » ;
- Henri **explique toujours son calcul** au survol (« Échéance 30/09 − 60 j de délai → à faire le 31/07 ») : une déduction automatique qu'on ne peut pas auditer est une déduction qu'on ne suivra pas ;
- le rail horaire de la vue Jour ne porte **que les rappels** — le seul objet réellement horodaté du modèle. Ne rien y inventer d'autre.

### Mobile

Layout vertical empilé. Pas de colonnes. Un seul écran à la fois, et la barre du bas dit lequel. **Rien en haut** : ce qui se touche est en bas, ce qui se lit commence tout en haut de l'écran. Les éléments tactiles font ≥ 30 px de côté, les chips de date sont en pill 20 px de rayon.

### La barre du bas — trois destinations, une seule pastille encrée

La navigation vivait en haut à gauche, et pas au même endroit selon l'écran : un rond « ☀ » depuis les dossiers, un rond « dossier » depuis la journée, les Préférences enfouies dans le menu du compte. Trois endroits pour trois destinations, et aucun ne disait où l'on se trouve — le haut de l'écran est d'ailleurs le point le plus loin du pouce.

**Les trois destinations tiennent désormais dans une barre en bas** (`src/components/MobileTabs.tsx`) : Ma journée, Dossiers, Préférences. La forme est un segmenté en pastille — filet de 1 px, rayon plein, l'écran courant en pleine encre —, la même grammaire que les chips d'ailleurs dans Henri. Le compte du jour se colle à « Ma journée » : c'est le seul des trois qui change dans la journée, et la seule chose qu'on veut savoir sans y aller.

Trois règles la tiennent :

- **elle dit où l'on est**, ce qu'aucun des ronds ne faisait : la pastille encrée est l'écran courant ;
- **elle s'efface pendant qu'on écrit** un mémo — le clavier prend déjà la moitié de l'écran, et on ne navigue pas en pleine phrase ;
- **elle ne coupe jamais un mot, et les trois portent le leur.** Le corps du texte suit l'écran au lieu de sauter d'un palier à l'autre — `clamp(10.5px, 3.1vw, 12px)` sur `.henri-tab` — : 12 px dès 390 px de large, la taille des chips ; 10,5 px sur un écran de 320 px. Mesuré : à 12,5 px fixes, les trois noms réclamaient 367 px pour 356 disponibles sur un iPhone 14, et « Préférences » se coupait en « Préféren ».

C'est ce qui a décidé du sort du rond du compte : tant qu'il occupait le bout de la rangée, les trois noms n'y tenaient à aucune taille lisible. Il est donc devenu un onglet des Préférences, dont il n'était que le raccourci.

Le composant ne se positionne pas lui-même : Ma journée l'empile sous sa ligne de saisie, Dossiers et Préférences la font flotter au-dessus du contenu, qui se réserve la hauteur correspondante.

Conséquence sur le haut de l'écran : **il n'y a plus d'en-tête sur téléphone.** Elle ne portait plus qu'un rond — 48 px pour un bouton qu'on touche une fois par jour, au-dessus d'une ligne de titre qui a de la place à revendre. Dossiers commence donc à sa ligne de titre (« Dossiers 12 · tri · + »), et Ma journée par le jour, qui est devenu son titre de liste et défile avec elle.

### La page de connexion — l'encre autour, la carte au clair

**La connexion porte l'encre** (`src/components/AuthPanel.tsx`) : fond plein (`--text`), carte claire posée dessus (`--bg`), écriture sombre dedans, et pas de filet — c'est l'encre qui détoure la carte. C'est le premier écran d'Henri, celui qu'on voit avant d'avoir un compte : il doit se reconnaître avant d'être lu, et il ne se travaille pas.

L'inversion ne coûte rien à tenir : ce sont les deux mêmes jetons, qui échangent leurs rôles avec le thème. **La nuit, le cadre devient clair et la carte sombre, d'elle-même** — pas de seconde version à maintenir. Le logo, lui, suit la règle déjà posée (`img[src*="logo-henri"]` au thème sombre), qui le renverse en blanc sur la carte sombre.

### L'écran d'attente — le logo, et un sablier

« Chargement… » arrivait sur un écran vide, sans rien qui rappelle où l'on est, et un mot fixe laisse croire à un blocage dès la deuxième seconde. L'écran d'attente (`src/components/LoadingScreen.tsx`) montre donc **le logo, et sous lui un sablier qui se retourne** : le logo dit chez qui l'on est — c'est le seul endroit de l'application où il a encore quelque chose à faire —, le sablier dit que ça vit, sans promettre de durée.

Il ne se montre **qu'au bout de 250 ms** (`.henri-attente`) : une session déjà ouverte se rétablit plus vite que ça, et une attente qui n'a pas eu lieu ne doit pas clignoter. Le sablier fait un tour complet (0 → 180 → 360°) avec deux temps morts — le sable a le temps de couler avant que le verre ne bascule — et s'immobilise sous `prefers-reduced-motion`.

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

Carré arrondi 20 px (desktop) / 26 px (mobile), border 2 px `#9ca3af` (`d1d5db` sur mobile), fond blanc. Au clic :
1. Animation immédiate : fond vert `#16a34a`, coche blanche SVG, scale 1.1.
2. La ligne passe à `opacity: 0.45`, le titre est barré.
3. `doneAt` enregistre la date.

C'est l'un des rares endroits où on s'autorise une animation un peu marquée — la complétion d'un mémo doit *récompenser*.

Ce qui suit dépend de la vue :

- **Ma journée**, desktop comme mobile : le mémo réalisé **quitte la liste** au terme de l'animation. Ce qui est fait n'a plus à occuper la journée. On le retrouve par un lien discret en bas de la colonne — « n mémos réalisés » — d'où on peut le rouvrir ou le décocher (il revient alors dans la journée).
- **Colonne Tâches d'un dossier** : le mémo reste, barré. Le dossier est sa maison, pas un fil du jour.

Cocher ne supprime jamais rien tout de suite ; c'est le temps qui s'en charge (voir « Durée de vie d'un mémo »).

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

**Créer — une lettre par nature.** Chaque touche nomme ce qu'elle crée et le pose au bon endroit, sans qu'on ait à savoir quelle colonne est active :

- `D` — dossier
- `T` — tâche · `⇧T` — sous-tâche
- `M` — mémo (ouvre sa fenêtre de saisie)
- `#` `@` `>` `!` — en tête de la saisie de Ma journée : dossier, échéance, tâche, étoile (voir « Les réglages se disent à la saisie »)

**Agir :**

- `A` — ajouter à Ma journée
- `R` — rattacher la tâche sélectionnée à un autre parent
- `I` — ouvrir / fermer le panneau de détail
- `Espace` — renommer l'élément sélectionné
- `1` à `4` — changer le statut
- `S` — rechercher un dossier
- `⌘/Ctrl + Click` — sélection multiple
- `Shift + Click` — sélection en plage

La vue Calendrier a son propre jeu, volontairement distinct : `S` semaine, `J` jour, `T` aujourd'hui, `←/→` période.

Toujours désactivés quand le focus est dans un input éditable.

### Tri unifié Ma journée

Ordre fixe (desktop et mobile) :
1. **Étoilés (importants)** — toutes catégories confondues
2. **En retard** — échéance < aujourd'hui
3. **Aujourd'hui** — échéance = aujourd'hui
4. **Futur avec date** — trié par date croissante
5. **Sans date**

À bucket et date égales : **tâches de dossier avant mémos**, puis tri alphabétique.

Un mémo coché sort de ce classement : il quitte la liste et rejoint le lien « réalisés » du bas, sur desktop comme sur mobile.

---

## Mobile : conventions spécifiques

- Le style mobile utilise **du `style={{…}}` inline** plus que Tailwind. Historique : le composant `MobileMyDay` a été écrit pour fonctionner en dehors du contexte Tailwind initial. Pas de migration prévue.
- Les boutons d'action sont en **pill** (radius 20 px) plutôt qu'en rounded-md.
- Les chips de date pré-remplie sont volontairement plus grandes (padding 8×14 px) que sur desktop pour rester tactiles.
- L'interaction « Réalisé » d'un mémo a la même séquence d'animation que sur desktop, mais avec des dimensions plus généreuses (26 px au lieu de 20 px).
- **Une ligne de Ma journée a une seule forme**, mémo ou tâche : case à cocher à gauche, titre, puis la croix « retirer » à droite pour les seules tâches. La nature se lit au filet coloré (tâche) ou à son absence (mémo), jamais à la disposition.
- **Cocher une tâche ouvre une modale** « Où en est cette tâche ? » : les quatre statuts, puis la tâche quitte la journée et reste dans son dossier. C'est l'une des rares modales admises — une tâche ne se « réalise » pas, elle avance, et il faut bien dire jusqu'où.
- **Un mémo se crée et se modifie dans le même écran** (`MemoSheet`) : même champs, même disposition, seuls le titre et le bouton changent. Deux formulaires pour un même objet, c'était une chance sur deux de tomber sur celui qui ne sait pas faire ce qu'on veut.

---

## Anti-patterns à éviter

- **Ne pas ajouter de modales pour une action simple**. Les actions se font inline ou via le panneau détail. Une modale = un point de friction. Trois exceptions admises, et elles ont un point commun — la modale y apporte quelque chose qu'aucune ligne inline ne peut donner :
  - une **création qui a besoin de ses paramètres d'emblée** (fenêtre de saisie d'un mémo : titre, dossier, échéance, rappel en un seul geste — les régler après coup supposerait de retrouver ce qu'on vient de créer) ;
  - un **choix dans une liste** (modèles de dossier) ;
  - une **aide consultable** (raccourcis clavier).

  Jamais pour une confirmation banale : l'undo par toast reste la règle.
- **Ne pas ajouter d'icônes SVG décoratives**. Les glyphes Unicode (`☀`, `⇄`, `✕`, `⭐`, `🔁`) suffisent et restent cohérents.
- **Ne pas afficher le statut « Créé »** en badge ou en texte explicite dans les listes. C'est le défaut, ça n'apporte rien.
- **Ne pas mettre de filet coloré sur les mémos**. Le filet est réservé aux items de dossier qui portent un statut métier.
- **Ne jamais écrire une couleur en dur** — ni `#9ca3af` dans un `style`, ni `text-red-500` dans un `className`. Une couleur écrite en dur ne connaît pas la nuit : elle reste claire quand tout s'assombrit. Les tokens couvrent les neutres, les statuts et les trois familles sémantiques (`--warn-*`, `--ok-*`, `--danger-*`), exposées à Tailwind sous `warn`, `ok`, `danger`. Deux exceptions, et elles sont volontaires : les voiles de modale (`bg-black/20`), qui sont sombres dans les deux thèmes, et la coche blanche posée sur une pastille de couleur pleine.
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

*Dernière mise à jour : juillet 2026.*

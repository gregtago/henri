# Henri — Vue Calendrier, proposition d'amélioration

Suite de `CALENDRIER.md`. Ce document ne rejoue pas le raisonnement de la V1 —
il le tient pour acquis, et il est encore juste. Il dit ce qui manque une fois la
vue en service : **trois manques de fond, un sas à remettre d'aplomb, et huit
défauts constatés dans le code.**

Le code concerné : `src/components/CalendarShell.tsx`, `src/lib/calendar.ts`,
`src/lib/delais.ts`, section `CALENDRIER` de `app/globals.css`.

*Arbitrages du 21/08/2026 : la réglette (§ 3) et le filtre par dossier (§ 4)
sont retenus tels quels. Pour les pièces reçues, le premier jet les posait dans
la bande « à faire » ; l'arbitrage a tranché autrement — la grille est une vue
d'anticipation, elle appartient aux tâches créées et demandées. Le § 2 propose
donc la bannette à la place.*

---

## 1. Le point de départ : un cycle à quatre statuts, une vue qui en dessine deux

La V1 a posé la bonne idée — le temps d'attente est la matière première, et il se
dessine comme une durée. Elle sait dire trois choses qu'aucun agenda ne dit :
quand la demande doit partir, depuis combien de jours elle est partie, et quelle
échéance est déjà mathématiquement menacée.

Mais si l'on met la vue en face du cycle de vie d'une tâche, il manque une case :

| Statut | Ce que le calendrier en fait aujourd'hui |
|---|---|
| **Créé** | pastille « à faire » le jour du point de non-retour — *dessiné* |
| **Demandé** | barre d'attente qui traverse les jours — *dessiné* |
| **Reçu** | rien. La barre s'arrête, et plus aucune pastille ne prend le relais |
| **Traité** | disparition — *voulu* |

**Une pièce revenue et non exploitée n'existe nulle part dans le calendrier.**
Elle est sortie de « j'attends » le jour où on l'a cochée « Reçu », et elle
n'entre dans « à faire » aucun jour, parce que `sortant` ne se remplit que pour
les statuts `Créé` (lancement) et `Demandé` (relance) — `src/lib/calendar.ts:274`
et `:279`. Elle ne réapparaît qu'à son échéance, c'est-à-dire au moment où il est
trop tard pour la traiter tranquillement.

Or c'est très exactement le tas qui grossit dans une étude. Attendre ne coûte
rien : c'est le syndic qui travaille. Ce qui coûte, c'est ce qui est revenu et
qu'il faut lire, vérifier, reporter dans l'acte. Le calendrier montre le temps
des autres et pas le sien.

À cela s'ajoutent deux limites de cadrage :

- la fenêtre fait **sept jours**, le délai notarial en fait **soixante** (DIA) ;
- la vue mélange **tous les dossiers ouverts**, sans aucun moyen d'en isoler un.

Trois manques, dans cet ordre de rentabilité.

---

## 2. Manque n°1 — le retour n'a pas de lendemain : la bannette

Le premier jet de ce document proposait de poser la pièce reçue en tête de la
bande « à faire » du jour. L'arbitrage rendu est autre, et il est plus juste :
**le calendrier est une vue d'anticipation.** Ce qui compte le plus dans la
grille, ce sont les tâches créées et demandées — celles dont on n'a pas encore
la matière, celles pour lesquelles la vue existe : faire revenir cette matière à
temps. Une pièce reçue est exactement l'inverse. La matière est là, plus rien à
anticiper, plus personne à attendre. **Elle n'a pas de date — donc pas de
colonne.**

Et une pastille qui se reposerait chaque matin dans la colonne du jour aurait le
destin d'une bannière : répétée tous les jours, elle serait invisible au bout
d'une semaine. La bande « à faire » reste donc celle de l'anticipation pure —
les lancements d'abord (la date est un couperet calculé), les relances ensuite.

### La bannette

Dans une étude, ce qui revient par le courrier ne se pose pas sur l'agenda : ça
se pose dans une bannette. La colonne de gauche porte donc **deux tas**, les
deux bouts du cycle, tous les deux sans date :

```
┌────────────────────┐
│ EN RETARD        4 │   ce que les dates condamnent
│ ▌État daté         │
│  VENTE MARTIN      │
│  35 j de retard    │
├────────────────────┤
│ BANNETTE         7 │   ce que les retours apportent
│ ▌Décompte de prêt  │
│  VENTE MOREAU      │
│  reçu il y a 2 j · éch. 12/09 │
│ ▌Note d'urbanisme  │
│  VENTE DUPONT      │
│  reçu il y a 9 j   │
└────────────────────┘
```

Le tas du haut dit « tu es en train de perdre », celui du bas dit « tu as de
quoi travailler ». Entre les deux, la grille reste pure : elle ne montre que
l'anticipation — ce qu'il faut lancer, ce qu'on attend, ce qui tombe. C'est la
même logique qui a sorti le retard du flux en V1 : ce qui n'a pas de jour ne se
range pas dans une case ; appliquée à l'autre bout du cycle.

Le tas vit dans la colonne `cal-sas` existante, sous « En retard », et il est
donc présent dans les deux modes — Semaine et Jour — sans rien implémenter deux
fois.

### L'ordre du tas

Pas l'ordre d'arrivée : **l'ordre de la marge restante.** Une pièce s'exploite
avant son échéance ; le tri est par échéance croissante (celle de la tâche,
sinon celle du dossier), et les pièces sans échéance suivent, les plus
anciennes d'abord. Chaque ligne dit son âge — « reçu il y a 6 j » — parce qu'une
attente qu'on s'inflige à soi-même, après avoir payé trois semaines de syndic,
est la plus bête des deux. Au-delà de 10 jours, l'âge passe à l'ambre.

### Les deux tas communiquent

Rien à câbler : une pièce reçue dont l'échéance passe entre déjà dans le sas
(« Reçu » est dans `OPEN_STATUSES`, `src/lib/calendar.ts:357`). Une bannette
qu'on laisse dormir se vide donc toute seule — par le haut, dans le tas des
retards. C'est ce qui rend le tas honnête : il ne grossit jamais en silence, il
finit par accuser.

### On peut la vider

Trois gestes, sans ouvrir l'inspecteur :

- **« Traité » au survol** — exploiter une pièce, c'est la sortir du cycle ; le
  même bouton que celui proposé pour le sas au § 5 ;
- **glisser sur le rail** (vue Jour) — « je l'exploite jeudi à 10 h » pose le
  rappel ; la mécanique de dépôt existe, il suffit que `findTask` voie ces
  entrées (c'est le défaut n°4 du § 6) ;
- **clic sur le nom du dossier** — le filtre du § 4 : la bannette d'un seul
  dossier, c'est la pile à traiter avant sa signature.

C'est aussi la meilleure réponse au second test du § 10 : la bannette est, de
toute la vue, la chose la plus satisfaisante à vider.

### Ce que ça coûte

Identique au premier jet : rien d'obligatoire. La date de réception se lit dans
la timeline déjà journalisée (`progress_changed → Reçu`), par le même mécanisme
que la date de demande — `buildRequestedAtIndex`, `src/lib/calendar.ts:109`, à
généraliser en `buildStatusDateIndex(events, status)`. Un `receivedAt`
dénormalisé sur l'`Item` reste souhaitable, pas nécessaire — même statut que le
`requestedAt` de la V1.

---

## 3. Manque n°2 — sept jours ne contiennent pas un délai notarial

Le barème de l'étude va de 7 à 60 jours (`src/lib/delais.ts`). Une DIA occupe
neuf semaines. Dans une fenêtre de sept colonnes, sa barre entre par un bord et
sort par l'autre : on voit un segment, jamais une durée. Et ce qui ne rentre pas
est rangé sous une ligne qui, en plus, dit le contraire de la vérité (voir § 5,
défaut n°1).

Une vue Mois a été écartée, et c'est justifié : un mois de cases est une vue de
rendez-vous, elle range des points quand nous avons des durées. Mais la
conclusion — « la semaine suffit » — ne tient pas pour un métier dont l'unité de
temps est le mois.

### La réglette

Une bande de **30 px**, entre la barre d'outils et les en-têtes de jour, qui
porte **90 jours : 30 en arrière, 60 en avant.**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ juillet          │ août            ▮aujourd'hui      │ septembre             │
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▨▨▨▨▨▨▨▨▨▨▨   ← état daté, en retard depuis le 25/06     │
│           ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  ← DIA, 60 j            │
│     ╷      ╷ ╷           ╷    ┏━━━━━━━┓  ╷        ╷╷      ╷   ← échéances     │
└─────────────────────────────┗ fenêtre ┛──────────────────────────────────────┘
```

Elle porte quatre choses, et rien d'autre :

- **la fenêtre affichée**, comme un cadre qu'on déplace — c'est elle qui donne
  enfin un sens visible aux flèches `←` `→` ;
- **toutes les attentes en cours**, en segments de 2 px, hachurés rouge au-delà
  du retour attendu — y compris celles qui ne touchent pas la semaine affichée,
  c'est-à-dire précisément celles qu'on oublie ;
- **les échéances**, en traits verticaux, plus épais quand plusieurs tombent le
  même jour ;
- **aujourd'hui**, en liseré `--accent`, comme dans la grille.

Un clic déplace la fenêtre, un cliquer-glisser la fait défiler. Survoler un
segment allume la pastille correspondante dans les bandes, exactement comme le
survol actuel (`hoveredTaskId`) — la mécanique existe déjà.

C'est le seul endroit d'Henri où l'on voit une DIA en entier. Elle coûte 30 px et
aucune donnée nouvelle : `model.bars` calculé sur une fenêtre de 90 jours au lieu
de 7, ce qui est le même code.

---

## 4. Manque n°3 — la vue ne sait pas de quel dossier on parle

Trente dossiers ouverts font une semaine où chaque bande est un mélange. On
regarde une pastille, on lit le nom du dossier, on cherche les autres pastilles du
même dossier à l'œil. Le survol estompe déjà les autres pastilles — mais tâche par
tâche, jamais dossier par dossier.

**Le nom du dossier, sur une pastille, devient cliquable.** Un clic, et toute la
vue se restreint à ce dossier : les trois bandes, le sas, la réglette, la vue
Jour. Une pastille `VENTE DUPONT ×` s'affiche dans la barre d'outils, et `Échap`
la retire.

Ce que ça produit n'est pas un filtre de confort, c'est **une deuxième vue
gratuite** : le calendrier d'un dossier seul, c'est son plan de charge — ce qui
est parti, ce qui revient quand, ce qu'il reste à lancer avant la signature.
C'est la moitié de la « simulation » inscrite en V4 au § 9 de la V1, obtenue sans
rien calculer de neuf.

Complément clavier, cohérent avec le « clavier first » de `DESIGN.md` : une
touche ouvre un champ de filtre par titre de dossier. Le caractère exact est à
arbitrer avec les raccourcis existants d'Henri — les jetons de saisie de Ma
journée utilisent déjà `#` pour désigner un dossier, et c'est l'analogie la plus
courte à apprendre.

---

## 5. Le sas : un tas, mais un tas ordonné

Le sas est la meilleure idée de la V1 et la moins finie des trois bandes.

**Il ne dit pas le retard.** La maquette de la V1 promettait « 35 j de retard » ;
le composant affiche un point de statut, un titre, un dossier, une étoile —
`EntryChip`, `src/components/CalendarShell.tsx:711`. Une liste de choses en
retard qui ne dit pas de combien ne se hiérarchise pas.

**Son étiquette dit le contraire de ce qu'elle devrait.** Une entrée de motif
`lancement` y affiche `−60 j`, la même étiquette que dans la bande « à faire ».
Là-bas elle veut dire « il te reste ce délai » ; ici, où la date est franchie,
elle doit dire « le point de non-retour est passé ». Deux sens opposés pour le
même signe.

**Un dossier en retard vide tout le reste.** Les tâches sans échéance propre
héritent de l'échéance légale du dossier (`dueFromCase`, `src/lib/calendar.ts:165`)
et le sas les prend une par une (`:358`). Une signature reportée verse donc d'un
coup dans le sas les vingt tâches ouvertes du dossier, et les trois vraies
urgences des autres dossiers passent sous la ligne de flottaison.

Trois corrections, dans cet ordre :

1. chaque ligne porte son retard en jours, et c'est le **tri par défaut** ;
2. les tâches en retard **par l'échéance du dossier** sont **groupées sous une
   ligne de dossier** dépliable — « VENTE MARTIN · échéance dépassée · 20 tâches
   ouvertes » — pendant que les tâches à échéance propre restent à plat ;
3. deux actions au survol, sans passer par l'inspecteur : **Traité** et
   **reporter au…**. Un tas qu'on ne peut que lire ne se vide jamais.

---

## 6. Huit défauts constatés dans le code

Ils sont indépendants des trois manques ci-dessus, et c'est le lot le moins cher
du document.

| # | Symptôme | Où | Pourquoi ça compte |
|---|---|---|---|
| 1 | La bande « j'attends » n'affiche que **5 barres**, et annonce les autres comme « hors fenêtre » alors qu'elles sont dans la fenêtre — elles ont simplement été tronquées | `CalendarShell.tsx:366` et `:480` | La bande qui porte l'idée maîtresse de la vue est plafonnée, et la phrase qui l'explique est fausse |
| 2 | **Ce qui a avancé aujourd'hui n'est affiché nulle part.** Le modèle le calcule bien pour le jour courant | `calendar.ts:293` calcule, `CalendarShell.tsx:398` ne le rend que si `isPast` | On voit ce qu'on a fait lundi, jamais ce qu'on a fait ce matin — le seul jour où ça motive |
| 3 | La **vue Jour d'un jour passé est vide** : `DayView` ignore `cell.fait` | `CalendarShell.tsx:535` | Cliquer sur l'en-tête d'un jour passé, geste explicitement proposé, mène à trois couloirs vides |
| 4 | **Glisser une attente sur le rail ne pose aucun rappel**, en silence | `findTask`, `CalendarShell.tsx:339` : le vivier ignore `model.bars` | C'est le couloir depuis lequel on veut le plus poser un rappel (« relancer le syndic jeudi 10 h ») |
| 5 | Les pastilles sont `draggable` **en vue Semaine, où rien n'accepte le dépôt** | `CalendarShell.tsx:723` | Une affordance qui ne mène à rien apprend à ne plus essayer |
| 6 | La **jauge de charge est normalisée sur la fenêtre** : le jour le plus chargé est toujours à fond, même dans une semaine calme | `calendar.ts:323` | Elle ne peut donc jamais dire « semaine tranquille », ni comparer deux semaines. Normaliser sur une charge de référence (moyenne glissante sur 8 semaines) lui rend son sens |
| 7 | Le **sas ne dit pas le retard** | `CalendarShell.tsx:711` | Voir § 5 |
| 8 | `subscribeEvents` lit **toute la collection d'événements**, sans borne | `firestore.ts:114` | Le raisonnement du commentaire est juste (une demande peut dater de plusieurs mois), la conclusion non : il suffit de filtrer sur `type == "progress_changed"`, ou de dénormaliser `requestedAt` / `receivedAt` et de ne lire les événements que sur la fenêtre affichée |

Les défauts 1 à 5 sont de l'ordre de la quarantaine de lignes au total.

---

## 7. Ce que ça coûte en modèle de données

Toujours rien d'obligatoire — c'est le même engagement que celui de la V1.

| Information | Origine |
|---|---|
| Date de réception d'une pièce | timeline `events` (`progress_changed → Reçu`), déjà journalisée |
| Attentes hors fenêtre (réglette) | `model.bars` calculé sur 90 jours au lieu de 7 |
| Filtre par dossier | état local de la vue, rien de persisté |
| Retard en jours (sas) | soustraction, rien à stocker |
| Charge de référence | moyenne glissante calculée à la volée |

Deux dénormalisations facultatives, à faire ensemble le jour où le volume
d'événements le demandera : **`requestedAt`** (déjà proposée en V1) et
**`receivedAt`**. Elles suppriment la lecture intégrale de la collection
`events`, et rien d'autre du document n'en dépend.

---

## 8. Ce qu'on ne fait toujours pas

- **Pas de grille de mois.** La réglette répond au besoin (voir la durée entière)
  sans reprendre la forme (des cases pour des rendez-vous).
- **Pas de rendez-vous, pas de grille horaire remplie.** Le rail ne porte que les
  rappels, et c'est ce qui le rend honnête.
- **Pas de calendrier sur mobile.** Inchangé : Ma journée reste la bonne réponse.
- **Pas de couleur nouvelle.** La bannette reprend le bleu du statut `Reçu`,
  et l'âge qui traîne l'ambre déjà utilisé pour le sortant.
- **Pas de notification nouvelle.** Une pièce reçue qui dort n'a pas besoin d'un
  push : elle a besoin d'être visible le matin, ce qui est exactement ce que la
  bande « à faire » propose.

---

## 9. Découpage proposé

| Lot | Contenu | Effort | Ce qu'il rapporte |
|---|---|---|---|
| **0 — réparer** | les défauts 1 à 5 du § 6 | quelques dizaines de lignes | La vue tient enfin ses propres promesses |
| **1 — la bannette** | tas « Reçu » sous le sas : tri par marge restante, âge en jours, « Traité » au survol | modéré, aucune donnée nouvelle | Le manque le plus lourd : la vue montre enfin la matière disponible, sans toucher à la grille d'anticipation |
| **2 — le sas** | retard affiché, tri, groupement par dossier, actions au survol | modéré | Le tas se vide depuis la vue, sans passer par les dossiers |
| **3 — la réglette** | bande 90 jours, fenêtre déplaçable | le plus visuel, le plus coûteux en CSS | On voit une DIA en entier |
| **4 — le dossier** | filtre par dossier, clic sur le nom, champ de recherche | faible | Une deuxième vue gratuite : le plan de charge d'un dossier |
| **5 — défaut 6 et 8** | charge de référence, lecture d'événements bornée | faible | Une jauge qui veut dire quelque chose ; la scalabilité |

L'ordre n'est pas celui de l'ambition, c'est celui du rapport valeur/effort. Le
lot 0 se fait en une fois. Le lot 1 est le seul qui change ce que la vue
*raconte* ; les autres améliorent ce qu'elle montre déjà.

**Mise à jour du 21/08/2026 — tout est réalisé.** Les six lots sont en service
sur `/calendrier`, plus les gestes d'écriture arrivés entre-temps : changement
de statut (`1`–`4` et inspecteur), ✓ « Traité » au survol dans le sas et la
bannette, report d'échéance depuis l'inspecteur, ouverture du dossier au
double-clic, création de tâche (`N`, « + Tâche », double-clic sur un jour,
depuis l'inspecteur). Détail d'implémentation notable : le « reporter au… » du
§ 5 vit dans l'inspecteur plutôt qu'au survol — une date se choisit, elle ne se
clique pas ; et la jauge de charge (§ 6, défaut 6) est normalisée contre une
charge de référence fixe plutôt qu'une moyenne glissante, ce qui suffit à lui
faire dire « semaine tranquille ».

---

## 10. Le test

Le critère de la V1 reste le bon :

> Est-ce que cette vue me dit quelque chose que je ne savais pas ce matin ?

La V2 en ajoute un second, qui est celui de la fréquence d'ouverture :

> **Est-ce que je peux vider quelque chose depuis cette vue ?**

Une vue qui informe se consulte le lundi. Une vue depuis laquelle on agit
s'ouvre tous les matins. Les lots 0, 1 et 2 visent ce second critère ; les lots
3 et 4 le premier.

---

*Proposition — août 2026. Elle porte sur la vue en service sur `/calendrier`,
et n'introduit aucun champ obligatoire au modèle de données.*

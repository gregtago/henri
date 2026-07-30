# Henri — Vue Calendrier : « les deux rives »

Proposition de vue Jour + Semaine. Ce document explique le raisonnement ; le code
de la maquette fonctionnelle est dans `src/components/CalendarShell.tsx`,
`src/lib/calendar.ts` et `src/lib/delais.ts`, accessible sur `/calendrier`.

---

## 1. Le problème d'un calendrier classique dans Henri

Avant de dessiner quoi que ce soit, il faut regarder ce qu'Henri sait du temps :

| Objet | Porte-t-il une heure ? |
|---|---|
| `Item.dueDate` | non — une date |
| `Case.legalDueDate` | non — une date |
| `FloatingTask.dueDate` | non — une date |
| `Item.reminderAt` | **oui** — un timestamp |
| Rendez-vous, signatures, RDV clients | **n'existent pas** |

Conclusion : si on colle une grille horaire 8 h → 19 h dans Henri, on obtient une
surface vide à 95 %, dans laquelle le seul objet réellement horodaté est le
rappel. Un Google Calendar mal rempli. Ce serait un ajout de fonctionnalité sans
ajout d'information : tout ce qu'il afficherait, la colonne « Ma journée » et la
bannière d'échéances le disent déjà mieux.

**Une vue calendrier ne mérite d'exister dans Henri que si elle montre quelque
chose que les colonnes ne savent pas montrer.** Ce quelque chose existe, et c'est
la matière première du notaire : **le temps d'attente**.

Un dossier notarial n'est pas une liste de choses à faire, c'est une liste de
choses **qu'on attend d'autrui** : le syndic, la mairie, la banque, le géomètre,
le confrère, le client. Le rythme réel n'est pas « ce que je fais aujourd'hui »,
c'est « ce que j'ai lancé il y a trois semaines et qui n'est toujours pas revenu ».

C'est cette réalité-là que la vue doit rendre visible. D'où la proposition.

---

## 2. Le parti pris : quatre idées

### Idée 1 — Deux rives autour de l'axe du temps

L'axe du temps est horizontal. Il sépare deux flux de sens opposé :

```
       ↓ CE QUI REVIENT      échéances · retours attendus · rappels
  ─────────────────────────  l'axe des jours
       ≈ EN ATTENTE          les pièces en circulation, en barres
  ─────────────────────────
       ↑ CE QUI PART         demandes à envoyer · relances à faire
```

Tous les agendas du monde n'affichent que la rive haute : ce qui tombe. La rive
basse est l'apport propre d'Henri : **ce qu'il faut envoyer aujourd'hui pour que
ça tombe bien plus tard**. Elle n'est stockée nulle part, elle est calculée.

### Idée 2 — Les attentes sont des durées, pas des points

Une tâche au statut « Demandé » n'est pas un événement, c'est un **segment** :
il commence le jour de la demande et finit le jour du retour attendu. La bande
médiane — la « ligne d'eau » — la dessine comme une barre qui traverse les jours.

Une barre qui dépasse sa date de retour ne s'arrête pas : elle continue jusqu'à
aujourd'hui, en hachuré rouge. On voit littéralement l'attente s'étirer.

C'est la chose qu'aucune liste ne peut dire et qu'aucun agenda ne dit :
*« ça fait 34 jours que j'attends l'état daté du syndic Foncia. »*

### Idée 3 — La date de lancement au plus tard (le point de non-retour)

Le calcul central. Pour toute tâche non lancée qui porte une échéance :

```
date de lancement = échéance − délai type de la pièce   (ramenée au jour ouvré précédent)
```

Le délai type vient d'un barème notarial (`src/lib/delais.ts`) déduit du libellé
de la tâche : DIA 60 j, état daté 30 j, urbanisme 30 j, publicité foncière 21 j,
syndic 21 j, banque 15 j, état civil 10 j, diagnostics 7 j… (défaut : 15 j,
surchargeable d'un clic sur la tâche).

Ce calcul produit trois affichages :

- la pastille apparaît sur la rive basse **le jour où il faut envoyer** ;
- elle porte son étiquette de calcul : `−30 j` ;
- si ce jour est déjà passé, la tâche bascule dans le sas « en souffrance »
  **alors même que son échéance est encore dans le futur**. C'est le signal le
  plus précieux de toute la vue : l'échéance n'est pas encore ratée, elle est
  déjà mathématiquement menacée.

### Idée 4 — Le passé et le futur n'affichent pas la même chose

Un même axe, deux natures selon le côté d'aujourd'hui :

- **à droite d'aujourd'hui** : le prévu (ce qui va tomber, ce qu'il faut lancer) ;
- **à gauche d'aujourd'hui** : le réalisé — les tâches dont le statut a
  effectivement avancé ce jour-là, lues dans la timeline d'événements
  qu'Henri journalise déjà ; et en rive basse, le nombre d'éléments qui avaient
  été mis dans Ma journée ce jour-là.

Le passé de la semaine devient donc une lecture **prévu / fait** : « lundi
j'avais prévu 9 choses, 3 ont bougé ». Aucun calendrier ne fait ça, parce
qu'aucun calendrier ne sait ce que vous aviez prévu.

### Corollaire — le sas « En souffrance »

Colonne fixe à gauche, hors du flux. Elle rassemble tout ce qui a franchi une
date sans être traité : échéances dépassées, lancements dépassés, retours
dépassés.

Raison : **dans un calendrier, le retard n'a pas de jour.** Le repeindre en rouge
sur une case du passé, c'est le ranger là où plus personne ne regarde. Le retard
n'est pas une date, c'est un tas — et un tas se met devant la porte.

---

## 3. Vue Semaine

```
┌──────────────┬────┬────────┬────────┬────────┬────────┬────────┬─────┬─────┐
│ EN SOUFFRANCE│    │ LUN 27 │ MAR 28 │ MER 29 │ JEU 30 │ VEN 31 │ SAM │ DIM │
│              │    │        │        │  ▬▬▬   │        │        │     │     │ ← jauge de charge
├──────────────┤ ↓  ├────────┴────────┴────────┴────────┴────────┴─────┴─────┤
│ ▌État daté   │ c  │                                                        │
│  VENTE MARTIN│ e  │   ● Note d'urbanisme      ● Offre de prêt              │
│  attendu 04/07 │ q  │     VENTE DUPONT           SUCCESSION LEROY          │
│              │ u  │                                                        │
│ ▌DIA          │ i  │                                                        │
│  −60 j dépassé│ r  │                                                        │
│              │ e  │                                                        │
│              │ v  │                                                        │
├──────────────┼────┼────────────────────────────────────────────────────────┤
│              │ ≈  │ ▸ État hypothécaire · VENTE DUPONT · attendu 12/08 ─────┼──▸
│              │ at │ ▨▨▨ État daté · VENTE MARTIN · en retard depuis le 04/07│
├──────────────┼────┼────────────────────────────────────────────────────────┤
│              │ ↑  │            ● Demander DIA −60 j                        │
│              │ p  │              VENTE DUPONT                              │
│              │ art│                                                        │
└──────────────┴────┴────────────────────────────────────────────────────────┘
```

- Colonnes lundi → vendredi en `1fr`, samedi/dimanche réduits à 68 px : le
  notaire n'y travaille pas, mais **les délais y courent**, donc les barres
  d'attente doivent les traverser.
- Jauge de charge de 2 px sous chaque en-tête de jour : intensité proportionnelle
  au poids du jour (le sortant compte 1,5 × l'entrant — envoyer coûte, recevoir
  non). On voit le mur arriver trois jours à l'avance.
- Aujourd'hui : liseré `--accent` sur toute la hauteur de la colonne.
- Survol d'une pastille : **toutes les autres s'estompent à 30 %** et la barre
  d'attente correspondante s'allume. On voit d'un coup la trace complète d'une
  pièce dans le temps — lancée là, attendue là, échéance là.
- Clic sur un en-tête de jour → vue Jour de ce jour.

---

## 4. Vue Jour

```
┌────────────┬─────────────────┬─────────────────┬─────────────────┐
│  RAPPELS   │  ↑ À LANCER   3 │  ≈ EN ATTENTE 7 │  ↓ ATTENDU    2 │
│ 08         │ Envoyer aujourd'│ en circulation  │ doit atterrir   │
│ 09  ▪ Appel│ ─────────────── │ ─────────────── │ ─────────────── │
│ 10         │ ▌Demander DIA   │ ▌État daté      │ ▌Note urbanisme │
│ 11         │  VENTE DUPONT   │  VENTE MARTIN   │  VENTE DUPONT   │
│ 12         │  −60 j          │  retard 26 j    │                 │
│ 14  ▪ Relan│ ▌Relancer syndic│ ▌État hypoth.   │                 │
│ 15         │  VENTE MARTIN   │  attendu 12/08  │                 │
│ …          │                 │                 │                 │
├────────────┴─────────────────┴─────────────────┴─────────────────┤
│ CE QUE LA JOURNÉE ENGAGE   Demander DIA → retour sous 60 j · échéance 30/09 │
└──────────────────────────────────────────────────────────────────┘
```

**Le rail horaire ne contient que les rappels.** C'est le seul objet réellement
horodaté d'Henri, et c'est aussi ce qui rend le rail honnête : il n'invente pas
des heures qui n'existent pas.

**Et il devient un outil d'écriture** : on glisse une tâche depuis un couloir sur
une heure du rail → `reminderAt` est posé, le rappel part (les Cloud Functions
existantes s'en chargent). Programmer un rappel devient un geste de deux
secondes, alors qu'il faut aujourd'hui ouvrir le détail et passer par le
`ReminderPicker`.

**Trois couloirs, pas des heures** : à lancer / en attente / attendu. C'est la
seule découpe de journée qui a du sens quand on n'a pas de rendez-vous — elle
répond à « qu'est-ce que je fais maintenant ? » et non à « où suis-je dans
l'heure ? ».

**Le bandeau « ce que la journée engage »** ferme la boucle : chaque envoi
d'aujourd'hui annonce sa date de retour. La journée n'est pas seulement une
consommation de tâches, c'est un **investissement de temps** dont on voit
l'échéance.

---

## 5. L'inspecteur : « sa trace dans le temps »

Panneau droit, 300 px, dans l'esprit du panneau détail existant. Il ne redit pas
la fiche de la tâche — il montre les quatre dates qui structurent la vie d'une
pièce, sous forme de fil vertical, points pleins pour les étapes franchies :

```
 ● À lancer avant      31/08/2026
 ● Demandé le          02/07/2026
 ○ Retour attendu      23/07/2026
 ○ Échéance            30/09/2026
```

Plus le délai retenu, **modifiable** (`21 jours — Syndic de copropriété`), et les
quatre statuts en boutons. Passer une tâche en « Demandé » depuis le calendrier
crée l'événement qui **démarre la barre d'attente** : la vue se nourrit de ses
propres actions.

Henri explique toujours son calcul, en une phrase, au survol comme dans
l'inspecteur : `Échéance 30/09 − 60 j (DIA / préemption) → à envoyer le 31/08`.
Une déduction automatique qu'on ne peut pas auditer est une déduction qu'on ne
suivra pas.

---

## 6. Ce que ça coûte en modèle de données

**Rien d'obligatoire.** C'est volontaire : la proposition tient sur l'existant.

| Information | Origine |
|---|---|
| Échéance | `Item.dueDate`, sinon `Case.legalDueDate` |
| Date de demande | timeline `events` (`progress_changed` → `Demandé`), déjà journalisée ; repli sur `updatedAt` |
| Retour attendu | calculé : demande + barème |
| Date de lancement | calculée : échéance − barème |
| Réalisé du passé | timeline `events` |
| Prévu du passé | `myDaySelections.dateKey` |
| Rappels | `Item.reminderAt` |

Un seul champ ajouté : **`Item.delaiDays`** — le délai retenu pour cette pièce.
Nul par défaut (Henri estime d'après le libellé), renseigné dès que le notaire
corrige le chiffre. Voir § 6 bis.

Évolutions possibles, par ordre de rentabilité :

1. `requestedAt` dénormalisé sur l'`Item` — évite de charger toute la collection
   `events` (le seul point de scalabilité à surveiller : au-delà de quelques
   milliers d'événements, il faudra une requête fenêtrée).
2. Barème éditable dans les Préférences — aujourd'hui il est en dur dans
   `src/lib/delais.ts`. À faire quand les corrections manuelles se répètent sur
   les mêmes natures de pièces : c'est le signal que le barème a tort.
3. Une collection `appointments` (RDV de signature) — c'est le seul vrai objet
   horaire du métier. Il donnerait au rail sa deuxième couche. **À ne faire que
   si on assume qu'Henri devienne aussi un agenda**, ce qui est une autre
   décision produit que celle-ci.

---

## 6 bis. Où se règle le délai

Le délai n'appartient pas au calendrier : c'est une propriété de la pièce. Il se
lit et se corrige **dans le panneau détail de la tâche**, juste sous l'échéance —
c'est-à-dire au moment même où on nomme la tâche, puisque créer une tâche dans
Henri, c'est la créer puis la nommer dans ce panneau.

Trois principes :

- **Affiché, jamais demandé.** Le champ est toujours visible et toujours
  pré-rempli. Créer une tâche reste un titre + Entrée ; on ne rajoute pas une
  question à la création.
- **Provenance annoncée.** Le champ dit d'où sort le chiffre : *estimé — syndic
  de copropriété*, *estimation par défaut*, ou *fixé à la main*. Avec un
  « Réinitialiser » pour revenir à l'estimation d'Henri.
- **Conséquence affichée sous le champ.** « Pour tenir l'échéance du 30/09/2026,
  la demande doit partir le 31/07/2026. » Un nombre de jours seul est abstrait ;
  la date qu'il produit ne l'est pas. C'est cette ligne qui donne envie de
  corriger le chiffre quand il est faux.

Le même réglage est accessible depuis l'inspecteur du calendrier, sur la pièce
sélectionnée : c'est la même donnée, écrite au même endroit.

---

## 7. Clavier

Cohérent avec l'existant (DESIGN.md, « clavier first ») :

| Touche | Effet |
|---|---|
| `S` / `J` | vue Semaine / vue Jour |
| `←` / `→` | période précédente / suivante |
| `T` | revenir à aujourd'hui |
| `Échap` | fermer l'inspecteur |

Désactivé dès que le focus est dans un champ éditable.

---

## 8. Ce qu'on ne fait pas

- **Pas de grille horaire remplie de faux événements.** Le rail reste étroit et
  ne porte que les rappels.
- **Pas de vue Mois.** Une vue mois est une vue de rendez-vous ; sur des délais,
  elle ne dirait rien que la semaine ne dise mieux. À reconsidérer seulement si
  les `appointments` arrivent.
- **Pas de modale**, pas d'icône SVG décorative, pas de nouvelle couleur : les
  teintes reprennent les statuts existants (ambre = demandé/sortant, bleu =
  reçu/sélection, vert = traité, rouge = retard).
- **Pas de calendrier sur mobile.** Cette vue est dense et bi-directionnelle :
  elle est faite pour un écran de bureau. Sur mobile, Ma journée reste la bonne
  réponse (DESIGN.md : « mobile = compagnon »).

---

## 9. Découpage proposé

| Lot | Contenu | État |
|---|---|---|
| **V1 — lire** | semaine deux rives + ligne d'eau + sas + vue jour + inspecteur + barème + clavier | **fait, sur `/calendrier`** |
| **V2 — écrire** | glisser sur le rail = poser un rappel ; changer le statut depuis la vue ; ajouter à Ma journée | **fait** |
| **V3 — persister** | `delaiDays` sur l'`Item`, réglable dans le panneau détail et dans l'inspecteur | **fait** |
| **V3 bis** | barème éditable dans les Préférences ; `requestedAt` dénormalisé | à faire |
| **V4 — projeter** | glisser une pastille d'un jour à l'autre = décaler l'échéance et recalculer le lancement ; simulation « si je signe le 30/09, que dois-je lancer ? » | à faire |

---

## 10. Le test de la proposition

La question à se poser devant l'écran n'est pas « est-ce joli ? » mais :

> **Est-ce que cette vue me dit quelque chose que je ne savais pas ce matin ?**

Si le sas affiche une DIA dont le point de non-retour est passé alors que sa
signature est dans six semaines, la réponse est oui, et la vue a payé son
existence. Si elle ne fait que redire les échéances de la bannière jaune, il faut
la supprimer.

C'est le critère que je propose pour arbitrer après un essai en conditions
réelles.

---

*Proposition — juillet 2026. Maquette fonctionnelle branchée sur les données
réelles, à ouvrir sur `/calendrier`.*

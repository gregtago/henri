# Henri — Vue Calendrier, troisième proposition : la vue qui raisonne

Suite de `CALENDRIER.md` (le parti pris) et `CALENDRIER-V2.md` (la bannette, la
réglette, le filtre par dossier — tout est en service). Ce document part d'un
constat simple : **la vue sait désormais tout montrer. La marche suivante n'est
pas de montrer plus, c'est de conclure.**

*Arbitrages du 21/08/2026 : les § 1 (le geste), 2 (la date tenable) et 4
(l'échéancier) sont réalisés — branche `claude/calendar-v3`. Le § 3 (barème
observé) est **abandonné** : le délai de traitement est une décision de
l'utilisateur, pas une statistique — Henri ne propose pas de chiffre déduit de
l'historique, il applique celui que le notaire a fixé (ou le barème par
défaut, corrigeable d'un clic). Le § 5 (jalons) reste différé, en attente de
son signal d'usage.*

Aujourd'hui le calendrier expose des faits — cette demande doit partir jeudi,
cette attente dure depuis 34 jours, cette pièce dort dans la bannette. La
conclusion, c'est encore le notaire qui la tire : *« donc ma signature du 30
septembre ne tient plus. »* Or cette conclusion est un calcul, et Henri a déjà
tous les nombres. Quatre propositions, par ordre de rapport valeur/effort, plus
une porte ouverte.

---

## 1. Boucler le geste — chaque pastille connaît son prochain coup

Le sas et la bannette ont gagné le ✓ « Traité » au survol. Mais dans les bandes,
le geste du matin reste en deux temps : cliquer la pastille, puis le statut dans
l'inspecteur. Or **chaque motif d'entrée n'a qu'un seul coup naturel** :

| La pastille dit | Le geste qui la fait avancer | Écriture |
|---|---|---|
| `lancement` — « demande à envoyer » | **→ Demandé** — je l'ai envoyée | statut, démarre la barre d'attente |
| `relance` — « pas de réponse » | **↻ Relancé** — je viens de relancer | repose le point de départ de l'attente |
| `retour` / `echeance` — « ça doit tomber » | **✓ Reçu** — c'est arrivé | statut, la pièce descend en bannette |

Un seul bouton au survol, jamais deux : celui du motif. La bande « à faire »
devient cochable comme une liste, sans rien ouvrir — et chaque geste nourrit la
vue (la barre d'attente démarre, la bannette se remplit) : le calendrier
s'alimente de sa propre lecture, comme promis en V1 § 5.

Le cas « Relancé » mérite sa règle : relancer ne change pas le statut (la pièce
est toujours demandée), ça repose l'attente. Écriture proposée : `requestedAt`
n'étant pas stocké, on journalise un `progress_changed` Demandé → Demandé — le
`buildStatusDateIndex` existant le lit déjà (il garde le plus récent), la barre
repart d'aujourd'hui, et la relance suivante se recalcule. Zéro champ nouveau,
et l'historique des relances est journalisé par construction.

À compléter par le geste symétrique de la souris : **glisser une pastille
d'échéance d'un jour à l'autre dans la grille = reporter l'échéance** — le
pendant visuel du champ « reporter au » posé dans l'inspecteur en V2. Les
cellules savent déjà recevoir un dépôt (le rail le fait) ; c'était le lot V4
« projeter » de la V1, réduit à sa moitié utile.

**Coût :** faible. Aucune donnée nouvelle.

---

## 2. La date tenable — le calcul que le client attend

La question que le notaire se pose devant un dossier n'est ni « qu'est-ce que
j'attends ? » ni « qu'est-ce qui est en retard ? ». C'est : **« on signe quand ? »**

Henri sait répondre. Pour chaque tâche ouverte d'un dossier :

```
prête au plus tôt =
  Créé      → aujourd'hui + délai        (si je lance aujourd'hui)
  Demandé   → max(aujourd'hui, demande + délai)
  Reçu      → aujourd'hui               (la matière est là)
```

**La date tenable du dossier est le max de ces dates** (ramené au jour ouvré),
et la pièce qui le porte est son **chemin critique**.

Quand le filtre par dossier est posé — c'est-à-dire quand on regarde *un*
dossier — un bandeau au-dessus de la grille conclut :

```
▸ Signature tenable au plus tôt le mar. 21 octobre — chemin critique : DIA (60 j, pas encore lancée).
  Échéance posée : 30 septembre → intenable de 15 jours ouvrés.
```

Trois états, trois tons : la date posée **tient** (marge affichée en vert),
elle **tient si on lance aujourd'hui** (ambre — c'est le vrai signal d'alarme,
celui qui arrive à temps), elle **ne tient plus** (rouge, avec le nom du
coupable et le report minimal). Cliquer le bandeau sélectionne la pièce
critique. Sur la réglette, la date tenable se dessine en losange — on *voit*
l'écart entre la date rêvée et la date réelle.

Et le bandeau ferme la boucle avec le § 1 : chaque « → Demandé » cliqué fait
reculer la date tenable sous les yeux. Lancer ses demandes du matin devient un
geste qui **améliore une date**, pas une corvée qui vide une liste.

C'est la moitié restante du lot V4 de la V1 (« si je signe le 30/09, que
dois-je faire, et quand ? ») — sans mode simulation séparé : le dossier filtré
*est* la simulation, et le report d'échéance existe déjà pour tester une autre
date.

**Coût :** modéré. Un `max()` sur des dates déjà calculées, un bandeau, un
losange sur la réglette. Aucune donnée nouvelle.

---

## 3. Le barème qui apprend — les délais observés

Le barème de `delais.ts` est un pari écrit en dur : syndic 21 j, mairie 30 j.
Mais depuis la V1, **Henri journalise la réalité** : chaque passage Demandé →
Reçu est dans la timeline, daté. L'étude possède donc, sans le savoir, la
mesure de ses propres délais — *ce* syndic répond en 12 jours, *cette* mairie
en 45.

Proposition : à côté du délai retenu, l'inspecteur affiche le délai vécu.

```
Délai de retour   [ 21 ] jours   Syndic de copropriété
                  observé : 34 j en médiane (sur 6 demandes) — appliquer
```

- la médiane, pas la moyenne : une seule réponse aberrante ne doit pas
  déformer le chiffre ;
- affichée seulement à partir de 3 observations — avant, c'est du bruit ;
- « appliquer » écrit `delaiDays` sur la tâche, le champ existant. Le barème
  n'est pas modifié en silence : Henri **propose**, le notaire dispose ;
- le calcul est expliqué au survol, comme tout calcul d'Henri : « 6 demandes
  “syndic” journalisées, retours en 12–61 j, médiane 34 j ».

Le regroupement se fait par clé de barème (`inferDelai` sur le libellé de la
tâche), donc tout est calculable côté client à partir des événements déjà
chargés. C'est l'inversion qui distingue Henri de tout agenda : **les autres
outils affichent le temps, Henri finit par le connaître.** Et c'est le signal
qui décidera du « barème éditable dans les Préférences » (V3 bis) : quand
l'observé contredit systématiquement l'écrit, on saura quoi écrire.

**Coût :** modéré. Aucune donnée nouvelle — la timeline suffit.

---

## 4. L'échéancier du client — la vue qui sort de l'étude

Le dossier filtré montre exactement ce que le client demande au téléphone :
qu'est-ce qui est parti, qu'est-ce qu'on attend, on signe quand. Aujourd'hui ce
récit se reformule de vive voix ou dans un courrier tapé à la main.

Proposition : un bouton **« Échéancier »**, visible seulement quand le filtre
par dossier est posé. Il produit une page imprimable (`@media print` — pas de
service nouveau, pas d'export serveur) :

```
VENTE DUPONT / MARTIN                    Échéancier au 21 août 2026
────────────────────────────────────────────────────────────────────
  fait      Diagnostics                      reçus le 12 août
  en cours  État daté (syndic)               demandé le 2 août — attendu vers le 23 août
  en cours  Note d'urbanisme (mairie)        demandée le 8 août — attendue vers le 7 sept.
  à venir   DIA / préemption (mairie)        à déposer — réponse sous 60 jours
────────────────────────────────────────────────────────────────────
  ▸ Signature envisageable à partir du 21 octobre 2026
```

Règles d'écriture, parce que ce document change de lecteur :

- les dates calculées deviennent des « **vers le** » — un délai estimé ne se
  promet pas à un client ;
- la date tenable du § 2 devient « envisageable à partir du » — même calcul,
  formulation prudente ;
- ni les retards internes, ni la bannette, ni les rappels : le client n'a pas
  à voir la cuisine, seulement le circuit de son dossier ;
- l'en-tête reprend le papier de l'office.

C'est la première fois qu'un écran d'Henri produit quelque chose qui sort de
l'étude — et c'est le calendrier qui le produit, parce que c'est lui qui sait.

**Coût :** modéré — une mise en page et une feuille de style d'impression.

---

## 5. La porte ouverte — les jalons d'une vente

Une vente n'a pas une date, elle en a quatre : compromis, fin du délai de
rétractation (compromis + 10 jours), condition suspensive de prêt (compromis +
45 à 60 jours), signature. Aujourd'hui `Case.legalDueDate` n'en stocke qu'une,
et les trois autres vivent dans la tête du rédacteur.

L'idée : poser la date du compromis, et Henri **propose** les trois autres —
modifiables, posées en losanges sur la réglette, chacune tirant ses propres
dates de lancement. C'est la généralisation naturelle du § 2 : la date tenable
comparée non plus à une échéance, mais à chaque jalon.

Elle est rangée ici, en dernière position, pour une raison de méthode : c'est
la **première proposition depuis la V1 qui exige un champ nouveau**
(`Case.milestones`), et l'engagement « tout tient sur l'existant » a jusqu'ici
tout payé. Elle ne se prend que si les § 1–4 confirment l'usage — même statut
que les `appointments` de la V1 : une décision produit, pas un lot de plus.

---

## 6. Ce qu'on ne propose pas

- **Pas de « score de santé » du dossier.** Un pourcentage est une conclusion
  qu'on ne peut pas auditer ; la date tenable est une conclusion qu'on peut
  vérifier à la main. Henri explique ses calculs ou ne les fait pas.
- **Pas d'IA de prédiction.** La médiane observée du § 3 est le bon niveau :
  un chiffre honnête, traçable, contestable d'un clic.
- **Pas d'envoi d'e-mails de relance depuis la vue.** Relancer un syndic est un
  acte qui engage l'étude ; Henri prépare la journée, il ne parle pas à la
  place du notaire.
- **Pas de notification de plus.** La date tenable qui recule mérite d'être
  *visible le matin*, pas de vibrer dans une poche. La bannière rouge suffit.

---

## 7. Découpage proposé

| Lot | Contenu | Coût | Ce que ça change |
|---|---|---|---|
| **A — le geste** | action au survol selon le motif (→ Demandé, ↻ Relancé, ✓ Reçu) ; glisser une échéance d'un jour à l'autre | faible | la bande du matin se coche sans ouvrir un seul panneau |
| **B — la date tenable** | bandeau du dossier filtré, chemin critique, losange sur la réglette | modéré | la vue répond à « on signe quand ? » — la question du métier |
| ~~C — le barème observé~~ | abandonné : le délai est une décision de l'utilisateur, pas une statistique | — | — |
| **D — l'échéancier client** | page imprimable du dossier filtré, dates prudentes | modéré | le calendrier produit un document qui sort de l'étude |
| **E — les jalons** | dates types d'une vente sur la réglette | **champ nouveau** | à décider seulement si A–D confirment l'usage |

A et B forment la paire à faire d'abord : A rend chaque geste immédiat, B donne
au geste sa conséquence visible. D est celui qui se montre à un client. A, B et
D sont réalisés ; E attend sa décision produit.

---

## 8. Le test, troisième version

- V1 : *est-ce que la vue me dit quelque chose que je ne savais pas ce matin ?*
- V2 : *est-ce que je peux vider quelque chose depuis cette vue ?*
- V3 : **est-ce que la vue m'a évité un appel ?** — celui du client qui demande
  où en est son dossier, celui qu'on passe au syndic trop tard, celui du
  confrère qui demande si la date tient.

Un calendrier qui fait gagner des appels téléphoniques est un calendrier dont
on ne se passe plus.

---

*Proposition — août 2026. Les § 1 à 4 tiennent sur le modèle de données
existant ; seul le § 5 y ajouterait un champ, et il attend son signal d'usage.*

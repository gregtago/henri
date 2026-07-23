# Modèles d'import JSON

Deux exemples au format attendu par l'import de Henri.

## `modele-dossier.json` — importer un **nouveau dossier**
Contient `case` (le dossier) **et** `items` (les tâches).
À utiliser avec le bouton **« Importer »** en bas de la colonne des dossiers :
cela crée un nouveau dossier avec toute sa structure de tâches.

## `modele-dossier-vente-2espaces.json` — dossier de vente en **deux espaces**
Variante de `modele-dossier.json` organisée en deux branches de premier niveau :
**Espace partagé** (visible client / confrère) et **Espace privé** (interne office).
Elle reprend la logique de l'arborescence OneDrive décrite dans
[`structure-dossier-vente/`](./structure-dossier-vente/) (avec les scripts qui
créent les dossiers correspondants sur le disque).

## `modele-taches.json` — importer des **tâches dans un dossier existant**
Contient uniquement `items` (pas de `case`).
À utiliser avec le bouton **« Importer des tâches »** dans la barre d'actions
du détail d'un dossier : les tâches sont ajoutées au dossier déjà ouvert.

## Format des champs

`case` :
- `title` *(requis)* — nom du dossier
- `type` — ex. « Vente », « Succession »…
- `legalDueDate` — date butoir (ISO, ou `null`)
- `caseNote` — note libre (ou `null`)

`items` (chaque tâche) :
- `title` *(requis)* — intitulé
- `level` *(requis)* — `2` pour une tâche, `3` pour une sous-tâche
- `parentItemId` — pour une sous-tâche (`level: 3`), l'`id` de la tâche parente ;
  `null` pour une tâche de premier niveau
- `status` — `"Créé"`, `"Demandé"`, `"Reçu"` ou `"Traité"`.
  **À l'import, toutes les tâches repartent du statut « Créé »** : ce champ
  n'est donc pas pris en compte ici (il sert surtout pour les exports, qui
  sont une photo fidèle de l'état des tâches).
- `starred` — `true` pour marquer la tâche comme importante (optionnel)
- `dueDate` — échéance (ISO, ou `null`)

## Bon à savoir
- **Les tâches importées repartent toujours du statut « Créé »**, que ce soit
  via « Importer » ou « Importer des tâches ».
- Les `id` du fichier ne servent qu'à relier les sous-tâches à leur parent :
  ils sont régénérés à l'import, donc aucun risque de collision avec l'existant.
- Le `caseId` des tâches est ignoré lors d'un import « Importer des tâches » :
  les tâches sont automatiquement rattachées au dossier ouvert.
- Profondeur maximale : 3 niveaux (dossier → tâche → sous-tâche).
- Inversement, l'**export de tâches sélectionnées** (mode « Sélection » de la
  colonne Tâches → « Exporter ») produit un fichier `{ items }` directement
  réimportable via « Importer des tâches ».

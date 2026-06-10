# Modèles d'import JSON

Deux exemples au format attendu par l'import de Henri.

## `modele-dossier.json` — importer un **nouveau dossier**
Contient `case` (le dossier) **et** `items` (les tâches).
À utiliser avec le bouton **« Importer »** en bas de la colonne des dossiers :
cela crée un nouveau dossier avec toute sa structure de tâches.

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
- `status` *(requis)* — `"Créé"`, `"Demandé"`, `"Reçu"` ou `"Traité"`
- `starred` — `true` pour marquer la tâche comme importante (optionnel)
- `dueDate` — échéance (ISO, ou `null`)

## Bon à savoir
- Les `id` du fichier ne servent qu'à relier les sous-tâches à leur parent :
  ils sont régénérés à l'import, donc aucun risque de collision avec l'existant.
- Le `caseId` des tâches est ignoré lors d'un import « Importer des tâches » :
  les tâches sont automatiquement rattachées au dossier ouvert.
- Profondeur maximale : 3 niveaux (dossier → tâche → sous-tâche).

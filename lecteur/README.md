# Lecteur PDF — OCR sélectif

Une visionneuse PDF pensée pour le notariat : on ouvre plusieurs documents, on
**surligne une zone à la souris**, et le logiciel en extrait le texte.

Le principe de fond : garder l'humain dans la boucle. On lit soi-même le
document ; on ne demande à la machine d'extraire **que** ce qu'on désigne. Aucune
IA ne parcourt seule des centaines de pages.

## Ce qui la distingue

- **Extraction intelligente selon le document.** Si la zone surlignée contient
  une couche texte (acte natif, PDF généré), le texte est lu directement —
  instantané et parfait, sans OCR. Ce n'est que sur une image scannée (pas de
  texte sélectionnable) que l'OCR **Tesseract** prend le relais.
- **100 % sur le poste.** Le rendu (pdf.js) comme la reconnaissance de texte
  (tesseract.js en WebAssembly, modèles français + anglais) tournent
  entièrement dans le navigateur. **Aucun document n'est envoyé sur Internet** —
  indispensable pour le secret professionnel. Fonctionne hors-ligne.
- **Plusieurs PDF en onglets**, zoom, ordre de lecture reconstitué, copie
  d'une extraction ou de toutes.

Inspiration : [NormCap](https://github.com/dynobo/normcap), transposé du geste
« capture d'écran » vers « zone d'un PDF ».

## Stack

Vite + React + TypeScript · [pdf.js](https://mozilla.github.io/pdf.js/) ·
[tesseract.js](https://tesseract.projectnaptha.com/)

## Développer

```bash
npm install        # installe + vendorise les assets OCR (mode hors-ligne)
npm run dev        # serveur de dev
npm run build      # build de production (typecheck + bundle)
npm run preview    # sert le build
```

### Données OCR hors-ligne

Le `postinstall` (`scripts/vendor-tesseract.mjs`) copie le cœur WASM de
Tesseract et récupère les données de langue (`fra`, `eng`) depuis le registre
npm vers `public/tesseract` et `public/tessdata`. Ces fichiers sont volumineux
et donc hors du dépôt (`.gitignore`). Si le vendoring échoue (réseau
indisponible), l'app retombe automatiquement sur le CDN de Tesseract au runtime ;
relancer `node scripts/vendor-tesseract.mjs` complète l'installation.

## Utilisation

1. **Ouvrir des PDF** (bouton en haut à droite, sélection multiple possible).
2. Surligner une zone à la souris sur une page.
3. Le texte apparaît dans le panneau de droite, avec la méthode utilisée
   (`texte natif` ou `OCR` + taux de confiance). Copier au besoin.

## Statut

Prototype fonctionnel (Alpha). Vérifié de bout en bout : extraction de texte
natif et OCR sur document scanné. Standalone — sans lien avec le reste de henri
pour l'instant ; extractible en dépôt distinct via `git subtree split` le moment
venu.

## Pistes suivantes

- Renvoyer une extraction vers un dossier/tâche henri.
- Rogner l'image OCR plus finement (re-rendu haute résolution de la seule zone).
- Historique/export des extractions (CSV, presse-papier structuré).
- Empaquetage en application de bureau (Tauri) pour un vrai lecteur natif.

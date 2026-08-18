# Icône d'application Henri

Source du visuel d'app (fond noir dégradé, lettrage « henri » blanc), export
Icon Composer.

## Contenu

| Chemin | Usage |
| --- | --- |
| `Henri.icon/` | Source Icon Composer (calques : lettrage + fond). À rouvrir pour toute retouche. |
| `AppIcon.appiconset/` | Jeu d'icônes iOS / macOS / watchOS (dont variantes `dark` et `tinted`), prêt à glisser dans un projet Xcode. |
| `preview-1024.png` | Rendu composé 1024×1024, référence visuelle. |

## Déclinaisons web installées dans `public/`

Générées depuis `AppIcon.appiconset/icon-1024.png` :

- `favicon.ico` (16/32/48), `favicon-16x16.png`, `favicon-32x32.png`,
  `favicon-96x96.png`, `favicon.svg`
- `apple-touch-icon.png` (180×180) — écran d'accueil iOS
- `web-app-manifest-192x192.png` / `-512x512.png` — PWA, `purpose: any`
- `web-app-manifest-maskable-192x192.png` / `-512x512.png` — PWA,
  `purpose: maskable` : lettrage réduit à 62 % de la largeur pour rester dans
  la zone sûre des masques Android (le plein cadre serait rogné sur le « h »
  et le « i »).

Après toute mise à jour de ces fichiers, incrémenter `CACHE_VERSION` dans
`public/sw.js` pour purger l'ancien cache des appareils déjà installés.

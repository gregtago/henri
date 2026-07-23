# Structure type d'un dossier de vente

Arborescence standard à recopier dans **chaque nouveau dossier de vente**, sous
`…\OneDrive - EI GREGOIRE TAGOT\Dossiers\`.

Le dossier est coupé en deux au premier niveau :

- **`01 - ESPACE PARTAGÉ`** — tout ce qui peut être vu / échangé avec l'extérieur :
  les clients (vendeur, acquéreur), le confrère, l'agence, la banque. C'est cet
  espace, et lui seul, que l'on partage (lien OneDrive, coffre-fort, remise de
  copies).
- **`02 - ESPACE PRIVÉ`** — le travail interne de l'office : notes, brouillons,
  réquisitions, fiscalité, comptabilité, correspondance interne. **Ne se partage
  jamais.**

> Règle simple : avant de déposer un fichier, se demander « est-ce que le client
> peut le voir ? ». Oui → Espace partagé. Non → Espace privé.

---

## Arborescence

```
[ANNÉE] - [VENDEUR] à [ACQUÉREUR] - Vente
│
├── 01 - ESPACE PARTAGÉ
│   ├── 01 - Pièces des parties
│   │   ├── Vendeur
│   │   └── Acquéreur
│   ├── 02 - Titre de propriété et origine
│   ├── 03 - Diagnostics techniques (DDT)
│   ├── 04 - Urbanisme
│   ├── 05 - Copropriété
│   ├── 06 - Avant-contrat (compromis)
│   ├── 07 - Financement acquéreur
│   ├── 08 - Acte de vente
│   └── 09 - Correspondance avec les clients
│
└── 02 - ESPACE PRIVÉ
    ├── 01 - Suivi et notes internes
    ├── 02 - Réquisitions et demandes
    │   ├── État civil
    │   ├── Cadastre et géomètre
    │   ├── Publicité foncière (hypothèques)
    │   ├── Syndic
    │   └── Mairie et DIA (préemption)
    ├── 03 - Fiscalité et calculs
    ├── 04 - Comptabilité
    ├── 05 - Correspondance interne
    ├── 06 - Formalités postérieures
    └── 07 - Brouillons de travail
```

---

## Ce qui va dans chaque sous-dossier

### 01 - ESPACE PARTAGÉ

| Dossier | Contenu type |
|---|---|
| **01 - Pièces des parties** | Pièces d'identité, livret de famille, contrat de mariage / PACS, jugement de divorce, extraits d'actes d'état civil, justificatifs de domicile, RIB. Un sous-dossier *Vendeur*, un sous-dossier *Acquéreur*. |
| **02 - Titre de propriété et origine** | Titre de propriété actuel, attestations, actes antérieurs (origine trentenaire), servitudes. |
| **03 - Diagnostics techniques (DDT)** | DPE, amiante, plomb (CREP), électricité, gaz, ERP (état des risques), termites, mesurage Carrez, assainissement. |
| **04 - Urbanisme** | Certificat d'urbanisme, note de renseignements, plan local d'urbanisme, alignement, autorisations de travaux. |
| **05 - Copropriété** | Règlement de copropriété + modificatifs, EDD, PV d'assemblées générales, pré-état daté / état daté, carnet d'entretien, diagnostic technique global. |
| **06 - Avant-contrat (compromis)** | Projet de compromis, compromis signé, annexes, justificatifs de purge des conditions suspensives. |
| **07 - Financement acquéreur** | Simulation, offre de prêt, accord de principe, attestation de fonds propres, mainlevée éventuelle. |
| **08 - Acte de vente** | Projet d'acte, acte signé, attestation de propriété, copies authentiques et copies exécutoires remises. |
| **09 - Correspondance avec les clients** | Courriels et courriers échangés avec le vendeur et l'acquéreur, convocations à signature. |

### 02 - ESPACE PRIVÉ

| Dossier | Contenu type |
|---|---|
| **01 - Suivi et notes internes** | Fiche d'ouverture, check-list, notes de dossier, points de vigilance. |
| **02 - Réquisitions et demandes** | Demandes envoyées et réponses reçues, classées par destinataire : *État civil*, *Cadastre et géomètre*, *Publicité foncière (hypothèques)*, *Syndic*, *Mairie et DIA (préemption)*. |
| **03 - Fiscalité et calculs** | Calcul des frais / provision, plus-value immobilière, TVA le cas échéant, simulations. |
| **04 - Comptabilité** | Décompte, relevés, provisions reçues, justificatifs de virement, décompte définitif au vendeur. |
| **05 - Correspondance interne** | Échanges avec le confrère, l'agence, les administrations, notes internes non destinées aux clients. |
| **06 - Formalités postérieures** | Publication au SPF, attestations, répertoire, formalités fiscales, envoi des copies. |
| **07 - Brouillons de travail** | Versions intermédiaires, documents de travail non finalisés. |

---

## Création automatique

Deux scripts créent l'arborescence complète (dossiers vides) en une fois :

- **`Creer-dossier-vente.ps1`** (PowerShell — recommandé)
- **`creer-dossier-vente.bat`** (double-clic, sans PowerShell)

Voir les commentaires en tête de chaque fichier pour l'usage.

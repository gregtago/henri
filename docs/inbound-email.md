# Mémo par email (réception)

Permet de créer un **mémo** (FloatingTask) en envoyant un email à une adresse
unique par utilisateur. L'**objet** de l'email devient le titre du mémo, le
**corps** sa note. Le mémo atterrit dans « Ma journée » du compte propriétaire
de l'adresse.

Le routage se fait par l'**adresse de destination** (`<alias>@<domaine>`), pas
par l'expéditeur : n'importe quelle boîte peut écrire/transférer à cette
adresse. Gardez-la donc raisonnablement confidentielle.

## Code (déjà en place)

- `app/api/inbox/route.ts`
  - `GET` : renvoie (et crée si besoin) l'adresse mémo de l'utilisateur connecté.
    L'adresse par défaut combine un **terme notarial** et **4 caractères
    alphanumériques** aléatoires, ex. `usufruit-h56c` — mémorisable mais non devinable.
  - `POST { alias }` : personnalise l'adresse (unicité garantie par transaction).
  - `POST { regenerate: true }` : tire une nouvelle adresse aléatoire.
  - Stockage : `users/{uid}/meta/inbox` + table inverse `inboxAliases/{alias} → { uid }`.
- `app/api/inbound-email/route.ts` : webhook appelé par le service de réception.
  - Vérifie un secret partagé, résout `alias → uid`, déduplique, crée le mémo.
- Réglages › **Mémo par email** : affiche l'adresse, permet de la copier et de la personnaliser.

## Variables d'environnement à définir (Vercel)

| Variable | Exemple | Rôle |
|----------|---------|------|
| `INBOUND_EMAIL_DOMAIN` | `in.henri.tagot.fr` | Domaine des adresses entrantes (valeur par défaut dans le code, surchargeable). |
| `INBOUND_WEBHOOK_SECRET` | (chaîne aléatoire longue) | Secret que le service de réception doit présenter (`?token=…` ou en-tête `x-inbound-token`). |

## Configuration de la réception (Brevo Inbound Parsing)

1. Choisir un (sous-)domaine dédié, ex. `in.henri.app`.
2. Dans Brevo → *Transactional* → *Inbound parsing*, ajouter ce domaine.
3. DNS : créer l'enregistrement **MX** demandé par Brevo pour ce domaine
   (catch-all, pour que `n'importe-quoi@in.henri.app` soit reçu).
4. Définir le **webhook URL** :
   `https://<votre-app>/api/inbound-email?token=<INBOUND_WEBHOOK_SECRET>`
5. Tester en envoyant un email à `<votre-alias>@in.henri.app` (alias visible
   dans Réglages › Mémo par email).

> Le payload attendu est celui de Brevo Inbound (`{ items: [ { From, To, Subject, RawTextBody, Uuid, … } ] }`). Le webhook est tolérant : il accepte aussi un objet seul ou un tableau. Pour un autre fournisseur (Mailgun, SendGrid, Postmark…), adapter le mapping dans `aliasFromRecipients` / le corps de la boucle.

## Sécurité / limites

- L'adresse étant la clé de routage, sa confidentialité protège le compte.
  L'utilisateur peut la changer à tout moment (Réglages) si elle est spammée.
- Déduplication via `Uuid`/`Message-Id` (`users/{uid}/inboundEmails/{id}`).
- Les pièces jointes ne sont pas encore traitées (corps texte uniquement).

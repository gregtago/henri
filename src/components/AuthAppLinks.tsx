"use client";

// Les applications d'authentification, et où les prendre.
//
// Les citer sans dire où les trouver, c'est laisser le lecteur les chercher
// lui-même — et une recherche « google authenticator » remonte autant de
// copies que d'originaux. Chaque nom est donc un lien vers la page de son
// éditeur, qui envoie sur la bonne boutique selon l'appareil.
//
// La liste vit ici, une fois : elle est citée sur l'écran qui propose le
// second facteur et dans les Préférences, et deux listes finiraient par ne
// plus dire la même chose.

const AUTH_APPS: { name: string; url: string }[] = [
  { name: "Google Authenticator", url: "https://support.google.com/accounts/answer/1066447" },
  { name: "Microsoft Authenticator", url: "https://www.microsoft.com/fr-fr/security/mobile-authenticator/microsoft-authenticator" },
  { name: "1Password", url: "https://1password.com/downloads/" },
  { name: "Bitwarden", url: "https://bitwarden.com/download/" },
];

/**
 * Les quatre noms, chacun cliquable.
 *
 * Rendu en fragment, sans ponctuation autour : la phrase qui l'appelle garde
 * la main sur ce qui précède et ce qui suit.
 */
export default function AuthAppLinks() {
  return (
    <>
      {AUTH_APPS.map((app, i) => (
        <span key={app.url}>
          {i > 0 && ", "}
          <a href={app.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:opacity-80 transition-opacity">
            {app.name}
          </a>
        </span>
      ))}
    </>
  );
}

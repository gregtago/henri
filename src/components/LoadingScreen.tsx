// L'écran d'attente — le logo, et sous lui un sablier.
//
// « Chargement… » ne disait rien que l'attente ne dise déjà, et le mot arrivait
// sur un écran vide, sans rien qui rappelle où l'on est. Le logo tient ce rôle :
// c'est le seul endroit de l'application où il a encore quelque chose à faire —
// on est chez Henri, ça travaille. Le sablier, lui, dit le temps qui passe sans
// promettre de durée : un mot fixe laisse croire à un blocage dès la deuxième
// seconde, un sablier qui se retourne dit que ça vit.
//
// L'écran ne se montre qu'au bout de 250 ms (`.henri-attente`) : une session
// déjà ouverte se rétablit plus vite, et une attente qui n'a pas eu lieu ne doit
// pas clignoter.

import { Icon } from "./Icon";

export default function LoadingScreen({ label = "Chargement" }: { label?: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-bg-subtle"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="henri-attente flex flex-col items-center gap-4">
        <img src="/logo-henri-new.png" alt="Henri" style={{ height: "44px", width: "auto" }} />
        <Icon name="hourglass" size={22} className="henri-sablier text-tx-3" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

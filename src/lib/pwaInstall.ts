// Gestion de l'installation PWA (Chrome / Edge / Android).
//
// Chrome & Edge déclenchent l'événement `beforeinstallprompt` quand l'app
// remplit les critères d'installabilité (manifest valide + service worker +
// HTTPS). On l'intercepte le plus tôt possible pour pouvoir proposer un
// bouton "Installer l'application" maison, au lieu de compter sur la petite
// icône d'install cachée dans la barre d'adresse — que personne ne remarque.
//
// Safari / iOS ne supportent pas `beforeinstallprompt` : l'install s'y fait
// manuellement via Partager → "Sur l'écran d'accueil". Le bouton reste donc
// masqué sur ces navigateurs (canInstall() === false).

type Listener = () => void;

// L'événement n'est pas typé dans la lib DOM standard.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialized = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * Attache les écouteurs globaux. Idempotent : appelable plusieurs fois.
 * À appeler le plus tôt possible (au boot de l'app) car `beforeinstallprompt`
 * peut se déclencher avant le montage du bouton.
 */
export function initInstallCapture() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    // Empêche la mini-infobar native pour garder la main sur le moment du prompt.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

/** S'abonne aux changements d'état (prompt dispo / app installée). */
export function subscribeInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True si l'app tourne déjà en mode installé (standalone). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True si on peut proposer l'installation maintenant. */
export function canInstall(): boolean {
  return !!deferredPrompt && !installed && !isStandalone();
}

/**
 * Déclenche la fenêtre native d'installation du navigateur.
 * L'événement n'est utilisable qu'une seule fois.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const evt = deferredPrompt;
  if (!evt) return "unavailable";
  deferredPrompt = null;
  emit();
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      installed = true;
      emit();
      return "accepted";
    }
    return "dismissed";
  } catch {
    return "dismissed";
  }
}

// Gestion des préférences utilisateur (localStorage)

export type FontChoice = "inter" | "georgia" | "dm-sans" | "lora";
export type DensityChoice = "compact" | "normal" | "relaxed";
export type SortChoice = "title" | "createdAt" | "legalDueDate";

/**
 * Le thème.
 *
 * « Système » n'est pas une troisième couleur : c'est déléguer le choix au
 * téléphone, qui bascule souvent tout seul au coucher du soleil. On l'écoute
 * alors en continu — un réglage qui ne suivrait pas la bascule mentirait dès
 * le premier soir.
 */
export type ThemeChoice = "clair" | "sombre" | "systeme";

export interface UserSettings {
  font: FontChoice;
  density: DensityChoice;
  textSize: number;          // 12 | 13 | 14 | 15
  sideTabs: boolean;
  deleteDelay: number;       // secondes : 3 | 5 | 10 | 15
  sound: boolean;
  defaultSort: SortChoice;
  defaultSortDir: "asc" | "desc";
  theme: ThemeChoice;
}

export const DEFAULT_SETTINGS: UserSettings = {
  font: "inter",
  density: "normal",
  textSize: 13,
  sideTabs: true,
  deleteDelay: 5,
  sound: true,
  defaultSort: "title",
  defaultSortDir: "asc",
  // Le réglage d'un compte qui n'a jamais choisi : ce qu'il voyait hier.
  theme: "clair",
};

const KEY = "henri_settings";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: UserSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
  // Notifier les autres composants dans le même onglet
  window.dispatchEvent(new CustomEvent("henri-settings-changed", { detail: s }));
}

/** La clé sous laquelle le thème est relu avant le premier pixel (voir `app/layout.tsx`). */
export const THEME_KEY = "henri_theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

let watchSystem: ((event: MediaQueryListEvent) => void) | null = null;

const paintTheme = (dark: boolean) => {
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
};

/**
 * Pose le thème, et suit le système quand c'est lui qui décide.
 *
 * Le choix est aussi recopié dans une clé à lui : le script de `app/layout.tsx`
 * la lit avant le premier rendu, pour qu'une application ouverte la nuit ne
 * commence pas par un éclair blanc.
 */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Stockage refusé : le thème s'appliquera quand même, sans anticipation.
  }
  const media = window.matchMedia(DARK_QUERY);
  if (watchSystem) {
    media.removeEventListener("change", watchSystem);
    watchSystem = null;
  }
  if (choice === "systeme") {
    paintTheme(media.matches);
    watchSystem = (event) => paintTheme(event.matches);
    media.addEventListener("change", watchSystem);
    return;
  }
  paintTheme(choice === "sombre");
}

export function applySettings(s: UserSettings): void {
  // Appliquer la taille sur html pour que les éléments relatifs s'adaptent
  document.documentElement.style.fontSize = `${s.textSize}px`;
  const root = document.documentElement;

  // Police
  const fontMap: Record<FontChoice, string> = {
    "inter":    "'Inter', -apple-system, sans-serif",
    "georgia":  "Georgia, 'Times New Roman', serif",
    "dm-sans":  "'DM Sans', sans-serif",
    "lora":     "'Lora', Georgia, serif",
  };
  root.style.setProperty("--font-ui", fontMap[s.font]);

  // Taille de texte
  root.style.setProperty("--text-base", `${s.textSize}px`);

  // Densité des lignes
  const densityMap: Record<DensityChoice, string> = {
    compact: "28px",
    normal:  "36px",
    relaxed: "44px",
  };
  root.style.setProperty("--row-height", densityMap[s.density]);

  // Thème : clair, sombre, ou celui du système.
  applyTheme(s.theme);
}

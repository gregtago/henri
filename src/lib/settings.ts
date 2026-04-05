// Gestion des préférences utilisateur (localStorage)

export type FontChoice = "inter" | "georgia" | "dm-sans" | "lora";
export type DensityChoice = "compact" | "normal" | "relaxed";
export type SortChoice = "title" | "createdAt" | "legalDueDate";

export interface UserSettings {
  font: FontChoice;
  density: DensityChoice;
  textSize: number;          // 12 | 13 | 14 | 15
  sideTabs: boolean;
  deleteDelay: number;       // secondes : 3 | 5 | 10 | 15
  sound: boolean;
  defaultSort: SortChoice;
  defaultSortDir: "asc" | "desc";
  adminSeeAll: boolean;      // admin voit tous les dossiers de l'étude
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
  adminSeeAll: false,
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
}

export function applySettings(s: UserSettings): void {
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
}

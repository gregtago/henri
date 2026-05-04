import type { Status } from "./types";

const PROGRESS_LEVELS: Record<Status, number> = {
  "Créé": 0,
  Demandé: 1,
  Reçu: 2,
  Traité: 3
};

export const PROGRESS_STAGE_LABELS = ["Créé", "Demandée", "Reçue", "Traitée"] as const;

export const getProgressLevel = (status: Status) => PROGRESS_LEVELS[status] ?? 0;

export const getProgressStageLabel = (level?: number | null) =>
  PROGRESS_STAGE_LABELS[level ?? 0] ?? PROGRESS_STAGE_LABELS[0];

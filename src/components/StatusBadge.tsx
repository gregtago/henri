import type { Status } from "@/lib/types";

const CLASS_MAP: Record<Status, string> = {
  "Créé":    "status-badge status-badge-0",
  "Demandé":  "status-badge status-badge-1",
  "Reçu":     "status-badge status-badge-2",
  "Traité":   "status-badge status-badge-3",
};

/** La classe d'un badge de statut, pour qui a besoin de la poser lui-même. */
export const statusBadgeClass = (status: Status) => CLASS_MAP[status] ?? CLASS_MAP["Créé"];

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={CLASS_MAP[status]}>{status}</span>;
}

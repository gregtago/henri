import type { Status } from "@/lib/types";

const CLASS_MAP: Record<Status, string> = {
  "Créé":    "status-badge status-badge-0",
  "Demandé":  "status-badge status-badge-1",
  "Reçu":     "status-badge status-badge-2",
  "Traité":   "status-badge status-badge-3",
};

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={CLASS_MAP[status]}>{status}</span>;
}

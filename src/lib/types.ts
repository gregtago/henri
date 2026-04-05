export type Status = "Créée" | "Demandé" | "Reçu" | "Traité";

export const STATUSES: Status[] = [
  "Créée",
  "Demandé",
  "Reçu",
  "Traité"
];

export type Case = {
  id: string;
  title: string;
  type?: string;
  legalDueDate?: string | null;
  caseNote?: string | null;
  archived?: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Item = {
  id: string;
  caseId: string;
  parentItemId?: string | null;
  level: 2 | 3;
  title: string;
  status: Status;
  dueDate?: string | null;
  lastReminderAt?: string | null;
  progressLevel?: number | null;
  lastProgressAt?: string | import("firebase/firestore").Timestamp | null;
  createdAt: string;
  updatedAt: string;
};

export type Comment = {
  id: string;
  itemId: string;
  body: string;
  createdAt: string;
  author?: string | null;
};

export type Event = {
  id: string;
  itemId: string;
  type: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

export type MyDaySelection = {
  id: string;
  dateKey: string;
  selectionDate?: import("firebase/firestore").Timestamp | null;
  dateTs?: import("firebase/firestore").Timestamp | null;
  refType: "case" | "item" | "subitem";
  refId: string;
};

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export type Recurrence = {
  frequency: RecurrenceFrequency;
  interval: number; // toutes les N [jours / semaines / mois]
  // Si weekly : quel jour de la semaine (0=dim, 1=lun, …, 6=sam)
  dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  // Si monthly :
  monthlyMode?: "dayOfMonth" | "dayOfWeek";
  dayOfMonth?: number;                  // 1–28, ou -1 = dernier jour du mois
  weekOfMonth?: 1 | 2 | 3 | 4 | -1;   // -1 = dernier
};

export type RecurringTemplate = {
  id: string;
  title: string;
  recurrence: Recurrence;
  createdAt: string;
  updatedAt: string;
};

export type FloatingTask = {
  id: string;
  dateKey: string;
  title: string;
  status: Status;
  starred?: boolean;  // tâche volante prioritaire (⭐)
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  recurringTemplateId?: string | null; // référence au template d'origine
  createdAt: string;
  updatedAt: string;
};

export type SeedPayload = {
  cases: Case[];
  items: Item[];
  comments: Comment[];
  events: Event[];
  floatingTasks: FloatingTask[];
  myDaySelections: MyDaySelection[];
  recurringTemplates: RecurringTemplate[];
};

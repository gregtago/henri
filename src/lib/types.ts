export type Status = "À faire" | "Demandé" | "En attente" | "Reçu" | "Traité" | "Bloqué";

export const STATUSES: Status[] = [
  "À faire",
  "Demandé",
  "En attente",
  "Reçu",
  "Traité",
  "Bloqué"
];

export type Case = {
  id: string;
  title: string;
  type?: string;
  legalDueDate?: string | null;
  caseNote?: string | null;
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
  refType: "case" | "item" | "subitem";
  refId: string;
};

export type FloatingTask = {
  id: string;
  dateKey: string;
  title: string;
  status: Status;
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
};

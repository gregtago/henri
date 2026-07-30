export type Status = "Créé" | "Demandé" | "Reçu" | "Traité";

export const STATUSES: Status[] = [
  "Créé",
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
  starred?: boolean | null;
  dueDate?: string | null;
  lastReminderAt?: string | null;
  reminderAt?: string | null;        // ISO timestamp — quand notifier l'utilisateur
  reminderSentAt?: string | null;    // ISO timestamp — quand la notif a été envoyée (anti-doublon)
  reminderRepeat?: boolean | null;   // relancer tant que la tâche n'est pas traitée (null = préférence globale)
  reminderCount?: number | null;     // nombre de notifications déjà envoyées pour ce rappel
  lastReminderSentAt?: string | null; // ISO timestamp — dernière notification effectivement envoyée
  delaiDays?: number | null;         // délai de retour retenu, en jours (null = estimé d'après le libellé)
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

/**
 * Un mémo : une chose légère qu'on coche.
 *
 * C'est le pendant de la tâche de dossier, et la différence tient en un mot :
 * une tâche se **traite** (cycle Créé → Demandé → Reçu → Traité), un mémo se
 * **réalise** (une case à cocher, rien d'autre).
 *
 * Un mémo peut être rattaché à un dossier (`caseId`) ou libre. Rattaché, il
 * s'affiche dans la colonne Tâches du dossier ; libre, il ne vit que dans
 * Ma journée. Le rattachement se fait et se défait à volonté — c'est le même
 * objet dans les deux cas.
 *
 * Cocher un mémo ne le supprime jamais : `doneAt` marque le moment où il a été
 * fait, et le mémo reste consultable. On doit pouvoir voir ce qu'on a fait.
 */
export type FloatingTask = {
  id: string;
  dateKey: string;
  caseId?: string | null;   // dossier de rattachement — null = mémo libre
  doneAt?: string | null;   // ISO — quand il a été coché. null = à faire.
  title: string;
  status: Status;           // hérité : un mémo ne suit plus de cycle de statut
  starred?: boolean;  // mémo prioritaire (⭐)
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  recurringTemplateId?: string | null; // référence au template d'origine
  note?: string | null;
  reminderAt?: string | null;
  reminderSentAt?: string | null;
  reminderRepeat?: boolean | null;
  reminderCount?: number | null;
  lastReminderSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Modèle de dossier : une liste de tâches nommée, réutilisable pour pré-remplir
// un dossier (nouveau ou existant). Ne stocke que la structure (pas de statut,
// d'échéance ni de rappel).
export type CaseTemplateItem = {
  id: string;                       // id local, sert au mapping parent → enfant
  parentItemId?: string | null;
  level: 2 | 3;
  title: string;
  starred?: boolean | null;
};

export type CaseTemplate = {
  id: string;
  name: string;
  items: CaseTemplateItem[];
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

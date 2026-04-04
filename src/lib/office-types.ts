// ── Types multi-étude ────────────────────────────────────────────────────────

export type OfficeRole = "admin" | "member";

export type OfficeMember = {
  uid: string;
  email: string;
  displayName?: string | null;
  role: OfficeRole;
  joinedAt: string;
};

export type Office = {
  id: string;          // CRPCEN
  name: string;        // "Tagot Notaires"
  createdAt: string;
  createdBy: string;   // uid admin fondateur
};

export type Invitation = {
  id: string;
  officeId: string;
  email: string;
  role: OfficeRole;
  token: string;       // UUID unique
  createdAt: string;
  expiresAt: string;   // +7 jours
  usedAt?: string | null;
};

// Extensions des types existants pour le multi-étude
// Ces champs seront ajoutés progressivement sans casser l'existant
export type CaseOfficeExtension = {
  officeId?: string | null;
  ownerId?: string | null;
  assignedTo?: string[];      // uids attributaires du dossier entier
};

export type ItemOfficeExtension = {
  officeId?: string | null;
  assignedTo?: string[];      // uids attributaires de cette tâche
};

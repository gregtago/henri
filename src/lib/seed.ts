import type { SeedPayload } from "./types";
import { getTodayKey } from "./dates";

const now = new Date().toISOString();

export const seedData: SeedPayload = {
  cases: [
    {
      id: "",
      title: "Succession Martin",
      type: "Succession",
      legalDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(),
      caseNote: "Vérifier les documents manquants avant relance.",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "",
      title: "Vente Dupont",
      type: "Vente",
      legalDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      caseNote: "Préparer la checklist des diagnostics.",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "",
      title: "Divorce Lemoine",
      type: "Divorce",
      legalDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      caseNote: "Notes de suivi initiales.",
      createdAt: now,
      updatedAt: now
    }
  ],
  items: [
    {
      id: "",
      caseId: "Succession Martin",
      level: 2,
      title: "Rassembler pièces d'identité",
      status: "À faire",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(),
      createdAt: now,
      updatedAt: now
    },
    {
      id: "",
      caseId: "Succession Martin",
      level: 2,
      title: "Contacter héritiers",
      status: "Demandé",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "",
      caseId: "Succession Martin",
      parentItemId: "Contacter héritiers",
      level: 3,
      title: "Relancer par email",
      status: "En attente",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "",
      caseId: "Vente Dupont",
      level: 2,
      title: "Réunir pièces vente",
      status: "À faire",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "",
      caseId: "Vente Dupont",
      level: 2,
      title: "Vérifier diagnostics",
      status: "Reçu",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "",
      caseId: "Divorce Lemoine",
      level: 2,
      title: "Audience préliminaire",
      status: "Bloqué",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      createdAt: now,
      updatedAt: now
    }
  ],
  comments: [
    {
      id: "",
      itemId: "Rassembler pièces d'identité",
      body: "Ajouter pièce manquante au dossier.",
      createdAt: now
    }
  ],
  events: [
    {
      id: "",
      itemId: "Contacter héritiers",
      type: "progress_changed",
      payload: { status: "Demandé" },
      createdAt: now
    }
  ],
  floatingTasks: [
    {
      id: "",
      dateKey: getTodayKey(),
      title: "Appeler Mme Durand",
      status: "À faire",
      createdAt: now,
      updatedAt: now
    }
  ],
  myDaySelections: []
};

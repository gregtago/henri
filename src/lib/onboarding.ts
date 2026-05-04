import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { createCase, createItem } from "./firestore";

export async function seedOnboardingIfNeeded(uid: string): Promise<void> {
  // Vérifier si l'onboarding a déjà été fait
  const metaRef = doc(db, `users/${uid}/meta/onboarding`);
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists()) return; // Déjà fait, on ne touche à rien

  // Marquer immédiatement pour éviter tout doublon
  await setDoc(metaRef, { done: true, createdAt: new Date().toISOString() });

  // ── DOSSIER 1 : Présentation de Henri ────────────────────────────────
  const case1 = await createCase(uid, {
    title: "Bienvenue dans Henri 👋",
    legalDueDate: null,
    caseNote: "Ce dossier vous explique les bases de Henri. Vous pouvez le supprimer quand vous vous sentez à l'aise.",
  });

  await createItem(uid, { caseId: case1, level: 2, title: "Cliquez ici pour ouvrir ce dossier", status: "Créé", parentItemId: null, dueDate: null });
  const t1 = await createItem(uid, { caseId: case1, level: 2, title: "Henri s'organise en dossiers et tâches", status: "Créé", parentItemId: null, dueDate: null });
  await createItem(uid, { caseId: case1, level: 3, title: "Chaque dossier correspond à un client ou une affaire", status: "Créé", parentItemId: t1, dueDate: null });
  await createItem(uid, { caseId: case1, level: 3, title: "Chaque tâche peut avoir des sous-tâches pour décomposer le travail", status: "Créé", parentItemId: t1, dueDate: null });
  await createItem(uid, { caseId: case1, level: 3, title: "Naviguez entre colonnes avec ← → ou en cliquant", status: "Créé", parentItemId: t1, dueDate: null });

  const t2 = await createItem(uid, { caseId: case1, level: 2, title: "Chaque tâche avance par étapes", status: "Demandé", parentItemId: null, dueDate: null });
  await createItem(uid, { caseId: case1, level: 3, title: "Créée : la tâche vient d'être identifiée", status: "Créé", parentItemId: t2, dueDate: null });
  await createItem(uid, { caseId: case1, level: 3, title: "Demandé : vous avez formulé la demande, vous attendez", status: "Demandé", parentItemId: t2, dueDate: null });
  await createItem(uid, { caseId: case1, level: 3, title: "Reçu : les éléments sont arrivés, il faut les traiter", status: "Reçu", parentItemId: t2, dueDate: null });
  await createItem(uid, { caseId: case1, level: 3, title: "Traité : la tâche est accomplie (elle reste consultable)", status: "Traité", parentItemId: t2, dueDate: null });

  // ── DOSSIER 2 : Ma journée ───────────────────────────────────────────
  const case2 = await createCase(uid, {
    title: "Comment utiliser Ma journée",
    legalDueDate: null,
    caseNote: "Ma journée est votre espace de travail quotidien. Commencez chaque matin ici.",
  });

  const t3 = await createItem(uid, { caseId: case2, level: 2, title: "Ajouter une tâche à Ma journée", status: "Créé", parentItemId: null, dueDate: null });
  await createItem(uid, { caseId: case2, level: 3, title: "Sélectionnez cette tâche et appuyez sur A", status: "Créé", parentItemId: t3, dueDate: null });
  await createItem(uid, { caseId: case2, level: 3, title: "Ou cliquez sur ☀ dans le panneau de détail à droite", status: "Créé", parentItemId: t3, dueDate: null });
  await createItem(uid, { caseId: case2, level: 3, title: "La tâche apparaît alors dans Ma journée (onglet en haut)", status: "Créé", parentItemId: t3, dueDate: null });

  const t4 = await createItem(uid, { caseId: case2, level: 2, title: "Les suggestions vous aident à composer votre journée", status: "Créé", parentItemId: null, dueDate: null });
  await createItem(uid, { caseId: case2, level: 3, title: "⭐ Tâches marquées importantes (étoile ★ dans le détail)", status: "Créé", parentItemId: t4, dueDate: null });
  await createItem(uid, { caseId: case2, level: 3, title: "🔴 Tâches en retard sur leur échéance", status: "Créé", parentItemId: t4, dueDate: null });
  await createItem(uid, { caseId: case2, level: 3, title: "📅 Tâches à échéance aujourd'hui", status: "Créé", parentItemId: t4, dueDate: null });
  await createItem(uid, { caseId: case2, level: 3, title: "🆕 Tâches créées récemment", status: "Créé", parentItemId: t4, dueDate: null });

  // ── DOSSIER 3 : Essayez par vous-même ────────────────────────────────
  const case3 = await createCase(uid, {
    title: "Mon premier dossier — à vous de jouer",
    legalDueDate: null,
    caseNote: "Voici un dossier vierge pour vous entraîner. Créez des tâches, changez les statuts, ajoutez des échéances.",
  });

  await createItem(uid, { caseId: case3, level: 2, title: "Appuyez sur N pour créer une tâche ici", status: "Créé", parentItemId: null, dueDate: null });
  const t5 = await createItem(uid, { caseId: case3, level: 2, title: "Exemple : Contacter le client", status: "Demandé", parentItemId: null, dueDate: null });
  await createItem(uid, { caseId: case3, level: 3, title: "Shift+N crée une sous-tâche comme celle-ci", status: "Créé", parentItemId: t5, dueDate: null });
  await createItem(uid, { caseId: case3, level: 3, title: "Utilisez les touches 1-4 pour changer le statut", status: "Reçu", parentItemId: t5, dueDate: null });
}

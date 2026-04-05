const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

initializeApp();

/**
 * Calcule la prochaine occurrence d'une récurrence à partir d'une date de référence.
 */
function getNextOccurrence(recurrence, from) {
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);

  switch (recurrence.frequency) {
    case "daily":
      return addDays(base, recurrence.interval);

    case "weekly": {
      const targetDow = recurrence.dayOfWeek ?? base.getDay();
      const currentDow = base.getDay();
      const daysUntilTarget = ((targetDow - currentDow) + 7) % 7 || 7;
      const next = addDays(base, daysUntilTarget);
      if (recurrence.interval > 1) {
        next.setDate(next.getDate() + (recurrence.interval - 1) * 7);
      }
      return next;
    }

    case "monthly": {
      const mode = recurrence.monthlyMode ?? "dayOfMonth";
      if (mode === "dayOfMonth") {
        return getNextDayOfMonth(base, recurrence.interval, recurrence.dayOfMonth ?? base.getDate());
      } else {
        const dow = recurrence.dayOfWeek ?? base.getDay();
        const week = recurrence.weekOfMonth ?? 1;
        return getNextNthWeekdayOfMonth(base, recurrence.interval, dow, week);
      }
    }

    default:
      return null;
  }
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getNextDayOfMonth(from, intervalMonths, dayOfMonth) {
  let year = from.getFullYear();
  let month = from.getMonth() + intervalMonths;
  year += Math.floor(month / 12);
  month = month % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = dayOfMonth === -1 ? lastDay : Math.min(dayOfMonth, lastDay);
  return new Date(year, month, day);
}

function getNextNthWeekdayOfMonth(from, intervalMonths, dayOfWeek, weekOfMonth) {
  let year = from.getFullYear();
  let month = from.getMonth() + intervalMonths;
  year += Math.floor(month / 12);
  month = month % 12;

  if (weekOfMonth === -1) {
    return getLastWeekdayOfMonth(year, month, dayOfWeek);
  }

  const firstDay = new Date(year, month, 1);
  const firstDow = firstDay.getDay();
  let dayOffset = (dayOfWeek - firstDow + 7) % 7;
  dayOffset += (weekOfMonth - 1) * 7;

  const result = new Date(year, month, 1 + dayOffset);
  if (result.getMonth() !== month) {
    result.setDate(result.getDate() - 7);
  }
  return result;
}

function getLastWeekdayOfMonth(year, month, dayOfWeek) {
  const lastDay = new Date(year, month + 1, 0);
  const lastDow = lastDay.getDay();
  const diff = (lastDow - dayOfWeek + 7) % 7;
  lastDay.setDate(lastDay.getDate() - diff);
  return lastDay;
}

function dateToKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Cloud Function schedulée — tourne chaque matin à 6h (Europe/Paris).
 * Pour chaque utilisateur, parcourt les templates récurrents et crée
 * les tâches volantes du jour si leur prochaine occurrence correspond à aujourd'hui.
 */
exports.generateRecurringTasks = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "Europe/Paris",
  },
  async () => {
    const db = getFirestore();
    const todayParis = getTodayInParis();
    const todayKey = dateToKey(todayParis);

    console.log(`[generateRecurringTasks] Traitement pour ${todayKey}`);

    // Parcourir tous les utilisateurs
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;

      try {
        const templatesSnap = await db
          .collection(`users/${uid}/recurringTemplates`)
          .get();

        for (const templateDoc of templatesSnap.docs) {
          const template = { id: templateDoc.id, ...templateDoc.data() };

          if (!template.recurrence) continue;

          // Calculer la prochaine occurrence à partir de la dernière exécution
          const lastRun = template.lastRunAt
            ? new Date(template.lastRunAt)
            : new Date(template.createdAt);

          const nextOccurrence = getNextOccurrence(template.recurrence, lastRun);
          if (!nextOccurrence) continue;

          const nextKey = dateToKey(nextOccurrence);

          // Si la prochaine occurrence est aujourd'hui, créer la tâche
          if (nextKey === todayKey) {
            // Vérifier qu'on n'a pas déjà créé cette tâche aujourd'hui
            const existingSnap = await db
              .collection(`users/${uid}/floatingTasks`)
              .where("recurringTemplateId", "==", template.id)
              .where("dateKey", "==", todayKey)
              .get();

            if (existingSnap.empty) {
              await db.collection(`users/${uid}/floatingTasks`).add({
                dateKey: todayKey,
                title: template.title,
                status: "Créée",
                starred: false,
                recurrence: template.recurrence,
                recurringTemplateId: template.id,
                createdAt: nowIso(),
                updatedAt: nowIso(),
              });

              // Mettre à jour lastRunAt sur le template
              await templateDoc.ref.update({
                lastRunAt: nowIso(),
                updatedAt: nowIso(),
              });

              console.log(`[generateRecurringTasks] Tâche créée pour uid=${uid}, template="${template.title}"`);
            }
          }
        }
      } catch (err) {
        console.error(`[generateRecurringTasks] Erreur pour uid=${uid}:`, err);
      }
    }

    console.log(`[generateRecurringTasks] Terminé.`);
  }
);

/**
 * Retourne la date d'aujourd'hui en heure de Paris (sans dépendance à une lib externe).
 */
function getTodayInParis() {
  const now = new Date();
  // Convertir en heure de Paris via toLocaleString
  const parisStr = now.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // parisStr = "05/04/2026"
  const [day, month, year] = parisStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

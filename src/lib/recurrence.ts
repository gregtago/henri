import type { Recurrence } from "./types";

/**
 * Calcule la prochaine occurrence d'une récurrence à partir d'une date de référence.
 * Retourne null si la récurrence est invalide.
 */
export function getNextOccurrence(recurrence: Recurrence, from: Date): Date | null {
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);

  switch (recurrence.frequency) {
    case "daily":
      return addDays(base, recurrence.interval);

    case "weekly": {
      const targetDow = recurrence.dayOfWeek ?? base.getDay();
      // Avancer jusqu'au prochain targetDow, en sautant N semaines
      const next = new Date(base);
      const currentDow = next.getDay();
      const daysUntilTarget = ((targetDow - currentDow) + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntilTarget);
      // Si on a sauté moins d'une semaine complète, ajouter les semaines supplémentaires
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
        // dayOfWeek mode
        const dow = recurrence.dayOfWeek ?? base.getDay();
        const week = recurrence.weekOfMonth ?? 1;
        return getNextNthWeekdayOfMonth(base, recurrence.interval, dow, week);
      }
    }

    default:
      return null;
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Retourne la prochaine occurrence du Nème jour du mois,
 * en avançant de `intervalMonths` mois à partir de `from`.
 * dayOfMonth = -1 → dernier jour du mois.
 */
function getNextDayOfMonth(from: Date, intervalMonths: number, dayOfMonth: number): Date {
  let year = from.getFullYear();
  let month = from.getMonth() + intervalMonths;
  // Normaliser le dépassement d'année
  year += Math.floor(month / 12);
  month = month % 12;

  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = dayOfMonth === -1 ? lastDay : Math.min(dayOfMonth, lastDay);
  return new Date(year, month, day);
}

/**
 * Retourne la prochaine occurrence du Xème jour-de-semaine d'un mois,
 * en avançant de `intervalMonths` mois.
 * weekOfMonth = -1 → dernier du mois.
 *
 * Ex : 1er lundi (dow=1, week=1) dans 3 mois.
 */
function getNextNthWeekdayOfMonth(
  from: Date,
  intervalMonths: number,
  dayOfWeek: number,
  weekOfMonth: number
): Date {
  let year = from.getFullYear();
  let month = from.getMonth() + intervalMonths;
  year += Math.floor(month / 12);
  month = month % 12;

  if (weekOfMonth === -1) {
    return getLastWeekdayOfMonth(year, month, dayOfWeek);
  }

  // Premier jour du mois cible
  const firstDay = new Date(year, month, 1);
  const firstDow = firstDay.getDay();

  // Décalage jusqu'au bon jour de semaine
  let dayOffset = (dayOfWeek - firstDow + 7) % 7;
  // Semaine N (1-indexed)
  dayOffset += (weekOfMonth - 1) * 7;

  const result = new Date(year, month, 1 + dayOffset);

  // Sécurité : si on déborde sur le mois suivant (ex: 5ème lundi inexistant)
  if (result.getMonth() !== month) {
    // Reculer d'une semaine pour rester dans le mois
    result.setDate(result.getDate() - 7);
  }

  return result;
}

function getLastWeekdayOfMonth(year: number, month: number, dayOfWeek: number): Date {
  // Dernier jour du mois
  const lastDay = new Date(year, month + 1, 0);
  const lastDow = lastDay.getDay();
  const diff = (lastDow - dayOfWeek + 7) % 7;
  lastDay.setDate(lastDay.getDate() - diff);
  return lastDay;
}

/**
 * Formate une récurrence en texte lisible en français.
 */
export function formatRecurrence(r: Recurrence): string {
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const ordinals = ["", "1er", "2ème", "3ème", "4ème", "dernier"];

  switch (r.frequency) {
    case "daily":
      return r.interval === 1 ? "Tous les jours" : `Tous les ${r.interval} jours`;

    case "weekly": {
      const dayName = r.dayOfWeek !== undefined ? days[r.dayOfWeek] : "jour défini";
      return r.interval === 1
        ? `Chaque ${dayName}`
        : `Toutes les ${r.interval} semaines (${dayName})`;
    }

    case "monthly": {
      const everyN = r.interval === 1 ? "Chaque mois" : `Tous les ${r.interval} mois`;
      if (!r.monthlyMode || r.monthlyMode === "dayOfMonth") {
        const d = r.dayOfMonth === -1 ? "dernier jour" : `le ${r.dayOfMonth}`;
        return `${everyN}, ${d}`;
      } else {
        const weekLabel = r.weekOfMonth === -1 ? "dernier" : ordinals[r.weekOfMonth ?? 1];
        const dayName = r.dayOfWeek !== undefined ? days[r.dayOfWeek] : "jour défini";
        return `${everyN}, ${weekLabel} ${dayName}`;
      }
    }
  }
}

/**
 * Convertit une Date en dateKey "YYYY-MM-DD".
 */
export function dateToKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

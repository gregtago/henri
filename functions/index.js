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

    // listDocuments() renvoie aussi les documents "fantômes" : un doc
    // users/{uid} jamais écrit directement (il n'existe que via ses
    // sous-collections) est ignoré par un .get() classique.
    const userRefs = await db.collection("users").listDocuments();

    for (const userRef of userRefs) {
      const uid = userRef.id;

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

// ─────────────────────────────────────────────────────────────────────
//  RAPPELS PUSH (FCM)
// ─────────────────────────────────────────────────────────────────────
const { getMessaging } = require("firebase-admin/messaging");

/**
 * Politique de rappel par défaut.
 * ⚠ Doit rester alignée sur src/lib/reminderPolicy.ts (DEFAULT_REMINDER_POLICY).
 */
const DEFAULT_POLICY = {
  repeatEnabled: true,
  repeatIntervalHours: 3,
  repeatMax: 3,
  dayStartHour: 8,
  dayEndHour: 20,
  recapEnabled: true,
  recapEveningHour: 18,
  recapMorningHour: 8,
};

/** Lit users/{uid}/settings/reminders et complète avec les valeurs par défaut. */
async function loadPolicy(db, uid) {
  try {
    const snap = await db.doc(`users/${uid}/settings/reminders`).get();
    if (!snap.exists) return { ...DEFAULT_POLICY };
    const raw = snap.data() || {};
    const policy = { ...DEFAULT_POLICY };
    for (const key of Object.keys(DEFAULT_POLICY)) {
      const v = raw[key];
      if (typeof DEFAULT_POLICY[key] === "boolean") {
        if (typeof v === "boolean") policy[key] = v;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        policy[key] = Math.round(v);
      }
    }
    return policy;
  } catch (err) {
    console.error(`[loadPolicy] uid=${uid}`, err);
    return { ...DEFAULT_POLICY };
  }
}

/** Décompose une date en composantes de l'heure de Paris (année, mois, jour, heure, minute). */
function parisParts(date) {
  // "sv-SE" produit un format ISO-like : "2026-07-30 18:05:00"
  const s = date.toLocaleString("sv-SE", { timeZone: "Europe/Paris" });
  const [datePart, timePart] = s.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return { y, m, d, hh, mm };
}

/**
 * Construit la Date correspondant à une heure murale de Paris.
 * Corrige l'écart par itération : gère l'heure d'été sans dépendance externe.
 */
function parisWallClock(y, m, d, hh, mm) {
  const target = Date.UTC(y, m - 1, d, hh, mm, 0);
  let ts = target;
  for (let i = 0; i < 3; i++) {
    const p = parisParts(new Date(ts));
    const actual = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, 0);
    const diff = target - actual;
    if (diff === 0) break;
    ts += diff;
  }
  return new Date(ts);
}

/** Jour suivant (heure de Paris) d'un triplet de date, via une ancre à midi. */
function parisNextDay(y, m, d) {
  const anchor = parisWallClock(y, m, d, 12, 0);
  return parisParts(new Date(anchor.getTime() + 24 * 3600 * 1000));
}

/**
 * Date de la prochaine relance : `from` + intervalle, ramenée dans la plage
 * horaire autorisée. Une relance qui tomberait le soir est reportée au
 * lendemain matin — c'est ce qui produit le « rappel du lendemain ».
 */
function computeNextRepeat(from, policy) {
  const next = new Date(from.getTime() + policy.repeatIntervalHours * 3600 * 1000);
  const p = parisParts(next);
  if (p.hh < policy.dayStartHour) {
    return parisWallClock(p.y, p.m, p.d, policy.dayStartHour, 0);
  }
  if (p.hh >= policy.dayEndHour) {
    const t = parisNextDay(p.y, p.m, p.d);
    return parisWallClock(t.y, t.m, t.d, policy.dayStartHour, 0);
  }
  return next;
}

/** dateKey (AAAA-MM-JJ) d'une date, en heure de Paris. */
function parisDateKey(date) {
  const p = parisParts(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/**
 * Envoie une notification à tous les appareils d'un utilisateur.
 * Purge les tokens invalides et renvoie le nombre d'envois réussis.
 */
async function pushToUser(db, messaging, uid, tokenStrings, { title, body, tag, url, sticky }) {
  if (tokenStrings.length === 0) return 0;
  const response = await messaging.sendEachForMulticast({
    tokens: tokenStrings,
    // Message "data-only" : c'est le service worker (firebase-messaging-sw.js
    // → onBackgroundMessage) qui construit et affiche la notif à partir de
    // `data`. On évite ainsi deux pièges :
    //  1) le doublon (un payload `notification` est auto-affiché par le SDK
    //     EN PLUS de onBackgroundMessage) ;
    //  2) un `webpush.fcmOptions.link` relatif ("/my-day"), refusé par FCM
    //     qui exige une URL HTTPS absolue — ce qui faisait échouer TOUT l'envoi.
    // Le clic est géré par le handler notificationclick du SW via data.url.
    data: {
      url: url || "/my-day",
      tag,
      title,
      body,
      // "1" ⇒ la notif reste affichée jusqu'à une action de l'utilisateur, et
      // resonne même si une notif du même tag était déjà présente. C'est ce qui
      // rend une relance moins facile à balayer qu'un premier rappel.
      sticky: sticky ? "1" : "0",
    },
    webpush: {
      headers: { Urgency: "high" },
    },
  });

  if (response.failureCount > 0) {
    for (let i = 0; i < response.responses.length; i++) {
      const r = response.responses[i];
      if (!r.success) {
        const errCode = r.error && r.error.code;
        if (errCode === "messaging/registration-token-not-registered"
          || errCode === "messaging/invalid-registration-token") {
          await db.doc(`users/${uid}/pushTokens/${tokenStrings[i]}`).delete().catch(() => {});
        }
      }
    }
  }
  return response.successCount;
}

/**
 * Toutes les 5 minutes :
 *   - parcourt tous les utilisateurs
 *   - cherche les items et floatingTasks dont reminderAt <= now et reminderSentAt vide
 *   - envoie une notif aux tokens FCM du user
 *   - RELANCE : si la tâche n'est pas « Traité » et que la relance est active,
 *     replanifie un rappel (reminderAt = maintenant + intervalle, reminderSentAt
 *     remis à zéro) jusqu'à repeatMax relances. Sinon, marque reminderSentAt
 *     pour ne pas réenvoyer.
 *
 * Les tokens invalides (404 / Unregistered) sont automatiquement purgés.
 */
exports.sendDueReminders = onSchedule(
  { schedule: "every 5 minutes", timeZone: "Europe/Paris", region: "europe-west1" },
  async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();
    const now = new Date();
    const nowIso = now.toISOString();

    // listDocuments() renvoie aussi les documents "fantômes" : un doc
    // users/{uid} jamais écrit directement (il n'existe que via ses
    // sous-collections) est ignoré par un .get() classique — c'était la
    // cause du "0 envoyés" permanent.
    const userRefs = await db.collection("users").listDocuments();
    let totalSent = 0;
    let totalSkipped = 0;
    let totalRepeats = 0;

    for (const userRef of userRefs) {
      const uid = userRef.id;

      // Récupère les tokens du user
      const tokensSnap = await db.collection(`users/${uid}/pushTokens`).get();
      const tokens = tokensSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (tokens.length === 0) continue;

      const policy = await loadPolicy(db, uid);

      // Items à notifier (tâches de dossiers)
      const itemsSnap = await db.collection(`users/${uid}/items`)
        .where("reminderAt", "<=", nowIso)
        .get();
      const dueItems = itemsSnap.docs
        .filter(d => !d.data().reminderSentAt && d.data().status !== "Traité");

      // FloatingTasks à notifier (mémos)
      const ftSnap = await db.collection(`users/${uid}/floatingTasks`)
        .where("reminderAt", "<=", nowIso)
        .get();
      // Un mémo réalisé (doneAt) n'a plus rien à rappeler : cocher, c'est fini.
      const dueFloating = ftSnap.docs
        .filter(d => !d.data().reminderSentAt && d.data().status !== "Traité" && !d.data().doneAt);

      const targets = [
        ...dueItems.map(d => ({ doc: d, collection: "items", data: d.data() })),
        ...dueFloating.map(d => ({ doc: d, collection: "floatingTasks", data: d.data() })),
      ];

      // Envoi multicast à tous les devices du user
      const tokenStrings = tokens.map(tt => tt.token).filter(Boolean);
      if (tokenStrings.length === 0) continue;

      for (const t of targets) {
        // Nombre de notifications DÉJÀ envoyées pour ce rappel :
        // 0 = premier rappel, 1+ = relance.
        const alreadySent = Number(t.data.reminderCount) || 0;
        // Relance : réglage de la tâche s'il existe, sinon préférence globale.
        const repeat = (t.data.reminderRepeat === undefined || t.data.reminderRepeat === null)
          ? policy.repeatEnabled
          : !!t.data.reminderRepeat;

        const title = t.data.title || "Rappel";
        const kind = t.collection === "items" ? "Tâche à réaliser" : "Mémo à traiter";
        const body = alreadySent === 0
          ? kind
          : `Toujours pas fait — relance ${alreadySent}/${policy.repeatMax}`;

        try {
          const successCount = await pushToUser(db, messaging, uid, tokenStrings, {
            title,
            body,
            tag: `${t.collection}-${t.doc.id}`,
            url: "/my-day",
            // Une relance reste affichée jusqu'à ce qu'on s'en occupe.
            sticky: alreadySent > 0,
          });
          totalSent += successCount;

          // Ne marquer "envoyé" que si au moins un device a bien reçu la notif.
          // Sinon on laisse le prochain passage réessayer, au lieu de "consommer"
          // un rappel qui n'a jamais été délivré.
          if (successCount > 0) {
            const sentCount = alreadySent + 1;
            if (repeat && sentCount <= policy.repeatMax) {
              // On réarme : la tâche n'est pas traitée, elle reviendra.
              const nextAt = computeNextRepeat(now, policy);
              await t.doc.ref.update({
                reminderAt: nextAt.toISOString(),
                reminderSentAt: null,
                reminderCount: sentCount,
                lastReminderSentAt: nowIso,
              });
              totalRepeats++;
            } else {
              await t.doc.ref.update({
                reminderSentAt: nowIso,
                reminderCount: sentCount,
                lastReminderSentAt: nowIso,
              });
            }
          }
        } catch (err) {
          console.error(`[sendDueReminders] échec envoi ${t.collection}/${t.doc.id}`, err);
          totalSkipped++;
        }
      }
    }

    console.log(`[sendDueReminders] ${totalSent} envoyés, ${totalRepeats} relances replanifiées, ${totalSkipped} échoués.`);
  }
);

/**
 * Récapitulatif des tâches non traitées — toutes les heures, mais n'envoie
 * qu'aux deux créneaux configurés par l'utilisateur :
 *
 *   - le soir (recapEveningHour, 18h par défaut) : « il vous reste N tâches
 *     aujourd'hui » ;
 *   - le lendemain matin (recapMorningHour, 8h par défaut) : « N tâches d'hier
 *     n'ont pas été traitées ».
 *
 * C'est le filet de sécurité des rappels individuels : une tâche prévue pour
 * le jour J et jamais traitée revient le soir même, puis le lendemain.
 */
exports.sendDailyDigest = onSchedule(
  { schedule: "0 * * * *", timeZone: "Europe/Paris", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();
    const now = new Date();
    const hour = parisParts(now).hh;
    const todayKey = parisDateKey(now);
    const yesterdayKey = parisDateKey(new Date(now.getTime() - 24 * 3600 * 1000));

    const userRefs = await db.collection("users").listDocuments();
    let totalSent = 0;
    let totalUsers = 0;

    for (const userRef of userRefs) {
      const uid = userRef.id;

      try {
        const policy = await loadPolicy(db, uid);
        if (!policy.recapEnabled) continue;

        const isEvening = hour === policy.recapEveningHour;
        const isMorning = hour === policy.recapMorningHour;
        if (!isEvening && !isMorning) continue;

        // Le soir : le jour qui s'achève. Le matin : la veille.
        const slot = isEvening ? "soir" : "matin";
        const targetKey = isEvening ? todayKey : yesterdayKey;

        // Anti-doublon : un seul récap par créneau et par jour, même si la
        // fonction est rejouée (retry, redéploiement).
        const guardRef = db.doc(`users/${uid}/reminderDigests/${targetKey}_${slot}`);
        if ((await guardRef.get()).exists) continue;

        const tokensSnap = await db.collection(`users/${uid}/pushTokens`).get();
        const tokenStrings = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
        if (tokenStrings.length === 0) continue;

        const titles = await collectOpenTitles(db, uid, targetKey);
        if (titles.length === 0) continue;

        const n = titles.length;
        const plural = n > 1 ? "s" : "";
        const notifTitle = isEvening
          ? `${n} tâche${plural} encore à faire aujourd'hui`
          : `${n} tâche${plural} d'hier non traitée${plural}`;
        const shown = titles.slice(0, 3).join(" · ");
        const body = n > 3 ? `${shown} … +${n - 3}` : shown;

        const successCount = await pushToUser(db, messaging, uid, tokenStrings, {
          title: notifTitle,
          body,
          tag: `digest-${targetKey}-${slot}`,
          url: "/my-day",
          sticky: true,
        });

        if (successCount > 0) {
          totalSent += successCount;
          totalUsers++;
          await guardRef.set({
            dateKey: targetKey,
            slot,
            count: n,
            sentAt: nowIso(),
          });
        }
      } catch (err) {
        console.error(`[sendDailyDigest] Erreur pour uid=${uid}:`, err);
      }
    }

    console.log(`[sendDailyDigest] ${hour}h — ${totalSent} envois pour ${totalUsers} utilisateur(s).`);
  }
);

/**
 * Titres des tâches prévues pour `dateKey` et non encore traitées :
 * les mémos du jour (floatingTasks) et les tâches de dossier mises dans
 * « Ma journée » ce jour-là.
 */
async function collectOpenTitles(db, uid, dateKey) {
  const titles = [];

  const ftSnap = await db.collection(`users/${uid}/floatingTasks`)
    .where("dateKey", "==", dateKey)
    .get();
  for (const d of ftSnap.docs) {
    const data = d.data();
    // `doneAt` = mémo réalisé : il ne fait plus partie de ce qui reste ouvert.
    if (data.status !== "Traité" && !data.doneAt) titles.push(data.title || "Sans titre");
  }

  const selSnap = await db.collection(`users/${uid}/myDaySelections`)
    .where("dateKey", "==", dateKey)
    .get();
  const seen = new Set();
  for (const d of selSnap.docs) {
    const sel = d.data();
    if (sel.refType !== "item" && sel.refType !== "subitem") continue;
    if (!sel.refId || seen.has(sel.refId)) continue;
    seen.add(sel.refId);
    const itemSnap = await db.doc(`users/${uid}/items/${sel.refId}`).get();
    if (!itemSnap.exists) continue;
    const item = itemSnap.data();
    if (item.status !== "Traité") titles.push(item.title || "Sans titre");
  }

  return titles;
}

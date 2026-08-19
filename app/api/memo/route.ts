// Écrire un mémo sans ouvrir Henri — ce que le raccourci iOS appelle.
//
// Le geste visé tient en trois temps : la touche Action de l'iPhone, un champ
// où l'on tape (ou dicte) une phrase, et le mémo est dans Ma journée. Rien à
// déverrouiller, rien à attendre, l'application ne s'ouvre même pas. C'est le
// seul moyen pour qu'une note prise dans un couloir arrive vraiment.
//
// Trois décisions gouvernent cette route :
//
// - **elle écrit exactement ce que la ligne de saisie écrit** — `buildQuickMemo`,
//   les mêmes jetons, le même rappel du jour de l'échéance. Un mémo capturé au
//   téléphone n'est pas un objet d'une autre espèce ;
// - **elle s'authentifie par une clé de raccourci** (`shortcutKey.ts`), pas par
//   une session : un raccourci n'a pas de session, et lui en fabriquer une
//   supposerait de garder le mot de passe du notaire dans un presse-papiers ;
// - **elle raisonne à l'heure de Paris.** La journée d'un notaire français
//   change à minuit, à Paris ; un serveur qui compte en UTC classerait dans la
//   veille tout ce qui est noté après 22 h l'été (`TZ` ci-dessous).

export const dynamic = "force-dynamic";

// Avant tout calcul de date : « aujourd'hui », « demain » et l'heure des
// échéances (9 h) sont des heures murales de Paris, pas d'UTC.
process.env.TZ = "Europe/Paris";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { buildQuickMemo } from "@/lib/memos";
import { normalizeReminderPolicy } from "@/lib/reminderRules";
import { formatDateFR, getTodayKey } from "@/lib/dates";
import { isShortcutKey, shortcutKeyHash } from "@/lib/shortcutKey";
import {
  readCaptureLine,
  resolveCaptureCase,
  resolveCaptureDue,
  resolveCaptureParent,
  restoreQuery,
  splitCapture,
} from "@/lib/quickCapture";
import type { Case, Item } from "@/lib/types";

/** Au-delà, ce n'est plus une note jetée : on refuse plutôt que de tronquer en silence. */
const MAX_BODY_BYTES = 10_000;

const nowIso = () => new Date().toISOString();

const refuse = (message: string, status: number) =>
  NextResponse.json({ ok: false, message }, { status });

/**
 * La clé présentée par le raccourci.
 *
 * Trois portes d'entrée parce qu'on ne maîtrise pas la façon dont l'utilisateur
 * remontera son raccourci : l'en-tête `Authorization`, un en-tête dédié, ou le
 * corps JSON. Aucune n'est plus sûre que l'autre — c'est le même secret.
 */
const readKey = (req: NextRequest, body: Record<string, unknown>): string | null => {
  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    req.headers.get("x-henri-cle")?.trim() ??
    null;
  const candidate = header || (typeof body.key === "string" ? body.key.trim() : "");
  return isShortcutKey(candidate) ? candidate : null;
};

/**
 * L'utilisateur derrière une clé, `null` si elle ne vaut plus rien.
 *
 * Deux lectures et non une : l'annuaire dit à qui appartient la clé — rangé
 * sous son **empreinte**, jamais sous la clé elle-même —, et le réglage de
 * l'utilisateur dit si c'est **toujours** celle-ci. Sans cette seconde lecture,
 * une clé régénérée continuerait d'écrire : révoquer ne révoquerait rien.
 */
const resolveKeyOwner = async (key: string): Promise<string | null> => {
  const snap = await adminDb.doc(`shortcutKeys/${await shortcutKeyHash(key)}`).get();
  const uid = snap.exists ? (snap.data()?.uid as string | undefined) : undefined;
  if (!uid) return null;
  const settings = await adminDb.doc(`users/${uid}/settings/shortcut`).get();
  return settings.exists && settings.data()?.key === key ? uid : null;
};

/** Le texte capturé, que le raccourci l'envoie en JSON ou en texte brut. */
const readText = (body: Record<string, unknown>, raw: string): string => {
  const field = body.text ?? body.texte ?? body.memo ?? body.title;
  if (typeof field === "string") return field;
  return typeof body.text === "undefined" && Object.keys(body).length === 0 ? raw : "";
};

export async function POST(req: NextRequest) {
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return refuse("Requête illisible.", 400);
  }
  if (raw.length > MAX_BODY_BYTES) return refuse("Texte trop long.", 413);

  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    body = {}; // pas du JSON : c'est le texte lui-même
  }

  const key = readKey(req, body);
  if (!key) return refuse("Clé de raccourci absente ou mal formée.", 401);

  try {
    const uid = await resolveKeyOwner(key);
    if (!uid) return refuse("Clé de raccourci inconnue ou révoquée.", 401);

    const lines = splitCapture(readText(body, raw));
    if (lines.length === 0) return refuse("Rien à noter.", 400);
    const reads = lines.map(readCaptureLine);

    // On ne va chercher que ce que les jetons réclament : sans « # », pas de
    // lecture des dossiers ; sans « > », pas de lecture des tâches.
    const wantsCase = reads.some((read) => read.caseQuery);
    const [policySnap, casesSnap] = await Promise.all([
      adminDb.doc(`users/${uid}/settings/reminders`).get(),
      wantsCase ? adminDb.collection(`users/${uid}/cases`).get() : Promise.resolve(null),
    ]);
    const policy = normalizeReminderPolicy(policySnap.exists ? policySnap.data() : null);
    const cases: Case[] =
      casesSnap?.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as Case) ?? [];

    const todayKey = getTodayKey();
    const batch = adminDb.batch();
    const written: { title: string; caseTitle: string | null; dueDate: string | null; starred: boolean }[] = [];

    for (const read of reads) {
      const matchedCase = resolveCaptureCase(cases, read.caseQuery);
      const dueDate = resolveCaptureDue(read.dueQuery);

      let parent: Item | null = null;
      if (read.parentQuery && matchedCase) {
        const itemsSnap = await adminDb
          .collection(`users/${uid}/items`)
          .where("caseId", "==", matchedCase.id)
          .get();
        const items = itemsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as Item);
        parent = resolveCaptureParent(items, matchedCase.id, read.parentQuery);
      }

      // Un jeton qu'on n'a pas su trancher revient dans le titre : le mémo
      // arrive quand même, et le doute se voit.
      let title = read.title;
      if (!matchedCase) title = restoreQuery(title, "#", read.caseQuery);
      if (!dueDate) title = restoreQuery(title, "@", read.dueQuery);
      if (!parent) title = restoreQuery(title, ">", read.parentQuery);
      if (!title) continue;

      const payload = buildQuickMemo(
        {
          title,
          caseId: matchedCase?.id ?? null,
          parentItemId: parent?.id ?? null,
          dueDate,
          starred: read.starred,
        },
        { todayKey, policy }
      );
      batch.set(adminDb.collection(`users/${uid}/floatingTasks`).doc(), {
        ...payload,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      written.push({
        title,
        caseTitle: matchedCase?.title ?? null,
        dueDate,
        starred: read.starred,
      });
    }

    if (written.length === 0) return refuse("Rien à noter.", 400);
    await batch.commit();

    // Le raccourci n'affiche qu'une ligne : elle doit dire ce qui a été retenu,
    // dossier et échéance compris — c'est le seul accusé de réception qu'aura
    // le notaire, et ce qui lui permet de repérer un jeton mal compris.
    const single = written[0];
    const details = [single.caseTitle, single.dueDate ? `éch. ${formatDateFR(single.dueDate)}` : null]
      .filter(Boolean)
      .join(" · ");
    const message =
      written.length === 1
        ? `Noté : ${single.title}${details ? ` (${details})` : ""}`
        : `${written.length} mémos notés dans Ma journée`;

    return NextResponse.json({ ok: true, created: written.length, message, memos: written });
  } catch (err: unknown) {
    console.error("[api/memo]", err);
    return refuse("Le mémo n'a pas pu être écrit.", 500);
  }
}

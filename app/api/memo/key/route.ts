// Créer, remplacer et révoquer la clé du raccourci.
//
// La clé ouvre l'écriture d'un mémo depuis un iPhone : elle ne peut donc être
// délivrée qu'à quelqu'un qui est **déjà** connecté à Henri — d'où le jeton
// Firebase exigé ici, quand la route d'écriture (`/api/memo`), elle, ne connaît
// que la clé.
//
// Deux documents et non un, pour deux lectures différentes :
//
// - `users/{uid}/settings/shortcut` : la clé de l'utilisateur, telle que les
//   Préférences l'affichent — c'est aussi elle qui fait foi ;
// - `shortcutKeys/{clé}` : le chemin inverse, clé → utilisateur, pour que la
//   route d'écriture retrouve son propriétaire en une lecture, sans parcourir
//   les comptes.
//
// Régénérer efface l'ancien couple : une clé remplacée cesse d'écrire
// immédiatement, sans quoi « régénérer » ne protégerait de rien.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { generateShortcutKey, isShortcutKey } from "@/lib/shortcutKey";

/** L'utilisateur connecté derrière la requête, `null` sinon. */
async function requireUid(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    return (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

const settingsRef = (uid: string) => adminDb.doc(`users/${uid}/settings/shortcut`);

/** Retire le couple clé → utilisateur en cours, s'il y en a un. */
async function dropCurrentKey(uid: string) {
  const snap = await settingsRef(uid).get();
  const previous = snap.exists ? snap.data()?.key : null;
  if (isShortcutKey(previous)) await adminDb.doc(`shortcutKeys/${previous}`).delete();
}

/** Crée la clé, ou la remplace. */
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    await dropCurrentKey(uid);
    const key = generateShortcutKey();
    const createdAt = new Date().toISOString();
    await adminDb.doc(`shortcutKeys/${key}`).set({ uid, createdAt });
    await settingsRef(uid).set({ key, createdAt }, { merge: true });
    return NextResponse.json({ key, createdAt });
  } catch (err: unknown) {
    console.error("[api/memo/key POST]", err);
    return NextResponse.json({ error: "La clé n'a pas pu être créée." }, { status: 500 });
  }
}

/** Révoque la clé : le raccourci cesse d'écrire. */
export async function DELETE(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    await dropCurrentKey(uid);
    await settingsRef(uid).delete();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[api/memo/key DELETE]", err);
    return NextResponse.json({ error: "La clé n'a pas pu être révoquée." }, { status: 500 });
  }
}

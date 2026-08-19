// Le lien iCloud du raccourci de l'office : le lire, le poser, le retirer.
//
// Un seul lien pour toute l'étude — le raccourci est le même pour chacun, seule
// la clé change, et elle ne voyage pas dedans (voir `src/lib/shortcutLink.ts`).
// Il vit donc hors des comptes, dans `config/shortcut`, et non sous
// `users/{uid}`.
//
// Deux autorisations différentes, parce que ce ne sont pas deux gestes de même
// portée :
//
// - **le lire** demande seulement d'être connecté : c'est ce que le bouton
//   « Ajouter le raccourci à mon iPhone » va chercher, et le lien n'est pas un
//   secret — il est public pour qui l'a ;
// - **l'écrire** est réservé à l'administrateur. Le lien commande un bouton
//   affiché à tout le monde : qui en dispose choisit ce que les iPhones de
//   l'office installent.
//
// La forme du lien est vérifiée ici **et** à l'affichage : une adresse rangée
// avant la vérification serait une adresse à vérifier à chaque lecture.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/superAdminServer";
import { normalizeShortcutLink } from "@/lib/shortcutLink";

const linkRef = () => adminDb.doc("config/shortcut");

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

/** Le lien publié par l'office, ou `null` s'il n'y en a pas encore. */
export async function GET(req: NextRequest) {
  if (!(await requireUid(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const snap = await linkRef().get();
    const data = snap.exists ? snap.data() : null;
    return NextResponse.json({
      url: normalizeShortcutLink(data?.icloudUrl),
      updatedAt: (data?.updatedAt as string | undefined) ?? null,
    });
  } catch (err: unknown) {
    console.error("[api/memo/lien GET]", err);
    return NextResponse.json({ error: "Le lien n'a pas pu être lu." }, { status: 500 });
  }
}

/** Publie le lien, ou le remplace. */
export async function PUT(req: NextRequest) {
  const admin = await requireSuperAdmin(req);
  if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const url = normalizeShortcutLink(body.url);
  if (!url) {
    return NextResponse.json(
      { error: "Ce n'est pas un lien iCloud de raccourci (https://www.icloud.com/shortcuts/…)." },
      { status: 400 }
    );
  }

  try {
    const updatedAt = new Date().toISOString();
    await linkRef().set({ icloudUrl: url, updatedAt, updatedBy: admin }, { merge: true });
    return NextResponse.json({ url, updatedAt });
  } catch (err: unknown) {
    console.error("[api/memo/lien PUT]", err);
    return NextResponse.json({ error: "Le lien n'a pas pu être enregistré." }, { status: 500 });
  }
}

/** Retire le lien : le bouton d'installation disparaît pour tout le monde. */
export async function DELETE(req: NextRequest) {
  if (!(await requireSuperAdmin(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    await linkRef().delete();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[api/memo/lien DELETE]", err);
    return NextResponse.json({ error: "Le lien n'a pas pu être retiré." }, { status: 500 });
  }
}

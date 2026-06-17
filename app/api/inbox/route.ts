export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// Domaine de réception (ex. "in.henri.app"). Configuré côté hébergeur.
const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "";

// Normalise un alias d'adresse : minuscules, sans accents, [a-z0-9._-].
function sanitizeAlias(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32);
}

async function authFromRequest(
  req: NextRequest
): Promise<{ uid: string; email: string | null } | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

// Réserve un alias pour uid (atomique), en libérant l'ancien si besoin.
async function claimAlias(
  uid: string,
  desired: string,
  previous: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const aliasRef = adminDb.doc(`inboxAliases/${desired}`);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(aliasRef);
    if (snap.exists && snap.get("uid") !== uid) {
      return { ok: false, reason: "taken" };
    }
    const now = new Date().toISOString();
    tx.set(aliasRef, { uid, updatedAt: now });
    if (previous && previous !== desired) {
      tx.delete(adminDb.doc(`inboxAliases/${previous}`));
    }
    tx.set(
      adminDb.doc(`users/${uid}/meta/inbox`),
      { alias: desired, updatedAt: now },
      { merge: true }
    );
    return { ok: true };
  });
}

async function findFreeAlias(uid: string, base: string): Promise<string> {
  const candidate = base || `henri-${uid.slice(0, 6).toLowerCase()}`;
  for (let i = 0; i < 50; i++) {
    const tryAlias = i === 0 ? candidate : `${candidate}-${i + 1}`;
    const snap = await adminDb.doc(`inboxAliases/${tryAlias}`).get();
    if (!snap.exists || snap.get("uid") === uid) return tryAlias;
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

function addressOf(alias: string): string | null {
  return INBOUND_DOMAIN ? `${alias}@${INBOUND_DOMAIN}` : null;
}

// GET : renvoie l'adresse mémo de l'utilisateur (en la créant si absente).
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const metaRef = adminDb.doc(`users/${auth.uid}/meta/inbox`);
  const meta = await metaRef.get();
  let alias = meta.exists ? (meta.get("alias") as string | undefined) : undefined;

  if (!alias) {
    const base = sanitizeAlias(auth.email?.split("@")[0] || "");
    alias = await findFreeAlias(auth.uid, base);
    await claimAlias(auth.uid, alias, null);
  }

  return NextResponse.json({ alias, domain: INBOUND_DOMAIN || null, address: addressOf(alias) });
}

// POST { alias } : personnalise l'adresse mémo (unicité garantie).
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const desired = sanitizeAlias(String(body?.alias ?? ""));
  if (desired.length < 3) {
    return NextResponse.json(
      { error: "invalid", message: "Au moins 3 caractères (lettres, chiffres, . _ -)." },
      { status: 400 }
    );
  }

  const meta = await adminDb.doc(`users/${auth.uid}/meta/inbox`).get();
  const previous = meta.exists ? ((meta.get("alias") as string) ?? null) : null;

  const res = await claimAlias(auth.uid, desired, previous);
  if (!res.ok) {
    return NextResponse.json(
      { error: "taken", message: "Cette adresse est déjà utilisée." },
      { status: 409 }
    );
  }

  return NextResponse.json({ alias: desired, domain: INBOUND_DOMAIN || null, address: addressOf(desired) });
}

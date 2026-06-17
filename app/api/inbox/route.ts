export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// Domaine de réception (ex. "in.henri.tagot.fr"). Surchargé par l'env.
const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "in.henri.tagot.fr";

// Mots juridiques notariaux (ASCII, un seul token) servant de base mémorisable.
const LEGAL_WORDS = [
  "usufruit", "tontine", "servitude", "hypotheque", "succession", "donation",
  "legataire", "testament", "indivision", "mitoyennete", "emphyteose", "viager",
  "licitation", "soulte", "quotite", "saisine", "mandat", "procuration",
  "caution", "nantissement", "bail", "rente", "dotation", "partage",
  "codicille", "heritier", "minute", "grosse", "comparant", "vacation",
  "fideicommis", "antichrese", "preciput", "douaire", "legs", "rapport",
  "mutation", "prescription", "quittance", "compromis", "mandataire", "clause",
  "mainlevee", "gage", "aubaine",
];

const SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randInt(n: number): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] % n;
}

// Génère un alias "mot-juridique" + 4 caractères alphanumériques, ex. "usufruit-h56c".
function randomAlias(): string {
  const word = LEGAL_WORDS[randInt(LEGAL_WORDS.length)];
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += SUFFIX_CHARS[randInt(SUFFIX_CHARS.length)];
  return `${word}-${suffix}`;
}

// Normalise un alias personnalisé : minuscules, sans accents, [a-z0-9._-].
function sanitizeAlias(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 40);
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

// Cherche un alias aléatoire libre (le suffixe aléatoire rend les collisions rares).
async function freeRandomAlias(uid: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = randomAlias();
    const snap = await adminDb.doc(`inboxAliases/${candidate}`).get();
    if (!snap.exists || snap.get("uid") === uid) return candidate;
  }
  // Repli quasi impossible : suffixe plus long.
  return `${randomAlias()}${randInt(36).toString(36)}`;
}

function addressOf(alias: string): string | null {
  return INBOUND_DOMAIN ? `${alias}@${INBOUND_DOMAIN}` : null;
}

async function previousAlias(uid: string): Promise<string | null> {
  const meta = await adminDb.doc(`users/${uid}/meta/inbox`).get();
  return meta.exists ? ((meta.get("alias") as string) ?? null) : null;
}

// GET : renvoie l'adresse mémo de l'utilisateur (en la créant si absente).
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let alias = await previousAlias(auth.uid);
  if (!alias) {
    alias = await freeRandomAlias(auth.uid);
    await claimAlias(auth.uid, alias, null);
  }

  return NextResponse.json({ alias, domain: INBOUND_DOMAIN || null, address: addressOf(alias) });
}

// POST : { regenerate: true } → nouvelle adresse aléatoire ; { alias } → personnalisation.
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const previous = await previousAlias(auth.uid);

  if (body?.regenerate) {
    const next = await freeRandomAlias(auth.uid);
    await claimAlias(auth.uid, next, previous);
    return NextResponse.json({ alias: next, domain: INBOUND_DOMAIN || null, address: addressOf(next) });
  }

  const desired = sanitizeAlias(String(body?.alias ?? ""));
  if (desired.length < 3) {
    return NextResponse.json(
      { error: "invalid", message: "Au moins 3 caractères (lettres, chiffres, . _ -)." },
      { status: 400 }
    );
  }

  const res = await claimAlias(auth.uid, desired, previous);
  if (!res.ok) {
    return NextResponse.json(
      { error: "taken", message: "Cette adresse est déjà utilisée." },
      { status: 409 }
    );
  }

  return NextResponse.json({ alias: desired, domain: INBOUND_DOMAIN || null, address: addressOf(desired) });
}

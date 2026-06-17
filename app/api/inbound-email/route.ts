export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// Webhook de réception d'emails (ex. Brevo Inbound Parsing).
// Un email envoyé à <alias>@INBOUND_EMAIL_DOMAIN crée un mémo (FloatingTask)
// dans le compte de l'utilisateur propriétaire de cet alias.

const INBOUND_DOMAIN = (process.env.INBOUND_EMAIL_DOMAIN || "").toLowerCase();
const WEBHOOK_SECRET = process.env.INBOUND_WEBHOOK_SECRET || "";

// YYYY-MM-DD dans le fuseau de l'app (cohérent avec getDateKey côté client).
function parisDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

type InboundRecipient = { Address?: string; Name?: string };
type InboundItem = {
  Uuid?: string | string[];
  MessageId?: string;
  From?: { Address?: string; Name?: string };
  To?: InboundRecipient[];
  Subject?: string;
  RawTextBody?: string;
  RawHtmlBody?: string;
  ExtractedMarkdownMessage?: string;
};

// Récupère l'alias (partie locale) du destinataire correspondant à notre domaine.
function aliasFromRecipients(to: InboundRecipient[] | undefined): string | null {
  if (!to || !INBOUND_DOMAIN) return null;
  for (const r of to) {
    const addr = (r.Address || "").toLowerCase().trim();
    const at = addr.lastIndexOf("@");
    if (at < 1) continue;
    const local = addr.slice(0, at);
    const domain = addr.slice(at + 1);
    if (domain === INBOUND_DOMAIN && local) {
      return local.split("+")[0]; // ignore le +suffixe éventuel
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  // Authentification du webhook par secret partagé (query ?token= ou en-tête).
  const token =
    req.nextUrl.searchParams.get("token") || req.headers.get("x-inbound-token") || "";
  if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const items: InboundItem[] = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : payload
        ? [payload]
        : [];

  let created = 0;

  for (const item of items) {
    const alias = aliasFromRecipients(item.To);
    if (!alias) continue;

    const aliasSnap = await adminDb.doc(`inboxAliases/${alias}`).get();
    if (!aliasSnap.exists) continue;
    const uid = aliasSnap.get("uid") as string;

    // Déduplication (les webhooks peuvent être rejoués).
    const rawUuid = Array.isArray(item.Uuid) ? item.Uuid[0] : item.Uuid || item.MessageId;
    if (rawUuid) {
      const dedupId = encodeURIComponent(rawUuid).slice(0, 256);
      const dedupRef = adminDb.doc(`users/${uid}/inboundEmails/${dedupId}`);
      const dedup = await dedupRef.get();
      if (dedup.exists) continue;
      await dedupRef.set({ at: new Date().toISOString() });
    }

    const subject = (item.Subject || "").trim() || "(sans objet)";
    const note =
      (item.RawTextBody || item.ExtractedMarkdownMessage || "").trim().slice(0, 5000) || null;
    const now = new Date().toISOString();

    await adminDb.collection(`users/${uid}/floatingTasks`).add({
      dateKey: parisDateKey(),
      title: subject.slice(0, 300),
      status: "Créé",
      note,
      starred: false,
      source: "email",
      fromEmail: item.From?.Address ?? null,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }

  return NextResponse.json({ ok: true, created });
}

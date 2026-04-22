export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

const ADMIN_UID = "ByHcIefOjWVdQBcikq5oZtJGGZA2";
const BASE_URL = "https://henri.tagot.fr";

async function checkAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid === ADMIN_UID ? decoded : null;
  } catch { return null; }
}

async function sendBrevoEmail({ to, toName, subject, html, text }: {
  to: string; toName: string; subject: string; html: string; text: string;
}) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Grégoire TAGOT", email: "noreply@mail.tagot.fr" },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
}

export async function POST(req: NextRequest) {
  const { token, email, name, authToken } = await req.json();

  if (authToken) {
    const admin = await checkAdmin(new NextRequest(req.url, {
      headers: { authorization: `Bearer ${authToken}` }
    }));
    if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const link = `${BASE_URL}/invite/${token}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:40px 20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
<tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f59e0b;height:4px;font-size:0;"> </td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:44px 52px 40px;">
    <img src="https://i.imgur.com/MKLZSiT.jpeg" alt="Henri" width="120" style="display:block;margin-bottom:36px;height:auto;" />
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#f59e0b;letter-spacing:0.1em;text-transform:uppercase;">Invitation</p>
    <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">Bienvenue dans le programme Alpha</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.8;">Vous allez bientôt accéder à <strong style="color:#111827;">Henri</strong> en avant-première — une application de gestion de dossiers conçue pour les professionnels du notariat.</p>
    <p style="margin:0 0 36px;font-size:15px;color:#4b5563;line-height:1.8;">Cliquez ci-dessous pour créer votre compte. Ce lien est personnel et valable <strong style="color:#111827;">7 jours</strong>.</p>
    <table cellpadding="0" cellspacing="0">
      <tr><td style="background:#111827;border-radius:8px;">
        <a href="${link}" style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,Arial,sans-serif;">Créer mon compte &rarr;</a>
      </td></tr>
    </table>
    <p style="margin:36px 0 0;font-size:11px;color:#9ca3af;line-height:1.8;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
      <span style="color:#374151;word-break:break-all;">${link}</span>
    </p>
  </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:24px 52px;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.7;">
        Grégoire TAGOT · 2 rue Dante, 75005 Paris · gregoire@tagot.fr<br>
        Vous recevez cet email car vous avez candidaté au programme Alpha d'Henri.
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `Invitation Henri — Programme Alpha

Vous allez bientôt accéder à Henri en avant-première — une application de gestion de dossiers conçue pour les professionnels du notariat.

Créez votre compte en copiant ce lien dans votre navigateur (valable 7 jours) :

${link}

---
Grégoire TAGOT · 2 rue Dante, 75005 Paris · gregoire@tagot.fr`;

  try {
    await sendBrevoEmail({ to: email, toName: name ?? email, subject: "Votre invitation à rejoindre Henri", html, text });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

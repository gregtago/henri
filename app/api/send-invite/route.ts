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

async function sendBrevoEmail({ to, toName, subject, html }: {
  to: string; toName: string; subject: string; html: string;
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
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
}

export async function POST(req: NextRequest) {
  const { token, email, name, authToken } = await req.json();

  // Envoi automatique depuis createInvitation (pas besoin d'auth admin)
  // ou envoi manuel depuis /admin (auth admin requise)
  if (authToken) {
    const admin = await checkAdmin(new NextRequest(req.url, {
      headers: { authorization: `Bearer ${authToken}` }
    }));
    if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const link = `${BASE_URL}/invite/${token}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header jaune -->
        <tr><td style="background:#f59e0b;border-radius:16px 16px 0 0;padding:36px 48px;text-align:center;">
          <img src="https://henri.tagot.fr/logo-henri-new.png" alt="Henri" style="height:52px;filter:brightness(0);margin-bottom:4px;" />
          <p style="margin:8px 0 0;font-size:13px;color:#1c1917;letter-spacing:0.05em;font-family:Georgia,serif;">VERSION ALPHA</p>
        </td></tr>

        <!-- Corps blanc -->
        <tr><td style="background:#ffffff;padding:44px 48px;">
          <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#111827;line-height:1.2;">
            Votre invitation à rejoindre Henri
          </h1>
          <p style="margin:0 0 28px;font-size:14px;color:#9ca3af;">Une nouvelle manière de piloter vos dossiers.</p>

          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.75;">
            ${name ? `Bonjour <strong>${name}</strong>,<br><br>` : ""}Vous avez été sélectionné(e) pour participer au programme <strong>Alpha d'Henri</strong>, une application de gestion de dossiers conçue spécifiquement pour les professionnels du notariat.
          </p>
          <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:1.75;">
            Créez votre compte en cliquant sur le bouton ci-dessous. Ce lien est personnel et valable <strong>7 jours</strong>.
          </p>

          <!-- Bouton -->
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center" style="padding:0 0 36px;">
              <a href="${link}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:700;font-family:Georgia,serif;letter-spacing:0.02em;">
                Créer mon compte →
              </a>
            </td></tr>
          </table>

          <!-- Séparateur -->
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 28px;" />

          <!-- Ce qu'est Henri -->
          <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#111827;">Qu'est-ce qu'Henri ?</p>
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="48%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 18px;vertical-align:top;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e;">📁 Tous vos dossiers</p>
                <p style="margin:0;font-size:12px;color:#78716c;line-height:1.6;">Organisez vos dossiers, tâches et sous-tâches en un seul endroit.</p>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 18px;vertical-align:top;">
                <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e;">☀ Ma journée</p>
                <p style="margin:0;font-size:12px;color:#78716c;line-height:1.6;">Extrayez chaque matin les tâches prioritaires et concentrez-vous.</p>
              </td>
            </tr>
          </table>

          <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
            <a href="${link}" style="color:#d97706;word-break:break-all;">${link}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#111827;border-radius:0 0 16px 16px;padding:24px 48px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Henri — Programme Alpha</p>
          <p style="margin:0;font-size:11px;color:#6b7280;">Grégoire TAGOT · 2 rue Dante, 75005 Paris · <a href="mailto:gregoire@tagot.fr" style="color:#6b7280;">gregoire@tagot.fr</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await sendBrevoEmail({ to: email, toName: name ?? email, subject: "Votre invitation à rejoindre Henri", html });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

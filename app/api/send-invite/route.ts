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

  const html = `
    <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <img src="${BASE_URL}/logo-henri-new.png" alt="Henri" style="height: 40px; margin-bottom: 32px;" />
      <h2 style="font-size: 22px; color: #111827; margin-bottom: 16px;">
        Votre invitation à rejoindre Henri
      </h2>
      <p style="font-size: 15px; color: #374151; line-height: 1.7; margin-bottom: 16px;">
        ${name ? `Bonjour ${name},<br><br>` : ""}Vous avez été invité(e) à accéder à <strong>Henri</strong>, une nouvelle application de gestion de dossiers conçue pour les professionnels du notariat.
      </p>
      <p style="font-size: 15px; color: #374151; line-height: 1.7; margin-bottom: 32px;">
        Cliquez sur le bouton ci-dessous pour créer votre compte. Ce lien est valable <strong>7 jours</strong>.
      </p>
      <a href="${link}" style="display: inline-block; background: #111827; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 600; font-family: Georgia, serif;">
        Créer mon compte →
      </a>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 32px; line-height: 1.6;">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
        <a href="${link}" style="color: #6b7280;">${link}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
      <p style="font-size: 11px; color: #9ca3af;">
        Henri — Version Alpha · Grégoire TAGOT · 2 rue Dante, 75005 Paris
      </p>
    </div>
  `;

  try {
    await sendBrevoEmail({ to: email, toName: name ?? email, subject: "Votre invitation à rejoindre Henri", html });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

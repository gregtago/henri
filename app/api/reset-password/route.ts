export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sendResetEmail } from "@/lib/brevo";

/**
 * Route publique pour réinitialiser un mot de passe.
 *
 * Côté serveur :
 *  - Utilise Admin SDK pour générer le lien
 *  - Envoie l'email via Brevo (template Henri)
 *  - Réponse identique si l'email existe ou pas → pas d'oracle
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email manquant" }, { status: 400 });
    }
    const normalized = email.trim().toLowerCase();

    // Validation format
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    // Vérifier l'existence du compte SANS révéler à l'appelant
    try {
      const user = await adminAuth.getUserByEmail(normalized);
      if (user.email) {
        const resetLink = await adminAuth.generatePasswordResetLink(normalized);
        await sendResetEmail(normalized, resetLink);
      }
    } catch (err: any) {
      // user-not-found → on ignore silencieusement pour ne pas révéler l'absence
      if (err?.code !== "auth/user-not-found") {
        console.error("[reset-password] erreur génération/envoi:", err);
      }
    }

    // Réponse uniforme — succès même si compte inexistant
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[reset-password] erreur globale:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

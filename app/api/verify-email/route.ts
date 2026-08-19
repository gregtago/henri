// Envoyer à quelqu'un le lien qui confirme son adresse.
//
// Deux raisons de le faire nous-mêmes plutôt que de laisser Firebase envoyer
// le sien :
//
// - **c'est un courriel de l'Office** — même expéditeur, même gabarit que
//   l'invitation et la réinitialisation (`src/lib/brevo.ts`) ;
// - **la vérification d'adresse commande le reste.** Identity Platform refuse
//   d'inscrire un second facteur (TOTP) tant que l'adresse n'est pas vérifiée,
//   et pour une bonne raison : sans cela, on s'inscrirait avec l'adresse d'un
//   autre puis on le verrouillerait dehors avec son propre téléphone.
//
// **Le destinataire ne se demande pas, il se déduit.** L'adresse est celle du
// compte qui présente le jeton — jamais une adresse envoyée dans la requête.
// Sinon cette route deviendrait ce que `/api/send-invite` était ce matin : un
// moyen d'expédier du courrier depuis l'adresse de l'Office vers n'importe qui.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sendVerificationEmail } from "@/lib/brevo";

export async function POST(req: NextRequest) {
  const idToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!idToken) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { uid } = await adminAuth.verifyIdToken(idToken);
    const user = await adminAuth.getUser(uid);
    if (!user.email) return NextResponse.json({ error: "Ce compte n'a pas d'adresse." }, { status: 400 });
    // Déjà vérifiée : ne pas renvoyer un courriel pour rien, et le dire.
    if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

    const link = await adminAuth.generateEmailVerificationLink(user.email);
    await sendVerificationEmail(user.email, link);
    return NextResponse.json({ ok: true, alreadyVerified: false });
  } catch (err: unknown) {
    console.error("[api/verify-email]", err);
    return NextResponse.json({ error: "L'envoi a échoué." }, { status: 500 });
  }
}

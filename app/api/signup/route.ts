// L'inscription libre — réservée aux adresses du notariat.
//
// Elle ne crée **pas** de compte. Elle envoie une invitation, exactement celle
// que l'administrateur envoie à la main (`invitations.ts`), et c'est la
// personne qui reçoit le courriel qui crée son compte sur `/invite/[token]`.
// Deux verrous en sortent gratuitement :
//
// - **le domaine** dit que l'adresse appartient au notariat, et il est vérifié
//   ici, côté serveur — un formulaire se contourne, pas une route ;
// - **le courriel** dit que l'adresse appartient à celui qui s'inscrit. Saisir
//   l'adresse d'un confrère ne donne donc rien, sinon lui envoyer un courriel.
//
// La réponse ne dit jamais si un compte existe déjà : ce serait offrir à qui le
// demande la liste des notaires inscrits. En revanche elle dit franchement
// qu'un domaine n'est pas éligible — ce n'est pas un secret, et le taire
// laisserait quelqu'un attendre en vain un courriel qui ne viendra pas.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { sendInvitationEmail } from "@/lib/brevo";
import { buildInvitation, invitationLink } from "@/lib/invitations";
import { isEligibleSignupEmail, looksLikeEmail, SIGNUP_DOMAIN } from "@/lib/signupDomain";
import { randomUUID } from "crypto";

/** Deux demandes à la minute pour la même adresse ne servent qu'à l'inonder. */
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;

/** Une invitation encore valable a-t-elle été envoyée à l'instant ? */
const invitedRecently = async (email: string): Promise<boolean> => {
  const snap = await adminDb
    .collection("invitations")
    .where("email", "==", email)
    .where("status", "==", "pending")
    .get();
  const floor = Date.now() - RESEND_COOLDOWN_MS;
  return snap.docs.some((doc) => new Date(doc.data().createdAt ?? 0).getTime() > floor);
};

export async function POST(req: NextRequest) {
  let email = "";
  try {
    email = String((await req.json())?.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "Cette adresse ne ressemble pas à une adresse." }, { status: 400 });
  }
  if (!isEligibleSignupEmail(email)) {
    return NextResponse.json(
      { error: `L'inscription est réservée aux adresses professionnelles en ${SIGNUP_DOMAIN}.` },
      { status: 403 }
    );
  }

  try {
    // Compte déjà ouvert, ou lien tout juste envoyé : on ne fait rien, et on le
    // dit de la même façon que si l'on avait envoyé quelque chose.
    const known = await adminAuth.getUserByEmail(email).then(() => true).catch(() => false);
    if (known || (await invitedRecently(email))) return NextResponse.json({ ok: true });

    const token = randomUUID();
    await adminDb.doc(`invitations/${token}`).set({
      token,
      ...buildInvitation(email, { createdBy: "inscription-libre" }),
    });
    await sendInvitationEmail(email, null, invitationLink(token));
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[api/signup]", err);
    return NextResponse.json({ error: "L'inscription a échoué. Réessayez dans un instant." }, { status: 500 });
  }
}

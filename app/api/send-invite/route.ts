export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, verifySuperAdminToken } from "@/lib/superAdminServer";
import { sendInvitationEmail } from "@/lib/brevo";
import { invitationLink } from "@/lib/invitations";

export async function POST(req: NextRequest) {
  const { token, email, name, authToken } = await req.json();

  // Ce courriel part avec l'adresse d'expéditeur de l'Office : il faut un
  // administrateur derrière chaque envoi. La vérification était conditionnée à
  // la présence du champ `authToken` — donc contournable en l'omettant, ce qui
  // ouvrait l'envoi à n'importe qui. Sans preuve, plus d'envoi.
  const admin = (await verifySuperAdminToken(authToken)) ?? (await requireSuperAdmin(req));
  if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!token || !email) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });

  try {
    await sendInvitationEmail(email, name ?? null, invitationLink(token));
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[api/send-invite]", err);
    return NextResponse.json({ error: "L'envoi a échoué." }, { status: 500 });
  }
}

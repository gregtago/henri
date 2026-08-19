export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/superAdminServer";

export async function POST(req: NextRequest) {
  if (!(await requireSuperAdmin(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const usersSnap = await adminDb.collection("users").listDocuments();
  let updated = 0;

  for (const userRef of usersSnap) {
    const itemsSnap = await userRef.collection("items").where("status", "==", "Créée").get();
    for (const doc of itemsSnap.docs) {
      await doc.ref.update({ status: "Créé" });
      updated++;
    }
    const floatingSnap = await userRef.collection("floatingTasks").where("status", "==", "Créée").get();
    for (const doc of floatingSnap.docs) {
      await doc.ref.update({ status: "Créé" });
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated });
}

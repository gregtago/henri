export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const usersSnap = await adminDb.collection("users").listDocuments();
  let totalDeleted = 0;

  for (const userRef of usersSnap) {
    const casesSnap = await userRef.collection("cases")
      .where("archived", "==", true)
      .where("archivedAt", "<=", sixMonthsAgo.toISOString())
      .get();

    for (const caseDoc of casesSnap.docs) {
      const itemsSnap = await userRef.collection("items")
        .where("caseId", "==", caseDoc.id).get();
      const batch = adminDb.batch();
      itemsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(caseDoc.ref);
      await batch.commit();
      totalDeleted++;
    }
  }

  return NextResponse.json({ success: true, deleted: totalDeleted });
}

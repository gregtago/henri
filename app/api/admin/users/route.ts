export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isSuperAdminUid, requireSuperAdmin } from "@/lib/superAdminServer";

async function getLastActivity(uid: string): Promise<string | null> {
  // Chercher le document le plus récemment modifié parmi cases, items, floatingTasks
  const collections = ["cases", "items", "floatingTasks"];
  let latest: string | null = null;
  await Promise.all(collections.map(async (col) => {
    try {
      const snap = await adminDb
        .collection(`users/${uid}/${col}`)
        .orderBy("updatedAt", "desc")
        .limit(1)
        .get();
      if (!snap.empty) {
        const val = snap.docs[0].data().updatedAt as string;
        if (val && (!latest || val > latest)) latest = val;
      }
    } catch {}
  }));
  return latest;
}

export async function GET(req: NextRequest) {
  if (!(await requireSuperAdmin(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const listResult = await adminAuth.listUsers(1000);

    const users = await Promise.all(
      listResult.users.map(async (u) => {
        let casesCount = 0;
        let itemsCount = 0;
        let floatingCount = 0;
        let doneCount = 0;
        let lastActivity: string | null = null;
        try {
          const [casesSnap, itemsSnap, floatingSnap, doneSnap] = await Promise.all([
            adminDb.collection(`users/${u.uid}/cases`).count().get(),
            adminDb.collection(`users/${u.uid}/items`).count().get(),
            adminDb.collection(`users/${u.uid}/floatingTasks`).count().get(),
            adminDb.collection(`users/${u.uid}/items`).where("status", "==", "Traité").count().get(),
          ]);
          casesCount = casesSnap.data().count;
          itemsCount = itemsSnap.data().count;
          floatingCount = floatingSnap.data().count;
          doneCount = doneSnap.data().count;
          lastActivity = await getLastActivity(u.uid);
        } catch {}

        return {
          uid: u.uid,
          email: u.email ?? "",
          // L'écran ne peut pas lire la liste des administrateurs (les règles
          // ne laissent voir que sa propre ligne) : c'est ici qu'on la dit.
          isSuperAdmin: await isSuperAdminUid(u.uid),
          disabled: u.disabled,
          createdAt: u.metadata.creationTime,
          lastSignIn: u.metadata.lastSignInTime,
          lastActivity,
          casesCount,
          itemsCount,
          floatingCount,
          doneCount,
        };
      })
    );

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

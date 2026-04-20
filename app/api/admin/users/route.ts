export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const ADMIN_UID = "ByHcIefOjWVdQBcikq5oZtJGGZA2";

async function checkAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid === ADMIN_UID ? decoded : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    // Récupérer tous les users Auth
    const listResult = await adminAuth.listUsers(1000);
    
    // Récupérer les stats Firestore pour chaque user
    const users = await Promise.all(
      listResult.users.map(async (u) => {
        let casesCount = 0;
        let itemsCount = 0;
        let lastActivity: string | null = null;
        try {
          const casesSnap = await adminDb.collection(`users/${u.uid}/cases`).count().get();
          const itemsSnap = await adminDb.collection(`users/${u.uid}/items`).count().get();
          casesCount = casesSnap.data().count;
          itemsCount = itemsSnap.data().count;
        } catch {}
        return {
          uid: u.uid,
          email: u.email ?? "",
          displayName: u.displayName ?? "",
          disabled: u.disabled,
          createdAt: u.metadata.creationTime,
          lastSignIn: u.metadata.lastSignInTime,
          casesCount,
          itemsCount,
        };
      })
    );

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

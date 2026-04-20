import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

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

export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { uid, action } = await req.json();
  if (!uid || !action) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  if (uid === ADMIN_UID) return NextResponse.json({ error: "Impossible d'agir sur le superadmin" }, { status: 403 });

  try {
    switch (action) {
      case "disable":
        await adminAuth.updateUser(uid, { disabled: true });
        return NextResponse.json({ success: true, message: "Compte désactivé" });

      case "enable":
        await adminAuth.updateUser(uid, { disabled: false });
        return NextResponse.json({ success: true, message: "Compte réactivé" });

      case "delete":
        await adminAuth.deleteUser(uid);
        return NextResponse.json({ success: true, message: "Compte supprimé" });

      case "resetPassword":
        const user = await adminAuth.getUser(uid);
        if (!user.email) return NextResponse.json({ error: "Pas d'email" }, { status: 400 });
        const link = await adminAuth.generatePasswordResetLink(user.email);
        return NextResponse.json({ success: true, link });

      default:
        return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

"use client";

import AuthGate from "@/components/AuthGate";
import CalendarShell from "@/components/CalendarShell";

export default function CalendrierPage() {
  return <AuthGate>{(user) => <CalendarShell user={user} />}</AuthGate>;
}

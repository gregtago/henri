"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import AuthPanel from "@/components/AuthPanel";
import AppShell from "@/components/AppShell";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!loading && user && isMobile) router.replace("/my-day");
  }, [loading, user, isMobile, router]);

  if (loading || (user && isMobile)) return (
    <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
      Chargement...
    </div>
  );

  return user ? <AppShell /> : <AuthPanel />;
}

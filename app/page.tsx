"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import AuthPanel from "@/components/AuthPanel";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Chargement...
      </div>
    );
  }

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

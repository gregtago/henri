"use client";

// La porte, en un seul endroit.
//
// Mes dossiers, Ma journée et le Calendrier refaisaient chacun le même trajet :
// attendre Firebase, montrer la connexion, puis l'application. Trois copies du
// même geste, donc trois endroits où oublier une marche — et il vient de s'en
// ajouter deux, qui ne sont pas facultatives :
//
// 1. **l'adresse se confirme** avant d'entrer (`VerifyEmailGate`) ;
// 2. **le second facteur se propose** ensuite, avec son échéance
//    (`MfaSuggestion`), sans jamais barrer la route.
//
// Elles vivent ici, une fois, pour que toutes les portes de l'application se
// ferment de la même façon. Ce qui est derrière ne se monte pas tant que le
// trajet n'est pas fini : rien ne se peint à moitié, aucun abonnement
// Firestore ne s'ouvre pour un compte qui n'entrera pas.

import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { auth } from "@/lib/firebase";
import { hasSecondFactor } from "@/lib/mfa";
import { mfaStanding } from "@/lib/mfaPolicy";
import { readLastNudge, shouldSuggestMfa, writeLastNudge } from "@/lib/mfaNudge";
import AuthPanel from "@/components/AuthPanel";
import LoadingScreen from "@/components/LoadingScreen";
import MfaSuggestion from "@/components/MfaSuggestion";
import VerifyEmailGate from "@/components/VerifyEmailGate";

export default function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // `user.reload()` modifie l'objet sans en créer un nouveau : React ne voit
  // rien. Ce compteur est le signal — on le pousse, le rendu relit l'objet.
  const [tick, setTick] = useState(0);
  // La proposition écartée ne revient pas avant le prochain démarrage : c'est
  // `mfaNudge` qui dira alors s'il est temps.
  const [nudgeDone, setNudgeDone] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleVerified = useCallback(() => setTick((n) => n + 1), []);

  const handleLater = useCallback(() => {
    writeLastNudge();
    setNudgeDone(true);
  }, []);

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthPanel />;

  // `tick` n'est lu que pour que ce rendu dépende de lui : c'est ce qui fait
  // relire `emailVerified` après un `reload()`.
  void tick;
  if (!user.emailVerified) return <VerifyEmailGate user={user} onVerified={handleVerified} />;

  const standing = mfaStanding({
    enrolled: hasSecondFactor(user),
    creationTime: user.metadata?.creationTime,
  });
  if (!nudgeDone && shouldSuggestMfa({ standing, lastShown: readLastNudge() })) {
    return <MfaSuggestion standing={standing} onLater={handleLater} />;
  }

  return <>{children(user)}</>;
}

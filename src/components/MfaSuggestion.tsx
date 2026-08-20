"use client";

// Proposer le second facteur, en disant depuis quand il est attendu.
//
// La politique (`mfaPolicy.ts`) donne à chaque compte sa propre échéance et,
// tant que `enforced` est faux, se contente de l'annoncer. L'annoncer dans un
// onglet des Préférences, c'est ne l'annoncer qu'à ceux qui vont l'y lire —
// c'est-à-dire à ceux qui s'équiperaient de toute façon. Le jour dit, les
// autres découvriraient une porte fermée.
//
// Cet écran vient donc au-devant, une fois l'adresse confirmée, et il porte la
// seule chose qui rende la demande recevable : **la date**, et ce qu'il reste
// avant elle. « Plus tard » est un vrai bouton, qui entre dans l'application —
// rien ici ne bloque. C'est `mfaNudge.ts` qui décide du rythme auquel l'écran
// revient : espacé tant qu'il reste des mois, quotidien la dernière semaine,
// à chaque ouverture une fois la date passée.

import { useRouter } from "next/navigation";
import type { MfaStanding } from "@/lib/mfaPolicy";

export default function MfaSuggestion({ standing, onLater }: { standing: MfaStanding; onLater: () => void }) {
  const router = useRouter();
  // Seuls ces deux états s'affichent — le parent ne monte pas l'écran pour les
  // autres, mais le composant ne suppose rien de ce qu'on lui donne.
  if (standing.state !== "pending" && standing.state !== "due") return null;

  const when = standing.deadline.toLocaleDateString("fr-FR");
  const btnPrimary = "w-full font-[inherit] text-[13.5px] bg-tx text-bg border-none rounded py-2 cursor-pointer hover:opacity-90 transition-opacity";
  const btnSecondary = "w-full font-[inherit] text-[13.5px] bg-bg border border-border text-tx-2 rounded py-2 cursor-pointer hover:bg-bg-hover hover:text-tx transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8" style={{ background: "var(--text)" }}>
      <div className="w-full max-w-sm bg-bg rounded-[20px] shadow-lg p-7 space-y-5">

        <div className="flex flex-col items-center text-center space-y-2 pb-1">
          <img src="/logo-henri-new.png" alt="Henri" style={{ width: "200px", height: "auto" }} />
          <p className="text-[13.5px] text-tx-3 leading-snug">Un second code, en plus du mot de passe.</p>
        </div>

        <div className="space-y-2.5">
          <p className="text-[13px] text-tx-2 leading-relaxed">
            Un mot de passe garde seul des dossiers couverts par le secret professionnel. La double authentification demande, en plus, un <strong className="text-tx">code à six chiffres</strong> lu sur votre téléphone. Un mot de passe deviné ne suffit alors plus à entrer.
          </p>

          {/* L'échéance : la seule chose qui rende la demande recevable. */}
          <div className="bg-bg-subtle border border-border rounded-lg px-4 py-3">
            {standing.state === "pending" ? (
              <p className="text-[12.5px] text-tx-2 leading-relaxed">
                Elle sera demandée sur votre compte à partir du <strong className="text-tx">{when}</strong> — dans {standing.daysLeft} jour{standing.daysLeft > 1 ? "s" : ""}.
              </p>
            ) : (
              <p className="text-[12.5px] text-tx-2 leading-relaxed">
                Elle est attendue sur votre compte depuis le <strong className="text-tx">{when}</strong>.
              </p>
            )}
            <p className="text-[11.5px] text-tx-3 leading-relaxed mt-1">
              Deux minutes suffisent, et il vaut mieux les prendre aujourd&apos;hui qu&apos;un matin de signature.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <button className={btnPrimary} onClick={() => { onLater(); router.push("/settings?tab=securite"); }}>
            Activer maintenant
          </button>
          <button className={btnSecondary} onClick={onLater}>
            Plus tard
          </button>
        </div>

        <p className="text-[11.5px] text-tx-3 leading-relaxed text-center">
          À tout moment dans Préférences → Sécurité.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

const FONCTIONS = [
  "Notaire libéral",
  "Notaire salarié",
  "Rédacteur",
];

const DOMAINES = [
  "Famille",
  "Immobilier",
  "VEFA",
  "Autre",
];

type Status = "idle" | "loading" | "done" | "error";

export default function BetaPage() {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [fonction, setFonction] = useState("");
  const [domaines, setDomaines] = useState<string[]>([]);
  const [crpcen, setCrpcen] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [rgpd, setRgpd] = useState(false);

  const toggleDomaine = (d: string) =>
    setDomaines(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const isValid =
    nom.trim() && prenom.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    fonction && domaines.length > 0 && rgpd;

  const handleSubmit = async () => {
    if (!isValid) return;
    setStatus("loading");
    try {
      await addDoc(collection(db, "betaRegistrations"), {
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim().toLowerCase(),
        fonction,
        domaines,
        crpcen: crpcen.trim(),
        createdAt: new Date().toISOString(),
        rgpdConsent: true,
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  const inputClass = "w-full font-[inherit] text-[14px] text-tx bg-white border border-[#d1d5db] rounded-lg px-4 py-2.5 outline-none focus:border-[#374151] focus:ring-2 focus:ring-[#374151]/10 transition-all placeholder:text-[#9ca3af]";
  const labelClass = "block text-[12px] font-semibold text-[#374151] uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-[#f9fafb]">

      {/* Header */}
      <header className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
        <img src="/logo-henri-new.png" alt="Henri" style={{ height: "32px", width: "auto" }} />
        <p className="text-[12px] text-[#6b7280]">Programme Alpha — Accès anticipé</p>
      </header>

      <div className="px-4 py-6 sm:py-12">
        <div className="w-full max-w-lg mx-auto">

          {status === "done" ? (
            /* ── CONFIRMATION ── */
            <div className="bg-white border border-[#e5e7eb] rounded-2xl shadow-sm p-10 text-center space-y-4">
              <div className="w-16 h-16 bg-[#f0fdf4] rounded-full flex items-center justify-center mx-auto">
                <span className="text-[28px]">✓</span>
              </div>
              <h2 className="text-[22px] font-semibold text-[#111827]">Candidature enregistrée !</h2>
              <p className="text-[14px] text-[#6b7280] leading-relaxed">
                Merci {prenom} pour votre intérêt pour Henri. Nous reviendrons vers vous prochainement avec un lien d'invitation.
              </p>
              <p className="text-[13px] text-[#9ca3af]">
                Un email de confirmation vous sera envoyé à <strong>{email}</strong>
              </p>
            </div>
          ) : (
            /* ── FORMULAIRE ── */
            <div className="bg-white border border-[#e5e7eb] rounded-2xl shadow-sm overflow-hidden">

              {/* En-tête */}
              <div className="bg-[#111827] px-5 py-6 sm:px-8 sm:py-8 text-white">
                <h1 className="text-[20px] sm:text-[24px] font-semibold mb-2">Rejoindre le programme Alpha</h1>
                <p className="text-[14px] text-[#9ca3af] leading-relaxed">
                  Henri est une nouvelle application de gestion de dossiers notariaux, conçue avec et pour les professionnels du notariat. Rejoignez le programme Alpha pour être parmi les premiers à la tester et contribuer à son développement.
                </p>
              </div>

              <div className="px-5 py-6 sm:px-8 sm:py-8 space-y-6">

                {/* Identité */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Prénom <span className="text-red-400">*</span></label>
                    <input className={inputClass} placeholder="Jean" value={prenom} onChange={e => setPrenom(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Nom <span className="text-red-400">*</span></label>
                    <input className={inputClass} placeholder="DUPONT" value={nom} onChange={e => setNom(e.target.value)} />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className={labelClass}>Email professionnel <span className="text-red-400">*</span></label>
                  <input className={inputClass} type="email" placeholder="jean.dupont@notaires.fr" value={email} onChange={e => setEmail(e.target.value)} />
                </div>

                {/* Fonction */}
                <div>
                  <label className={labelClass}>Fonction <span className="text-red-400">*</span></label>
                  <div className="flex flex-wrap gap-2">
                    {FONCTIONS.map(f => (
                      <button key={f} type="button" onClick={() => setFonction(f)}
                        className={`text-[13px] font-[inherit] px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                          fonction === f
                            ? "bg-[#111827] text-white border-[#111827]"
                            : "bg-white text-[#374151] border-[#d1d5db] hover:border-[#374151]"
                        }`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Domaines */}
                <div>
                  <label className={labelClass}>Domaines de pratique <span className="text-red-400">*</span> <span className="text-[#9ca3af] normal-case font-normal tracking-normal">(plusieurs choix possibles)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {DOMAINES.map(d => (
                      <button key={d} type="button" onClick={() => toggleDomaine(d)}
                        className={`text-[13px] font-[inherit] px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                          domaines.includes(d)
                            ? "bg-[#111827] text-white border-[#111827]"
                            : "bg-white text-[#374151] border-[#d1d5db] hover:border-[#374151]"
                        }`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CRPCEN */}
                <div>
                  <label className={labelClass}>
                    CRPCEN
                    <span className="text-[#9ca3af] normal-case font-normal tracking-normal ml-1">(optionnel)</span>
                  </label>
                  <input className={inputClass} placeholder="ex. 75055" value={crpcen} onChange={e => setCrpcen(e.target.value)} maxLength={10} />
                  <p className="text-[11px] text-[#9ca3af] mt-1">Code de votre étude, utile pour personnaliser votre expérience</p>
                </div>

                {/* RGPD */}
                <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                  <p className="text-[11px] text-[#6b7280] leading-relaxed">
                    <strong className="text-[#374151]">Protection de vos données (RGPD)</strong><br />
                    Les informations recueillies dans ce formulaire sont collectées par Grégoire TAGOT (2 rue Dante, 75005 Paris — <a href="mailto:gregoire@tagot.fr" className="underline">gregoire@tagot.fr</a>) aux fins exclusives de gestion du programme Alpha d'Henri. Elles ne sont jamais cédées à des tiers. Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d'un droit d'accès, de rectification et de suppression de vos données en écrivant à <a href="mailto:gregoire@tagot.fr" className="underline">gregoire@tagot.fr</a>. Vos données seront conservées uniquement pendant la durée du programme Alpha.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${rgpd ? "bg-[#111827] border-[#111827]" : "bg-white border-[#d1d5db] group-hover:border-[#374151]"}`}
                      onClick={() => setRgpd(p => !p)}>
                      {rgpd && <span className="text-white text-[11px] font-bold">✓</span>}
                    </div>
                    <span className="text-[13px] text-[#374151] leading-snug" onClick={() => setRgpd(p => !p)}>
                      J'ai lu et j'accepte la politique de protection des données ci-dessus. <span className="text-red-400">*</span>
                    </span>
                  </label>
                </div>

                {/* Erreur */}
                {status === "error" && (
                  <p className="text-[13px] text-red-500">Une erreur s'est produite. Veuillez réessayer ou écrire à <a href="mailto:gregoire@tagot.fr" className="underline">gregoire@tagot.fr</a></p>
                )}

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!isValid || status === "loading"}
                  className="w-full font-[inherit] text-[14px] font-semibold py-3 rounded-xl border-none cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: isValid ? "#111827" : "#e5e7eb", color: isValid ? "white" : "#9ca3af" }}
                >
                  {status === "loading" ? "Envoi en cours…" : "Envoyer ma candidature"}
                </button>

                <p className="text-[11px] text-[#9ca3af] text-center">
                  Vous recevrez un lien d'accès par email dans les meilleurs délais.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

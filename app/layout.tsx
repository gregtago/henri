import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Henri",
  description: "Organisation de travail notarial"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50">{children}</body>
    </html>
  );
}

"use client";

// Le carré à photographier.
//
// Une seule forme SVG pour tous les modules : le tracé est calculé une fois
// (`src/lib/qrcode.ts`), le navigateur n'a qu'un `<path>` à peindre, et
// l'image reste nette à n'importe quelle taille.
//
// **La seule couleur en dur de l'application, et c'est délibéré.** Ailleurs,
// tout passe par les tokens de thème ; ici non. Un lecteur de QR attend des
// modules sombres sur fond clair, et le carré doit se lire aussi bien dans le
// thème sombre — la plaque blanche fait donc partie du code, au même titre que
// sa marge.

import { useMemo } from "react";
import { encodeQr, qrPath } from "@/lib/qrcode";

export default function QrCode({ value, size = 180, label }: { value: string; size?: number; label: string }) {
  const drawing = useMemo(() => {
    try {
      return qrPath(encodeQr(value));
    } catch {
      return null;
    }
  }, [value]);

  if (!drawing) return null;

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${drawing.extent} ${drawing.extent}`}
      shapeRendering="crispEdges"
      className="rounded-lg border border-border"
    >
      <rect width={drawing.extent} height={drawing.extent} fill="#ffffff" />
      <path d={drawing.path} fill="#000000" />
    </svg>
  );
}

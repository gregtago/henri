// Composant Icon — inline des SVG monoligne pour qu'ils héritent de currentColor.
// Style cohérent avec DESIGN.md : trait 1.5px, viewBox 24×24, round caps.
// Usage : <Icon name="myday" size={16} />  ou  <Icon name="star" size={20} className="text-amber-500" />

import * as React from "react";

type IconName =
  | "myday"
  | "attach"
  | "close"
  | "delete"
  | "edit"
  | "folder"
  | "memo"
  | "arrow-right"
  | "arrow-left"
  | "chevron-down"
  | "chevron-up"
  | "star"
  | "calendar"
  | "recurrence"
  | "warning"
  | "check";

const PATHS: Record<IconName, React.ReactNode> = {
  "myday": (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </>
  ),
  "attach": <path d="M4 9h16M16 5l4 4-4 4M20 15H4M8 11l-4 4 4 4" />,
  "close": <path d="M18 6L6 18M6 6l12 12" />,
  "delete": (
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  ),
  "edit": <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  "folder": <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  "memo": <path d="M12 17v5M5 12h14M6 12l2-4V4h8v4l2 4" />,
  "arrow-right": <path d="M5 12h14M12 5l7 7-7 7" />,
  "arrow-left": <path d="M19 12H5M12 19l-7-7 7-7" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-up": <path d="M18 15l-6-6-6 6" />,
  "star": <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  "calendar": <path d="M21 6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6zM16 2v4M8 2v4M3 10h18" />,
  "recurrence": <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />,
  "warning": <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />,
  "check": <path d="M20 6L9 17l-5-5" />,
};

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  filled?: boolean; // Star en version pleine
  style?: React.CSSProperties;
};

export function Icon({ name, size = 16, className, strokeWidth = 1.5, filled = false, style }: IconProps) {
  const isStarFilled = name === "star" && filled;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={isStarFilled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };

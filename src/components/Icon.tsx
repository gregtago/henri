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
  | "check"
  | "phone"
  | "share";

const PATHS: Record<IconName, React.ReactNode> = {
  "myday": (
    <path d="M12 3v2.5M12 18.5V21M4.64 4.64 6.4 6.4M17.6 17.6l1.76 1.76M3 12h2.5M18.5 12H21M4.64 19.36 6.4 17.6M17.6 6.4l1.76-1.76M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
  ),
  "attach": <path d="M8 7h8m0 0-3-3m3 3-3 3M16 17H8m0 0 3 3m-3-3 3-3M5 12h14" />,
  "close": <path d="M7 7 17 17M17 7 7 17" />,
  "delete": <path d="M9 4h6m-8 4h10m-8.5 0 .7 12h5.6l.7-12M10 11v6M14 11v6" />,
  "edit": <path d="M5 19h4l9.5-9.5a2.12 2.12 0 0 0-3-3L6 16v3Zm9-11 3 3" />,
  "folder": <path d="M4 7.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z" />,
  "memo": <path d="M7 4h10a2 2 0 0 1 2 2v8.5L14.5 19H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm7.5 15v-3.5a1 1 0 0 1 1-1H19M8 8h8M8 11h7M8 14h4" />,
  "arrow-right": <path d="M5 12h14m0 0-5-5m5 5-5 5" />,
  "arrow-left": <path d="M19 12H5m0 0 5-5m-5 5 5 5" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  "chevron-up": <path d="m7 14 5-5 5 5" />,
  "star": <path d="m12 4 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.98l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L12 4Z" />,
  "calendar": <path d="M7 4v3M17 4v3M5 9h14M6.5 6h11A1.5 1.5 0 0 1 19 7.5v10A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-10A1.5 1.5 0 0 1 6.5 6Z" />,
  "recurrence": <path d="M7 8h8.5a3.5 3.5 0 0 1 0 7H9m0 0 2.5-2.5M9 15l2.5 2.5M17 8l-2.5-2.5M17 8l-2.5 2.5" />,
  "warning": <path d="M12 5 4.5 18h15L12 5Zm0 5v3.5M12 16.5v.1" />,
  "check": <path d="m5 12.5 4.2 4.2L19 7" />,
  "phone": <path d="M9 3.5h6A1.5 1.5 0 0 1 16.5 5v14A1.5 1.5 0 0 1 15 20.5H9A1.5 1.5 0 0 1 7.5 19V5A1.5 1.5 0 0 1 9 3.5Zm2 14h2" />,
  "share": <path d="M12 15V4m0 0-4 4m4-4 4 4M5 13v4.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V13" />,
};

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  filled?: boolean; // Star/Warning en version pleine
  style?: React.CSSProperties;
};

export function Icon({ name, size = 16, className, strokeWidth = 1.5, filled = false, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
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

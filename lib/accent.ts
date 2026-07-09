import type { Accent } from "./types";

// Literal class strings so Tailwind's scanner keeps them.
export const accentText: Record<Accent, string> = {
  cyan: "text-cyan",
  magenta: "text-magenta",
  amber: "text-amber",
};

export const accentGlowHover: Record<Accent, string> = {
  cyan: "hover:glow-cyan",
  magenta: "hover:glow-magenta",
  amber: "hover:glow-amber",
};

export const accentBorder: Record<Accent, string> = {
  cyan: "border-cyan/40",
  magenta: "border-magenta/40",
  amber: "border-amber/40",
};

export const accentHex: Record<Accent, string> = {
  cyan: "#2ee6c8",
  magenta: "#ff3ca6",
  amber: "#ffc04d",
};

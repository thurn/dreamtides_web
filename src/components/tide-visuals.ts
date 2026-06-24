import type { Tides4Color } from "../draft/pool/tides4-io";

/**
 * Per deck color, the tide chip's dark background, matching border, and the
 * white-outline Boxicons glyph that marks the color. The background is a deep
 * shade of the color and the border a brighter tint of it, so the chip reads as
 * its color while staying legible with white text and icon. This is the single
 * source of the per-color tide icon and palette shown on the Dreamcaller select
 * screen and the tides editor.
 */
export const TIDE_COLOR_CHIP: Record<
  Tides4Color,
  { background: string; border: string; icon: string }
> = {
  purple: {
    background: "#3b1259",
    border: "rgba(192, 132, 252, 0.55)",
    icon: "bx-skull",
  },
  green: {
    background: "#0f3d22",
    border: "rgba(74, 222, 128, 0.55)",
    icon: "bx-leaf",
  },
  yellow: {
    background: "#4a3a00",
    border: "rgba(250, 204, 21, 0.55)",
    icon: "bx-shield",
  },
  blue: {
    background: "#13315c",
    border: "rgba(96, 165, 250, 0.55)",
    icon: "bx-eye-alt",
  },
  orange: {
    background: "#5c2c0f",
    border: "rgba(251, 146, 60, 0.55)",
    icon: "bx-hot",
  },
};

/**
 * The bright accent color for each deck color, used for the icon glyph, focused
 * borders, and small color dots. A brighter tint of the same hue as the chip
 * background so the two read as one color family.
 */
export const TIDE_ACCENT_COLOR: Record<Tides4Color, string> = {
  purple: "#c084fc",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  orange: "#fb923c",
};

// Motes — the atmospheric particle layer.
//
// Drifting dust motes over a scene or chrome. This is the ONE sanctioned use
// of opacity animation in the system (Principle two): atmosphere, never
// object motion, and never a legibility crutch. Depth and mood come from the
// scene art and from these motes — never from a scrim, wash, or vignette
// painted over the media.
//
// Two context tints, from tokens:
//   - warm   (default) — over scene art / a portrait  (--mote-warm)
//   - violet           — over chrome-only screens      (--mote-violet)
//
// Fills its positioned parent (absolute inset:0, pointerEvents:none).
// Respects prefers-reduced-motion: the motes hold still (a fixed mid-opacity)
// rather than drift, via the `dt-mote` class's reduced-motion media rule
// injected alongside the drift keyframes.
//
// The layout (each mote's position/size/duration/delay) is a pure function of
// its index, `count`, and `seed` — no Math.random — so the same props always
// render the same field, and stacking two Motes layers with different `seed`
// values keeps their fields visibly distinct.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/quest/Motes.jsx / .d.ts).

import { useEffect, useMemo, type CSSProperties } from "react";
import { token } from "../primitives/tokens";

/** id of the one-time <style> element carrying the drift keyframes + the
 * prefers-reduced-motion override. Guarded so multiple Motes instances (or
 * remounts) never duplicate it. */
const STYLE_ELEMENT_ID = "dt-motes-kf";

/** Inserts the shared drift keyframes + reduced-motion guard into
 * document.head, once per document, the first time any Motes mounts. */
function ensureKeyframes(): void {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(STYLE_ELEMENT_ID) !== null) {
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ELEMENT_ID;
  styleElement.textContent =
    "@keyframes dtMoteDrift{" +
    "0%{transform:translate(0,0);opacity:.15}" +
    "30%{opacity:.9}" +
    "70%{opacity:.7}" +
    "100%{transform:translate(6px,-42px);opacity:0}}" +
    "@media(prefers-reduced-motion:reduce){.dt-mote{animation:none!important;opacity:.5!important}}";
  document.head.appendChild(styleElement);
}

interface TintSpec {
  fill: string;
  glow: string;
}

/** The two context tints, sourced from the --mote-* tokens. */
const TINTS: Record<MoteTint, TintSpec> = {
  warm: { fill: token("--mote-warm"), glow: token("--mote-warm-glow") },
  violet: { fill: token("--mote-violet"), glow: token("--mote-violet-glow") },
};

/** Context tint: 'warm' over scene art (default), 'violet' over chrome. */
export type MoteTint = "warm" | "violet";

interface Mote {
  left: number;
  top: number;
  duration: number;
  delay: number;
  size: number;
}

/** Deterministic mote field for `count` motes offset by `seed` — a pure
 * function of the index, matching the source design's seeded layout so the
 * same props always produce the same field. */
function buildMotes(count: number, seed: number): Mote[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + seed;
    return {
      left: (n * 53) % 100,
      top: (n * 67) % 100,
      duration: 9 + (n % 5) * 3,
      delay: -(n * 1.7),
      size: 2 + (n % 3),
    };
  });
}

export interface MotesProps {
  /** Toggles the layer on/off. Renders nothing when false. */
  on?: boolean;
  /** Context tint: 'warm' over scene art (default), 'violet' over chrome. */
  tint?: MoteTint;
  /** Particle density — how many motes to render. */
  count?: number;
  /** Offset the deterministic layout so two Motes layers differ. */
  seed?: number;
  /** Stacking order within the positioned parent. */
  zIndex?: number;
  style?: CSSProperties;
}

/**
 * Motes — the atmospheric particle layer. Drifting motes tinted by context;
 * the one sanctioned use of opacity animation (atmosphere, never a legibility
 * overlay). Fills its positioned parent; respects prefers-reduced-motion.
 */
export function Motes({
  on = true,
  tint = "warm",
  count = 14,
  seed = 0,
  zIndex = 2,
  style = {},
}: MotesProps) {
  useEffect(() => {
    ensureKeyframes();
  }, []);

  const motes = useMemo(() => buildMotes(count, seed), [count, seed]);

  if (!on) {
    return null;
  }

  const spec = TINTS[tint] ?? TINTS.warm;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex,
        ...style,
      }}
    >
      {motes.map((mote, i) => (
        <span
          key={i}
          className="dt-mote"
          style={{
            position: "absolute",
            left: `${String(mote.left)}%`,
            top: `${String(mote.top)}%`,
            width: mote.size,
            height: mote.size,
            borderRadius: "50%",
            background: spec.fill,
            boxShadow: `0 0 6px ${spec.glow}`,
            animation: `dtMoteDrift ${String(mote.duration)}s ${String(mote.delay)}s ${token("--ease-in-out")} infinite`,
          }}
        />
      ))}
    </div>
  );
}

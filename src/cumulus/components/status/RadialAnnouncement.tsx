// RadialAnnouncement — the shared orbiting announcement used for turn and
// wager-result moments.

import type { ReactElement } from "react";
import { EssenceValue } from "../hud/EssenceValue";
import { InlineGlyph } from "../typography/InlineGlyph";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { RADIAL_DISC_BACKGROUND } from "../../primitives/radial-disc-material";

export const RADIAL_ANNOUNCEMENT_DURATION_MS = 2_100;
export const RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS = 3_360;

const RADIAL_ANNOUNCEMENT_SIZE = {
  mini: 108,
  wager: 164,
  compact: 184,
  standard: 236,
} as const;

const DISC_ARRIVAL_SCALE = 0.48;
const DISC_OVERSHOOT_SCALE = 1.08;
const DISC_EXIT_SCALE = 0.86;
const ORBIT_ARRIVAL_SCALE = 0.64;
const ORBIT_EXIT_SCALE = 1.24;
const RIPPLE_ARRIVAL_SCALE = 0.68;
const RIPPLE_EXIT_SCALE = 1.42;
const MINI_RIPPLE_ARRIVAL_SCALE = 0.82;
const MINI_RIPPLE_EXIT_SCALE = 1.16;
const WAGER_RIPPLE_ARRIVAL_SCALE = 0.76;
const WAGER_RIPPLE_EXIT_SCALE = 1.08;
const COPY_ARRIVAL_SCALE = 0.72;
const COPY_OVERSHOOT_SCALE = 1.06;
const COPY_EXIT_SCALE = 0.94;

const RADIAL_ANNOUNCEMENT_CSS = `
  @keyframes radial-announcement-disc {
    0% { opacity: 0; transform: scale(${String(DISC_ARRIVAL_SCALE)}) rotate(-12deg); }
    18% { opacity: 1; transform: scale(${String(DISC_OVERSHOOT_SCALE)}) rotate(3deg); }
    30%, 72% { opacity: 1; transform: scale(1) rotate(0deg); }
    100% { opacity: 0; transform: scale(${String(DISC_EXIT_SCALE)}) rotate(0deg); }
  }

  @keyframes radial-announcement-orbit {
    0% { opacity: 0; transform: scale(${String(ORBIT_ARRIVAL_SCALE)}) rotate(-70deg); }
    24% { opacity: 0.88; }
    74% { opacity: 0.42; }
    100% { opacity: 0; transform: scale(${String(ORBIT_EXIT_SCALE)}) rotate(250deg); }
  }

  @keyframes radial-announcement-ripple {
    0%, 18% { opacity: 0; transform: scale(${String(RIPPLE_ARRIVAL_SCALE)}); }
    36% { opacity: 0.7; }
    100% { opacity: 0; transform: scale(${String(RIPPLE_EXIT_SCALE)}); }
  }

  @keyframes radial-announcement-ripple-mini {
    0%, 18% { opacity: 0; transform: scale(${String(MINI_RIPPLE_ARRIVAL_SCALE)}); }
    36% { opacity: 0.7; }
    100% { opacity: 0; transform: scale(${String(MINI_RIPPLE_EXIT_SCALE)}); }
  }

  @keyframes radial-announcement-ripple-wager {
    0%, 18% { opacity: 0; transform: scale(${String(WAGER_RIPPLE_ARRIVAL_SCALE)}); }
    36% { opacity: 0.7; }
    100% { opacity: 0; transform: scale(${String(WAGER_RIPPLE_EXIT_SCALE)}); }
  }

  @keyframes radial-announcement-copy {
    0%, 14% { opacity: 0; transform: scale(${String(COPY_ARRIVAL_SCALE)}); }
    28% { opacity: 1; transform: scale(${String(COPY_OVERSHOOT_SCALE)}); }
    38%, 72% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(${String(COPY_EXIT_SCALE)}); }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-radial-announcement-disc],
    [data-radial-announcement-orbit],
    [data-radial-announcement-ripple],
    [data-radial-announcement-copy] {
      animation: none !important;
      transition: none !important;
    }
  }
`;

/** Named semantic color treatment for a radial announcement. */
export type RadialAnnouncementTone = "accent" | "reward" | "danger";

/** Named disc size for viewport-scaled announcement contexts. */
export type RadialAnnouncementSize = keyof typeof RADIAL_ANNOUNCEMENT_SIZE;

/** Named display dwell for ordinary and longer reading moments. */
export type RadialAnnouncementDuration = "standard" | "extended";

export interface RadialAnnouncementProps {
  /** Primary announcement copy. */
  headline: string;
  /** Optional canonical glyph rendered in place of the headline copy. */
  headlineGlyph?: Glyph;
  /** Optional supporting copy beneath the headline. */
  detail?: string;
  /** Optional gained Essence amount, rendered with the canonical currency glyph. */
  essenceGained?: number;
  /** Semantic orbit and ripple color. Defaults to accent. */
  tone?: RadialAnnouncementTone;
  /** Named disc diameter. Defaults to standard. */
  size?: RadialAnnouncementSize;
  /** Named animation and reading dwell. Defaults to standard. */
  duration?: RadialAnnouncementDuration;
  /** Stable identifier exposed on the announcement root. */
  announcementId?: string;
}

function toneColor(tone: RadialAnnouncementTone): string {
  if (tone === "reward") return token("--gold");
  if (tone === "danger") return token("--danger");
  return token("--accent-bright");
}

/** Orbiting circular status moment shared by battle turns and game outcomes. */
export function RadialAnnouncement({
  headline,
  headlineGlyph,
  detail,
  essenceGained,
  tone = "accent",
  size = "standard",
  duration = "standard",
  announcementId,
}: RadialAnnouncementProps): ReactElement {
  const accent = toneColor(tone);
  const animationDuration = `calc(${token("--dur-slow")} * ${duration === "extended" ? "8" : "5"})`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-radial-announcement={announcementId ?? ""}
      data-radial-announcement-tone={tone}
      data-radial-announcement-duration={duration}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <style>{RADIAL_ANNOUNCEMENT_CSS}</style>
      <div
        data-radial-announcement-disc=""
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: token("--space-2"),
          width: RADIAL_ANNOUNCEMENT_SIZE[size],
          height: RADIAL_ANNOUNCEMENT_SIZE[size],
          borderRadius: token("--radius-pill"),
          background: RADIAL_DISC_BACKGROUND,
          boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
          animation: `radial-announcement-disc ${animationDuration} ${token("--ease-in-out")} both`,
        }}
      >
        <span
          aria-hidden="true"
          data-radial-announcement-orbit=""
          style={{
            position: "absolute",
            inset: token("--space-4"),
            border: `${token("--space-1")} solid ${accent}`,
            borderTopColor: token("--text-primary"),
            borderRadius: token("--radius-pill"),
            animation: `radial-announcement-orbit ${animationDuration} ${token("--ease-dream")} both`,
          }}
        />
        <span
          aria-hidden="true"
          data-radial-announcement-ripple=""
          style={{
            position: "absolute",
            inset: `calc(-1 * ${token(
              size === "mini" || size === "wager" ? "--space-1" : "--space-4",
            )})`,
            border: `${token("--space-1")} solid ${accent}`,
            borderRadius: token("--radius-pill"),
            animation: `${
              size === "mini"
                ? "radial-announcement-ripple-mini"
                : size === "wager"
                  ? "radial-announcement-ripple-wager"
                  : "radial-announcement-ripple"
            } ${animationDuration} ${token("--ease-out")} both`,
          }}
        />
        <div
          data-radial-announcement-copy=""
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-2"),
            color: token("--text-primary"),
            textAlign: "center",
            textShadow: token("--text-outline-media"),
            animation: `radial-announcement-copy ${animationDuration} ${token("--ease-out")} both`,
          }}
        >
          <span
            data-radial-announcement-headline-glyph={headlineGlyph}
            style={{
              font: token(
                headlineGlyph === undefined
                  ? size === "mini"
                    ? "--t-title-sm"
                    : "--t-title"
                  : size === "mini"
                    ? "--t-title"
                    : "--t-display",
              ),
            }}
          >
            {headlineGlyph === undefined ? (
              headline
            ) : (
              <InlineGlyph glyph={headlineGlyph} label={headline} />
            )}
          </span>
          {essenceGained !== undefined && (
            <span
              data-radial-announcement-essence=""
              style={{
                font: token(size === "mini" ? "--t-body" : "--t-title-sm"),
              }}
            >
              +<EssenceValue amount={essenceGained} tone="inherit" />
            </span>
          )}
          {detail !== undefined && (
            <span
              data-radial-announcement-detail=""
              style={{
                maxWidth: size === "mini" ? "84%" : "72%",
                font: token(size === "mini" ? "--t-caption" : "--t-body-sm"),
                color: token("--text-secondary"),
              }}
            >
              {detail}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

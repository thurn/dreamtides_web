import { tx } from "@trox/runtime";
import { useReducedMotion } from "framer-motion";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import { StandaloneGlyph } from "../controls/StandaloneGlyph";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";

export interface BattlePhaseIndicatorProps {
  /** Controlled visible phase. */
  readonly phase: "dawn" | "day" | "dusk" | "night" | "challenge";
  /** Status-edge orientation from the viewer's perspective. */
  readonly side: "near" | "far";
}

const PHASE_LEFT = {
  dawn: "10%",
  day: "30%",
  dusk: "50%",
  night: "70%",
  challenge: "90%",
} as const;

const PHASE_GLYPH = {
  dawn: GLYPHS.phaseDawn,
  day: GLYPHS.phaseDay,
  dusk: GLYPHS.phaseDusk,
  night: GLYPHS.phaseNight,
  challenge: GLYPHS.phaseChallenge,
} as const;
const PHASE_COMET_START_SCALE = 0.35;
const PHASE_COMET_PEAK_SCALE = 1.55;
const PHASE_HALO_PEAK_SCALE = 1.65;

/** A controlled comet-like marker along one side's battle phase track. */
export function BattlePhaseIndicator({
  phase,
  side,
}: BattlePhaseIndicatorProps) {
  const resolve = useLocalizer();
  const reduceMotion = useReducedMotion() === true;
  const phaseName =
    phase === "dawn"
      ? tx("Dawn phase", "[accessibility] [battle] Dawn phase name.")
      : phase === "day"
        ? tx("Day phase", "[accessibility] [battle] Day phase name.")
        : phase === "dusk"
          ? tx("Dusk phase", "[accessibility] [battle] Dusk phase name.")
          : phase === "night"
            ? tx("Night phase", "[accessibility] [battle] Night phase name.")
            : tx(
                "Challenge phase",
                "[accessibility] [battle] Challenge phase name.",
              );
  return (
    <div
      role="img"
      aria-label={resolve(phaseName)}
      data-battle-phase={phase}
      data-battle-side={side}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: side === "near" ? 0 : "100%",
        height: 0,
        pointerEvents: "none",
      }}
    >
      {/* localization-ignore: CSS keyframe source is compositor behavior, not player-facing copy. */}
      <style>{`
        @keyframes cumulus-battle-phase-comet { 0% { transform: translateY(-50%) scaleX(${String(PHASE_COMET_START_SCALE)}); opacity: .12; } 45% { transform: translateY(-50%) scaleX(${String(PHASE_COMET_PEAK_SCALE)}); opacity: .52; } 100% { transform: translateY(-50%) scaleX(1); opacity: .28; } }
        @keyframes cumulus-battle-phase-pulse { 0%, 100% { transform: scale(1); opacity: .22; } 45% { transform: scale(${String(PHASE_HALO_PEAK_SCALE)}); opacity: .48; } }
        @media (prefers-reduced-motion: reduce) { [data-battle-phase-light] * { animation: none !important; transition: none !important; } }
      `}</style>
      <span
        aria-hidden="true"
        data-battle-phase-light=""
        style={{
          position: "absolute",
          top: side === "near" ? 12 : -12,
          left: PHASE_LEFT[phase],
          width: 19,
          height: 19,
          transform:
            side === "near" ? "translate(-50%, -100%)" : "translate(-50%, 0%)",
          transition: reduceMotion
            ? "none"
            : `left ${token("--motion-object-travel")}`,
        }}
      >
        <span
          data-battle-phase-light-streak=""
          style={{
            position: "absolute",
            top: "50%",
            right: "50%",
            width: 28,
            height: 2,
            transform: "translateY(-50%)",
            transformOrigin: "right center",
            borderRadius: token("--radius-pill"),
            backgroundColor: token("--accent-bright"),
            boxShadow: token("--glow-accent-soft"),
            opacity: 0.28,
            animation: reduceMotion
              ? undefined
              : `cumulus-battle-phase-comet ${token("--dur-slow")} ${token("--ease-out")}`,
          }}
        />
        <span
          data-battle-phase-light-halo=""
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: token("--radius-pill"),
            backgroundColor: token("--accent"),
            boxShadow: token("--glow-accent-soft"),
            opacity: 0.22,
            animation:
              !reduceMotion && phase === "challenge"
                ? `cumulus-battle-phase-pulse ${token("--dur-slow")} ${token("--ease-out")}`
                : undefined,
          }}
        />
        <span
          data-battle-phase-light-core=""
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            borderRadius: token("--radius-pill"),
            backgroundColor: token("--bg-sunken"),
            fontSize: 15,
          }}
        >
          <StandaloneGlyph
            glyph={PHASE_GLYPH[phase]}
            color="accent-bright"
            depth="content-protection"
          />
        </span>
      </span>
    </div>
  );
}

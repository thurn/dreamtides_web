import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement } from "react";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

export interface LoadingView {
  readonly quote: string;
  readonly loadingLabel: string;
}

export interface LoadingScreenProps {
  readonly view: LoadingView;
  /** Multiplier applied to the tutorial entry sequence's presentation timing. */
  readonly playbackSpeed?: number;
}

const SCREEN_FADE_SECONDS = motionTimeSeconds("--dur-loading-screen-fade");
const QUOTE_FADE_SECONDS = motionTimeSeconds("--dur-loading-quote");
const DOT_CYCLE_SECONDS = motionTimeSeconds("--dur-loading-dot-cycle");
const DOT_STAGGER_SECONDS = motionTimeSeconds("--stagger-loading-dot");
const DOT_POSITIONS = [0, 1, 2] as const;

/** Cinematic standalone journey-loading presentation. */
export function LoadingScreen({
  view,
  playbackSpeed = 1,
}: LoadingScreenProps): ReactElement {
  const isDesktop = useIsDesktop();
  const reduceMotion = useReducedMotion() === true;

  return (
    <motion.main
      className="cumulus"
      data-loading-screen
      aria-busy="true"
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduceMotion ? 0 : SCREEN_FADE_SECONDS / playbackSpeed,
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        overflow: "hidden",
        background: token("--bg-loading"),
        color: token("--text-loading"),
      }}
    >
      <figure
        data-loading-verse
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "min(92vw, 780px)",
          margin: 0,
          transform: "translate(-50%, -50%)",
        }}
      >
        <motion.blockquote
          data-loading-quote
          initial={{ opacity: reduceMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{
            delay: 0,
            duration: reduceMotion ? 0 : QUOTE_FADE_SECONDS / playbackSpeed,
          }}
          style={{
            width: "100%",
            maxWidth: "48ch",
            margin: "0 auto",
            color: token("--text-loading"),
            font: isDesktop
              ? token("--t-title")
              : token("--t-hero-epithet"),
            textAlign: "center",
            textWrap: "balance",
          }}
        >
          <span data-loading-quote-text style={{ fontStyle: "italic" }}>
            {view.quote}
          </span>
        </motion.blockquote>
      </figure>

      <div
        role="status"
        aria-label={`${view.loadingLabel}...`}
        data-loading-indicator
        style={{
          position: "absolute",
          right: 0,
          bottom: `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-9")})`,
          left: 0,
          color: token("--text-loading"),
          font: token("--t-body"),
          textAlign: "center",
        }}
      >
        <span aria-hidden="true">{view.loadingLabel}</span>
        {DOT_POSITIONS.map((position) => (
          <motion.span
            key={position}
            aria-hidden="true"
            data-loading-dot={String(position + 1)}
            initial={{ opacity: reduceMotion ? 1 : 0.28 }}
            animate={{ opacity: reduceMotion ? 1 : [0.28, 1, 0.28] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    delay:
                      (position * DOT_STAGGER_SECONDS) / playbackSpeed,
                    duration: DOT_CYCLE_SECONDS / playbackSpeed,
                    repeat: Number.POSITIVE_INFINITY,
                  }
            }
          >
            .
          </motion.span>
        ))}
      </div>
    </motion.main>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  JOURNEY_DESIGN_HEIGHT,
  JOURNEY_DESIGN_WIDTH,
  JOURNEY_TITLE_GRADIENT,
} from "./journeyTheme";

interface DreamJourneyStageProps {
  /** The Dream Merchant's per-pairing flavor line, shown under the title. */
  subtitle: string;
  leftColumn: ReactNode;
  rightColumn: ReactNode;
  /**
   * The resident guide's name, shown in the lower-left caption. Aldric is the
   * central figure of this scene, so the caption labels him from within the
   * scaled composition rather than from a viewport-fixed corner dock.
   */
  guideName?: string;
  /** A short greeting line for the guide, shown under the name in the caption. */
  guideLine?: string | null;
  /** Debug-only controls (reroll / force) pinned to the top-right. */
  debugControls?: ReactNode;
  /** Extra content layered over the canvas (e.g. a validation toast). */
  overlay?: ReactNode;
}

interface Mote {
  left: string;
  top: string;
  size: number;
  color: string;
  duration: number;
  delay: number;
}

const MOTES: readonly Mote[] = [
  { left: "22%", top: "72%", size: 4, color: "rgba(180,160,255,.8)", duration: 10, delay: 0 },
  { left: "64%", top: "78%", size: 3, color: "rgba(150,210,255,.7)", duration: 12, delay: 1.6 },
  { left: "44%", top: "82%", size: 5, color: "rgba(170,150,255,.6)", duration: 13, delay: 0.8 },
];

/**
 * The full-bleed Dream Journey composition, authored at 1440 x 980 and scaled
 * uniformly (single transform, centered) to fit its container so every offer
 * treatment can use design-space pixel values directly. The Merchant stands
 * dead-center behind the offers with his feet at the button line; persistent
 * chrome pins to the corners. The shared run HUD is reused unchanged and floats
 * over the bottom from the app shell, so this stage renders no HUD of its own.
 */
export function DreamJourneyStage({
  subtitle,
  leftColumn,
  rightColumn,
  guideName,
  guideLine,
  debugControls,
  overlay,
}: DreamJourneyStageProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (outer === null) return;
    const measure = () => {
      const { width, height } = outer.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setScale(
        Math.min(width / JOURNEY_DESIGN_WIDTH, height / JOURNEY_DESIGN_HEIGHT),
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={outerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        // Transparent so the shared SiteSceneBackdrop — the dreamscape scene art
        // under its semi-translucent dim overlay — shows through across the full
        // viewport, matching every other dreamscape site screen.
        background: "transparent",
      }}
      data-testid="dream-journey-stage"
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: JOURNEY_DESIGN_WIDTH,
          height: JOURNEY_DESIGN_HEIGHT,
          transform: `translate(-50%,-50%) scale(${String(scale)})`,
          transformOrigin: "center",
          // Transparent so the dreamscape backdrop reads through the offer
          // composition; the offers and Aldric sit over the dimmed scene.
          background: "transparent",
          overflow: "hidden",
        }}
        data-testid="dream-journey-canvas"
      >
        {/* drifting motes — pure life, no meaning */}
        {MOTES.map((mote, index) => (
          <div
            key={index}
            className="dj-anim-mote"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: mote.left,
              top: mote.top,
              width: mote.size,
              height: mote.size,
              borderRadius: "50%",
              background: mote.color,
              filter: "blur(1px)",
              animation: `dj-drift ${String(mote.duration)}s linear infinite ${String(mote.delay)}s`,
            }}
          />
        ))}

        {/* presence chip */}
        <div
          style={{
            position: "absolute",
            top: 22,
            left: 24,
            zIndex: 6,
            fontSize: 11,
            letterSpacing: ".14em",
            fontWeight: 700,
            color: "#9b95bf",
            padding: "5px 10px",
            borderRadius: 7,
            background: "rgba(30,24,52,.6)",
            border: "1px solid rgba(140,120,210,.2)",
          }}
        >
          1 CONNECTED
        </div>

        {/* Guide caption — the resident guide's name + greeting, docked to the
            lower-left of the scaled composition (below the left offer column,
            clear of the bottom HUD). Aldric is the central figure, so the
            caption labels him from inside the scene rather than from a
            viewport-fixed corner that would drift off the composition. */}
        {guideName !== undefined && (
          <div
            data-site-guide-caption=""
            style={{
              position: "absolute",
              left: 54,
              bottom: 26,
              zIndex: 6,
              maxWidth: 320,
              padding: "14px 18px 16px",
              borderRadius: "16px 16px 16px 4px",
              background: "rgba(20,14,34,.82)",
              border: "1px solid rgba(168,85,247,.45)",
              backdropFilter: "blur(14px)",
              boxShadow:
                "0 14px 34px rgba(0,0,0,.5), 0 0 20px rgba(168,85,247,.15)",
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 10,
                letterSpacing: ".22em",
                textTransform: "uppercase",
                color: "#c084fc",
              }}
            >
              {guideName}
            </span>
            {guideLine != null && guideLine !== "" && (
              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: 16,
                  fontWeight: 450,
                  lineHeight: 1.42,
                  color: "#f6f6f5",
                }}
              >
                {`“${guideLine}”`}
              </p>
            )}
          </div>
        )}

        {debugControls !== undefined && (
          <div
            style={{
              position: "absolute",
              top: 62,
              right: 26,
              zIndex: 30,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            {debugControls}
          </div>
        )}

        {/* title + subtitle */}
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 0,
            right: 0,
            zIndex: 5,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-.01em",
              background: JOURNEY_TITLE_GRADIENT,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Augury
          </div>
          <div
            style={{
              fontSize: 14.5,
              color: "#8c86b0",
              marginTop: 3,
              fontWeight: 500,
              fontStyle: "italic",
              padding: "0 360px",
            }}
            data-testid="merchant-dialogue-line"
          >
            {subtitle}
          </div>
        </div>

        {/* Aldric, the Seer — static, soft-masked, feet at the button line */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 232,
            transform: "translateX(-50%)",
            zIndex: 2,
            display: "flex",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          <div
            className="dj-anim-glow"
            style={{
              position: "absolute",
              left: "50%",
              top: "54%",
              transform: "translateX(-50%)",
              width: 540,
              height: 540,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(108,77,220,.4) 0%, rgba(70,40,150,.15) 42%, transparent 68%)",
              animation: "dj-glow-pulse 7s ease-in-out infinite",
            }}
          />
          <img
            src="/dream-guides/aldric_the_seer.png"
            alt="Aldric, the Seer"
            style={{
              height: 700,
              width: "auto",
              display: "block",
              position: "relative",
              WebkitMaskImage:
                "radial-gradient(ellipse 50% 58% at 50% 44%, #000 40%, rgba(0,0,0,.55) 62%, transparent 80%)",
              maskImage:
                "radial-gradient(ellipse 50% 58% at 50% 44%, #000 40%, rgba(0,0,0,.55) 62%, transparent 80%)",
            }}
          />
        </div>

        {/* grounding floor shadow under Aldric's feet */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 96,
            transform: "translateX(-50%)",
            width: 600,
            height: 88,
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse, rgba(110,80,200,.26), transparent 70%)",
            zIndex: 1,
          }}
        />

        {leftColumn}
        {rightColumn}
        {overlay}
      </div>
    </div>
  );
}

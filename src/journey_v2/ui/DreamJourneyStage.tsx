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
  onWalkOn: () => void;
  leftColumn: ReactNode;
  rightColumn: ReactNode;
  /** Debug-only controls (reroll / force) pinned below the Walk on pill. */
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
  onWalkOn,
  leftColumn,
  rightColumn,
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
        background: "#0b0a11",
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
          background:
            "radial-gradient(125% 92% at 50% 33%, #241b42 0%, #130d29 46%, #080614 100%)",
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

        {/* Walk on — a quiet decline, never a red close */}
        <button
          type="button"
          onClick={onWalkOn}
          data-testid="merchant-walk-away"
          style={{
            position: "absolute",
            top: 24,
            right: 26,
            zIndex: 6,
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 600,
            color: "#a39ec5",
            padding: "9px 15px 9px 17px",
            borderRadius: 999,
            background: "rgba(28,22,48,.5)",
            border: "1px solid rgba(140,120,210,.24)",
            cursor: "pointer",
          }}
        >
          Walk on
          <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>
            ›
          </span>
        </button>

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
            Dream Journey
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

        {/* Merchant — static, soft-masked, feet at the button line */}
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
            src="/dream-merchant.png"
            alt="The Dream Merchant"
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
          <div
            className="dj-anim-glow"
            style={{
              position: "absolute",
              left: 118,
              top: 148,
              width: 120,
              height: 120,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(140,110,255,.7), transparent 66%)",
              animation: "dj-hand-glow 4.5s ease-in-out infinite",
            }}
          />
          <div
            className="dj-anim-glow"
            style={{
              position: "absolute",
              right: 72,
              top: 330,
              width: 120,
              height: 120,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(120,210,235,.55), transparent 66%)",
              animation: "dj-hand-glow 5.2s ease-in-out infinite 1s",
            }}
          />
        </div>

        {/* grounding floor shadow under the merchant's feet */}
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

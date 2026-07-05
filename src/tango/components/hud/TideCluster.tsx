// TideCluster — the collapsed tide disclosure used on the Dreamcaller-select
// carousel. Closed, it shows a "Tides" label + the tides' overlapping colored
// glyph discs. Tapping runs a Material container-transform: each disc flies out
// of the cluster to its slot in the pill row below and grows into the full named
// TidePill (label revealing as the body expands); closing reverses it. Each
// resting pill keeps its own touch-down description reveal (TidePill owns it).
//
// Reduced motion (`prefers-reduced-motion: reduce`) collapses the transform to
// an instant open/close. The flight is CSS-transitioned on absolutely-positioned
// clones (out of flow, so morphing them causes no reflow); the real pills are
// laid out but hidden until the flight lands, then swapped in one commit so
// there is no flash. Colors + icons come from `tideVisual` so a clone lands
// pixel-identical on the pill it becomes.

import * as React from "react";
import {
  TidePill,
  tideVisual,
  PILL_SM_FONT_PX,
  PILL_SM_PAD_X,
  PILL_ICON_GAP_PX,
  type Tide,
} from "./TidePill";
import { TideDisc, TIDE_DISC_PX } from "./TideDisc";
import { token } from "../../primitives/tokens";
import { GLYPHS } from "../../primitives/glyph";

/** One tide shown in the cluster, already resolved to display copy. */
export interface TideClusterTideView {
  /** Stable id (a tide deck id) for the React key / QA hook. */
  id: string;
  /** Display name shown on the pill. */
  label: string;
  /** Description revealed through the pill's own InfoCard reveal. */
  description: string;
  /** Which of the five tides fixes the icon + color. */
  tide: Tide;
}

export interface TideClusterProps {
  /** The tides to disclose. */
  tides: TideClusterTideView[];
  /** Screen root the pill reveals anchor + clamp against (preferred). */
  stageRef?: React.RefObject<HTMLElement | null>;
}

/** ms per chip flight and stagger between chips (animation sequencing, not CSS
 * lengths). Kept in step with the sheet-height tween below. */
const FLY_DUR = 420;
const FLY_STAGGER = 55;

// The flyer's poses read their sizing from the components they morph between:
// the disc pose from TideDisc (`TIDE_DISC_PX`) and the pill pose from the sm
// TidePill's exported metrics — so a clone lands pixel-identical on the thing
// it becomes, and neither size can drift from its source.
const DISC_PAD_L = 6; // flyer-only: centers the glyph inside the disc pose

/**
 * The flyer's fill for a tide at a given pose. A translucent tint (an inset
 * box-shadow) is painted over an opaque `--bg-app` backing that only shows at
 * the disc pose — so a closing clone lands on the same opaque, ringed disc it
 * becomes instead of a translucent blob that snaps solid at the swap. `ring`
 * adds the disc's separating outline; the leftmost disc omits it, matching the
 * resting cluster. `backgroundColor` and `box-shadow` both tween, so the
 * backing and ring fade in/out in step with the flight.
 */
function flyerFill(
  v: { bg: string },
  pill: boolean,
  ring: boolean,
): { backgroundColor: string; boxShadow: string } {
  const bgApp = token("--bg-app");
  const ringPx = !pill && ring ? 2 : 0;
  return {
    backgroundColor: pill ? "transparent" : bgApp,
    boxShadow: `inset 0 0 0 999px ${v.bg}, 0 0 0 ${ringPx}px ${bgApp}`,
  };
}

type Phase = "closed" | "opening" | "open" | "closing";

export function TideCluster({
  tides,
  stageRef,
}: TideClusterProps): React.ReactElement {
  const [phase, setPhase] = React.useState<Phase>("closed");
  const [flyers, setFlyers] = React.useState<
    { id: string; tide: Tide; disc: Box; pill: Box }[] | null
  >(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const discRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const pillRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const flyerRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const labelRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const openRef = React.useRef<HTMLDivElement>(null);

  const animating = phase === "opening" || phase === "closing";
  const openish = phase === "open" || phase === "opening";
  const openMounted = phase !== "closed";

  const toggle = (): void => {
    if (animating) return;
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (phase === "closed") setPhase(reduce ? "open" : "opening");
    else if (phase === "open") setPhase(reduce ? "closed" : "closing");
  };

  // Step 1: on entering an animating phase, measure discs + hidden pills in
  // local coords and spawn the flying clones at the start pose.
  React.useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const c = containerRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const scale = cr.width / c.offsetWidth || 1;
    const rel = (el: HTMLElement): Box => {
      const r = el.getBoundingClientRect();
      return {
        left: (r.left - cr.left) / scale,
        top: (r.top - cr.top) / scale,
        width: r.width / scale,
        height: r.height / scale,
      };
    };
    const list = tides
      .map((t) => {
        const d = discRefs.current[t.id];
        const p = pillRefs.current[t.id];
        if (!d || !p) return null;
        return { id: t.id, tide: t.tide, disc: rel(d), pill: rel(p) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (list.length === 0) {
      setPhase(phase === "opening" ? "open" : "closed");
      return;
    }
    const ob = openRef.current;
    if (ob) {
      const maxDelay = (list.length - 1) * FLY_STAGGER;
      const hDur = FLY_DUR + maxDelay;
      const hEase =
        phase === "opening"
          ? "cubic-bezier(.2,0,0,1)"
          : "cubic-bezier(.4,0,1,1)";
      ob.style.overflow = "hidden";
      ob.style.transition = `height ${hDur}ms ${hEase}`;
      ob.style.height = (phase === "opening" ? 0 : ob.scrollHeight) + "px";
    }
    setFlyers(list);
  }, [phase]);

  // Once open, release the imperative height so pills (and their popups) reflow.
  React.useLayoutEffect(() => {
    const ob = openRef.current;
    if (phase === "open" && ob) {
      ob.style.height = "auto";
      ob.style.overflow = "visible";
      ob.style.transition = "";
    }
  }, [phase]);

  // Step 2: flyers committed at START pose. Force a reflow, then set the END pose
  // imperatively so CSS transitions tween.
  React.useLayoutEffect(() => {
    if (!flyers || (phase !== "opening" && phase !== "closing")) return;
    const opening = phase === "opening";
    const endPill = opening;
    const startPill = !opening;
    const setPose = (
      el: HTMLElement,
      lab: HTMLElement | null,
      pill: boolean,
      box: Box,
      v: { bg: string },
      ring: boolean,
    ): void => {
      el.style.left = box.left + "px";
      el.style.top = box.top + "px";
      el.style.width = (pill ? box.width : TIDE_DISC_PX) + "px";
      el.style.height = (pill ? box.height : TIDE_DISC_PX) + "px";
      el.style.paddingLeft = (pill ? PILL_SM_PAD_X : DISC_PAD_L) + "px";
      el.style.paddingRight = (pill ? PILL_SM_PAD_X : 0) + "px";
      el.style.gap = (pill ? PILL_ICON_GAP_PX : 0) + "px";
      const fill = flyerFill(v, pill, ring);
      el.style.backgroundColor = fill.backgroundColor;
      el.style.boxShadow = fill.boxShadow;
      if (lab) lab.style.opacity = pill ? "1" : "0";
    };
    flyers.forEach((f, i) => {
      const el = flyerRefs.current[f.id];
      const v = tideVisual(f.tide);
      if (el)
        setPose(el, labelRefs.current[f.id], startPill, startPill ? f.pill : f.disc, v, i > 0);
    });
    const raf = requestAnimationFrame(() => {
      const c = containerRef.current;
      if (c) void c.offsetHeight;
      const ob = openRef.current;
      if (ob) ob.style.height = (opening ? ob.scrollHeight : 0) + "px";
      flyers.forEach((f, i) => {
        const el = flyerRefs.current[f.id];
        const v = tideVisual(f.tide);
        if (el)
          setPose(el, labelRefs.current[f.id], endPill, endPill ? f.pill : f.disc, v, i > 0);
      });
    });
    const maxDelay = (flyers.length - 1) * FLY_STAGGER;
    const timer = setTimeout(() => {
      setPhase(opening ? "open" : "closed");
      setFlyers(null);
    }, maxDelay + FLY_DUR + 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [flyers]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        data-tide-toggle="true"
        onClick={toggle}
        aria-expanded={openish}
        style={{
          display: "flex",
          alignItems: "center",
          gap: token("--space-5"),
          padding: `${token("--space-2")} ${token("--space-1")}`,
          background: "none",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          touchAction: "manipulation",
        }}
      >
        {/* The label and its (i) sit as one unit — the info mark reads as an
            immediate annotation on "Tides", not a third spaced item in the row. */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: token("--space-1"),
          }}
        >
          <span
            style={{
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
              color: token("--text-secondary"),
              lineHeight: 1,
            }}
          >
            Tides
          </span>
          <i
            className={GLYPHS.infoFilled}
            aria-hidden="true"
            style={{ fontSize: 13, color: token("--text-muted") }}
          />
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            opacity: phase === "closed" ? 1 : 0,
          }}
        >
          {tides.map((t, i) => (
            <span
              key={t.id}
              ref={(el) => {
                discRefs.current[t.id] = el;
              }}
              style={{
                marginLeft: i === 0 ? 0 : token("--space-2"),
                borderRadius: "50%",
                display: "flex",
                position: "relative",
              }}
            >
              <TideDisc tide={t.tide} id={t.id} />
            </span>
          ))}
        </span>
      </button>

      {openMounted && (
        <div ref={openRef}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: token("--space-3"),
              marginTop: token("--space-3"),
              opacity: phase === "open" ? 1 : 0,
            }}
          >
            {tides.map((t) => (
              <span
                key={t.id}
                data-tide-pill={t.id}
                ref={(el) => {
                  pillRefs.current[t.id] = el;
                }}
                style={{ display: "inline-flex" }}
              >
                <TidePill
                  tide={t.tide}
                  label={t.label}
                  description={t.description}
                  size="sm"
                  stageRef={stageRef}
                />
              </span>
            ))}
          </div>
        </div>
      )}

      {flyers && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {flyers.map((f, i) => {
            const v = tideVisual(f.tide);
            const opening = phase === "opening";
            const endPill = phase === "opening" || phase === "open";
            const end = endPill ? f.pill : f.disc;
            const easing = opening
              ? "cubic-bezier(.2,0,0,1)"
              : "cubic-bezier(.4,0,1,1)";
            const delay = (opening ? i : flyers.length - 1 - i) * FLY_STAGGER;
            const move = `${FLY_DUR}ms ${easing} ${delay}ms`;
            const labDelay = delay + (opening ? Math.round(FLY_DUR * 0.35) : 0);
            const fill = flyerFill(v, endPill, i > 0);
            return (
              <span
                key={f.id}
                ref={(el) => {
                  flyerRefs.current[f.id] = el;
                }}
                style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  display: "inline-flex",
                  alignItems: "center",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  backgroundColor: fill.backgroundColor,
                  boxShadow: fill.boxShadow,
                  border: `1px solid ${v.bd}`,
                  color: v.fg,
                  borderRadius: token("--radius-pill"),
                  font: `600 ${PILL_SM_FONT_PX}px/1 ${token("--font-ui")}`,
                  letterSpacing: "0.005em",
                  // Match the resting cluster's disc stacking (leftmost on top)
                  // so overlapping flyers layer identically to the discs they land on.
                  zIndex: flyers.length - i,
                  left: end.left,
                  top: end.top,
                  width: endPill ? end.width : TIDE_DISC_PX,
                  height: endPill ? end.height : TIDE_DISC_PX,
                  paddingLeft: endPill ? PILL_SM_PAD_X : DISC_PAD_L,
                  paddingRight: endPill ? PILL_SM_PAD_X : 0,
                  gap: endPill ? PILL_ICON_GAP_PX : 0,
                  transition: `left ${move}, top ${move}, width ${move}, height ${move}, padding ${move}, background-color ${move}, box-shadow ${move}`,
                  willChange: "left, top, width, height",
                }}
              >
                <span
                  style={{ display: "inline-flex", fontSize: "1.05em", flex: "none" }}
                >
                  <i className={v.icon} aria-hidden="true" />
                </span>
                <span
                  ref={(el) => {
                    labelRefs.current[f.id] = el;
                  }}
                  style={{
                    display: "inline-block",
                    opacity: endPill ? 1 : 0,
                    transition: `opacity ${Math.round(FLY_DUR * 0.55)}ms linear ${labDelay}ms`,
                  }}
                >
                  {tides.find((t) => t.id === f.id)?.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A rectangle in container-local (frame-unscaled) px. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

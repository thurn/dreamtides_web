import { useId } from "react";
import "./atlas.css";

/**
 * The four Dream Atlas connector treatments, chosen by the endpoints' lifecycle
 * relative to the layer the player is currently choosing into:
 *
 * - `traveled` — both endpoints completed: a solid gold route already walked.
 * - `open` — a completed node into an available one: the glowing violet choice,
 *   carrying an animated flow line toward the frontier.
 * - `dim` — a revealed-but-not-yet-open link the player can already reason about.
 * - `locked` — a dashed speculative route reaching into still-locked territory.
 */
export type AtlasEdgeKind = "traveled" | "open" | "dim" | "locked";

/**
 * The two-tone gradient sweeps for the painted edge kinds, as `[from, to]`
 * stops. The `dim`/`locked` kinds stroke with a flat CSS colour and are absent
 * here.
 */
const EDGE_GRADIENT_STOPS: Partial<Record<AtlasEdgeKind, [string, string]>> = {
  traveled: [
    "var(--atlas-edge-traveled-from)",
    "var(--atlas-edge-traveled-to)",
  ],
  open: ["var(--atlas-edge-open-from)", "var(--atlas-edge-open-to)"],
};

interface AtlasEdgeProps {
  /** Which connector treatment to draw. */
  kind: AtlasEdgeKind;
  /** Start x, in the atlas svg's coordinate space. */
  x1: number;
  /** Start y, in the atlas svg's coordinate space. */
  y1: number;
  /** End x, in the atlas svg's coordinate space. */
  x2: number;
  /** End y, in the atlas svg's coordinate space. */
  y2: number;
}

/**
 * One connection between two atlas nodes, drawn as an SVG line inside the atlas
 * `<svg>`. The `open` kind stacks a second animated "flow" line over the base
 * stroke to pull the eye toward the next choice.
 *
 * The `traveled`/`open` sweeps are painted with a gradient defined *per edge* in
 * `userSpaceOnUse` units along the edge's own endpoints. This matters for
 * robustness: a shared gradient in the default `objectBoundingBox` units
 * degenerates to nothing when an edge is perfectly horizontal or vertical (its
 * bounding box has zero height or width), which silently erases the gold route
 * between two completed nodes that happen to sit in the same row — making a
 * valid, connected path read as broken. Anchoring the gradient to the line's
 * actual endpoints keeps it painted at every orientation.
 */
export function AtlasEdge({ kind, x1, y1, x2, y2 }: AtlasEdgeProps) {
  const gradientId = useId();
  const stops = EDGE_GRADIENT_STOPS[kind];
  return (
    <g>
      {stops !== undefined && (
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        >
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="1" stopColor={stops[1]} />
        </linearGradient>
      )}
      <line
        className={`edge edge-${kind}`}
        style={
          stops !== undefined ? { stroke: `url(#${gradientId})` } : undefined
        }
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
      />
      {kind === "open" && (
        <line className="edge-open-flow" x1={x1} y1={y1} x2={x2} y2={y2} />
      )}
    </g>
  );
}

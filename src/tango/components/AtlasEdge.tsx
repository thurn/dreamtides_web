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

interface AtlasEdgeProps {
  /** Which connector treatment to draw. */
  kind: AtlasEdgeKind;
  /** Start point, in the atlas svg's coordinate space. */
  x1: number;
  y1: number;
  /** End point, in the atlas svg's coordinate space. */
  x2: number;
  y2: number;
}

/**
 * One connection between two atlas nodes, drawn as an SVG line inside the atlas
 * `<svg>`. Render an {@link AtlasEdgeDefs} once in the same svg so the gradient
 * strokes (`traveled`/`open`) resolve. The `open` kind stacks a second animated
 * "flow" line over the base stroke to pull the eye toward the next choice.
 */
export function AtlasEdge({ kind, x1, y1, x2, y2 }: AtlasEdgeProps) {
  return (
    <g>
      <line
        className={`edge edge-${kind}`}
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

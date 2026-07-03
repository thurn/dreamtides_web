import "./atlas.css";

/**
 * The shared SVG `<defs>` the Dream Atlas connections reference: the two
 * linear-gradient strokes used by {@link AtlasEdge}. Render this once inside the
 * atlas `<svg>` (before the edges) so `traveled` edges can stroke with
 * `url(#dream-atlas-gold)` and `open` edges with `url(#dream-atlas-openg)`.
 *
 * The gradient ids are global to the document; render exactly one
 * `AtlasEdgeDefs` per atlas svg so the referenced ids resolve.
 */
export function AtlasEdgeDefs() {
  return (
    <defs>
      {/* Completed "traveled" route: warm gold sweep. */}
      <linearGradient id="dream-atlas-gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fbbf24" />
        <stop offset="1" stopColor="#d4a017" />
      </linearGradient>
      {/* The currently "open" choice: violet sweep with an animated flow line. */}
      <linearGradient id="dream-atlas-openg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#a855f7" />
        <stop offset="1" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
  );
}

// deck-viewer-shared — internals shared by the desktop and mobile deck viewers.
//
// The two viewers render the same deck from different-shaped view-models, but a
// few presentation atoms are identical between them. Those live here so a single
// source of truth backs both rather than each viewer re-declaring it.

import type { ReactElement } from "react";
import { token } from "../primitives/tokens";

/** The standard alpha scrim shared by both deck-viewer layouts. */
export function DeckViewerBackdrop(): ReactElement {
  return (
    <div
      aria-hidden="true"
      data-testid="deck-viewer-backdrop"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: token("--scrim-gallery"),
      }}
    />
  );
}

/** The centered muted message shared by the empty / no-match grid states. */
export function GridPlaceholder({ message }: { message: string }): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "40vh",
        font: token("--t-body"),
        color: token("--text-muted"),
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

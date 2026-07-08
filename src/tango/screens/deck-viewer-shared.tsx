// deck-viewer-shared — internals shared by the desktop and mobile deck viewers.
//
// The two viewers render the same deck from different-shaped view-models, but a
// few presentation atoms are identical between them. Those live here so a single
// source of truth backs both rather than each viewer re-declaring it.

import type { ReactElement } from "react";
import { token } from "../primitives/tokens";

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

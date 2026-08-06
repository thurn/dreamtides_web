import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";

export interface CoopPresenceStatusProps {
  /** Presence-derived connected client count, or null while it resolves. */
  readonly count: number | null;
  /** Explicit chrome state supplied by the app-shell view model. */
  readonly visible: boolean;
}

/** Compact Cumulus chrome for room-presence status. */
export function CoopPresenceStatus({
  count,
  visible,
}: CoopPresenceStatusProps): ReactElement | null {
  if (!visible) return null;
  return (
    <output
      data-connected-count
      data-coop-presence-status
      aria-live="polite"
      style={{
        ...glassSurfaceStyle({ radius: token("--radius-control") }),
        position: "fixed",
        top: token("--space-xs"),
        left: "50%",
        zIndex: 40,
        padding: token("--space-xs"),
        color: token("--text-on-glass-muted"),
        font: token("--t-eyebrow"),
        opacity: 0.72,
        pointerEvents: "none",
        transform: "translateX(-50%)",
      }}
    >
      {count === null ? "Connecting…" : `${String(count)} Connected`}
    </output>
  );
}

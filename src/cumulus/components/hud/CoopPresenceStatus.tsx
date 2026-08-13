import { one, other, plural, tx, txa } from "@trox/runtime";
import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

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
  const resolve = useLocalizer();
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
      {count === null
        ? resolve(
            tx(
              "Connecting…",
              "[coop] Presence status while the shared room connection is unresolved.",
            ),
          )
        : resolve(
            txa(
              plural(count, [one("1 Connected"), other("{count} Connected")]),
              { count },
              "[coop] Compact presence status showing the nonnegative number of connected clients; zero is possible.",
            ),
          )}
    </output>
  );
}

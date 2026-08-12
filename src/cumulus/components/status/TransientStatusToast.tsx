import { tx, type LocalizedString } from "@trox/runtime";
import type { ReactElement } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { Pressable } from "../../primitives/Pressable";
import { SAFE_AREA_INSET_PROPERTIES } from "../../primitives/safe-area";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** Structured text for a transient status; presentation owns its layout. */
export interface TransientStatusCopy {
  readonly title?: LocalizedString;
  readonly message: LocalizedString;
}

export interface TransientStatusToastProps {
  /** Structured player-facing copy. */
  readonly copy: TransientStatusCopy;
  /** Optional dismissal callback; lifecycle ownership remains outside Cumulus. */
  readonly onDismiss?: () => void;
}

/**
 * Fixed-position Cumulus transient status. Its placement, safe-area clearance,
 * press feedback, and visual material are internal; controllers supply
 * structured copy and an optional dismissal callback.
 */
export function TransientStatusToast({
  copy,
  onDismiss,
}: TransientStatusToastProps): ReactElement {
  const resolve = useLocalizer();
  return (
    <Pressable
      as="button"
      data-transient-status-toast="warning"
      data-coop-bounce-toast=""
      aria-live="assertive"
      aria-label={
        onDismiss === undefined
          ? undefined
          : resolve(
              tx(
                "Dismiss status",
                "Accessible action name for dismissing a transient player status message.",
              ),
            )
      }
      disabled={onDismiss === undefined}
      onClick={onDismiss}
      style={{
        ...glassSurfaceStyle({ radius: token("--radius-panel") }),
        position: "fixed",
        zIndex: 60,
        bottom: `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-l")})`,
        left: "50%",
        width: "min(90vw, 416px)",
        boxSizing: "border-box",
        padding: token("--space-m"),
        color: token("--text-on-glass"),
        textAlign: "center",
        transform: "translateX(-50%)",
      }}
    >
      <span role="alert" style={{ display: "grid", gap: token("--space-xs") }}>
        {copy.title !== undefined && (
          <strong style={{ font: token("--t-button") }}>
            {resolve(copy.title)}
          </strong>
        )}
        <span style={{ font: token("--t-body-sm") }}>
          {resolve(copy.message)}
        </span>
      </span>
    </Pressable>
  );
}

// GlassDialog + GlassBackdrop — the glass overlay shell.
//
// Two pieces of the frosted-overlay idiom that both deck viewers and the
// starting-deck modal share, lifted here so a screen assembles an overlay
// instead of re-declaring the glass geometry:
//
//   - GlassBackdrop: the full-bleed frosted-glass layer. It takes only the fill
//     and blur/saturate backdrop from the shared liquid-glass recipe — the rim,
//     radius, and drop shadow are floating-panel affordances that do not belong
//     on an edge-to-edge surface — so whatever scene sits behind it refracts
//     through as glass without a border at the screen edges. Kept a separate z0
//     layer (rather than a style on a host container) so sibling controls frost
//     the raw scene directly instead of double-frosting an ancestor glass
//     surface. An optional `children` slot lets a caller lift content above the
//     frost; childless, it is `aria-hidden` decoration.
//
//   - GlassDialog: a modal overlay built on GlassBackdrop — a bounded, centered
//     glass panel on desktop and a full-bleed frosted overlay on mobile, with a
//     hairline-closed header (title + optional subtitle + a trailing glass close
//     disc) over a scrolling body. It is the shell StartingDeckModal's chrome is
//     modeled on.
//
// The close disc is the shared `IconButton` at size `md` (48px) so the close
// matches the IconButton size scale rather than inventing a bespoke disc. The
// close-control PLACEMENT is kept internal to this component: today it always
// sits on the header's trailing edge, so a later cutout-aware placement (a
// `closeAnchor`-style option floating the disc beside a device island) is a
// non-breaking, additive extension.

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { useIsDesktop } from "../../screens/use-is-desktop";
import { IconButton } from "../controls/IconButton";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";

/** Props for {@link GlassBackdrop}. */
export interface GlassBackdropProps {
  /**
   * Optional content lifted above the frost. Childless, the backdrop is a bare
   * `aria-hidden` decorative layer; with children it hosts them over the frost.
   */
  children?: ReactNode;
}

/**
 * The full-bleed frosted-glass layer. Fills its positioned ancestor
 * (`position: absolute; inset: 0; zIndex: 0`) with the shared liquid-glass
 * material reduced to its three edge-to-edge properties — the translucent fill
 * plus the blur/saturate backdrop — so the scene behind refracts through as
 * glass. `aria-hidden` when childless.
 */
export function GlassBackdrop({ children }: GlassBackdropProps): ReactElement {
  const glass = glassSurfaceStyle();
  return (
    <div
      aria-hidden={children === undefined ? "true" : undefined}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: glass.background,
        backdropFilter: glass.backdropFilter,
        WebkitBackdropFilter: glass.WebkitBackdropFilter,
      }}
    >
      {children}
    </div>
  );
}

/** Props for {@link GlassDialog}. */
export interface GlassDialogProps {
  /** The dialog's heading, rendered as an `<h2>`. */
  title: string;
  /** Optional intro line under the title. */
  subtitle?: string;
  /** Dismisses the dialog; fires when the close disc is activated. */
  onClose: () => void;
  /** Accessible name for the close disc. Defaults to `"Close"`. */
  closeLabel?: string;
  /** The scrolling body content. */
  children: ReactNode;
}

/**
 * A `role="dialog" aria-modal="true"` overlay: a fixed full-screen layer over a
 * {@link GlassBackdrop}, holding a glass panel that is bounded and centered on
 * desktop (`maxWidth: min(900px, 90vw)`, `maxHeight: 85vh`) and full-bleed below
 * `DESKTOP_MIN_WIDTH`. The header pairs the title `<h2>` and optional subtitle
 * `<p>` with a trailing `IconButton size="md"` close, closed by a
 * `--border-strong` hairline; on mobile the header pads its top by the safe-area
 * inset so the title clears a device cutout. The body scrolls.
 */
export function GlassDialog({
  title,
  subtitle,
  onClose,
  closeLabel = "Close",
  children,
}: GlassDialogProps): ReactElement {
  const isDesktop = useIsDesktop();
  const glass = glassSurfaceStyle();

  // Desktop is a bounded, centered dialog; mobile is a full-bleed overlay whose
  // fill + blur stay but whose card rim, radius, and shadow drop so it reads
  // edge to edge.
  const panelStyle: CSSProperties = isDesktop
    ? {
        ...glass,
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: "min(900px, 90vw)",
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }
    : {
        ...glass,
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        position: "relative",
        zIndex: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      };

  const headerStyle: CSSProperties = {
    flexShrink: 0,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: token("--space-4"),
    borderBottom: `1px solid ${token("--border-strong")}`,
    ...(isDesktop
      ? { padding: token("--space-6") }
      : {
          // Clear a device screen cutout on the full-bleed overlay: the safe-area
          // inset carries the real (or mock-up) top inset, so the title drops
          // below the island rather than hiding under it.
          paddingTop: `max(var(--safe-area-inset-top), ${token("--gutter")})`,
          paddingRight: token("--gutter"),
          paddingLeft: token("--gutter"),
          paddingBottom: token("--space-4"),
        }),
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="tango"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isDesktop ? token("--space-7") : 0,
      }}
    >
      <GlassBackdrop />
      <div style={panelStyle}>
        <header style={headerStyle}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: token("--space-1"),
            }}
          >
            <h2
              style={{
                margin: 0,
                font: token("--t-title-sm"),
                color: token("--text-primary"),
              }}
            >
              {title}
            </h2>
            {subtitle !== undefined && (
              <p
                style={{
                  margin: 0,
                  font: token("--t-body"),
                  color: token("--text-primary"),
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <IconButton
            glyph={GLYPHS.close}
            size="md"
            label={closeLabel}
            onPress={onClose}
          />
        </header>
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: token("--space-5"),
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

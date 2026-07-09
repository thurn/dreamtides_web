// GlassDialog + GlassBackdrop — the glass overlay shell.
//
// Two pieces of the frosted-overlay idiom, lifted here so a screen assembles a
// glass dialog instead of re-declaring the material and geometry:
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
//   - GlassDialog: a modal overlay with a bounded, centered glass panel on
//     desktop and a full-bleed frosted overlay on mobile, with a hairline-closed
//     header (title + optional subtitle + a trailing glass close disc) over a
//     scrolling body.
//
// The close disc is the shared `IconButton` at size `md` (48px) so the close
// matches the IconButton size scale rather than inventing a bespoke disc. The
// close-control PLACEMENT is kept internal to this component: by default it sits
// on the header's trailing edge. When `cutoutAwareClose` is set and the dialog
// is full-bleed on a mobile mock-up with a known screen-cutout box, the disc
// instead floats up beside the device island (reclaiming the dead space next to
// it and letting the header title clear the safe area below). There is still
// exactly one close owner — the disc simply moves — so this is a non-breaking,
// additive extension.

import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { useIsDesktop } from "../../screens/use-is-desktop";
import { IconButton } from "../controls/IconButton";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";

/** Diameter (px) of the `md` IconButton close disc, for cutout-relative placement. */
const CLOSE_DISC_PX = 48;

/**
 * Panel width cap (px) for a `wide` desktop dialog — enough for a roomy grid to
 * lay out in two rows without internal scroll on a 16-inch-MacBook-class
 * viewport, while `min(…, 90vw)` still leaves margin on narrower desktops.
 */
const WIDE_PANEL_MAX_WIDTH_PX = 1120;

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
  /**
   * When true, on a full-bleed mobile overlay whose screen-cutout box is known
   * (a device-screenshot mock-up) the close disc floats up beside the device
   * island instead of sitting on the header row, so the header title clears the
   * safe area below it. No effect on desktop or on real hardware (where the
   * island geometry is not exposed). Defaults to `false`.
   */
  cutoutAwareClose?: boolean;
  /**
   * On desktop, widen the panel and trade the `85vh` height cap for explicit
   * viewport padding so a roomy grid fits in two rows without internal scroll.
   * No effect on the full-bleed mobile overlay. Defaults to `false`. A caller
   * gates this on its own roomy-desktop media query.
   */
  wide?: boolean;
  /** The scrolling body content. */
  children: ReactNode;
}

/**
 * A `role="dialog" aria-modal="true"` overlay: a fixed full-screen layer holding
 * a glass panel that is bounded and centered on desktop (`maxWidth: min(900px,
 * 90vw)`, `maxHeight: 85vh`) and full-bleed below `DESKTOP_MIN_WIDTH`, where the
 * mobile shell also carries the {@link GlassBackdrop}. With `wide`, the desktop
 * panel widens to
 * `min(1120px, 90vw)` and trades the `85vh` cap for explicit viewport padding so
 * a roomy grid fits in two rows without internal scroll. The header pairs the
 * title `<h2>` and optional subtitle
 * `<p>` with a trailing `IconButton size="md"` close, closed by a
 * `--border-strong` hairline; on mobile the header pads its top by the safe-area
 * inset so the title clears a device cutout. The body scrolls.
 */
export function GlassDialog({
  title,
  subtitle,
  onClose,
  closeLabel = "Close",
  cutoutAwareClose = false,
  wide = false,
  children,
}: GlassDialogProps): ReactElement {
  const isDesktop = useIsDesktop();
  const glass = glassSurfaceStyle();
  const wideDesktop = isDesktop && wide;

  // On a full-bleed mobile overlay whose screen-cutout box is known (a
  // device-screenshot mock-up), lift the close disc up beside the island. The
  // box is not exposed on real hardware, so the disc stays on the header
  // elsewhere. Resolved after mount (the injected box is a client-only signal).
  const [besideCutout, setBesideCutout] = useState(false);
  useEffect(() => {
    setBesideCutout(
      cutoutAwareClose && !isDesktop && hasInjectedDisplayCutout(),
    );
  }, [cutoutAwareClose, isDesktop]);

  // Desktop is a bounded, centered dialog; mobile is a full-bleed overlay whose
  // fill + blur stay but whose card rim, radius, and shadow drop so it reads
  // edge to edge.
  const panelStyle: CSSProperties = isDesktop
    ? {
        ...glass,
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: wideDesktop
          ? `min(${String(WIDE_PANEL_MAX_WIDTH_PX)}px, 90vw)`
          : "min(900px, 90vw)",
        maxHeight: wideDesktop
          ? `calc(100vh - ${token("--space-8")} - ${token("--space-8")})`
          : "85vh",
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

  const closeButton = (
    <IconButton
      placement="onGlass"
      glyph={GLYPHS.close}
      size="md"
      label={closeLabel}
      onPress={onClose}
    />
  );

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
        padding: isDesktop
          ? wideDesktop
            ? token("--space-8")
            : token("--space-7")
          : 0,
      }}
    >
      {!isDesktop && <GlassBackdrop />}
      <div style={panelStyle}>
        {besideCutout && (
          // The disc floats up beside the device island (vertically centered on
          // it, at the trailing gutter), so the header title clears the safe
          // area below rather than sharing the row with the disc.
          <div
            style={{
              position: "absolute",
              top: `calc(var(--display-cutout-top) + (var(--display-cutout-height) - ${String(
                CLOSE_DISC_PX,
              )}px) / 2)`,
              right: token("--gutter"),
              zIndex: 1,
            }}
          >
            {closeButton}
          </div>
        )}
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
                  color: token("--text-on-glass-muted"),
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {!besideCutout && closeButton}
        </header>
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: wideDesktop ? token("--space-6") : token("--space-5"),
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

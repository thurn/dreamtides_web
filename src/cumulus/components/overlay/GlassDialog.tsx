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
//     surface. It is `aria-hidden` decoration.
//
//   - GlassDialog: a modal overlay with a bounded, centered glass panel on
//     desktop and a full-bleed frosted overlay on mobile, plus a strict popup
//     presentation that stays bounded and content-sized at every viewport.
//     Standard chrome carries a hairline-closed header (title + optional
//     subtitle + an optional trailing glass close disc) over a scrolling body.
//     Titleless variants either overlay the disc or float it in prose flow.
//     Commit-gated dialogs omit `onClose` and expose no dismissal control.
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

import { meaning, tx } from "@trox/runtime";
import type { LocalizedString } from "@trox/runtime";
import { useEffect, useLayoutEffect, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import { IconButton } from "../controls/IconButton";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** Diameter (px) of the `md` IconButton close disc, for cutout-relative placement. */
const CLOSE_DISC_PX = 48;

/**
 * Desktop width (px) for a tangible popup companion. This matches the
 * canonical desktop Dreamwell-card presentation.
 */
const PAIRED_POPUP_DESKTOP_COMPANION_WIDTH_PX = 360;

/**
 * Desktop width (px) for the explanation panel paired with a tangible object.
 * Prose gets a wider measure than the object so it stays compact and readable.
 */
const PAIRED_POPUP_DESKTOP_PANEL_WIDTH_PX = 460;

/**
 * The full-bleed frosted-glass layer. Fills its positioned ancestor
 * (`position: absolute; inset: 0; zIndex: 0`) with the shared liquid-glass
 * material reduced to its three edge-to-edge properties — the translucent fill
 * plus the blur/saturate backdrop — so the scene behind refracts through as
 * glass. The layer is hidden from assistive technology.
 */
export function GlassBackdrop(): ReactElement {
  const glass = glassSurfaceStyle();
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: glass.background,
        backdropFilter: glass.backdropFilter,
        WebkitBackdropFilter: glass.WebkitBackdropFilter,
      }}
    />
  );
}

/** Props for {@link GlassDialog}. */
export interface GlassDialogProps {
  /** The dialog's heading, rendered as an `<h2>`. */
  title: LocalizedString;
  /** Optional intro line under the title. */
  subtitle?: LocalizedString;
  /**
   * Dismisses the dialog from its close disc. Omit for a commit-gated dialog
   * that intentionally exposes no dismissal control.
   */
  onClose?: () => void;
  /** Accessible name for the close disc. Defaults to `"Close"`. */
  closeLabel?: LocalizedString;
  /**
   * When true, on a full-bleed mobile overlay whose screen-cutout box is known
   * (a device-screenshot mock-up) the close disc floats up beside the device
   * island instead of sitting on the header row, so the header title clears the
   * safe area below it. No effect on desktop or on real hardware (where the
   * island geometry is not exposed). Defaults to `false`.
   */
  cutoutAwareClose?: boolean;
  /** Force the edge-to-edge takeover treatment at any viewport width. */
  fullScreen?: boolean;
  /**
   * Responsive behavior for the dialog surface. `"responsive"` uses the
   * standard bounded desktop panel and full-bleed mobile takeover. `"popup"`
   * keeps a centered, content-sized glass panel at every viewport width.
   * `fullScreen` takes precedence. Defaults to `"responsive"`.
   */
  presentation?: "responsive" | "popup";
  /**
   * Visible dialog chrome. `"standard"` renders the title/subtitle header and
   * its divider. `"flowing-close"` keeps `title` as the accessible dialog name,
   * omits the visible header, and floats the close disc in the scrolling body
   * so nearby prose wraps around its circular footprint. Defaults to
   * `"standard"`.
   */
  chrome?: "standard" | "flowing-close";
  /**
   * Region used to center a bounded desktop panel. `"battlefield"` measures
   * the visible `main[data-battle-mobile]` stage, keeping a docked inspector
   * rail outside the centering calculation while the modal layer continues to
   * block the complete viewport. Mobile and full-screen dialogs remain
   * viewport-aligned. Defaults to `"viewport"`.
   */
  desktopCenterTarget?: "viewport" | "battlefield";
  /**
   * Optional tangible object paired with a popup panel. On desktop the
   * companion leads a horizontal pair with a wider prose panel; on mobile it
   * sits centered above the panel. The complete pair is centered in the target
   * region. Only applies to `presentation="popup"`.
   */
  companion?: ReactNode;
  /** The scrolling body content. */
  children: ReactNode;
}

/**
 * A `role="dialog" aria-modal="true"` overlay: a fixed full-screen layer holding
 * a glass panel that is bounded and centered on desktop (`maxWidth: min(900px,
 * 90vw)`, `maxHeight: 85vh`) and full-bleed below `DESKTOP_MIN_WIDTH`, where the
 * mobile shell also carries the {@link GlassBackdrop}. The `"popup"`
 * presentation keeps the glass panel centered, bounded, and content-sized on
 * every viewport. The header pairs the
 * title `<h2>` and optional subtitle `<p>` with an optional trailing
 * `IconButton size="md"` close, closed by a `--border-strong` hairline; omit
 * `onClose` for a commit-gated dialog with no dismissal control. On mobile the
 * header pads its top by the safe-area inset so the title clears a device
 * cutout. The titleless chrome variants retain the accessible title while
 * omitting the visible header: `"flowing-close"` floats it in the body so
 * adjacent prose can wrap around the disc. The body scrolls.
 */
export function GlassDialog({
  title,
  subtitle,
  onClose,
  closeLabel,
  cutoutAwareClose = false,
  fullScreen = false,
  presentation = "responsive",
  chrome = "standard",
  desktopCenterTarget = "viewport",
  companion,
  children,
}: GlassDialogProps): ReactElement {
  const resolve = useLocalizer();
  const isDesktop = useIsDesktop();
  const glass = glassSurfaceStyle();
  const popup = presentation === "popup" && !fullScreen;
  const pairedPopup = popup && companion !== undefined;
  const boundedPanel = (isDesktop && !fullScreen) || popup;
  const fullBleed = !boundedPanel;
  const centerOnBattlefield =
    isDesktop && boundedPanel && desktopCenterTarget === "battlefield";
  const [battlefieldEndInset, setBattlefieldEndInset] = useState(0);

  useLayoutEffect(() => {
    if (!centerOnBattlefield) return;
    const battlefield = document.querySelector<HTMLElement>(
      "main[data-battle-mobile]",
    );
    if (battlefield === null) return;

    const measure = (): void => {
      setBattlefieldEndInset(
        Math.max(
          0,
          window.innerWidth - battlefield.getBoundingClientRect().right,
        ),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(battlefield);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [centerOnBattlefield]);

  // On a full-bleed mobile overlay whose screen-cutout box is known (a
  // device-screenshot mock-up), lift the close disc up beside the island. The
  // box is not exposed on real hardware, so the disc stays on the header
  // elsewhere. Resolved after mount (the injected box is a client-only signal).
  const [besideCutout, setBesideCutout] = useState(false);
  useEffect(() => {
    setBesideCutout(
      onClose !== undefined &&
        cutoutAwareClose &&
        chrome === "standard" &&
        fullBleed &&
        hasInjectedDisplayCutout(),
    );
  }, [chrome, cutoutAwareClose, fullBleed, onClose]);

  // Standard desktop and popup presentations are bounded glass panels. The
  // standard mobile presentation is a full-bleed overlay whose fill + blur stay
  // but whose card rim, radius, and shadow drop so it reads edge to edge.
  const panelStyle: CSSProperties = boundedPanel
    ? {
        ...glass,
        position: "relative",
        zIndex: 1,
        width: pairedPopup ? "100%" : popup ? "fit-content" : "100%",
        boxSizing: pairedPopup ? "border-box" : undefined,
        maxWidth: popup ? "100%" : "min(900px, 90vw)",
        maxHeight: popup ? "100%" : "85vh",
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
    gap: token("--space-s"),
    borderBottom: `1px solid ${token("--border-strong")}`,
    ...(boundedPanel
      ? { padding: token("--space-l") }
      : {
          // Clear a device screen cutout on the full-bleed overlay: the safe-area
          // inset carries the real (or mock-up) top inset, so the title drops
          // below the island rather than hiding under it.
          paddingTop: `max(${token("--safe-area-inset-top")}, ${token("--gutter")})`,
          paddingRight: token("--gutter"),
          paddingLeft: token("--gutter"),
          paddingBottom: token("--space-s"),
        }),
  };

  const closeButton =
    onClose === undefined ? null : (
      <IconButton
        placement="onGlass"
        glyph={GLYPHS.close}
        size="md"
        label={
          closeLabel ??
          tx(
            meaning("dialog-close", "Close"),
            "[accessibility] Action name for the control that dismisses a dialog.",
          )
        }
        onPress={onClose}
      />
    );
  const boundedPadding =
    popup && !isDesktop ? token("--gutter") : token("--space-xl");

  const panel = (
    <div data-glass-dialog-panel="" style={panelStyle}>
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
      {chrome === "standard" ? (
        <header style={headerStyle}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: token("--space-xxs"),
            }}
          >
            <h2
              style={{
                margin: 0,
                font: token("--t-title-sm"),
                color: token("--text-primary"),
              }}
            >
              {resolve(title)}
            </h2>
            {subtitle !== undefined && (
              <p
                style={{
                  margin: 0,
                  font: token("--t-body"),
                  color: token("--text-on-glass-muted"),
                }}
              >
                {resolve(subtitle)}
              </p>
            )}
          </div>
          {!besideCutout && closeButton}
        </header>
      ) : null}
      <div
        data-glass-dialog-body=""
        style={{
          flex: popup ? "0 1 auto" : "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: token("--space-m"),
        }}
      >
        {chrome === "flowing-close" && closeButton !== null ? (
          <div
            data-glass-dialog-flowing-close=""
            style={{
              float: "right",
              marginTop: token("--space-xxs"),
              marginRight: token("--space-xxs"),
              shapeOutside: "circle(50%)",
              shapeMargin: token("--space-xs"),
            }}
          >
            {closeButton}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={resolve(title)}
      className="cumulus"
      data-glass-dialog-desktop-center-target={desktopCenterTarget}
      data-glass-dialog-presentation={presentation}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: boundedPanel ? boundedPadding : 0,
        paddingBottom: boundedPanel ? boundedPadding : 0,
        paddingLeft: boundedPanel ? boundedPadding : 0,
        paddingRight: boundedPanel
          ? centerOnBattlefield
            ? `calc(${boundedPadding} + ${String(battlefieldEndInset)}px)`
            : boundedPadding
          : 0,
      }}
    >
      {fullBleed && <GlassBackdrop />}
      {pairedPopup ? (
        <div
          data-glass-dialog-companion-layout={
            isDesktop ? "horizontal" : "vertical"
          }
          style={{
            position: "relative",
            zIndex: 1,
            display: "grid",
            gridTemplateColumns: isDesktop
              ? `${String(PAIRED_POPUP_DESKTOP_COMPANION_WIDTH_PX)}px minmax(0, ${String(PAIRED_POPUP_DESKTOP_PANEL_WIDTH_PX)}px)`
              : "minmax(0, 1fr)",
            gap: token(isDesktop ? "--space-xl" : "--space-m"),
            alignItems: "center",
            width: isDesktop
              ? `calc(${String(PAIRED_POPUP_DESKTOP_COMPANION_WIDTH_PX + PAIRED_POPUP_DESKTOP_PANEL_WIDTH_PX)}px + ${token("--space-xl")})`
              : `calc(100vw - ${token("--gutter")} - ${token("--gutter")})`,
            maxWidth: isDesktop
              ? "100%"
              : `${String(PAIRED_POPUP_DESKTOP_PANEL_WIDTH_PX)}px`,
            maxHeight: "100%",
          }}
        >
          <div
            data-glass-dialog-companion=""
            style={{
              minWidth: 0,
              minHeight: 0,
              width: isDesktop ? "100%" : "76vw",
              maxWidth: isDesktop ? undefined : "340px",
              justifySelf: isDesktop ? undefined : "center",
            }}
          >
            {companion}
          </div>
          {panel}
        </div>
      ) : (
        panel
      )}
    </div>
  );
}

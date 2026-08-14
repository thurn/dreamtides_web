// GlassPanel — the shared titled liquid-glass content container.

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { LocalizedString } from "@trox/runtime";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import { token } from "../../primitives/tokens";
import type { DomTestId } from "../../types/dom";
import { GlassButton, type GlassButtonProps } from "../controls/GlassButton";
import { IconButton, type IconButtonProps } from "../controls/IconButton";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** GlassButton props available inside a panel-owned accessory placement. */
export type GlassPanelGlassButtonProps = Omit<GlassButtonProps, "placement">;

/** IconButton props available inside a panel-owned accessory placement. */
export type GlassPanelIconButtonProps = Omit<IconButtonProps, "placement">;

/** A labeled control rendered at the trailing edge of a GlassPanel header. */
export interface GlassPanelGlassButtonAccessory {
  kind: "glassButton";
  /** Props forwarded to the labeled control; placement is panel-owned. */
  button: GlassPanelGlassButtonProps;
}

/** An icon control rendered at the trailing edge of a GlassPanel header. */
export interface GlassPanelIconButtonAccessory {
  kind: "iconButton";
  /** Props forwarded to the icon control; placement is panel-owned. */
  button: GlassPanelIconButtonProps;
}

/**
 * A structured control rendered at the trailing edge of a GlassPanel header.
 * Each branch carries the control's public props while the panel owns placement.
 */
export type GlassPanelAccessory =
  GlassPanelGlassButtonAccessory | GlassPanelIconButtonAccessory;

/** The panel frame geometry and material. */
export type GlassPanelFrame = "floating" | "fullBleed" | "edgeRail";

/** Named corner geometry for the floating panel. */
export type GlassPanelRadius = "panel" | "popover" | "control";

/** Named tint for the floating liquid-glass material. */
export type GlassPanelTint = "default" | "popover";

/** Header padding presets shared by titled panels. */
export type GlassPanelHeaderSpacing =
  "compact" | "medium" | "regular" | "spacious";

/** Title voice for a standard panel heading or a large character dossier. */
export type GlassPanelTitleVoice = "standard" | "hero";

export interface GlassPanelProps {
  /** Optional uppercase context line rendered above the title. */
  eyebrow?: LocalizedString;
  /** Optional plain panel title. */
  title?: LocalizedString;
  /** Optional supporting line rendered beneath the title. */
  subtitle?: LocalizedString;
  /** Semantic heading element for the title. Defaults to `h2`. */
  headingLevel?: "h1" | "h2";
  /** Title and subtitle typography. Defaults to `standard`. */
  titleVoice?: GlassPanelTitleVoice;
  /** Header padding preset. Defaults to `regular`. */
  headerSpacing?: GlassPanelHeaderSpacing;
  /** Draw the standard divider below the header. Defaults to `true`. */
  headerDivider?: boolean;
  /**
   * Optional structured action at the trailing edge of the header. On desktop,
   * prefer an intent-labeled `glassButton`, such as “Leave” on a shop screen;
   * a generic X `iconButton` is discouraged for panel navigation.
   */
  rightAccessory?: GlassPanelAccessory;
  /** Float the accessory beside an injected display cutout when present. */
  cutoutAwareAccessory?: boolean;
  /** Floating glass, edge-attached rail glass, or the standard full-bleed gallery scrim. */
  frame?: GlassPanelFrame;
  /** Named corner geometry for a floating panel. Defaults to `panel`. */
  radius?: GlassPanelRadius;
  /** Floating glass tint. Defaults to `default`. */
  tint?: GlassPanelTint;
  /** Clip content to the panel edge. Defaults to `hidden`. */
  overflow?: "hidden" | "visible";
  /** Panel body content. */
  children: ReactNode;
  /** Optional footer content rendered after the body. */
  footer?: ReactNode;
  /** Stable test id for the panel root. */
  testId?: DomTestId;
}

const FLOATING_ACCESSORY_PX = 48;

function radiusToken(radius: GlassPanelRadius): string {
  if (radius === "popover") return token("--radius-compact");
  if (radius === "control") return token("--radius-control");
  return token("--radius-panel");
}

function headerPadding(spacing: GlassPanelHeaderSpacing): string {
  if (spacing === "compact") return token("--space-m");
  if (spacing === "medium") return token("--space-l");
  if (spacing === "spacious") return token("--space-3xl");
  return token("--space-2xl");
}

function accessoryNode(
  accessory: GlassPanelAccessory,
  placement: GlassControlPlacement,
): ReactElement {
  if (accessory.kind === "glassButton") {
    return <GlassButton {...accessory.button} placement={placement} />;
  }
  return <IconButton {...accessory.button} placement={placement} />;
}

/**
 * Shared liquid-glass panel with structured header, body, and footer slots.
 * Floating panels always hug those slots; callers cannot stretch glass around
 * unassigned interior space. Edge rails and full-bleed frames fill their
 * frame-owned height so their named scrolling layouts remain bounded.
 */
export function GlassPanel({
  eyebrow,
  title,
  subtitle,
  headingLevel = "h2",
  titleVoice = "standard",
  headerSpacing = "regular",
  headerDivider = true,
  rightAccessory,
  cutoutAwareAccessory = false,
  frame = "floating",
  radius = "panel",
  tint = "default",
  overflow = "hidden",
  children,
  footer,
  testId,
}: GlassPanelProps): ReactElement {
  const resolve = useLocalizer();
  const [besideCutout, setBesideCutout] = useState(false);
  useEffect(() => {
    setBesideCutout(cutoutAwareAccessory && hasInjectedDisplayCutout());
  }, [cutoutAwareAccessory]);

  const Heading = headingLevel;
  const hasHeader =
    eyebrow !== undefined ||
    title !== undefined ||
    subtitle !== undefined ||
    rightAccessory !== undefined;
  const accessory =
    rightAccessory === undefined
      ? null
      : accessoryNode(
          rightAccessory,
          frame === "fullBleed" ? "onMedia" : "onGlass",
        );
  const floatingMaterial = {
    ...glassSurfaceStyle({ radius: radiusToken(radius) }),
    ...(tint === "popover"
      ? {
          background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
        }
      : {}),
  };
  const fillsFrame = frame !== "floating";

  return (
    <section
      data-testid={testId}
      data-glass-panel-frame={frame}
      data-glass-panel-radius={radius}
      data-glass-panel-tint={tint}
      data-glass-panel-height-contract={fillsFrame ? "frame" : "content"}
      style={{
        ...(frame === "fullBleed"
          ? {
              background: token("--scrim-gallery"),
              border: "none",
              borderRadius: 0,
              boxShadow: "none",
            }
          : {
              ...floatingMaterial,
              ...(frame === "edgeRail" ? { borderRadius: 0 } : {}),
            }),
        position: "relative",
        width: "100%",
        height: fillsFrame ? "100%" : "fit-content",
        minWidth: 0,
        minHeight: 0,
        maxWidth: "100%",
        maxHeight: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow,
        color: token("--text-on-glass"),
        pointerEvents: "auto",
      }}
    >
      {besideCutout && accessory !== null && (
        <div
          style={{
            position: "absolute",
            top: `calc(var(--display-cutout-top) + (var(--display-cutout-height) - ${String(
              FLOATING_ACCESSORY_PX,
            )}px) / 2)`,
            right: token("--gutter"),
            zIndex: 1,
          }}
        >
          {accessory}
        </div>
      )}
      {hasHeader && (
        <header
          data-glass-panel-header=""
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: token("--space-s"),
            borderBottom: headerDivider
              ? `1px solid ${token("--border-strong")}`
              : undefined,
            padding: headerPadding(headerSpacing),
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap:
                titleVoice === "hero"
                  ? token("--space-xs")
                  : token("--space-xxs"),
              minWidth: 0,
            }}
          >
            {eyebrow !== undefined && (
              <span
                style={{
                  font: token("--t-eyebrow"),
                  letterSpacing: token("--tracking-eyebrow"),
                  color: token("--text-on-glass-muted"),
                  textTransform: "uppercase",
                }}
              >
                {resolve(eyebrow)}
              </span>
            )}
            {title !== undefined ? (
              <Heading
                style={{
                  margin: 0,
                  font:
                    titleVoice === "hero"
                      ? token("--t-hero")
                      : token("--t-title-sm"),
                  color: token("--text-on-glass"),
                  letterSpacing: 0,
                }}
              >
                {resolve(title)}
              </Heading>
            ) : null}
            {subtitle !== undefined && (
              <p
                style={{
                  margin: 0,
                  font:
                    titleVoice === "hero"
                      ? token("--t-hero-epithet")
                      : token("--t-body"),
                  fontStyle: titleVoice === "hero" ? "italic" : undefined,
                  color: token("--text-on-glass-muted"),
                }}
              >
                {resolve(subtitle)}
              </p>
            )}
          </div>
          {!besideCutout && accessory}
        </header>
      )}
      <div
        data-glass-panel-content=""
        style={{
          flex: fillsFrame ? "1 1 auto" : "0 1 auto",
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
      {footer !== undefined && (
        <footer data-glass-panel-footer="" style={{ flexShrink: 0 }}>
          {footer}
        </footer>
      )}
    </section>
  );
}

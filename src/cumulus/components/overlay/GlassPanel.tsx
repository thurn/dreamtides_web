// GlassPanel — the shared titled liquid-glass content container.

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  GlassButton,
  type GlassButtonVariant,
  type GlassButtonWidthReservation,
} from "../controls/GlassButton";
import { IconButton, type IconButtonSize } from "../controls/IconButton";

/** A structured action rendered at the trailing edge of a GlassPanel header. */
export type GlassPanelAccessory =
  | {
      kind: "glassButton";
      label: string;
      onPress: () => void;
      glyph?: Glyph;
      disabled?: boolean;
      /** Optional numerical essence cost rendered after the label. */
      essenceCost?: number | null;
      /** Dynamic label/essence-cost states whose widest footprint is reserved. */
      widthReservations?: readonly GlassButtonWidthReservation[];
      /** Semantic surface treatment for the action. */
      variant?: GlassButtonVariant;
      /** A `data-testid` for selecting the button in tests. */
      testId?: string;
    }
  | {
      kind: "iconButton";
      glyph: Glyph;
      label: string;
      onPress: () => void;
      disabled?: boolean;
      size?: IconButtonSize;
      /** A `data-testid` for selecting the disc in tests. */
      testId?: string;
    };

/** The panel frame geometry and material. */
export type GlassPanelFrame = "floating" | "fullBleed";

/** Named corner geometry for the floating panel. */
export type GlassPanelRadius = "panel" | "popover" | "control";

/** Named tint for the floating liquid-glass material. */
export type GlassPanelTint = "default" | "popover";

/** Header padding presets shared by titled panels. */
export type GlassPanelHeaderSpacing =
  "compact" | "medium" | "regular" | "spacious";

/** Title voice for a standard panel heading or a large character dossier. */
export type GlassPanelTitleVoice = "standard" | "hero";

/** Text alignment for the structured panel header. */
export type GlassPanelHeaderAlign = "start" | "center";

export interface GlassPanelProps {
  /** Optional uppercase context line rendered above the title. */
  eyebrow?: string;
  /** Optional panel title. Supplying any header copy renders the header. */
  title?: string;
  /** Optional supporting line rendered beneath the title. */
  subtitle?: string;
  /** Semantic heading element for the title. Defaults to `h2`. */
  headingLevel?: "h1" | "h2";
  /** Title and subtitle typography. Defaults to `standard`. */
  titleVoice?: GlassPanelTitleVoice;
  /** Header text alignment. Defaults to `start`. */
  headerAlign?: GlassPanelHeaderAlign;
  /** Header padding preset. Defaults to `regular`. */
  headerSpacing?: GlassPanelHeaderSpacing;
  /** Draw the standard divider below the header. Defaults to `true`. */
  headerDivider?: boolean;
  /** Optional structured action at the trailing edge of the header. */
  rightAccessory?: GlassPanelAccessory;
  /** Float the accessory beside an injected display cutout when present. */
  cutoutAwareAccessory?: boolean;
  /** Floating glass or the standard full-bleed gallery scrim. */
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
  testId?: string;
}

const FLOATING_ACCESSORY_PX = 48;

function radiusToken(radius: GlassPanelRadius): string {
  if (radius === "popover") return token("--radius-popover");
  if (radius === "control") return token("--radius-control");
  return token("--radius-panel");
}

function headerPadding(spacing: GlassPanelHeaderSpacing): string {
  if (spacing === "compact") return token("--space-5");
  if (spacing === "medium") return token("--space-6");
  if (spacing === "spacious") return token("--space-9");
  return token("--space-8");
}

function accessoryNode(
  accessory: GlassPanelAccessory,
  placement: GlassControlPlacement,
): ReactElement {
  if (accessory.kind === "glassButton") {
    return (
      <GlassButton
        placement={placement}
        label={accessory.label}
        glyph={accessory.glyph}
        disabled={accessory.disabled}
        essenceCost={accessory.essenceCost}
        widthReservations={accessory.widthReservations}
        variant={accessory.variant}
        testId={accessory.testId}
        onPress={accessory.onPress}
      />
    );
  }
  return (
    <IconButton
      placement={placement}
      glyph={accessory.glyph}
      size={accessory.size}
      label={accessory.label}
      disabled={accessory.disabled}
      testId={accessory.testId}
      onPress={accessory.onPress}
    />
  );
}

/** Shared liquid-glass panel with structured header, body, and footer slots. */
export function GlassPanel({
  eyebrow,
  title,
  subtitle,
  headingLevel = "h2",
  titleVoice = "standard",
  headerAlign = "start",
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

  return (
    <section
      data-testid={testId}
      data-glass-panel-frame={frame}
      data-glass-panel-radius={radius}
      data-glass-panel-tint={tint}
      style={{
        ...(frame === "floating"
          ? floatingMaterial
          : {
              background: token("--scrim-gallery"),
              border: "none",
              borderRadius: 0,
              boxShadow: "none",
            }),
        position: "relative",
        width: "100%",
        height: "100%",
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
            gap: token("--space-4"),
            borderBottom: headerDivider
              ? `1px solid ${token("--border-strong")}`
              : undefined,
            padding: headerPadding(headerSpacing),
            textAlign: headerAlign === "center" ? "center" : "left",
          }}
        >
          <div
            style={{
              display: "flex",
              flex: headerAlign === "center" ? "1 1 auto" : undefined,
              flexDirection: "column",
              alignItems: headerAlign === "center" ? "center" : undefined,
              gap:
                titleVoice === "hero" ? token("--space-3") : token("--space-1"),
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
                {eyebrow}
              </span>
            )}
            {title !== undefined && (
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
                {title}
              </Heading>
            )}
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
                {subtitle}
              </p>
            )}
          </div>
          {!besideCutout && accessory}
        </header>
      )}
      <div
        data-glass-panel-content=""
        style={{
          flex: "1 1 auto",
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

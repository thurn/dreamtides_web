// DreamcallerPortrait — the ONE way to render a dreamcaller's character art.
// Three fixed framings (`variant`): a large `hero` showcase, a square `panel`
// for profile cards / popovers, and a small square `thumb` for HUD rows and
// resident lists. The frame (radius, border, sunken backing, shadow) and the
// per-variant image crop ARE the design system's; a caller supplies only the
// dreamcaller data, the variant, and an optional pixel `size`.
//
// When the art asset 404s the portrait falls back to a tinted monogram disc so
// a missing image never leaves an empty hole.
//
// There is no style/className escape hatch. To size the portrait pass `size`
// (a fixed pixel width — the portrait then refuses to shrink in a flex row);
// omit it to fill the caller's container width. For any other layout
// (margins, decorative glow), wrap the portrait in your own element.

import { useState, type CSSProperties } from "react";
import { assetUrl } from "../../../runtime/asset-url";
import { token } from "../../primitives/tokens";

/** The minimal dreamcaller shape a portrait needs: which art to load and the
 * name/title that back the alt text and the fallback monogram. */
export interface DreamcallerVisual {
  imageNumber: string;
  name: string;
  title: string;
}

/** Which framing the portrait renders. */
export type DreamcallerPortraitVariant = "hero" | "panel" | "thumb";

export interface DreamcallerPortraitProps {
  /** The dreamcaller whose art and identity the portrait shows. */
  dreamcaller: DreamcallerVisual;
  /** Framing: large `hero`, square `panel`, or small square `thumb`. Default `panel`. */
  variant?: DreamcallerPortraitVariant;
  /**
   * Fixed pixel width. Panel/thumb stay square, so this also sets their height.
   * A sized portrait never shrinks in a flex row. Omit to fill the container
   * width.
   */
  size?: number;
}

/** Per-variant frame chrome (radius / border / sunken backing / shadow). */
function frameStyle(variant: DreamcallerPortraitVariant): CSSProperties {
  switch (variant) {
    case "hero":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-panel"),
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-mid")}`,
        boxShadow: token("--shadow-card"),
      };
    case "panel":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-control"),
        aspectRatio: "1 / 1",
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-mid")}`,
      };
    case "thumb":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-inset"),
        aspectRatio: "1 / 1",
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-mid")}`,
      };
  }
}

/** Per-variant crop: each variant frames the character's face consistently. */
function imageStyle(variant: DreamcallerPortraitVariant): CSSProperties {
  switch (variant) {
    case "hero":
      return {
        width: "100%",
        height: "auto",
        display: "block",
        transform: "scale(2)",
        transformOrigin: "50% 15%",
      };
    case "panel":
      return {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: "50% 24%",
        transform: "scale(1.18)",
        transformOrigin: "50% 18%",
      };
    case "thumb":
      return {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: "50% 22%",
        transform: "scale(1.22)",
        transformOrigin: "50% 18%",
      };
  }
}

/** The tinted-monogram fallback shown when the art asset fails to load. */
function fallbackStyle(variant: DreamcallerPortraitVariant): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: variant === "hero" ? 220 : undefined,
    height: variant === "hero" ? undefined : "100%",
    aspectRatio: variant === "hero" ? undefined : "1 / 1",
    background: `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--gold")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`,
    color: token("--text-primary"),
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

/** Resolve the hosted art URL for a dreamcaller's image number. */
export function dreamcallerImageSrc(imageNumber: string): string {
  return assetUrl(`/dreamcallers/${imageNumber}.png`);
}

export function DreamcallerPortrait({
  dreamcaller,
  variant = "panel",
  size,
}: DreamcallerPortraitProps) {
  const [broken, setBroken] = useState(false);
  const alt = `${dreamcaller.name}, ${dreamcaller.title}`;
  const sizeStyle: CSSProperties =
    size === undefined
      ? { width: "100%" }
      : { width: size, flex: "none" };

  return (
    // `tango` carries the design-token scope so the frame tokens resolve when
    // the portrait is mounted outside a `.tango` subtree (e.g. a quest screen).
    <div className="tango" style={{ ...frameStyle(variant), ...sizeStyle }}>
      {broken ? (
        <div style={fallbackStyle(variant)}>
          <span
            style={{
              fontSize: variant === "thumb" ? 12 : variant === "panel" ? 22 : 42,
            }}
          >
            {dreamcaller.name.charAt(0)}
          </span>
        </div>
      ) : (
        <img
          src={dreamcallerImageSrc(dreamcaller.imageNumber)}
          alt={alt}
          style={imageStyle(variant)}
          onError={() => {
            setBroken(true);
          }}
        />
      )}
    </div>
  );
}

// DreamcallerPortrait — the ONE way to render a dreamcaller's character art.
// Five framings (`variant`). Three are self-framing squares/showcases: a large
// `hero`, a square `panel` for profile cards / popovers, and a small square
// `thumb` for HUD rows and resident lists. Two are full-bleed fills for a
// caller's own `position:relative` stage: `standing` (an unframed cutout over a
// soft ambient glow, feet anchored to the stage floor — the desktop
// Dreamcaller-select column) and `fullBleed` (an edge-to-edge cinematic cutout
// over a tinted backdrop — the mobile carousel page). The art is the
// transparent full-body cutout standing on a tinted radial backdrop. The frame
// (radius, border, backdrop, shadow) and the per-variant image crop ARE the
// design system's; a caller supplies only the dreamcaller data, the variant,
// and an optional pixel `size`.
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
export type DreamcallerPortraitVariant =
  | "hero"
  | "panel"
  | "thumb"
  | "standing"
  | "fullBleed";

/** The self-framing variants: each renders its own square/showcase frame chrome
 * and per-variant crop. `standing`/`fullBleed` instead fill a caller's stage. */
type FramedVariant = "hero" | "panel" | "thumb";

/** Grows the standing cutout art from the feet past the column width so the
 * figure reads larger while the feet — and the console card riding over the
 * legs — stay anchored to the stage floor. */
const PORTRAIT_STANDING_SCALE = 1.2;

/** Per-variant image crop: each framed variant zooms its render so the
 * character's face fills the frame consistently. Bespoke framing factors, named
 * so they read as intentional crops rather than magic numbers in a transform. */
const HERO_CROP_SCALE = 2;
const PANEL_CROP_SCALE = 1.18;
const THUMB_CROP_SCALE = 1.22;

export interface DreamcallerPortraitProps {
  /** The dreamcaller whose art and identity the portrait shows. */
  dreamcaller: DreamcallerVisual;
  /**
   * Framing: self-framing `hero` / `panel` / `thumb`, or the full-bleed stage
   * fills `standing` (desktop column) and `fullBleed` (mobile carousel).
   * Default `panel`.
   */
  variant?: DreamcallerPortraitVariant;
  /**
   * Fixed pixel width. Panel/thumb stay square, so this also sets their height.
   * A sized portrait never shrinks in a flex row. Omit to fill the container
   * width. Ignored by `standing`/`fullBleed`, which fill the caller's stage.
   */
  size?: number;
}

/** The tinted radial scene the transparent cutout stands on. Shared with the
 * monogram fallback so a portrait reads the same whether the art loads. */
function portraitBackdrop(): string {
  return `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--gold")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`;
}

/** Per-variant frame chrome (radius / border / tinted backing / shadow). */
function frameStyle(variant: FramedVariant): CSSProperties {
  switch (variant) {
    case "hero":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-panel"),
        background: portraitBackdrop(),
        border: `1px solid ${token("--border-mid")}`,
        boxShadow: token("--shadow-card"),
      };
    case "panel":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-control"),
        aspectRatio: "1 / 1",
        background: portraitBackdrop(),
        border: `1px solid ${token("--border-mid")}`,
      };
    case "thumb":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-inset"),
        aspectRatio: "1 / 1",
        background: portraitBackdrop(),
        border: `1px solid ${token("--border-mid")}`,
      };
  }
}

/** Per-variant crop: each variant frames the character's face consistently. */
function imageStyle(variant: FramedVariant): CSSProperties {
  switch (variant) {
    case "hero":
      return {
        width: "100%",
        height: "auto",
        display: "block",
        transform: `scale(${String(HERO_CROP_SCALE)})`,
        transformOrigin: "50% 15%",
      };
    case "panel":
      return {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: "50% 24%",
        transform: `scale(${String(PANEL_CROP_SCALE)})`,
        transformOrigin: "50% 18%",
      };
    case "thumb":
      return {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: "50% 22%",
        transform: `scale(${String(THUMB_CROP_SCALE)})`,
        transformOrigin: "50% 18%",
      };
  }
}

/** The tinted-monogram fallback shown when the art asset fails to load. */
function fallbackStyle(variant: FramedVariant): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: variant === "hero" ? 220 : undefined,
    height: variant === "hero" ? undefined : "100%",
    aspectRatio: variant === "hero" ? undefined : "1 / 1",
    background: portraitBackdrop(),
    color: token("--text-primary"),
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

/** Resolve the hosted URL of a dreamcaller's full scene render. */
export function dreamcallerImageSrc(imageNumber: string): string {
  return assetUrl(`/dreamcallers/${imageNumber}.png`);
}

/** Resolve the hosted URL of a dreamcaller's transparent full-body cutout. */
export function dreamcallerCutoutSrc(imageNumber: string): string {
  return assetUrl(`/dreamcallers/cutout/${imageNumber}.png`);
}

export function DreamcallerPortrait({
  dreamcaller,
  variant = "panel",
  size,
}: DreamcallerPortraitProps) {
  const [broken, setBroken] = useState(false);
  const alt = `${dreamcaller.name}, ${dreamcaller.title}`;

  // The full-bleed stage fills — `standing` (desktop column) and `fullBleed`
  // (mobile carousel) — return a BARE FRAGMENT (no `.tango` wrapper) so a
  // caller's `PortraitName`/`Motes` overlay siblings still stack in the same
  // `position:relative` stage. `size` is ignored: they fill the stage.
  if (variant === "standing") {
    // A soft ambient glow the cutout stands in, centered low over the feet.
    const glow = (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(72% 56% at 50% 62%, color-mix(in srgb, ${token("--accent")} 26%, transparent) 0%, color-mix(in srgb, ${token("--gold")} 10%, transparent) 46%, transparent 72%)`,
          pointerEvents: "none",
        }}
      />
    );
    if (broken) {
      return (
        <>
          {glow}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: portraitBackdrop(),
                color: token("--text-primary"),
                fontWeight: 800,
                fontSize: 56,
                letterSpacing: "0.08em",
              }}
            >
              {dreamcaller.name.charAt(0)}
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        {glow}
        <img
          src={dreamcallerCutoutSrc(dreamcaller.imageNumber)}
          alt={alt}
          draggable={false}
          fetchPriority="high"
          loading="eager"
          decoding="async"
          onError={() => {
            setBroken(true);
          }}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            // Feet on the floor of the stage: the head keeps the cutout's own
            // headroom for the floating name, and the legs drop to the bottom
            // where the console card rides over them.
            objectPosition: "50% 100%",
            // Grow the art from the feet: the cutout is contained within the
            // column width, so scaling here is how it reads larger (overflowing
            // the column) while the feet — and thus the card that rides over the
            // legs — stay anchored to the stage floor.
            transform: `scale(${String(PORTRAIT_STANDING_SCALE)})`,
            transformOrigin: "50% 100%",
            userSelect: "none",
          }}
        />
      </>
    );
  }

  if (variant === "fullBleed") {
    // The tinted cinematic backdrop the edge-to-edge cutout stands on.
    const backdrop = (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 85% at 50% 24%, color-mix(in srgb, ${token("--gold")} 16%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 22%, transparent) 46%, ${token("--bg-sunken")} 100%)`,
        }}
      />
    );
    if (broken) {
      return (
        <>
          {backdrop}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: token("--text-primary"),
              fontWeight: 800,
              fontSize: 64,
              letterSpacing: "0.08em",
            }}
          >
            {dreamcaller.name.charAt(0)}
          </div>
        </>
      );
    }
    return (
      <>
        {backdrop}
        <img
          src={dreamcallerCutoutSrc(dreamcaller.imageNumber)}
          alt={alt}
          draggable={false}
          // The figure is the page's hero image — the cinematic focus the whole
          // layout is built around — so it must paint as early as possible rather
          // than fading in after the chrome. Fetch it eagerly at high priority and
          // decode async so it lands with the first frame.
          fetchPriority="high"
          loading="eager"
          decoding="async"
          onError={() => {
            setBroken(true);
          }}
          style={{
            position: "absolute",
            // Slightly wider than the page so the width-limited `contain` fit
            // renders the figure large: on a phone the head rises to just below
            // the title instead of leaving a dead band of backdrop between them.
            left: "-6%",
            bottom: 0,
            width: "112%",
            height: "96%",
            objectFit: "contain",
            objectPosition: "50% 100%",
            userSelect: "none",
          }}
        />
      </>
    );
  }

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
          src={dreamcallerCutoutSrc(dreamcaller.imageNumber)}
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

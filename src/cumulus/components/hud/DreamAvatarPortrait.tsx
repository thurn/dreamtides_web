// DreamAvatarPortrait — the shared framed and stage-filling DreamAvatar art surface.
// Six framings (`variant`). Three are self-framing squares/showcases: a large
// `hero`, a square `panel` for profile cards / popovers, and a small square
// `thumb` for HUD rows and resident lists. Three are full-bleed fills for a
// caller's own `position:relative` stage: `standing` (an unframed cutout over a
// soft ambient glow, feet anchored to the stage floor — the desktop
// DreamAvatar-select column), `cutout` (the unframed art alone, for scenes that
// must remain completely untouched), and `fullBleed` (an edge-to-edge cinematic
// cutout over a tinted backdrop — the mobile carousel page). Framed variants
// composite the transparent full-body cutout over an opaque light-gray
// backdrop so scene art cannot show through the portrait. The frame (radius,
// border, backdrop, shadow) and the per-variant image crop ARE the design
// system's; a caller supplies only the dreamAvatar data, the variant, and an
// optional pixel `size`.
//
// When the art asset 404s the portrait falls back to a tinted monogram disc so
// a missing image never leaves an empty hole.
//
// There is no style/className escape hatch. To size the portrait pass `size`
// (a fixed pixel width — the portrait then refuses to shrink in a flex row);
// omit it to fill the caller's container width. For any other layout
// (margins, decorative glow), wrap the portrait in your own element.

import { useRef, useState, type CSSProperties } from "react";
import { assetUrl } from "../../../runtime/asset-url";
import type { DreamAvatarPortraitFocus } from "../../../types/content";
import { token } from "../../primitives/tokens";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { artRef, type ArtRef } from "../../primitives/art";
import { richText } from "../card/rich-text";
import { rulesTextDefinitionCards } from "../card/rules-text-reveal";
import type { RevealSpec } from "../../internal/reveal/model";

/** The minimal dreamAvatar shape a portrait needs: which art to load and the
 * name/title that back the alt text and the fallback monogram. */
export interface DreamAvatarVisual {
  imageNumber: string;
  name: string;
  title: string;
  /** Normalized head position used to center subject-aware crops. */
  portraitFocus?: DreamAvatarPortraitFocus;
}

/** Neutral fallback for older room snapshots that predate authored focus data. */
export const DEFAULT_DREAM_AVATAR_PORTRAIT_FOCUS: DreamAvatarPortraitFocus = {
  x: 0.5,
  y: 0.2,
};

/** Clamp authored focus data before it reaches CSS geometry. */
export function dreamAvatarPortraitFocus(
  dreamAvatar: DreamAvatarVisual,
): DreamAvatarPortraitFocus {
  const focus = dreamAvatar.portraitFocus ?? DEFAULT_DREAM_AVATAR_PORTRAIT_FOCUS;
  return {
    x: Math.max(0, Math.min(1, focus.x)),
    y: Math.max(0, Math.min(1, focus.y)),
  };
}

/** Which framing the portrait renders. */
export type DreamAvatarPortraitVariant =
  | "hero"
  | "panel"
  | "thumb"
  | "standing"
  | "cutout"
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
const THUMB_CROP_SCALE = 2.9;

/** Vertical target for the authored head point in the mobile showcase. */
const FULL_BLEED_HEAD_Y = "27%";

export interface DreamAvatarPortraitProps {
  /** The dreamAvatar whose art and identity the portrait shows. */
  dreamAvatar: DreamAvatarVisual;
  /**
   * Framing: self-framing `hero` / `panel` / `thumb`, or the full-bleed stage
   * fills `standing` (desktop column), `cutout` (art only), and `fullBleed`
   * (mobile carousel).
   * Default `panel`.
   */
  variant?: DreamAvatarPortraitVariant;
  /**
   * Fixed pixel width. Panel/thumb stay square, so this also sets their height.
   * A sized portrait never shrinks in a flex row. Omit to fill the container
   * width. Ignored by `standing`/`cutout`/`fullBleed`, which fill the caller's stage.
   */
  size?: number;
  /** Semantic DreamAvatar profile represented by this portrait. Omit for decorative art. */
  profile?: { id: string; ability: string };
  /** Optional activation for selectable profile portraits. */
  onActivate?: () => void;
  /** Keeps the profile readable while suppressing activation. */
  unavailable?: boolean;
}

/** One reveal contract shared by every DreamAvatar surface. */
export function dreamAvatarRevealSpec(dreamAvatar: DreamAvatarVisual, abilityText: string, image: ArtRef = artRef.dreamAvatar(dreamAvatar.imageNumber)): RevealSpec {
  const ability = abilityText.trim();
  return {
    primary: { kind: "infoCard", card: { variant: "fullBleed", image, imageCrop: "top", title: dreamAvatar.name, subtitle: dreamAvatar.title, body: ability ? richText.rules(ability) : undefined } },
    secondaries: rulesTextDefinitionCards(ability, "dreamAvatar"),
  };
}

/** The tinted radial scene the transparent cutout stands on. Shared with the
 * monogram fallback so a portrait reads the same whether the art loads. */
function portraitBackdrop(): string {
  return `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--gold")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`;
}

/** Opaque light-gray field used by every self-framing portrait. */
function framedPortraitBackdrop(): CSSProperties {
  return {
    backgroundColor: token("--surface-portrait"),
  };
}

/** Per-variant frame chrome (radius / border / neutral backing / shadow). */
function frameStyle(variant: FramedVariant): CSSProperties {
  switch (variant) {
    case "hero":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-panel"),
        ...framedPortraitBackdrop(),
        border: `1px solid ${token("--border-mid")}`,
        boxShadow: token("--shadow-card"),
      };
    case "panel":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-control"),
        aspectRatio: "1 / 1",
        ...framedPortraitBackdrop(),
        border: `1px solid ${token("--border-mid")}`,
      };
    case "thumb":
      return {
        overflow: "hidden",
        borderRadius: token("--radius-inset"),
        aspectRatio: "1 / 1",
        ...framedPortraitBackdrop(),
        border: `1px solid ${token("--border-mid")}`,
      };
  }
}

/** Per-variant crop: each variant frames the character's face consistently. */
function imageStyle(
  variant: FramedVariant,
  focus: DreamAvatarPortraitFocus,
): CSSProperties {
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
    case "thumb": {
      const objectPositionY = Math.max(
        0,
        Math.min(1, 3 * focus.y - 1 / THUMB_CROP_SCALE),
      );
      return {
        position: "relative",
        left: `${String((0.5 - focus.x) * THUMB_CROP_SCALE * 100)}%`,
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: `50% ${String(objectPositionY * 100)}%`,
        transform: `scale(${String(THUMB_CROP_SCALE)})`,
        transformOrigin: "50% 0%",
      };
    }
  }
}

/** The monogram fallback shown when the art asset fails to load. */
function fallbackStyle(variant: FramedVariant): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: variant === "hero" ? 220 : undefined,
    height: variant === "hero" ? undefined : "100%",
    aspectRatio: variant === "hero" ? undefined : "1 / 1",
    ...framedPortraitBackdrop(),
    color: token("--text-primary"),
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

/** Resolve the hosted URL of a dreamAvatar's full scene render. */
export function dreamAvatarImageSrc(imageNumber: string): string {
  return assetUrl(`/dream-avatars/${imageNumber}.png`);
}

/** Resolve the hosted URL of a dreamAvatar's transparent full-body cutout. */
export function dreamAvatarCutoutSrc(imageNumber: string): string {
  return assetUrl(`/dream-avatars/cutout/${imageNumber}.png`);
}

function DreamAvatarPortraitSurface({
  dreamAvatar,
  variant = "panel",
  size,
}: Omit<DreamAvatarPortraitProps, "profile" | "onActivate" | "unavailable">) {
  const [broken, setBroken] = useState(false);
  const alt = `${dreamAvatar.name}, ${dreamAvatar.title}`;
  const focus = dreamAvatarPortraitFocus(dreamAvatar);
  const focusPercentX = Math.round(focus.x * 1000) / 10;
  const focusPercentY = Math.round(focus.y * 1000) / 10;

  // The full-bleed stage fills return a BARE FRAGMENT (no `.cumulus` wrapper) so a
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
              {dreamAvatar.name.charAt(0)}
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        {glow}
        <img
          src={dreamAvatarCutoutSrc(dreamAvatar.imageNumber)}
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

  if (variant === "cutout") {
    if (broken) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: token("--text-primary"),
            font: token("--t-display"),
          }}
        >
          {dreamAvatar.name.charAt(0)}
        </div>
      );
    }
    return (
      <img
        src={dreamAvatarCutoutSrc(dreamAvatar.imageNumber)}
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
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "50% 100%",
          userSelect: "none",
        }}
      />
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
            {dreamAvatar.name.charAt(0)}
          </div>
        </>
      );
    }
    return (
      <>
        {backdrop}
        <img
          src={dreamAvatarCutoutSrc(dreamAvatar.imageNumber)}
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
            // Fit by height so the head rises directly beneath the name instead
            // of leaving the figure small and low in the page. Translate by the
            // authored head coordinate, not the canvas midpoint, so asymmetric
            // poses and held props do not pull the subject off center.
            left: "50%",
            top: FULL_BLEED_HEAD_Y,
            width: "auto",
            maxWidth: "none",
            height: "100%",
            transform: `translate(-${String(focusPercentX)}%, -${String(focusPercentY)}%)`,
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
    // `cumulus` carries the design-token scope so the frame tokens resolve when
    // the portrait is mounted outside a `.cumulus` subtree (e.g. a journey screen).
    <div className="cumulus" style={{ ...frameStyle(variant), ...sizeStyle }}>
      {broken ? (
        <div style={fallbackStyle(variant)}>
          <span
            style={{
              fontSize: variant === "thumb" ? 12 : variant === "panel" ? 22 : 42,
            }}
          >
            {dreamAvatar.name.charAt(0)}
          </span>
        </div>
      ) : (
        <img
          src={dreamAvatarCutoutSrc(dreamAvatar.imageNumber)}
          alt={alt}
          style={imageStyle(variant, focus)}
          onError={() => {
            setBroken(true);
          }}
        />
      )}
    </div>
  );
}

/** DreamAvatar art, optionally promoted to a self-revealing semantic profile. */
export function DreamAvatarPortrait({ profile, onActivate, unavailable = false, ...visual }: DreamAvatarPortraitProps) {
  if (profile === undefined) return <DreamAvatarPortraitSurface {...visual} />;
  return <DreamAvatarProfilePortrait visual={visual} profile={profile} onActivate={onActivate} unavailable={unavailable} />;
}

function DreamAvatarProfilePortrait({ visual, profile, onActivate, unavailable }: {
  visual: Omit<DreamAvatarPortraitProps, "profile" | "onActivate" | "unavailable">;
  profile: NonNullable<DreamAvatarPortraitProps["profile"]>;
  onActivate?: () => void;
  unavailable: boolean;
}) {
  const binding = useRevealSource({
    identity: { entityType: "dreamAvatar", entityId: revealEntityId("dreamAvatar", profile.id) },
    spec: dreamAvatarRevealSpec(visual.dreamAvatar, profile.ability),
    onActivate: unavailable ? undefined : onActivate,
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;
  return (
    <Pressable as="span" ref={binding.ref} {...binding.sourceProps} role={onActivate === undefined ? undefined : "button"} tabIndex={0} aria-disabled={unavailable || undefined} data-dream-avatar-source={profile.id} onPointerDown={(event) => { lastPointerType.current = event.pointerType; pointerDown?.(event); }} onClick={() => { if (!unavailable && lastPointerType.current !== "touch") onActivate?.(); }} onKeyDown={(event) => { if (!unavailable && onActivate !== undefined && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onActivate(); } }} style={{ ...binding.sourceProps.style, display: "inline-flex" }}>
      <DreamAvatarPortraitSurface {...visual} />
    </Pressable>
  );
}

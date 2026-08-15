// AvatarPortrait — the shared framed Avatar profile surface. The
// square `panel` framing serves profile cards and popovers; the close-cropped
// `thumb` framing serves HUD rows and resident lists. Both composite the
// transparent full-body cutout over an opaque light-gray field so scene art
// cannot show through the portrait. Callers own the portrait's outer measure
// through a wrapper; the frame chrome and crop belong to this component.
//
// When the art asset 404s the portrait falls back to a tinted monogram disc so
// a missing image never leaves an empty hole.
//
// Full-body stage art lives in AvatarStage.

import { useRef, useState, type CSSProperties } from "react";
import { assetUrl } from "../../../runtime/asset-url";
import type { AvatarPortraitFocus } from "../../../types/content";
import { token } from "../../primitives/tokens";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { artRef, type ArtRef } from "../../primitives/art";
import { richText } from "../card/rich-text";
import { rulesTextDefinitionCards } from "../card/rules-text-reveal";
import type { RevealSpec } from "../../internal/reveal/model";
import {
  opaque,
  select,
  when,
  otherwise,
  txa,
  type LocalizedString,
} from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type { AvatarId, OpponentId } from "../../../types/identifiers";

/** The minimal avatar shape a portrait needs: which art to load and the
 * name/title that back the alt text and the fallback monogram. */
export interface AvatarVisual {
  imageNumber: string;
  name: LocalizedString;
  title?: LocalizedString;
  /** Normalized head position used to center subject-aware crops. */
  portraitFocus?: AvatarPortraitFocus;
}

/** Neutral fallback for older room snapshots that predate authored focus data. */
export const DEFAULT_AVATAR_PORTRAIT_FOCUS: AvatarPortraitFocus = {
  x: 0.5,
  y: 0.2,
};

/** Clamp authored focus data before it reaches CSS geometry. */
export function avatarPortraitFocus(
  avatar: AvatarVisual,
): AvatarPortraitFocus {
  const focus =
    avatar.portraitFocus ?? DEFAULT_AVATAR_PORTRAIT_FOCUS;
  return {
    x: Math.max(0, Math.min(1, focus.x)),
    y: Math.max(0, Math.min(1, focus.y)),
  };
}

/** Which square framing the portrait renders. */
export type AvatarPortraitVariant = "panel" | "thumb";

/** Per-variant image crop: each framed variant zooms its render so the
 * character's face fills the frame consistently. Bespoke framing factors, named
 * so they read as intentional crops rather than magic numbers in a transform. */
const PANEL_CROP_SCALE = 1.18;
const THUMB_CROP_SCALE = 2.9;

export interface AvatarPortraitProps {
  /** The avatar whose art and identity the portrait shows. */
  avatar: AvatarVisual;
  /** Square framing: `panel` for profile surfaces or `thumb` for compact rows. Default `panel`. */
  variant?: AvatarPortraitVariant;
  /** Semantic Avatar profile represented by this portrait. Omit for decorative art. */
  profile?: {
    id: AvatarId | OpponentId;
    ability: LocalizedString;
  };
  /** Optional primary press action for selectable profile portraits. */
  onPress?: () => void;
  /** Keeps the profile readable while suppressing activation. */
  unavailable?: boolean;
}

/** Reveal contract for semantic Avatar portrait surfaces. */
export function avatarRevealSpec(
  avatar: AvatarVisual,
  ability: LocalizedString | undefined,
  image: ArtRef = artRef.avatar(avatar.imageNumber),
): RevealSpec {
  return {
    primary: {
      kind: "infoCard",
      card: {
        variant: "fullBleed",
        image,
        imageCrop: "top",
        title: avatar.name,
        subtitle: avatar.title,
        body: ability === undefined ? undefined : richText.rules(ability),
      },
    },
    secondaries:
      ability === undefined
        ? []
        : rulesTextDefinitionCards(ability, "avatar"),
  };
}

/** Opaque light-gray field used by every self-framing portrait. */
function framedPortraitBackdrop(): CSSProperties {
  return {
    backgroundColor: token("--surface-portrait"),
  };
}

/** Per-variant frame chrome (radius / border / neutral backing / shadow). */
function frameStyle(variant: AvatarPortraitVariant): CSSProperties {
  switch (variant) {
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
        borderRadius: token("--radius-compact"),
        aspectRatio: "1 / 1",
        ...framedPortraitBackdrop(),
        border: `1px solid ${token("--border-mid")}`,
      };
  }
}

/** Per-variant crop: each variant frames the character's face consistently. */
function imageStyle(
  variant: AvatarPortraitVariant,
  focus: AvatarPortraitFocus,
): CSSProperties {
  switch (variant) {
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
function fallbackStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    aspectRatio: "1 / 1",
    ...framedPortraitBackdrop(),
    color: token("--text-primary"),
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

/** Resolve the hosted URL of an avatar's full scene render. */
export function avatarImageSrc(imageNumber: string): string {
  return assetUrl(`/avatars/${imageNumber}.png`);
}

/** Resolve the hosted URL of an avatar's transparent full-body cutout. */
export function avatarCutoutSrc(imageNumber: string): string {
  return assetUrl(`/avatars/cutout/${imageNumber}.png`);
}

function AvatarPortraitSurface({
  avatar,
  variant = "panel",
}: Omit<AvatarPortraitProps, "profile" | "onPress" | "unavailable">) {
  const resolve = useLocalizer();
  const [broken, setBroken] = useState(false);
  const alt = txa(
    select(avatar.title === undefined ? "no" : "yes", [
      when("yes", "{avatar_name}, {avatar_title}"),
      otherwise("{avatar_name}"),
    ]),
    {
      avatar_name: opaque(avatar.name),
      avatar_title: opaque(avatar.title ?? avatar.name),
    },
    '[accessibility] [avatar] Name for Avatar artwork. avatar_name is the canonical avatar display name and avatar_title is its authored epithet; neither has modeled grammatical gender. has_title is "yes" when the epithet is present and "no" when the artwork should be identified by the name alone.',
  );
  const focus = avatarPortraitFocus(avatar);

  return (
    // `cumulus` carries the design-token scope so the frame tokens resolve when
    // the portrait is mounted outside a `.cumulus` subtree (e.g. a journey screen).
    <div className="cumulus" style={{ ...frameStyle(variant), width: "100%" }}>
      {broken ? (
        <div style={fallbackStyle()}>
          <span
            style={{
              fontSize: variant === "thumb" ? 12 : 22,
            }}
          >
            {resolve(avatar.name).charAt(0)}
          </span>
        </div>
      ) : (
        <img
          src={avatarCutoutSrc(avatar.imageNumber)}
          alt={resolve(alt)}
          style={imageStyle(variant, focus)}
          onError={() => {
            setBroken(true);
          }}
        />
      )}
    </div>
  );
}

/** Avatar art, optionally promoted to a self-revealing semantic profile. */
export function AvatarPortrait({
  profile,
  onPress,
  unavailable = false,
  ...visual
}: AvatarPortraitProps) {
  if (profile === undefined) return <AvatarPortraitSurface {...visual} />;
  return (
    <AvatarProfilePortrait
      visual={visual}
      profile={profile}
      onPress={onPress}
      unavailable={unavailable}
    />
  );
}

function AvatarProfilePortrait({
  visual,
  profile,
  onPress,
  unavailable,
}: {
  visual: Omit<AvatarPortraitProps, "profile" | "onPress" | "unavailable">;
  profile: NonNullable<AvatarPortraitProps["profile"]>;
  onPress?: () => void;
  unavailable: boolean;
}) {
  const binding = useRevealSource({
    identity: {
      entityType: "avatar",
      entityId: revealEntityId("avatar", profile.id),
    },
    spec: avatarRevealSpec(visual.avatar, profile.ability),
    onActivate: unavailable ? undefined : onPress,
  });
  const lastPointerType = useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;
  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      role={onPress === undefined ? undefined : "button"}
      tabIndex={0}
      aria-disabled={unavailable || undefined}
      data-avatar-source={profile.id}
      onPointerDown={(event) => {
        lastPointerType.current = event.pointerType;
        pointerDown?.(event);
      }}
      onClick={() => {
        if (!unavailable && lastPointerType.current !== "touch") onPress?.();
      }}
      onKeyDown={(event) => {
        if (
          !unavailable &&
          onPress !== undefined &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onPress();
        }
      }}
      style={{ ...binding.sourceProps.style, display: "flex", width: "100%" }}
    >
      <AvatarPortraitSurface {...visual} />
    </Pressable>
  );
}

// DreamAvatarStage — full-body DreamAvatar art that fills a caller-owned
// position:relative stage. Its three strict treatments own their crop and
// backdrop while the caller owns the stage's width, height, and placement.

import { useState } from "react";
import { token } from "../../primitives/tokens";
import {
  dreamAvatarCutoutSrc,
  dreamAvatarPortraitFocus,
  type DreamAvatarVisual,
} from "./DreamAvatarPortrait";
import { opaque, select, when, otherwise, txa } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** The visual treatment applied to the full-body stage art. */
export type DreamAvatarStageVariant = "standing" | "cutout" | "fullBleed";

export interface DreamAvatarStageProps {
  /** The DreamAvatar whose full-body art fills the stage. */
  dreamAvatar: DreamAvatarVisual;
  /** `standing` adds an ambient glow, `cutout` preserves the scene, and `fullBleed` adds a cinematic backdrop. */
  variant: DreamAvatarStageVariant;
}

/** Grows standing art from the feet so the figure reads beyond its column. */
const STANDING_SCALE = 1.2;

/** Vertical target for the authored head point in the cinematic showcase. */
const FULL_BLEED_HEAD_Y = "27%";

/** The tinted radial field used by the standing monogram fallback. */
function portraitBackdrop(): string {
  return `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--portrait-warmth")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`;
}

/** Full-body DreamAvatar art for a caller-owned stage. */
export function DreamAvatarStage({
  dreamAvatar,
  variant,
}: DreamAvatarStageProps) {
  const resolve = useLocalizer();
  const [broken, setBroken] = useState(false);
  const alt = txa(
    select(dreamAvatar.title === undefined ? "no" : "yes", [
      when("yes", "{avatar_name}, {avatar_title}"),
      otherwise("{avatar_name}"),
    ]),
    {
      avatar_name: opaque(dreamAvatar.name),
      avatar_title: opaque(dreamAvatar.title ?? dreamAvatar.name),
    },
    "[accessibility] [dream-avatar] Name for Dream Avatar artwork. avatar_name is the canonical avatar display name and avatar_title is its authored epithet; neither has modeled grammatical gender. has_title is \"yes\" when the epithet is present and \"no\" when the artwork should be identified by the name alone.",
  );
  const focus = dreamAvatarPortraitFocus(dreamAvatar);
  const focusPercentX = Math.round(focus.x * 1000) / 10;
  const focusPercentY = Math.round(focus.y * 1000) / 10;

  if (variant === "standing") {
    const glow = (
      <div
        aria-hidden="true"
        data-dream-avatar-stage-backdrop="standing"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(72% 56% at 50% 62%, color-mix(in srgb, ${token("--accent")} 26%, transparent) 0%, color-mix(in srgb, ${token("--portrait-warmth")} 10%, transparent) 46%, transparent 72%)`,
          pointerEvents: "none",
        }}
      />
    );
    if (broken) {
      return (
        <>
          {glow}
          <div
            data-dream-avatar-stage-fallback="standing"
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
              {resolve(dreamAvatar.name).charAt(0)}
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        {glow}
        <img
          data-dream-avatar-stage-art="standing"
          src={dreamAvatarCutoutSrc(dreamAvatar.imageNumber)}
          alt={resolve(alt)}
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
            objectPosition: "50% 100%",
            transform: `scale(${String(STANDING_SCALE)})`,
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
          data-dream-avatar-stage-fallback="cutout"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: token("--text-primary"),
            font: token("--t-display"),
          }}
        >
          {resolve(dreamAvatar.name).charAt(0)}
        </div>
      );
    }
    return (
      <img
        data-dream-avatar-stage-art="cutout"
        src={dreamAvatarCutoutSrc(dreamAvatar.imageNumber)}
        alt={resolve(alt)}
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

  const backdrop = (
    <div
      aria-hidden="true"
      data-dream-avatar-stage-backdrop="fullBleed"
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(120% 85% at 50% 24%, color-mix(in srgb, ${token("--portrait-warmth")} 16%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 22%, transparent) 46%, ${token("--bg-sunken")} 100%)`,
      }}
    />
  );
  if (broken) {
    return (
      <>
        {backdrop}
        <div
          data-dream-avatar-stage-fallback="fullBleed"
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
          {resolve(dreamAvatar.name).charAt(0)}
        </div>
      </>
    );
  }
  return (
    <>
      {backdrop}
      <img
        data-dream-avatar-stage-art="fullBleed"
        src={dreamAvatarCutoutSrc(dreamAvatar.imageNumber)}
        alt={resolve(alt)}
        draggable={false}
        fetchPriority="high"
        loading="eager"
        decoding="async"
        onError={() => {
          setBroken(true);
        }}
        style={{
          position: "absolute",
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

// Dreamsign — the unified dreamsign entity for Cumulus. A dreamsign is a
// minor passive collectible; its art floats directly on the media with no
// chrome — no tile border, background, or frame — so the collectible reads as
// an object in the world rather than a card in a slot. Pressing or hovering the
// art reveals its full detail
// — name and rules text — through the shared coordinator as an InfoCard
// `object` variant. Mouse and hover-capable pen reveal on hover; touch uses the
// shared intent/hold state machine while preserving native scrolling.

import * as React from "react";
import type { CSSProperties } from "react";
import { richText } from "../card/rich-text";
import { assetUrl } from "../../../runtime/asset-url";
import { artRef } from "../../primitives/art";
import { requireDreamsignId } from "../../../data/dreamsigns";
import { useRevealSource } from "../../internal/reveal/context";
import { Pressable } from "../../primitives/Pressable";
import { revealEntityId } from "../../internal/reveal/identity";
import { rulesTextDefinitionCards } from "../card/rules-text-reveal";
import { token } from "../../primitives/tokens";
import { opaque, txa, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** The dreamsign object's own drop-shadow + violet glow (its material, not a
 * legibility overlay) — a faithfully-copied literal with no token equivalent.
 * Worn by the `hud` variant so a dreamsign lifts off busy scene art; exported so
 * the HUD's collapsed overflow stack can wear the same material without forking
 * the literal. */
export const DS_SHADOW =
  "drop-shadow(0 3px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 13px rgba(147,51,234,0.32))";

/** A heavier silhouette shadow for large dreamsigns over bright site art. Unlike
 * a backdrop plate, CSS drop-shadow follows each art asset's alpha channel, so
 * the sign still reads as an object resting on the scene. */
export const DS_REVELATION_SHADOW =
  "drop-shadow(0 8px 9px rgba(0,0,0,0.72)) drop-shadow(0 1px 2px rgba(0,0,0,0.88)) drop-shadow(0 0 18px rgba(147,51,234,0.46))";

/** Root-relative art URL for a dreamsign's `imageName`, via the asset pipeline. */
export function dreamsignArtUrl(imageName: string): string {
  return assetUrl(`/dreamsigns/${imageName}`);
}

/** Build the shared Dreamsign detail card and ordered glossary definitions. */
export function dreamsignRevealSpec(
  dreamsign: LocalizedDreamsign,
  showImage: boolean,
) {
  const effect = dreamsign.effectDescription;
  return {
    primary: {
      kind: "infoCard" as const,
      card: showImage
        ? {
            variant: "object" as const,
            image: artRef.dreamsign(String(dreamsign.imageName)),
            title: dreamsign.name,
            body: effect === null ? undefined : richText.rules(effect),
          }
        : {
            variant: "text" as const,
            title: dreamsign.name,
            body: effect === null ? undefined : richText.rules(effect),
          },
    },
    secondaries:
      effect === null ? [] : rulesTextDefinitionCards(effect, "dreamsign"),
  };
}

/** UUID-backed Dreamsign presentation data resolved before it reaches Cumulus. */
export interface LocalizedDreamsign {
  /** Stable Dreamsign UUID. */
  readonly id: string;
  /** Canonical localized display name. */
  readonly name: LocalizedString;
  /** Canonical localized effect copy, or null when the object has no rules. */
  readonly effectDescription: LocalizedString | null;
  /** Hosted art key. */
  readonly imageName?: string;
  /** Localized alternative text for the art. */
  readonly imageAlt: LocalizedString;
}

export interface DreamsignProps {
  /** The dreamsign to show. Identified by `id` (never by name). */
  dreamsign: LocalizedDreamsign;
  /**
   * Override the tile's `data-testid`. Defaults to `"dreamsign-art-tile"` so the
   * shipped shop / reward / deck-viewer selectors keep working.
   */
  testid?: string;
  /** Fired on a tap / click that was not a deliberate hold-to-read. */
  onPress?: () => void;
  /** Keeps details readable while suppressing selection. */
  unavailable?: boolean;
  /**
   * The tile's material. `"flat"` (default) is the chrome-free collectible tile
   * used in lists over a solid surface; `"hud"` composes {@link DS_SHADOW} — a
   * drop-shadow + violet glow — into the tile filter so the object lifts off busy
   * scene art in the transparent journey HUD. `"revelation"` uses a stronger
   * path-following shadow for large choices over bright Revelation site art.
   */
  variant?: "flat" | "hud" | "revelation";
}

/**
 * A dreamsign artwork tile that reveals its full detail through the shared
 * InfoCard `object` variant on hover (fine pointer) or press (touch).
 */
export function Dreamsign({
  dreamsign,
  testid = "dreamsign-art-tile",
  onPress,
  unavailable = false,
  variant = "flat",
}: DreamsignProps): React.ReactElement {
  const resolve = useLocalizer();
  const [imageBroken, setImageBroken] = React.useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  const dreamsignId = requireDreamsignId(dreamsign, "Dreamsign tile");
  const binding = useRevealSource({
    identity: {
      entityType: "dreamsign",
      entityId: revealEntityId("dreamsign", dreamsignId),
    },
    spec: dreamsignRevealSpec(dreamsign, showImage),
    onActivate: unavailable ? undefined : onPress,
  });
  const lastPointerType = React.useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;

  // No chrome: the art floats on the media with no tile border, background,
  // frame, or radius. Variant-driven path-following shadows are the only
  // material the tile wears.
  const tileFilter =
    [
      variant === "hud" ? DS_SHADOW : null,
      variant === "revelation" ? DS_REVELATION_SHADOW : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" ") || "none";
  const tileStyle: CSSProperties = {
    // Layout owns the square wrapper; the Dreamsign consumes that complete box.
    height: "100%",
    width: "100%",
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    containerType: "inline-size",
    filter: tileFilter,
    position: "relative",
    cursor: "pointer",
    touchAction: "pan-x pan-y",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    ...binding.sourceProps.style,
  };

  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      role="button"
      tabIndex={0}
      aria-disabled={unavailable || undefined}
      data-testid={testid}
      data-dreamsign-id={dreamsignId}
      ariaLabelMessage={txa(
        "Dreamsign: {dreamsign_name}",
        { dreamsign_name: opaque(dreamsign.name) },
        "Accessible name for an interactive Dreamsign object. dreamsign_name is its canonical authored display name and has unknown grammatical gender.",
      )}
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
      style={tileStyle}
    >
      {showImage ? (
        <img
          src={dreamsignArtUrl(String(dreamsign.imageName))}
          alt={resolve(dreamsign.imageAlt)}
          draggable={false}
          style={{ height: "100%", width: "100%", objectFit: "cover" }}
          onError={() => {
            setImageBroken(true);
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            fontSize: "42cqi",
            color: token("--text-tutorial-highlight"),
          }}
        >
          ✦
        </span>
      )}
    </Pressable>
  );
}

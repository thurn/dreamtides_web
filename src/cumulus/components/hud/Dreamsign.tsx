// Dreamsign — the unified dreamsign entity for Cumulus. A dreamsign is a
// minor passive collectible; its art floats directly on the media with no
// chrome — no tile border, background, or frame — so the collectible reads as
// an object in the world rather than a card in a slot. Bane dreamsigns carry a
// desaturation so the warning reads before the art does, and their reveal is
// tagged with a Bane badge. Pressing / hovering the art reveals its full detail
// — name and rules text — through the shared coordinator as an InfoCard
// `object` variant. Mouse and hover-capable pen reveal on hover; touch uses the
// shared intent/hold state machine while preserving native scrolling.

import * as React from "react";
import type { CSSProperties } from "react";
import { richText } from "../card/rich-text";
import type { Dreamsign as DreamsignData } from "../../../types/quest";
import { assetUrl } from "../../../runtime/asset-url";
import { artRef } from "../../primitives/art";
import { requireDreamsignId } from "../../../data/dreamsigns";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { useRevealSource } from "../../internal/reveal/context";
import { Pressable } from "../../primitives/Pressable";
import { revealEntityId } from "../../internal/reveal/identity";

/** Desaturation applied to bane art so a bane reads as a warning before its
 * art does — the one signal that survives the chrome-free tile. */
const BANE_FILTER = "grayscale(0.7)";

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

export interface DreamsignProps {
  /** The dreamsign to show. Identified by `id` (never by name). */
  dreamsign: DreamsignData;
  /** Square tile edge length in pixels. */
  sizePx: number;
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
   * scene art in the transparent quest HUD. `"revelation"` uses a stronger
   * path-following shadow for large choices over bright Revelation site art.
   */
  variant?: "flat" | "hud" | "revelation";
}

/**
 * A dreamsign artwork tile that reveals its full detail through the shared
 * InfoCard `object` variant on hover (fine pointer) or press (touch). Boon tiles
 * carry a violet ring, banes a red ring plus a desaturation; a glyph fallback
 * shows when the dreamsign has no art.
 */
export function Dreamsign({
  dreamsign,
  sizePx,
  testid = "dreamsign-art-tile",
  onPress,
  unavailable = false,
  variant = "flat",
}: DreamsignProps): React.ReactElement {
  const [imageBroken, setImageBroken] = React.useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  const imgAlt = dreamsign.imageAlt ?? dreamsign.name;
  const dreamsignId = requireDreamsignId(dreamsign, "Dreamsign tile");
  const effect = dreamsign.effectDescription ?? "";
  const binding = useRevealSource({
    identity: { entityType: "dreamsign", entityId: revealEntityId("dreamsign", dreamsignId) },
    spec: {
      primary: {
        kind: "infoCard",
        card: showImage
          ? { variant: "object", image: artRef.dreamsign(String(dreamsign.imageName)), imageFilter: dreamsign.isBane ? "dreamsign-portrait-bane" : "dreamsign-portrait", title: dreamsign.name, body: effect ? richText.rules(effect) : undefined }
          : { variant: "text", title: dreamsign.name, body: effect ? richText.rules(effect) : undefined },
      },
      secondaries: extractGlossaryTerms(effect).map((entry) => ({
        variant: "text" as const,
        title: entry.term,
        body: richText.rules(entry.definition),
      })),
    },
    onActivate: unavailable ? undefined : onPress,
  });
  const lastPointerType = React.useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;

  // No chrome: the art floats on the media with no tile border, background,
  // frame, or radius. A bane's desaturation and path-following drop-shadows are
  // the only material the tile wears; both compose into the one filter.
  const tileFilter =
    [
      dreamsign.isBane ? BANE_FILTER : null,
      variant === "hud" ? DS_SHADOW : null,
      variant === "revelation" ? DS_REVELATION_SHADOW : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" ") || "none";
  const tileStyle: CSSProperties = {
    height: sizePx,
    width: sizePx,
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
      data-is-bane={String(dreamsign.isBane)}
      aria-label={
        dreamsign.isBane
          ? `Bane dreamsign: ${dreamsign.name}`
          : `Dreamsign: ${dreamsign.name}`
      }
      onPointerDown={(event) => { lastPointerType.current = event.pointerType; pointerDown?.(event); }}
      onClick={() => { if (!unavailable && lastPointerType.current !== "touch") onPress?.(); }}
      onKeyDown={(event) => {
        if (!unavailable && onPress !== undefined && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onPress();
        }
      }}
      style={tileStyle}
    >
      {showImage ? (
        <img
          src={dreamsignArtUrl(String(dreamsign.imageName))}
          alt={imgAlt}
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
            fontSize: sizePx * 0.42,
            color: dreamsign.isBane ? "#fca5a5" : "#e9d5ff",
          }}
        >
          {dreamsign.isBane ? "☠" : "✦"}
        </span>
      )}
    </Pressable>
  );
}

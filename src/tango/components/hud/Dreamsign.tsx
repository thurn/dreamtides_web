// Dreamsign — the unified dreamsign entity for Tango. A dreamsign is a
// minor passive collectible; its art floats directly on the media with no
// chrome — no tile border, background, or frame — so the collectible reads as
// an object in the world rather than a card in a slot. Bane dreamsigns carry a
// desaturation so the warning reads before the art does, and their reveal is
// tagged with a Bane badge. Pressing / hovering the art reveals its full detail
// — name, optional Bane badge, and rules text — through the ONE shared popover,
// InfoCard's `object` variant, so a dreamsign preview is literally the same
// component the tides, sites, and Dreamcaller use.
//
// The reveal is INPUT-ADAPTIVE (the Tango generalization of the touch-first
// design source): on a fine pointer (mouse / desktop) HOVER reveals and the
// press only compresses; on a coarse pointer (touch) press-down reveals and
// release dismisses. It routes through InfoCard's `usePressReveal` + `anchorRect`
// + `PressPopover`, exactly like the HUD's docked dreamsign strip — so timing,
// placement, and the on-screen clamp cannot diverge.
//
// Placement:
//   - pass `stageRef` (the screen root) and the reveal anchors to the tile,
//     clamped fully on-screen — the material-continuity reveal (preferred).
//   - omit it and the reveal floats directly above the tile (standalone use, and
//     the default in list contexts that have no positioned stage).
//
// `DreamsignInfoCard` is the same reveal content on its own, for surfaces that
// own a bespoke trigger + placement engine (the Shop ware, the Revelation card,
// the Dream-journey icon) and only need the shared InfoCard body.
//
// Unifies the local `DreamsignArtTile` / `DreamsignHoverCard` pair with the
// design source `components/entities/Dreamsign.jsx`: the LOCAL bordered-tile
// treatment + game data (bane vs boon, glyph fallback, data hooks the screens
// and tests rely on) is authoritative; the DESIGN InfoCard-object reveal + the
// input-adaptive engine is the Tango vocabulary the preview now speaks.

import * as React from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { InfoCard } from "../overlay/InfoCard";
import { richText } from "../card/rich-text";
import { CardTermDefinitions } from "../card/CardTermDefinitions";
import { token } from "../../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../../types/quest";
import { assetUrl } from "../../../runtime/asset-url";
import { artRef } from "../../primitives/art";

const { usePressReveal, anchorRect, PressPopover, PRESS_SCALE, HOVER_SCALE } = InfoCard;

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

/**
 * Delay before a dreamsign preview opens on an offering / draft card. Tighter
 * than the glossary-tooltip default because players scan a short list of
 * dreamsigns and want quick previews while moving across them. Consumed by the
 * screens (Shop ware, Revelation card) that drive their own `HoverPopover`
 * trigger around a `DreamsignInfoCard`.
 */
export const DREAMSIGN_HOVER_DELAY_MS = 300;

/** Root-relative art URL for a dreamsign's `imageName`, via the asset pipeline. */
export function dreamsignArtUrl(imageName: string): string {
  return assetUrl(`/dreamsigns/${imageName}`);
}

export interface DreamsignInfoCardProps {
  /** The dreamsign to render as the shared InfoCard `object` reveal. */
  dreamsign: DreamsignData;
  /** Optional `data-testid` on the reveal wrapper, for stable selectors. */
  testid?: string;
  /**
   * Which side of the primary dreamsign card the keyword definitions occupy.
   * Defaults to `"right"` so standalone reveals keep the primary card first in
   * reading order; callers with placement context pass the side that keeps the
   * primary card closest to the trigger.
   */
  definitionSide?: "left" | "right";
}

/**
 * The shared dreamsign reveal on its own — InfoCard's `object` variant showing
 * the enlarged art, the name (with a Bane badge for banes), and the effect text
 * as `richText.rules` so keywords highlight in place. Use it as the content of a
 * bespoke trigger / placement engine (e.g. a screen's own `HoverPopover`); the
 * `Dreamsign` tile below wires this same card to the input-adaptive engine.
 *
 * When the effect text references glossary keywords (e.g. "Reclaim", "Banish"),
 * their definitions stack directly beneath the InfoCard object card via the
 * shared `CardTermDefinitions` — the same term-detection helper
 * (`extractGlossaryTerms`) that drives the card hover-help panel. The
 * definitions render as part of THIS reveal so a player reads what a
 * highlighted keyword MEANS with no extra interaction; they are pure display
 * (the InfoCard reveal is `pointerEvents: none` and transient), never a nested
 * interactive popover. `CardTermDefinitions` returns `null` for effect text
 * with no glossary terms, so plain dreamsigns show the card alone.
 */
export function DreamsignInfoCard({
  dreamsign,
  testid,
  definitionSide = "right",
}: DreamsignInfoCardProps): React.ReactElement {
  const showImage = Boolean(dreamsign.imageName);
  const effect = dreamsign.effectDescription ?? "";
  const body = effect ? richText.rules(effect) : undefined;
  const primaryCard = showImage ? (
    <InfoCard
      variant="object"
      image={artRef.dreamsign(String(dreamsign.imageName))}
      imageFilter={
        dreamsign.isBane ? "dreamsign-portrait-bane" : "dreamsign-portrait"
      }
      title={dreamsign.name}
      body={body}
    />
  ) : (
    <InfoCard variant="text" title={dreamsign.name} body={body} />
  );
  const definitions = (
    <CardTermDefinitions
      text={effect}
      side={definitionSide}
      testId={testid ? `${testid}-definition-stack` : undefined}
    />
  );
  return (
    <div
      data-testid={testid}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: token("--space-3"),
      }}
    >
      {definitionSide === "left" && definitions}
      {/* A dreamsign with art reveals through the media `object` variant; one
          without art falls back to the media-free `text` variant so the reveal
          is always a complete card, never an empty image frame. */}
      {primaryCard}
      {definitionSide === "right" && definitions}
    </div>
  );
}

export interface DreamsignProps {
  /** The dreamsign to show. Identified by `id` (never by name). */
  dreamsign: DreamsignData;
  /** Square tile edge length in pixels. */
  sizePx: number;
  /**
   * Screen root the reveal anchors + clamps against. Pass it for the
   * material-continuity reveal (preferred); omit it and the reveal floats
   * directly above the tile.
   */
  stageRef?: React.RefObject<HTMLElement | null>;
  /**
   * Override the tile's `data-testid`. Defaults to `"dreamsign-art-tile"` so the
   * shipped shop / reward / deck-viewer selectors keep working.
   */
  testid?: string;
  /** Testid for the portalled reveal content (for stable selectors). */
  revealTestid?: string;
  /** Fired on a tap / click that was not a deliberate hold-to-read. */
  onPress?: () => void;
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
  stageRef,
  testid = "dreamsign-art-tile",
  revealTestid,
  onPress,
  variant = "flat",
}: DreamsignProps): React.ReactElement {
  const [imageBroken, setImageBroken] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const { pressed, hovered, shown, begin, end, enter, leave, heldPastTap } =
    usePressReveal();
  const [anchor, setAnchor] = React.useState<ReturnType<
    typeof anchorRect
  > | null>(null);

  const useStage = Boolean(stageRef?.current);

  React.useLayoutEffect(() => {
    if (shown && useStage && stageRef?.current && ref.current) {
      setAnchor(anchorRect(stageRef.current, ref.current));
    } else {
      setAnchor(null);
    }
  }, [shown, useStage, stageRef]);

  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  const imgAlt = dreamsign.imageAlt ?? dreamsign.name;

  const onUp = (): void => {
    const tap = !heldPastTap();
    end();
    if (tap && onPress) {
      onPress();
    }
  };

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
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    zIndex: pressed ? 60 : undefined,
    transform: pressed
      ? `scale(${String(PRESS_SCALE)})`
      : hovered
        ? `scale(${String(HOVER_SCALE)})`
        : "scale(1)",
    transition: `transform ${token("--dur-fast")} ${token("--ease-out")}`,
  };

  const definitionSide: "left" | "right" =
    anchor !== null && anchor.x > anchor.w / 2 ? "left" : "right";
  const card = (
    <DreamsignInfoCard
      dreamsign={dreamsign}
      testid={revealTestid}
      definitionSide={definitionSide}
    />
  );

  return (
    <span
      ref={ref}
      role="button"
      data-testid={testid}
      data-dreamsign-id={dreamsign.id ?? dreamsign.name}
      data-is-bane={String(dreamsign.isBane)}
      aria-label={
        dreamsign.isBane
          ? `Bane dreamsign: ${dreamsign.name}`
          : `Dreamsign: ${dreamsign.name}`
      }
      onPointerEnter={enter}
      onPointerDown={begin}
      onPointerUp={onUp}
      onPointerLeave={leave}
      onPointerCancel={end}
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

      {/* Anchored, clamped reveal through the shared engine (preferred). */}
      {shown &&
        useStage &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <PressPopover anchor={anchor}>{card}</PressPopover>,
          document.body,
        )}

      {/* Standalone fallback: the same InfoCard floated directly above. */}
      {shown && !useStage && (
        <span
          style={{
            position: "absolute",
            left: "50%",
            bottom: "100%",
            transform: "translate(-50%, -14px)",
            zIndex: 90,
            pointerEvents: "none",
          }}
        >
          {card}
        </span>
      )}
    </span>
  );
}

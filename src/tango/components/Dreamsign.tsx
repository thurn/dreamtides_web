// Dreamsign — the unified dreamsign entity for Tango. A dreamsign is a
// minor passive collectible; it shows as a small square art tile (boon dreamsigns
// carry a violet ring, banes a red ring plus a desaturation so the warning reads
// before the art does). Pressing / hovering the tile reveals its full detail —
// name, optional Bane badge, and rules text — through the ONE shared popover,
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
import { InfoCard } from "./InfoCard";
import { richText } from "./rich-text";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { assetUrl } from "../../runtime/asset-url";

const { usePressReveal, anchorRect, PressPopover, PRESS_SCALE } = InfoCard;

/** Boon (violet) and bane (red) ring + glow colours for the tile border. */
const BOON_BORDER = "rgba(168, 85, 247, 0.65)";
const BOON_GLOW = "rgba(168, 85, 247, 0.30)";
const BANE_BORDER = "rgba(239, 68, 68, 0.85)";
const BANE_GLOW = "rgba(239, 68, 68, 0.40)";
/** Desaturation applied to bane art so the red ring reads as a warning first. */
const BANE_FILTER = "grayscale(0.7)";
/** Drop-shadow the reveal art carries so it lifts off the InfoCard surface. */
const OBJECT_SHADOW =
  "drop-shadow(0 3px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 14px rgba(147,51,234,0.30))";

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
}: DreamsignInfoCardProps): React.ReactElement {
  const showImage = Boolean(dreamsign.imageName);
  const effect = dreamsign.effectDescription ?? "";
  return (
    <div
      data-testid={testid}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <InfoCard
        variant="object"
        image={
          showImage
            ? dreamsignArtUrl(String(dreamsign.imageName))
            : undefined
        }
        imageFilter={
          dreamsign.isBane ? `${OBJECT_SHADOW} grayscale(0.5)` : OBJECT_SHADOW
        }
        title={dreamsign.name}
        titleBadge={dreamsign.isBane ? "Bane" : undefined}
        body={effect ? richText.rules(effect) : undefined}
      />
      <CardTermDefinitions
        text={effect}
        testId={testid ? `${testid}-definition-stack` : undefined}
      />
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
}: DreamsignProps): React.ReactElement {
  const [imageBroken, setImageBroken] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const { pressed, shown, begin, end, enter, leave, heldPastTap } =
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
  const borderColor = dreamsign.isBane ? BANE_BORDER : BOON_BORDER;
  const glow = dreamsign.isBane ? BANE_GLOW : BOON_GLOW;
  const imgAlt = dreamsign.imageAlt ?? dreamsign.name;

  const onUp = (): void => {
    const tap = !heldPastTap();
    end();
    if (tap && onPress) {
      onPress();
    }
  };

  const tileStyle: CSSProperties = {
    height: sizePx,
    width: sizePx,
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: token("--radius-control"),
    background: "rgba(10, 6, 18, 0.65)",
    border: `1px solid ${borderColor}`,
    boxShadow: `0 0 6px ${glow}`,
    filter: dreamsign.isBane ? BANE_FILTER : "none",
    position: "relative",
    cursor: "pointer",
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    zIndex: pressed ? 60 : undefined,
    transform: pressed ? `scale(${String(PRESS_SCALE)})` : "scale(1)",
    transition: `transform ${token("--dur-fast")} ${token("--ease-out")}`,
  };

  const card = <DreamsignInfoCard dreamsign={dreamsign} testid={revealTestid} />;

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
        stageRef?.current &&
        createPortal(
          <PressPopover anchor={anchor}>{card}</PressPopover>,
          stageRef.current,
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

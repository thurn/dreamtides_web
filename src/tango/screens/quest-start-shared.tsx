// Shared core for the Tango Dreamcaller-select screen. Both the mobile carousel
// (`quest-start-mobile`) and the desktop triptych (`quest-start-desktop`) render
// from these view types and reuse these interaction primitives — the ability /
// essence reveals and the console hairline — so the two layouts stay in lockstep
// on the glossary-keyword and essence-explanation behaviour a player relies on.
// PURE: no state ownership; the adapter owns the offer, the seed, and startQuest.

import { useLayoutEffect, useRef, useState } from "react";
import { ResourceChip } from "../components/hud/ResourceChip";
import { RulesText } from "../components/card/RulesText";
import { CardTermDefinitions } from "../components/card/CardTermDefinitions";
import { InfoCard } from "../components/overlay/InfoCard";
import { richText } from "../components/card/rich-text";
import { TideDisc, type TideDiscSize } from "../components/hud/TideDisc";
import { type Tide } from "../components/hud/tide-spec";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { extractGlossaryTerms } from "../../data/glossary-terms";

/** One tide shown on a Dreamcaller, already resolved to display copy. Both the
 * desktop triptych and the mobile carousel render their tide discs (and each
 * disc's InfoCard reveal) from this view. */
export interface DreamcallerTideView {
  /** Stable id (a tide deck id) for the React key / QA hook. */
  id: string;
  /** Display name shown on the tide's reveal card. */
  label: string;
  /** Description revealed through the disc's InfoCard reveal. */
  description: string;
  /** Which of the five tides fixes the disc's icon + color. */
  tide: Tide;
}

/** How many tide discs render at most; a Dreamcaller with more shows the first
 * few (the rest are the same pools, just less prominent). Shared by both
 * layouts so the cap reads identically on desktop and mobile. */
export const MAX_TIDE_DISCS = 4;

/** What a tide-disc reveal explains above the specific tide's own card. */
const TIDES_BLURB =
  "Pools of cards you will see during the quest. Different tides are used every time you play.";

/** One tide mark wired up as a reveal trigger: the shared {@link TideDisc}, at
 * the given {@link TideDiscSize}, that reveals — through the shared InfoCard —
 * what tides are (the general blurb) stacked ABOVE this specific tide's own
 * colored card. Informational: the disc brightens on hover and, having no
 * action to press, ENLARGES on press (rather than compressing like a button) to
 * acknowledge a touch. Both Dreamcaller-select layouts render their tide rows
 * from this, so the reveal reads identically on each.
 *
 * `hitSlop` pads the pressable around the disc (mobile touch targets) without
 * growing the disc itself; the caller reabsorbs the padding with negative
 * margins so the visual layout is unchanged. */
export function TideDiscReveal({
  tide,
  stageRef,
  size = "sm",
  hitSlop,
}: {
  tide: DreamcallerTideView;
  stageRef: React.RefObject<HTMLElement | null>;
  size?: TideDiscSize;
  hitSlop?: string;
}) {
  const disc = (
    <TideDisc
      tide={tide.tide}
      id={tide.id}
      label={`Tide: ${tide.label}`}
      size={size}
      interactive
    />
  );
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      pressFeedback="enlarge"
      card={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: token("--space-3"),
          }}
        >
          <InfoCard
            variant="icon"
            glyph={GLYPHS.water}
            title="Tides"
            body={richText.plain(TIDES_BLURB)}
          />
          <InfoCard
            variant="tide"
            tide={tide.tide}
            title={tide.label}
            body={richText.plain(tide.description)}
          />
        </div>
      }
    >
      {hitSlop != null ? (
        <span style={{ display: "inline-flex", padding: hitSlop }}>{disc}</span>
      ) : (
        disc
      )}
    </InfoCard.PressInfo>
  );
}

/** The plain "Tides:" caption above/beside a tide-disc row — the uppercase
 * eyebrow both layouts label their tides with. A static caption, not a reveal
 * trigger. */
export function TidesLabel() {
  return (
    <span
      style={{
        font: token("--t-eyebrow"),
        letterSpacing: token("--tracking-eyebrow"),
        textTransform: "uppercase",
        color: token("--text-secondary"),
        lineHeight: 1,
      }}
    >
      Tides:
    </span>
  );
}

/** One signature card (kept for the shared view type; unused by the carousel). */
export interface DreamcallerSignatureCardView {
  id: string;
  name: string;
}

/** A single Dreamcaller offered on the select screen, as display data. */
export interface DreamcallerOfferView {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  renderedText: string;
  startingEssence: number;
  signatureCards: DreamcallerSignatureCardView[];
  tides: DreamcallerTideView[];
}

export interface QuestStartScreenProps {
  /** The Dreamcallers offered this run (typically three). */
  dreamcallers: DreamcallerOfferView[];
  /** Called with a Dreamcaller's id when the player commits to it. */
  onPick: (dreamcallerId: string) => void;
}

/** The side-by-side Dreamcaller triptych is this screen's desktop idiom, so it
 * flips to the desktop layout at the shared {@link useIsDesktop} breakpoint:
 * below it a one-per-page swipe carousel, at or above it a desktop triptych. */
export { useIsDesktop } from "./use-is-desktop";

/** The brand-tinted hairline between ability text and the tides row. `flush`
 * drops the built-in top margin for callers (the desktop card) that own their
 * own spacing rhythm through a flex `gap`. */
export function ConsoleDivider({ flush = false }: { flush?: boolean }) {
  return (
    <div
      style={{
        height: 1,
        marginTop: flush ? 0 : token("--space-4"),
        background: `linear-gradient(90deg, transparent, ${token("--line-strong")} 18%, ${token("--line-strong")} 82%, transparent)`,
      }}
    />
  );
}

/** The smallest the ability text is allowed to auto-shrink to (fraction of its
 * natural size). A gentle floor: past two lines the box grows rather than
 * cramming, so the shrink only ever nudges the font a little (never the harsh
 * squeeze needed to force every ability into two lines). */
const ABILITY_MIN_SCALE = 0.9;

/** A box that reserves `minHeight` (so short abilities align across columns and
 * center within two lines) but GROWS for longer copy instead of clipping it.
 * Content past the minimum is nudged down by a gentle uniform scale — floored
 * at {@link ABILITY_MIN_SCALE} — and the box is sized to the scaled content so
 * it stays tight with no clipping. The scale reads as a slightly smaller font
 * while keeping the rich-text pips/carets in proportion; `offsetHeight` is
 * pre-transform, so the natural size is measured directly with no reset dance. */
function AutoShrinkText({
  minHeight,
  children,
}: {
  minHeight: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ scale, boxHeight }, setFit] = useState({
    scale: 1,
    boxHeight: minHeight,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetHeight ignores the visual transform, so it is always the content's
    // natural (unscaled) height regardless of the scale currently applied.
    const natural = el.offsetHeight;
    const nextScale =
      natural > minHeight
        ? Math.max(ABILITY_MIN_SCALE, minHeight / natural)
        : 1;
    // Grow to fit the scaled content (never below the two-line minimum), so a
    // long ability takes the room it needs at a gently reduced size.
    const nextBox = Math.max(minHeight, Math.round(natural * nextScale));
    setFit({ scale: nextScale, boxHeight: nextBox });
  }, [children, minHeight]);

  return (
    <div
      style={{
        height: boxHeight,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        ref={ref}
        style={{
          width: "100%",
          transform: scale < 1 ? `scale(${String(scale)})` : undefined,
          transformOrigin: "left center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Ability text with a press/hover reveal of its glossary-keyword definitions.
 * When the text has no terms it renders plain, with no reveal wiring. When
 * `minHeight` is set (the desktop card) the text renders in a two-line-minimum,
 * vertically-centered box that grows for longer copy and gently auto-shrinks it;
 * without it the text takes its natural height (the mobile console). */
export function AbilityReveal({
  text,
  stageRef,
  minHeight,
}: {
  text: string;
  stageRef: React.RefObject<HTMLElement | null>;
  minHeight?: number;
}) {
  const body = (
    <div
      style={{
        font: token("--t-rules"),
        color: token("--text-primary"),
        lineHeight: 1.36,
      }}
    >
      <RulesText text={text} />
    </div>
  );
  const content =
    extractGlossaryTerms(text).length === 0 ? (
      body
    ) : (
      <InfoCard.PressInfo
        stageRef={stageRef}
        as="div"
        card={<CardTermDefinitions text={text} />}
      >
        {body}
      </InfoCard.PressInfo>
    );
  if (minHeight == null) {
    return content;
  }
  return <AutoShrinkText minHeight={minHeight}>{content}</AutoShrinkText>;
}

/** The starting-essence value with a press/hover explanation. Informational —
 * hovering brightens it subtly and, having no action to press, a press ENLARGES
 * it (rather than compressing like a button) to acknowledge a touch. */
export function EssenceReveal({
  dreamcaller,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      pressFeedback="enlarge"
      card={
        <InfoCard
          variant="icon"
          glyph={GLYPHS.essence}
          title="Starting Essence"
          body={richText.plain(
            "The essence this Dreamcaller begins the quest with, spent at sites this run.",
          )}
        />
      }
    >
      <span
        data-starting-essence-value={dreamcaller.id}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          font: token("--t-body"),
          color: token("--text-primary"),
          filter: hovered ? "brightness(1.18)" : "none",
          transition: `filter ${token("--dur-fast")} ${token("--ease-out")}`,
        }}
      >
        <ResourceChip kind="essence" value={dreamcaller.startingEssence} />
      </span>
    </InfoCard.PressInfo>
  );
}

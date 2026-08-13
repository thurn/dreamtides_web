// Shared core for the Cumulus DreamAvatar-select screen. Both the mobile carousel
// (`journey-start-mobile`) and the desktop triptych (`journey-start-desktop`) render
// from these view types and reuse the essence/tide interaction primitives and
// console hairline, while both compose the canonical RulesText source.
// PURE: no state ownership; the adapter owns the offer, the seed, and startJourney.

import type { LocalizedString } from "@trox/runtime";
import { useEffect } from "react";
import { RulesText } from "../components/card/RulesText";
import { EssenceValue } from "../components/hud/EssenceValue";
import { IconButton } from "../components/controls/IconButton";
import { TideDisc } from "../components/hud/TideDisc";
import { TidesInfoLabel } from "../components/hud/TidesInfoLabel";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import { type Tide } from "../components/hud/tide-spec";
import { token } from "../primitives/tokens";
import { GLYPHS } from "../primitives/glyph";
import type { DreamAvatarPortraitFocus } from "../../types/content";
import { GLOSSARY_IDS } from "../../data/glossary";
import { DEBUG_REROLL_TOP } from "./chrome-geometry";
import type { TutorialSpeechBubbleView } from "./tutorial-speech-bubble-view";
import { useDelayedTutorialSpeechBubbleVisibility } from "./use-delayed-tutorial-speech-bubble-visibility";
import { useLocalizer } from "../../runtime/localization/use-localizer";

/** Canonical rules copy in the Journey Start console's inherited type voice. */
export function JourneyStartAbilityCopy({
  dreamAvatar,
}: {
  readonly dreamAvatar: Pick<DreamAvatarOfferView, "id" | "renderedText">;
}) {
  return (
    <div
      style={{
        font: token("--t-rules"),
        color: token("--text-primary"),
        lineHeight: 1.36,
        cursor: "default",
      }}
    >
      <RulesText
        text={dreamAvatar.renderedText}
        owner={{ kind: "dreamAvatar", id: dreamAvatar.id }}
      />
    </div>
  );
}

/** One tide shown on a DreamAvatar, already resolved to display copy. Both the
 * desktop triptych and the mobile carousel render their tide discs (and each
 * disc's InfoCard reveal) from this view. */
export interface DreamAvatarTideView {
  /** Stable id (a tide deck id) for the React key / QA hook. */
  id: string;
  /** Display name shown on the tide's reveal card. */
  label: LocalizedString;
  /** Description revealed through the disc's InfoCard reveal. */
  description: LocalizedString;
  /** Which of the five tides fixes the disc's icon + color. */
  tide: Tide;
}

/** How many tide discs render at most; a DreamAvatar with more shows the first
 * few (the rest are the same pools, just less prominent). Shared by both
 * layouts so the cap reads identically on desktop and mobile. */
export const MAX_TIDE_DISCS = 4;

/** What the secondary tide-definition card explains. */
/** One tide mark wired up as a reveal trigger: the shared {@link TideDisc}, at
 * that reveals — through the shared InfoCard —
 * this specific tide's colored card as the primary information, with the
 * general definition beside it as a secondary text card. Informational: the
 * disc brightens on hover, and — like every
 * Cumulus pressable — scales up on hover and down on press, so a touch press is
 * acknowledged. Both DreamAvatar-select layouts render their tide rows from
 * this, so the reveal reads identically on each.
 *
 * `hitSlop` pads the pressable around the disc (mobile touch targets) without
 * growing the disc itself; the caller reabsorbs the padding with negative
 * margins so the visual layout is unchanged. */
export function TideDiscReveal({
  tide,
  hitSlop,
}: {
  tide: DreamAvatarTideView;
  hitSlop?: string;
}) {
  const disc = (
    <TideDisc
      tide={tide.tide}
      id={tide.id}
      label={tide.label}
      description={tide.description}
    />
  );
  return hitSlop != null ? (
    <span style={{ display: "inline-flex", padding: hitSlop }}>{disc}</span>
  ) : (
    disc
  );
}

/** The tides cluster shared by BOTH DreamAvatar-select layouts: a top row with
 * the revealing "Tides: (i)" label on the left and starting essence on the
 * right, and —
 * below it, left-aligned under the caption — the tide discs at the larger 'lg'
 * size (capped at {@link MAX_TIDE_DISCS}). The desktop triptych and the mobile
 * carousel both render this so the arrangement (discs stacked beneath the
 * caption, essence held top-right) reads identically on each.
 *
 * `hitSlop`, when set, pads each disc's touch target (the mobile carousel) and
 * the disc row reabsorbs that padding with negative margins so the visual layout
 * is unchanged; the padding's own spacing is what separates adjacent discs.
 * Without it (the desktop triptych, a fine pointer) the row spaces its discs
 * with an explicit gap that matches the mobile inter-disc distance. */
export function TidesEssenceBlock({
  dreamAvatar,
  hitSlop,
}: {
  dreamAvatar: DreamAvatarOfferView;
  hitSlop?: string;
}) {
  const hasTides = dreamAvatar.tides.length > 0;
  return (
    <div>
      {/* Top row: the "Tides:" caption on the left and the starting essence on
          the right. The essence stays TOP-aligned, level with the caption, as
          the disc row stacks below it. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: token("--space-m"),
        }}
      >
        {hasTides ? <TidesInfoLabel /> : <span />}
        <EssenceReveal dreamAvatar={dreamAvatar} />
      </div>

      {hasTides && (
        <div
          data-dream-avatar-tides={dreamAvatar.id}
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: hitSlop != null ? undefined : token("--space-s"),
            marginTop:
              hitSlop != null
                ? `calc(${token("--space-xs")} - ${hitSlop})`
                : token("--space-xs"),
            marginLeft: hitSlop != null ? `calc(-1 * ${hitSlop})` : undefined,
            marginRight: hitSlop != null ? `calc(-1 * ${hitSlop})` : undefined,
            marginBottom: hitSlop != null ? `calc(-1 * ${hitSlop})` : undefined,
          }}
        >
          {dreamAvatar.tides.slice(0, MAX_TIDE_DISCS).map((tide) => (
            <TideDiscReveal key={tide.id} tide={tide} hitSlop={hitSlop} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One signature card (kept for the shared view type; unused by the carousel). */
export interface DreamAvatarSignatureCardView {
  id: string;
  name: LocalizedString;
}

/** A single DreamAvatar offered on the select screen, as display data. */
export interface DreamAvatarOfferView {
  id: string;
  name: LocalizedString;
  title: LocalizedString;
  imageNumber: string;
  portraitFocus?: DreamAvatarPortraitFocus;
  renderedText: LocalizedString;
  startingEssence: number;
  signatureCards: DreamAvatarSignatureCardView[];
  tides: DreamAvatarTideView[];
}

/** Character-led guidance shown only for the fixed tutorial offer. */
export type JourneyStartGuideDialogueView = TutorialSpeechBubbleView;

export interface JourneyStartScreenProps {
  /** The DreamAvatars offered this run (three normally; one in the tutorial). */
  dreamAvatars: DreamAvatarOfferView[];
  /** Mira's introduction to the fixed tutorial DreamAvatar choice. */
  guideDialogue?: JourneyStartGuideDialogueView;
  /** Called with a DreamAvatar's id when the player commits to it. */
  onPick: (dreamAvatarId: string) => void;
  /** Reports when the authored journey-start speech bubble becomes visible. */
  onGuideDialogueShown?: () => void;
  /** Requests a shared debug reroll. Omitted for a fixed tutorial offer. */
  onReroll?: () => void;
}

/** Responsive placement for the tutorial's canonical portrait-and-bubble pair. */
export function JourneyStartGuideDialogue({
  dialogue,
  layout,
  onShown,
}: {
  readonly dialogue: JourneyStartGuideDialogueView;
  readonly layout: "desktop" | "mobile";
  readonly onShown?: () => void;
}) {
  const visible = useDelayedTutorialSpeechBubbleVisibility(
    dialogue.id,
    dialogue.delaySeconds ?? 0,
  );
  useEffect(() => {
    if (visible) onShown?.();
  }, [onShown, visible]);
  const desktop = layout === "desktop";
  const mobileLeftReserve = Math.max(0, -dialogue.horizontalOffset);
  const mobileRightReserve = Math.max(0, dialogue.horizontalOffset);
  const transform = desktop
    ? `translate(${String(dialogue.horizontalOffset)}px, calc(-50% + ${String(dialogue.verticalOffset)}px))`
    : `translate(${String(dialogue.horizontalOffset)}px, ${String(dialogue.verticalOffset)}px)`;
  return (
    <div
      data-journey-start-guide-dialogue=""
      style={{
        position: "absolute",
        zIndex: 7,
        top: desktop ? "50%" : "36%",
        left: desktop
          ? `max(var(--safe-area-inset-left), ${token("--gutter")})`
          : `calc(max(var(--safe-area-inset-left), ${token("--gutter")}) + ${String(mobileLeftReserve)}px)`,
        right: desktop
          ? undefined
          : `calc(max(var(--safe-area-inset-right), ${token("--gutter")}) + ${String(mobileRightReserve)}px)`,
        width: desktop ? `${String(dialogue.bubbleWidth)}px` : undefined,
        maxWidth: desktop
          ? "calc(50vw - 250px)"
          : `${String(dialogue.bubbleWidth)}px`,
        transform,
        pointerEvents: "none",
      }}
    >
      <CharacterDialogue
        dialogue={dialogue.model}
        visible={visible}
        size={desktop ? "prominent" : "compact"}
        testId="journey-start-tutorial-dialogue"
      />
    </div>
  );
}

/** Shared top-right debug action used by both journey-start layouts. */
export function JourneyStartRerollControl({
  onReroll,
  label,
}: {
  readonly onReroll: () => void;
  readonly label: LocalizedString;
}) {
  return (
    <div
      data-dream-avatar-reroll-control
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      style={{
        position: "absolute",
        top: DEBUG_REROLL_TOP,
        right: `max(var(--safe-area-inset-right), ${token("--gutter")})`,
        zIndex: 8,
      }}
    >
      <IconButton
        glyph={GLYPHS.refresh}
        label={label}
        onPress={onReroll}
        testId="reroll-dream-avatars"
      />
    </div>
  );
}

/** The small purple uppercase context label painted directly over scene art. */
export function OnMediaEyebrow({ label }: { readonly label: LocalizedString }) {
  const resolve = useLocalizer();
  return (
    <span
      style={{
        display: "block",
        font: token("--t-eyebrow"),
        letterSpacing: token("--tracking-eyebrow"),
        textTransform: "uppercase",
        color: token("--accent-bright"),
        textShadow: token("--text-outline-media"),
      }}
    >
      {resolve(label)}
    </span>
  );
}

/** The side-by-side DreamAvatar triptych is this screen's desktop idiom, so it
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
        marginTop: flush ? 0 : token("--space-s"),
        background: `linear-gradient(90deg, transparent, ${token("--border-accent")} 18%, ${token("--border-accent")} 82%, transparent)`,
      }}
    />
  );
}

/** The starting-essence value with a press/hover explanation. Informational —
 * hovering brightens it subtly and, like every Cumulus pressable, it scales up on
 * hover and down on press, so a touch press is acknowledged. */
export function EssenceReveal({
  dreamAvatar,
}: {
  dreamAvatar: DreamAvatarOfferView;
}) {
  return (
    <span
      data-starting-essence-value={dreamAvatar.id}
      style={{
        display: "inline-flex",
        alignItems: "center",
        font: token("--t-numeral"),
        color: token("--text-primary"),
      }}
    >
      <EssenceValue
        amount={dreamAvatar.startingEssence}
        tone="mark"
        entity={{
          id: dreamAvatar.id,
          glossaryId: GLOSSARY_IDS.startingEssence,
        }}
      />
    </span>
  );
}

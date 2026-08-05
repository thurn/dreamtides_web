// ExplorationSiteScreen — Layaway draws one possibility from the player's
// deck anchor, flips it face up, and holds it in the encounter panel.

import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import {
  CardChoiceGrid,
  type CardChoiceGridColumns,
} from "../components/card/CardChoiceGrid";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import {
  entityReferenceDisplayDetails,
  type EntityReferenceModel,
  useEntityReferenceRevealSource,
} from "../components/card/EntityReference";
import { RichTextView, richText } from "../components/card/rich-text";
import { renderRulesSymbolsInline } from "../components/card/RulesText";
import {
  CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
  CARD_CORNER_RADIUS,
} from "../components/card/card-aspect";
import { CardBack } from "../components/battle/CardBack";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import { IconButton } from "../components/controls/IconButton";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../components/hud/JourneyStatusBar";
import { Dreamsign } from "../components/hud/Dreamsign";
import { DreamAvatarPortrait } from "../components/hud/DreamAvatarPortrait";
import { ResourceChip } from "../components/hud/ResourceChip";
import { GlassPanel } from "../components/overlay/GlassPanel";
import {
  RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
  RadialAnnouncement,
} from "../components/status/RadialAnnouncement";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import type { CumulusColor } from "../primitives/color";
import { GLYPHS } from "../primitives/glyph";
import { motionTimeSeconds } from "../primitives/motion-time";
import { Pressable } from "../primitives/Pressable";
import { safeAreaInsetAtLeast } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import {
  MENU_BUTTON_PX,
  MENU_EDGE_INSET_DESKTOP_PX,
  MENU_EDGE_INSET_MOBILE_PX,
} from "./chrome-geometry";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import {
  TransfigurationDetailPanel,
  TransfigurationPickerPanel,
  type TransfigurationCandidateView,
} from "./TransfigurationSiteScreen";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";
import { useIsDesktop } from "./use-is-desktop";
import type {
  Dreamsign as DreamsignData,
  DreamAvatar,
  TransfigurationType,
} from "../../types/journey";

export interface ExplorationSiteView {
  /** Stable site id exposed to QA and logging. */
  siteId: string;
  /** Current dreamscape scene art behind the encounter, when resolved. */
  scene: ArtRef | null;
  /** Resident Dream Guide art and greeting. */
  guide: GuideGalleryGuideView;
  /** UUID-backed card selected from the Exploration prototype pool. */
  card: GameCardModel;
  /** Licensed full-resolution source for the selected card's frame break. */
  fullArt: ArtRef;
  /** Opening authored prose shown once the frame break fills the viewport. */
  narrative: string;
  /** The two authored actions for this encounter. */
  actions: readonly [ExplorationActionView, ExplorationActionView];
  /** Persisted action identity after one choice has resolved. */
  resolvedActionId: string | null;
  /** Exact UUID-backed objects granted by the persisted resolution. */
  reward: ExplorationRewardView | null;
  /** Semantic outcome variant presented for logging and browser QA. */
  outcomeKind: string | null;
}
export type ExplorationRewardView =
  | {
      /** Tangible objects granted by the resolution. */
      readonly objects: {
        readonly cards: readonly GameCardModel[];
        readonly purgedCards: readonly ExplorationCardChoiceView[];
        readonly dreamsigns: readonly DreamsignData[];
      };
      /** Persisted mutation applied to every affected UUID-keyed deck entry. */
      readonly deckModification: ExplorationDeckModificationView | null;
    }
  | {
      readonly kind: "transfiguration";
      /** Concrete deck entry whose persisted form changed. */
      readonly entryId: string;
      /** Card as it appeared immediately before the transfiguration. */
      readonly before: GameCardModel;
      /** Persisted transformed card, including its marked display descriptor. */
      readonly after: GameCardModel & {
        readonly transfiguration: NonNullable<GameCardModel["transfiguration"]>;
      };
    }
  | {
      readonly kind: "essence";
      /** Exact deck entries that contributed to the Essence reward. */
      readonly cards: readonly ExplorationCardChoiceView[];
      /** Essence granted by each contributing card. */
      readonly essencePerCard: number;
      /** Authoritative total applied by the reducer. */
      readonly totalEssence: number;
    }
  | {
      readonly kind: "purged-dreamsign-essence";
      /** UUID-resolved Dreamsign removed by the persisted resolution. */
      readonly dreamsign: DreamsignData;
      /** Authoritative total applied by the reducer after the purge. */
      readonly totalEssence: number;
    }
  | {
      readonly kind: "card-copies";
      readonly sourceEntryId: string;
      readonly cards: readonly ExplorationCardChoiceView[];
      readonly count: number;
    }
  | {
      readonly kind: "battle-modifier";
      readonly modifier: "opening-hand" | "starting-energy";
      readonly amount: number;
      readonly battlesRemaining: number;
    }
  | {
      readonly kind: "dream-avatar";
      readonly previous: DreamAvatar | null;
      readonly current: DreamAvatar;
    };

export interface ExplorationDeckModificationView {
  /** Semantic modifier used for the announcement and QA contract. */
  readonly kind: "spark" | "fast" | "energy-cost" | "subtype" | "reclaim";
  /** Compact center copy for the radial announcement. */
  readonly headline: string;
  /** Complete authored effect copy exposed to assistive technology. */
  readonly announcement: string;
  /** Semantic selection-ring color shared by every affected card. */
  readonly selectionColor: CumulusColor;
  /** Exact post-resolution snapshots of the affected deck entries. */
  readonly cards: readonly ExplorationCardChoiceView[];
  /** Exact Reclaim cost by deck-entry UUID for the Reclaim outcome. */
  readonly reclaimCostByEntryId?: Readonly<Record<string, number>>;
}

export interface ExplorationCardChoiceView {
  /** Deck-entry UUID for deck cards, card UUID for catalog offers. */
  entryId: string;
  /** Complete resolved card presentation. */
  model: GameCardModel;
  /** Whether this deck entry is Nightmare, the sole Bane card. */
  isBane: boolean;
}

export type ExplorationFollowupView =
  | { readonly kind: "none" }
  | {
      readonly kind: "transfiguration";
      readonly candidates: readonly TransfigurationCandidateView[];
    }
  | {
      readonly kind: "cards";
      readonly title: string;
      readonly subtitle: string;
      readonly cards: readonly ExplorationCardChoiceView[];
      readonly mode: "single" | "exact" | "purge-and-copy";
      readonly selectionKey: "entryIds" | "cardIds";
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly kind: "packs";
      readonly title: string;
      readonly subtitle: string;
      readonly packs: readonly {
        readonly index: number;
        readonly cards: readonly ExplorationCardChoiceView[];
      }[];
    }
  | {
      readonly kind: "subtypes";
      readonly title: string;
      readonly subtitle: string;
      readonly options: readonly string[];
    }
  | {
      readonly kind: "dreamsigns";
      readonly title: string;
      readonly subtitle: string;
      readonly selectionKey: "replacedDreamsignId" | "dreamsignId";
      readonly dreamsigns: readonly (DreamsignData & { readonly id: string })[];
    }
  | {
      readonly kind: "dreamAvatars";
      readonly title: string;
      readonly subtitle: string;
      readonly dreamAvatars: readonly DreamAvatar[];
    };

export interface ExplorationActionView {
  readonly id: string;
  readonly effectKind: string;
  readonly mechanics: Readonly<Record<string, unknown>>;
  readonly label: string;
  readonly effectText: string;
  readonly effectParts?: readonly ExplorationActionEffectPart[];
  readonly followup: ExplorationFollowupView;
  /** Reducer selection supplied directly when the effect needs no player choice. */
  readonly automaticSelection?: Readonly<Record<string, unknown>>;
  readonly available: boolean;
}

export type ExplorationActionEffectPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "entity"; readonly entity: EntityReferenceModel };

export interface ExplorationSiteScreenProps {
  /** Complete presentation view-model. */
  view: ExplorationSiteView;
  /** Record the start of this client's frame-break presentation. */
  onChannel: () => void;
  /** Resolve one authored action with its UUID-only selection payload. */
  onResolve: (actionId: string, selection?: unknown) => void;
  /** Complete the site after the card has returned to the journey deck. */
  onExit: () => void;
}

interface RectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface CardTrajectory {
  readonly source: RectSnapshot;
  readonly target: RectSnapshot;
  readonly sourceKind: "journey-deck" | "viewport-corner";
}

interface RewardTrajectory {
  readonly source: RectSnapshot;
  readonly target: RectSnapshot;
  readonly destinationKind: "journey-deck" | "journey-dreamsign" | "viewport-corner";
}

function previewEntityForAction(
  action: ExplorationActionView,
): EntityReferenceModel | null {
  for (const part of action.effectParts ?? []) {
    if (part.kind === "entity") return part.entity;
  }
  return null;
}

function explorationChoiceStyle(
  available: boolean,
  revealStyle?: CSSProperties,
): CSSProperties {
  return {
    ...revealStyle,
    width: "100%",
    minHeight: token("--touch-min"),
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: token("--space-4"),
    padding: token("--space-4"),
    border: `1px solid ${token("--border-soft")}`,
    borderRadius: token("--radius-control"),
    background: token("--glass-on-glass-fill"),
    color: token("--text-on-glass"),
    textAlign: "left",
    opacity: available ? 1 : 0.46,
  };
}

function ExplorationChoiceContents({
  action,
  index,
}: {
  readonly action: ExplorationActionView;
  readonly index: number;
}) {
  return (
    <>
      <span style={{ minWidth: 0, display: "grid", gap: token("--space-1") }}>
        <strong style={{ font: token("--t-button") }}>
          {renderRulesSymbolsInline(action.label)}
        </strong>
        <span
          id={`exploration-effect-${String(index)}`}
          style={{ font: token("--t-caption"), color: token("--text-muted") }}
        >
          {action.effectParts === undefined
            ? renderRulesSymbolsInline(action.effectText)
            : action.effectParts.map((part, partIndex) =>
                part.kind === "text" ? (
                  <span key={`text-${String(partIndex)}`}>
                    {renderRulesSymbolsInline(part.text)}
                  </span>
                ) : (
                  <ExplorationEntityLabel
                    key={`entity-${String(partIndex)}`}
                    entity={part.entity}
                    data-testid={`cumulus-exploration-choice-${String(index)}-entity-${String(partIndex)}`}
                  />
                ),
              )}
        </span>
      </span>
      <span aria-hidden="true" style={{ font: token("--t-title") }}>
        ›
      </span>
    </>
  );
}

function ExplorationEntityLabel({
  entity,
  "data-testid": testId,
}: {
  readonly entity: EntityReferenceModel;
  readonly "data-testid": string;
}) {
  const details = entityReferenceDisplayDetails(entity);
  return (
    <span
      data-entity-reference-label={entity.kind}
      data-entity-reference-id={details.id}
      data-entity-reference-copies={details.copies}
      data-testid={testId}
    >
      <RichTextView value={richText.underline(details.name)} />
    </span>
  );
}

interface ExplorationChoiceProps {
  readonly action: ExplorationActionView;
  readonly index: number;
  readonly onActivate: () => void;
}

function PlainExplorationChoice({
  action,
  index,
  onActivate,
}: ExplorationChoiceProps) {
  return (
    <Pressable
      as="button"
      disabled={!action.available}
      aria-describedby={`exploration-effect-${String(index)}`}
      data-testid={`cumulus-exploration-choice-${String(index)}`}
      onClick={onActivate}
      style={explorationChoiceStyle(action.available)}
    >
      <ExplorationChoiceContents action={action} index={index} />
    </Pressable>
  );
}

function EntityExplorationChoice({
  action,
  index,
  onActivate,
  entity,
}: ExplorationChoiceProps & { readonly entity: EntityReferenceModel }) {
  const { details, binding } = useEntityReferenceRevealSource(entity, {
    onActivate: action.available ? onActivate : undefined,
  });
  const suppressCompatibilityClick = useRef(false);
  const pointerDown = binding.sourceProps.onPointerDown;
  const revealDescriptionId = binding.sourceProps["aria-describedby"];

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      disabled={!action.available}
      aria-describedby={`${revealDescriptionId ?? ""} exploration-effect-${String(index)}`.trim()}
      data-entity-reference={entity.kind}
      data-entity-reference-id={details.id}
      data-entity-reference-copies={details.copies}
      data-testid={`cumulus-exploration-choice-${String(index)}`}
      onPointerDown={(event) => {
        suppressCompatibilityClick.current = event.pointerType === "touch";
        pointerDown?.(event);
      }}
      onClick={(event) => {
        if (!action.available) return;
        if (event.detail === 0) {
          suppressCompatibilityClick.current = false;
          onActivate();
          return;
        }
        if (suppressCompatibilityClick.current) {
          suppressCompatibilityClick.current = false;
          return;
        }
        onActivate();
      }}
      style={explorationChoiceStyle(
        action.available,
        binding.sourceProps.style,
      )}
    >
      <ExplorationChoiceContents action={action} index={index} />
    </Pressable>
  );
}

function ExplorationChoice(props: ExplorationChoiceProps) {
  const entity = previewEntityForAction(props.action);
  return entity === null ? (
    <PlainExplorationChoice {...props} />
  ) : (
    <EntityExplorationChoice {...props} entity={entity} />
  );
}

type ExplorationRewardItem =
  | {
      readonly key: string;
      readonly kind: "card";
      readonly id: string;
      readonly card: GameCardModel;
    }
  | {
      readonly key: string;
      readonly kind: "dreamsign";
      readonly id: string;
      readonly dreamsign: DreamsignData;
    };

interface FrameBreakGeometry {
  readonly frame: RectSnapshot;
  readonly art: RectSnapshot;
  readonly viewport: RectSnapshot;
}

type FrameBreakPhase =
  | "idle"
  | "fracturing"
  | "open"
  | "collapsing"
  | "returning";
type CollapseIntent = "preview" | "exit";

const DESKTOP_PANEL_HEIGHT = 580;
const DESKTOP_PANEL_MAX_WIDTH = 620;
const DESKTOP_CARD_WIDTH = 240;
const MOBILE_CARD_WIDTH = "min(45vw, 190px)";
const DRAW_FALLBACK_INSET = 16;
const DRAW_FALLBACK_HEIGHT = 70;
const TRAVEL_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const FLIP_SECONDS = motionTimeSeconds("--dur-slow");
const FLIP_DELAY_SECONDS = motionTimeSeconds("--dur-base");
const FRAME_BREAK_SECONDS = motionTimeSeconds("--dur-slow") * 2.5;
const FRAME_BREAK_DELAY_SECONDS = motionTimeSeconds("--dur-fast");
const FRAME_FRACTURE_SECONDS =
  motionTimeSeconds("--dur-base") + motionTimeSeconds("--dur-fast");
const REWARD_READING_SECONDS = motionTimeSeconds("--dur-slow") * 4;
const DREAMSIGN_PURGE_SECONDS = motionTimeSeconds("--dur-slow") * 4;
const ESSENCE_CARD_READING_SECONDS = motionTimeSeconds("--dur-slow") * 8;
const REWARD_TRAVEL_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const REWARD_STAGGER_SECONDS = motionTimeSeconds("--dur-fast");
const TRANSFIGURATION_ORIGINAL_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const TRANSFIGURATION_FLIP_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const TRANSFIGURATION_READING_SECONDS = motionTimeSeconds("--dur-slow") * 4;
const TYPEWRITER_SECONDS = motionTimeSeconds("--dur-exploration-typewriter");
const CHOICE_STAGGER_SECONDS = motionTimeSeconds(
  "--delay-exploration-choice-stagger",
);
const DESKTOP_REWARD_CARD_WIDTH = 240;
const DESKTOP_TRANSFIGURATION_CARD_WIDTH = 240;
const MOBILE_TRANSFIGURATION_CARD_WIDTH = "min(58vw, 240px)";
const DESKTOP_REWARD_DREAMSIGN_SIZE = 240;
const MOBILE_REWARD_DREAMSIGN_SIZE = 180;
const DESKTOP_DREAMSIGN_CHOICE_SIZE = 154;
const MOBILE_DREAMSIGN_CHOICE_SIZE = 120;
const DESKTOP_DECK_MODIFICATION_CARD_WIDTH = 126;
const MOBILE_DECK_MODIFICATION_CARD_WIDTH = 84;
const DESKTOP_DECK_MODIFICATION_RADIUS_X = 280;
const DESKTOP_DECK_MODIFICATION_RADIUS_Y = 175;
const MOBILE_DECK_MODIFICATION_RADIUS_X = 132;
const MOBILE_DECK_MODIFICATION_RADIUS_Y = 205;
const DESKTOP_ESSENCE_CARD_WIDTH = 156;
const MOBILE_ESSENCE_CARD_WIDTH = "min(28vw, 112px)";
const ESSENCE_CHIP_LAYER = 12;
const DESKTOP_FLOATING_PANEL_BOTTOM =
  `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-9")})`;
// The card preview cache appends a 21px watermark strip to a 259px-tall
// content image. Licensed originals contain the 259px content region only.
const CARD_PREVIEW_CONTENT_FRACTION = 259 / 280;
// Sits above all screen-owned content (≤20) and below the journey status bar
// (40/41) and utility menu (60).
const FRAME_BREAK_LAYER = 39;
const FRAME_BREAK_EXIT_LAYER = 61;
const DREAM_EASE = [0.22, 0.61, 0.36, 1] as const;

function ExplorationNarrativeChoices({
  narrative,
  actions,
  reduceMotion,
  onActivate,
}: {
  readonly narrative: string;
  readonly actions: ExplorationSiteView["actions"];
  readonly reduceMotion: boolean;
  readonly onActivate: (action: ExplorationActionView) => void;
}) {
  const characters = useMemo(() => Array.from(narrative), [narrative]);
  const [visibleCharacterCount, setVisibleCharacterCount] = useState(
    reduceMotion ? characters.length : 0,
  );
  const [revealedChoiceCount, setRevealedChoiceCount] = useState(
    reduceMotion ? actions.length : 0,
  );

  useEffect(() => {
    if (reduceMotion || characters.length === 0) {
      setVisibleCharacterCount(characters.length);
      return;
    }

    setVisibleCharacterCount(0);
    const durationMs = TYPEWRITER_SECONDS * 1_000;
    const timers = characters.map((_, index) => {
      const nextCount = index + 1;
      return window.setTimeout(() => {
        setVisibleCharacterCount(nextCount);
      }, (durationMs * nextCount) / characters.length);
    });
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [characters, reduceMotion]);

  const typewriterComplete = visibleCharacterCount === characters.length;

  useEffect(() => {
    if (!typewriterComplete) {
      setRevealedChoiceCount(0);
      return;
    }
    if (reduceMotion || actions.length < 2) {
      setRevealedChoiceCount(actions.length);
      return;
    }

    setRevealedChoiceCount(1);
    const timer = window.setTimeout(() => {
      setRevealedChoiceCount(actions.length);
    }, CHOICE_STAGGER_SECONDS * 1_000);
    return () => window.clearTimeout(timer);
  }, [actions.length, reduceMotion, typewriterComplete]);

  const visibleNarrative = characters
    .slice(0, visibleCharacterCount)
    .join("");

  return (
    <>
      <p
        aria-label={narrative}
        style={{
          margin: 0,
          display: "grid",
          font: token("--t-body"),
          color: token("--text-on-glass"),
          lineHeight: 1.55,
        }}
      >
        <span
          aria-hidden="true"
          style={{ gridArea: "1 / 1", visibility: "hidden" }}
        >
          {narrative}
        </span>
        <span
          aria-hidden="true"
          data-testid="cumulus-exploration-narrative-copy"
          data-exploration-typewriter-state={
            typewriterComplete ? "complete" : "typing"
          }
          data-exploration-visible-character-count={visibleCharacterCount}
          style={{ gridArea: "1 / 1" }}
        >
          {visibleNarrative}
        </span>
      </p>
      <motion.div
        role="group"
        aria-label="Exploration choices"
        aria-hidden={revealedChoiceCount === 0}
        data-exploration-choices-state={
          revealedChoiceCount === actions.length
            ? "revealed"
            : revealedChoiceCount === 0
              ? "waiting"
              : "staggering"
        }
        initial={false}
        style={{
          display: "grid",
          gap: token("--space-3"),
        }}
      >
        {actions.map((action, index) => {
          const visible = index < revealedChoiceCount;
          return (
            <motion.div
              key={action.id}
              aria-hidden={!visible}
              data-exploration-choice-reveal-state={
                visible ? "revealed" : "waiting"
              }
              initial={false}
              animate={{
                opacity: visible ? 1 : 0,
                y: visible || reduceMotion ? 0 : token("--space-2"),
              }}
              transition={{
                duration: reduceMotion
                  ? 0
                  : motionTimeSeconds("--dur-base"),
                ease: DREAM_EASE,
              }}
              style={{
                visibility: visible ? "visible" : "hidden",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              <ExplorationChoice
                action={{
                  ...action,
                  available: visible && action.available,
                }}
                index={index}
                onActivate={() => onActivate(action)}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
}

function cardChoiceColumns(
  count: number,
  layout: "mobile" | "desktop",
): CardChoiceGridColumns {
  const columns =
    layout === "desktop"
      ? Math.min(5, Math.max(1, count))
      : Math.min(2, Math.max(1, count));
  if (columns === 1) return "one";
  if (columns === 2) return "two";
  if (columns === 3) return "three";
  if (columns === 4) return "four";
  return "five";
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function fallbackArtRect(frame: RectSnapshot): RectSnapshot {
  const sourceAspect = 5655 / 3181;
  const width = Math.max(frame.width, frame.height * sourceAspect);
  const height = width / sourceAspect;
  return {
    left: (frame.width - width) / 2,
    top: (frame.height - height) / 2,
    width,
    height,
  };
}

function measureFrameBreak(
  target: HTMLDivElement | null,
): FrameBreakGeometry | null {
  if (target === null) return null;
  const frameRect = target.getBoundingClientRect();
  if (frameRect.width <= 0 || frameRect.height <= 0) return null;
  const frame = snapshotRect(frameRect);
  const preview = target.querySelector<HTMLImageElement>(
    'img[alt]:not([alt=""])',
  );
  const previewRect = preview?.getBoundingClientRect();
  const art =
    previewRect === undefined ||
    previewRect.width <= 0 ||
    previewRect.height <= 0
      ? fallbackArtRect(frame)
      : {
          left: previewRect.left - frame.left,
          top: previewRect.top - frame.top,
          width: previewRect.width,
          height: previewRect.height * CARD_PREVIEW_CONTENT_FRACTION,
        };
  return {
    frame,
    art,
    viewport: {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

function sourceRectFor(target: RectSnapshot): {
  rect: RectSnapshot;
  kind: CardTrajectory["sourceKind"];
} {
  const deckTarget = document.querySelector<HTMLElement>(
    "[data-journey-deck-target]",
  );
  const deckRect = deckTarget?.getBoundingClientRect();
  if (deckRect !== undefined && deckRect.width > 0 && deckRect.height > 0) {
    const height = Math.min(deckRect.height, target.height);
    const width = height * CARD_ASPECT_RATIO_VALUE;
    return {
      kind: "journey-deck",
      rect: {
        left: deckRect.left + (deckRect.width - width) / 2,
        top: deckRect.top + (deckRect.height - height) / 2,
        width,
        height,
      },
    };
  }

  // A bounded card-sized source keeps the animation reviewable even when the
  // shared HUD has not mounted yet (for example, an isolated screen test).
  const height = Math.min(DRAW_FALLBACK_HEIGHT, target.height);
  const width = height * CARD_ASPECT_RATIO_VALUE;
  return {
    kind: "viewport-corner",
    rect: {
      left: window.innerWidth - width - DRAW_FALLBACK_INSET,
      top: window.innerHeight - height - DRAW_FALLBACK_INSET,
      width,
      height,
    },
  };
}

function rewardItemsFor(
  reward: ExplorationRewardView | null,
): readonly ExplorationRewardItem[] {
  if (reward === null || "kind" in reward) return [];
  return [
    ...reward.objects.cards.map((card, index) => ({
      key: `card:${String(index)}:${card.cardId}`,
      kind: "card" as const,
      id: card.cardId,
      card,
    })),
    ...reward.objects.dreamsigns.map((dreamsign, index) => ({
      key: `dreamsign:${String(index)}:${dreamsign.id ?? "missing"}`,
      kind: "dreamsign" as const,
      id: dreamsign.id ?? "missing",
      dreamsign,
    })),
  ];
}

function explorationRewardIdentity(
  actionId: string | null,
  reward: ExplorationRewardView | null,
): string | null {
  if (actionId === null || reward === null) return null;
  if (!("kind" in reward)) {
    return [
      actionId,
      reward.deckModification?.kind ?? "objects-only",
      ...(reward.deckModification?.cards.map((card) => card.entryId) ?? []),
      ...reward.objects.purgedCards.map(
        (card) => `purged:${card.entryId}:${card.model.cardId}`,
      ),
      ...reward.objects.cards.map((card) => `gained:${card.cardId}`),
      ...reward.objects.dreamsigns.map(
        (dreamsign) => `dreamsign:${dreamsign.id ?? "missing"}`,
      ),
    ].join("|");
  }
  switch (reward.kind) {
    case "essence":
      return [actionId, reward.kind, ...reward.cards.map((card) => card.entryId)].join("|");
    case "transfiguration":
      return [
        actionId,
        reward.kind,
        reward.entryId,
        reward.after.cardId,
        reward.after.transfiguration.type,
      ].join("|");
    case "purged-dreamsign-essence":
      return [
        actionId,
        reward.kind,
        reward.dreamsign.id ?? "missing",
        reward.totalEssence,
      ].join("|");
    case "card-copies":
      return [
        actionId,
        reward.kind,
        reward.sourceEntryId,
        ...reward.cards.map((card) => card.entryId),
      ].join("|");
    case "battle-modifier":
      return [actionId, reward.kind, reward.modifier, reward.amount].join("|");
    case "dream-avatar":
      return [actionId, reward.kind, reward.current.id].join("|");
  }
}

function deckModificationCardPose(
  index: number,
  count: number,
  layout: "mobile" | "desktop",
): { readonly x: number; readonly y: number; readonly rotate: number } {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  const radiusVariation = 0.9 + (index % 3) * 0.05;
  const radiusX =
    (layout === "desktop"
      ? DESKTOP_DECK_MODIFICATION_RADIUS_X
      : MOBILE_DECK_MODIFICATION_RADIUS_X) * radiusVariation;
  const radiusY =
    (layout === "desktop"
      ? DESKTOP_DECK_MODIFICATION_RADIUS_Y
      : MOBILE_DECK_MODIFICATION_RADIUS_Y) * radiusVariation;
  return {
    x: Math.cos(angle) * radiusX,
    y: Math.sin(angle) * radiusY,
    rotate: ((index % 5) - 2) * 3,
  };
}

function visibleHudDreamsign(dreamsignId: string): HTMLElement | null {
  const targets = document.querySelectorAll<HTMLElement>("[data-dreamsign-id]");
  for (const target of targets) {
    if (
      target.dataset.dreamsignId === dreamsignId &&
      target.closest("[data-exploration-reward-stage]") === null &&
      target.closest("[data-exploration-reward-flight]") === null
    ) {
      return target;
    }
  }
  return null;
}

function rewardTargetFor(
  item: ExplorationRewardItem,
  source: RectSnapshot,
): RewardTrajectory {
  if (item.kind === "dreamsign") {
    const dreamsignTarget = visibleHudDreamsign(item.id);
    const dreamsignRect = dreamsignTarget?.getBoundingClientRect();
    if (
      dreamsignRect !== undefined &&
      dreamsignRect.width > 0 &&
      dreamsignRect.height > 0
    ) {
      return {
        source,
        target: snapshotRect(dreamsignRect),
        destinationKind: "journey-dreamsign",
      };
    }
  }
  const destination = sourceRectFor(source);
  return {
    source,
    target: destination.rect,
    destinationKind: destination.kind,
  };
}

function useCardTrajectory(
  targetRef: RefObject<HTMLDivElement | null>,
  cardId: string,
  reduceMotion: boolean,
): CardTrajectory | null {
  const [trajectory, setTrajectory] = useState<CardTrajectory | null>(null);

  useLayoutEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    const measure = (): void => {
      const targetRect = targetRef.current?.getBoundingClientRect();
      if (
        targetRect === undefined ||
        targetRect.width === 0 ||
        targetRect.height === 0
      ) {
        frame = window.requestAnimationFrame(measure);
        return;
      }
      const target = snapshotRect(targetRect);
      const source = sourceRectFor(target);
      setTrajectory({
        source: source.rect,
        target,
        sourceKind: source.kind,
      });
    };
    frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [cardId, reduceMotion, targetRef]);

  return trajectory;
}

export function ExplorationSiteScreen({
  view,
  onChannel,
  onResolve,
  onExit,
}: ExplorationSiteScreenProps) {
  const reduceMotion = useReducedMotion() === true;
  const isDesktop = useIsDesktop();
  const cardTargetRef = useRef<HTMLDivElement>(null);
  const exitCompletedRef = useRef(false);
  const resumedResolutionRef = useRef<string | null>(null);
  const rewardItemRefs = useRef(new Map<string, HTMLDivElement>());
  const transfigurationCardRef = useRef<HTMLDivElement>(null);
  const completedRewardItemsRef = useRef(new Set<string>());
  const [revealed, setRevealed] = useState(reduceMotion);
  const [frameBreakGeometry, setFrameBreakGeometry] =
    useState<FrameBreakGeometry | null>(null);
  const [frameBreakActive, setFrameBreakActive] = useState(false);
  const [frameBreakPhase, setFrameBreakPhase] =
    useState<FrameBreakPhase>("idle");
  const [collapseIntent, setCollapseIntent] =
    useState<CollapseIntent>("preview");
  const [returnTrajectory, setReturnTrajectory] =
    useState<CardTrajectory | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [purgeEntryId, setPurgeEntryId] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [selectedTransfigurationEntryId, setSelectedTransfigurationEntryId] =
    useState<string | null>(null);
  const [selectedTransfigurationFormType, setSelectedTransfigurationFormType] =
    useState<TransfigurationType | null>(null);
  const [transfigurationConfirming, setTransfigurationConfirming] =
    useState(false);
  const [rewardTrajectories, setRewardTrajectories] = useState<
    ReadonlyMap<string, RewardTrajectory> | null
  >(null);
  const [essenceRewardPhase, setEssenceRewardPhase] = useState<
    "cards" | "announcement"
  >("cards");
  const [dreamsignPurgeRewardPhase, setDreamsignPurgeRewardPhase] = useState<
    "purging" | "announcement"
  >("purging");
  const [deckModificationPresented, setDeckModificationPresented] =
    useState(false);
  const [purgedCardsPresented, setPurgedCardsPresented] = useState(false);
  const [transfigurationRevealed, setTransfigurationRevealed] =
    useState(false);
  const [transfigurationReturn, setTransfigurationReturn] =
    useState<RewardTrajectory | null>(null);
  const fullArtUrl = resolveArtRef(view.fullArt);
  const trajectory = useCardTrajectory(
    cardTargetRef,
    view.card.cardId,
    reduceMotion,
  );
  const activeAction =
    view.actions.find((action) => action.id === activeActionId) ?? null;
  const resolvedReward =
    view.reward !== null && !("kind" in view.reward) ? view.reward : null;
  const effectReward =
    view.reward !== null && "kind" in view.reward ? view.reward : null;
  const transfigurationReward =
    effectReward?.kind === "transfiguration" ? effectReward : null;
  const objectReward = resolvedReward?.objects ?? null;
  const purgedRewardCards = objectReward?.purgedCards ?? [];
  const deckModification = resolvedReward?.deckModification ?? null;
  const essenceReward =
    effectReward?.kind === "essence" ? effectReward : null;
  const dreamsignPurgeReward =
    effectReward?.kind === "purged-dreamsign-essence" ? effectReward : null;
  const cardCopiesReward =
    effectReward?.kind === "card-copies" ? effectReward : null;
  const battleModifierReward =
    effectReward?.kind === "battle-modifier" ? effectReward : null;
  const dreamAvatarReward =
    effectReward?.kind === "dream-avatar" ? effectReward : null;
  const rewardItems = useMemo(() => rewardItemsFor(view.reward), [view.reward]);
  const purgeBeforeDeckModification =
    deckModification?.kind === "reclaim" && purgedRewardCards.length > 0;
  const showDeckModification =
    deckModification !== null &&
    !deckModificationPresented &&
    (!purgeBeforeDeckModification || purgedCardsPresented);
  const showObjectReward =
    (purgeBeforeDeckModification
      ? !purgedCardsPresented
      : !showDeckModification) &&
    (rewardItems.length > 0 || purgedRewardCards.length > 0);
  const rewardStageAnnouncement =
    purgedRewardCards.length === 0
      ? `Gained ${String(rewardItems.length)} ${rewardItems.length === 1 ? "reward" : "rewards"}`
      : rewardItems.length === 0
        ? `Purging ${String(purgedRewardCards.length)} ${purgedRewardCards.length === 1 ? "card" : "cards"}`
        : `Purging ${String(purgedRewardCards.length)} ${purgedRewardCards.length === 1 ? "card" : "cards"} and gaining ${String(rewardItems.length)} ${rewardItems.length === 1 ? "reward" : "rewards"}`;
  const rewardIdentity = explorationRewardIdentity(
    view.resolvedActionId,
    view.reward,
  );
  useEffect(() => {
    if (view.resolvedActionId === null) return;
    setActiveActionId(null);
    setSelectedIds([]);
    setPurgeEntryId(null);
    setSelectedSubtype(null);
    setSelectedTransfigurationEntryId(null);
    setSelectedTransfigurationFormType(null);
    setTransfigurationConfirming(false);
  }, [view.resolvedActionId]);

  useEffect(() => {
    completedRewardItemsRef.current.clear();
    rewardItemRefs.current.clear();
    setRewardTrajectories(null);
    setEssenceRewardPhase("cards");
    setDreamsignPurgeRewardPhase("purging");
    setDeckModificationPresented(false);
    setPurgedCardsPresented(false);
    setTransfigurationRevealed(false);
    setTransfigurationReturn(null);
  }, [rewardIdentity]);

  useLayoutEffect(() => {
    const resolutionId = view.resolvedActionId;
    if (
      resolutionId === null ||
      frameBreakGeometry !== null ||
      resumedResolutionRef.current === resolutionId
    ) {
      return;
    }
    let animationFrame = 0;
    const resumePersistedResolution = (): void => {
      const geometry = measureFrameBreak(cardTargetRef.current);
      if (geometry === null) {
        animationFrame = window.requestAnimationFrame(
          resumePersistedResolution,
        );
        return;
      }
      resumedResolutionRef.current = resolutionId;
      setRevealed(true);
      setFrameBreakGeometry(geometry);
      setFrameBreakActive(true);
      setFrameBreakPhase("open");
    };
    animationFrame = window.requestAnimationFrame(resumePersistedResolution);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [frameBreakGeometry, view.resolvedActionId]);

  useEffect(() => {
    if (reduceMotion) setRevealed(true);
  }, [reduceMotion]);

  useEffect(() => {
    if (frameBreakGeometry === null) return;
    const presence = document.querySelector<HTMLElement>(
      "[data-coop-presence-status]",
    );
    if (presence === null) return;
    const previousVisibility = presence.style.visibility;
    presence.style.visibility = "hidden";
    return () => {
      presence.style.visibility = previousVisibility;
    };
  }, [frameBreakGeometry]);

  useEffect(() => {
    if (frameBreakGeometry === null || frameBreakPhase !== "open") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (view.resolvedActionId !== null || view.reward !== null) return;
      if (activeAction !== null) {
        setActiveActionId(null);
        setSelectedIds([]);
        setPurgeEntryId(null);
        setSelectedTransfigurationEntryId(null);
        setSelectedTransfigurationFormType(null);
        setTransfigurationConfirming(false);
        return;
      }
      setCollapseIntent("preview");
      setFrameBreakActive(false);
      if (reduceMotion) {
        setFrameBreakGeometry(null);
        setFrameBreakPhase("idle");
      } else {
        setFrameBreakPhase("collapsing");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAction, frameBreakGeometry, frameBreakPhase, reduceMotion, view.resolvedActionId, view.reward]);

  const startFrameBreak = (): void => {
    const geometry = measureFrameBreak(cardTargetRef.current);
    if (geometry === null) return;
    setFrameBreakGeometry(geometry);
    setCollapseIntent("preview");
    setFrameBreakActive(true);
    setFrameBreakPhase(reduceMotion ? "open" : "fracturing");
    onChannel();
  };

  const collapseFrameBreak = (): void => {
    setCollapseIntent("preview");
    setFrameBreakActive(false);
    if (reduceMotion) {
      setFrameBreakGeometry(null);
      setFrameBreakPhase("idle");
    } else {
      setFrameBreakPhase("collapsing");
    }
  };

  const completeExit = useCallback((): void => {
    if (exitCompletedRef.current) return;
    exitCompletedRef.current = true;
    onExit();
  }, [onExit]);

  useEffect(() => {
    if (
      transfigurationReward === null ||
      frameBreakPhase !== "open" ||
      transfigurationRevealed ||
      transfigurationReturn !== null
    ) {
      return;
    }
    if (reduceMotion) {
      completeExit();
      return;
    }
    const timer = window.setTimeout(() => {
      setTransfigurationRevealed(true);
    }, TRANSFIGURATION_ORIGINAL_SECONDS * 1_000);
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    frameBreakPhase,
    reduceMotion,
    transfigurationReturn,
    transfigurationRevealed,
    transfigurationReward,
  ]);

  useEffect(() => {
    if (
      transfigurationReward === null ||
      frameBreakPhase !== "open" ||
      !transfigurationRevealed ||
      transfigurationReturn !== null ||
      reduceMotion
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const sourceRect =
        transfigurationCardRef.current?.getBoundingClientRect();
      if (
        sourceRect === undefined ||
        sourceRect.width <= 0 ||
        sourceRect.height <= 0
      ) {
        completeExit();
        return;
      }
      const source = snapshotRect(sourceRect);
      const destination = sourceRectFor(source);
      setTransfigurationReturn({
        source,
        target: destination.rect,
        destinationKind: destination.kind,
      });
    }, (TRANSFIGURATION_FLIP_SECONDS + TRANSFIGURATION_READING_SECONDS) * 1_000);
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    frameBreakPhase,
    reduceMotion,
    transfigurationReturn,
    transfigurationRevealed,
    transfigurationReward,
  ]);

  useLayoutEffect(() => {
    if (
      rewardIdentity === null ||
      objectReward === null ||
      !showObjectReward ||
      frameBreakPhase !== "open"
    ) {
      return;
    }
    let animationFrame = 0;
    const hiddenTargets = new Map<HTMLElement, string>();
    const hideDockedDreamsigns = (): void => {
      for (const dreamsign of objectReward.dreamsigns) {
        if (dreamsign.id === undefined) continue;
        const target = visibleHudDreamsign(dreamsign.id);
        if (target === null || hiddenTargets.has(target)) continue;
        hiddenTargets.set(target, target.style.visibility);
        target.style.visibility = "hidden";
      }
    };
    animationFrame = window.requestAnimationFrame(hideDockedDreamsigns);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      for (const [target, visibility] of hiddenTargets) {
        target.style.visibility = visibility;
      }
    };
  }, [frameBreakPhase, objectReward, rewardIdentity, showObjectReward]);

  useEffect(() => {
    if (
      rewardIdentity === null ||
      rewardItems.length === 0 ||
      !showObjectReward ||
      frameBreakPhase !== "open" ||
      rewardTrajectories !== null
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (reduceMotion) {
        completeExit();
        return;
      }
      const trajectories = new Map<string, RewardTrajectory>();
      for (const item of rewardItems) {
        const sourceRect = rewardItemRefs.current
          .get(item.key)
          ?.getBoundingClientRect();
        if (
          sourceRect === undefined ||
          sourceRect.width <= 0 ||
          sourceRect.height <= 0
        ) {
          continue;
        }
        const source = snapshotRect(sourceRect);
        trajectories.set(item.key, rewardTargetFor(item, source));
      }
      if (trajectories.size === 0) {
        completeExit();
        return;
      }
      setRewardTrajectories(trajectories);
    }, REWARD_READING_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    frameBreakPhase,
    reduceMotion,
    rewardIdentity,
    rewardItems,
    rewardTrajectories,
    showObjectReward,
  ]);

  useEffect(() => {
    if (
      rewardIdentity === null ||
      purgedRewardCards.length === 0 ||
      rewardItems.length > 0 ||
      !showObjectReward ||
      frameBreakPhase !== "open"
    ) {
      return;
    }
    const timer = window.setTimeout(
      purgeBeforeDeckModification
        ? () => setPurgedCardsPresented(true)
        : completeExit,
      REWARD_READING_SECONDS * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    frameBreakPhase,
    purgedRewardCards.length,
    purgeBeforeDeckModification,
    rewardIdentity,
    rewardItems.length,
    showObjectReward,
  ]);

  useEffect(() => {
    if (
      rewardIdentity === null ||
      deckModification === null ||
      !showDeckModification ||
      frameBreakPhase !== "open"
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (
        purgeBeforeDeckModification ||
        (rewardItems.length === 0 && purgedRewardCards.length === 0)
      ) {
        completeExit();
        return;
      }
      setDeckModificationPresented(true);
    }, RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    deckModification,
    frameBreakPhase,
    rewardIdentity,
    purgedRewardCards.length,
    purgeBeforeDeckModification,
    rewardItems.length,
    showDeckModification,
  ]);

  useEffect(() => {
    if (
      essenceReward === null ||
      frameBreakPhase !== "open" ||
      essenceRewardPhase !== "cards"
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setEssenceRewardPhase("announcement");
    }, ESSENCE_CARD_READING_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [essenceReward, essenceRewardPhase, frameBreakPhase]);

  useEffect(() => {
    if (
      essenceReward === null ||
      frameBreakPhase !== "open" ||
      essenceRewardPhase !== "announcement"
    ) {
      return;
    }
    const timer = window.setTimeout(
      completeExit,
      RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    essenceReward,
    essenceRewardPhase,
    frameBreakPhase,
  ]);

  useEffect(() => {
    if (
      dreamsignPurgeReward === null ||
      frameBreakPhase !== "open" ||
      dreamsignPurgeRewardPhase !== "announcement"
    ) {
      return;
    }
    const timer = window.setTimeout(
      completeExit,
      RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    dreamsignPurgeReward,
    dreamsignPurgeRewardPhase,
    frameBreakPhase,
  ]);

  useEffect(() => {
    if (
      frameBreakPhase !== "open" ||
      (cardCopiesReward === null &&
        battleModifierReward === null &&
        dreamAvatarReward === null)
    ) {
      return;
    }
    const duration =
      cardCopiesReward === null
        ? RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS
        : REWARD_READING_SECONDS * 1_000;
    const timer = window.setTimeout(completeExit, duration);
    return () => window.clearTimeout(timer);
  }, [
    battleModifierReward,
    cardCopiesReward,
    completeExit,
    dreamAvatarReward,
    frameBreakPhase,
  ]);

  const finishRewardItem = (itemKey: string): void => {
    completedRewardItemsRef.current.add(itemKey);
    if (
      completedRewardItemsRef.current.size >=
      (rewardTrajectories?.size ?? Number.POSITIVE_INFINITY)
    ) {
      completeExit();
    }
  };

  const exitExploration = useCallback((): void => {
    setCollapseIntent("exit");
    setFrameBreakActive(false);
    if (reduceMotion) {
      setRevealed(false);
      setFrameBreakGeometry(null);
      setFrameBreakPhase("returning");
      completeExit();
    } else {
      setFrameBreakPhase("collapsing");
    }
  }, [completeExit, reduceMotion]);

  useEffect(() => {
    if (
      view.resolvedActionId === null ||
      view.reward !== null ||
      frameBreakGeometry === null ||
      frameBreakPhase !== "open" ||
      activeAction !== null
    ) {
      return;
    }
    exitExploration();
  }, [
    activeAction,
    exitExploration,
    frameBreakGeometry,
    frameBreakPhase,
    view.resolvedActionId,
    view.reward,
  ]);

  const finishFrameBreakMotion = (): void => {
    if (frameBreakActive) {
      setFrameBreakPhase("open");
      return;
    }
    if (collapseIntent === "exit" && frameBreakGeometry !== null) {
      const destination = sourceRectFor(frameBreakGeometry.frame);
      setReturnTrajectory({
        source: destination.rect,
        target: frameBreakGeometry.frame,
        sourceKind: destination.kind,
      });
      setRevealed(false);
      setFrameBreakGeometry(null);
      setFrameBreakPhase("returning");
      return;
    }
    setFrameBreakGeometry(null);
    setFrameBreakPhase("idle");
  };

  const exitEdgeInset = isDesktop
    ? MENU_EDGE_INSET_DESKTOP_PX
    : MENU_EDGE_INSET_MOBILE_PX;

  const openAction = (action: ExplorationActionView): void => {
    if (action.followup.kind === "none") {
      if (action.automaticSelection === undefined) {
        onResolve(action.id);
      } else {
        onResolve(action.id, action.automaticSelection);
      }
      return;
    }
    setActiveActionId(action.id);
    setSelectedIds([]);
    setPurgeEntryId(null);
    setSelectedSubtype(null);
    setSelectedTransfigurationEntryId(null);
    setSelectedTransfigurationFormType(null);
    setTransfigurationConfirming(false);
  };

  const toggleCard = (entryId: string): void => {
    if (activeAction?.followup.kind !== "cards") return;
    const followup = activeAction.followup;
    if (followup.mode === "purge-and-copy") {
      if (purgeEntryId === null) {
        setPurgeEntryId(entryId);
        setSelectedIds([]);
      } else if (entryId === purgeEntryId) {
        setPurgeEntryId(null);
        setSelectedIds([]);
      } else {
        setSelectedIds((current) =>
          current.includes(entryId) ? [] : [entryId],
        );
      }
      return;
    }
    setSelectedIds((current) => {
      if (current.includes(entryId)) {
        return current.filter((candidate) => candidate !== entryId);
      }
      if (followup.mode === "single") return [entryId];
      if (current.length >= followup.max) return current;
      return [...current, entryId];
    });
  };

  const commitFollowup = (): void => {
    if (activeAction === null) return;
    const followup = activeAction.followup;
    if (followup.kind === "cards") {
      if (followup.mode === "purge-and-copy") {
        const copyEntryId = selectedIds[0];
        if (purgeEntryId === null || copyEntryId === undefined) return;
        onResolve(activeAction.id, { purgeEntryId, copyEntryId });
        return;
      }
      if (selectedIds.length < followup.min || selectedIds.length > followup.max) return;
      onResolve(activeAction.id, { [followup.selectionKey]: selectedIds });
      return;
    }
    if (followup.kind === "subtypes") {
      if (selectedSubtype === null) return;
      onResolve(activeAction.id, { subtype: selectedSubtype });
      return;
    }
  };

  const chooseDreamsign = (dreamsignId: string): void => {
    if (activeAction?.followup.kind !== "dreamsigns") return;
    onResolve(activeAction.id, {
      [activeAction.followup.selectionKey]: dreamsignId,
    });
  };

  const canCommitFollowup = (() => {
    const followup = activeAction?.followup;
    if (followup === undefined || followup.kind === "none") return false;
    if (followup.kind === "transfiguration") return false;
    if (followup.kind === "cards") {
      return followup.mode === "purge-and-copy"
        ? purgeEntryId !== null && selectedIds.length === 1
        : selectedIds.length >= followup.min && selectedIds.length <= followup.max;
    }
    if (followup.kind === "packs") return false;
    if (followup.kind === "subtypes") return selectedSubtype !== null;
    return false;
  })();
  const dreamsignChoiceColumns =
    activeAction?.followup.kind === "dreamsigns"
      ? Math.min(4, Math.max(1, activeAction.followup.dreamsigns.length))
      : 0;
  const centeredFollowupWidth =
    activeAction?.followup.kind === "packs"
      ? "min(1280px, calc(100vw - 64px))"
      : activeAction?.followup.kind === "cards" &&
          activeAction.followup.selectionKey === "cardIds"
        ? "min(1120px, calc(100vw - 64px))"
        : activeAction?.followup.kind === "dreamsigns"
          ? `min(max(420px, calc(${String(dreamsignChoiceColumns)} * ${String(DESKTOP_DREAMSIGN_CHOICE_SIZE)}px + ${String(dreamsignChoiceColumns - 1)} * ${token("--space-9")} + 2 * ${token("--space-8")})), calc(100vw - 64px))`
          : activeAction?.followup.kind === "dreamAvatars"
            ? "min(960px, calc(100vw - 64px))"
            : null;

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="cumulus-exploration-site-screen"
      guideArtTestId="cumulus-exploration-guide-art"
      speechAnchorTestId="cumulus-exploration-speech-anchor"
      speechBubbleTestId="cumulus-exploration-speech"
      renderGallery={(layout) => (
        <section
          data-exploration-gallery=""
          data-exploration-layout={layout}
          style={{
            position: "relative",
            zIndex: 10,
            minHeight: 0,
            height: layout === "desktop" ? DESKTOP_PANEL_HEIGHT : "100%",
            maxHeight: "100%",
            width:
              layout === "desktop" ? "100%" : GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
            maxWidth:
              layout === "desktop" ? DESKTOP_PANEL_MAX_WIDTH : undefined,
            boxSizing: "border-box",
            pointerEvents: "auto",
            alignSelf: layout === "desktop" ? "center" : "start",
            justifySelf: "center",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              display: "grid",
              justifyItems: "center",
              gap: token("--space-6"),
            }}
          >
            <div
              ref={cardTargetRef}
              data-exploration-card-slot=""
              data-card-id={view.card.cardId}
              style={{
                position: "relative",
                width:
                  layout === "desktop"
                    ? DESKTOP_CARD_WIDTH
                    : MOBILE_CARD_WIDTH,
                aspectRatio: CARD_ASPECT_RATIO,
              }}
            >
              {revealed && (
                <motion.div
                  data-exploration-card-frame-state={frameBreakPhase}
                  animate={
                    frameBreakActive
                      ? {
                          scale: [1, 1.04, 0.98],
                          rotateZ: [0, -1.2, 1.4, 0],
                          opacity: [1, 1, 0],
                        }
                      : { scale: 1, rotateZ: 0, opacity: 1 }
                  }
                  transition={{
                    duration: reduceMotion ? 0 : FRAME_FRACTURE_SECONDS,
                    ease: DREAM_EASE,
                  }}
                  style={{ width: "100%", height: "100%" }}
                >
                  <GameCard
                    model={view.card}
                    testId="cumulus-exploration-revealed-card"
                  />
                </motion.div>
              )}
            </div>
            <div
              data-exploration-channel-state={
                !revealed
                  ? "waiting"
                  : frameBreakGeometry === null
                    ? "revealed"
                    : "channeling"
              }
              style={{
                minHeight: token("--touch-min"),
                display: "grid",
                placeItems: "center",
              }}
            >
              {revealed && frameBreakGeometry === null && (
                <motion.div
                  initial={{ opacity: reduceMotion ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: reduceMotion
                      ? 0
                      : motionTimeSeconds("--dur-base"),
                  }}
                >
                  <GlassButton
                    label="Delve"
                    variant="accent"
                    placement="onMedia"
                    onPress={startFrameBreak}
                    testId="cumulus-exploration-channel"
                  />
                </motion.div>
              )}
            </div>
          </div>
        </section>
      )}
    >
      {!reduceMotion &&
        !revealed &&
        returnTrajectory === null &&
        trajectory !== null && (
        <motion.div
          data-exploration-card-travel=""
          data-card-id={view.card.cardId}
          data-exploration-source={trajectory.sourceKind}
          initial={{
            x: trajectory.source.left,
            y: trajectory.source.top,
            width: trajectory.source.width,
            height: trajectory.source.height,
          }}
          animate={{
            x: trajectory.target.left,
            y: trajectory.target.top,
            width: trajectory.target.width,
            height: trajectory.target.height,
          }}
          transition={{
            duration: TRAVEL_SECONDS,
            ease: DREAM_EASE,
          }}
          onAnimationComplete={() => setRevealed(true)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: token("--layer-reveal"),
            pointerEvents: "none",
            perspective: 1200,
          }}
        >
          <motion.div
            data-exploration-card-flip=""
            initial={{ rotateY: 0 }}
            animate={{ rotateY: 180 }}
            transition={{
              delay: FLIP_DELAY_SECONDS,
              duration: FLIP_SECONDS,
              ease: DREAM_EASE,
            }}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
              }}
            >
              <CardBack label="Exploration card, face down" />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <GameCard model={view.card} />
            </div>
          </motion.div>
        </motion.div>
      )}
      {!reduceMotion && returnTrajectory !== null && (
        <motion.div
          data-exploration-card-return=""
          data-card-id={view.card.cardId}
          data-exploration-destination={returnTrajectory.sourceKind}
          initial={{
            x: returnTrajectory.target.left,
            y: returnTrajectory.target.top,
            width: returnTrajectory.target.width,
            height: returnTrajectory.target.height,
          }}
          animate={{
            x: returnTrajectory.source.left,
            y: returnTrajectory.source.top,
            width: returnTrajectory.source.width,
            height: returnTrajectory.source.height,
          }}
          transition={{
            duration: TRAVEL_SECONDS,
            ease: DREAM_EASE,
          }}
          onAnimationComplete={completeExit}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: token("--layer-reveal"),
            pointerEvents: "none",
            perspective: 1200,
          }}
        >
          <motion.div
            data-exploration-card-return-flip=""
            initial={{ rotateY: 180 }}
            animate={{ rotateY: 360 }}
            transition={{
              delay: FLIP_DELAY_SECONDS,
              duration: FLIP_SECONDS,
              ease: DREAM_EASE,
            }}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
              }}
            >
              <CardBack label="Exploration card returning face down" />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <GameCard model={view.card} />
            </div>
          </motion.div>
        </motion.div>
      )}
      <img
        src={fullArtUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="eager"
        style={{ display: "none" }}
      />
      {frameBreakGeometry !== null && frameBreakPhase === "fracturing" && (
        <motion.div
          data-exploration-frame-fracture=""
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0.96, 1.04, 1.18],
          }}
          transition={{
            duration: FRAME_FRACTURE_SECONDS,
            ease: DREAM_EASE,
          }}
          style={{
            position: "fixed",
            top: frameBreakGeometry.frame.top,
            left: frameBreakGeometry.frame.left,
            width: frameBreakGeometry.frame.width,
            height: frameBreakGeometry.frame.height,
            zIndex: FRAME_BREAK_LAYER - 1,
            borderRadius: CARD_CORNER_RADIUS,
            boxShadow: token("--glow-accent-soft"),
            pointerEvents: "none",
          }}
        />
      )}
      {frameBreakGeometry !== null && (
        <motion.div
          data-exploration-frame-break=""
          data-exploration-frame-break-phase={frameBreakPhase}
          data-exploration-full-art-image-number={
            view.fullArt.kind === "exploration-card"
              ? view.fullArt.imageNumber
              : undefined
          }
          initial={{
            x: frameBreakGeometry.frame.left,
            y: frameBreakGeometry.frame.top,
            width: frameBreakGeometry.frame.width,
            height: frameBreakGeometry.frame.height,
            opacity: reduceMotion ? 1 : 0,
            borderRadius: CARD_CORNER_RADIUS,
          }}
          animate={
            frameBreakActive
              ? {
                  x: frameBreakGeometry.viewport.left,
                  y: frameBreakGeometry.viewport.top,
                  width: frameBreakGeometry.viewport.width,
                  height: frameBreakGeometry.viewport.height,
                  opacity: 1,
                  borderRadius: 0,
                }
              : {
                  x: frameBreakGeometry.frame.left,
                  y: frameBreakGeometry.frame.top,
                  width: frameBreakGeometry.frame.width,
                  height: frameBreakGeometry.frame.height,
                  opacity: 1,
                  borderRadius: CARD_CORNER_RADIUS,
                }
          }
          transition={{
            delay:
              !reduceMotion && frameBreakActive ? FRAME_BREAK_DELAY_SECONDS : 0,
            duration: reduceMotion ? 0 : FRAME_BREAK_SECONDS,
            ease: DREAM_EASE,
          }}
          onAnimationComplete={finishFrameBreakMotion}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: FRAME_BREAK_LAYER,
            overflow: "hidden",
            background: token("--bg-app"),
          }}
        >
          <Pressable
            aria-label="Return to Exploration"
            pressFeedback="stationary"
            hoverFeedback="stationary"
            onClick={
              frameBreakPhase === "open" &&
              view.resolvedActionId === null &&
              view.reward === null
                ? collapseFrameBreak
                : undefined
            }
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              padding: 0,
              border: 0,
              overflow: "hidden",
              background: "transparent",
            }}
          >
            <motion.img
              data-exploration-full-art=""
              src={fullArtUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              initial={{
                x: frameBreakGeometry.art.left,
                y: frameBreakGeometry.art.top,
                width: frameBreakGeometry.art.width,
                height: frameBreakGeometry.art.height,
              }}
              animate={
                frameBreakActive
                  ? {
                      x: 0,
                      y: 0,
                      width: frameBreakGeometry.viewport.width,
                      height: frameBreakGeometry.viewport.height,
                    }
                  : {
                      x: frameBreakGeometry.art.left,
                      y: frameBreakGeometry.art.top,
                      width: frameBreakGeometry.art.width,
                      height: frameBreakGeometry.art.height,
                    }
              }
              transition={{
                delay:
                  !reduceMotion && frameBreakActive
                    ? FRAME_BREAK_DELAY_SECONDS
                    : 0,
                duration: reduceMotion ? 0 : FRAME_BREAK_SECONDS,
                ease: DREAM_EASE,
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                maxWidth: "none",
                maxHeight: "none",
                objectFit: "cover",
                objectPosition: "center",
                userSelect: "none",
              }}
            />
          </Pressable>
        </motion.div>
      )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        transfigurationReward !== null &&
        transfigurationReturn === null && (
          <motion.section
            data-exploration-transfiguration-reward=""
            data-exploration-deck-entry-id={transfigurationReward.entryId}
            data-exploration-transfiguration-phase={
              transfigurationRevealed ? "transfigured" : "original"
            }
            role="status"
            aria-label={`Transfiguring ${transfigurationReward.before.displaySnapshot.name} into its ${transfigurationReward.after.transfiguration.type} form`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-9"),
              right: token("--space-6"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-6"),
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
              perspective: 1200,
            }}
          >
            <motion.div
              ref={transfigurationCardRef}
              data-exploration-transfiguration-card=""
              initial={false}
              animate={{ rotateY: transfigurationRevealed ? 180 : 0 }}
              transition={{
                duration: TRANSFIGURATION_FLIP_SECONDS,
                ease: DREAM_EASE,
              }}
              style={{
                position: "relative",
                width: isDesktop
                  ? DESKTOP_TRANSFIGURATION_CARD_WIDTH
                  : MOBILE_TRANSFIGURATION_CARD_WIDTH,
                aspectRatio: CARD_ASPECT_RATIO,
                transformStyle: "preserve-3d",
              }}
            >
              <div
                data-exploration-transfiguration-face="original"
                style={{
                  position: "absolute",
                  inset: 0,
                  backfaceVisibility: "hidden",
                }}
              >
                <GameCard model={transfigurationReward.before} />
              </div>
              <div
                data-exploration-transfiguration-face="transfigured"
                style={{
                  position: "absolute",
                  inset: 0,
                  transform: "rotateY(180deg)",
                  backfaceVisibility: "hidden",
                }}
              >
                <GameCard
                  model={transfigurationReward.after}
                  selected
                  selectionColor={transfigurationReward.after.transfiguration.color}
                  testId="cumulus-exploration-transfigured-card"
                />
              </div>
            </motion.div>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        transfigurationReward !== null &&
        transfigurationReturn !== null && (
        <motion.div
          data-exploration-transfiguration-return=""
          data-exploration-deck-entry-id={transfigurationReward.entryId}
          data-exploration-destination={
            transfigurationReturn.destinationKind
          }
          initial={{
            x: transfigurationReturn.source.left,
            y: transfigurationReturn.source.top,
            scale: 1,
            opacity: 1,
          }}
          animate={{
            x: transfigurationReturn.target.left,
            y: transfigurationReturn.target.top,
            scale: Math.min(
              transfigurationReturn.target.width /
                transfigurationReturn.source.width,
              transfigurationReturn.target.height /
                transfigurationReturn.source.height,
            ),
            opacity: 1,
          }}
          transition={{
            duration: REWARD_TRAVEL_SECONDS,
            ease: DREAM_EASE,
          }}
          onAnimationComplete={completeExit}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: FRAME_BREAK_EXIT_LAYER + 2,
            width: transfigurationReturn.source.width,
            height: transfigurationReturn.source.height,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          <GameCard
            model={transfigurationReward.after}
            selected
            selectionColor={transfigurationReward.after.transfiguration.color}
          />
        </motion.div>
      )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        cardCopiesReward !== null && (
          <motion.section
            data-exploration-outcome="card-copies"
            data-exploration-source-entry-id={cardCopiesReward.sourceEntryId}
            data-exploration-copy-count={cardCopiesReward.count}
            role="status"
            aria-label={`Gained ${String(cardCopiesReward.count)} ${cardCopiesReward.count === 1 ? "copy" : "copies"}`}
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              inset: `${safeAreaInsetAtLeast("top", "--space-7")} ${token("--space-5")} ${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE}`,
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "grid",
              placeContent: "center",
              justifyItems: "center",
              gap: token("--space-7"),
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: token("--space-5"),
              }}
            >
              {cardCopiesReward.cards.map((card, index) => (
                <motion.div
                  key={card.entryId}
                  data-exploration-copied-entry-id={card.entryId}
                  data-card-id={card.model.cardId}
                  initial={{ y: reduceMotion ? 0 : token("--space-7"), opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
                    duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
                    ease: DREAM_EASE,
                  }}
                  style={{
                    width: isDesktop
                      ? DESKTOP_REWARD_CARD_WIDTH
                      : "min(40vw, 180px)",
                    aspectRatio: CARD_ASPECT_RATIO,
                  }}
                >
                  <GameCard
                    model={card.model}
                    selected
                    selectionColor="positive"
                    testId={`cumulus-exploration-card-copy-${card.entryId}`}
                  />
                </motion.div>
              ))}
            </div>
            <RadialAnnouncement
              headline={`+${String(cardCopiesReward.count)} ${cardCopiesReward.count === 1 ? "Copy" : "Copies"}`}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-card-copies:${view.resolvedActionId ?? "resolved"}`}
            />
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        battleModifierReward !== null && (
          <section
            data-exploration-outcome="battle-modifier"
            data-exploration-battle-modifier={battleModifierReward.modifier}
            data-exploration-battle-modifier-amount={battleModifierReward.amount}
            data-exploration-battles-remaining={battleModifierReward.battlesRemaining}
            role="status"
            aria-label={`${String(battleModifierReward.amount)} additional ${battleModifierReward.modifier === "opening-hand" ? "opening hand cards" : "starting energy"} in the next battle`}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={`+${String(battleModifierReward.amount)} ${battleModifierReward.modifier === "opening-hand" ? "Cards" : "●"}`}
              detail="Next Battle"
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-battle-modifier:${battleModifierReward.modifier}:${view.resolvedActionId ?? "resolved"}`}
            />
          </section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        dreamAvatarReward !== null && (
          <motion.section
            data-exploration-outcome="dream-avatar"
            data-exploration-previous-dream-avatar-id={
              dreamAvatarReward.previous?.id ?? ""
            }
            data-exploration-dream-avatar-id={dreamAvatarReward.current.id}
            role="status"
            aria-label={`${dreamAvatarReward.current.name} is now your Dream Avatar`}
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              inset: `${safeAreaInsetAtLeast("top", "--space-7")} ${token("--space-5")} ${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE}`,
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "grid",
              placeContent: "center",
              justifyItems: "center",
              gap: token("--space-5"),
              color: token("--text-primary"),
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <DreamAvatarPortrait
              dreamAvatar={dreamAvatarReward.current}
              variant="hero"
              size={isDesktop ? 260 : 210}
            />
            <div style={{ display: "grid", gap: token("--space-1") }}>
              <strong style={{ font: token("--t-title") }}>
                {dreamAvatarReward.current.name}
              </strong>
              <span style={{ font: token("--t-body"), color: token("--text-secondary") }}>
                {dreamAvatarReward.current.title}
              </span>
            </div>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        objectReward !== null &&
        showObjectReward &&
        rewardTrajectories === null && (
          <motion.section
            data-exploration-reward-stage=""
            data-exploration-reward-count={
              rewardItems.length + purgedRewardCards.length
            }
            role="status"
            aria-label={rewardStageAnnouncement}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-9"),
              right: token("--space-6"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-6"),
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "flex",
              flexWrap: "wrap",
              alignContent: "center",
              alignItems: "center",
              justifyContent: "center",
              gap: token("--space-6"),
              pointerEvents: "none",
            }}
          >
            {purgedRewardCards.map((card, index) => {
              const cardWidth = isDesktop
                ? DESKTOP_REWARD_CARD_WIDTH
                : purgedRewardCards.length + rewardItems.length === 1
                  ? "min(58vw, 240px)"
                  : "min(40vw, 180px)";
              return (
                <motion.div
                  key={`purged:${card.entryId}`}
                  data-exploration-purge-card=""
                  data-exploration-deck-entry-id={card.entryId}
                  data-card-id={card.model.cardId}
                  initial={{
                    opacity: reduceMotion ? 1 : 0,
                    scale: reduceMotion ? 1 : 0.88,
                    y: reduceMotion ? 0 : token("--space-6"),
                    rotate: 0,
                  }}
                  animate={
                    reduceMotion
                      ? { opacity: 1, scale: 1, y: 0, rotate: 0 }
                      : {
                          opacity: [0, 1, 1, 0],
                          scale: [0.88, 1, 1, 0.5],
                          y: [token("--space-6"), 0, 0, token("--space-8")],
                          rotate: [0, 0, 0, -8],
                        }
                  }
                  transition={{
                    duration: reduceMotion ? 0 : REWARD_READING_SECONDS,
                    times: reduceMotion ? undefined : [0, 0.18, 0.68, 1],
                    ease: DREAM_EASE,
                  }}
                  style={{
                    position: "relative",
                    width: cardWidth,
                    aspectRatio: CARD_ASPECT_RATIO,
                    flex: "none",
                    pointerEvents: "none",
                  }}
                >
                  <GameCard
                    model={card.model}
                    selected
                    selectionColor="danger"
                    testId={`cumulus-exploration-purged-card-${String(index)}`}
                  />
                  <motion.span
                    data-exploration-purge-icon=""
                    aria-hidden="true"
                    initial={{ opacity: reduceMotion ? 1 : 0, scale: 0.72 }}
                    animate={{ opacity: 1, scale: reduceMotion ? 1 : [0.72, 1, 1.2] }}
                    transition={{
                      duration: reduceMotion ? 0 : REWARD_READING_SECONDS,
                      times: reduceMotion ? undefined : [0, 0.25, 1],
                      ease: DREAM_EASE,
                    }}
                    style={{
                      position: "absolute",
                      right: token("--space-3"),
                      bottom: token("--space-3"),
                      width: "clamp(34px, 22%, 52px)",
                      aspectRatio: "1 / 1",
                      borderRadius: token("--radius-control"),
                      display: "grid",
                      placeItems: "center",
                      background: token("--danger"),
                      boxShadow: token("--shadow-md"),
                    }}
                  >
                    <GlowIcon
                      iconClass={GLYPHS.trash}
                      color="text-on-accent"
                      size="58%"
                    />
                  </motion.span>
                </motion.div>
              );
            })}
            {rewardItems.map((item, index) => {
              const cardWidth = isDesktop
                ? DESKTOP_REWARD_CARD_WIDTH
                : purgedRewardCards.length + rewardItems.length === 1
                  ? "min(58vw, 240px)"
                  : "min(40vw, 180px)";
              const dreamsignSize = isDesktop
                ? DESKTOP_REWARD_DREAMSIGN_SIZE
                : MOBILE_REWARD_DREAMSIGN_SIZE;
              return (
                <motion.div
                  key={item.key}
                  ref={(element) => {
                    if (element === null) {
                      rewardItemRefs.current.delete(item.key);
                    } else {
                      rewardItemRefs.current.set(item.key, element);
                    }
                  }}
                  data-exploration-reward-object={item.kind}
                  data-exploration-reward-id={item.id}
                  initial={{
                    opacity: reduceMotion ? 1 : 0,
                    scale: reduceMotion ? 1 : 0.88,
                    y: reduceMotion ? 0 : token("--space-6"),
                  }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{
                    delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
                    duration: reduceMotion
                      ? 0
                      : motionTimeSeconds("--dur-slow"),
                    ease: DREAM_EASE,
                  }}
                  style={{
                    width: item.kind === "card" ? cardWidth : dreamsignSize,
                    aspectRatio:
                      item.kind === "card" ? CARD_ASPECT_RATIO : "1 / 1",
                    flex: "none",
                    display: "grid",
                    placeItems: "center",
                    pointerEvents: "auto",
                  }}
                >
                  {item.kind === "card" ? (
                    <GameCard
                      model={item.card}
                      testId={`cumulus-exploration-reward-card-${String(index)}`}
                    />
                  ) : (
                    <Dreamsign
                      dreamsign={item.dreamsign}
                      sizePx={dreamsignSize}
                      variant="revelation"
                      testid={`cumulus-exploration-reward-dreamsign-${String(index)}`}
                    />
                  )}
                </motion.div>
              );
            })}
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        deckModification !== null &&
        showDeckModification && (
          <motion.section
            data-exploration-deck-modification-reward=""
            data-exploration-deck-modification-kind={deckModification.kind}
            data-exploration-deck-modification-count={deckModification.cards.length}
            role="status"
            aria-label={deckModification.announcement}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-6"),
              right: token("--space-4"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-4"),
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            {deckModification.cards.map((card, index) => {
              const cardWidth = isDesktop
                ? DESKTOP_DECK_MODIFICATION_CARD_WIDTH
                : MOBILE_DECK_MODIFICATION_CARD_WIDTH;
              const pose = deckModificationCardPose(
                index,
                deckModification.cards.length,
                isDesktop ? "desktop" : "mobile",
              );
              return (
                <motion.div
                  key={card.entryId}
                  data-exploration-deck-modification-card=""
                  data-exploration-deck-entry-id={card.entryId}
                  data-exploration-reclaim-cost={
                    deckModification.kind === "reclaim"
                      ? deckModification.reclaimCostByEntryId?.[card.entryId]
                      : undefined
                  }
                  data-card-id={card.model.cardId}
                  initial={{
                    x: 0,
                    y: 0,
                    rotate: 0,
                    scale: reduceMotion ? 1 : 0.72,
                    opacity: reduceMotion ? 1 : 0,
                  }}
                  animate={{
                    x: pose.x,
                    y: pose.y,
                    rotate: pose.rotate,
                    scale: reduceMotion ? 1 : [0.72, 1.07, 1],
                    opacity: 1,
                  }}
                  transition={{
                    delay: reduceMotion
                      ? 0
                      : (index * REWARD_STAGGER_SECONDS) / 3,
                    duration: reduceMotion
                      ? 0
                      : motionTimeSeconds("--dur-slow"),
                    ease: DREAM_EASE,
                  }}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: cardWidth,
                    aspectRatio: CARD_ASPECT_RATIO,
                    marginLeft: -cardWidth / 2,
                    marginTop: -(cardWidth / CARD_ASPECT_RATIO_VALUE) / 2,
                  }}
                >
                  <GameCard
                    model={card.model}
                    selected
                    selectionColor={deckModification.selectionColor}
                    hideRulesText
                    testId={`cumulus-exploration-deck-modification-card-${card.entryId}`}
                  />
                </motion.div>
              );
            })}
            <RadialAnnouncement
              headline={deckModification.headline}
              headlineGlyph={
                deckModification.kind === "fast" ? GLYPHS.bolt : undefined
              }
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-deck-modification:${deckModification.kind}:${view.resolvedActionId ?? "resolved"}`}
            />
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        dreamsignPurgeReward !== null &&
        dreamsignPurgeRewardPhase === "purging" && (
          <section
            data-exploration-purged-dreamsign-stage=""
            role="status"
            aria-label={`Purging ${dreamsignPurgeReward.dreamsign.name}`}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <motion.div
              data-exploration-purged-dreamsign=""
              data-dreamsign-id={dreamsignPurgeReward.dreamsign.id}
              initial={{ opacity: 1, scale: 1, rotate: 0 }}
              animate={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: [1, 1, 0],
                      scale: [1, 1.04, 0.24],
                      rotate: [0, -2, 8],
                    }
              }
              transition={{
                duration: reduceMotion ? 0 : DREAMSIGN_PURGE_SECONDS,
                times: [0, 0.5, 1],
                ease: DREAM_EASE,
              }}
              onAnimationComplete={() =>
                setDreamsignPurgeRewardPhase("announcement")
              }
            >
              <Dreamsign
                dreamsign={dreamsignPurgeReward.dreamsign}
                sizePx={
                  isDesktop
                    ? DESKTOP_REWARD_DREAMSIGN_SIZE
                    : MOBILE_REWARD_DREAMSIGN_SIZE
                }
                variant="revelation"
                testid="cumulus-exploration-purged-dreamsign"
              />
            </motion.div>
          </section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        dreamsignPurgeReward !== null &&
        dreamsignPurgeRewardPhase === "announcement" && (
          <div
            data-exploration-purged-dreamsign-announcement=""
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              announcementId={`exploration:${view.siteId}:${view.resolvedActionId ?? "purged-dreamsign-essence"}`}
              headline="Essence Gained"
              essenceGained={dreamsignPurgeReward.totalEssence}
              tone="reward"
              size={isDesktop ? "standard" : "compact"}
              duration="extended"
            />
          </div>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        essenceReward !== null &&
        essenceRewardPhase === "cards" && (
          <motion.section
            data-exploration-essence-cards=""
            data-exploration-essence-card-count={
              essenceReward.cards.length
            }
            role="status"
            aria-label={`${String(essenceReward.cards.length)} Spirit Animal cards grant ${String(essenceReward.totalEssence)} Essence total, ${String(essenceReward.essencePerCard)} each`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-9"),
              right: token("--space-6"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-6"),
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "flex",
              flexWrap: "wrap",
              alignContent: "center",
              alignItems: "center",
              justifyContent: "center",
              gap: isDesktop ? token("--space-4") : token("--space-3"),
              pointerEvents: "none",
            }}
          >
            {essenceReward.cards.map((card, index) => (
              <motion.div
                key={card.entryId}
                data-exploration-essence-card=""
                data-exploration-entry-id={card.entryId}
                data-card-id={card.model.cardId}
                initial={{
                  opacity: reduceMotion ? 1 : 0,
                  scale: reduceMotion ? 1 : 0.88,
                  y: reduceMotion ? 0 : token("--space-6"),
                }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
                  duration: reduceMotion
                    ? 0
                    : motionTimeSeconds("--dur-slow"),
                  ease: DREAM_EASE,
                }}
                style={{
                  position: "relative",
                  width: isDesktop
                    ? DESKTOP_ESSENCE_CARD_WIDTH
                    : MOBILE_ESSENCE_CARD_WIDTH,
                  aspectRatio: CARD_ASPECT_RATIO,
                  flex: "none",
                  pointerEvents: "auto",
                }}
              >
                <GameCard
                  model={card.model}
                  testId={`cumulus-exploration-essence-card-${String(index)}`}
                />
                <motion.div
                  data-exploration-essence-per-card=""
                  initial={{ opacity: 0, scale: 0.72 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: reduceMotion
                      ? 0
                      : index * REWARD_STAGGER_SECONDS +
                        motionTimeSeconds("--dur-base"),
                    duration: reduceMotion
                      ? 0
                      : motionTimeSeconds("--dur-base"),
                    ease: DREAM_EASE,
                  }}
                  style={{
                    position: "absolute",
                    right: `calc(-1 * ${token("--space-2")})`,
                    bottom: `calc(-1 * ${token("--space-2")})`,
                    zIndex: ESSENCE_CHIP_LAYER,
                    boxShadow: token("--shadow-md"),
                    borderRadius: token("--radius-pill"),
                  }}
                >
                  <ResourceChip
                    kind="essence"
                    value={`+${String(essenceReward.essencePerCard)}`}
                    size="lg"
                    chip
                  />
                </motion.div>
              </motion.div>
            ))}
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        essenceReward !== null &&
        essenceRewardPhase === "announcement" && (
          <div
            data-exploration-essence-announcement=""
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              announcementId={`exploration:${view.siteId}:${view.resolvedActionId ?? "essence"}`}
              headline="Essence Gained"
              detail={`${String(essenceReward.essencePerCard)} × ${String(essenceReward.cards.length)} Spirit Animals`}
              essenceGained={essenceReward.totalEssence}
              tone="reward"
              size={isDesktop ? "standard" : "compact"}
              duration="extended"
            />
          </div>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        rewardTrajectories !== null &&
        rewardItems.map((item, index) => {
          const trajectoryForReward = rewardTrajectories.get(item.key);
          if (trajectoryForReward === undefined) return null;
          const scale = Math.min(
            trajectoryForReward.target.width / trajectoryForReward.source.width,
            trajectoryForReward.target.height / trajectoryForReward.source.height,
          );
          return (
            <motion.div
              key={item.key}
              data-exploration-reward-flight={item.kind}
              data-exploration-reward-id={item.id}
              data-exploration-destination={trajectoryForReward.destinationKind}
              initial={{
                x: trajectoryForReward.source.left,
                y: trajectoryForReward.source.top,
                scale: 1,
                opacity: 1,
              }}
              animate={{
                x: trajectoryForReward.target.left,
                y: trajectoryForReward.target.top,
                scale,
                opacity: 1,
              }}
              transition={{
                delay: index * REWARD_STAGGER_SECONDS,
                duration: REWARD_TRAVEL_SECONDS,
                ease: DREAM_EASE,
              }}
              onAnimationComplete={() => finishRewardItem(item.key)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: FRAME_BREAK_EXIT_LAYER + 2,
                width: trajectoryForReward.source.width,
                height: trajectoryForReward.source.height,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              {item.kind === "card" ? (
                <GameCard model={item.card} />
              ) : (
                <Dreamsign
                  dreamsign={item.dreamsign}
                  sizePx={trajectoryForReward.source.width}
                  variant="revelation"
                />
              )}
            </motion.div>
          );
        })}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        view.resolvedActionId === null &&
        view.reward === null && (
        <motion.section
          data-exploration-narrative=""
          data-cumulus-reveal-anchor=""
          data-tutorial-guidance-concept="exploration-actions"
          data-tutorial-guidance-anchor=""
          data-tutorial-guidance-obstacle=""
          initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
            ease: DREAM_EASE,
          }}
          style={{
            position: "fixed",
            left: `max(var(--safe-area-inset-left), ${token("--space-5")})`,
            bottom: isDesktop
              ? DESKTOP_FLOATING_PANEL_BOTTOM
              : JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
            zIndex: FRAME_BREAK_EXIT_LAYER,
            width: isDesktop
              ? "min(400px, calc(100vw - 48px))"
              : `calc(100vw - ${token("--space-5")} - ${token("--space-5")})`,
            maxHeight: "calc(100vh - 96px)",
            pointerEvents: "auto",
          }}
        >
          <GlassPanel
            testId="cumulus-exploration-narrative-panel"
          >
            <div
              style={{
                display: "grid",
                gap: token("--space-5"),
                padding: token("--space-6"),
                paddingTop: token("--space-5"),
              }}
            >
              <ExplorationNarrativeChoices
                narrative={view.narrative}
                actions={view.actions}
                reduceMotion={reduceMotion}
                onActivate={openAction}
              />
            </div>
          </GlassPanel>
        </motion.section>
      )}
      {frameBreakGeometry !== null && frameBreakPhase === "open" && activeAction !== null && (
        <motion.section
          data-exploration-followup={activeAction.followup.kind}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 14, scale: reduceMotion ? 1 : 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"), ease: DREAM_EASE }}
          style={{
            position: "fixed",
            zIndex: FRAME_BREAK_EXIT_LAYER + 1,
            top: isDesktop
              ? safeAreaInsetAtLeast("top", "--space-8")
              : `calc(max(var(--safe-area-inset-top), ${token("--space-4")}) + ${String(MENU_BUTTON_PX)}px + ${token("--space-3")})`,
            right: isDesktop
              ? centeredFollowupWidth !== null
                ? 0
                : `calc(max(var(--safe-area-inset-right), ${token("--space-8")}) + ${String(MENU_BUTTON_PX)}px + ${token("--space-3")})`
              : `max(var(--safe-area-inset-right), ${token("--space-4")})`,
            bottom: isDesktop
              ? DESKTOP_FLOATING_PANEL_BOTTOM
              : JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
            left: isDesktop
              ? centeredFollowupWidth !== null
                ? 0
                : "auto"
              : `max(var(--safe-area-inset-left), ${token("--space-4")})`,
            width:
              isDesktop && centeredFollowupWidth !== null
                ? centeredFollowupWidth
                : isDesktop
                  ? "min(920px, calc(100vw - 64px))"
                  : undefined,
            marginInline:
              isDesktop && centeredFollowupWidth !== null ? "auto" : undefined,
            minHeight: 0,
            display: "grid",
            alignItems: "center",
            pointerEvents: "auto",
          }}
        >
          {activeAction.followup.kind === "transfiguration" &&
            (() => {
              const candidate =
                activeAction.followup.candidates.find(
                  (choice) =>
                    choice.entryId === selectedTransfigurationEntryId,
                ) ?? null;
              return candidate === null ? (
                <TransfigurationPickerPanel
                  layout={isDesktop ? "desktop" : "mobile"}
                  ready
                  isEnhanced
                  candidates={activeAction.followup.candidates}
                  onClose={() => setActiveActionId(null)}
                  onPick={(entryId) => {
                    setSelectedTransfigurationEntryId(entryId);
                    setSelectedTransfigurationFormType(null);
                  }}
                />
              ) : (
                <TransfigurationDetailPanel
                  layout={isDesktop ? "desktop" : "mobile"}
                  candidate={candidate}
                  selectedFormType={selectedTransfigurationFormType}
                  confirming={transfigurationConfirming}
                  alreadyAccepted={false}
                  onBack={() => {
                    setSelectedTransfigurationEntryId(null);
                    setSelectedTransfigurationFormType(null);
                  }}
                  onSelectForm={(type) =>
                    setSelectedTransfigurationFormType((current) =>
                      current === type ? null : type,
                    )
                  }
                  onConfirm={(form) => {
                    setTransfigurationConfirming(true);
                    onResolve(activeAction.id, {
                      entryIds: [candidate.entryId],
                      transfiguration: form.type,
                    });
                  }}
                />
              );
            })()}
          {activeAction.followup.kind === "cards" &&
            activeAction.followup.selectionKey === "cardIds" && (
            <article
              data-exploration-card-offer=""
              style={{
                width: "100%",
                maxHeight: isDesktop ? "min(660px, 100%)" : "100%",
                minHeight: 0,
              }}
            >
              <GlassPanel
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
                headerSpacing="medium"
                footer={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      padding: isDesktop
                        ? `0 ${token("--space-8")} ${token("--space-6")}`
                        : `0 ${token("--space-4")} ${token("--space-4")}`,
                    }}
                  >
                    <GlassButton
                      label="Confirm Choice"
                      variant="accent"
                      placement="onGlass"
                      disabled={!canCommitFollowup}
                      onPress={commitFollowup}
                      testId="cumulus-exploration-followup-confirm"
                    />
                  </div>
                }
              >
                <div
                  style={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    minHeight: 0,
                    overflow: "hidden",
                    containerType: "size",
                    display: "grid",
                    placeItems: "center",
                    padding: isDesktop
                      ? token("--space-7")
                      : token("--space-4"),
                    boxSizing: "border-box",
                  }}
                >
                  <CardChoiceGrid
                    cards={activeAction.followup.cards.map((card) => ({
                      entryId: card.entryId,
                      model: card.model,
                      selected: selectedIds.includes(card.entryId),
                      selectionColor: "accent-bright",
                      testId: `cumulus-exploration-card-${card.entryId}`,
                    }))}
                    columns={cardChoiceColumns(
                      activeAction.followup.cards.length,
                      isDesktop ? "desktop" : "mobile",
                    )}
                    layout={{
                      kind: "site",
                      viewport: isDesktop ? "desktop" : "mobile",
                      fit: "choice",
                    }}
                    onCardPress={toggleCard}
                  />
                </div>
              </GlassPanel>
            </article>
          )}
          {activeAction.followup.kind === "cards" &&
            activeAction.followup.selectionKey === "entryIds" && (
            <CardGalleryPanel
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              footerAction={{
                label:
                  activeAction.followup.mode === "purge-and-copy" && purgeEntryId === null
                    ? "Choose a card to purge"
                    : activeAction.followup.mode === "purge-and-copy" && selectedIds.length === 0
                      ? "Choose a card to copy"
                      : "Confirm Choice",
                onPress: commitFollowup,
                disabled: !canCommitFollowup,
                variant: "accent",
                testId: "cumulus-exploration-followup-confirm",
              }}
              cards={activeAction.followup.cards.map((card) => ({
                entryId: card.entryId,
                model: card.model,
                selected:
                  card.entryId === purgeEntryId || selectedIds.includes(card.entryId),
                selectionColor: card.entryId === purgeEntryId ? "danger" : "selected",
                emphasis: card.isBane ? "danger" : undefined,
                operation:
                  card.entryId === purgeEntryId
                    ? "purge"
                    : selectedIds.includes(card.entryId)
                      ? "copy"
                      : undefined,
                testId: `cumulus-exploration-card-${card.entryId}`,
              }))}
              emptyLabel="No eligible cards are available."
              columns={isDesktop ? "four" : "three"}
              cardSize="standard"
              frame="floating"
              widthMode="fill"
              heightMode="fill"
              spacing={isDesktop ? "regular" : "compact"}
              testId="cumulus-exploration-card-followup"
              onCardPress={toggleCard}
            />
          )}
          {activeAction.followup.kind === "packs" && (
            <article
              data-exploration-pack-offer=""
              style={{ width: "100%", minHeight: 0, maxHeight: "100%" }}
            >
              <GlassPanel
                eyebrow="Exploration"
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
                headerSpacing="medium"
              >
                <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: token("--space-6"), padding: token("--space-6"), overflow: "auto" }}>
                  {activeAction.followup.packs.map((pack) => (
                    <section
                      key={pack.index}
                      data-testid={`cumulus-exploration-pack-${String(pack.index)}`}
                      style={{
                        display: "grid",
                        gap: 0,
                        padding: token("--space-5"),
                        borderRadius: token("--radius-panel"),
                        border: `2px solid ${token("--border-soft")}`,
                        background: token("--glass-on-glass-fill"),
                        color: token("--text-on-glass"),
                      }}
                    >
                      <strong
                        data-exploration-pack-title=""
                        style={{
                          font: token("--t-button"),
                          textAlign: "left",
                          margin: isDesktop
                            ? `${token("--space-7")} ${token("--space-8")} ${token("--space-8")}`
                            : `${token("--space-2")} 0 ${token("--space-4")}`,
                        }}
                      >
                        Pack {String(pack.index + 1)}
                      </strong>
                      <span data-exploration-pack-cards="" style={{ display: "grid", gridTemplateColumns: `repeat(${String(pack.cards.length)}, minmax(0, 1fr))`, gap: token("--space-3") }}>
                        {pack.cards.map((card) => <GameCard key={card.entryId} model={card.model} />)}
                      </span>
                      <div
                        data-exploration-pack-action=""
                        style={{
                          display: isDesktop ? "flex" : "grid",
                          justifyContent: isDesktop ? "center" : undefined,
                          margin: isDesktop
                            ? `${token("--space-8")} ${token("--space-8")} ${token("--space-7")}`
                            : `${token("--space-4")} 0 ${token("--space-2")}`,
                        }}
                      >
                        <GlassButton
                          label="Choose"
                          accessibilityLabel={`Choose Pack ${String(pack.index + 1)}`}
                          variant="accent"
                          placement="onGlass"
                          onPress={() => onResolve(activeAction.id, { packIndex: pack.index })}
                          testId={`cumulus-exploration-pack-${String(pack.index)}-choose`}
                        />
                      </div>
                    </section>
                  ))}
                </div>
              </GlassPanel>
            </article>
          )}
          {activeAction.followup.kind === "subtypes" && (
            <GlassPanel
              eyebrow="Exploration"
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              headingLevel="h1"
              footer={
                <div style={{ display: "flex", justifyContent: "flex-end", padding: token("--space-5") }}>
                  <GlassButton label="Confirm Choice" variant="accent" placement="onGlass" disabled={!canCommitFollowup} onPress={commitFollowup} testId="cumulus-exploration-followup-confirm" />
                </div>
              }
            >
              <div role="radiogroup" style={{ display: "grid", gap: token("--space-3"), padding: token("--space-5") }}>
                {activeAction.followup.options.map((option) => (
                  <Pressable
                    key={option}
                    as="button"
                    role="radio"
                    aria-checked={selectedSubtype === option}
                    onClick={() => setSelectedSubtype(option)}
                    style={{ minHeight: token("--touch-min"), padding: token("--space-4"), borderRadius: token("--radius-control"), border: `2px solid ${selectedSubtype === option ? token("--selected") : token("--border-soft")}`, background: token("--glass-on-glass-fill"), color: token("--text-on-glass"), textAlign: "left", font: token("--t-button") }}
                  >
                    {option}
                  </Pressable>
                ))}
              </div>
            </GlassPanel>
          )}
          {activeAction.followup.kind === "dreamsigns" && (
            <GlassPanel
              eyebrow="Exploration"
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              headingLevel="h1"
            >
              <div
                role="group"
                aria-label={activeAction.followup.subtitle}
                data-exploration-dreamsign-choices=""
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fit, minmax(${String(isDesktop ? DESKTOP_DREAMSIGN_CHOICE_SIZE : MOBILE_DREAMSIGN_CHOICE_SIZE)}px, 1fr))`,
                  gap: isDesktop ? token("--space-9") : token("--space-5"),
                  placeItems: "center",
                  minHeight: 0,
                  maxHeight: "min(70dvh, 620px)",
                  overflow: "auto",
                  padding: isDesktop ? token("--space-8") : token("--space-5"),
                }}
              >
                {activeAction.followup.dreamsigns.map((dreamsign) => (
                  <Dreamsign
                    key={dreamsign.id}
                    dreamsign={dreamsign}
                    sizePx={
                      isDesktop
                        ? DESKTOP_DREAMSIGN_CHOICE_SIZE
                        : MOBILE_DREAMSIGN_CHOICE_SIZE
                    }
                    testid={`cumulus-exploration-dreamsign-${dreamsign.id}`}
                    onPress={() => chooseDreamsign(dreamsign.id)}
                  />
                ))}
              </div>
            </GlassPanel>
          )}
          {activeAction.followup.kind === "dreamAvatars" && (
            <GlassPanel
              eyebrow="Exploration"
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              headingLevel="h1"
            >
              <div
                data-exploration-dream-avatar-choices=""
                role="group"
                aria-label={activeAction.followup.subtitle}
                style={{
                  display: "grid",
                  gridTemplateColumns: isDesktop
                    ? "repeat(3, minmax(0, 1fr))"
                    : "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: isDesktop ? token("--space-7") : token("--space-5"),
                  placeItems: "center",
                  padding: isDesktop ? token("--space-8") : token("--space-5"),
                  overflow: "auto",
                }}
              >
                {activeAction.followup.dreamAvatars.map((dreamAvatar) => (
                  <div
                    key={dreamAvatar.id}
                    data-exploration-dream-avatar-choice={dreamAvatar.id}
                    style={{
                      display: "grid",
                      justifyItems: "center",
                      gap: token("--space-3"),
                      color: token("--text-on-glass"),
                      textAlign: "center",
                    }}
                  >
                    <DreamAvatarPortrait
                      dreamAvatar={dreamAvatar}
                      variant="panel"
                      size={isDesktop ? 196 : 150}
                      profile={{
                        id: dreamAvatar.id,
                        ability: dreamAvatar.renderedText,
                      }}
                      onActivate={() =>
                        onResolve(activeAction.id, {
                          dreamAvatarId: dreamAvatar.id,
                        })
                      }
                    />
                    <div style={{ display: "grid", gap: token("--space-1") }}>
                      <strong style={{ font: token("--t-button") }}>
                        {dreamAvatar.name}
                      </strong>
                      <span
                        style={{
                          font: token("--t-caption"),
                          color: token("--text-on-glass-muted"),
                        }}
                      >
                        {dreamAvatar.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          )}
        </motion.section>
      )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        view.resolvedActionId === null &&
        view.reward === null && (
        <motion.div
          data-exploration-exit-control=""
          data-tutorial-guidance-obstacle=""
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
            ease: DREAM_EASE,
          }}
          style={{
            position: "fixed",
            top: `max(var(--safe-area-inset-top), ${String(exitEdgeInset)}px)`,
            right: isDesktop
              ? `calc(max(var(--safe-area-inset-right), ${String(exitEdgeInset)}px) + ${String(MENU_BUTTON_PX)}px + ${token("--space-3")})`
              : `max(var(--safe-area-inset-right), ${String(exitEdgeInset)}px)`,
            zIndex: FRAME_BREAK_EXIT_LAYER,
          }}
        >
          <IconButton
            glyph={GLYPHS.close}
            label="Return to Exploration"
            onPress={collapseFrameBreak}
            testId="cumulus-exploration-exit"
          />
        </motion.div>
      )}
    </GuideGallerySiteLayout>
  );
}

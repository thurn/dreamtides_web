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
import {
  GameCard,
  gameCardRevealSpec,
  type GameCardModel,
} from "../components/card/CardView";
import {
  CardChoiceGrid,
  type CardChoiceOperation,
  type CardChoiceGridColumns,
} from "../components/card/CardChoiceGrid";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { RichTextView, richText } from "../components/card/rich-text";
import { renderRulesSymbolsInline } from "../components/card/RulesText";
import {
  CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
  CARD_CORNER_RADIUS,
} from "../components/card/card-aspect";
import { CardBack } from "../components/battle/CardBack";
import { GlassButton } from "../components/controls/GlassButton";
import { StandaloneGlyph } from "../components/controls/StandaloneGlyph";
import { IconButton } from "../components/controls/IconButton";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../components/hud/JourneyStatusBar";
import {
  Dreamsign,
  dreamsignRevealSpec,
} from "../components/hud/Dreamsign";
import { DreamAvatarPortrait } from "../components/hud/DreamAvatarPortrait";
import { EssenceValue } from "../components/hud/EssenceValue";
import { GlassPanel } from "../components/overlay/GlassPanel";
import {
  RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
  RadialAnnouncement,
} from "../components/status/RadialAnnouncement";
import { type ArtRef, resolveArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { motionTimeSeconds } from "../primitives/motion-time";
import { Pressable } from "../primitives/Pressable";
import { safeAreaInsetAtLeast } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import { formatMessageDescriptor, useMessages } from "../hooks/use-messages";
import type { FluentMessageDescriptor } from "../../data/localization-messages";
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
import { requireDreamsignId } from "../../data/dreamsigns";
import type { CardTransfigurationDisplay } from "../../runtime/transfiguration-display";
import type { FrozenCardData } from "../../types/cards";
import type {
  Dreamsign as DreamsignData,
  DreamAvatar,
  TransfigurationType,
} from "../../types/journey";
import { useRevealSource } from "../internal/reveal/context";
import { revealEntityId } from "../internal/reveal/identity";

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
      readonly semanticKind?: "card-acquisition" | "card-replacement" | "objects";
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
      /** Original deck entry the persisted copies were created from. */
      readonly source: ExplorationCardChoiceView;
      /** Newly created deck entries, in persisted insertion order. */
      readonly cards: readonly ExplorationCardChoiceView[];
      readonly count: number;
    }
  | {
      readonly kind: "card-copies-multiple";
      readonly pairs: readonly {
        readonly source: ExplorationCardChoiceView;
        readonly copy: ExplorationCardChoiceView;
      }[];
      readonly count: number;
    }
  | {
      readonly kind: "purge-and-copy";
      /** Exact pre-resolution deck entry removed before the copy appears. */
      readonly purgedCard: ExplorationCardChoiceView;
      /** Original surviving deck entry from which the copy emerges. */
      readonly sourceEntryId: string;
      readonly source: ExplorationCardChoiceView;
      /** Newly created deck entries, in persisted insertion order. */
      readonly cards: readonly ExplorationCardChoiceView[];
      readonly count: number;
    }
  | {
      readonly kind: "purged-card-essence";
      readonly card: ExplorationCardChoiceView;
      readonly spark: number;
      readonly essencePerSpark: number;
      readonly totalEssence: number;
    }
  | {
      readonly kind: "battle-modifier";
      readonly modifier: "opening-hand" | "starting-energy";
      readonly amount: number;
      readonly battlesRemaining: number;
    }
  | {
      readonly kind: "smaller-hand-and-cost-discount";
      readonly openingHandDelta: -1;
      readonly energyCostReduction: 1;
      readonly battlesRemaining: number;
    }
  | {
      readonly kind: "dream-avatar";
      readonly previous: DreamAvatar | null;
      readonly current: DreamAvatar;
    }
  | {
      readonly kind: "site-offer-modifier";
      readonly modifier: "transfigure-next-draft-or-shop";
      readonly sourceSiteId: string;
      readonly sourceActionId: string;
    };

export interface ExplorationDeckModificationView {
  /** Semantic modifier used for the announcement and QA contract. */
  readonly kind: "spark" | "fast" | "energy-cost" | "subtype" | "reclaim";
  /** Compact center copy for the radial announcement. */
  readonly headline: string;
  /** Complete authored effect copy exposed to assistive technology. */
  readonly announcement: string;
  /** Safe complete fallback when the resolved action cannot be reconstructed. */
  readonly announcementDescriptor?: FluentMessageDescriptor;
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

export type ExplorationCardSelectionOperation = CardChoiceOperation;

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
      /** Semantic badge shown on selected deck entries. */
      readonly selectionOperation?: ExplorationCardSelectionOperation;
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
  /** Code-authored disclosure rendered as a separate complete Fluent unit. */
  readonly effectDisclosure?: ExplorationEffectDisclosure;
  /** Complete fallback message inputs when a special deck-card target is absent. */
  readonly effectFallback?: ExplorationEffectFallback;
  readonly followup: ExplorationFollowupView;
  /** Reducer selection supplied directly when the effect needs no player choice. */
  readonly automaticSelection?: Readonly<Record<string, unknown>>;
  readonly available: boolean;
}

/** UUID-backed entity previewed by an Exploration choice as one complete object. */
export type ExplorationEntityView =
  | {
      readonly kind: "card";
      readonly card: FrozenCardData;
      readonly copies?: number;
      readonly transfiguration?: CardTransfigurationDisplay;
    }
  | {
      readonly kind: "dreamsign";
      readonly dreamsign: DreamsignData;
    };

export type ExplorationActionEffectPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "entity"; readonly entity: ExplorationEntityView };

export type ExplorationEffectDisclosure =
  | {
      readonly kind: "fixed-transfiguration";
      readonly transfiguration: TransfigurationType;
    }
  | { readonly kind: "offered-site"; readonly siteType: string };

export interface ExplorationEffectFallback {
  readonly kind: "missing-deck-card";
  readonly before: string;
  readonly after: string;
}

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
): ExplorationEntityView | null {
  for (const part of action.effectParts ?? []) {
    if (part.kind === "entity") return part.entity;
  }
  return null;
}

interface ExplorationEntityDetails {
  readonly id: string;
  readonly name: string;
  readonly copies: number;
}

function normalizedEntityCopies(copies: number | undefined): number {
  return copies !== undefined && Number.isInteger(copies) && copies > 1
    ? copies
    : 1;
}

function explorationEntityDetails(
  entity: ExplorationEntityView,
): ExplorationEntityDetails {
  return entity.kind === "card"
    ? {
        id: entity.card.id,
        name: entity.card.name,
        copies: normalizedEntityCopies(entity.copies),
      }
    : {
        id: requireDreamsignId(entity.dreamsign, "Exploration entity preview"),
        name: entity.dreamsign.name,
        copies: 1,
      };
}

function explorationEntityRevealRegistration(entity: ExplorationEntityView) {
  const details = explorationEntityDetails(entity);
  if (entity.kind === "card") {
    const spec = gameCardRevealSpec({
      cardId: entity.card.id,
      displaySnapshot: entity.card,
      ...(entity.transfiguration === undefined
        ? {}
        : { transfiguration: entity.transfiguration }),
    });
    return {
      details,
      identity: {
        entityType: details.copies === 1
          ? "game-card" as const
          : "game-card-copies" as const,
        entityId: entity.card.id,
      },
      spec: details.copies === 1
        ? spec
        : { ...spec, primary: { ...spec.primary, copies: details.copies } },
    };
  }
  return {
    details,
    identity: {
      entityType: "dreamsign" as const,
      entityId: revealEntityId("dreamsign", details.id),
    },
    spec: dreamsignRevealSpec(
      entity.dreamsign,
      Boolean(entity.dreamsign.imageName),
    ),
  };
}

function useExplorationEntityReveal(
  entity: ExplorationEntityView,
  onActivate: (() => void) | undefined,
) {
  const registration = explorationEntityRevealRegistration(entity);
  const binding = useRevealSource({
    identity: registration.identity,
    spec: registration.spec,
    onActivate,
  });
  return { details: registration.details, binding };
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
    gap: token("--space-s"),
    padding: token("--space-s"),
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
  const t = useMessages();
  const effectDescription = action.effectFallback === undefined
    ? action.effectParts === undefined
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
        )
    : renderRulesSymbolsInline(
        formatMessageDescriptor(t, {
          id: "exploration-effect-missing-deck-card",
          variables: {
            before: action.effectFallback.before,
            after: action.effectFallback.after,
          },
        }),
      );
  const disclosure = action.effectDisclosure === undefined
    ? null
    : action.effectDisclosure.kind === "fixed-transfiguration"
      ? formatMessageDescriptor(t, {
          id: "exploration-fixed-transfiguration-disclosure",
          variables: { transfiguration: action.effectDisclosure.transfiguration },
        })
      : formatMessageDescriptor(t, {
          id: "exploration-offered-site-disclosure",
          variables: { siteType: action.effectDisclosure.siteType },
        });
  return (
    <>
      <span style={{ minWidth: 0, display: "grid", gap: token("--space-xxs") }}>
        <strong style={{ font: token("--t-button") }}>
          {renderRulesSymbolsInline(action.label)}
        </strong>
        <span
          id={`exploration-effect-${String(index)}`}
          style={{ font: token("--t-caption"), color: token("--text-muted") }}
        >
          {effectDescription}
          {disclosure === null ? null : <span> {disclosure}</span>}
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
  readonly entity: ExplorationEntityView;
  readonly "data-testid": string;
}) {
  const details = explorationEntityDetails(entity);
  return (
    <span
      data-exploration-entity-label={entity.kind}
      data-entity-id={details.id}
      data-entity-copies={details.copies}
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
}: ExplorationChoiceProps & { readonly entity: ExplorationEntityView }) {
  const { details, binding } = useExplorationEntityReveal(
    entity,
    action.available ? onActivate : undefined,
  );
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
      data-exploration-entity-preview={entity.kind}
      data-entity-id={details.id}
      data-entity-copies={details.copies}
      data-reveal-source-retain="true"
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

interface FullArtDimensions {
  readonly width: number;
  readonly height: number;
}

type FrameBreakPhase =
  | "idle"
  | "fracturing"
  | "open"
  | "collapsing"
  | "returning";
type CollapseIntent = "preview" | "exit";
type CardCopiesPhase = "original" | "copies" | "travel";
type PurgeAndCopyPhase = "purging" | "copying";
type CardCopiesReward = Extract<
  ExplorationRewardView,
  { readonly kind: "card-copies" | "card-copies-multiple" }
>;

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
const CARD_COPY_ORIGINAL_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const CARD_COPY_EMERGE_SECONDS = motionTimeSeconds("--dur-slow");
const CARD_COPY_READING_SECONDS = motionTimeSeconds("--dur-slow") * 2;
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
const MOBILE_CARD_COPY_WIDTH = "min(40vw, 180px)";
// Copy cards fan far enough to expose their faces while remaining a single
// physical group that can collapse into the deck target together.
const DESKTOP_CARD_COPY_FAN_STEP = 156;
const MOBILE_CARD_COPY_FAN_STEP = 94;
const CARD_COPY_FAN_RISE = 12;
const CARD_COPY_FAN_ROTATION = 4;
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
  `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-3xl")})`;
// The card preview cache appends a 21px watermark strip to a 259px-tall
// content image. Licensed originals contain the 259px content region only.
const CARD_PREVIEW_CONTENT_FRACTION = 259 / 280;
// Sits above all screen-owned content (≤20) and below the journey status bar
// (40/41) and utility menu (60).
const FRAME_BREAK_LAYER = 39;
const FRAME_BREAK_EXIT_LAYER = 61;
const FULL_ART_BLUR_FILL_SCALE = 1.08;
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
  const t = useMessages();
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
        aria-label={t("exploration-choices-accessible-name")}
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
          gap: token("--space-xs"),
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
                y: visible || reduceMotion ? 0 : token("--space-xs"),
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

function selectedCardOperation(
  entryId: string,
  followup: ExplorationFollowupView,
  selectedEntryIds: readonly string[],
  purgeEntryId: string | null,
): ExplorationCardSelectionOperation | undefined {
  if (followup.kind !== "cards") return undefined;
  if (entryId === purgeEntryId) return "purge";
  if (!selectedEntryIds.includes(entryId)) return undefined;
  return followup.mode === "purge-and-copy"
    ? "copy"
    : followup.selectionOperation;
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function containedArtRect(
  viewport: RectSnapshot,
  art: FullArtDimensions,
): RectSnapshot {
  const artAspect = art.width / art.height;
  const viewportAspect = viewport.width / viewport.height;
  if (artAspect < viewportAspect) {
    const width = viewport.height * artAspect;
    return {
      left: (viewport.width - width) / 2,
      top: 0,
      width,
      height: viewport.height,
    };
  }
  const height = viewport.width / artAspect;
  return {
    left: 0,
    top: (viewport.height - height) / 2,
    width: viewport.width,
    height,
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
      reward.semanticKind ?? "objects",
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
    case "purged-card-essence":
      return [
        actionId,
        reward.kind,
        reward.card.entryId,
        reward.card.model.cardId,
        reward.spark,
        reward.essencePerSpark,
        reward.totalEssence,
      ].join("|");
    case "card-copies":
      return [
        actionId,
        reward.kind,
        reward.sourceEntryId,
        ...reward.cards.map((card) => card.entryId),
      ].join("|");
    case "card-copies-multiple":
      return [
        actionId,
        reward.kind,
        ...reward.pairs.flatMap((pair) => [
          `source:${pair.source.entryId}`,
          `copy:${pair.copy.entryId}`,
        ]),
      ].join("|");
    case "purge-and-copy":
      return [
        actionId,
        reward.kind,
        `purged:${reward.purgedCard.entryId}`,
        `source:${reward.sourceEntryId}`,
        ...reward.cards.map((card) => `copy:${card.entryId}`),
      ].join("|");
    case "battle-modifier":
      return [actionId, reward.kind, reward.modifier, reward.amount].join("|");
    case "smaller-hand-and-cost-discount":
      return [
        actionId,
        reward.kind,
        reward.openingHandDelta,
        reward.energyCostReduction,
      ].join("|");
    case "dream-avatar":
      return [actionId, reward.kind, reward.current.id].join("|");
    case "site-offer-modifier":
      return [
        actionId,
        reward.kind,
        reward.modifier,
        reward.sourceSiteId,
        reward.sourceActionId,
      ].join("|");
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

function cardCopyFanPose(
  index: number,
  count: number,
  layout: "mobile" | "desktop",
): { readonly x: number; readonly y: number; readonly rotate: number } {
  const centeredIndex = index - (count - 1) / 2;
  const step =
    layout === "desktop"
      ? DESKTOP_CARD_COPY_FAN_STEP
      : MOBILE_CARD_COPY_FAN_STEP;
  return {
    x: centeredIndex * step,
    y: Math.abs(centeredIndex) * CARD_COPY_FAN_RISE,
    rotate: centeredIndex * CARD_COPY_FAN_ROTATION,
  };
}

function cardCopyEmergenceDelaySeconds(
  index: number,
  role: "original" | "copy",
  reduceMotion: boolean,
): number {
  if (reduceMotion || role === "original") return 0;
  return Math.max(0, index - 1) * REWARD_STAGGER_SECONDS;
}

function PurgedCardPresentation({
  card,
  cardWidth,
  index,
  reduceMotion,
}: {
  readonly card: ExplorationCardChoiceView;
  readonly cardWidth: number | string;
  readonly index: number;
  readonly reduceMotion: boolean;
}) {
  return (
    <motion.div
      data-exploration-purge-card=""
      data-exploration-deck-entry-id={card.entryId}
      data-card-id={card.model.cardId}
      initial={{
        opacity: reduceMotion ? 1 : 0,
        scale: reduceMotion ? 1 : 0.88,
        y: reduceMotion ? 0 : token("--space-l"),
        rotate: 0,
      }}
      animate={
        reduceMotion
          ? { opacity: 1, scale: 1, y: 0, rotate: 0 }
          : {
              opacity: [0, 1, 1, 0],
              scale: [0.88, 1, 1, 0.5],
              y: [token("--space-l"), 0, 0, token("--space-2xl")],
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
        selection="danger"
        testId={`cumulus-exploration-purged-card-${String(index)}`}
      />
      <motion.span
        data-exploration-purge-icon=""
        aria-hidden="true"
        initial={{ opacity: reduceMotion ? 1 : 0, scale: 0.72 }}
        animate={{
          opacity: 1,
          scale: reduceMotion ? 1 : [0.72, 1, 1.2],
        }}
        transition={{
          duration: reduceMotion ? 0 : REWARD_READING_SECONDS,
          times: reduceMotion ? undefined : [0, 0.25, 1],
          ease: DREAM_EASE,
        }}
        style={{
          position: "absolute",
          right: token("--space-xs"),
          bottom: token("--space-xs"),
          width: "clamp(34px, 22%, 52px)",
          aspectRatio: "1 / 1",
          containerType: "inline-size",
          borderRadius: token("--radius-control"),
          display: "grid",
          placeItems: "center",
          background: token("--danger"),
          boxShadow: token("--shadow-md"),
        }}
      >
        <span style={{ display: "inline-flex", fontSize: "58cqi" }}>
          <StandaloneGlyph glyph={GLYPHS.trash} color="text-on-accent" />
        </span>
      </motion.span>
    </motion.div>
  );
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
  const t = useMessages();
  const reduceMotion = useReducedMotion() === true;
  const isDesktop = useIsDesktop();
  const cardTargetRef = useRef<HTMLDivElement>(null);
  const exitCompletedRef = useRef(false);
  const resumedResolutionRef = useRef<string | null>(null);
  const rewardItemRefs = useRef(new Map<string, HTMLDivElement>());
  const cardCopyRefs = useRef(new Map<string, HTMLDivElement>());
  const transfigurationCardRef = useRef<HTMLDivElement>(null);
  const completedRewardItemsRef = useRef(new Set<string>());
  const completedCardCopyItemsRef = useRef(new Set<string>());
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
  const [cardCopiesPhase, setCardCopiesPhase] =
    useState<CardCopiesPhase>("original");
  const [purgeAndCopyPhase, setPurgeAndCopyPhase] =
    useState<PurgeAndCopyPhase>("purging");
  const [cardCopyTrajectories, setCardCopyTrajectories] = useState<
    ReadonlyMap<string, RewardTrajectory> | null
  >(null);
  const [essenceRewardPhase, setEssenceRewardPhase] = useState<
    "cards" | "announcement"
  >("cards");
  const [dreamsignPurgeRewardPhase, setDreamsignPurgeRewardPhase] = useState<
    "purging" | "announcement"
  >("purging");
  const [cardPurgeRewardPhase, setCardPurgeRewardPhase] = useState<
    "purging" | "announcement"
  >("purging");
  const [deckModificationPresented, setDeckModificationPresented] =
    useState(false);
  const [purgedCardsPresented, setPurgedCardsPresented] = useState(false);
  const [transfigurationRevealed, setTransfigurationRevealed] =
    useState(false);
  const [transfigurationReturn, setTransfigurationReturn] =
    useState<RewardTrajectory | null>(null);
  const [fullArtDimensions, setFullArtDimensions] =
    useState<FullArtDimensions | null>(null);
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
  const cardPurgeReward =
    effectReward?.kind === "purged-card-essence" ? effectReward : null;
  const directCardCopiesReward =
    effectReward?.kind === "card-copies" ||
    effectReward?.kind === "card-copies-multiple"
      ? effectReward
      : null;
  const purgeAndCopyReward =
    effectReward?.kind === "purge-and-copy" ? effectReward : null;
  const cardCopiesReward: CardCopiesReward | null =
    directCardCopiesReward ??
    (purgeAndCopyReward !== null && purgeAndCopyPhase === "copying"
      ? {
          kind: "card-copies",
          sourceEntryId: purgeAndCopyReward.sourceEntryId,
          source: purgeAndCopyReward.source,
          cards: purgeAndCopyReward.cards,
          count: purgeAndCopyReward.count,
        }
      : null);
  const cardCopyItems = useMemo(
    () => {
      if (cardCopiesReward === null) return [];
      if (cardCopiesReward.kind === "card-copies") {
        return [
          { card: cardCopiesReward.source, role: "original" as const },
          ...cardCopiesReward.cards.map((card) => ({
            card,
            role: "copy" as const,
          })),
        ];
      }
      return cardCopiesReward.pairs.flatMap((pair) => [
        { card: pair.source, role: "original" as const },
        { card: pair.copy, role: "copy" as const },
      ]);
    },
    [cardCopiesReward],
  );
  const battleModifierReward =
    effectReward?.kind === "battle-modifier" ? effectReward : null;
  const smallerHandDiscountReward =
    effectReward?.kind === "smaller-hand-and-cost-discount"
      ? effectReward
      : null;
  const dreamAvatarReward =
    effectReward?.kind === "dream-avatar" ? effectReward : null;
  const siteOfferModifierReward =
    effectReward?.kind === "site-offer-modifier" ? effectReward : null;
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
  const emptyObjectOutcome =
    resolvedReward !== null &&
    resolvedReward.deckModification === null &&
    rewardItems.length === 0 &&
    purgedRewardCards.length === 0;
  const rewardStageAnnouncement =
    purgedRewardCards.length === 0
      ? t("exploration-outcome-rewards-gained", {
          rewardCount: rewardItems.length,
        })
      : rewardItems.length === 0
        ? t("exploration-outcome-cards-purging", {
            purgedCardCount: purgedRewardCards.length,
          })
        : t("exploration-outcome-purge-and-gain", {
            purgedCardCount: purgedRewardCards.length,
            rewardCount: rewardItems.length,
          });
  const rewardIdentity = explorationRewardIdentity(
    view.resolvedActionId,
    view.reward,
  );
  const portraitFullArt =
    fullArtDimensions !== null &&
    fullArtDimensions.height > fullArtDimensions.width;
  const expandedArtRect =
    frameBreakGeometry !== null &&
    portraitFullArt &&
    fullArtDimensions !== null
      ? containedArtRect(frameBreakGeometry.viewport, fullArtDimensions)
      : frameBreakGeometry?.viewport;
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
    completedCardCopyItemsRef.current.clear();
    rewardItemRefs.current.clear();
    cardCopyRefs.current.clear();
    setRewardTrajectories(null);
    setCardCopiesPhase(reduceMotion ? "copies" : "original");
    setPurgeAndCopyPhase("purging");
    setCardCopyTrajectories(null);
    setEssenceRewardPhase("cards");
    setDreamsignPurgeRewardPhase("purging");
    setCardPurgeRewardPhase("purging");
    setDeckModificationPresented(false);
    setPurgedCardsPresented(false);
    setTransfigurationRevealed(false);
    setTransfigurationReturn(null);
  }, [reduceMotion, rewardIdentity]);

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
      cardPurgeReward === null ||
      frameBreakPhase !== "open" ||
      cardPurgeRewardPhase !== "announcement"
    ) {
      return;
    }
    const timer = window.setTimeout(
      completeExit,
      RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    cardPurgeReward,
    cardPurgeRewardPhase,
    completeExit,
    frameBreakPhase,
  ]);

  useEffect(() => {
    if (
      frameBreakPhase !== "open" ||
      (battleModifierReward === null &&
        smallerHandDiscountReward === null &&
        dreamAvatarReward === null &&
        siteOfferModifierReward === null &&
        !emptyObjectOutcome)
    ) {
      return;
    }
    const timer = window.setTimeout(
      completeExit,
      RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [
    battleModifierReward,
    completeExit,
    dreamAvatarReward,
    emptyObjectOutcome,
    frameBreakPhase,
    siteOfferModifierReward,
    smallerHandDiscountReward,
  ]);

  useEffect(() => {
    if (
      purgeAndCopyReward === null ||
      frameBreakPhase !== "open" ||
      purgeAndCopyPhase !== "purging"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setPurgeAndCopyPhase("copying"),
      REWARD_READING_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [frameBreakPhase, purgeAndCopyPhase, purgeAndCopyReward]);

  useEffect(() => {
    if (
      cardCopiesReward === null ||
      frameBreakPhase !== "open" ||
      cardCopiesPhase !== "original"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setCardCopiesPhase("copies"),
      CARD_COPY_ORIGINAL_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [cardCopiesPhase, cardCopiesReward, frameBreakPhase]);

  useEffect(() => {
    if (
      cardCopiesReward === null ||
      frameBreakPhase !== "open" ||
      cardCopiesPhase !== "copies" ||
      cardCopyTrajectories !== null
    ) {
      return;
    }
    const lastEmergenceDelay = Math.max(
      0,
      ...cardCopyItems.map((item, index) =>
        cardCopyEmergenceDelaySeconds(index, item.role, reduceMotion),
      ),
    );
    const delay = reduceMotion
      ? REWARD_READING_SECONDS
      : CARD_COPY_EMERGE_SECONDS +
        CARD_COPY_READING_SECONDS +
        lastEmergenceDelay;
    const timer = window.setTimeout(() => {
      if (reduceMotion) {
        completeExit();
        return;
      }
      const trajectories = new Map<string, RewardTrajectory>();
      for (const item of cardCopyItems) {
        const card = item.card;
        const sourceRect = cardCopyRefs.current
          .get(card.entryId)
          ?.getBoundingClientRect();
        if (
          sourceRect === undefined ||
          sourceRect.width <= 0 ||
          sourceRect.height <= 0
        ) {
          continue;
        }
        const source = snapshotRect(sourceRect);
        const destination = sourceRectFor(source);
        trajectories.set(card.entryId, {
          source,
          target: destination.rect,
          destinationKind: destination.kind,
        });
      }
      if (trajectories.size !== cardCopyItems.length) {
        completeExit();
        return;
      }
      setCardCopyTrajectories(trajectories);
      setCardCopiesPhase("travel");
    }, delay * 1_000);
    return () => window.clearTimeout(timer);
  }, [
    cardCopiesPhase,
    cardCopiesReward,
    cardCopyItems,
    cardCopyTrajectories,
    completeExit,
    frameBreakPhase,
    reduceMotion,
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

  const finishCardCopyItem = (entryId: string): void => {
    completedCardCopyItemsRef.current.add(entryId);
    if (
      completedCardCopyItemsRef.current.size >=
      (cardCopyTrajectories?.size ?? Number.POSITIVE_INFINITY)
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
          ? `min(max(420px, calc(${String(dreamsignChoiceColumns)} * ${String(DESKTOP_DREAMSIGN_CHOICE_SIZE)}px + ${String(dreamsignChoiceColumns - 1)} * ${token("--space-3xl")} + 2 * ${token("--space-2xl")})), calc(100vw - 64px))`
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
              gap: token("--space-l"),
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
                    label={t("exploration-delve-action")}
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
              <CardBack label={t("exploration-card-face-down")} />
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
              <CardBack label={t("exploration-card-returning-face-down")} />
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
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth <= 0 || naturalHeight <= 0) return;
          setFullArtDimensions({ width: naturalWidth, height: naturalHeight });
        }}
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
          data-exploration-art-presentation={
            portraitFullArt ? "contain-with-blur" : "cover"
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
            aria-label={t("exploration-return-action")}
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
            {portraitFullArt && (
              <motion.div
                data-exploration-full-art-blur-fill=""
                aria-hidden="true"
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
                  overflow: "hidden",
                }}
              >
                <img
                  src={fullArtUrl}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    maxWidth: "none",
                    maxHeight: "none",
                    objectFit: "cover",
                    objectPosition: "center",
                    filter: `blur(${token("--glass-blur")})`,
                    transform: `scale(${String(FULL_ART_BLUR_FILL_SCALE)})`,
                    userSelect: "none",
                  }}
                />
              </motion.div>
            )}
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
                      x: expandedArtRect?.left ?? 0,
                      y: expandedArtRect?.top ?? 0,
                      width:
                        expandedArtRect?.width ??
                        frameBreakGeometry.viewport.width,
                      height:
                        expandedArtRect?.height ??
                        frameBreakGeometry.viewport.height,
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
            aria-label={t("exploration-card-transfiguring", {
              cardName: transfigurationReward.before.displaySnapshot.name,
              form: transfigurationReward.after.transfiguration.type,
            })}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-3xl"),
              right: token("--space-l"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-l"),
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
                  selection="transfigured"
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
            selection="transfigured"
          />
        </motion.div>
      )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        purgeAndCopyReward !== null &&
        purgeAndCopyPhase === "purging" && (
          <motion.section
            data-exploration-outcome="purge-and-copy"
            data-exploration-compound-phase="purging"
            data-exploration-purged-entry-id={
              purgeAndCopyReward.purgedCard.entryId
            }
            data-exploration-source-entry-id={
              purgeAndCopyReward.sourceEntryId
            }
            data-exploration-copy-count={purgeAndCopyReward.count}
            role="status"
            aria-label={t("exploration-purge-before-copy", {
              purgedCardName:
                purgeAndCopyReward.purgedCard.model.displaySnapshot.name,
              sourceCardName:
                purgeAndCopyReward.source.model.displaySnapshot.name,
            })}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-3xl"),
              right: token("--space-l"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-l"),
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <PurgedCardPresentation
              card={purgeAndCopyReward.purgedCard}
              cardWidth={
                isDesktop ? DESKTOP_REWARD_CARD_WIDTH : "min(58vw, 240px)"
              }
              index={0}
              reduceMotion={reduceMotion}
            />
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        cardCopiesReward !== null &&
        cardCopyTrajectories === null && (
          <motion.section
            data-exploration-outcome={
              purgeAndCopyReward === null
                ? cardCopiesReward.kind
                : "purge-and-copy"
            }
            data-exploration-compound-phase={
              purgeAndCopyReward === null ? undefined : "copying"
            }
            data-exploration-source-entry-id={
              cardCopiesReward.kind === "card-copies"
                ? cardCopiesReward.sourceEntryId
                : undefined
            }
            data-exploration-source-entry-ids={
              cardCopiesReward.kind === "card-copies-multiple"
                ? cardCopiesReward.pairs
                    .map((pair) => pair.source.entryId)
                    .join(",")
                : undefined
            }
            data-exploration-copy-count={cardCopiesReward.count}
            data-exploration-card-copies-phase={cardCopiesPhase}
            role="status"
            aria-label={
              purgeAndCopyReward === null
                ? t("exploration-card-copies-gained", {
                    copyCount: cardCopiesReward.count,
                  })
                : t("exploration-purge-and-copy-complete", {
                    purgedCardName:
                      purgeAndCopyReward.purgedCard.model.displaySnapshot.name,
                    copyCount: cardCopiesReward.count,
                    sourceCardName:
                      purgeAndCopyReward.source.model.displaySnapshot.name,
                  })
            }
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              inset: `${safeAreaInsetAtLeast("top", "--space-xl")} ${token("--space-m")} ${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE}`,
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "grid",
              placeContent: "center",
              justifyItems: "center",
              pointerEvents: "none",
            }}
          >
            <div
              data-exploration-card-copy-stage=""
              style={{
                position: "relative",
                width: isDesktop
                  ? DESKTOP_REWARD_CARD_WIDTH
                  : MOBILE_CARD_COPY_WIDTH,
                aspectRatio: CARD_ASPECT_RATIO,
              }}
            >
              {cardCopyItems.map((item, index) => {
                const { card, role } = item;
                const isSource = role === "original";
                const fanPose = cardCopyFanPose(
                  index,
                  cardCopyItems.length,
                  isDesktop ? "desktop" : "mobile",
                );
                const copiesVisible =
                  reduceMotion || cardCopiesPhase !== "original";
                return (
                  <motion.div
                    key={card.entryId}
                    ref={(element) => {
                      if (element === null) {
                        cardCopyRefs.current.delete(card.entryId);
                      } else {
                        cardCopyRefs.current.set(card.entryId, element);
                      }
                    }}
                    data-exploration-card-copy-role={
                      isSource ? "original" : "copy"
                    }
                    data-exploration-copied-entry-id={
                      isSource ? undefined : card.entryId
                    }
                    data-exploration-deck-entry-id={card.entryId}
                    data-card-id={card.model.cardId}
                    initial={false}
                    animate={{
                      x: copiesVisible ? fanPose.x : 0,
                      y: copiesVisible ? fanPose.y : 0,
                      rotate: copiesVisible ? fanPose.rotate : 0,
                      opacity: isSource || copiesVisible ? 1 : 0,
                    }}
                    transition={{
                      delay: cardCopyEmergenceDelaySeconds(
                        index,
                        role,
                        reduceMotion,
                      ),
                      duration: reduceMotion ? 0 : CARD_COPY_EMERGE_SECONDS,
                      ease: DREAM_EASE,
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: isSource ? cardCopyItems.length + 1 : index,
                      transformOrigin: "center bottom",
                    }}
                  >
                    <GameCard
                      model={card.model}
                      selection="reward"
                      testId={`cumulus-exploration-card-copy-${card.entryId}`}
                    />
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        cardCopiesReward !== null &&
        cardCopyTrajectories !== null &&
        cardCopyItems.map((item) => {
          const { card, role } = item;
          const copyTrajectory = cardCopyTrajectories.get(card.entryId);
          if (copyTrajectory === undefined) return null;
          const scale = Math.min(
            copyTrajectory.target.width / copyTrajectory.source.width,
            copyTrajectory.target.height / copyTrajectory.source.height,
          );
          return (
            <motion.div
              key={card.entryId}
              data-exploration-outcome={
                purgeAndCopyReward === null
                  ? cardCopiesReward.kind
                  : "purge-and-copy"
              }
              data-exploration-compound-phase={
                purgeAndCopyReward === null ? undefined : "travel"
              }
              data-exploration-card-copy-flight=""
              data-exploration-card-copy-role={role}
              data-exploration-deck-entry-id={card.entryId}
              data-exploration-destination={copyTrajectory.destinationKind}
              initial={{
                x: copyTrajectory.source.left,
                y: copyTrajectory.source.top,
                scale: 1,
                opacity: 1,
              }}
              animate={{
                x: copyTrajectory.target.left,
                y: copyTrajectory.target.top,
                scale,
                opacity: 1,
              }}
              transition={{
                duration: REWARD_TRAVEL_SECONDS,
                ease: DREAM_EASE,
              }}
              onAnimationComplete={() => finishCardCopyItem(card.entryId)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: FRAME_BREAK_EXIT_LAYER + 2,
                width: copyTrajectory.source.width,
                height: copyTrajectory.source.height,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              <GameCard model={card.model} selection="reward" />
            </motion.div>
          );
        })}
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
            aria-label={t("exploration-next-battle-modifier", {
              amount: battleModifierReward.amount,
              modifier:
                battleModifierReward.modifier === "opening-hand"
                  ? "opening-hand"
                  : "starting-energy",
            })}
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
              headline={t("exploration-battle-modifier-announcement", {
                amount: battleModifierReward.amount,
                modifier:
                  battleModifierReward.modifier === "opening-hand"
                    ? "openingHand"
                    : "startingEnergy",
              })}
              detail={t("exploration-next-battle-label")}
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
        smallerHandDiscountReward !== null && (
          <section
            data-exploration-outcome="smaller-hand-and-cost-discount"
            data-exploration-opening-hand-delta={
              smallerHandDiscountReward.openingHandDelta
            }
            data-exploration-energy-cost-reduction={
              smallerHandDiscountReward.energyCostReduction
            }
            data-exploration-battles-remaining={
              smallerHandDiscountReward.battlesRemaining
            }
            role="status"
            aria-label={t("exploration-smaller-hand-cost-accessible-name", {
              openingHandDelta: smallerHandDiscountReward.openingHandDelta,
              energyCostReduction:
                smallerHandDiscountReward.energyCostReduction,
            })}
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
              headline={t("exploration-opening-hand-change-announcement", {
                openingHandDelta: smallerHandDiscountReward.openingHandDelta,
              })}
              detail={t("exploration-next-battle-card-cost-reduction", {
                energyCostReduction:
                  smallerHandDiscountReward.energyCostReduction,
              })}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-smaller-hand-cost-discount:${view.resolvedActionId ?? "resolved"}`}
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
            aria-label={t("exploration-dream-avatar-changed", {
              dreamAvatarName: dreamAvatarReward.current.name,
            })}
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              inset: `${safeAreaInsetAtLeast("top", "--space-xl")} ${token("--space-m")} ${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE}`,
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "grid",
              placeContent: "center",
              justifyItems: "center",
              gap: token("--space-m"),
              color: token("--text-primary"),
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{ width: isDesktop ? 260 : 210 }}>
              <DreamAvatarPortrait
                dreamAvatar={dreamAvatarReward.current}
                variant="panel"
              />
            </div>
            <div style={{ display: "grid", gap: token("--space-xxs") }}>
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
        siteOfferModifierReward !== null && (
          <section
            data-exploration-outcome="site-offer-modifier"
            data-exploration-site-offer-modifier={siteOfferModifierReward.modifier}
            data-exploration-source-site-id={siteOfferModifierReward.sourceSiteId}
            data-exploration-source-action-id={siteOfferModifierReward.sourceActionId}
            role="status"
            aria-label={t("exploration-site-offer-modifier-accessible-name")}
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
              headline={t("exploration-site-offer-modifier-title")}
              detail={t("exploration-site-offer-modifier-detail")}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-site-offer-modifier:${siteOfferModifierReward.sourceActionId}`}
            />
          </section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        emptyObjectOutcome &&
        resolvedReward !== null && (
          <section
            data-exploration-outcome={resolvedReward.semanticKind ?? "objects"}
            data-exploration-reward-count="0"
            role="status"
            aria-label={t("exploration-no-cards-taken")}
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
              headline={t("exploration-no-cards-taken")}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-empty-card-acquisition:${view.resolvedActionId ?? "resolved"}`}
            />
          </section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        objectReward !== null &&
        showObjectReward &&
        rewardTrajectories === null && (
          <motion.section
            data-exploration-reward-stage=""
            data-exploration-outcome={resolvedReward?.semanticKind ?? "objects"}
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
              top: safeAreaInsetAtLeast("top", "--space-3xl"),
              right: token("--space-l"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-l"),
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "flex",
              flexWrap: "wrap",
              alignContent: "center",
              alignItems: "center",
              justifyContent: "center",
              gap: token("--space-l"),
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
                <PurgedCardPresentation
                  key={`purged:${card.entryId}`}
                  card={card}
                  cardWidth={cardWidth}
                  index={index}
                  reduceMotion={reduceMotion}
                />
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
                    y: reduceMotion ? 0 : token("--space-l"),
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
            aria-label={
              deckModification.announcementDescriptor === undefined
                ? deckModification.announcement
                : formatMessageDescriptor(
                    t,
                    deckModification.announcementDescriptor,
                  )
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-l"),
              right: token("--space-s"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-s"),
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
                    selection={
                      deckModification.kind === "spark"
                        ? "spark-changed"
                        : deckModification.kind === "energy-cost"
                          ? "energy-changed"
                          : deckModification.kind === "reclaim"
                            ? "reward"
                            : "changed"
                    }
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
        cardPurgeReward !== null &&
        cardPurgeRewardPhase === "purging" && (
          <section
            data-exploration-outcome="purged-card-essence"
            data-exploration-purged-card-phase="purging"
            data-exploration-deck-entry-id={cardPurgeReward.card.entryId}
            data-card-id={cardPurgeReward.card.model.cardId}
            data-exploration-purged-card-spark={cardPurgeReward.spark}
            data-exploration-essence-per-spark={
              cardPurgeReward.essencePerSpark
            }
            data-exploration-essence-gained={cardPurgeReward.totalEssence}
            role="status"
            aria-label={t("exploration-card-purge-for-essence", {
              cardName: cardPurgeReward.card.model.displaySnapshot.name,
              essenceAmount: cardPurgeReward.totalEssence,
            })}
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
              data-exploration-purged-card=""
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
                setCardPurgeRewardPhase("announcement")
              }
              style={{
                width: isDesktop
                  ? DESKTOP_REWARD_CARD_WIDTH
                  : MOBILE_ESSENCE_CARD_WIDTH,
                aspectRatio: CARD_ASPECT_RATIO,
              }}
            >
              <GameCard
                model={cardPurgeReward.card.model}
                selection="danger"
                testId="cumulus-exploration-purged-card"
              />
            </motion.div>
          </section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        cardPurgeReward !== null &&
        cardPurgeRewardPhase === "announcement" && (
          <div
            data-exploration-outcome="purged-card-essence"
            data-exploration-purged-card-phase="announcement"
            data-exploration-deck-entry-id={cardPurgeReward.card.entryId}
            data-card-id={cardPurgeReward.card.model.cardId}
            data-exploration-purged-card-spark={cardPurgeReward.spark}
            data-exploration-essence-per-spark={
              cardPurgeReward.essencePerSpark
            }
            data-exploration-essence-gained={cardPurgeReward.totalEssence}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              announcementId={`exploration:${view.siteId}:${view.resolvedActionId ?? "purged-card-essence"}`}
              headline={t("exploration-essence-gained-title")}
              detail={t("exploration-purge-essence-calculation", {
                essencePerSpark: cardPurgeReward.essencePerSpark,
                spark: cardPurgeReward.spark,
              })}
              essenceGained={cardPurgeReward.totalEssence}
              tone="reward"
              size={isDesktop ? "standard" : "compact"}
              duration="extended"
            />
          </div>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        dreamsignPurgeReward !== null &&
        dreamsignPurgeRewardPhase === "purging" && (
          <section
            data-exploration-purged-dreamsign-stage=""
            role="status"
            aria-label={t("exploration-dreamsign-purging", {
              dreamsignName: dreamsignPurgeReward.dreamsign.name,
            })}
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
              style={{
                width: isDesktop ? DESKTOP_REWARD_DREAMSIGN_SIZE : MOBILE_REWARD_DREAMSIGN_SIZE,
                height: isDesktop ? DESKTOP_REWARD_DREAMSIGN_SIZE : MOBILE_REWARD_DREAMSIGN_SIZE,
              }}
            >
              <Dreamsign
                dreamsign={dreamsignPurgeReward.dreamsign}
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
              headline={t("exploration-essence-gained-title")}
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
            aria-label={t("exploration-spirit-animal-essence-summary", {
              cardCount: essenceReward.cards.length,
              totalEssence: essenceReward.totalEssence,
              essencePerCard: essenceReward.essencePerCard,
            })}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
            style={{
              position: "fixed",
              top: safeAreaInsetAtLeast("top", "--space-3xl"),
              right: token("--space-l"),
              bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
              left: token("--space-l"),
              zIndex: FRAME_BREAK_EXIT_LAYER + 1,
              display: "flex",
              flexWrap: "wrap",
              alignContent: "center",
              alignItems: "center",
              justifyContent: "center",
              gap: isDesktop ? token("--space-s") : token("--space-xs"),
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
                  y: reduceMotion ? 0 : token("--space-l"),
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
                    right: `calc(-1 * ${token("--space-xs")})`,
                    bottom: `calc(-1 * ${token("--space-xs")})`,
                    zIndex: ESSENCE_CHIP_LAYER,
                    boxShadow: token("--shadow-md"),
                    borderRadius: token("--radius-pill"),
                  }}
                >
                  <EssenceValue
                    amount={`+${String(essenceReward.essencePerCard)}`}
                    tone="mark"
                    variant="rewardBadge"
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
              headline={t("exploration-essence-gained-title")}
              detail={t("exploration-spirit-animal-essence-calculation", {
                essencePerCard: essenceReward.essencePerCard,
                cardCount: essenceReward.cards.length,
              })}
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
            left: `max(var(--safe-area-inset-left), ${token("--space-m")})`,
            bottom: isDesktop
              ? DESKTOP_FLOATING_PANEL_BOTTOM
              : JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
            zIndex: FRAME_BREAK_EXIT_LAYER,
            width: isDesktop
              ? "min(400px, calc(100vw - 48px))"
              : `calc(100vw - ${token("--space-m")} - ${token("--space-m")})`,
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
                gap: token("--space-m"),
                padding: token("--space-l"),
                paddingTop: token("--space-m"),
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
              ? safeAreaInsetAtLeast("top", "--space-2xl")
              : `calc(max(var(--safe-area-inset-top), ${token("--space-s")}) + ${String(MENU_BUTTON_PX)}px + ${token("--space-xs")})`,
            right: isDesktop
              ? centeredFollowupWidth !== null
                ? 0
                : `calc(max(var(--safe-area-inset-right), ${token("--space-2xl")}) + ${String(MENU_BUTTON_PX)}px + ${token("--space-xs")})`
              : `max(var(--safe-area-inset-right), ${token("--space-s")})`,
            bottom: isDesktop
              ? DESKTOP_FLOATING_PANEL_BOTTOM
              : JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
            left: isDesktop
              ? centeredFollowupWidth !== null
                ? 0
                : "auto"
              : `max(var(--safe-area-inset-left), ${token("--space-s")})`,
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
                        ? `0 ${token("--space-2xl")} ${token("--space-l")}`
                        : `0 ${token("--space-s")} ${token("--space-s")}`,
                    }}
                  >
                    <GlassButton
                      label={t("exploration-confirm-choice-action")}
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
                    // The floating GlassPanel hugs its contents, so block-size
                    // containment would make this fitter's intrinsic height zero
                    // and collapse every cqh-sized card to 0x0.
                    containerType: "inline-size",
                    display: "grid",
                    placeItems: "center",
                    padding: isDesktop
                      ? token("--space-xl")
                      : token("--space-s"),
                    boxSizing: "border-box",
                  }}
                >
                  <CardChoiceGrid
                    cards={activeAction.followup.cards.map((card) => ({
                      entryId: card.entryId,
                      model: card.model,
                      selection: selectedIds.includes(card.entryId)
                        ? "highlighted"
                        : undefined,
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
            <CardPickerPanel
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              footerActions={[
                {
                    label:
                      activeAction.followup.mode === "purge-and-copy" && purgeEntryId === null
                      ? t("exploration-followup-choice-purge")
                      : activeAction.followup.mode === "purge-and-copy" && selectedIds.length === 0
                        ? t("exploration-followup-choice-copy")
                        : t("exploration-confirm-choice-action"),
                  onPress: commitFollowup,
                  disabled: !canCommitFollowup,
                  variant: "accent",
                  testId: "cumulus-exploration-followup-confirm",
                },
              ]}
              cards={activeAction.followup.cards.map((card) => ({
                entryId: card.entryId,
                model: card.model,
                selection:
                  card.entryId === purgeEntryId
                    ? "danger"
                    : selectedIds.includes(card.entryId)
                      ? "selected"
                      : undefined,
                emphasis: card.isBane ? "danger" : undefined,
                operation: selectedCardOperation(
                  card.entryId,
                  activeAction.followup,
                  selectedIds,
                  purgeEntryId,
                ),
                testId: `cumulus-exploration-card-${card.entryId}`,
              }))}
              emptyLabel={t("exploration-empty-card-state")}
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
                <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: token("--space-l"), padding: token("--space-l"), overflow: "auto" }}>
                  {activeAction.followup.packs.map((pack) => (
                    <section
                      key={pack.index}
                      data-testid={`cumulus-exploration-pack-${String(pack.index)}`}
                      style={{
                        display: "grid",
                        gap: 0,
                        padding: token("--space-m"),
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
                            ? `${token("--space-xl")} ${token("--space-2xl")} ${token("--space-2xl")}`
                            : `${token("--space-xs")} 0 ${token("--space-s")}`,
                        }}
                      >
                        {t("exploration-pack-title", {
                          packNumber: pack.index + 1,
                        })}
                      </strong>
                      <span data-exploration-pack-cards="" style={{ display: "grid", gridTemplateColumns: `repeat(${String(pack.cards.length)}, minmax(0, 1fr))`, gap: token("--space-xs") }}>
                        {pack.cards.map((card) => <GameCard key={card.entryId} model={card.model} />)}
                      </span>
                      <div
                        data-exploration-pack-action=""
                        style={{
                          display: isDesktop ? "flex" : "grid",
                          justifyContent: isDesktop ? "center" : undefined,
                          margin: isDesktop
                            ? `${token("--space-2xl")} ${token("--space-2xl")} ${token("--space-xl")}`
                            : `${token("--space-s")} 0 ${token("--space-xs")}`,
                        }}
                      >
                        <GlassButton
                          label={t("exploration-pack-choose-action")}
                          accessibilityLabel={t(
                            "exploration-pack-choose-accessible-name",
                            { packNumber: pack.index + 1 },
                          )}
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
              eyebrow={t("exploration-site-eyebrow")}
              title={activeAction.followup.title}
              subtitle={activeAction.followup.subtitle}
              headingLevel="h1"
              footer={
                <div style={{ display: "flex", justifyContent: "flex-end", padding: token("--space-m") }}>
                  <GlassButton label={t("exploration-confirm-choice-action")} variant="accent" placement="onGlass" disabled={!canCommitFollowup} onPress={commitFollowup} testId="cumulus-exploration-followup-confirm" />
                </div>
              }
            >
              <div role="radiogroup" style={{ display: "grid", gap: token("--space-xs"), padding: token("--space-m") }}>
                {activeAction.followup.options.map((option) => (
                  <Pressable
                    key={option}
                    as="button"
                    role="radio"
                    aria-checked={selectedSubtype === option}
                    onClick={() => setSelectedSubtype(option)}
                    style={{ minHeight: token("--touch-min"), padding: token("--space-s"), borderRadius: token("--radius-control"), border: `2px solid ${selectedSubtype === option ? token("--selected") : token("--border-soft")}`, background: token("--glass-on-glass-fill"), color: token("--text-on-glass"), textAlign: "left", font: token("--t-button") }}
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
                  gap: isDesktop ? token("--space-3xl") : token("--space-m"),
                  placeItems: "center",
                  minHeight: 0,
                  maxHeight: "min(70dvh, 620px)",
                  overflow: "auto",
                  padding: isDesktop ? token("--space-2xl") : token("--space-m"),
                }}
              >
                {activeAction.followup.dreamsigns.map((dreamsign) => (
                  <div key={dreamsign.id} style={{ width: isDesktop ? DESKTOP_DREAMSIGN_CHOICE_SIZE : MOBILE_DREAMSIGN_CHOICE_SIZE, height: isDesktop ? DESKTOP_DREAMSIGN_CHOICE_SIZE : MOBILE_DREAMSIGN_CHOICE_SIZE }}>
                    <Dreamsign dreamsign={dreamsign} testid={`cumulus-exploration-dreamsign-${dreamsign.id}`} onPress={() => chooseDreamsign(dreamsign.id)} />
                  </div>
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
                  gap: isDesktop ? token("--space-xl") : token("--space-m"),
                  placeItems: "center",
                  padding: isDesktop ? token("--space-2xl") : token("--space-m"),
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
                      gap: token("--space-xs"),
                      color: token("--text-on-glass"),
                      textAlign: "center",
                    }}
                  >
                    <div style={{ width: isDesktop ? 196 : 150 }}>
                      <DreamAvatarPortrait
                        dreamAvatar={dreamAvatar}
                        variant="panel"
                        profile={{
                          id: dreamAvatar.id,
                          ability: dreamAvatar.renderedText,
                        }}
                        onPress={() =>
                          onResolve(activeAction.id, {
                            dreamAvatarId: dreamAvatar.id,
                          })
                        }
                      />
                    </div>
                    <div style={{ display: "grid", gap: token("--space-xxs") }}>
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
              ? `calc(max(var(--safe-area-inset-right), ${String(exitEdgeInset)}px) + ${String(MENU_BUTTON_PX)}px + ${token("--space-xs")})`
              : `max(var(--safe-area-inset-right), ${String(exitEdgeInset)}px)`,
            zIndex: FRAME_BREAK_EXIT_LAYER,
          }}
        >
            <IconButton
              glyph={GLYPHS.close}
            label={t("exploration-return-action")}
            onPress={collapseFrameBreak}
            testId="cumulus-exploration-exit"
          />
        </motion.div>
      )}
    </GuideGallerySiteLayout>
  );
}

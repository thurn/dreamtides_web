import type { CardSubtype } from "../../types/card-identity";
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
  type RefObject,
} from "react";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { CardChangePair } from "../components/card/CardChangePair";
import {
  CardChoiceGrid,
  type CardChoiceOperation,
  type CardChoiceGridColumns,
} from "../components/card/CardChoiceGrid";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import {
  CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
  CARD_CORNER_RADIUS,
} from "../components/card/card-aspect";
import { CardBack } from "../components/battle/CardBack";
import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../components/dreamscape/SiteNode";
import { GlassButton } from "../components/controls/GlassButton";
import { StandaloneGlyph } from "../components/controls/StandaloneGlyph";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../components/hud/JourneyStatusBar";
import {
  Dreamsign,
  type DreamsignView,
} from "../components/hud/Dreamsign";
import { AvatarPortrait } from "../components/hud/AvatarPortrait";
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
import { MENU_BUTTON_PX } from "../primitives/chrome-geometry";
import {
  SiteLayout,
  type SiteLayoutGuideView,
} from "../components/layout/SiteLayout";
import type { TransfigurationCandidateView } from "./TransfigurationSiteScreen";
import { TransfigurationDetailPanel } from "../components/card/TransfigurationDetailPanel";
import { TransfigurationPickerPanel } from "../components/card/TransfigurationPickerPanel";
import {
  ExplorationChoice as ExplorationChoiceControl,
  type ExplorationChoiceEntity,
} from "../components/controls/ExplorationChoice";
import { richText, type RichText } from "../components/card/rich-text";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";
import { useIsDesktop } from "../primitives/use-is-desktop";
import { requireDreamsignId } from "../../data/dreamsigns";
import type { CardTransfigurationDisplay } from "../../runtime/transfiguration-display";
import type { CardData, CardType } from "../../types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  Avatar,
  TransfigurationType,
} from "../../types/journey";
import type {
  ExplorationChoosableSiteType,
  ExplorationEffectKind,
  ExplorationPredicate,
} from "../../data/exploration";
import type { SiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import type { ExplorationActionId } from "../../types/identifiers";
import type { AtlasNodeId } from "../../types/identifiers";
import type { DreamsignId } from "../../types/identifiers";
import type { GlossaryEntryId } from "../../types/identifiers";
import type { IdentityRecord } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { formatNumber } from "../../runtime/format-number";
import { mapAnnotations, type AnnotatedText } from "../../runtime/text";

export interface ExplorationSiteView {
  /** Stable site id exposed to QA and logging. */
  siteId: SiteId;
  /** Current dreamscape scene art behind the encounter, when resolved. */
  scene: ArtRef | null;
  /** Resident Dream Guide art and greeting. */
  guide: SiteLayoutGuideView;
  /** UUID-backed card selected from the Exploration prototype pool. */
  card: GameCardModel;
  /** Licensed full-resolution source for the selected card's frame break. */
  fullArt: ArtRef;
  /** Opening authored prose shown once the frame break fills the viewport. */
  narrative: string;
  /** The authored actions for this encounter, in reveal order. */
  actions: readonly ExplorationActionView[];
  /** Persisted action identity after one choice has resolved. */
  resolvedActionId: ExplorationActionId | null;
  /** Exact UUID-backed objects granted by the persisted resolution. */
  reward: ExplorationRewardView | null;
  /** Semantic outcome variant presented for logging and browser QA. */
  outcomeKind: ExplorationOutcomeKind | null;
}

export interface ExplorationTransfigurationChangeView {
  readonly entryId: DeckEntryId;
  readonly cardId: CardId;
  readonly beforeTransfiguration: null;
  readonly afterTransfiguration: TransfigurationType;
  readonly before: ExplorationCardChoiceView;
  readonly after: ExplorationCardChoiceView & {
    readonly model: ExplorationCardChoiceView["model"] & {
      readonly transfiguration: NonNullable<
        ExplorationCardChoiceView["model"]["transfiguration"]
      >;
    };
  };
}

export interface ExplorationKeywordChangeView {
  readonly entryId: DeckEntryId;
  readonly cardId: CardId;
  readonly beforeKeywordModification: CardKeywordModification | null;
  readonly afterKeywordModification: CardKeywordModification;
  readonly before: ExplorationCardChoiceView;
  readonly after: ExplorationCardChoiceView;
}

export interface ExplorationCardCopyPairView {
  readonly source: ExplorationCardChoiceView;
  readonly copy: ExplorationCardChoiceView;
}

export type ExplorationRewardView =
  | {
      /** Tangible objects granted by the resolution. */
      readonly semanticKind?:
        "card-acquisition" | "card-replacement" | "card-purge" | "objects";
      readonly objects: {
        readonly cards: readonly GameCardModel[];
        readonly purgedCards: readonly ExplorationCardChoiceView[];
        readonly dreamsigns: readonly DreamsignView[];
      };
      /** Persisted mutation applied to every affected UUID-keyed deck entry. */
      readonly deckModification: ExplorationDeckModificationView | null;
    }
  | {
      readonly kind: "direct-essence";
      /** Typed source effect whose persisted resolution produced this outcome. */
      readonly sourceKind:
        "gain-essence" | "gain-random-essence" | "double-essence";
      /** Exact shared Essence balance immediately before resolution. */
      readonly essenceBefore: number;
      /** Exact amount added by the persisted resolution, including zero. */
      readonly essenceGained: number;
      /** Exact shared Essence balance immediately after resolution. */
      readonly essenceAfter: number;
      /** Inclusive prepared random lower bound, when the source was random. */
      readonly minimumEssence?: number;
      /** Inclusive prepared random upper bound, when the source was random. */
      readonly maximumEssence?: number;
    }
  | {
      readonly kind: "transfiguration";
      /** Concrete deck entry whose persisted form changed. */
      readonly entryId: DeckEntryId;
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
      /** Authored predicate shared by every contributing deck entry. */
      readonly predicate: ExplorationPredicate;
      /** Essence granted by each contributing card. */
      readonly essencePerCard: number;
      /** Authoritative total applied by the reducer. */
      readonly totalEssence: number;
    }
  | {
      readonly kind: "purged-dreamsign-essence";
      /** UUID-resolved Dreamsign removed by the persisted resolution. */
      readonly dreamsign: DreamsignView;
      /** Authoritative total applied by the reducer after the purge. */
      readonly totalEssence: number;
    }
  | {
      readonly kind: "card-copies";
      readonly sourceEntryId: DeckEntryId;
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
      readonly sourceEntryId: DeckEntryId;
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
      readonly modifier: "opening-hand" | "event-draw" | "starting-energy";
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
      readonly kind: "avatar";
      readonly previous: Avatar | null;
      readonly current: Avatar;
    }
  | {
      readonly kind: "site-offer-modifier";
      readonly modifier: "transfigure-next-draft-or-shop";
      readonly sourceSiteId: SiteId;
      readonly sourceActionId: ExplorationActionId;
    }
  | {
      readonly kind: "shop-modifier";
      readonly modifier: "free-next-shop" | "free-purchases";
      readonly sourceSiteId: SiteId;
      readonly sourceActionId: ExplorationActionId;
      readonly freePurchaseCount?: number;
      readonly essenceBefore?: number;
      readonly essenceSpent?: number;
      readonly essenceAfter?: number;
    }
  | {
      readonly kind: "site-insertion";
      readonly sourceKind: "add-fixed-site" | "choose-site-type";
      readonly targetNodeId: AtlasNodeId;
      readonly insertionIndex: number;
      readonly siblingSiteIdsBefore: readonly string[];
      /** Display-edge projection of the exact site persisted in the Atlas. */
      readonly model: DreamscapeSiteModel;
    }
  | {
      readonly kind: "dreamsign-mutation";
      /** Typed Dreamsign effect whose persisted resolution produced this outcome. */
      readonly sourceKind:
        | "gain-offered-dreamsign"
        | "replace-selected-dreamsign-with-offered"
        | "replace-all-dreamsigns-random"
        | "purge-selected-dreamsign-and-gain-random";
      /** Exact collection snapshots surrounding the atomic persisted mutation. */
      readonly before: readonly DreamsignView[];
      readonly after: readonly DreamsignView[];
      /** Offered choices revealed before resolution, when the effect had offers. */
      readonly offered: readonly DreamsignView[];
      /** Persisted gained and purged identities, including random outcomes. */
      readonly gained: readonly DreamsignView[];
      readonly purged: readonly DreamsignView[];
      /** Exact persisted replacement pairings in mutation order. */
      readonly replacements: readonly {
        readonly removed: DreamsignView;
        readonly gained: DreamsignView;
      }[];
      readonly poolRegenerated: boolean;
    }
  | {
      readonly kind: "nightmare-dreamsign-bundle";
      /** Typed compound effect whose two reward halves resolved atomically. */
      readonly sourceKind:
        "gain-nightmare-and-dreamsign" | "gain-nightmare-and-offered-dreamsign";
      /** Exact minted Nightmare deck entries, in persisted insertion order. */
      readonly nightmares: readonly ExplorationCardChoiceView[];
      /** Exact collection snapshots surrounding the persisted Dreamsign gain. */
      readonly before: readonly DreamsignView[];
      readonly after: readonly DreamsignView[];
      readonly offered: readonly DreamsignView[];
      readonly gained: readonly DreamsignView[];
      readonly purged: readonly DreamsignView[];
      readonly replacements: readonly {
        readonly removed: DreamsignView;
        readonly gained: DreamsignView;
      }[];
      readonly poolRegenerated: boolean;
    }
  | {
      readonly kind: "starter-card-mutation";
      /** Typed starter-card effect whose persisted mutation produced this outcome. */
      readonly sourceKind:
        | "purge-starter-card"
        | "purge-random-starter-card"
        | "purge-random-starter-and-gain-card"
        | "replace-all-starter-cards";
      readonly mode: "purge" | "replace";
      /** Exact removed deck-entry snapshots in persisted mutation order. */
      readonly purged: readonly ExplorationCardChoiceView[];
      /** Exact persisted before-to-after deck-entry pairings. */
      readonly replacements: readonly {
        readonly purged: ExplorationCardChoiceView;
        readonly gained: ExplorationCardChoiceView;
      }[];
    }
  | {
      readonly kind: "card-replacements";
      readonly sourceKind: "replace-selected" | "replace-random-with-card";
      /** Exact persisted source-to-replacement mappings in committed order. */
      readonly replacements: readonly {
        readonly purged: ExplorationCardChoiceView;
        readonly gained: ExplorationCardChoiceView;
      }[];
    }
  | {
      readonly kind: "starter-card-transfiguration";
      /** Typed starter-card effect whose signed plan produced this outcome. */
      readonly sourceKind:
        "transfigure-random-starter-cards" | "transfigure-all-starter-cards";
      /** Exact persisted base-to-form mappings in prepared target order. */
      readonly transfigurations: readonly {
        readonly entryId: DeckEntryId;
        readonly cardId: CardId;
        readonly beforeTransfiguration: null;
        readonly afterTransfiguration: TransfigurationType;
        readonly before: ExplorationCardChoiceView;
        readonly after: ExplorationCardChoiceView & {
          readonly model: ExplorationCardChoiceView["model"] & {
            readonly transfiguration: NonNullable<
              ExplorationCardChoiceView["model"]["transfiguration"]
            >;
          };
        };
      }[];
    }
  | {
      readonly kind: "multi-card-transfiguration";
      /** Typed general-deck effect whose signed plan produced this outcome. */
      readonly sourceKind:
        | "transfigure-selected"
        | "transfigure-fixed-selected"
        | "transfigure-random-cards"
        | "transfigure-fixed-random-cards"
        | "transfigure-all-cards";
      /** Exact persisted base-to-form mappings in committed target order. */
      readonly transfigurations: readonly {
        readonly entryId: DeckEntryId;
        readonly cardId: CardId;
        readonly beforeTransfiguration: null;
        readonly afterTransfiguration: TransfigurationType;
        readonly before: ExplorationCardChoiceView;
        readonly after: ExplorationCardChoiceView & {
          readonly model: ExplorationCardChoiceView["model"] & {
            readonly transfiguration: NonNullable<
              ExplorationCardChoiceView["model"]["transfiguration"]
            >;
          };
        };
      }[];
    }
  | {
      readonly kind: "compound-card-mutation";
      readonly sourceKind:
        | "purge-disclosed-and-transfigure-same-type"
        | "make-predicate-fast-and-gain-nightmares"
        | "take-transfigured-cards-and-gain-nightmares"
        | "purge-one-transfigure-and-copy-others";
      /** Exact removed card snapshots, in persisted mutation order. */
      readonly purged: readonly ExplorationCardChoiceView[];
      /** Exact persisted before-to-after form mappings. */
      readonly transfigurations: readonly ExplorationTransfigurationChangeView[];
      /** Exact persisted before-to-after keyword mappings. */
      readonly keywordChanges: readonly ExplorationKeywordChangeView[];
      /** Minted Nightmare entries, reconstructed by entry UUID. */
      readonly nightmares: readonly ExplorationCardChoiceView[];
      /** Exact source-to-minted copy pairs. */
      readonly copies: readonly ExplorationCardCopyPairView[];
    }
  | {
      readonly kind: "card-type-changes";
      readonly sourceKind: "change-card-type-selected";
      /** Exact persisted before-to-after type changes in prepared target order. */
      readonly changes: readonly {
        readonly entryId: DeckEntryId;
        readonly cardId: CardId;
        readonly beforeCardType: CardType;
        readonly afterCardType: CardType;
        readonly beforeTypeChange: CardTypeChange | null;
        readonly afterTypeChange: CardTypeChange;
        readonly before: ExplorationCardChoiceView;
        readonly after: ExplorationCardChoiceView;
      }[];
    };

type ExplicitRewardKind<Reward> = Reward extends {
  readonly kind: infer Kind extends string;
}
  ? Kind
  : never;

type SemanticRewardKind<Reward> = Reward extends {
  readonly semanticKind?: infer Kind;
}
  ? Exclude<Kind, undefined>
  : never;

function essencePredicateCount(
  predicate: ExplorationPredicate,
  count: number,
): string {
  if (count === 1) {
    switch (predicate) {
      case "character":
        return "Character";
      case "event":
        return "Event";
      case "cheap-character":
        return "≤2● cost Character";
      case "legendary":
        return "legendary card";
      case "spirit-animal":
        return "Spirit Animal";
      case "survivor":
        return "Survivor";
      case "warrior":
        return "Warrior";
    }
  }
  switch (predicate) {
    case "character":
      return "Characters";
    case "event":
      return "Events";
    case "cheap-character":
      return "≤2● cost Characters";
    case "legendary":
      return "legendary cards";
    case "spirit-animal":
      return "Spirit Animals";
    case "survivor":
      return "Survivors";
    case "warrior":
      return "Warriors";
  }
}

export type ExplorationOutcomeKind =
  | ExplicitRewardKind<ExplorationRewardView>
  | SemanticRewardKind<ExplorationRewardView>
  | ExplorationDeckModificationView["kind"]
  | "objects";

interface ExplorationDeckModificationViewBase {
  /** Complete authored effect copy or fallback exposed to assistive technology. */
  readonly announcement: string;
  /** Exact post-resolution snapshots of the affected deck entries. */
  readonly cards: readonly ExplorationCardChoiceView[];
  /** Exact Reclaim cost by deck-entry UUID for the Reclaim outcome. */
  readonly reclaimCostByEntryId?: Readonly<IdentityRecord<DeckEntryId, number>>;
}

export type ExplorationDeckModificationView =
  | (ExplorationDeckModificationViewBase & {
      /** Spark amount added to each affected card. */
      readonly kind: "spark";
      readonly amount: number;
    })
  | (ExplorationDeckModificationViewBase & {
      readonly kind: "fast";
    })
  | (ExplorationDeckModificationViewBase & {
      /** Energy amount removed from each affected card's cost. */
      readonly kind: "energy-cost";
      readonly amount: number;
    })
  | (ExplorationDeckModificationViewBase & {
      /** Authored subtype selected for the affected cards, when available. */
      readonly kind: "subtype";
      readonly subtype: CardSubtype | null;
    })
  | (ExplorationDeckModificationViewBase & {
      readonly kind: "reclaim";
    })
  | (ExplorationDeckModificationViewBase & {
      /** Fixed form applied to every affected deck entry. */
      readonly kind: "transfiguration";
      readonly transfiguration: TransfigurationType;
      readonly formName: string;
      readonly essenceSpent: number;
    });

export interface ExplorationCardChoiceView<
  Id extends ExplorationCardChoiceId = DeckEntryId,
> {
  /** Deck-entry UUID for deck cards, card UUID for catalog offers. */
  entryId: Id;
  /** Complete resolved card presentation. */
  model: GameCardModel;
  /** Whether this deck entry is Nightmare, the sole Bane card. */
  isBane: boolean;
}

export type ExplorationCardChoiceId = DeckEntryId | CardId;

export type ExplorationCardSelectionOperation = CardChoiceOperation;

export type ExplorationFollowupView =
  | { readonly kind: "none" }
  | {
      readonly kind: "transfiguration";
      readonly candidates: readonly TransfigurationCandidateView[];
    }
  | {
      readonly kind: "multi-card-transfiguration";
      readonly title: string;
      readonly subtitle: string;
      readonly count: number;
      readonly candidates: readonly TransfigurationCandidateView[];
    }
  | {
      readonly kind: "cards";
      readonly title: string;
      readonly subtitle: string;
      readonly cards: readonly ExplorationCardChoiceView<DeckEntryId>[];
      readonly mode: "single" | "exact" | "purge-and-copy";
      readonly selectionKey: "entryIds";
      /** Semantic badge shown on selected deck entries. */
      readonly selectionOperation?: ExplorationCardSelectionOperation;
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly kind: "cards";
      readonly title: string;
      readonly subtitle: string;
      readonly cards: readonly ExplorationCardChoiceView<CardId>[];
      readonly mode: "single" | "exact";
      readonly selectionKey: "cardIds";
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
        readonly cards: readonly ExplorationCardChoiceView<CardId>[];
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
      readonly dreamsigns: readonly DreamsignView[];
    }
  | {
      readonly kind: "dreamsign-flow";
      readonly title: string;
      readonly subtitle: string;
      readonly mode:
        "gain-offered" | "replace-with-offered" | "purge-and-gain-random";
      /** Prepared player-visible offers. Random results are never included here. */
      readonly offered: readonly DreamsignView[];
      /** UUID-keyed collection snapshot from which purge/replacement choices come. */
      readonly held: readonly DreamsignView[];
      /** Exact number of additional held Dreamsigns that must leave for capacity. */
      readonly requiredOverflowReplacementCount: number;
    }
  | {
      readonly kind: "avatars";
      readonly title: string;
      readonly subtitle: string;
      readonly avatars: readonly Avatar[];
    }
  | {
      readonly kind: "site-types";
      readonly title: string;
      readonly subtitle: string;
      readonly choices: readonly {
        readonly siteType: ExplorationChoosableSiteType;
        readonly model: DreamscapeSiteModel;
      }[];
    };

export interface ExplorationActionView {
  readonly id: ExplorationActionId;
  readonly effectKind: ExplorationEffectKind;
  readonly mechanics: Readonly<Record<string, unknown>>;
  readonly label: string;
  readonly effectText: AnnotatedText<ExplorationEntityView>;
  /** Canonical definition for a fixed Transfiguration named by this option. */
  readonly transfigurationGlossaryId?: GlossaryEntryId;
  /** Code-authored disclosure rendered as a complete message. */
  readonly effectDisclosure?: string;
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
      readonly card: Readonly<CardData>;
      /** Prepared deck-entry UUID when this entity discloses a concrete deck object. */
      readonly entryId?: DeckEntryId;
      readonly copies?: number;
      readonly transfiguration?: CardTransfigurationDisplay;
    }
  | {
      readonly kind: "dreamsign";
      readonly dreamsign: DreamsignView;
    };

export interface ExplorationEffectFallback {
  readonly message: string;
}

export interface ExplorationSiteScreenProps {
  /** Complete presentation view-model. */
  view: ExplorationSiteView;
  /** Record the start of this client's frame-break presentation. */
  onChannel: () => void;
  /** Resolve one authored action with its UUID-only selection payload. */
  onResolve: (actionId: ExplorationActionId, selection?: unknown) => void;
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
  readonly destinationKind:
    "journey-deck" | "journey-dreamsign" | "viewport-corner";
}

function previewEntityForAction(
  action: ExplorationActionView,
): ExplorationEntityView | null {
  return Object.values(action.effectText.annotations)[0] ?? null;
}

interface ExplorationEntityDetails {
  readonly id: CardId | DreamsignId;
  readonly entryId?: DeckEntryId;
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
        ...(entity.entryId === undefined ? {} : { entryId: entity.entryId }),
        name: entity.card.name,
        copies: normalizedEntityCopies(entity.copies),
      }
    : {
        id: requireDreamsignId(entity.dreamsign, "Exploration entity preview"),
        name: entity.dreamsign.name,
        copies: 1,
      };
}

function explorationDeckModificationHeadline(
  modification: ExplorationDeckModificationView,
): string {
  switch (modification.kind) {
    case "spark":
      return `+${formatNumber(modification.amount)} ✦`;
    case "fast":
      return "Fast";
    case "energy-cost":
      return `−${formatNumber(modification.amount)} ●`;
    case "subtype":
      return modification.subtype === null
        ? "Subtype"
        : `${modification.subtype}`;
    case "reclaim":
      return "Reclaim";
    case "transfiguration":
      return `${modification.formName} · −${formatNumber(modification.essenceSpent)} Essence`;
  }
}

function preparedExplorationChoiceEntity(
  entity: ExplorationEntityView,
): ExplorationChoiceEntity {
  const details = explorationEntityDetails(entity);
  return entity.kind === "card"
    ? {
        kind: "card",
        id: entity.card.id,
        ...(details.entryId === undefined ? {} : { entryId: details.entryId }),
        copies: details.copies,
        card: {
          cardId: entity.card.id,
          displaySnapshot: entity.card,
          ...(entity.transfiguration === undefined
            ? {}
            : { transfiguration: entity.transfiguration }),
        },
      }
    : {
        kind: "dreamsign",
        id: requireDreamsignId(entity.dreamsign, "Exploration choice"),
        copies: details.copies,
        dreamsign: entity.dreamsign,
      };
}

function prepareExplorationChoiceDescription(
  message: AnnotatedText<ExplorationEntityView>,
): RichText<ExplorationChoiceEntity> {
  return richText.annotated(
    mapAnnotations(message, preparedExplorationChoiceEntity),
  );
}

type CardRewardItemKey = `card:${number}:${CardId}`;
type DreamsignRewardItemKey = `dreamsign:${number}:${DreamsignId}`;
type ExplorationRewardItemKey = CardRewardItemKey | DreamsignRewardItemKey;

type ExplorationRewardItem =
  | {
      readonly key: ExplorationRewardItemKey;
      readonly kind: "card";
      readonly id: CardId;
      readonly card: GameCardModel;
    }
  | {
      readonly key: ExplorationRewardItemKey;
      readonly kind: "dreamsign";
      readonly id: DreamsignId;
      readonly dreamsign: DreamsignView;
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
  "idle" | "fracturing" | "open" | "collapsing" | "returning";
type CollapseIntent = "preview" | "exit";
type CardCopiesPhase = "original" | "copies" | "travel";
type PurgeAndCopyPhase = "purging" | "copying";
type DreamsignMutationPhase = "purging" | "gaining";
type StarterCardMutationPhase = "purging" | "replacing" | "terminal";
type StarterCardTransfigurationPhase = "original" | "transfigured" | "terminal";
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
const DESKTOP_REPLACEMENT_DREAMSIGN_SIZE = 154;
const MOBILE_REPLACEMENT_DREAMSIGN_SIZE = 112;
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
const DESKTOP_FLOATING_PANEL_BOTTOM = `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-3xl")})`;
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
  const characters = useMemo(
    () => Array.from(narrative),
    [narrative],
  );
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
      return window.setTimeout(
        () => {
          setVisibleCharacterCount(nextCount);
        },
        (durationMs * nextCount) / characters.length,
      );
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

  const visibleNarrative = characters.slice(0, visibleCharacterCount).join("");

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
        aria-label={"Exploration choices"}
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
              data-exploration-effect-kind={action.effectKind}
              data-testid={`cumulus-exploration-choice-${String(index)}`}
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
                duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
                ease: DREAM_EASE,
              }}
              style={{
                visibility: visible ? "visible" : "hidden",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              <ExplorationChoiceControl
                model={{
                  actionId: action.id,
                  label: action.label,
                  description:
                    action.effectFallback !== undefined
                      ? richText.rules(action.effectFallback.message)
                      : prepareExplorationChoiceDescription(action.effectText),
                  disclosure: action.effectDisclosure,
                  availability:
                    visible && action.available ? "available" : "unavailable",
                  transfigurationGlossaryId: action.transfigurationGlossaryId,
                  preview: (() => {
                    const entity = previewEntityForAction(action);
                    return entity === null
                      ? undefined
                      : preparedExplorationChoiceEntity(entity);
                  })(),
                }}
                onPress={() => onActivate(action)}
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
  entryId: DeckEntryId,
  followup: ExplorationFollowupView,
  selectedEntryIds: readonly DeckEntryId[],
  purgeEntryId: DeckEntryId | null,
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
      key: cardRewardItemKey(index, card.cardId),
      kind: "card" as const,
      id: card.cardId,
      card,
    })),
    ...reward.objects.dreamsigns.map((dreamsign, index) => ({
      key: dreamsignRewardItemKey(index, dreamsign.id),
      kind: "dreamsign" as const,
      id: dreamsign.id,
      dreamsign,
    })),
  ];
}

function cardRewardItemKey(index: number, cardId: CardId): CardRewardItemKey {
  return `card:${index}:${cardId}`;
}

function dreamsignRewardItemKey(
  index: number,
  dreamsignId: DreamsignId,
): DreamsignRewardItemKey {
  return `dreamsign:${index}:${dreamsignId}`;
}

function explorationRewardIdentity(
  actionId: ExplorationActionId | null,
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
    case "direct-essence":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        reward.essenceBefore,
        reward.essenceGained,
        reward.essenceAfter,
        reward.minimumEssence ?? "fixed",
        reward.maximumEssence ?? "fixed",
      ].join("|");
    case "essence":
      return [
        actionId,
        reward.kind,
        ...reward.cards.map((card) => card.entryId),
      ].join("|");
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
    case "avatar":
      return [actionId, reward.kind, reward.current.id].join("|");
    case "site-offer-modifier":
      return [
        actionId,
        reward.kind,
        reward.modifier,
        reward.sourceSiteId,
        reward.sourceActionId,
      ].join("|");
    case "shop-modifier":
      return [
        actionId,
        reward.kind,
        reward.modifier,
        reward.sourceSiteId,
        reward.sourceActionId,
        reward.freePurchaseCount ?? "visit",
        reward.essenceBefore ?? "unchanged",
        reward.essenceSpent ?? "unchanged",
        reward.essenceAfter ?? "unchanged",
      ].join("|");
    case "site-insertion":
      return [
        actionId,
        reward.kind,
        reward.targetNodeId,
        reward.insertionIndex,
        ...reward.siblingSiteIdsBefore,
        reward.model.id,
        reward.model.type,
      ].join("|");
    case "dreamsign-mutation":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        ...reward.before.map((dreamsign) => `before:${dreamsign.id}`),
        ...reward.after.map((dreamsign) => `after:${dreamsign.id}`),
        ...reward.replacements.flatMap((pair) => [
          `removed:${pair.removed.id}`,
          `gained:${pair.gained.id}`,
        ]),
      ].join("|");
    case "nightmare-dreamsign-bundle":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        ...reward.nightmares.map(
          (card) => `nightmare:${card.entryId}:${card.model.cardId}`,
        ),
        ...reward.before.map((dreamsign) => `before:${dreamsign.id}`),
        ...reward.after.map((dreamsign) => `after:${dreamsign.id}`),
        ...reward.replacements.flatMap((pair) => [
          `removed:${pair.removed.id}`,
          `gained:${pair.gained.id}`,
        ]),
      ].join("|");
    case "starter-card-mutation":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        reward.mode,
        ...reward.purged.map(
          (card) => `purged:${card.entryId}:${card.model.cardId}`,
        ),
        ...reward.replacements.flatMap((pair) => [
          `before:${pair.purged.entryId}:${pair.purged.model.cardId}`,
          `after:${pair.gained.entryId}:${pair.gained.model.cardId}`,
        ]),
      ].join("|");
    case "card-replacements":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        ...reward.replacements.flatMap((pair) => [
          `before:${pair.purged.entryId}:${pair.purged.model.cardId}`,
          `after:${pair.gained.entryId}:${pair.gained.model.cardId}`,
        ]),
      ].join("|");
    case "starter-card-transfiguration":
    case "multi-card-transfiguration":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        ...reward.transfigurations.flatMap((mapping) => [
          mapping.entryId,
          mapping.cardId,
          mapping.beforeTransfiguration ?? "base",
          mapping.afterTransfiguration,
        ]),
      ].join("|");
    case "compound-card-mutation":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        ...reward.purged.map(
          (card) => `purged:${card.entryId}:${card.model.cardId}`,
        ),
        ...reward.transfigurations.flatMap((mapping) => [
          `transfigured:${mapping.entryId}:${mapping.cardId}:${mapping.afterTransfiguration}`,
        ]),
        ...reward.keywordChanges.flatMap((mapping) => [
          `keyword:${mapping.entryId}:${mapping.cardId}:${JSON.stringify(mapping.afterKeywordModification)}`,
        ]),
        ...reward.nightmares.map(
          (card) => `nightmare:${card.entryId}:${card.model.cardId}`,
        ),
        ...reward.copies.flatMap((pair) => [
          `copy:${pair.source.entryId}:${pair.copy.entryId}:${pair.copy.model.cardId}`,
        ]),
      ].join("|");
    case "card-type-changes":
      return [
        actionId,
        reward.kind,
        reward.sourceKind,
        ...reward.changes.flatMap((change) => [
          change.entryId,
          change.cardId,
          change.beforeCardType,
          change.afterCardType,
          JSON.stringify(change.beforeTypeChange),
          JSON.stringify(change.afterTypeChange),
        ]),
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

function visibleHudDreamsign(dreamsignId: DreamsignId): HTMLElement | null {
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

function CardReplacementPresentation({
  pair,
  index,
  reduceMotion,
  scope,
}: {
  readonly pair: Extract<
    ExplorationRewardView,
    { readonly kind: "starter-card-mutation" | "card-replacements" }
  >["replacements"][number];
  readonly index: number;
  readonly isDesktop: boolean;
  readonly reduceMotion: boolean;
  readonly scope: "starter" | "multi";
}) {
  return (
    <motion.div
      data-exploration-card-replacement=""
      data-exploration-starter-card-replacement={
        scope === "starter" ? "" : undefined
      }
      data-exploration-multi-card-replacement={
        scope === "multi" ? "" : undefined
      }
      data-purged-entry-id={pair.purged.entryId}
      data-purged-card-id={pair.purged.model.cardId}
      data-gained-entry-id={pair.gained.entryId}
      data-gained-card-id={pair.gained.model.cardId}
      role="group"
      aria-label={
        scope === "starter"
          ? `Starter card ${pair.purged.model.displaySnapshot.name} replaced by ${pair.gained.model.displaySnapshot.name}`
          : `${pair.purged.model.displaySnapshot.name} replaced by ${pair.gained.model.displaySnapshot.name}`
      }
      initial={{
        opacity: reduceMotion ? 1 : 0,
        scale: reduceMotion ? 1 : 0.86,
        y: reduceMotion ? 0 : token("--space-l"),
      }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
        duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
        ease: DREAM_EASE,
      }}
      style={{ width: "fit-content", maxWidth: "100%" }}
    >
      <CardChangePair
        model={{
          changeId: `${scope}-${pair.purged.entryId}-${pair.gained.entryId}`,
          kind: "replacement",
          before: {
            entryId: parseDeckEntryId(pair.purged.entryId),
            card: pair.purged.model,
          },
          after: {
            entryId: parseDeckEntryId(pair.gained.entryId),
            card: pair.gained.model,
          },
        }}
        reveal="complete"
      />
    </motion.div>
  );
}

function CardTransfigurationPairPresentation({
  mapping,
  index,
  phase,
  reduceMotion,
  scope,
}: {
  readonly mapping: Extract<
    ExplorationRewardView,
    {
      readonly kind:
        | "starter-card-transfiguration"
        | "multi-card-transfiguration"
        | "compound-card-mutation";
    }
  >["transfigurations"][number];
  readonly index: number;
  readonly phase: StarterCardTransfigurationPhase;
  readonly isDesktop: boolean;
  readonly reduceMotion: boolean;
  readonly scope: "starter" | "multi" | "compound";
}) {
  const revealAfter = phase !== "original";
  return (
    <motion.div
      data-exploration-card-transfiguration-pair=""
      data-exploration-starter-card-transfiguration-pair={
        scope === "starter" ? "" : undefined
      }
      data-exploration-multi-card-transfiguration-pair={
        scope === "multi" ? "" : undefined
      }
      data-exploration-compound-card-transfiguration-pair={
        scope === "compound" ? "" : undefined
      }
      data-exploration-deck-entry-id={mapping.entryId}
      data-card-id={mapping.cardId}
      data-before-transfiguration="none"
      data-after-transfiguration={mapping.afterTransfiguration}
      data-after-form-name={mapping.after.model.transfiguration.form.name}
      role="group"
      aria-label={
        scope === "starter"
          ? `Starter card ${mapping.before.model.displaySnapshot.name} transfigured into its ${mapping.after.model.transfiguration.form.name} form`
          : `${mapping.before.model.displaySnapshot.name} transfigured into its ${mapping.after.model.transfiguration.form.name} form`
      }
      initial={{
        opacity: reduceMotion ? 1 : 0,
        y: reduceMotion ? 0 : token("--space-l"),
      }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
        duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
        ease: DREAM_EASE,
      }}
      style={{ width: "fit-content", maxWidth: "100%" }}
    >
      <CardChangePair
        model={{
          changeId: `${scope}-${mapping.entryId}-${mapping.afterTransfiguration}`,
          kind: "transfiguration",
          before: { entryId: mapping.entryId, card: mapping.before.model },
          after: { entryId: mapping.entryId, card: mapping.after.model },
        }}
        reveal={revealAfter ? "complete" : "before"}
      />
    </motion.div>
  );
}

function CompoundCardPairPresentation({
  before,
  after,
  index,
  kind,
  reduceMotion,
}: {
  readonly before: ExplorationCardChoiceView;
  readonly after: ExplorationCardChoiceView;
  readonly index: number;
  readonly kind: "keyword" | "copy";
  readonly isDesktop: boolean;
  readonly reduceMotion: boolean;
}) {
  return (
    <motion.div
      data-exploration-compound-card-pair={kind}
      data-source-entry-id={before.entryId}
      data-source-card-id={before.model.cardId}
      data-result-entry-id={after.entryId}
      data-result-card-id={after.model.cardId}
      role="group"
      aria-label={
        kind === "keyword"
          ? `${before.model.displaySnapshot.name} became Fast as ${after.model.displaySnapshot.name}`
          : `${before.model.displaySnapshot.name} copied as ${after.model.displaySnapshot.name}`
      }
      initial={{
        opacity: reduceMotion ? 1 : 0,
        y: reduceMotion ? 0 : token("--space-l"),
      }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
        duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
        ease: DREAM_EASE,
      }}
      style={{ width: "fit-content", maxWidth: "100%" }}
    >
      <CardChangePair
        model={{
          changeId: `${kind}-${before.entryId}-${after.entryId}`,
          kind,
          before: {
            entryId: parseDeckEntryId(before.entryId),
            card: before.model,
          },
          after: {
            entryId: parseDeckEntryId(after.entryId),
            card: after.model,
          },
        }}
        reveal="complete"
      />
    </motion.div>
  );
}

function CardTypeChangePairPresentation({
  change,
  index,
  phase,
  reduceMotion,
}: {
  readonly change: Extract<
    ExplorationRewardView,
    { readonly kind: "card-type-changes" }
  >["changes"][number];
  readonly index: number;
  readonly phase: StarterCardTransfigurationPhase;
  readonly isDesktop: boolean;
  readonly reduceMotion: boolean;
}) {
  const revealAfter = phase !== "original";
  return (
    <motion.div
      data-exploration-card-type-change-pair=""
      data-exploration-deck-entry-id={change.entryId}
      data-card-id={change.cardId}
      data-before-card-type={change.beforeCardType}
      data-after-card-type={change.afterCardType}
      data-before-type-change-predicate-id={
        change.beforeTypeChange?.predicateId ?? "none"
      }
      data-after-type-change-predicate-id={change.afterTypeChange.predicateId}
      role="group"
      aria-label={`${change.before.model.displaySnapshot.name} changed from ${change.beforeCardType} to ${change.afterCardType}`}
      initial={{
        opacity: reduceMotion ? 1 : 0,
        y: reduceMotion ? 0 : token("--space-l"),
      }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
        duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
        ease: DREAM_EASE,
      }}
      style={{ width: "fit-content", maxWidth: "100%" }}
    >
      <CardChangePair
        model={{
          changeId: `card-type-${change.entryId}-${change.afterCardType}`,
          kind: "card-type",
          before: { entryId: change.entryId, card: change.before.model },
          after: { entryId: change.entryId, card: change.after.model },
        }}
        reveal={revealAfter ? "complete" : "before"}
      />
    </motion.div>
  );
}

function DreamsignReplacementPresentation({
  removed,
  gained,
  index,
  isDesktop,
  reduceMotion,
}: {
  readonly removed: DreamsignView;
  readonly gained: DreamsignView;
  readonly index: number;
  readonly isDesktop: boolean;
  readonly reduceMotion: boolean;
}) {
  const dreamsignSize = isDesktop
    ? DESKTOP_REPLACEMENT_DREAMSIGN_SIZE
    : MOBILE_REPLACEMENT_DREAMSIGN_SIZE;
  return (
    <motion.div
      data-exploration-dreamsign-replacement=""
      data-removed-dreamsign-id={removed.id}
      data-gained-dreamsign-id={gained.id}
      role="group"
      aria-label={`${removed.name} replaced by ${gained.name}`}
      initial={{
        opacity: reduceMotion ? 1 : 0,
        scale: reduceMotion ? 1 : 0.86,
        y: reduceMotion ? 0 : token("--space-l"),
      }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
        duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
        ease: DREAM_EASE,
      }}
      style={{
        width: "fit-content",
        maxWidth: "100%",
      }}
    >
      <GlassPanel
        radius="popover"
        testId={`cumulus-exploration-dreamsign-replacement-${String(index)}`}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: isDesktop ? token("--space-m") : token("--space-xs"),
            padding: isDesktop ? token("--space-m") : token("--space-s"),
          }}
        >
          <div
            style={{
              width: dreamsignSize,
              minWidth: 0,
              display: "grid",
              justifyItems: "center",
              gap: token("--space-xs"),
            }}
          >
            <div
              data-exploration-dreamsign-mutation-object="removed"
              data-dreamsign-id={removed.id}
              style={{ width: dreamsignSize, height: dreamsignSize }}
            >
              <Dreamsign
                dreamsign={removed}
                variant="revelation"
                testid={`cumulus-exploration-dreamsign-mutation-removed-${removed.id}`}
              />
            </div>
            <strong
              aria-hidden="true"
              style={{
                width: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "center",
                font: token("--t-caption"),
                color: token("--text-on-glass"),
              }}
            >
              {removed.name}
            </strong>
          </div>
          <span
            data-exploration-dreamsign-replacement-arrow=""
            aria-hidden="true"
            style={{
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              fontSize: isDesktop ? 30 : 24,
            }}
          >
            <StandaloneGlyph glyph={GLYPHS.arrowRightFilled} color="white" />
          </span>
          <div
            style={{
              width: dreamsignSize,
              minWidth: 0,
              display: "grid",
              justifyItems: "center",
              gap: token("--space-xs"),
            }}
          >
            <div
              data-exploration-dreamsign-mutation-object="gained"
              data-dreamsign-id={gained.id}
              style={{ width: dreamsignSize, height: dreamsignSize }}
            >
              <Dreamsign
                dreamsign={gained}
                variant="revelation"
                testid={`cumulus-exploration-dreamsign-mutation-gained-${gained.id}`}
              />
            </div>
            <strong
              aria-hidden="true"
              style={{
                width: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "center",
                font: token("--t-caption"),
                color: token("--text-on-glass"),
              }}
            >
              {gained.name}
            </strong>
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

function ExplorationDreamsignChoiceGroup({
  heading,
  role,
  dreamsigns,
  selectedIds,
  isDesktop,
  onChoose,
}: {
  readonly heading: string;
  readonly role: "offered" | "exchange" | "purge" | "replacement";
  readonly dreamsigns: readonly DreamsignView[];
  readonly selectedIds: readonly DreamsignId[];
  readonly isDesktop: boolean;
  readonly onChoose: (dreamsignId: DreamsignId) => void;
}) {
  return (
    <section
      data-dreamsign-choice-role={role}
      aria-label={heading}
      style={{
        display: "grid",
        gap: token("--space-s"),
        minWidth: 0,
      }}
    >
      <strong
        style={{
          font: token("--t-caption"),
          color: token("--text-on-glass"),
          textAlign: "center",
        }}
      >
        {heading}
      </strong>
      <div
        role="group"
        aria-label={heading}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${String(isDesktop ? DESKTOP_DREAMSIGN_CHOICE_SIZE : MOBILE_DREAMSIGN_CHOICE_SIZE)}px, 1fr))`,
          gap: isDesktop ? token("--space-xl") : token("--space-m"),
          placeItems: "center",
          minWidth: 0,
        }}
      >
        {dreamsigns.map((dreamsign) => {
          const selected = selectedIds.includes(dreamsign.id);
          return (
            <div
              key={dreamsign.id}
              data-dreamsign-choice-id={dreamsign.id}
              data-dreamsign-choice-selected={selected ? "true" : "false"}
              style={{
                width: isDesktop
                  ? DESKTOP_DREAMSIGN_CHOICE_SIZE
                  : MOBILE_DREAMSIGN_CHOICE_SIZE,
                height: isDesktop
                  ? DESKTOP_DREAMSIGN_CHOICE_SIZE
                  : MOBILE_DREAMSIGN_CHOICE_SIZE,
                padding: token("--space-xs"),
                borderRadius: token("--radius-panel"),
                background: selected
                  ? token("--glass-on-glass-fill")
                  : "transparent",
                boxShadow: selected ? token("--glow-accent-soft") : "none",
              }}
            >
              <Dreamsign
                dreamsign={dreamsign}
                variant="revelation"
                testid={`cumulus-exploration-dreamsign-${role}-${dreamsign.id}`}
                onPress={() => onChoose(dreamsign.id)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function useCardTrajectory(
  targetRef: RefObject<HTMLDivElement | null>,
  cardId: CardId,
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
  const layout = isDesktop ? "desktop" : "mobile";
  const cardTargetRef = useRef<HTMLDivElement>(null);
  const exitCompletedRef = useRef(false);
  const resumedResolutionRef = useRef<string | null>(null);
  const rewardItemRefs = useRef(
    new Map<ExplorationRewardItemKey, HTMLDivElement>(),
  );
  const cardCopyRefs = useRef(new Map<DeckEntryId, HTMLDivElement>());
  const transfigurationCardRef = useRef<HTMLDivElement>(null);
  const starterCardTransfigurationPairsRef = useRef<HTMLElement>(null);
  const cardReplacementPairsRef = useRef<HTMLElement>(null);
  const dreamsignFlowRef = useRef<HTMLDivElement>(null);
  const completedRewardItemsRef = useRef(new Set<ExplorationRewardItemKey>());
  const completedCardCopyItemsRef = useRef(new Set<DeckEntryId>());
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
  const [activeActionId, setActiveActionId] =
    useState<ExplorationActionId | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<
    readonly DeckEntryId[]
  >([]);
  const [selectedCardIds, setSelectedCardIds] = useState<readonly CardId[]>([]);
  const [selectedOfferedDreamsignId, setSelectedOfferedDreamsignId] =
    useState<DreamsignId | null>(null);
  const [selectedPurgedDreamsignId, setSelectedPurgedDreamsignId] =
    useState<DreamsignId | null>(null);
  const [selectedDreamsignReplacementIds, setSelectedDreamsignReplacementIds] =
    useState<readonly DreamsignId[]>([]);
  const [purgeEntryId, setPurgeEntryId] = useState<DeckEntryId | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [selectedTransfigurationEntryId, setSelectedTransfigurationEntryId] =
    useState<DeckEntryId | null>(null);
  const [selectedTransfigurationFormType, setSelectedTransfigurationFormType] =
    useState<TransfigurationType | null>(null);
  const [multiTransfigurationStep, setMultiTransfigurationStep] = useState<
    number | null
  >(null);
  const [multiTransfigurationForms, setMultiTransfigurationForms] = useState<
    Readonly<IdentityRecord<DeckEntryId, TransfigurationType>>
  >({});
  const [transfigurationConfirming, setTransfigurationConfirming] =
    useState(false);
  const [rewardTrajectories, setRewardTrajectories] = useState<ReadonlyMap<
    ExplorationRewardItemKey,
    RewardTrajectory
  > | null>(null);
  const [cardCopiesPhase, setCardCopiesPhase] =
    useState<CardCopiesPhase>("original");
  const [purgeAndCopyPhase, setPurgeAndCopyPhase] =
    useState<PurgeAndCopyPhase>("purging");
  const [cardCopyTrajectories, setCardCopyTrajectories] = useState<ReadonlyMap<
    DeckEntryId,
    RewardTrajectory
  > | null>(null);
  const [essenceRewardPhase, setEssenceRewardPhase] = useState<
    "cards" | "announcement"
  >("cards");
  const [dreamsignPurgeRewardPhase, setDreamsignPurgeRewardPhase] = useState<
    "purging" | "announcement"
  >("purging");
  const [cardPurgeRewardPhase, setCardPurgeRewardPhase] = useState<
    "purging" | "announcement"
  >("purging");
  const [dreamsignMutationPhase, setDreamsignMutationPhase] =
    useState<DreamsignMutationPhase>("purging");
  const [starterCardMutationPhase, setStarterCardMutationPhase] =
    useState<StarterCardMutationPhase>("purging");
  const [cardReplacementReviewed, setCardReplacementReviewed] = useState(false);
  const [starterCardTransfigurationPhase, setStarterCardTransfigurationPhase] =
    useState<StarterCardTransfigurationPhase>("original");
  const [
    starterCardTransfigurationReviewed,
    setStarterCardTransfigurationReviewed,
  ] = useState(false);
  const [deckModificationPresented, setDeckModificationPresented] =
    useState(false);
  const [purgedCardsPresented, setPurgedCardsPresented] = useState(false);
  const [transfigurationRevealed, setTransfigurationRevealed] = useState(false);
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
  const essenceReward = effectReward?.kind === "essence" ? effectReward : null;
  const directEssenceReward =
    effectReward?.kind === "direct-essence" ? effectReward : null;
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
  const cardCopyItems = useMemo(() => {
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
  }, [cardCopiesReward]);
  const battleModifierReward =
    effectReward?.kind === "battle-modifier" ? effectReward : null;
  const smallerHandDiscountReward =
    effectReward?.kind === "smaller-hand-and-cost-discount"
      ? effectReward
      : null;
  const avatarReward = effectReward?.kind === "avatar" ? effectReward : null;
  const siteOfferModifierReward =
    effectReward?.kind === "site-offer-modifier" ? effectReward : null;
  const shopModifierReward =
    effectReward?.kind === "shop-modifier" ? effectReward : null;
  const siteInsertionReward =
    effectReward?.kind === "site-insertion" ? effectReward : null;
  const dreamsignMutationReward =
    effectReward?.kind === "dreamsign-mutation" ? effectReward : null;
  const nightmareDreamsignBundleReward =
    effectReward?.kind === "nightmare-dreamsign-bundle" ? effectReward : null;
  const starterCardMutationReward =
    effectReward?.kind === "starter-card-mutation" ? effectReward : null;
  const cardReplacementReward =
    effectReward?.kind === "card-replacements" ? effectReward : null;
  const compoundCardReplacementReward =
    starterCardMutationReward?.mode === "replace"
      ? starterCardMutationReward
      : cardReplacementReward;
  const starterCardTransfigurationReward =
    effectReward?.kind === "starter-card-transfiguration" ? effectReward : null;
  const multiCardTransfigurationReward =
    effectReward?.kind === "multi-card-transfiguration" ? effectReward : null;
  const compoundCardMutationReward =
    effectReward?.kind === "compound-card-mutation" ? effectReward : null;
  const compoundTransfigurationReward =
    starterCardTransfigurationReward ?? multiCardTransfigurationReward;
  const cardTypeChangesReward =
    effectReward?.kind === "card-type-changes" ? effectReward : null;
  const compoundCardChangeReward =
    compoundTransfigurationReward ?? cardTypeChangesReward;
  const compoundReviewReward =
    compoundCardChangeReward ?? compoundCardMutationReward;
  const compoundCardChangeCount =
    compoundCardMutationReward !== null
      ? compoundCardMutationReward.purged.length +
        compoundCardMutationReward.transfigurations.length +
        compoundCardMutationReward.keywordChanges.length +
        compoundCardMutationReward.nightmares.length +
        compoundCardMutationReward.copies.length
      : compoundCardChangeReward?.kind === "card-type-changes"
        ? compoundCardChangeReward.changes.length
        : (compoundCardChangeReward?.transfigurations.length ?? 0);
  const unpairedDreamsignGains = useMemo(() => {
    if (dreamsignMutationReward === null) return [];
    const replacementGainedIds = new Set(
      dreamsignMutationReward.replacements.map((pair) => pair.gained.id),
    );
    return dreamsignMutationReward.gained.filter(
      (dreamsign) => !replacementGainedIds.has(dreamsign.id),
    );
  }, [dreamsignMutationReward]);
  const unpairedBundleDreamsignGains = useMemo(() => {
    if (nightmareDreamsignBundleReward === null) return [];
    const replacementGainedIds = new Set(
      nightmareDreamsignBundleReward.replacements.map((pair) => pair.gained.id),
    );
    return nightmareDreamsignBundleReward.gained.filter(
      (dreamsign) => !replacementGainedIds.has(dreamsign.id),
    );
  }, [nightmareDreamsignBundleReward]);
  const rewardItems = useMemo(() => rewardItemsFor(view.reward), [view.reward]);
  const purgeBeforeDeckModification =
    deckModification !== null && purgedRewardCards.length > 0;
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
  const emptyObjectOutcomeMessage: string =
    resolvedReward?.semanticKind === "card-purge"
      ? "No cards were purged"
      : "No cards were taken";
  const rewardStageAnnouncement =
    purgedRewardCards.length === 0
      ? rewardItems.length === 1
        ? `Gained ${formatNumber(rewardItems.length)} Reward`
        : `Gained ${formatNumber(rewardItems.length)} Rewards`
      : rewardItems.length === 0
        ? purgedRewardCards.length === 1
          ? `Purging ${formatNumber(purgedRewardCards.length)} Card`
          : `Purging ${formatNumber(purgedRewardCards.length)} Cards`
        : `Cards being purged: ${formatNumber(purgedRewardCards.length)}. Rewards being gained: ${formatNumber(rewardItems.length)}.`;
  const rewardIdentity = explorationRewardIdentity(
    view.resolvedActionId,
    view.reward,
  );
  const portraitFullArt =
    fullArtDimensions !== null &&
    fullArtDimensions.height > fullArtDimensions.width;
  const expandedArtRect =
    frameBreakGeometry !== null && portraitFullArt && fullArtDimensions !== null
      ? containedArtRect(frameBreakGeometry.viewport, fullArtDimensions)
      : frameBreakGeometry?.viewport;
  useEffect(() => {
    if (view.resolvedActionId === null) return;
    setActiveActionId(null);
    setSelectedEntryIds([]);
    setSelectedCardIds([]);
    setSelectedOfferedDreamsignId(null);
    setSelectedPurgedDreamsignId(null);
    setSelectedDreamsignReplacementIds([]);
    setPurgeEntryId(null);
    setSelectedSubtype(null);
    setSelectedTransfigurationEntryId(null);
    setSelectedTransfigurationFormType(null);
    setMultiTransfigurationStep(null);
    setMultiTransfigurationForms({});
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
    setDreamsignMutationPhase(
      reduceMotion || dreamsignMutationReward?.purged.length === 0
        ? "gaining"
        : "purging",
    );
    setStarterCardMutationPhase(
      reduceMotion
        ? "terminal"
        : cardReplacementReward === null
          ? "purging"
          : "replacing",
    );
    setStarterCardTransfigurationPhase(reduceMotion ? "terminal" : "original");
    setDeckModificationPresented(false);
    setPurgedCardsPresented(false);
    setTransfigurationRevealed(false);
    setTransfigurationReturn(null);
  }, [
    cardReplacementReward,
    dreamsignMutationReward?.purged.length,
    reduceMotion,
    rewardIdentity,
  ]);

  useLayoutEffect(() => {
    setCardReplacementReviewed(false);
    setStarterCardTransfigurationReviewed(false);
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
        setSelectedEntryIds([]);
        setSelectedCardIds([]);
        setSelectedOfferedDreamsignId(null);
        setSelectedPurgedDreamsignId(null);
        setSelectedDreamsignReplacementIds([]);
        setPurgeEntryId(null);
        setSelectedTransfigurationEntryId(null);
        setSelectedTransfigurationFormType(null);
        setMultiTransfigurationStep(null);
        setMultiTransfigurationForms({});
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
  }, [
    activeAction,
    frameBreakGeometry,
    frameBreakPhase,
    reduceMotion,
    view.resolvedActionId,
    view.reward,
  ]);

  const startFrameBreak = (): void => {
    const geometry = measureFrameBreak(cardTargetRef.current);
    if (geometry === null) return;
    setFrameBreakGeometry(geometry);
    setCollapseIntent("preview");
    setFrameBreakActive(true);
    setFrameBreakPhase(reduceMotion ? "open" : "fracturing");
    onChannel();
  };

  const completeExit = useCallback((): void => {
    if (exitCompletedRef.current) return;
    exitCompletedRef.current = true;
    onExit();
  }, [onExit]);

  useEffect(() => {
    if (siteInsertionReward === null || frameBreakPhase !== "open") return;
    const timer = window.setTimeout(
      completeExit,
      REWARD_READING_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [completeExit, frameBreakPhase, siteInsertionReward]);

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
    const timer = window.setTimeout(
      () => {
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
      },
      (TRANSFIGURATION_FLIP_SECONDS + TRANSFIGURATION_READING_SECONDS) * 1_000,
    );
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
      const trajectories = new Map<
        ExplorationRewardItemKey,
        RewardTrajectory
      >();
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
    if (directEssenceReward === null || frameBreakPhase !== "open") return;
    const timer = window.setTimeout(
      completeExit,
      RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [completeExit, directEssenceReward, frameBreakPhase]);

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
  }, [completeExit, essenceReward, essenceRewardPhase, frameBreakPhase]);

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
      dreamsignMutationReward === null ||
      dreamsignMutationReward.purged.length === 0 ||
      frameBreakPhase !== "open" ||
      dreamsignMutationPhase !== "purging"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setDreamsignMutationPhase("gaining"),
      reduceMotion ? 0 : DREAMSIGN_PURGE_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    dreamsignMutationPhase,
    dreamsignMutationReward,
    frameBreakPhase,
    reduceMotion,
  ]);

  useEffect(() => {
    if (
      dreamsignMutationReward === null ||
      frameBreakPhase !== "open" ||
      dreamsignMutationPhase !== "gaining"
    ) {
      return;
    }
    const timer = window.setTimeout(
      completeExit,
      REWARD_READING_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    dreamsignMutationPhase,
    dreamsignMutationReward,
    frameBreakPhase,
  ]);

  useEffect(() => {
    if (nightmareDreamsignBundleReward === null || frameBreakPhase !== "open") {
      return;
    }
    const timer = window.setTimeout(
      completeExit,
      REWARD_READING_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [completeExit, frameBreakPhase, nightmareDreamsignBundleReward]);

  useEffect(() => {
    if (
      starterCardMutationReward === null ||
      frameBreakPhase !== "open" ||
      starterCardMutationPhase !== "purging"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () =>
        setStarterCardMutationPhase(
          starterCardMutationReward.replacements.length > 0
            ? "replacing"
            : "terminal",
        ),
      reduceMotion ? 0 : REWARD_READING_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    frameBreakPhase,
    reduceMotion,
    starterCardMutationPhase,
    starterCardMutationReward,
  ]);

  useEffect(() => {
    if (
      compoundReviewReward === null ||
      frameBreakPhase !== "open" ||
      starterCardTransfigurationPhase !== "original"
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => setStarterCardTransfigurationPhase("transfigured"),
      reduceMotion ? 0 : TRANSFIGURATION_ORIGINAL_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    frameBreakPhase,
    reduceMotion,
    starterCardTransfigurationPhase,
    compoundReviewReward,
  ]);

  useLayoutEffect(() => {
    if (compoundReviewReward === null || frameBreakPhase !== "open") {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      const pairs = starterCardTransfigurationPairsRef.current;
      if (pairs === null) return;
      setStarterCardTransfigurationReviewed(
        pairs.scrollHeight <= pairs.clientHeight + 1,
      );
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [frameBreakPhase, compoundReviewReward, starterCardTransfigurationPhase]);

  useEffect(() => {
    if (
      compoundReviewReward === null ||
      frameBreakPhase !== "open" ||
      starterCardTransfigurationPhase === "original" ||
      !starterCardTransfigurationReviewed
    ) {
      return;
    }
    const finalStagger =
      Math.max(0, compoundCardChangeCount - 1) * REWARD_STAGGER_SECONDS;
    const timer = window.setTimeout(
      completeExit,
      (reduceMotion
        ? REWARD_READING_SECONDS
        : Math.min(finalStagger, REWARD_STAGGER_SECONDS * 3) +
          FLIP_SECONDS +
          REWARD_READING_SECONDS) * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    frameBreakPhase,
    reduceMotion,
    starterCardTransfigurationReviewed,
    starterCardTransfigurationPhase,
    compoundCardChangeCount,
    compoundReviewReward,
  ]);

  useEffect(() => {
    if (
      starterCardMutationReward === null ||
      frameBreakPhase !== "open" ||
      starterCardMutationPhase === "purging" ||
      starterCardMutationReward.replacements.length > 0
    ) {
      return;
    }
    const timer = window.setTimeout(
      completeExit,
      REWARD_READING_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    completeExit,
    frameBreakPhase,
    starterCardMutationPhase,
    starterCardMutationReward,
  ]);

  useLayoutEffect(() => {
    if (
      compoundCardReplacementReward === null ||
      frameBreakPhase !== "open" ||
      starterCardMutationPhase === "purging"
    ) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      const pairs = cardReplacementPairsRef.current;
      if (pairs === null) return;
      setCardReplacementReviewed(pairs.scrollHeight <= pairs.clientHeight + 1);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    compoundCardReplacementReward,
    frameBreakPhase,
    starterCardMutationPhase,
  ]);

  useEffect(() => {
    if (
      compoundCardReplacementReward === null ||
      frameBreakPhase !== "open" ||
      starterCardMutationPhase === "purging" ||
      !cardReplacementReviewed
    ) {
      return;
    }
    const finalStagger =
      Math.max(0, compoundCardReplacementReward.replacements.length - 1) *
      REWARD_STAGGER_SECONDS;
    const timer = window.setTimeout(
      completeExit,
      (reduceMotion
        ? REWARD_READING_SECONDS *
          compoundCardReplacementReward.replacements.length
        : finalStagger +
          REWARD_READING_SECONDS *
            compoundCardReplacementReward.replacements.length) * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [
    cardReplacementReviewed,
    completeExit,
    compoundCardReplacementReward,
    frameBreakPhase,
    reduceMotion,
    starterCardMutationPhase,
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
  }, [cardPurgeReward, cardPurgeRewardPhase, completeExit, frameBreakPhase]);

  useEffect(() => {
    if (
      frameBreakPhase !== "open" ||
      (battleModifierReward === null &&
        smallerHandDiscountReward === null &&
        avatarReward === null &&
        siteOfferModifierReward === null &&
        shopModifierReward === null &&
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
    avatarReward,
    emptyObjectOutcome,
    frameBreakPhase,
    siteOfferModifierReward,
    shopModifierReward,
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
      const trajectories = new Map<DeckEntryId, RewardTrajectory>();
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

  const finishRewardItem = (itemKey: ExplorationRewardItemKey): void => {
    completedRewardItemsRef.current.add(itemKey);
    if (
      completedRewardItemsRef.current.size >=
      (rewardTrajectories?.size ?? Number.POSITIVE_INFINITY)
    ) {
      completeExit();
    }
  };

  const finishCardCopyItem = (entryId: DeckEntryId): void => {
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
    setSelectedEntryIds([]);
    setSelectedCardIds([]);
    setSelectedOfferedDreamsignId(null);
    setSelectedPurgedDreamsignId(null);
    setSelectedDreamsignReplacementIds([]);
    setPurgeEntryId(null);
    setSelectedSubtype(null);
    setSelectedTransfigurationEntryId(null);
    setSelectedTransfigurationFormType(null);
    setMultiTransfigurationStep(null);
    setMultiTransfigurationForms({});
    setTransfigurationConfirming(false);
  };

  const toggleDeckEntry = (entryId: DeckEntryId): void => {
    if (activeAction?.followup.kind === "multi-card-transfiguration") {
      if (multiTransfigurationStep !== null) return;
      const followup = activeAction.followup;
      if (selectedEntryIds.includes(entryId)) {
        setSelectedEntryIds((current) =>
          current.filter((candidate) => candidate !== entryId),
        );
        setMultiTransfigurationForms((forms) => {
          const remaining = { ...forms };
          delete remaining[entryId];
          return remaining;
        });
      } else if (selectedEntryIds.length < followup.count) {
        setSelectedEntryIds((current) => [...current, entryId]);
      }
      return;
    }
    if (
      activeAction?.followup.kind !== "cards" ||
      activeAction.followup.selectionKey !== "entryIds"
    )
      return;
    const followup = activeAction.followup;
    if (followup.mode === "purge-and-copy") {
      if (purgeEntryId === null) {
        setPurgeEntryId(entryId);
        setSelectedEntryIds([]);
      } else if (entryId === purgeEntryId) {
        setPurgeEntryId(null);
        setSelectedEntryIds([]);
      } else {
        setSelectedEntryIds((current) =>
          current.includes(entryId) ? [] : [entryId],
        );
      }
      return;
    }
    setSelectedEntryIds((current) => {
      if (current.includes(entryId)) {
        return current.filter((candidate) => candidate !== entryId);
      }
      if (followup.mode === "single") return [entryId];
      if (current.length >= followup.max) return current;
      return [...current, entryId];
    });
  };

  const toggleCatalogCard = (cardId: CardId): void => {
    if (
      activeAction?.followup.kind !== "cards" ||
      activeAction.followup.selectionKey !== "cardIds"
    )
      return;
    const followup = activeAction.followup;
    setSelectedCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((candidate) => candidate !== cardId);
      }
      if (followup.mode === "single") return [cardId];
      if (current.length >= followup.max) return current;
      return [...current, cardId];
    });
  };

  const commitFollowup = (): void => {
    if (activeAction === null) return;
    const followup = activeAction.followup;
    if (followup.kind === "cards") {
      if (followup.mode === "purge-and-copy") {
        const copyEntryId = selectedEntryIds[0];
        if (purgeEntryId === null || copyEntryId === undefined) return;
        onResolve(activeAction.id, {
          purgeEntryId,
          copyEntryId,
        });
        return;
      }
      const selectedIds =
        followup.selectionKey === "entryIds"
          ? selectedEntryIds
          : selectedCardIds;
      if (
        selectedIds.length < followup.min ||
        selectedIds.length > followup.max
      )
        return;
      onResolve(activeAction.id, {
        [followup.selectionKey]: selectedIds,
      });
      return;
    }
    if (followup.kind === "multi-card-transfiguration") {
      if (
        multiTransfigurationStep !== null ||
        selectedEntryIds.length !== followup.count
      ) {
        return;
      }
      setMultiTransfigurationStep(0);
      return;
    }
    if (followup.kind === "subtypes") {
      if (selectedSubtype === null) return;
      onResolve(activeAction.id, {
        subtype: selectedSubtype,
      });
      return;
    }
  };

  const chooseDreamsign = (dreamsignId: DreamsignId): void => {
    if (activeAction?.followup.kind !== "dreamsigns") return;
    onResolve(activeAction.id, {
      [activeAction.followup.selectionKey]: dreamsignId,
    });
  };

  const dreamsignFlow =
    activeAction?.followup.kind === "dreamsign-flow"
      ? activeAction.followup
      : null;
  const dreamsignFlowStep =
    dreamsignFlow?.mode === "gain-offered"
      ? selectedOfferedDreamsignId === null
        ? "offered"
        : "replacement"
      : dreamsignFlow?.mode === "purge-and-gain-random"
        ? selectedPurgedDreamsignId === null
          ? "purge"
          : "overflow"
        : dreamsignFlow?.mode === "replace-with-offered"
          ? "exchange"
          : null;

  useEffect(() => {
    if (dreamsignFlowStep === null) return;
    const frame = window.requestAnimationFrame(() => {
      const role =
        dreamsignFlowStep === "replacement" || dreamsignFlowStep === "overflow"
          ? "replacement"
          : dreamsignFlowStep;
      dreamsignFlowRef.current
        ?.querySelector<HTMLElement>(
          `[data-dreamsign-choice-role="${role}"] [role="button"]`,
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dreamsignFlowStep]);

  const chooseOfferedDreamsign = (dreamsignId: DreamsignId): void => {
    if (activeAction === null || dreamsignFlow === null) return;
    if (
      dreamsignFlow.mode === "gain-offered" &&
      dreamsignFlow.requiredOverflowReplacementCount === 0
    ) {
      onResolve(activeAction.id, {
        offeredDreamsignId: dreamsignId,
      });
      return;
    }
    setSelectedOfferedDreamsignId((current) =>
      current === dreamsignId ? null : dreamsignId,
    );
  };

  const chooseHeldDreamsign = (dreamsignId: DreamsignId): void => {
    if (activeAction === null || dreamsignFlow === null) return;
    if (
      dreamsignFlow.mode === "purge-and-gain-random" &&
      selectedPurgedDreamsignId === null
    ) {
      if (dreamsignFlow.requiredOverflowReplacementCount === 0) {
        onResolve(activeAction.id, {
          purgedDreamsignId: dreamsignId,
          overflowReplacementDreamsignIds: [],
        });
        return;
      }
      setSelectedPurgedDreamsignId(dreamsignId);
      setSelectedDreamsignReplacementIds([]);
      return;
    }
    const required =
      dreamsignFlow.mode === "replace-with-offered"
        ? 1
        : dreamsignFlow.requiredOverflowReplacementCount;
    setSelectedDreamsignReplacementIds((current) => {
      if (current.includes(dreamsignId)) {
        return current.filter((candidate) => candidate !== dreamsignId);
      }
      if (current.length >= required) return current;
      return [...current, dreamsignId];
    });
  };

  const commitDreamsignFlow = (): void => {
    if (activeAction === null || dreamsignFlow === null) return;
    if (
      dreamsignFlow.mode === "gain-offered" ||
      dreamsignFlow.mode === "replace-with-offered"
    ) {
      const replacedDreamsignId = selectedDreamsignReplacementIds[0];
      if (
        selectedOfferedDreamsignId === null ||
        (dreamsignFlow.mode === "replace-with-offered" &&
          replacedDreamsignId === undefined) ||
        (dreamsignFlow.mode === "gain-offered" &&
          dreamsignFlow.requiredOverflowReplacementCount > 0 &&
          replacedDreamsignId === undefined)
      ) {
        return;
      }
      onResolve(activeAction.id, {
        offeredDreamsignId: selectedOfferedDreamsignId,
        ...(replacedDreamsignId === undefined
          ? {}
          : { replacedDreamsignId: replacedDreamsignId }),
      });
      return;
    }
    if (
      selectedPurgedDreamsignId === null ||
      selectedDreamsignReplacementIds.length !==
        dreamsignFlow.requiredOverflowReplacementCount
    ) {
      return;
    }
    onResolve(activeAction.id, {
      purgedDreamsignId: selectedPurgedDreamsignId,
      overflowReplacementDreamsignIds: selectedDreamsignReplacementIds,
    });
  };

  const canCommitFollowup = (() => {
    const followup = activeAction?.followup;
    if (followup === undefined || followup.kind === "none") return false;
    if (followup.kind === "transfiguration") return false;
    if (followup.kind === "multi-card-transfiguration") {
      return (
        multiTransfigurationStep === null &&
        selectedEntryIds.length === followup.count
      );
    }
    if (followup.kind === "cards") {
      const selectedCount =
        followup.selectionKey === "entryIds"
          ? selectedEntryIds.length
          : selectedCardIds.length;
      return followup.mode === "purge-and-copy"
        ? purgeEntryId !== null && selectedCount === 1
        : selectedCount >= followup.min && selectedCount <= followup.max;
    }
    if (followup.kind === "packs") return false;
    if (followup.kind === "subtypes") return selectedSubtype !== null;
    if (followup.kind === "dreamsign-flow") {
      if (followup.mode === "replace-with-offered") {
        return (
          selectedOfferedDreamsignId !== null &&
          selectedDreamsignReplacementIds.length === 1
        );
      }
      if (followup.mode === "gain-offered") {
        return (
          selectedOfferedDreamsignId !== null &&
          selectedDreamsignReplacementIds.length ===
            followup.requiredOverflowReplacementCount
        );
      }
      return (
        selectedPurgedDreamsignId !== null &&
        selectedDreamsignReplacementIds.length ===
          followup.requiredOverflowReplacementCount
      );
    }
    return false;
  })();
  const dreamsignChoiceColumns =
    activeAction?.followup.kind === "dreamsigns"
      ? Math.min(4, Math.max(1, activeAction.followup.dreamsigns.length))
      : activeAction?.followup.kind === "dreamsign-flow"
        ? Math.min(
            4,
            Math.max(
              1,
              activeAction.followup.offered.length,
              activeAction.followup.held.length,
            ),
          )
        : 0;
  const centeredFollowupWidth =
    activeAction?.followup.kind === "packs"
      ? "min(1280px, calc(100vw - 64px))"
      : activeAction?.followup.kind === "site-types"
        ? "min(720px, calc(100vw - 64px))"
        : activeAction?.followup.kind === "cards" &&
            activeAction.followup.selectionKey === "cardIds"
          ? "min(1120px, calc(100vw - 64px))"
          : activeAction?.followup.kind === "multi-card-transfiguration"
            ? "min(1120px, calc(100vw - 64px))"
            : activeAction?.followup.kind === "dreamsigns" ||
                activeAction?.followup.kind === "dreamsign-flow"
              ? `min(max(420px, calc(${String(dreamsignChoiceColumns)} * ${String(DESKTOP_DREAMSIGN_CHOICE_SIZE)}px + ${String(dreamsignChoiceColumns - 1)} * ${token("--space-3xl")} + 2 * ${token("--space-2xl")})), calc(100vw - 64px))`
              : activeAction?.followup.kind === "avatars"
                ? "min(960px, calc(100vw - 64px))"
                : null;

  return (
    <div
      data-testid="cumulus-exploration-site-screen"
      style={{ position: "fixed", inset: 0 }}
    >
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
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
                  layout === "desktop" ? DESKTOP_CARD_WIDTH : MOBILE_CARD_WIDTH,
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
                    label={"Delve"}
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
      </SiteLayout>
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
                <CardBack label={"Exploration card, face down"} />
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
              <CardBack label={"Exploration card returning face down"} />
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
          <div
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
          </div>
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
            aria-label={`Transfiguring ${transfigurationReward.before.displaySnapshot.name} into its ${transfigurationReward.after.transfiguration.form.name} form`}
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
            data-exploration-destination={transfigurationReturn.destinationKind}
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
            data-exploration-source-entry-id={purgeAndCopyReward.sourceEntryId}
            data-exploration-copy-count={purgeAndCopyReward.count}
            role="status"
            aria-label={`Purging ${purgeAndCopyReward.purgedCard.model.displaySnapshot.name} before copying ${purgeAndCopyReward.source.model.displaySnapshot.name}`}
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
                ? cardCopiesReward.count === 1
                  ? `Gained ${formatNumber(cardCopiesReward.count)} copy`
                  : `Gained ${formatNumber(cardCopiesReward.count)} copies`
                : cardCopiesReward.count === 1
                  ? `Purged ${
                      purgeAndCopyReward.purgedCard.model.displaySnapshot.name
                    } and gained ${formatNumber(cardCopiesReward.count)} copy of ${purgeAndCopyReward.source.model.displaySnapshot.name}`
                  : `Purged ${
                      purgeAndCopyReward.purgedCard.model.displaySnapshot.name
                    } and gained ${formatNumber(cardCopiesReward.count)} copies of ${purgeAndCopyReward.source.model.displaySnapshot.name}`
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
              onAnimationComplete={() =>
                finishCardCopyItem(parseDeckEntryId(card.entryId))
              }
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
            data-exploration-battle-modifier-amount={
              battleModifierReward.amount
            }
            data-exploration-battles-remaining={
              battleModifierReward.battlesRemaining
            }
            role="status"
            aria-label={
              battleModifierReward.modifier === "opening-hand"
                ? battleModifierReward.amount === 1
                  ? `${formatNumber(battleModifierReward.amount)} additional opening-hand card in the next battle`
                  : `${formatNumber(battleModifierReward.amount)} additional opening-hand cards in the next battle`
                : battleModifierReward.modifier === "event-draw"
                  ? battleModifierReward.amount === 1
                    ? `Draw ${formatNumber(battleModifierReward.amount)} Event at the start of the next battle`
                    : `Draw ${formatNumber(battleModifierReward.amount)} Events at the start of the next battle`
                  : `${formatNumber(battleModifierReward.amount)} additional starting Energy in the next battle`
            }
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
              headline={
                battleModifierReward.modifier === "opening-hand"
                  ? battleModifierReward.amount === 1
                    ? `+${formatNumber(battleModifierReward.amount)} Card`
                    : `+${formatNumber(battleModifierReward.amount)} Cards`
                  : battleModifierReward.modifier === "event-draw"
                    ? battleModifierReward.amount === 1
                      ? `+${formatNumber(battleModifierReward.amount)} Event`
                      : `+${formatNumber(battleModifierReward.amount)} Events`
                    : `+${formatNumber(battleModifierReward.amount)} ●`
              }
              detail={"Next Battle"}
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
            aria-label={`Your next battle begins with ${formatNumber(smallerHandDiscountReward.openingHandDelta)} Card and your cards cost ${formatNumber(smallerHandDiscountReward.energyCostReduction)} less Energy`}
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
              headline={`${formatNumber(smallerHandDiscountReward.openingHandDelta)} Card`}
              detail={`Next Battle · Cards cost ${formatNumber(smallerHandDiscountReward.energyCostReduction)} less Energy`}
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
        avatarReward !== null && (
          <motion.section
            data-exploration-outcome="avatar"
            data-exploration-previous-avatar-id={avatarReward.previous?.id}
            data-exploration-avatar-id={avatarReward.current.id}
            role="status"
            aria-label={`${avatarReward.current.name} is now your Avatar`}
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
              <AvatarPortrait
                avatar={{
                  ...avatarReward.current,
                  name: avatarReward.current.name,
                  title: avatarReward.current.title,
                }}
                variant="panel"
              />
            </div>
            <div style={{ display: "grid", gap: token("--space-xxs") }}>
              <strong style={{ font: token("--t-title") }}>
                {avatarReward.current.name}
              </strong>
              <span
                style={{
                  font: token("--t-body"),
                  color: token("--text-secondary"),
                }}
              >
                {avatarReward.current.title}
              </span>
            </div>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        shopModifierReward !== null && (
          <section
            data-exploration-outcome="shop-modifier"
            data-exploration-shop-modifier={shopModifierReward.modifier}
            data-exploration-source-site-id={shopModifierReward.sourceSiteId}
            data-exploration-source-action-id={
              shopModifierReward.sourceActionId
            }
            data-exploration-free-purchase-count={
              shopModifierReward.freePurchaseCount
            }
            data-exploration-essence-before={shopModifierReward.essenceBefore}
            data-exploration-essence-spent={shopModifierReward.essenceSpent}
            data-exploration-essence-after={shopModifierReward.essenceAfter}
            role="status"
            aria-label={
              shopModifierReward.modifier === "free-next-shop"
                ? "Every item in your next Card Shop will be free."
                : (shopModifierReward.freePurchaseCount ?? 0) === 1
                  ? `Lost ${formatNumber(shopModifierReward.essenceSpent ?? 0)} Essence, from ${formatNumber(shopModifierReward.essenceBefore ?? 0)} to ${formatNumber(shopModifierReward.essenceAfter ?? 0)}, and gained ${formatNumber(shopModifierReward.freePurchaseCount ?? 0)} free purchase.`
                  : `Lost ${formatNumber(shopModifierReward.essenceSpent ?? 0)} Essence, from ${formatNumber(shopModifierReward.essenceBefore ?? 0)} to ${formatNumber(shopModifierReward.essenceAfter ?? 0)}, and gained ${formatNumber(shopModifierReward.freePurchaseCount ?? 0)} free purchases.`
            }
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
              headline={
                shopModifierReward.modifier === "free-next-shop"
                  ? "Next Shop Free"
                  : (shopModifierReward.freePurchaseCount ?? 0) === 1
                    ? `${formatNumber(shopModifierReward.freePurchaseCount ?? 0)} Free Purchase`
                    : `${formatNumber(shopModifierReward.freePurchaseCount ?? 0)} Free Purchases`
              }
              detail={
                shopModifierReward.modifier === "free-next-shop"
                  ? "Every item in your next Card Shop is free."
                  : `${formatNumber(shopModifierReward.essenceBefore ?? 0)} → ${formatNumber(shopModifierReward.essenceAfter ?? 0)} Essence · ${formatNumber(shopModifierReward.essenceSpent ?? 0)} spent`
              }
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-shop-modifier:${shopModifierReward.sourceActionId}`}
            />
          </section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        siteOfferModifierReward !== null && (
          <section
            data-exploration-outcome="site-offer-modifier"
            data-exploration-site-offer-modifier={
              siteOfferModifierReward.modifier
            }
            data-exploration-source-site-id={
              siteOfferModifierReward.sourceSiteId
            }
            data-exploration-source-action-id={
              siteOfferModifierReward.sourceActionId
            }
            role="status"
            aria-label={
              "Your next Draft or Shop will contain transfigured cards"
            }
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
              headline={"Transfigured Cards"}
              detail={"Next Draft or Shop"}
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
        siteInsertionReward !== null && (
          <motion.section
            data-exploration-outcome="site-insertion"
            data-exploration-site-insertion-phase={
              reduceMotion ? "terminal" : "scale-fade"
            }
            data-exploration-site-insertion-source={
              siteInsertionReward.sourceKind
            }
            data-exploration-site-id={siteInsertionReward.model.id}
            data-exploration-site-type={siteInsertionReward.model.type}
            data-exploration-target-node-id={siteInsertionReward.targetNodeId}
            data-exploration-insertion-index={
              siteInsertionReward.insertionIndex
            }
            role="status"
            aria-live="polite"
            aria-label={`${siteInsertionReward.model.label} added to this Dreamscape`}
            initial={
              reduceMotion
                ? { opacity: 1, scale: 1 }
                : { opacity: 0, scale: 0.72 }
            }
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
              gap: token("--space-l"),
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={"Site Added"}
              detail={siteInsertionReward.model.label}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-site-insertion:${siteInsertionReward.model.id}`}
            />
            <div
              data-exploration-site-insertion-node=""
              style={{ position: "relative", width: 220, height: 220 }}
            >
              <SiteNode
                model={siteInsertionReward.model}
                motion={!reduceMotion}
                presentation="reward"
                onSelect={() => undefined}
              />
            </div>
          </motion.section>
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
            aria-label={emptyObjectOutcomeMessage}
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
              headline={emptyObjectOutcomeMessage}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-empty-${resolvedReward.semanticKind ?? "objects"}:${view.resolvedActionId ?? "resolved"}`}
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
            data-exploration-deck-modification-count={
              deckModification.cards.length
            }
            role="status"
            aria-label={
              deckModification.kind === "transfiguration"
                ? deckModification.cards.length === 1
                  ? `Transfigured ${formatNumber(deckModification.cards.length)} eligible card into its ${deckModification.formName} form and spent ${formatNumber(deckModification.essenceSpent)} Essence`
                  : `Transfigured ${formatNumber(deckModification.cards.length)} eligible cards into their ${deckModification.formName} forms and spent ${formatNumber(deckModification.essenceSpent)} Essence`
                : deckModification.announcement
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
                  data-exploration-transfiguration={
                    deckModification.kind === "transfiguration"
                      ? deckModification.transfiguration
                      : undefined
                  }
                  data-exploration-essence-spent={
                    deckModification.kind === "transfiguration"
                      ? deckModification.essenceSpent
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
                            : deckModification.kind === "transfiguration"
                              ? "transfigured"
                              : "changed"
                    }
                    hideRulesText
                    testId={`cumulus-exploration-deck-modification-card-${card.entryId}`}
                  />
                </motion.div>
              );
            })}
            <RadialAnnouncement
              headline={explorationDeckModificationHeadline(deckModification)}
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
        directEssenceReward !== null && (
          <section
            data-exploration-outcome="direct-essence"
            data-exploration-essence-source={directEssenceReward.sourceKind}
            data-exploration-essence-before={directEssenceReward.essenceBefore}
            data-exploration-essence-gained={directEssenceReward.essenceGained}
            data-exploration-essence-after={directEssenceReward.essenceAfter}
            data-exploration-minimum-essence={
              directEssenceReward.minimumEssence
            }
            data-exploration-maximum-essence={
              directEssenceReward.maximumEssence
            }
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              announcementId={`exploration:${view.siteId}:${view.resolvedActionId ?? "direct-essence"}`}
              headline={"Essence Gained"}
              detail={`${formatNumber(directEssenceReward.essenceAfter)} Essence total`}
              essenceGained={directEssenceReward.essenceGained}
              tone="reward"
              size={isDesktop ? "standard" : "compact"}
              duration="extended"
            />
          </section>
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
            data-exploration-essence-per-spark={cardPurgeReward.essencePerSpark}
            data-exploration-essence-gained={cardPurgeReward.totalEssence}
            role="status"
            aria-label={`Purging ${cardPurgeReward.card.model.displaySnapshot.name} for ${formatNumber(cardPurgeReward.totalEssence)} Essence`}
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
            data-exploration-essence-per-spark={cardPurgeReward.essencePerSpark}
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
              headline={"Essence Gained"}
              detail={`${formatNumber(cardPurgeReward.essencePerSpark)} × ${formatNumber(cardPurgeReward.spark)} ✦`}
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
              style={{
                width: isDesktop
                  ? DESKTOP_REWARD_DREAMSIGN_SIZE
                  : MOBILE_REWARD_DREAMSIGN_SIZE,
                height: isDesktop
                  ? DESKTOP_REWARD_DREAMSIGN_SIZE
                  : MOBILE_REWARD_DREAMSIGN_SIZE,
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
              headline={"Essence Gained"}
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
        compoundTransfigurationReward !== null && (
          <motion.section
            data-exploration-outcome={compoundTransfigurationReward.kind}
            data-exploration-card-transfiguration-source={
              compoundTransfigurationReward.sourceKind
            }
            data-exploration-card-transfiguration-phase={
              starterCardTransfigurationPhase
            }
            data-exploration-card-transfiguration-count={
              compoundTransfigurationReward.transfigurations.length
            }
            data-exploration-card-transfiguration-entry-ids={compoundTransfigurationReward.transfigurations
              .map((mapping) => mapping.entryId)
              .join(",")}
            data-exploration-card-transfiguration-card-ids={compoundTransfigurationReward.transfigurations
              .map((mapping) => mapping.cardId)
              .join(",")}
            data-exploration-card-transfiguration-forms={compoundTransfigurationReward.transfigurations
              .map((mapping) => mapping.afterTransfiguration)
              .join(",")}
            data-exploration-starter-card-transfiguration-source={
              starterCardTransfigurationReward?.sourceKind
            }
            data-exploration-starter-card-transfiguration-phase={
              starterCardTransfigurationReward === null
                ? undefined
                : starterCardTransfigurationPhase
            }
            data-exploration-starter-card-transfiguration-count={
              starterCardTransfigurationReward?.transfigurations.length
            }
            data-exploration-starter-card-transfiguration-entry-ids={starterCardTransfigurationReward?.transfigurations
              .map((mapping) => mapping.entryId)
              .join(",")}
            data-exploration-starter-card-transfiguration-card-ids={starterCardTransfigurationReward?.transfigurations
              .map((mapping) => mapping.cardId)
              .join(",")}
            data-exploration-starter-card-transfiguration-forms={starterCardTransfigurationReward?.transfigurations
              .map((mapping) => mapping.afterTransfiguration)
              .join(",")}
            data-exploration-starter-card-transfiguration-reviewed={
              starterCardTransfigurationReward === null
                ? undefined
                : starterCardTransfigurationReviewed
                  ? "true"
                  : "false"
            }
            data-exploration-card-transfiguration-reviewed={
              starterCardTransfigurationReviewed ? "true" : "false"
            }
            data-exploration-multi-card-transfiguration-reviewed={
              multiCardTransfigurationReward === null
                ? undefined
                : starterCardTransfigurationReviewed
                  ? "true"
                  : "false"
            }
            role="status"
            aria-live="polite"
            aria-label={
              starterCardTransfigurationReward === null
                ? compoundTransfigurationReward.transfigurations.length === 1
                  ? `${formatNumber(compoundTransfigurationReward.transfigurations.length)} card transfigured`
                  : `${formatNumber(compoundTransfigurationReward.transfigurations.length)} cards transfigured`
                : compoundTransfigurationReward.transfigurations.length === 1
                  ? `${formatNumber(compoundTransfigurationReward.transfigurations.length)} starter card transfigured`
                  : `${formatNumber(compoundTransfigurationReward.transfigurations.length)} starter cards transfigured`
            }
            initial={{ opacity: reduceMotion ? 1 : 0 }}
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
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr)",
              alignItems: "center",
              justifyItems: "center",
              gap: token("--space-xl"),
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <div
              data-exploration-card-transfiguration-announcement=""
              style={{
                position: "relative",
                width: "100%",
                height: isDesktop ? 184 : 108,
              }}
            >
              <RadialAnnouncement
                headline={
                  starterCardTransfigurationReward === null
                    ? "Cards Transfigured"
                    : "Starter Cards Transfigured"
                }
                tone="reward"
                size={isDesktop ? "compact" : "mini"}
                duration="extended"
                announcementId={`exploration-${starterCardTransfigurationReward === null ? "card" : "starter-card"}-transfiguration:${view.resolvedActionId ?? "resolved"}`}
              />
            </div>
            <Pressable
              as="div"
              ref={starterCardTransfigurationPairsRef}
              data-exploration-card-transfiguration-pairs=""
              data-exploration-starter-card-transfiguration-pairs={
                starterCardTransfigurationReward === null ? undefined : ""
              }
              data-exploration-multi-card-transfiguration-pairs={
                multiCardTransfigurationReward === null ? undefined : ""
              }
              role="region"
              tabIndex={0}
              pressFeedback="stationary"
              hoverFeedback="stationary"
              ariaLabelMessage={
                starterCardTransfigurationReward === null
                  ? compoundTransfigurationReward.transfigurations.length === 1
                    ? `${formatNumber(compoundTransfigurationReward.transfigurations.length)} card transfigured`
                    : `${formatNumber(compoundTransfigurationReward.transfigurations.length)} cards transfigured`
                  : compoundTransfigurationReward.transfigurations.length === 1
                    ? `${formatNumber(compoundTransfigurationReward.transfigurations.length)} starter card transfigured`
                    : `${formatNumber(compoundTransfigurationReward.transfigurations.length)} starter cards transfigured`
              }
              onScroll={(event) => {
                const pairs = event.currentTarget;
                setStarterCardTransfigurationReviewed(
                  pairs.scrollTop + pairs.clientHeight >=
                    pairs.scrollHeight - 1,
                );
              }}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                alignContent: "start",
                justifyContent: "center",
                gap: isDesktop ? token("--space-xl") : token("--space-m"),
                width: "100%",
                height: "fit-content",
                maxHeight: "100%",
                minHeight: 0,
                overflow: "auto",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                cursor: "default",
                pointerEvents: "auto",
              }}
            >
              {compoundTransfigurationReward.transfigurations.map(
                (mapping, index) => (
                  <CardTransfigurationPairPresentation
                    key={mapping.entryId}
                    mapping={mapping}
                    index={index}
                    phase={starterCardTransfigurationPhase}
                    isDesktop={isDesktop}
                    reduceMotion={reduceMotion}
                    scope={
                      starterCardTransfigurationReward === null
                        ? "multi"
                        : "starter"
                    }
                  />
                ),
              )}
            </Pressable>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        compoundCardMutationReward !== null && (
          <motion.section
            data-exploration-outcome="compound-card-mutation"
            data-exploration-compound-source={
              compoundCardMutationReward.sourceKind
            }
            data-exploration-compound-card-mutation-source={
              compoundCardMutationReward.sourceKind
            }
            data-exploration-compound-card-mutation-phase={
              starterCardTransfigurationPhase
            }
            data-exploration-compound-card-mutation-reviewed={
              starterCardTransfigurationReviewed ? "true" : "false"
            }
            data-exploration-purged-entry-ids={compoundCardMutationReward.purged
              .map((card) => card.entryId)
              .join(",")}
            data-exploration-transfigured-entry-ids={compoundCardMutationReward.transfigurations
              .map((mapping) => mapping.entryId)
              .join(",")}
            data-exploration-fast-entry-ids={compoundCardMutationReward.keywordChanges
              .map((mapping) => mapping.entryId)
              .join(",")}
            data-exploration-nightmare-entry-ids={compoundCardMutationReward.nightmares
              .map((card) => card.entryId)
              .join(",")}
            data-exploration-copy-entry-ids={compoundCardMutationReward.copies
              .map((pair) => pair.copy.entryId)
              .join(",")}
            data-exploration-copy-entry-mappings={compoundCardMutationReward.copies
              .map((pair) => `${pair.source.entryId}:${pair.copy.entryId}`)
              .join(",")}
            role="status"
            aria-live="polite"
            aria-label={`Purged: ${formatNumber(compoundCardMutationReward.purged.length)}. Transfigured: ${formatNumber(compoundCardMutationReward.transfigurations.length)}. Made Fast: ${formatNumber(compoundCardMutationReward.keywordChanges.length)}. Nightmares gained: ${formatNumber(compoundCardMutationReward.nightmares.length)}. Copies gained: ${formatNumber(compoundCardMutationReward.copies.length)}.`}
            initial={{ opacity: reduceMotion ? 1 : 0 }}
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
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr)",
              alignItems: "center",
              justifyItems: "center",
              gap: token("--space-xl"),
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={
                compoundCardMutationReward.sourceKind ===
                "purge-disclosed-and-transfigure-same-type"
                  ? "Kindred Forms Recast"
                  : compoundCardMutationReward.sourceKind ===
                      "make-predicate-fast-and-gain-nightmares"
                    ? "Swiftness at a Price"
                    : compoundCardMutationReward.sourceKind ===
                        "take-transfigured-cards-and-gain-nightmares"
                      ? "Chosen Forms Awakened"
                      : "Three Reflections Remain"
              }
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-compound-card-mutation:${view.resolvedActionId ?? "resolved"}`}
            />
            <Pressable
              as="div"
              ref={starterCardTransfigurationPairsRef}
              data-exploration-compound-card-mutation-review=""
              role="region"
              tabIndex={0}
              pressFeedback="stationary"
              hoverFeedback="stationary"
              ariaLabelMessage={
                compoundCardChangeCount === 1
                  ? `Review ${formatNumber(compoundCardChangeCount)} card change`
                  : `Review ${formatNumber(compoundCardChangeCount)} card changes`
              }
              onScroll={(event) => {
                const review = event.currentTarget;
                setStarterCardTransfigurationReviewed(
                  review.scrollTop + review.clientHeight >=
                    review.scrollHeight - 1,
                );
              }}
              style={{
                display: "grid",
                gap: isDesktop ? token("--space-xl") : token("--space-m"),
                width: "100%",
                height: "fit-content",
                maxHeight: "100%",
                minHeight: 0,
                overflow: "auto",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                cursor: "default",
                pointerEvents: "auto",
              }}
            >
              {compoundCardMutationReward.purged.length > 0 && (
                <section
                  data-exploration-compound-section="purged"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: token("--space-m"),
                  }}
                >
                  <h2
                    style={{
                      width: "100%",
                      margin: 0,
                      textAlign: "center",
                      font: token("--t-title-sm"),
                      color: token("--text-primary"),
                    }}
                  >
                    {"Purged"}
                  </h2>
                  {compoundCardMutationReward.purged.map((card) => (
                    <div
                      key={card.entryId}
                      data-exploration-compound-purged-card=""
                      data-exploration-deck-entry-id={card.entryId}
                      data-card-id={card.model.cardId}
                      style={{
                        width: isDesktop
                          ? DESKTOP_ESSENCE_CARD_WIDTH
                          : MOBILE_ESSENCE_CARD_WIDTH,
                        aspectRatio: CARD_ASPECT_RATIO,
                      }}
                    >
                      <GameCard model={card.model} selection="danger" />
                    </div>
                  ))}
                </section>
              )}
              {compoundCardMutationReward.transfigurations.length > 0 && (
                <section
                  data-exploration-compound-section="transfigured"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: token("--space-m"),
                  }}
                >
                  <h2
                    style={{
                      width: "100%",
                      margin: 0,
                      textAlign: "center",
                      font: token("--t-title-sm"),
                      color: token("--text-primary"),
                    }}
                  >
                    {"Transfigured"}
                  </h2>
                  {compoundCardMutationReward.transfigurations.map(
                    (mapping, index) => (
                      <CardTransfigurationPairPresentation
                        key={mapping.entryId}
                        mapping={mapping}
                        index={index}
                        phase={starterCardTransfigurationPhase}
                        isDesktop={isDesktop}
                        reduceMotion={reduceMotion}
                        scope="compound"
                      />
                    ),
                  )}
                </section>
              )}
              {compoundCardMutationReward.keywordChanges.length > 0 && (
                <section
                  data-exploration-compound-section="fast"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: token("--space-m"),
                  }}
                >
                  <h2
                    style={{
                      width: "100%",
                      margin: 0,
                      textAlign: "center",
                      font: token("--t-title-sm"),
                      color: token("--text-primary"),
                    }}
                  >
                    {"Made Fast"}
                  </h2>
                  {compoundCardMutationReward.keywordChanges.map(
                    (mapping, index) => (
                      <CompoundCardPairPresentation
                        key={mapping.entryId}
                        before={mapping.before}
                        after={mapping.after}
                        index={index}
                        kind="keyword"
                        isDesktop={isDesktop}
                        reduceMotion={reduceMotion}
                      />
                    ),
                  )}
                </section>
              )}
              {compoundCardMutationReward.nightmares.length > 0 && (
                <section
                  data-exploration-compound-section="nightmares"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: token("--space-m"),
                  }}
                >
                  <h2
                    style={{
                      width: "100%",
                      margin: 0,
                      textAlign: "center",
                      font: token("--t-title-sm"),
                      color: token("--text-primary"),
                    }}
                  >
                    {"Nightmares Gained"}
                  </h2>
                  {compoundCardMutationReward.nightmares.map((card) => (
                    <div
                      key={card.entryId}
                      data-exploration-compound-nightmare-card=""
                      data-exploration-deck-entry-id={card.entryId}
                      data-card-id={card.model.cardId}
                      style={{
                        width: isDesktop
                          ? DESKTOP_ESSENCE_CARD_WIDTH
                          : MOBILE_ESSENCE_CARD_WIDTH,
                        aspectRatio: CARD_ASPECT_RATIO,
                      }}
                    >
                      <GameCard model={card.model} selection="reward" />
                    </div>
                  ))}
                </section>
              )}
              {compoundCardMutationReward.copies.length > 0 && (
                <section
                  data-exploration-compound-section="copies"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: token("--space-m"),
                  }}
                >
                  <h2
                    style={{
                      width: "100%",
                      margin: 0,
                      textAlign: "center",
                      font: token("--t-title-sm"),
                      color: token("--text-primary"),
                    }}
                  >
                    {"Copies Gained"}
                  </h2>
                  {compoundCardMutationReward.copies.map((pair, index) => (
                    <CompoundCardPairPresentation
                      key={pair.copy.entryId}
                      before={pair.source}
                      after={pair.copy}
                      index={index}
                      kind="copy"
                      isDesktop={isDesktop}
                      reduceMotion={reduceMotion}
                    />
                  ))}
                </section>
              )}
            </Pressable>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        cardTypeChangesReward !== null && (
          <motion.section
            data-exploration-outcome="card-type-changes"
            data-exploration-card-type-change-source={
              cardTypeChangesReward.sourceKind
            }
            data-exploration-card-type-change-phase={
              starterCardTransfigurationPhase
            }
            data-exploration-card-type-change-count={
              cardTypeChangesReward.changes.length
            }
            data-exploration-card-type-change-entry-ids={cardTypeChangesReward.changes
              .map((change) => change.entryId)
              .join(",")}
            data-exploration-card-type-change-card-ids={cardTypeChangesReward.changes
              .map((change) => change.cardId)
              .join(",")}
            data-exploration-card-type-change-before-types={cardTypeChangesReward.changes
              .map((change) => change.beforeCardType)
              .join(",")}
            data-exploration-card-type-change-after-types={cardTypeChangesReward.changes
              .map((change) => change.afterCardType)
              .join(",")}
            data-exploration-card-type-change-reviewed={
              starterCardTransfigurationReviewed ? "true" : "false"
            }
            role="status"
            aria-live="polite"
            aria-label={
              cardTypeChangesReward.changes.length === 1
                ? `${formatNumber(cardTypeChangesReward.changes.length)} card type changed`
                : `${formatNumber(cardTypeChangesReward.changes.length)} card types changed`
            }
            initial={{ opacity: reduceMotion ? 1 : 0 }}
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
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr)",
              alignItems: "center",
              justifyItems: "center",
              gap: token("--space-xl"),
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={"Card Types Changed"}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-card-type-changes:${view.resolvedActionId ?? "resolved"}`}
            />
            <Pressable
              as="div"
              ref={starterCardTransfigurationPairsRef}
              data-exploration-card-type-change-pairs=""
              role="region"
              tabIndex={0}
              pressFeedback="stationary"
              hoverFeedback="stationary"
              ariaLabelMessage={
                cardTypeChangesReward.changes.length === 1
                  ? `${formatNumber(cardTypeChangesReward.changes.length)} card type changed`
                  : `${formatNumber(cardTypeChangesReward.changes.length)} card types changed`
              }
              onScroll={(event) => {
                const pairs = event.currentTarget;
                setStarterCardTransfigurationReviewed(
                  pairs.scrollTop + pairs.clientHeight >=
                    pairs.scrollHeight - 1,
                );
              }}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                alignContent: "start",
                justifyContent: "center",
                gap: isDesktop ? token("--space-xl") : token("--space-m"),
                width: "100%",
                height: "fit-content",
                maxHeight: "100%",
                minHeight: 0,
                overflow: "auto",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                cursor: "default",
                pointerEvents: "auto",
              }}
            >
              {cardTypeChangesReward.changes.map((change, index) => (
                <CardTypeChangePairPresentation
                  key={change.entryId}
                  change={change}
                  index={index}
                  phase={starterCardTransfigurationPhase}
                  isDesktop={isDesktop}
                  reduceMotion={reduceMotion}
                />
              ))}
            </Pressable>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        cardReplacementReward !== null && (
          <motion.section
            data-exploration-outcome="card-replacements"
            data-exploration-card-replacement-source={
              cardReplacementReward.sourceKind
            }
            data-exploration-card-replacement-phase={starterCardMutationPhase}
            data-exploration-card-replacement-count={
              cardReplacementReward.replacements.length
            }
            data-exploration-card-replacement-purged-entry-ids={cardReplacementReward.replacements
              .map((pair) => pair.purged.entryId)
              .join(",")}
            data-exploration-card-replacement-purged-card-ids={cardReplacementReward.replacements
              .map((pair) => pair.purged.model.cardId)
              .join(",")}
            data-exploration-card-replacement-gained-entry-ids={cardReplacementReward.replacements
              .map((pair) => pair.gained.entryId)
              .join(",")}
            data-exploration-card-replacement-gained-card-ids={cardReplacementReward.replacements
              .map((pair) => pair.gained.model.cardId)
              .join(",")}
            data-exploration-card-replacement-reviewed={
              cardReplacementReviewed ? "true" : "false"
            }
            role="status"
            aria-live="polite"
            aria-label={
              cardReplacementReward.replacements.length === 1
                ? `${formatNumber(cardReplacementReward.replacements.length)} card replaced`
                : `${formatNumber(cardReplacementReward.replacements.length)} cards replaced`
            }
            initial={{ opacity: reduceMotion ? 1 : 0 }}
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
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              gridTemplateRows: "auto minmax(0, 1fr)",
              alignItems: "center",
              justifyItems: "center",
              gap: token("--space-xl"),
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={"Cards Replaced"}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-card-replacements:${view.resolvedActionId ?? "resolved"}`}
            />
            <Pressable
              as="div"
              ref={cardReplacementPairsRef}
              data-exploration-card-replacement-pairs=""
              role="region"
              tabIndex={0}
              pressFeedback="stationary"
              hoverFeedback="stationary"
              ariaLabelMessage={
                cardReplacementReward.replacements.length === 1
                  ? `${formatNumber(cardReplacementReward.replacements.length)} card replaced`
                  : `${formatNumber(cardReplacementReward.replacements.length)} cards replaced`
              }
              onScroll={(event) => {
                const pairs = event.currentTarget;
                setCardReplacementReviewed(
                  pairs.scrollTop + pairs.clientHeight >=
                    pairs.scrollHeight - 1,
                );
              }}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                alignContent: "start",
                justifyContent: "center",
                gap: isDesktop ? token("--space-xl") : token("--space-m"),
                width: "100%",
                height: "fit-content",
                maxHeight: "100%",
                minHeight: 0,
                overflow: "auto",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                cursor: "default",
                pointerEvents: "auto",
              }}
            >
              {cardReplacementReward.replacements.map((pair, index) => (
                <CardReplacementPresentation
                  key={`${pair.purged.entryId}:${pair.gained.entryId}`}
                  pair={pair}
                  index={index}
                  isDesktop={isDesktop}
                  reduceMotion={reduceMotion}
                  scope="multi"
                />
              ))}
            </Pressable>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        starterCardMutationReward !== null && (
          <motion.section
            data-exploration-outcome="starter-card-mutation"
            data-exploration-starter-card-source={
              starterCardMutationReward.sourceKind
            }
            data-exploration-starter-card-mode={starterCardMutationReward.mode}
            data-exploration-starter-card-phase={starterCardMutationPhase}
            data-exploration-starter-card-purged-entry-ids={starterCardMutationReward.purged
              .map((card) => card.entryId)
              .join(",")}
            data-exploration-starter-card-purged-card-ids={starterCardMutationReward.purged
              .map((card) => card.model.cardId)
              .join(",")}
            data-exploration-starter-card-gained-entry-ids={starterCardMutationReward.replacements
              .map((pair) => pair.gained.entryId)
              .join(",")}
            data-exploration-starter-card-gained-card-ids={starterCardMutationReward.replacements
              .map((pair) => pair.gained.model.cardId)
              .join(",")}
            data-exploration-starter-card-replacement-count={
              starterCardMutationReward.replacements.length
            }
            role="status"
            aria-live="polite"
            aria-label={`Starter-card changes — purged: ${formatNumber(starterCardMutationReward.purged.length)}; gained: ${formatNumber(starterCardMutationReward.replacements.length)}; replacements: ${formatNumber(starterCardMutationReward.replacements.length)}`}
            initial={{ opacity: reduceMotion ? 1 : 0 }}
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
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              placeContent: "center",
              justifyItems: "center",
              gap: token("--space-xl"),
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={"Starter Cards Changed"}
              tone={
                starterCardMutationReward.mode === "purge" ? "danger" : "reward"
              }
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-starter-card-mutation:${view.resolvedActionId ?? "resolved"}`}
            />
            <Pressable
              as="div"
              ref={cardReplacementPairsRef}
              data-exploration-starter-card-mutation-objects=""
              role="region"
              tabIndex={0}
              pressFeedback="stationary"
              hoverFeedback="stationary"
              ariaLabelMessage={
                starterCardMutationReward.replacements.length === 1
                  ? `${formatNumber(starterCardMutationReward.replacements.length)} card replaced`
                  : `${formatNumber(starterCardMutationReward.replacements.length)} cards replaced`
              }
              onScroll={(event) => {
                const pairs = event.currentTarget;
                setCardReplacementReviewed(
                  pairs.scrollTop + pairs.clientHeight >=
                    pairs.scrollHeight - 1,
                );
              }}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                gap: isDesktop ? token("--space-xl") : token("--space-m"),
                maxHeight: "min(65dvh, 620px)",
                overflow: "auto",
                cursor: "default",
                pointerEvents: "auto",
              }}
            >
              {starterCardMutationPhase === "purging" ||
              (reduceMotion &&
                starterCardMutationPhase === "terminal" &&
                starterCardMutationReward.replacements.length === 0)
                ? starterCardMutationReward.purged.map((card, index) => (
                    <PurgedCardPresentation
                      key={card.entryId}
                      card={card}
                      cardWidth={
                        isDesktop
                          ? DESKTOP_REWARD_CARD_WIDTH
                          : MOBILE_ESSENCE_CARD_WIDTH
                      }
                      index={index}
                      reduceMotion={reduceMotion}
                    />
                  ))
                : null}
              {starterCardMutationPhase === "replacing" ||
              (reduceMotion && starterCardMutationPhase === "terminal")
                ? starterCardMutationReward.replacements.map((pair, index) => (
                    <CardReplacementPresentation
                      key={`${pair.purged.entryId}:${pair.gained.entryId}`}
                      pair={pair}
                      index={index}
                      isDesktop={isDesktop}
                      reduceMotion={reduceMotion}
                      scope="starter"
                    />
                  ))
                : null}
            </Pressable>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        nightmareDreamsignBundleReward !== null && (
          <motion.section
            data-exploration-outcome="nightmare-dreamsign-bundle"
            data-exploration-nightmare-dreamsign-source={
              nightmareDreamsignBundleReward.sourceKind
            }
            data-exploration-nightmare-count={
              nightmareDreamsignBundleReward.nightmares.length
            }
            data-exploration-nightmare-card-ids={nightmareDreamsignBundleReward.nightmares
              .map((card) => card.model.cardId)
              .join(",")}
            data-exploration-nightmare-entry-ids={nightmareDreamsignBundleReward.nightmares
              .map((card) => card.entryId)
              .join(",")}
            data-exploration-dreamsign-gained-ids={nightmareDreamsignBundleReward.gained
              .map((dreamsign) => dreamsign.id)
              .join(",")}
            data-exploration-dreamsign-purged-ids={nightmareDreamsignBundleReward.purged
              .map((dreamsign) => dreamsign.id)
              .join(",")}
            data-exploration-dreamsign-replacement-count={
              nightmareDreamsignBundleReward.replacements.length
            }
            data-exploration-dreamsign-pool-regenerated={
              nightmareDreamsignBundleReward.poolRegenerated ? "true" : "false"
            }
            role="status"
            aria-live="polite"
            aria-label={`Reward gained — Nightmares: ${formatNumber(nightmareDreamsignBundleReward.nightmares.length)}; Dreamsigns: ${formatNumber(nightmareDreamsignBundleReward.gained.length)}; Dreamsign replacements: ${formatNumber(nightmareDreamsignBundleReward.replacements.length)}`}
            initial={{ opacity: reduceMotion ? 1 : 0 }}
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
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              placeContent: "center",
              justifyItems: "center",
              gap: token("--space-xl"),
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={"Nightmares and Dreamsign Gained"}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-nightmare-dreamsign:${view.resolvedActionId ?? "resolved"}`}
            />
            <div
              data-exploration-nightmare-dreamsign-objects=""
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                gap: isDesktop ? token("--space-xl") : token("--space-m"),
                maxHeight: "min(65dvh, 620px)",
                overflow: "auto",
                pointerEvents: "auto",
              }}
            >
              <div
                data-exploration-nightmare-stack=""
                role="group"
                aria-label={
                  nightmareDreamsignBundleReward.nightmares.length === 1
                    ? `${formatNumber(nightmareDreamsignBundleReward.nightmares.length)} Nightmare card`
                    : `${formatNumber(nightmareDreamsignBundleReward.nightmares.length)} Nightmare cards`
                }
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: token("--space-s"),
                }}
              >
                {nightmareDreamsignBundleReward.nightmares.map(
                  (card, index) => (
                    <motion.div
                      key={card.entryId}
                      data-exploration-nightmare-stack-card=""
                      data-exploration-nightmare-index={index}
                      data-exploration-entry-id={card.entryId}
                      data-card-id={card.model.cardId}
                      initial={{
                        opacity: reduceMotion ? 1 : 0,
                        scale: reduceMotion ? 1 : 0.82,
                        y: reduceMotion ? 0 : token("--space-l"),
                      }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{
                        delay: reduceMotion
                          ? 0
                          : index * REWARD_STAGGER_SECONDS,
                        duration: reduceMotion
                          ? 0
                          : motionTimeSeconds("--dur-slow"),
                        ease: DREAM_EASE,
                      }}
                      style={{
                        width: isDesktop
                          ? DESKTOP_REWARD_CARD_WIDTH
                          : MOBILE_CARD_COPY_WIDTH,
                        aspectRatio: CARD_ASPECT_RATIO,
                      }}
                    >
                      <GameCard
                        model={card.model}
                        selection="danger"
                        testId={`cumulus-exploration-nightmare-${card.entryId}`}
                      />
                    </motion.div>
                  ),
                )}
              </div>
              {nightmareDreamsignBundleReward.replacements.map(
                (pair, index) => (
                  <DreamsignReplacementPresentation
                    key={`${pair.removed.id}:${pair.gained.id}`}
                    removed={pair.removed}
                    gained={pair.gained}
                    index={
                      nightmareDreamsignBundleReward.nightmares.length + index
                    }
                    isDesktop={isDesktop}
                    reduceMotion={reduceMotion}
                  />
                ),
              )}
              {unpairedBundleDreamsignGains.map((dreamsign, index) => (
                <motion.div
                  key={dreamsign.id}
                  data-exploration-dreamsign-mutation-object="gained"
                  data-dreamsign-id={dreamsign.id}
                  initial={{
                    opacity: reduceMotion ? 1 : 0,
                    scale: reduceMotion ? 1 : 0.72,
                    y: reduceMotion ? 0 : token("--space-l"),
                  }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{
                    delay: reduceMotion
                      ? 0
                      : (nightmareDreamsignBundleReward.nightmares.length +
                          nightmareDreamsignBundleReward.replacements.length +
                          index) *
                        REWARD_STAGGER_SECONDS,
                    duration: reduceMotion
                      ? 0
                      : motionTimeSeconds("--dur-slow"),
                    ease: DREAM_EASE,
                  }}
                  style={{
                    width: isDesktop
                      ? DESKTOP_REWARD_DREAMSIGN_SIZE
                      : MOBILE_REWARD_DREAMSIGN_SIZE,
                    height: isDesktop
                      ? DESKTOP_REWARD_DREAMSIGN_SIZE
                      : MOBILE_REWARD_DREAMSIGN_SIZE,
                  }}
                >
                  <Dreamsign
                    dreamsign={dreamsign}
                    variant="revelation"
                    testid={`cumulus-exploration-nightmare-dreamsign-${dreamsign.id}`}
                  />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        dreamsignMutationReward !== null && (
          <motion.section
            data-exploration-outcome="dreamsign-mutation"
            data-exploration-dreamsign-mutation-source={
              dreamsignMutationReward.sourceKind
            }
            data-exploration-dreamsign-mutation-phase={dreamsignMutationPhase}
            data-exploration-dreamsign-before-ids={dreamsignMutationReward.before
              .map((dreamsign) => dreamsign.id)
              .join(",")}
            data-exploration-dreamsign-after-ids={dreamsignMutationReward.after
              .map((dreamsign) => dreamsign.id)
              .join(",")}
            data-exploration-dreamsign-offered-ids={dreamsignMutationReward.offered
              .map((dreamsign) => dreamsign.id)
              .join(",")}
            data-exploration-dreamsign-gained-ids={dreamsignMutationReward.gained
              .map((dreamsign) => dreamsign.id)
              .join(",")}
            data-exploration-dreamsign-purged-ids={dreamsignMutationReward.purged
              .map((dreamsign) => dreamsign.id)
              .join(",")}
            data-exploration-dreamsign-replacement-count={
              dreamsignMutationReward.replacements.length
            }
            data-exploration-dreamsign-pool-regenerated={
              dreamsignMutationReward.poolRegenerated ? "true" : "false"
            }
            role="status"
            aria-live="polite"
            aria-label={`Dreamsign changes — purged: ${formatNumber(dreamsignMutationReward.purged.length)}; gained: ${formatNumber(dreamsignMutationReward.gained.length)}; replacements: ${formatNumber(dreamsignMutationReward.replacements.length)}`}
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
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              display: "grid",
              placeContent: "center",
              justifyItems: "center",
              gap: token("--space-xl"),
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              headline={"Dreamsigns Changed"}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-dreamsign-mutation:${view.resolvedActionId ?? "resolved"}`}
            />
            <div
              data-exploration-dreamsign-mutation-objects=""
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: isDesktop ? token("--space-xl") : token("--space-m"),
                pointerEvents: "auto",
              }}
            >
              {dreamsignMutationPhase === "gaining" &&
                dreamsignMutationReward.replacements.map((pair, index) => (
                  <DreamsignReplacementPresentation
                    key={`${pair.removed.id}:${pair.gained.id}`}
                    removed={pair.removed}
                    gained={pair.gained}
                    index={index}
                    isDesktop={isDesktop}
                    reduceMotion={reduceMotion}
                  />
                ))}
              {(dreamsignMutationPhase === "purging"
                ? dreamsignMutationReward.purged
                : unpairedDreamsignGains
              ).map((dreamsign, index) => (
                <motion.div
                  key={`${dreamsignMutationPhase}:${dreamsign.id}`}
                  data-exploration-dreamsign-mutation-object={
                    dreamsignMutationPhase === "purging" ? "purged" : "gained"
                  }
                  data-dreamsign-id={dreamsign.id}
                  initial={
                    dreamsignMutationPhase === "purging"
                      ? { opacity: 1, scale: 1, rotate: 0 }
                      : {
                          opacity: reduceMotion ? 1 : 0,
                          scale: reduceMotion ? 1 : 0.72,
                          y: reduceMotion ? 0 : token("--space-l"),
                        }
                  }
                  animate={
                    dreamsignMutationPhase === "purging"
                      ? reduceMotion
                        ? { opacity: 0 }
                        : {
                            opacity: [1, 1, 0],
                            scale: [1, 1.04, 0.24],
                            rotate: [0, -2, 8],
                          }
                      : { opacity: 1, scale: 1, y: 0 }
                  }
                  transition={{
                    delay:
                      dreamsignMutationPhase === "gaining" && !reduceMotion
                        ? index * REWARD_STAGGER_SECONDS
                        : 0,
                    duration: reduceMotion
                      ? 0
                      : dreamsignMutationPhase === "purging"
                        ? DREAMSIGN_PURGE_SECONDS
                        : motionTimeSeconds("--dur-slow"),
                    ease: DREAM_EASE,
                  }}
                  style={{
                    width: isDesktop
                      ? DESKTOP_REWARD_DREAMSIGN_SIZE
                      : MOBILE_REWARD_DREAMSIGN_SIZE,
                    height: isDesktop
                      ? DESKTOP_REWARD_DREAMSIGN_SIZE
                      : MOBILE_REWARD_DREAMSIGN_SIZE,
                  }}
                >
                  <Dreamsign
                    dreamsign={dreamsign}
                    variant="revelation"
                    testid={`cumulus-exploration-dreamsign-mutation-${dreamsign.id}`}
                  />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction === null &&
        essenceReward !== null &&
        essenceRewardPhase === "cards" && (
          <motion.section
            data-exploration-essence-cards=""
            data-exploration-essence-card-count={essenceReward.cards.length}
            data-exploration-essence-predicate={essenceReward.predicate}
            role="status"
            aria-label={
              essenceReward.cards.length === 1
                ? `${formatNumber(essenceReward.cards.length)} ${essencePredicateCount(
                    essenceReward.predicate,
                    essenceReward.cards.length,
                  )} grants ${formatNumber(essenceReward.totalEssence)} Essence total, ${formatNumber(essenceReward.essencePerCard)} for that card`
                : `${formatNumber(essenceReward.cards.length)} ${essencePredicateCount(
                    essenceReward.predicate,
                    essenceReward.cards.length,
                  )} grant ${formatNumber(essenceReward.totalEssence)} Essence total, ${formatNumber(essenceReward.essencePerCard)} each`
            }
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
                  duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
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
            data-exploration-essence-predicate={essenceReward.predicate}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              announcementId={`exploration:${view.siteId}:${view.resolvedActionId ?? "essence"}`}
              headline={"Essence Gained"}
              detail={`${formatNumber(essenceReward.essencePerCard)} × ${formatNumber(essenceReward.cards.length)} ${essencePredicateCount(
                essenceReward.predicate,
                essenceReward.cards.length,
              )}`}
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
            trajectoryForReward.target.height /
              trajectoryForReward.source.height,
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
                <Dreamsign dreamsign={item.dreamsign} variant="revelation" />
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
            <GlassPanel testId="cumulus-exploration-narrative-panel">
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
      {frameBreakGeometry !== null &&
        frameBreakPhase === "open" &&
        activeAction !== null && (
          <motion.section
            data-exploration-followup={activeAction.followup.kind}
            data-exploration-action-id={activeAction.id}
            data-exploration-effect-kind={activeAction.effectKind}
            initial={{
              opacity: 0,
              y: reduceMotion ? 0 : 14,
              scale: reduceMotion ? 1 : 0.985,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
              ease: DREAM_EASE,
            }}
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
                isDesktop && centeredFollowupWidth !== null
                  ? "auto"
                  : undefined,
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
                    state={{
                      kind: "ready",
                      presentation: "open-deck",
                      cards: activeAction.followup.candidates.map((choice) => ({
                        entryId: choice.entryId,
                        card: choice.model,
                        availability: choice.availability,
                        reforgedType: choice.reforgedType,
                      })),
                    }}
                    onDismiss={() => setActiveActionId(null)}
                    onCardPress={(entryId) => {
                      setSelectedTransfigurationEntryId(entryId);
                      setSelectedTransfigurationFormType(null);
                    }}
                  />
                ) : (
                  <TransfigurationDetailPanel
                    candidate={{
                      card: candidate.model,
                      forms: candidate.forms,
                    }}
                    value={selectedTransfigurationFormType}
                    status={transfigurationConfirming ? "submitting" : "idle"}
                    navigation={{
                      kind: "reselectable",
                      onBack: () => {
                        setSelectedTransfigurationEntryId(null);
                        setSelectedTransfigurationFormType(null);
                      },
                    }}
                    onChange={(type) =>
                      setSelectedTransfigurationFormType((current) =>
                        current === type ? null : type,
                      )
                    }
                    onConfirm={(type) => {
                      setTransfigurationConfirming(true);
                      onResolve(activeAction.id, {
                        entryIds: [candidate.entryId],
                        transfiguration: type,
                      });
                    }}
                  />
                );
              })()}
            {activeAction.followup.kind === "multi-card-transfiguration" &&
              (() => {
                const followup = activeAction.followup;
                if (multiTransfigurationStep === null) {
                  return (
                    <div
                      data-exploration-multi-transfiguration-step="cards"
                      data-exploration-multi-transfiguration-required-count={
                        followup.count
                      }
                      data-exploration-multi-transfiguration-selected-entry-ids={selectedEntryIds.join(
                        ",",
                      )}
                      style={{ width: "100%", minHeight: 0 }}
                    >
                      <CardPickerPanel
                        title={followup.title}
                        subtitle={followup.subtitle}
                        footerActions={[
                          {
                            label: "Confirm Choice",
                            onPress: commitFollowup,
                            disabled: !canCommitFollowup,
                            variant: "accent",
                            testId:
                              "cumulus-exploration-multi-transfiguration-cards-confirm",
                          },
                        ]}
                        cards={followup.candidates.map((candidate) => ({
                          entryId: candidate.entryId,
                          model: candidate.model,
                          selection: selectedEntryIds.includes(
                            candidate.entryId,
                          )
                            ? "selected"
                            : undefined,
                          operation: selectedEntryIds.includes(
                            candidate.entryId,
                          )
                            ? "transfigure"
                            : undefined,
                          testId: `cumulus-exploration-multi-transfiguration-card-${candidate.entryId}`,
                        }))}
                        emptyLabel={"No eligible cards are available."}
                        testId="cumulus-exploration-multi-transfiguration-card-picker"
                        onCardPress={toggleDeckEntry}
                      />
                    </div>
                  );
                }
                const entryId = selectedEntryIds[multiTransfigurationStep];
                const candidate = followup.candidates.find(
                  (choice) => choice.entryId === entryId,
                );
                if (entryId === undefined || candidate === undefined)
                  return null;
                const selectedForm = multiTransfigurationForms[entryId] ?? null;
                return (
                  <div
                    data-exploration-multi-transfiguration-step="form"
                    data-exploration-multi-transfiguration-current-index={
                      multiTransfigurationStep
                    }
                    data-exploration-multi-transfiguration-current-entry-id={
                      entryId
                    }
                    data-exploration-multi-transfiguration-current-card-id={
                      candidate.model.cardId
                    }
                    data-exploration-multi-transfiguration-current-form={
                      selectedForm ?? undefined
                    }
                    data-exploration-multi-transfiguration-selected-entry-ids={selectedEntryIds.join(
                      ",",
                    )}
                    data-exploration-multi-transfiguration-selected-forms={selectedEntryIds
                      .map(
                        (selectedEntryId) =>
                          multiTransfigurationForms[selectedEntryId] ?? "",
                      )
                      .join(",")}
                    role="region"
                    aria-label={`Choosing a form for card ${formatNumber(multiTransfigurationStep + 1)} of ${formatNumber(followup.count)}: ${candidate.model.displaySnapshot.name}`}
                    style={{ width: "100%", minHeight: 0 }}
                  >
                    <TransfigurationDetailPanel
                      candidate={{
                        card: candidate.model,
                        forms: candidate.forms,
                      }}
                      value={selectedForm}
                      status={transfigurationConfirming ? "submitting" : "idle"}
                      navigation={{
                        kind: "reselectable",
                        onBack: () => {
                          setTransfigurationConfirming(false);
                          setMultiTransfigurationStep((current) =>
                            current === null || current === 0
                              ? null
                              : current - 1,
                          );
                        },
                      }}
                      onChange={(type) =>
                        setMultiTransfigurationForms((current) => ({
                          ...current,
                          [entryId]: type,
                        }))
                      }
                      onConfirm={(type) => {
                        const nextForms: IdentityRecord<
                          DeckEntryId,
                          TransfigurationType
                        > = {
                          ...multiTransfigurationForms,
                          [entryId]: type,
                        };
                        setMultiTransfigurationForms(nextForms);
                        if (multiTransfigurationStep + 1 < followup.count) {
                          setMultiTransfigurationStep(
                            multiTransfigurationStep + 1,
                          );
                          return;
                        }
                        const transfigurations = selectedEntryIds.flatMap(
                          (selectedEntryId) => {
                            const type = nextForms[selectedEntryId];
                            return type === undefined ? [] : [type];
                          },
                        );
                        if (transfigurations.length !== selectedEntryIds.length)
                          return;
                        setTransfigurationConfirming(true);
                        onResolve(activeAction.id, {
                          entryIds: selectedEntryIds,
                          transfigurations,
                        });
                      }}
                    />
                  </div>
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
                          label={"Confirm Choice"}
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
                      <CardChoiceGrid<CardId>
                        cards={activeAction.followup.cards.map((card) => ({
                          entryId: card.entryId,
                          model: card.model,
                          selection: selectedCardIds.includes(card.entryId)
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
                        onCardPress={toggleCatalogCard}
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
                        activeAction.followup.mode === "purge-and-copy" &&
                        purgeEntryId === null
                          ? "Choose a card to purge"
                          : activeAction.followup.mode === "purge-and-copy" &&
                              selectedEntryIds.length === 0
                            ? "Choose a card to copy"
                            : "Confirm Choice",
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
                        : selectedEntryIds.includes(card.entryId)
                          ? "selected"
                          : undefined,
                    emphasis: card.isBane ? "danger" : undefined,
                    operation: selectedCardOperation(
                      card.entryId,
                      activeAction.followup,
                      selectedEntryIds,
                      purgeEntryId,
                    ),
                    testId: `cumulus-exploration-card-${card.entryId}`,
                  }))}
                  emptyLabel={"No eligible cards are available."}
                  testId="cumulus-exploration-card-followup"
                  onCardPress={toggleDeckEntry}
                />
              )}
            {activeAction.followup.kind === "packs" && (
              <article
                data-exploration-pack-offer=""
                style={{ width: "100%", minHeight: 0, maxHeight: "100%" }}
              >
                <GlassPanel
                  eyebrow={"Exploration"}
                  title={activeAction.followup.title}
                  subtitle={activeAction.followup.subtitle}
                  headingLevel="h1"
                  headerSpacing="medium"
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isDesktop
                        ? "repeat(2, minmax(0, 1fr))"
                        : "1fr",
                      gap: token("--space-l"),
                      padding: token("--space-l"),
                      overflow: "auto",
                    }}
                  >
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
                          {`Pack ${formatNumber(pack.index + 1)}`}
                        </strong>
                        <span
                          data-exploration-pack-cards=""
                          style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${String(pack.cards.length)}, minmax(0, 1fr))`,
                            gap: token("--space-xs"),
                          }}
                        >
                          {pack.cards.map((card) => (
                            <GameCard key={card.entryId} model={card.model} />
                          ))}
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
                            label={"Choose"}
                            accessibilityLabel={`Choose Pack ${formatNumber(pack.index + 1)}`}
                            variant="accent"
                            placement="onGlass"
                            onPress={() =>
                              onResolve(activeAction.id, {
                                packIndex: pack.index,
                              })
                            }
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
                eyebrow={"Exploration"}
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
                footer={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      padding: token("--space-m"),
                    }}
                  >
                    <GlassButton
                      label={"Confirm Choice"}
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
                  role="radiogroup"
                  style={{
                    display: "grid",
                    gap: token("--space-xs"),
                    padding: token("--space-m"),
                  }}
                >
                  {activeAction.followup.options.map((option) => (
                    <Pressable
                      key={option}
                      as="button"
                      role="radio"
                      aria-checked={selectedSubtype === option}
                      onClick={() => setSelectedSubtype(option)}
                      style={{
                        minHeight: token("--touch-min"),
                        padding: token("--space-s"),
                        borderRadius: token("--radius-control"),
                        border: `2px solid ${selectedSubtype === option ? token("--selected") : token("--border-soft")}`,
                        background: token("--glass-on-glass-fill"),
                        color: token("--text-on-glass"),
                        textAlign: "left",
                        font: token("--t-button"),
                      }}
                    >
                      {option}
                    </Pressable>
                  ))}
                </div>
              </GlassPanel>
            )}
            {activeAction.followup.kind === "site-types" && (
              <GlassPanel
                eyebrow={"Exploration"}
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
              >
                <div
                  data-exploration-site-type-choices=""
                  role="group"
                  aria-label={"Choose a site to add to this Dreamscape"}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isDesktop
                      ? `repeat(${String(activeAction.followup.choices.length)}, minmax(0, 1fr))`
                      : "1fr",
                    placeItems: "center",
                    gap: isDesktop ? token("--space-xl") : token("--space-m"),
                    padding: isDesktop
                      ? token("--space-2xl")
                      : token("--space-l"),
                  }}
                >
                  {activeAction.followup.choices.map((choice, index) => (
                    <motion.div
                      key={choice.siteType}
                      data-exploration-site-type-choice={choice.siteType}
                      initial={
                        reduceMotion
                          ? { opacity: 1, scale: 1 }
                          : { opacity: 0, scale: 0.88 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: reduceMotion
                          ? 0
                          : index * REWARD_STAGGER_SECONDS,
                        duration: reduceMotion
                          ? 0
                          : motionTimeSeconds("--dur-base"),
                        ease: DREAM_EASE,
                      }}
                      style={{
                        position: "relative",
                        width: 180,
                        height: 180,
                      }}
                    >
                      <SiteNode
                        model={choice.model}
                        motion={!reduceMotion}
                        presentation="choice"
                        onSelect={() =>
                          onResolve(activeAction.id, {
                            siteType: choice.siteType,
                          })
                        }
                      />
                    </motion.div>
                  ))}
                </div>
              </GlassPanel>
            )}
            {activeAction.followup.kind === "dreamsign-flow" &&
              (() => {
                const followup = activeAction.followup;
                const showOffered =
                  followup.mode === "replace-with-offered" ||
                  (followup.mode === "gain-offered" &&
                    selectedOfferedDreamsignId === null);
                const showHeld =
                  followup.mode === "replace-with-offered" ||
                  (followup.mode === "gain-offered" &&
                    selectedOfferedDreamsignId !== null) ||
                  followup.mode === "purge-and-gain-random";
                const choosingPurge =
                  followup.mode === "purge-and-gain-random" &&
                  selectedPurgedDreamsignId === null;
                const heldChoices =
                  choosingPurge || selectedPurgedDreamsignId === null
                    ? followup.held
                    : followup.held.filter(
                        (dreamsign) =>
                          dreamsign.id !== selectedPurgedDreamsignId,
                      );
                const showConfirm =
                  followup.mode === "replace-with-offered" ||
                  (followup.mode === "gain-offered" &&
                    selectedOfferedDreamsignId !== null) ||
                  (followup.mode === "purge-and-gain-random" &&
                    selectedPurgedDreamsignId !== null);
                const requiredSelections =
                  followup.mode === "replace-with-offered"
                    ? 2
                    : followup.mode === "gain-offered"
                      ? 1 + followup.requiredOverflowReplacementCount
                      : 1 + followup.requiredOverflowReplacementCount;
                const selectedSelections =
                  (selectedOfferedDreamsignId === null ? 0 : 1) +
                  (selectedPurgedDreamsignId === null ? 0 : 1) +
                  selectedDreamsignReplacementIds.length;
                return (
                  <div
                    ref={dreamsignFlowRef}
                    data-exploration-dreamsign-flow={followup.mode}
                    data-exploration-dreamsign-flow-step={dreamsignFlowStep}
                    data-exploration-required-overflow-replacements={
                      followup.requiredOverflowReplacementCount
                    }
                    style={{ width: "100%", minHeight: 0 }}
                  >
                    <GlassPanel
                      eyebrow={"Exploration"}
                      title={followup.title}
                      subtitle={followup.subtitle}
                      headingLevel="h1"
                      footer={
                        showConfirm ? (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              padding: token("--space-m"),
                            }}
                          >
                            <GlassButton
                              label={"Confirm Choice"}
                              variant="accent"
                              placement="onGlass"
                              disabled={!canCommitFollowup}
                              onPress={commitDreamsignFlow}
                              testId="cumulus-exploration-followup-confirm"
                            />
                          </div>
                        ) : undefined
                      }
                    >
                      <span
                        role="status"
                        aria-live="polite"
                        aria-label={`${formatNumber(selectedSelections)} of ${formatNumber(requiredSelections)} Dreamsign choices selected`}
                      />
                      <div
                        data-exploration-dreamsign-choice-groups=""
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            isDesktop && showOffered && showHeld
                              ? "repeat(2, minmax(0, 1fr))"
                              : "minmax(0, 1fr)",
                          gap: isDesktop
                            ? token("--space-2xl")
                            : token("--space-l"),
                          maxHeight: "min(64dvh, 620px)",
                          overflow: "auto",
                          padding: isDesktop
                            ? token("--space-2xl")
                            : token("--space-m"),
                        }}
                      >
                        {showOffered && (
                          <ExplorationDreamsignChoiceGroup
                            heading={"Offered Dreamsigns"}
                            role="offered"
                            dreamsigns={followup.offered}
                            selectedIds={
                              selectedOfferedDreamsignId === null
                                ? []
                                : [selectedOfferedDreamsignId]
                            }
                            isDesktop={isDesktop}
                            onChoose={chooseOfferedDreamsign}
                          />
                        )}
                        {showHeld && (
                          <ExplorationDreamsignChoiceGroup
                            heading={
                              choosingPurge
                                ? "Choose a Dreamsign to Purge"
                                : "Choose a Dreamsign to Replace"
                            }
                            role={
                              choosingPurge
                                ? "purge"
                                : followup.mode === "replace-with-offered"
                                  ? "exchange"
                                  : "replacement"
                            }
                            dreamsigns={heldChoices}
                            selectedIds={
                              choosingPurge
                                ? selectedPurgedDreamsignId === null
                                  ? []
                                  : [selectedPurgedDreamsignId]
                                : selectedDreamsignReplacementIds
                            }
                            isDesktop={isDesktop}
                            onChoose={chooseHeldDreamsign}
                          />
                        )}
                      </div>
                    </GlassPanel>
                  </div>
                );
              })()}
            {activeAction.followup.kind === "dreamsigns" && (
              <GlassPanel
                eyebrow={"Exploration"}
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
                    padding: isDesktop
                      ? token("--space-2xl")
                      : token("--space-m"),
                  }}
                >
                  {activeAction.followup.dreamsigns.map((dreamsign) => (
                    <div
                      key={dreamsign.id}
                      style={{
                        width: isDesktop
                          ? DESKTOP_DREAMSIGN_CHOICE_SIZE
                          : MOBILE_DREAMSIGN_CHOICE_SIZE,
                        height: isDesktop
                          ? DESKTOP_DREAMSIGN_CHOICE_SIZE
                          : MOBILE_DREAMSIGN_CHOICE_SIZE,
                      }}
                    >
                      <Dreamsign
                        dreamsign={dreamsign}
                        testid={`cumulus-exploration-dreamsign-${dreamsign.id}`}
                        onPress={() => chooseDreamsign(dreamsign.id)}
                      />
                    </div>
                  ))}
                </div>
              </GlassPanel>
            )}
            {activeAction.followup.kind === "avatars" && (
              <GlassPanel
                eyebrow={"Exploration"}
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
              >
                <div
                  data-exploration-avatar-choices=""
                  role="group"
                  aria-label={activeAction.followup.subtitle}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isDesktop
                      ? "repeat(3, minmax(0, 1fr))"
                      : "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: isDesktop ? token("--space-xl") : token("--space-m"),
                    placeItems: "center",
                    padding: isDesktop
                      ? token("--space-2xl")
                      : token("--space-m"),
                    overflow: "auto",
                  }}
                >
                  {activeAction.followup.avatars.map((avatar) => (
                    <div
                      key={avatar.id}
                      data-exploration-avatar-choice={avatar.id}
                      style={{
                        display: "grid",
                        justifyItems: "center",
                        gap: token("--space-xs"),
                        color: token("--text-on-glass"),
                        textAlign: "center",
                      }}
                    >
                      <div style={{ width: isDesktop ? 196 : 150 }}>
                        <AvatarPortrait
                          avatar={{
                            ...avatar,
                            name: avatar.name,
                            title: avatar.title,
                          }}
                          variant="panel"
                          profile={{
                            id: avatar.id,
                            ability: avatar.renderedText,
                          }}
                          onPress={() =>
                            onResolve(activeAction.id, {
                              avatarId: avatar.id,
                            })
                          }
                        />
                      </div>
                      <div
                        style={{ display: "grid", gap: token("--space-xxs") }}
                      >
                        <strong style={{ font: token("--t-button") }}>
                          {avatar.name}
                        </strong>
                        <span
                          style={{
                            font: token("--t-caption"),
                            color: token("--text-on-glass-muted"),
                          }}
                        >
                          {avatar.title}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            )}
          </motion.section>
        )}
    </div>
  );
}

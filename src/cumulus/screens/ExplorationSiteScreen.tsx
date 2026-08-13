import { localizedSourceText } from "../../runtime/localization/runtime";
// ExplorationSiteScreen — Layaway draws one possibility from the player's
// deck anchor, flips it face up, and holds it in the encounter panel.

import {
  meaning,
  opaque,
  txa,
  tx,
  plural,
  one,
  other,
  type LocalizedString,
} from "@trox/runtime";
import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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
import { renderRulesSymbolsInline } from "../components/card/RulesText";
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
import { IconButton } from "../components/controls/IconButton";
import {
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
  JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP,
} from "../components/hud/JourneyStatusBar";
import {
  Dreamsign,
  dreamsignRevealSpec,
  type LocalizedDreamsign,
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
import { useLocalizer } from "../../runtime/localization/use-localizer";
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
import type { CardType, FrozenCardData } from "../../types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DreamAvatar,
  TransfigurationType,
} from "../../types/journey";
import type { ExplorationChoosableSiteType } from "../../data/exploration";
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
  narrative: LocalizedString;
  /** The authored actions for this encounter, in reveal order. */
  actions: readonly ExplorationActionView[];
  /** Persisted action identity after one choice has resolved. */
  resolvedActionId: string | null;
  /** Exact UUID-backed objects granted by the persisted resolution. */
  reward: ExplorationRewardView | null;
  /** Semantic outcome variant presented for logging and browser QA. */
  outcomeKind: string | null;
}

export interface ExplorationTransfigurationChangeView {
  readonly entryId: string;
  readonly cardId: string;
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
  readonly entryId: string;
  readonly cardId: string;
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
        readonly dreamsigns: readonly LocalizedDreamsign[];
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
      readonly dreamsign: LocalizedDreamsign;
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
    }
  | {
      readonly kind: "shop-modifier";
      readonly modifier: "free-next-shop" | "free-purchases";
      readonly sourceSiteId: string;
      readonly sourceActionId: string;
      readonly freePurchaseCount?: number;
      readonly essenceBefore?: number;
      readonly essenceSpent?: number;
      readonly essenceAfter?: number;
    }
  | {
      readonly kind: "site-insertion";
      readonly sourceKind: "add-fixed-site" | "choose-site-type";
      readonly targetNodeId: string;
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
      readonly before: readonly LocalizedDreamsign[];
      readonly after: readonly LocalizedDreamsign[];
      /** Offered choices revealed before resolution, when the effect had offers. */
      readonly offered: readonly LocalizedDreamsign[];
      /** Persisted gained and purged identities, including random outcomes. */
      readonly gained: readonly LocalizedDreamsign[];
      readonly purged: readonly LocalizedDreamsign[];
      /** Exact persisted replacement pairings in mutation order. */
      readonly replacements: readonly {
        readonly removed: LocalizedDreamsign;
        readonly gained: LocalizedDreamsign;
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
      readonly before: readonly LocalizedDreamsign[];
      readonly after: readonly LocalizedDreamsign[];
      readonly offered: readonly LocalizedDreamsign[];
      readonly gained: readonly LocalizedDreamsign[];
      readonly purged: readonly LocalizedDreamsign[];
      readonly replacements: readonly {
        readonly removed: LocalizedDreamsign;
        readonly gained: LocalizedDreamsign;
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
        readonly entryId: string;
        readonly cardId: string;
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
        readonly entryId: string;
        readonly cardId: string;
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
      readonly sourceKind:
        "change-random-card-type" | "change-card-type-selected";
      /** Exact persisted before-to-after type changes in prepared target order. */
      readonly changes: readonly {
        readonly entryId: string;
        readonly cardId: string;
        readonly beforeCardType: CardType;
        readonly afterCardType: CardType;
        readonly beforeTypeChange: CardTypeChange | null;
        readonly afterTypeChange: CardTypeChange;
        readonly before: ExplorationCardChoiceView;
        readonly after: ExplorationCardChoiceView;
      }[];
    };

interface ExplorationDeckModificationViewBase {
  /** Complete authored effect copy or localized fallback exposed to assistive technology. */
  readonly announcement: LocalizedString;
  /** Exact post-resolution snapshots of the affected deck entries. */
  readonly cards: readonly ExplorationCardChoiceView[];
  /** Exact Reclaim cost by deck-entry UUID for the Reclaim outcome. */
  readonly reclaimCostByEntryId?: Readonly<Record<string, number>>;
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
      readonly subtype: string | null;
    })
  | (ExplorationDeckModificationViewBase & {
      readonly kind: "reclaim";
    })
  | (ExplorationDeckModificationViewBase & {
      /** Fixed form applied to every affected deck entry. */
      readonly kind: "transfiguration";
      readonly transfiguration: TransfigurationType;
      readonly formName: LocalizedString;
      readonly essenceSpent: number;
    });

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
      readonly kind: "multi-card-transfiguration";
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
      readonly count: number;
      readonly candidates: readonly TransfigurationCandidateView[];
    }
  | {
      readonly kind: "cards";
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
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
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
      readonly packs: readonly {
        readonly index: number;
        readonly cards: readonly ExplorationCardChoiceView[];
      }[];
    }
  | {
      readonly kind: "subtypes";
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
      readonly options: readonly string[];
    }
  | {
      readonly kind: "dreamsigns";
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
      readonly selectionKey: "replacedDreamsignId" | "dreamsignId";
      readonly dreamsigns: readonly LocalizedDreamsign[];
    }
  | {
      readonly kind: "dreamsign-flow";
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
      readonly mode:
        "gain-offered" | "replace-with-offered" | "purge-and-gain-random";
      /** Prepared player-visible offers. Random results are never included here. */
      readonly offered: readonly LocalizedDreamsign[];
      /** UUID-keyed collection snapshot from which purge/replacement choices come. */
      readonly held: readonly LocalizedDreamsign[];
      /** Exact number of additional held Dreamsigns that must leave for capacity. */
      readonly requiredOverflowReplacementCount: number;
    }
  | {
      readonly kind: "dreamAvatars";
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
      readonly dreamAvatars: readonly DreamAvatar[];
    }
  | {
      readonly kind: "site-types";
      readonly title: LocalizedString;
      readonly subtitle: LocalizedString;
      readonly choices: readonly {
        readonly siteType: ExplorationChoosableSiteType;
        readonly model: DreamscapeSiteModel;
      }[];
    };

export interface ExplorationActionView {
  readonly id: string;
  readonly effectKind: string;
  readonly mechanics: Readonly<Record<string, unknown>>;
  readonly label: LocalizedString;
  readonly effectText: LocalizedString;
  readonly effectParts?: readonly ExplorationActionEffectPart[];
  /** Code-authored disclosure rendered as a complete localized message. */
  readonly effectDisclosure?: LocalizedString;
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
      /** Prepared deck-entry UUID when this entity discloses a concrete deck object. */
      readonly entryId?: string;
      readonly copies?: number;
      readonly transfiguration?: CardTransfigurationDisplay;
    }
  | {
      readonly kind: "dreamsign";
      readonly dreamsign: LocalizedDreamsign;
    };

export type ExplorationActionEffectPart =
  | { readonly kind: "card-type"; readonly cardType: CardType }
  | { readonly kind: "entity"; readonly entity: ExplorationEntityView };

export interface ExplorationEffectFallback {
  readonly message: LocalizedString;
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
  readonly destinationKind:
    "journey-deck" | "journey-dreamsign" | "viewport-corner";
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
  readonly entryId?: string;
  readonly name: LocalizedString;
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
        name: localizedSourceText(entity.card.name),
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
        entityType:
          details.copies === 1
            ? ("game-card" as const)
            : ("game-card-copies" as const),
        entityId: entity.card.id,
      },
      spec:
        details.copies === 1
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

function explorationDeckModificationHeadline(
  modification: ExplorationDeckModificationView,
): LocalizedString {
  switch (modification.kind) {
    case "spark":
      return txa(
        "+{amount} ✦",
        { amount: modification.amount },
        "Compact headline in the radial announcement for an Exploration deck-wide Spark increase. amount is a finite positive integer displayed with the Spark glyph; the sign and glyph stay part of this complete visible message.",
      );
    case "fast":
      return tx(
        meaning("exploration-fast-result", "Fast"),
        "Compact headline in the radial announcement for an Exploration deck-wide Fast keyword grant. This visible message is paired with the bolt glyph.",
      );
    case "energy-cost":
      return txa(
        "−{amount} ●",
        { amount: modification.amount },
        "Compact headline in the radial announcement for an Exploration deck-wide Energy-cost reduction. amount is a finite non-negative integer displayed with the Energy glyph and a genuine minus sign.",
      );
    case "subtype":
      return modification.subtype === null
        ? tx(
            meaning("exploration-subtype-fallback", "Subtype"),
            "Compact fallback headline when an imported Exploration subtype result has no authored subtype value.",
          )
        : txa(
            meaning("exploration-subtype-result", "{subtype}"),
            { subtype: modification.subtype },
            "Compact headline for an Exploration deck subtype change. subtype is an opaque authored subtype name and is shown exactly as supplied.",
          );
    case "reclaim":
      return tx(
        "Reclaim",
        "Compact headline in the radial announcement for an Exploration Reclaim grant.",
      );
    case "transfiguration":
      return txa(
        "{form_name} · −{essence_amount} Essence",
        {
          form_name: opaque(modification.formName),
          essence_amount: modification.essenceSpent,
        },
        "Compact radial headline after a paid Exploration effect applies one fixed Transfiguration form to every eligible deck card. form_name is the canonical source display name of that form; essence_amount is the positive integer Essence cost already paid, and the genuine minus sign communicates the loss.",
      );
  }
}

function ExplorationChoiceContents({
  action,
  index,
}: {
  readonly action: ExplorationActionView;
  readonly index: number;
}) {
  const resolve = useLocalizer();
  const effectDescription =
    action.effectFallback === undefined && action.effectParts !== undefined
      ? renderExplorationEffectDescription(
          action.effectText,
          action.effectParts,
          index,
          resolve,
        )
      : renderRulesSymbolsInline(
          resolve(action.effectFallback?.message ?? action.effectText),
        );
  return (
    <>
      <span style={{ minWidth: 0, display: "grid", gap: token("--space-xxs") }}>
        <strong style={{ font: token("--t-button") }}>
          {renderRulesSymbolsInline(resolve(action.label))}
        </strong>
        <span
          id={`exploration-effect-${String(index)}`}
          style={{ font: token("--t-caption"), color: token("--text-muted") }}
        >
          {effectDescription}
          {action.effectDisclosure === undefined ? null : (
            <span> {resolve(action.effectDisclosure)}</span>
          )}
        </span>
      </span>
      <span aria-hidden="true" style={{ font: token("--t-title") }}>
        ›
      </span>
    </>
  );
}

interface ExplorationEffectToken {
  readonly start: number;
  readonly end: number;
  readonly part: ExplorationActionEffectPart;
  readonly partIndex: number;
}

function renderExplorationEffectDescription(
  message: LocalizedString,
  parts: readonly ExplorationActionEffectPart[],
  choiceIndex: number,
  resolve: (message: LocalizedString) => string,
): readonly ReactNode[] {
  const text = resolve(message);
  const nextStartByLabel = new Map<string, number>();
  const candidates = parts
    .flatMap((part, partIndex): ExplorationEffectToken[] => {
      const label =
        part.kind === "card-type"
          ? part.cardType
          : resolve(explorationEntityDetails(part.entity).name);
      const start = text.indexOf(label, nextStartByLabel.get(label) ?? 0);
      if (start >= 0) nextStartByLabel.set(label, start + label.length);
      return start < 0
        ? []
        : [{ start, end: start + label.length, part, partIndex }];
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const tokens: ExplorationEffectToken[] = [];
  for (const candidate of candidates) {
    const previous = tokens[tokens.length - 1];
    if (previous === undefined || candidate.start >= previous.end) {
      tokens.push(candidate);
    }
  }

  if (tokens.length === 0) return [renderRulesSymbolsInline(text)];

  const rendered: ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) {
      rendered.push(
        <span key={`text-${String(cursor)}`}>
          {renderRulesSymbolsInline(text.slice(cursor, token.start))}
        </span>,
      );
    }
    if (token.part.kind === "card-type") {
      rendered.push(
        <span
          key={`card-type-${String(token.partIndex)}`}
          data-exploration-card-type-variable=""
          data-card-type={token.part.cardType}
        >
          {renderRulesSymbolsInline(text.slice(token.start, token.end))}
        </span>,
      );
    } else {
      rendered.push(
        <ExplorationEntityLabel
          key={`entity-${String(token.partIndex)}`}
          entity={token.part.entity}
          data-testid={`cumulus-exploration-choice-${String(choiceIndex)}-entity-${String(token.partIndex)}`}
        />,
      );
    }
    cursor = token.end;
  }
  if (cursor < text.length) {
    rendered.push(
      <span key={`text-${String(cursor)}`}>
        {renderRulesSymbolsInline(text.slice(cursor))}
      </span>,
    );
  }
  return rendered;
}

function ExplorationEntityLabel({
  entity,
  "data-testid": testId,
}: {
  readonly entity: ExplorationEntityView;
  readonly "data-testid": string;
}) {
  const resolve = useLocalizer();
  const details = explorationEntityDetails(entity);
  return (
    <span
      data-exploration-entity-label={entity.kind}
      data-entity-id={details.id}
      data-exploration-deck-entry-id={details.entryId}
      data-entity-copies={details.copies}
      data-testid={testId}
    >
      <span style={{ textDecoration: "underline" }}>
        {resolve(details.name)}
      </span>
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
      data-exploration-action-id={action.id}
      data-exploration-effect-kind={action.effectKind}
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
      data-exploration-action-id={action.id}
      data-exploration-effect-kind={action.effectKind}
      data-exploration-entity-preview={entity.kind}
      data-entity-id={details.id}
      data-exploration-deck-entry-id={details.entryId}
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
      readonly dreamsign: LocalizedDreamsign;
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
  readonly narrative: LocalizedString;
  readonly actions: ExplorationSiteView["actions"];
  readonly reduceMotion: boolean;
  readonly onActivate: (action: ExplorationActionView) => void;
}) {
  const resolve = useLocalizer();
  const localizedNarrative = resolve(narrative);
  const characters = useMemo(
    () => Array.from(localizedNarrative),
    [localizedNarrative],
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
        aria-label={localizedNarrative}
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
          {localizedNarrative}
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
        aria-label={resolve(
          tx(
            "Exploration choices",
            "Accessible name for the group containing the available choices beneath an Exploration site's authored narrative. The current player activates one choice to resolve the site.",
          ),
        )}
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
                duration: reduceMotion ? 0 : motionTimeSeconds("--dur-base"),
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
        reward.model.site.id,
        reward.model.site.type,
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

function CardReplacementPresentation({
  pair,
  index,
  isDesktop,
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
  const resolve = useLocalizer();
  const cardWidth = isDesktop
    ? DESKTOP_ESSENCE_CARD_WIDTH
    : MOBILE_ESSENCE_CARD_WIDTH;
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
      aria-label={resolve(
        scope === "starter"
          ? txa(
              "Starter card {purged_card_name} replaced by {gained_card_name}",
              {
                purged_card_name: pair.purged.model.displaySnapshot.name,
                gained_card_name: pair.gained.model.displaySnapshot.name,
              },
              "Accessible name for one persisted starter-card replacement. Both names are canonical UUID-resolved authored card names.",
            )
          : txa(
              "{purged_card_name} replaced by {gained_card_name}",
              {
                purged_card_name: pair.purged.model.displaySnapshot.name,
                gained_card_name: pair.gained.model.displaySnapshot.name,
              },
              "Accessible name for one persisted card replacement. Both names are canonical UUID-resolved authored card names.",
            ),
      )}
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
      <GlassPanel
        radius="popover"
        testId={`cumulus-exploration-${scope}-card-replacement-${String(index)}`}
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
            data-exploration-card-replacement-object="purged"
            data-exploration-starter-card-mutation-object={
              scope === "starter" ? "purged" : undefined
            }
            data-exploration-deck-entry-id={pair.purged.entryId}
            data-card-id={pair.purged.model.cardId}
            style={{ width: cardWidth, aspectRatio: CARD_ASPECT_RATIO }}
          >
            <GameCard
              model={pair.purged.model}
              selection="danger"
              testId={`cumulus-exploration-${scope}-card-purged-${pair.purged.entryId}`}
            />
          </div>
          <span
            data-exploration-card-replacement-arrow=""
            data-exploration-starter-card-replacement-arrow={
              scope === "starter" ? "" : undefined
            }
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
            data-exploration-card-replacement-object="gained"
            data-exploration-starter-card-mutation-object={
              scope === "starter" ? "gained" : undefined
            }
            data-exploration-deck-entry-id={pair.gained.entryId}
            data-card-id={pair.gained.model.cardId}
            style={{ width: cardWidth, aspectRatio: CARD_ASPECT_RATIO }}
          >
            <GameCard
              model={pair.gained.model}
              selection="changed"
              testId={`cumulus-exploration-${scope}-card-gained-${pair.gained.entryId}`}
            />
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

function CardTransfigurationPairPresentation({
  mapping,
  index,
  phase,
  isDesktop,
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
  const resolve = useLocalizer();
  const cardWidth = isDesktop
    ? DESKTOP_ESSENCE_CARD_WIDTH
    : MOBILE_ESSENCE_CARD_WIDTH;
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
      aria-label={resolve(
        scope === "starter"
          ? txa(
              "Starter card {card_name} transfigured into its {form_name} form",
              {
                card_name: mapping.before.model.displaySnapshot.name,
                form_name: mapping.after.model.transfiguration.form.name,
              },
              "Accessible name for one persisted starter-card Transfiguration mapping. card_name and form_name are canonical UUID-resolved authored names.",
            )
          : txa(
              "{card_name} transfigured into its {form_name} form",
              {
                card_name: mapping.before.model.displaySnapshot.name,
                form_name: mapping.after.model.transfiguration.form.name,
              },
              "Accessible name for one persisted card Transfiguration mapping. card_name and form_name are canonical UUID-resolved authored names.",
            ),
      )}
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
      <GlassPanel
        radius="popover"
        testId={`cumulus-exploration-${scope}-card-transfiguration-${String(index)}`}
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
            data-exploration-card-transfiguration-face="before"
            data-exploration-starter-card-transfiguration-face={
              scope === "starter" ? "before" : undefined
            }
            data-exploration-deck-entry-id={mapping.entryId}
            data-card-id={mapping.cardId}
            data-transfiguration="none"
            style={{ width: cardWidth, aspectRatio: CARD_ASPECT_RATIO }}
          >
            <GameCard
              model={mapping.before.model}
              testId={`cumulus-exploration-${scope}-card-before-${mapping.entryId}`}
            />
          </div>
          <span
            data-exploration-card-transfiguration-arrow=""
            data-exploration-starter-card-transfiguration-arrow={
              scope === "starter" ? "" : undefined
            }
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
          <motion.div
            data-exploration-card-transfiguration-face="after"
            data-exploration-starter-card-transfiguration-face={
              scope === "starter" ? "after" : undefined
            }
            data-exploration-deck-entry-id={mapping.entryId}
            data-card-id={mapping.cardId}
            data-transfiguration={mapping.afterTransfiguration}
            initial={false}
            animate={{ rotateY: revealAfter ? 180 : 0 }}
            transition={{
              delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
              duration: reduceMotion ? 0 : FLIP_SECONDS,
              ease: DREAM_EASE,
            }}
            style={{
              position: "relative",
              width: cardWidth,
              aspectRatio: CARD_ASPECT_RATIO,
              transformStyle: "preserve-3d",
              perspective: 1200,
            }}
          >
            <div
              data-exploration-card-transfiguration-side="concealed"
              data-exploration-starter-card-transfiguration-side={
                scope === "starter" ? "concealed" : undefined
              }
              aria-hidden={revealAfter}
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
              }}
            >
              <CardBack
                label={tx(
                  "Exploration card, face down",
                  "Player-facing message for the exploration card face down interface state.",
                )}
                testId={`cumulus-exploration-${scope}-card-concealed-${mapping.entryId}`}
              />
            </div>
            <div
              data-exploration-card-transfiguration-side="revealed"
              data-exploration-starter-card-transfiguration-side={
                scope === "starter" ? "revealed" : undefined
              }
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <GameCard
                model={mapping.after.model}
                selection="transfigured"
                testId={`cumulus-exploration-${scope}-card-after-${mapping.entryId}`}
              />
            </div>
          </motion.div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

function CompoundCardPairPresentation({
  before,
  after,
  index,
  kind,
  isDesktop,
  reduceMotion,
}: {
  readonly before: ExplorationCardChoiceView;
  readonly after: ExplorationCardChoiceView;
  readonly index: number;
  readonly kind: "keyword" | "copy";
  readonly isDesktop: boolean;
  readonly reduceMotion: boolean;
}) {
  const resolve = useLocalizer();
  const cardWidth = isDesktop
    ? DESKTOP_ESSENCE_CARD_WIDTH
    : MOBILE_ESSENCE_CARD_WIDTH;
  return (
    <motion.div
      data-exploration-compound-card-pair={kind}
      data-source-entry-id={before.entryId}
      data-source-card-id={before.model.cardId}
      data-result-entry-id={after.entryId}
      data-result-card-id={after.model.cardId}
      role="group"
      aria-label={resolve(
        kind === "keyword"
          ? txa(
              "{source_card_name} became Fast as {result_card_name}",
              {
                source_card_name: before.model.displaySnapshot.name,
                result_card_name: after.model.displaySnapshot.name,
              },
              "Accessible name for one persisted Fast keyword mutation. Both values are UUID-resolved authored card names and may match.",
            )
          : txa(
              "{source_card_name} copied as {result_card_name}",
              {
                source_card_name: before.model.displaySnapshot.name,
                result_card_name: after.model.displaySnapshot.name,
              },
              "Accessible name for one persisted source-to-copy mapping. Both values are UUID-resolved authored card names and may match.",
            ),
      )}
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
      <GlassPanel
        radius="popover"
        testId={`cumulus-exploration-compound-${kind}-pair-${String(index)}`}
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
            data-exploration-compound-card-face="before"
            data-exploration-deck-entry-id={before.entryId}
            data-card-id={before.model.cardId}
            style={{ width: cardWidth, aspectRatio: CARD_ASPECT_RATIO }}
          >
            <GameCard model={before.model} />
          </div>
          <span
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
            data-exploration-compound-card-face="after"
            data-exploration-deck-entry-id={after.entryId}
            data-card-id={after.model.cardId}
            style={{ width: cardWidth, aspectRatio: CARD_ASPECT_RATIO }}
          >
            <GameCard
              model={after.model}
              selection={kind === "keyword" ? "changed" : "copied"}
            />
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

function CardTypeChangePairPresentation({
  change,
  index,
  phase,
  isDesktop,
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
  const resolve = useLocalizer();
  const cardWidth = isDesktop
    ? DESKTOP_ESSENCE_CARD_WIDTH
    : MOBILE_ESSENCE_CARD_WIDTH;
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
      aria-label={resolve(
        txa(
          "{card_name} changed from {before_card_type} to {after_card_type}",
          {
            card_name: change.before.model.displaySnapshot.name,
            before_card_type: change.beforeCardType,
            after_card_type: change.afterCardType,
          },
          "Accessible name for one persisted card-type mapping. card_name is the canonical UUID-resolved display name; before_card_type and after_card_type are the closed Character or Event card-type values.",
        ),
      )}
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
      <GlassPanel
        radius="popover"
        testId={`cumulus-exploration-card-type-change-${String(index)}`}
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
            data-exploration-card-type-change-face="before"
            data-exploration-deck-entry-id={change.entryId}
            data-card-id={change.cardId}
            data-card-type={change.beforeCardType}
            style={{ width: cardWidth, aspectRatio: CARD_ASPECT_RATIO }}
          >
            <GameCard
              model={change.before.model}
              testId={`cumulus-exploration-card-type-before-${change.entryId}`}
            />
          </div>
          <span
            data-exploration-card-type-change-arrow=""
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
          <motion.div
            data-exploration-card-type-change-face="after"
            data-exploration-deck-entry-id={change.entryId}
            data-card-id={change.cardId}
            data-card-type={change.afterCardType}
            initial={false}
            animate={{ rotateY: revealAfter ? 180 : 0 }}
            transition={{
              delay: reduceMotion ? 0 : index * REWARD_STAGGER_SECONDS,
              duration: reduceMotion ? 0 : FLIP_SECONDS,
              ease: DREAM_EASE,
            }}
            style={{
              position: "relative",
              width: cardWidth,
              aspectRatio: CARD_ASPECT_RATIO,
              transformStyle: "preserve-3d",
              perspective: 1200,
            }}
          >
            <div
              data-exploration-card-type-change-side="concealed"
              aria-hidden={revealAfter}
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
              }}
            >
              <CardBack
                label={tx(
                  "Exploration card, face down",
                  "Player-facing message for the exploration card face down interface state.",
                )}
                testId={`cumulus-exploration-card-type-concealed-${change.entryId}`}
              />
            </div>
            <div
              data-exploration-card-type-change-side="revealed"
              style={{
                position: "absolute",
                inset: 0,
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <GameCard
                model={change.after.model}
                selection="changed"
                testId={`cumulus-exploration-card-type-after-${change.entryId}`}
              />
            </div>
          </motion.div>
        </div>
      </GlassPanel>
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
  readonly removed: LocalizedDreamsign;
  readonly gained: LocalizedDreamsign;
  readonly index: number;
  readonly isDesktop: boolean;
  readonly reduceMotion: boolean;
}) {
  const resolve = useLocalizer();
  const dreamsignSize = isDesktop
    ? DESKTOP_REPLACEMENT_DREAMSIGN_SIZE
    : MOBILE_REPLACEMENT_DREAMSIGN_SIZE;
  return (
    <motion.div
      data-exploration-dreamsign-replacement=""
      data-removed-dreamsign-id={removed.id}
      data-gained-dreamsign-id={gained.id}
      role="group"
      aria-label={resolve(
        txa(
          "{removed_dreamsign_name} replaced by {gained_dreamsign_name}",
          {
            removed_dreamsign_name: opaque(removed.name),
            gained_dreamsign_name: opaque(gained.name),
          },
          "Accessible name for one persisted Exploration Dreamsign replacement pair. removed_dreamsign_name and gained_dreamsign_name are canonical display names with unknown grammatical gender.",
        ),
      )}
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
              {resolve(removed.name)}
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
              {resolve(gained.name)}
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
  readonly heading: LocalizedString;
  readonly role: "offered" | "exchange" | "purge" | "replacement";
  readonly dreamsigns: readonly LocalizedDreamsign[];
  readonly selectedIds: readonly string[];
  readonly isDesktop: boolean;
  readonly onChoose: (dreamsignId: string) => void;
}) {
  const resolve = useLocalizer();
  return (
    <section
      data-dreamsign-choice-role={role}
      aria-label={resolve(heading)}
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
        {resolve(heading)}
      </strong>
      <div
        role="group"
        aria-label={resolve(heading)}
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
  const resolve = useLocalizer();
  const reduceMotion = useReducedMotion() === true;
  const isDesktop = useIsDesktop();
  const cardTargetRef = useRef<HTMLDivElement>(null);
  const exitCompletedRef = useRef(false);
  const resumedResolutionRef = useRef<string | null>(null);
  const rewardItemRefs = useRef(new Map<string, HTMLDivElement>());
  const cardCopyRefs = useRef(new Map<string, HTMLDivElement>());
  const transfigurationCardRef = useRef<HTMLDivElement>(null);
  const starterCardTransfigurationPairsRef = useRef<HTMLElement>(null);
  const cardReplacementPairsRef = useRef<HTMLElement>(null);
  const dreamsignFlowRef = useRef<HTMLDivElement>(null);
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
  const [selectedOfferedDreamsignId, setSelectedOfferedDreamsignId] = useState<
    string | null
  >(null);
  const [selectedPurgedDreamsignId, setSelectedPurgedDreamsignId] = useState<
    string | null
  >(null);
  const [selectedDreamsignReplacementIds, setSelectedDreamsignReplacementIds] =
    useState<readonly string[]>([]);
  const [purgeEntryId, setPurgeEntryId] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [selectedTransfigurationEntryId, setSelectedTransfigurationEntryId] =
    useState<string | null>(null);
  const [selectedTransfigurationFormType, setSelectedTransfigurationFormType] =
    useState<TransfigurationType | null>(null);
  const [multiTransfigurationStep, setMultiTransfigurationStep] = useState<
    number | null
  >(null);
  const [multiTransfigurationForms, setMultiTransfigurationForms] = useState<
    Readonly<Record<string, TransfigurationType>>
  >({});
  const [transfigurationConfirming, setTransfigurationConfirming] =
    useState(false);
  const [rewardTrajectories, setRewardTrajectories] = useState<ReadonlyMap<
    string,
    RewardTrajectory
  > | null>(null);
  const [cardCopiesPhase, setCardCopiesPhase] =
    useState<CardCopiesPhase>("original");
  const [purgeAndCopyPhase, setPurgeAndCopyPhase] =
    useState<PurgeAndCopyPhase>("purging");
  const [cardCopyTrajectories, setCardCopyTrajectories] = useState<ReadonlyMap<
    string,
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
  const dreamAvatarReward =
    effectReward?.kind === "dream-avatar" ? effectReward : null;
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
  const emptyObjectOutcomeMessage: LocalizedString =
    resolvedReward?.semanticKind === "card-purge"
      ? tx(
          "No cards were purged",
          "Completed Exploration outcome when a purge effect removed no cards.",
        )
      : tx(
          "No cards were taken",
          "Completed Exploration outcome when a card-acquisition effect added no cards.",
        );
  const rewardStageAnnouncement =
    purgedRewardCards.length === 0
      ? txa(
          plural(rewardItems.length, [
            one("Gained {reward_count} Reward"),
            other("Gained {reward_count} Rewards"),
          ]),
          { reward_count: rewardItems.length },
          "Accessible announcement after an Exploration choice grants reward objects and purges no cards. reward_count is a non-negative count and can be zero.",
        )
      : rewardItems.length === 0
        ? txa(
            plural(purgedRewardCards.length, [
              one("Purging {purged_card_count} Card"),
              other("Purging {purged_card_count} Cards"),
            ]),
            { purged_card_count: purgedRewardCards.length },
            "Accessible announcement while an Exploration outcome purges cards and grants no reward objects. purged_card_count is a positive count of cards being removed from the player's current deck.",
          )
        : txa(
            "Cards being purged: {purged_card_count}. Rewards being gained: {reward_count}.",
            {
              purged_card_count: purgedRewardCards.length,
              reward_count: rewardItems.length,
            },
            "Accessible announcement while one Exploration outcome both purges cards and grants rewards. The label-and-count sentences avoid coupling two independent plural systems. purged_card_count and reward_count are positive exact counts; both actions belong to the same resolved outcome.",
          );
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
    setSelectedIds([]);
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
        setSelectedIds([]);
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
        dreamAvatarReward === null &&
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
    dreamAvatarReward,
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

  const toggleCard = (entryId: string): void => {
    if (activeAction?.followup.kind === "multi-card-transfiguration") {
      if (multiTransfigurationStep !== null) return;
      const followup = activeAction.followup;
      if (selectedIds.includes(entryId)) {
        setSelectedIds((current) =>
          current.filter((candidate) => candidate !== entryId),
        );
        setMultiTransfigurationForms((forms) => {
          const remaining = { ...forms };
          delete remaining[entryId];
          return remaining;
        });
      } else if (selectedIds.length < followup.count) {
        setSelectedIds((current) => [...current, entryId]);
      }
      return;
    }
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
      if (
        selectedIds.length < followup.min ||
        selectedIds.length > followup.max
      )
        return;
      onResolve(activeAction.id, { [followup.selectionKey]: selectedIds });
      return;
    }
    if (followup.kind === "multi-card-transfiguration") {
      if (
        multiTransfigurationStep !== null ||
        selectedIds.length !== followup.count
      ) {
        return;
      }
      setMultiTransfigurationStep(0);
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

  const chooseOfferedDreamsign = (dreamsignId: string): void => {
    if (activeAction === null || dreamsignFlow === null) return;
    if (
      dreamsignFlow.mode === "gain-offered" &&
      dreamsignFlow.requiredOverflowReplacementCount === 0
    ) {
      onResolve(activeAction.id, { offeredDreamsignId: dreamsignId });
      return;
    }
    setSelectedOfferedDreamsignId((current) =>
      current === dreamsignId ? null : dreamsignId,
    );
  };

  const chooseHeldDreamsign = (dreamsignId: string): void => {
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
        ...(replacedDreamsignId === undefined ? {} : { replacedDreamsignId }),
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
        selectedIds.length === followup.count
      );
    }
    if (followup.kind === "cards") {
      return followup.mode === "purge-and-copy"
        ? purgeEntryId !== null && selectedIds.length === 1
        : selectedIds.length >= followup.min &&
            selectedIds.length <= followup.max;
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
                    label={tx(
                      "Delve",
                      "Player-facing message for the exploration delve action interface state.",
                    )}
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
                <CardBack
                  label={tx(
                    "Exploration card, face down",
                    "Player-facing message for the exploration card face down interface state.",
                  )}
                />
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
              <CardBack
                label={tx(
                  "Exploration card returning face down",
                  "Player-facing message for the exploration card returning face down interface state.",
                )}
              />
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
            ariaLabelMessage={tx(
              "Return to Exploration",
              "Accessible command on the full-screen Exploration artwork that collapses the expanded site and returns the current player to its choice view.",
            )}
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
            aria-label={resolve(
              txa(
                "Transfiguring {card_name} into its {form_name} form",
                {
                  card_name: transfigurationReward.before.displaySnapshot.name,
                  form_name:
                    transfigurationReward.after.transfiguration.form.name,
                },
                "Accessible announcement while an Exploration outcome transfigures one card. card_name is the canonical display name with unknown grammatical gender; form_name is the source-English name supplied by the Transfiguration catalog.",
              ),
            )}
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
            aria-label={resolve(
              txa(
                "Purging {purged_card_name} before copying {source_card_name}",
                {
                  purged_card_name:
                    purgeAndCopyReward.purgedCard.model.displaySnapshot.name,
                  source_card_name:
                    purgeAndCopyReward.source.model.displaySnapshot.name,
                },
                "Accessible announcement during the first phase of a compound Exploration outcome. purged_card_name is removed before a copy of source_card_name is made; both are canonical card display names with unknown grammatical gender.",
              ),
            )}
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
            aria-label={resolve(
              purgeAndCopyReward === null
                ? txa(
                    plural(cardCopiesReward.count, [
                      one("Gained {copy_count} copy"),
                      other("Gained {copy_count} copies"),
                    ]),
                    { copy_count: cardCopiesReward.count },
                    "Accessible announcement after Exploration duplicates one or more selected cards without purging another card. copy_count is a positive integer count of newly added physical deck entries.",
                  )
                : txa(
                    plural(cardCopiesReward.count, [
                      one(
                        "Purged {purged_card_name} and gained {copy_count} copy of {source_card_name}",
                      ),
                      other(
                        "Purged {purged_card_name} and gained {copy_count} copies of {source_card_name}",
                      ),
                    ]),
                    {
                      copy_count: cardCopiesReward.count,
                      purged_card_name:
                        purgeAndCopyReward.purgedCard.model.displaySnapshot
                          .name,
                      source_card_name:
                        purgeAndCopyReward.source.model.displaySnapshot.name,
                    },
                    "Accessible announcement after one Exploration outcome purges a card and adds copies of a different source card. purged_card_name and source_card_name are canonical display names with unknown grammatical gender; copy_count is the positive number of new physical deck entries.",
                  ),
            )}
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
            data-exploration-battle-modifier-amount={
              battleModifierReward.amount
            }
            data-exploration-battles-remaining={
              battleModifierReward.battlesRemaining
            }
            role="status"
            aria-label={resolve(
              battleModifierReward.modifier === "opening-hand"
                ? txa(
                    plural(battleModifierReward.amount, [
                      one(
                        "{amount} additional opening-hand card in the next battle",
                      ),
                      other(
                        "{amount} additional opening-hand cards in the next battle",
                      ),
                    ]),
                    { amount: battleModifierReward.amount },
                    "Accessible announcement for an Exploration reward adding opening-hand cards in the next battle. amount is a positive card count.",
                  )
                : txa(
                    "{amount} additional starting Energy in the next battle",
                    { amount: battleModifierReward.amount },
                    "Accessible announcement for an Exploration reward adding starting Energy in the next battle. amount is positive.",
                  ),
            )}
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
                  ? txa(
                      plural(battleModifierReward.amount, [
                        one("+{amount} Card"),
                        other("+{amount} Cards"),
                      ]),
                      { amount: battleModifierReward.amount },
                      "Compact headline for an Exploration opening-hand reward. amount is a positive card count.",
                    )
                  : txa(
                      "+{amount} ●",
                      { amount: battleModifierReward.amount },
                      "Compact headline for an Exploration starting-Energy reward. amount is positive and the dot is the canonical Energy symbol.",
                    )
              }
              detail={tx(
                "Next Battle",
                "Detail below the Exploration battle-modifier reward headline.",
              )}
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
            aria-label={resolve(
              txa(
                "Your next battle begins with {opening_hand_delta} Card and your cards cost {energy_cost_reduction} less Energy",
                {
                  opening_hand_delta:
                    smallerHandDiscountReward.openingHandDelta,
                  energy_cost_reduction:
                    smallerHandDiscountReward.energyCostReduction,
                },
                "Complete accessible summary for the Exploration reward that reduces both the current player's next opening hand and card Energy costs. opening_hand_delta is a negative integer card-count change, energy_cost_reduction is a positive integer Energy reduction, and both changes apply for the next battle.",
              ),
            )}
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
              headline={txa(
                "{opening_hand_delta} Card",
                {
                  opening_hand_delta:
                    smallerHandDiscountReward.openingHandDelta,
                },
                "Compact headline for that reward. opening_hand_delta is the negative integer change in the current player's next opening-hand card count.",
              )}
              detail={txa(
                "Next Battle · Cards cost {energy_cost_reduction} less Energy",
                {
                  energy_cost_reduction:
                    smallerHandDiscountReward.energyCostReduction,
                },
                "Compact detail below the opening-hand headline. energy_cost_reduction is the positive integer Energy reduction applied to every card in the next battle.",
              )}
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
            aria-label={resolve(
              txa(
                "{dream_avatar_name} is now your Dream Avatar",
                { dream_avatar_name: dreamAvatarReward.current.name },
                "Accessible announcement after an Exploration outcome changes the player's Dream Avatar. dream_avatar_name is the canonical display name with unknown grammatical gender; “your” addresses the current local player.",
              ),
            )}
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
                dreamAvatar={{
                  ...dreamAvatarReward.current,
                  name: localizedSourceText(dreamAvatarReward.current.name),
                  title: localizedSourceText(dreamAvatarReward.current.title),
                }}
                variant="panel"
              />
            </div>
            <div style={{ display: "grid", gap: token("--space-xxs") }}>
              <strong style={{ font: token("--t-title") }}>
                {resolve(localizedSourceText(dreamAvatarReward.current.name))}
              </strong>
              <span
                style={{
                  font: token("--t-body"),
                  color: token("--text-secondary"),
                }}
              >
                {dreamAvatarReward.current.title}
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
            aria-label={resolve(
              shopModifierReward.modifier === "free-next-shop"
                ? tx(
                    "Every item in your next Card Shop will be free.",
                    "Accessible announcement after Exploration queues the T56 visit-wide future Card Shop benefit.",
                  )
                : txa(
                    plural(shopModifierReward.freePurchaseCount ?? 0, [
                      one(
                        "Lost {essence_spent} Essence, from {essence_before} to {essence_after}, and gained {free_purchase_count} free purchase.",
                      ),
                      other(
                        "Lost {essence_spent} Essence, from {essence_before} to {essence_after}, and gained {free_purchase_count} free purchases.",
                      ),
                    ]),
                    {
                      free_purchase_count:
                        shopModifierReward.freePurchaseCount ?? 0,
                      essence_spent: shopModifierReward.essenceSpent ?? 0,
                      essence_before: shopModifierReward.essenceBefore ?? 0,
                      essence_after: shopModifierReward.essenceAfter ?? 0,
                    },
                    "Accessible announcement after Exploration grants a T82 purchase counter. free_purchase_count is the positive initial grant; essence_before, essence_spent, and essence_after are the exact non-negative values persisted by the same atomic resolution.",
                  ),
            )}
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
                  ? tx(
                      "Next Shop Free",
                      "Compact outcome headline after Exploration queues a visit-wide free Card Shop.",
                    )
                  : txa(
                      plural(shopModifierReward.freePurchaseCount ?? 0, [
                        one("{free_purchase_count} Free Purchase"),
                        other("{free_purchase_count} Free Purchases"),
                      ]),
                      {
                        free_purchase_count:
                          shopModifierReward.freePurchaseCount ?? 0,
                      },
                      "Compact outcome headline after Exploration grants counted free purchases. free_purchase_count is the positive initial count persisted by the action.",
                    )
              }
              detail={
                shopModifierReward.modifier === "free-next-shop"
                  ? tx(
                      "Every item in your next Card Shop is free.",
                      "Detail beneath the queued free-shop outcome headline. The benefit applies to successful item purchases during one future Card Shop visit.",
                    )
                  : txa(
                      "{essence_before} → {essence_after} Essence · {essence_spent} spent",
                      {
                        essence_before: shopModifierReward.essenceBefore ?? 0,
                        essence_after: shopModifierReward.essenceAfter ?? 0,
                        essence_spent: shopModifierReward.essenceSpent ?? 0,
                      },
                      "Detail beneath the counted free-purchase outcome. The three values are the exact non-negative shared Essence balances and amount spent by the same atomic resolution; the arrows expose the persisted before/after transition directly.",
                    )
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
            aria-label={resolve(
              tx(
                "Your next Draft or Shop will contain transfigured cards",
                "Accessible completed-event summary for an Exploration reward that causes the next Draft or Shop offered to the current player to contain transfigured cards.",
              ),
            )}
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
              headline={tx(
                "Transfigured Cards",
                "Headline for the same completed Exploration reward.",
              )}
              detail={tx(
                "Next Draft or Shop",
                "Compact detail naming where that reward takes effect.",
              )}
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
            data-exploration-site-id={siteInsertionReward.model.site.id}
            data-exploration-site-type={siteInsertionReward.model.site.type}
            data-exploration-target-node-id={siteInsertionReward.targetNodeId}
            data-exploration-insertion-index={
              siteInsertionReward.insertionIndex
            }
            role="status"
            aria-live="polite"
            aria-label={resolve(
              txa(
                "{site_type} added to this Dreamscape",
                { site_type: opaque(siteInsertionReward.model.label) },
                "Accessible completed-event summary after an Exploration action adds a site to the current Dreamscape. site_type is the configured display name of the exact persisted site type and has unknown grammatical gender.",
              ),
            )}
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
              headline={tx(
                "Site Added",
                "Visible reward announcement after an Exploration action adds one persisted site to the current Dreamscape.",
              )}
              detail={siteInsertionReward.model.label}
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-site-insertion:${siteInsertionReward.model.site.id}`}
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
            aria-label={resolve(emptyObjectOutcomeMessage)}
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
            aria-label={resolve(rewardStageAnnouncement)}
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
                ? resolve(
                    txa(
                      plural(deckModification.cards.length, [
                        one(
                          "Transfigured {card_count} eligible card into its {form_name} form and spent {essence_amount} Essence",
                        ),
                        other(
                          "Transfigured {card_count} eligible cards into their {form_name} forms and spent {essence_amount} Essence",
                        ),
                      ]),
                      {
                        card_count: deckModification.cards.length,
                        form_name: opaque(deckModification.formName),
                        essence_amount: deckModification.essenceSpent,
                      },
                      "Accessible completed-state announcement after one paid Exploration effect applies the same Transfiguration form to all eligible deck cards. card_count is the positive number of concrete deck entries changed; form_name is the form's canonical source display name; essence_amount is the positive integer Essence cost already deducted from the current player.",
                    ),
                  )
                : resolve(deckModification.announcement)
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
              headline={tx(
                "Essence Gained",
                "Headline on an Exploration reward announcement that grants Essence.",
              )}
              detail={txa(
                "{essence_after} Essence total",
                { essence_after: directEssenceReward.essenceAfter },
                "Detail below a direct Exploration Essence reward. essence_after is the non-negative shared Essence balance persisted after the reward resolves.",
              )}
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
            aria-label={resolve(
              txa(
                "Purging {card_name} for {essence_amount} Essence",
                {
                  card_name: cardPurgeReward.card.model.displaySnapshot.name,
                  essence_amount: cardPurgeReward.totalEssence,
                },
                "Accessible announcement while an Exploration outcome purges one named card in exchange for Essence. card_name is the canonical card display name with unknown grammatical gender; essence_amount is the non-negative reward total.",
              ),
            )}
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
              headline={tx(
                "Essence Gained",
                "Headline on an Exploration reward announcement that grants Essence.",
              )}
              detail={txa(
                "{essence_per_spark} × {spark} ✦",
                {
                  essence_per_spark: cardPurgeReward.essencePerSpark,
                  spark: cardPurgeReward.spark,
                },
                "Calculation detail for Essence gained by purging a card. essence_per_spark is a non-negative Essence rate and spark is the purged card's non-negative Spark value; the total Essence payout is rendered separately.",
              )}
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
            aria-label={resolve(
              txa(
                "Purging {dreamsign_name}",
                {
                  dreamsign_name: opaque(dreamsignPurgeReward.dreamsign.name),
                },
                "Accessible announcement while an Exploration outcome purges a Dreamsign. dreamsign_name is its canonical display name with unknown grammatical gender.",
              ),
            )}
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
              headline={tx(
                "Essence Gained",
                "Headline on an Exploration reward announcement that grants Essence.",
              )}
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
            aria-label={resolve(
              starterCardTransfigurationReward === null
                ? txa(
                    meaning(
                      "transfiguration-complete-status",
                      plural(
                        compoundTransfigurationReward.transfigurations.length,
                        [
                          one("{card_count} card transfigured"),
                          other("{card_count} cards transfigured"),
                        ],
                      ),
                    ),
                    {
                      card_count:
                        compoundTransfigurationReward.transfigurations.length,
                    },
                    "Accessible completed-event summary for an Exploration action transfiguring ordinary UUID-backed deck entries. card_count is the positive number of visible card results.",
                  )
                : txa(
                    meaning(
                      "transfiguration-complete-status",
                      plural(
                        compoundTransfigurationReward.transfigurations.length,
                        [
                          one("{card_count} starter card transfigured"),
                          other("{card_count} starter cards transfigured"),
                        ],
                      ),
                    ),
                    {
                      card_count:
                        compoundTransfigurationReward.transfigurations.length,
                    },
                    "Accessible completed-event summary for an Exploration action transfiguring starter-card UUID-backed deck entries. card_count is the positive number of visible starter-card results.",
                  ),
            )}
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
                starterCardTransfigurationReward === null
                  ? tx(
                      "Cards Transfigured",
                      "Headline for an Exploration result containing ordinary card Transfiguration mappings.",
                    )
                  : tx(
                      "Starter Cards Transfigured",
                      "Headline for an Exploration result containing starter-card Transfiguration mappings.",
                    )
              }
              tone="reward"
              size={isDesktop ? "compact" : "mini"}
              duration="extended"
              announcementId={`exploration-${starterCardTransfigurationReward === null ? "card" : "starter-card"}-transfiguration:${view.resolvedActionId ?? "resolved"}`}
            />
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
                  ? txa(
                      meaning(
                        "transfiguration-review-region",
                        plural(
                          compoundTransfigurationReward.transfigurations.length,
                          [
                            one("{card_count} card transfigured"),
                            other("{card_count} cards transfigured"),
                          ],
                        ),
                      ),
                      {
                        card_count:
                          compoundTransfigurationReward.transfigurations.length,
                      },
                      "Accessible name for the review region containing ordinary card Transfiguration mappings. card_count is the positive number of UUID-backed entries.",
                    )
                  : txa(
                      meaning(
                        "transfiguration-review-region",
                        plural(
                          compoundTransfigurationReward.transfigurations.length,
                          [
                            one("{card_count} starter card transfigured"),
                            other("{card_count} starter cards transfigured"),
                          ],
                        ),
                      ),
                      {
                        card_count:
                          compoundTransfigurationReward.transfigurations.length,
                      },
                      "Accessible name for the review region containing starter-card Transfiguration mappings. card_count is the positive number of UUID-backed entries.",
                    )
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
            aria-label={resolve(
              txa(
                "Purged: {purged_card_count}. Transfigured: {transfigured_card_count}. Made Fast: {fast_card_count}. Nightmares gained: {nightmare_count}. Copies gained: {copy_count}.",
                {
                  purged_card_count: compoundCardMutationReward.purged.length,
                  transfigured_card_count:
                    compoundCardMutationReward.transfigurations.length,
                  fast_card_count:
                    compoundCardMutationReward.keywordChanges.length,
                  nightmare_count: compoundCardMutationReward.nightmares.length,
                  copy_count: compoundCardMutationReward.copies.length,
                },
                "Complete accessible inventory for a compound Exploration card mutation. Every field is an independent non-negative persisted deck-entry count and zero is valid.",
              ),
            )}
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
                  ? tx(
                      "Kindred Forms Recast",
                      "Headline for the compound Exploration result that purges a disclosed card and transfigures eligible cards of its type.",
                    )
                  : compoundCardMutationReward.sourceKind ===
                      "make-predicate-fast-and-gain-nightmares"
                    ? tx(
                        "Swiftness at a Price",
                        "Headline for the compound Exploration result granting Fast and adding Nightmares.",
                      )
                    : compoundCardMutationReward.sourceKind ===
                        "take-transfigured-cards-and-gain-nightmares"
                      ? tx(
                          "Chosen Forms Awakened",
                          "Headline for the compound Exploration result gaining chosen Transfigured cards and Nightmares.",
                        )
                      : tx(
                          "Three Reflections Remain",
                          "Headline for the compound Exploration result that purges, transfigures, and copies prepared cards.",
                        )
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
              ariaLabelMessage={txa(
                plural(compoundCardChangeCount, [
                  one("Review {card_count} card change"),
                  other("Review {card_count} card changes"),
                ]),
                { card_count: compoundCardChangeCount },
                "Accessible name for the bounded focusable scroll region containing every persisted card object or pair in a compound Exploration outcome.",
              )}
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
                    {resolve(
                      tx(
                        "Purged",
                        "Past-tense result heading for cards removed from the player’s deck.",
                      ),
                    )}
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
                    {resolve(
                      tx(
                        "Transfigured",
                        "Section heading for transfigured cards in a compound Exploration outcome review.",
                      ),
                    )}
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
                    {resolve(
                      tx(
                        "Made Fast",
                        "Section heading for cards granted Fast in a compound Exploration outcome review.",
                      ),
                    )}
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
                    {resolve(
                      tx(
                        "Nightmares Gained",
                        "Section heading for Nightmare cards gained in a compound Exploration outcome review.",
                      ),
                    )}
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
                    {resolve(
                      tx(
                        "Copies Gained",
                        "Section heading for card copies gained in a compound Exploration outcome review.",
                      ),
                    )}
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
            aria-label={resolve(
              txa(
                meaning(
                  "transfiguration-complete-status",
                  plural(cardTypeChangesReward.changes.length, [
                    one("{card_count} card type changed"),
                    other("{card_count} card types changed"),
                  ]),
                ),
                { card_count: cardTypeChangesReward.changes.length },
                "Accessible completed-event summary for an Exploration action that atomically changes effective card types. card_count is the positive exact number of UUID-backed entries in the committed mapping.",
              ),
            )}
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
              headline={tx(
                "Card Types Changed",
                "Headline shown with exact persisted before-to-after mappings after one Exploration action changes the effective card type of multiple deck entries.",
              )}
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
              ariaLabelMessage={txa(
                meaning(
                  "transfiguration-complete-status",
                  plural(cardTypeChangesReward.changes.length, [
                    one("{card_count} card type changed"),
                    other("{card_count} card types changed"),
                  ]),
                ),
                { card_count: cardTypeChangesReward.changes.length },
                "Accessible completed-event summary for an Exploration action that atomically changes effective card types. card_count is the positive exact number of UUID-backed entries in the committed mapping.",
              )}
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
            aria-label={resolve(
              txa(
                meaning(
                  "transfiguration-complete-status",
                  plural(cardReplacementReward.replacements.length, [
                    one("{replacement_count} card replaced"),
                    other("{replacement_count} cards replaced"),
                  ]),
                ),
                {
                  replacement_count: cardReplacementReward.replacements.length,
                },
                "Accessible completed-event summary for an Exploration action that atomically replaces ordinary deck entries. replacement_count is the positive exact number of source-to-minted mappings in the committed resolution.",
              ),
            )}
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
              headline={tx(
                "Cards Replaced",
                "Headline shown with exact persisted source-to-replacement mappings after one Exploration action atomically replaces multiple ordinary deck entries.",
              )}
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
              ariaLabelMessage={txa(
                meaning(
                  "transfiguration-complete-status",
                  plural(cardReplacementReward.replacements.length, [
                    one("{replacement_count} card replaced"),
                    other("{replacement_count} cards replaced"),
                  ]),
                ),
                {
                  replacement_count: cardReplacementReward.replacements.length,
                },
                "Accessible completed-event summary for an Exploration action that atomically replaces ordinary deck entries. replacement_count is the positive exact number of source-to-minted mappings in the committed resolution.",
              )}
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
            aria-label={resolve(
              txa(
                "Starter-card changes — purged: {purged_card_count}; gained: {gained_card_count}; replacements: {replacement_count}",
                {
                  purged_card_count: starterCardMutationReward.purged.length,
                  gained_card_count:
                    starterCardMutationReward.replacements.length,
                  replacement_count:
                    starterCardMutationReward.replacements.length,
                },
                "Accessible completed-event summary for a persisted Exploration starter-card mutation. The label-and-count structure deliberately avoids inflecting three independent count nouns. purged_card_count, gained_card_count, and replacement_count are exact non-negative deck-entry counts reconstructed from the committed resolution.",
              ),
            )}
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
              headline={tx(
                "Starter Cards Changed",
                "Headline shown with the exact persisted purge or replacement of starter deck entries after an Exploration action resolves.",
              )}
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
              ariaLabelMessage={txa(
                meaning(
                  "transfiguration-complete-status",
                  plural(starterCardMutationReward.replacements.length, [
                    one("{replacement_count} card replaced"),
                    other("{replacement_count} cards replaced"),
                  ]),
                ),
                {
                  replacement_count:
                    starterCardMutationReward.replacements.length,
                },
                "Accessible completed-event summary for an Exploration action that atomically replaces ordinary deck entries. replacement_count is the positive exact number of source-to-minted mappings in the committed resolution.",
              )}
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
            aria-label={resolve(
              txa(
                "Reward gained — Nightmares: {nightmare_count}; Dreamsigns: {dreamsign_count}; Dreamsign replacements: {replacement_count}",
                {
                  nightmare_count:
                    nightmareDreamsignBundleReward.nightmares.length,
                  dreamsign_count: nightmareDreamsignBundleReward.gained.length,
                  replacement_count:
                    nightmareDreamsignBundleReward.replacements.length,
                },
                "Accessible completed-event summary for one persisted compound Exploration reward. The label-and-count structure deliberately avoids inflecting three independent count nouns. nightmare_count is the positive number of concrete Nightmare deck entries minted by the resolution; dreamsign_count is the positive number of Dreamsigns gained; replacement_count is the non-negative number of held Dreamsign slots replaced by those gains.",
              ),
            )}
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
              headline={tx(
                "Nightmares and Dreamsign Gained",
                "Headline shown while an Exploration compound outcome presents the exact persisted Nightmare cards together with its Dreamsign gain or replacement.",
              )}
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
                aria-label={resolve(
                  txa(
                    plural(nightmareDreamsignBundleReward.nightmares.length, [
                      one("{nightmare_count} Nightmare card"),
                      other("{nightmare_count} Nightmare cards"),
                    ]),
                    {
                      nightmare_count:
                        nightmareDreamsignBundleReward.nightmares.length,
                    },
                    "Accessible name for the complete UUID-backed Nightmare card group in one compound Exploration outcome. nightmare_count is a positive exact count.",
                  ),
                )}
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
            aria-label={resolve(
              txa(
                "Dreamsign changes — purged: {purged_count}; gained: {gained_count}; replacements: {replacement_count}",
                {
                  purged_count: dreamsignMutationReward.purged.length,
                  gained_count: dreamsignMutationReward.gained.length,
                  replacement_count:
                    dreamsignMutationReward.replacements.length,
                },
                "Accessible completed-event summary for a persisted Exploration Dreamsign mutation. The label-and-count structure deliberately avoids inflecting three independent count nouns. purged_count, gained_count, and replacement_count are non-negative exact counts; random identities have already been committed before this message is presented.",
              ),
            )}
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
              headline={tx(
                "Dreamsigns Changed",
                "Headline shown with the persisted before/after result of an Exploration Dreamsign mutation, after any random identities are committed.",
              )}
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
            role="status"
            aria-label={resolve(
              txa(
                plural(essenceReward.cards.length, [
                  one(
                    "{card_count} Spirit Animal card grants {total_essence} Essence total, {essence_per_card} for that card",
                  ),
                  other(
                    "{card_count} Spirit Animal cards grant {total_essence} Essence total, {essence_per_card} each",
                  ),
                ]),
                {
                  card_count: essenceReward.cards.length,
                  total_essence: essenceReward.totalEssence,
                  essence_per_card: essenceReward.essencePerCard,
                },
                "Accessible summary of an Exploration outcome that converts Spirit Animal cards into Essence. card_count is the positive number of affected cards; total_essence and essence_per_card are non-negative Essence amounts.",
              ),
            )}
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
            style={{
              position: "fixed",
              inset: 0,
              zIndex: FRAME_BREAK_EXIT_LAYER + 2,
              pointerEvents: "none",
            }}
          >
            <RadialAnnouncement
              announcementId={`exploration:${view.siteId}:${view.resolvedActionId ?? "essence"}`}
              headline={tx(
                "Essence Gained",
                "Headline on an Exploration reward announcement that grants Essence.",
              )}
              detail={txa(
                plural(essenceReward.cards.length, [
                  one("{essence_per_card} × {card_count} Spirit Animal"),
                  other("{essence_per_card} × {card_count} Spirit Animals"),
                ]),
                {
                  essence_per_card: essenceReward.essencePerCard,
                  card_count: essenceReward.cards.length,
                },
                "Calculation detail for Essence gained from Spirit Animal cards. essence_per_card is a non-negative Essence rate and card_count is the positive number of Spirit Animal cards involved; the total payout is rendered separately.",
              )}
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
                      data-exploration-multi-transfiguration-selected-entry-ids={selectedIds.join(
                        ",",
                      )}
                      style={{ width: "100%", minHeight: 0 }}
                    >
                      <CardPickerPanel
                        title={followup.title}
                        subtitle={followup.subtitle}
                        footerActions={[
                          {
                            label: tx(
                              "Confirm Choice",
                              "Player-facing message for the exploration confirm choice action interface state.",
                            ),
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
                          selection: selectedIds.includes(candidate.entryId)
                            ? "selected"
                            : undefined,
                          operation: selectedIds.includes(candidate.entryId)
                            ? "transfigure"
                            : undefined,
                          testId: `cumulus-exploration-multi-transfiguration-card-${candidate.entryId}`,
                        }))}
                        emptyLabel={tx(
                          "No eligible cards are available.",
                          "Empty state for an Exploration card choice with no eligible deck entries.",
                        )}
                        testId="cumulus-exploration-multi-transfiguration-card-picker"
                        onCardPress={toggleCard}
                      />
                    </div>
                  );
                }
                const entryId = selectedIds[multiTransfigurationStep];
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
                    data-exploration-multi-transfiguration-selected-entry-ids={selectedIds.join(
                      ",",
                    )}
                    data-exploration-multi-transfiguration-selected-forms={selectedIds
                      .map(
                        (selectedEntryId) =>
                          multiTransfigurationForms[selectedEntryId] ?? "",
                      )
                      .join(",")}
                    role="region"
                    aria-label={resolve(
                      txa(
                        "Choosing a form for card {current_card_number} of {card_count}: {card_name}",
                        {
                          current_card_number: multiTransfigurationStep + 1,
                          card_count: followup.count,
                          card_name: candidate.model.displaySnapshot.name,
                        },
                        "Accessible progress for the sequential form chooser after the player has selected an exact multi-card set. current_card_number is the positive one-based position, card_count is the positive exact total, and card_name is the canonical UUID-resolved display name of the current deck entry.",
                      ),
                    )}
                    style={{ width: "100%", minHeight: 0 }}
                  >
                    <TransfigurationDetailPanel
                      layout={isDesktop ? "desktop" : "mobile"}
                      candidate={candidate}
                      selectedFormType={selectedForm}
                      confirming={transfigurationConfirming}
                      alreadyAccepted={false}
                      showConfirmEssenceCost={false}
                      onBack={() => {
                        setTransfigurationConfirming(false);
                        setMultiTransfigurationStep((current) =>
                          current === null || current === 0
                            ? null
                            : current - 1,
                        );
                      }}
                      onSelectForm={(type) =>
                        setMultiTransfigurationForms((current) => ({
                          ...current,
                          [entryId]: type,
                        }))
                      }
                      onConfirm={(form) => {
                        const nextForms = {
                          ...multiTransfigurationForms,
                          [entryId]: form.type,
                        };
                        setMultiTransfigurationForms(nextForms);
                        if (multiTransfigurationStep + 1 < followup.count) {
                          setMultiTransfigurationStep(
                            multiTransfigurationStep + 1,
                          );
                          return;
                        }
                        const transfigurations = selectedIds.flatMap(
                          (selectedEntryId) => {
                            const type = nextForms[selectedEntryId];
                            return type === undefined ? [] : [type];
                          },
                        );
                        if (transfigurations.length !== selectedIds.length)
                          return;
                        setTransfigurationConfirming(true);
                        onResolve(activeAction.id, {
                          entryIds: selectedIds,
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
                          label={tx(
                            "Confirm Choice",
                            "Player-facing message for the exploration confirm choice action interface state.",
                          )}
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
                        activeAction.followup.mode === "purge-and-copy" &&
                        purgeEntryId === null
                          ? tx(
                              "Choose a card to purge",
                              "Player-facing message for the exploration followup choice purge interface state.",
                            )
                          : activeAction.followup.mode === "purge-and-copy" &&
                              selectedIds.length === 0
                            ? tx(
                                "Choose a card to copy",
                                "Instruction for choosing one concrete card to copy into the player’s deck.",
                              )
                            : tx(
                                "Confirm Choice",
                                "Player-facing message for the exploration confirm choice action interface state.",
                              ),
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
                  emptyLabel={tx(
                    "No eligible cards are available.",
                    "Empty state for an Exploration card choice with no eligible deck entries.",
                  )}
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
                  eyebrow={tx(
                    "Exploration",
                    "Eyebrow above an Exploration follow-up choice.",
                  )}
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
                          {resolve(
                            txa(
                              "Pack {pack_number}",
                              { pack_number: pack.index + 1 },
                              "Title above one numbered Exploration card pack. pack_number is a positive one-based display number.",
                            ),
                          )}
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
                            label={tx(
                              meaning("exploration-pack-choose", "Choose"),
                              "Visible command that chooses the Exploration pack shown above the button.",
                            )}
                            accessibilityLabel={txa(
                              "Choose Pack {pack_number}",
                              { pack_number: pack.index + 1 },
                              "Accessible command that chooses one Exploration card pack. pack_number is the same positive one-based display number; the visible button says only Choose.",
                            )}
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
                eyebrow={tx(
                  "Exploration",
                  "Eyebrow above an Exploration follow-up choice.",
                )}
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
                      label={tx(
                        "Confirm Choice",
                        "Player-facing message for the exploration confirm choice action interface state.",
                      )}
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
                eyebrow={tx(
                  "Exploration",
                  "Eyebrow above an Exploration follow-up choice.",
                )}
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
              >
                <div
                  data-exploration-site-type-choices=""
                  role="group"
                  aria-label={resolve(
                    tx(
                      "Choose a site to add to this Dreamscape",
                      "Accessible name for the available Exploration site-type choices.",
                    ),
                  )}
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
                      eyebrow={tx(
                        "Exploration",
                        "Eyebrow above an Exploration follow-up choice.",
                      )}
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
                              label={tx(
                                "Confirm Choice",
                                "Player-facing message for the exploration confirm choice action interface state.",
                              )}
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
                        aria-label={resolve(
                          txa(
                            "{selected_count} of {required_count} Dreamsign choices selected",
                            {
                              selected_count: selectedSelections,
                              required_count: requiredSelections,
                            },
                            "Polite status for a compound Exploration Dreamsign picker. selected_count is the non-negative number of UUID-backed choices currently selected and required_count is the positive exact total required before confirmation.",
                          ),
                        )}
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
                            heading={tx(
                              "Offered Dreamsigns",
                              "Visible heading above Dreamsigns prepared as player-selectable Exploration offers. Each item is a complete UUID-backed Dreamsign object.",
                            )}
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
                                ? tx(
                                    "Choose a Dreamsign to Purge",
                                    "Heading above held Dreamsigns when an Exploration follow-up requires a purge.",
                                  )
                                : tx(
                                    "Choose a Dreamsign to Replace",
                                    "Heading for choosing which held Dreamsign to replace after gaining one while at capacity.",
                                  )
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
                eyebrow={tx(
                  "Exploration",
                  "Eyebrow above an Exploration follow-up choice.",
                )}
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
              >
                <div
                  role="group"
                  aria-label={resolve(activeAction.followup.subtitle)}
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
            {activeAction.followup.kind === "dreamAvatars" && (
              <GlassPanel
                eyebrow={tx(
                  "Exploration",
                  "Eyebrow above an Exploration follow-up choice.",
                )}
                title={activeAction.followup.title}
                subtitle={activeAction.followup.subtitle}
                headingLevel="h1"
              >
                <div
                  data-exploration-dream-avatar-choices=""
                  role="group"
                  aria-label={resolve(activeAction.followup.subtitle)}
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
                          dreamAvatar={{
                            ...dreamAvatar,
                            name: localizedSourceText(dreamAvatar.name),
                            title: localizedSourceText(dreamAvatar.title),
                          }}
                          variant="panel"
                          profile={{
                            id: dreamAvatar.id,
                            ability: localizedSourceText(
                              dreamAvatar.renderedText,
                            ),
                          }}
                          onPress={() =>
                            onResolve(activeAction.id, {
                              dreamAvatarId: dreamAvatar.id,
                            })
                          }
                        />
                      </div>
                      <div
                        style={{ display: "grid", gap: token("--space-xxs") }}
                      >
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
              label={tx(
                "Return to Exploration",
                "Accessible command on the full-screen Exploration artwork that collapses the expanded site and returns the current player to its choice view.",
              )}
              onPress={collapseFrameBreak}
              testId="cumulus-exploration-exit"
            />
          </motion.div>
        )}
    </GuideGallerySiteLayout>
  );
}

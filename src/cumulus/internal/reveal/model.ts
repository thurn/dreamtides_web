import type { CardData } from "../../../types/cards";
import type { CardId } from "../../../types/card-identity";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import type {
  InfoCardProps,
  InfoCardVariant,
} from "../../components/overlay/InfoCard";
import type { GameCardSelection } from "../../components/card/CardView";
import type { Glyph } from "../../primitives/glyph";
import type { LocalizedString } from "@trox/runtime";

export interface RevealSourceIdentity {
  readonly entityType: string;
  readonly entityId: string;
}

/** Private mounted-instance key paired with a source's stable semantic UUID identity. */
export interface RevealCoordinatorSource {
  readonly identity: RevealSourceIdentity;
  readonly registrationId: string;
}

export type RevealInfoCardModel = Readonly<InfoCardProps>;

export interface RevealGalleryActionModel {
  readonly glyph: Glyph;
  readonly label: LocalizedString;
}

export type RevealDescriptionUnit = {
  readonly kind: "message";
  readonly message: LocalizedString;
};

export interface RevealGameCard {
  readonly kind: "gameCard";
  readonly cardId: CardId;
  /** Strict resolved display semantics; its id must equal the canonical cardId. */
  readonly displaySnapshot: Readonly<CardData>;
  /** Optional applied transfiguration rendered on the reading copy. */
  readonly transfiguration?: CardTransfigurationDisplay;
  /** Semantic selection state inherited from the source card. */
  readonly selection?: GameCardSelection;
  /** Render the reading copy with the authored figment frame. */
  readonly figment?: boolean;
  /** Use the legible rules treatment reserved for an adjacent figment preview. */
  readonly rulesTextPresentation?: "adjacent-figment";
  /** Exact number of identical card objects represented by this reveal. */
  readonly copies?: number;
}

export type RevealCard =
  | {
      /** The mounted source already contains the complete primary content. */
      readonly kind: "source";
      readonly description: LocalizedString;
    }
  | RevealGameCard
  | {
      readonly kind: "galleryAction";
      readonly action: RevealGalleryActionModel;
    }
  | { readonly kind: "infoCard"; readonly card: RevealInfoCardModel };

export interface RevealSpec {
  readonly primary: RevealCard;
  /** Descending semantic priority. */
  readonly secondaries: readonly RevealInfoCardModel[];
  /**
   * Small card objects laid in a horizontal desktop row beyond the definition
   * stack. Touch layouts deliberately omit them.
   */
  readonly adjacentCards?: readonly RevealGameCard[];
}

export type RevealPointerType = "mouse" | "pen" | "touch";
export type RevealReason = "hover" | "focus" | "press";
/**
 * The single one-off exception to normal Cumulus desktop reveal placement.
 * Only Augury OfferTile may use this value; every ordinary source relies
 * on the coordinator's automatic beside-source rule.
 */
export type RevealPlacementException = "augury-offer-above-source";
export type RevealDismissalReason =
  | "pointer-leave"
  | "pointer-cancel"
  | "movement"
  | "scroll"
  | "drag"
  | "resize"
  | "orientation-change"
  | "window-blur"
  | "route-change"
  | "source-unmount"
  | "release"
  | "escape"
  | "blur"
  | "replaced";
export type RevealActivationOutcome =
  | "none"
  | "fired"
  | "suppressed-hold"
  | "suppressed-no-action"
  | "suppressed-cancelled";

export interface RevealPoint {
  readonly x: number;
  readonly y: number;
}

export interface RevealTouchState {
  readonly source: RevealCoordinatorSource;
  readonly pointerId: number;
  readonly startPoint: RevealPoint;
  readonly startedAt: number;
  readonly hasAction: boolean;
}

export interface RevealCoordinatorState {
  readonly phase: "idle" | "hover" | "focus" | "touch-pending" | "touch-reveal";
  readonly activeSource: RevealSourceIdentity | null;
  readonly activeRegistrationId: string | null;
  readonly reason: RevealReason | null;
  readonly focusedSource: RevealCoordinatorSource | null;
  readonly hoveredSource: RevealCoordinatorSource | null;
  readonly escapeSuppressedSource: RevealCoordinatorSource | null;
  readonly touch: RevealTouchState | null;
  readonly pressed: boolean;
  readonly pressPointerId: number | null;
  /** The engine deliberately never captures a pointer, preserving native scroll. */
  readonly capturePointer: false;
  readonly dismissalReason: RevealDismissalReason | null;
  readonly activationOutcome: RevealActivationOutcome;
}

type Timestamped = { readonly timestamp: number };
export type RevealCoordinatorEvent =
  | (Timestamped & {
      readonly type: "pointer-enter";
      readonly source: RevealCoordinatorSource;
      readonly pointerType: RevealPointerType;
      readonly hoverCapable: boolean;
    })
  | (Timestamped & {
      readonly type: "pointer-down";
      readonly source: RevealCoordinatorSource;
      readonly pointerType: RevealPointerType;
      readonly pointerId: number;
      readonly point: RevealPoint;
      readonly hasAction: boolean;
    })
  | (Timestamped & {
      readonly type: "pointer-move";
      readonly pointerId: number;
      readonly point: RevealPoint;
    })
  | (Timestamped & {
      readonly type: "pointer-up" | "pointer-cancel";
      readonly pointerId: number;
    })
  | (Timestamped & {
      readonly type: "pointer-leave";
      readonly pointerId: number;
      readonly source?: RevealCoordinatorSource;
    })
  | (Timestamped & {
      readonly type: "intent-elapsed";
      readonly pointerId: number;
    })
  | (Timestamped & {
      readonly type: "focus" | "blur" | "source-unmount";
      readonly source: RevealCoordinatorSource;
    })
  | (Timestamped & {
      readonly type:
        | "escape"
        | "scroll"
        | "drag"
        | "resize"
        | "orientation-change"
        | "window-blur"
        | "route-change";
    });

export interface RevealRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface RevealSafeArea {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export interface RevealGeometrySnapshot {
  readonly viewport: {
    readonly layout: "mobile" | "desktop";
    readonly width: number;
    readonly height: number;
    readonly offsetLeft: number;
    readonly offsetTop: number;
    readonly safeArea: RevealSafeArea;
    readonly boundary?: RevealRect;
  };
  readonly sourceRect: RevealRect;
  readonly touchPoint?: RevealPoint;
  readonly placement: { readonly family: string; readonly orientation: string };
  readonly finalRects: {
    readonly primary: RevealRect;
    readonly secondaries: readonly RevealRect[];
    readonly adjacents?: readonly RevealRect[];
  };
  readonly circleClearance?: number;
}

export function infoCardVariant(card: RevealInfoCardModel): InfoCardVariant {
  return card.variant ?? "text";
}

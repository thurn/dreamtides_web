import type { FrozenCardData } from "../../../types/cards";
import type { CardId } from "../../../types/card-identity";
import type { InfoCardProps, InfoCardVariant } from "../../components/overlay/InfoCard";

export interface RevealSourceIdentity {
  readonly entityType: string;
  readonly entityId: string;
}

export type RevealInfoCardModel = Readonly<InfoCardProps>;

export type RevealCard =
  | {
      readonly kind: "gameCard";
      readonly cardId: CardId;
      /** A strict display snapshot may be supplied by the internal GameCard adapter. */
      readonly displaySnapshot?: FrozenCardData;
    }
  | { readonly kind: "infoCard"; readonly card: RevealInfoCardModel };

export interface RevealSpec {
  readonly primary: RevealCard;
  /** Descending semantic priority. */
  readonly secondaries: readonly RevealInfoCardModel[];
}

export type RevealPointerType = "mouse" | "pen" | "touch";
export type RevealReason = "hover" | "focus" | "press";
export type RevealDismissalReason =
  | "pointer-leave" | "pointer-cancel" | "movement" | "scroll" | "drag"
  | "resize" | "orientation-change" | "window-blur" | "route-change"
  | "source-unmount" | "release" | "escape" | "blur" | "replaced";
export type RevealActivationOutcome =
  | "none" | "fired" | "suppressed-hold" | "suppressed-no-action"
  | "suppressed-cancelled";

export interface RevealPoint { readonly x: number; readonly y: number }

export interface RevealTouchState {
  readonly source: RevealSourceIdentity;
  readonly pointerId: number;
  readonly startPoint: RevealPoint;
  readonly startedAt: number;
  readonly hasAction: boolean;
}

export interface RevealCoordinatorState {
  readonly phase: "idle" | "hover" | "focus" | "touch-pending" | "touch-reveal";
  readonly activeSource: RevealSourceIdentity | null;
  readonly reason: RevealReason | null;
  readonly focusedSource: RevealSourceIdentity | null;
  readonly hoveredSource: RevealSourceIdentity | null;
  readonly escapeSuppressedSource: RevealSourceIdentity | null;
  readonly touch: RevealTouchState | null;
  readonly pressed: boolean;
  /** The engine deliberately never captures a pointer, preserving native scroll. */
  readonly capturePointer: false;
  readonly dismissalReason: RevealDismissalReason | null;
  readonly activationOutcome: RevealActivationOutcome;
}

type Timestamped = { readonly timestamp: number };
export type RevealCoordinatorEvent =
  | (Timestamped & { readonly type: "pointer-enter"; readonly source: RevealSourceIdentity; readonly pointerType: RevealPointerType; readonly hoverCapable: boolean })
  | (Timestamped & { readonly type: "pointer-down"; readonly source: RevealSourceIdentity; readonly pointerType: RevealPointerType; readonly pointerId: number; readonly point: RevealPoint; readonly hasAction: boolean })
  | (Timestamped & { readonly type: "pointer-move"; readonly pointerId: number; readonly point: RevealPoint })
  | (Timestamped & { readonly type: "pointer-up" | "pointer-cancel"; readonly pointerId: number })
  | (Timestamped & { readonly type: "pointer-leave"; readonly pointerId: number; readonly source?: RevealSourceIdentity })
  | (Timestamped & { readonly type: "intent-elapsed"; readonly pointerId: number })
  | (Timestamped & { readonly type: "focus" | "blur" | "source-unmount"; readonly source: RevealSourceIdentity })
  | (Timestamped & { readonly type: "escape" | "scroll" | "drag" | "resize" | "orientation-change" | "window-blur" | "route-change" });

export interface RevealRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface RevealSafeArea { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
export interface RevealGeometrySnapshot {
  readonly viewport: { readonly layout: "mobile" | "desktop"; readonly width: number; readonly height: number; readonly safeArea: RevealSafeArea };
  readonly sourceRect: RevealRect;
  readonly touchPoint?: RevealPoint;
  readonly placement: { readonly family: string; readonly orientation: string };
  readonly finalRects: { readonly primary: RevealRect; readonly secondaries: readonly RevealRect[] };
  readonly circleClearance?: number;
}

export function infoCardVariant(card: RevealInfoCardModel): InfoCardVariant {
  return card.variant ?? "text";
}

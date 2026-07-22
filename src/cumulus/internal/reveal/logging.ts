import { logEvent } from "../../../logging";
import type {
  RevealActivationOutcome, RevealDismissalReason, RevealGeometrySnapshot,
  RevealReason, RevealSourceIdentity,
} from "./model";
import type { InfoCardVariant } from "../../components/overlay/InfoCard";

export interface RevealOpenedDiagnostic {
  readonly source: RevealSourceIdentity;
  readonly interactionId: number;
  readonly primary: { readonly kind: "source" | "gameCard" | "galleryAction" | "infoCard"; readonly variant: string };
  readonly secondaryVariants: readonly InfoCardVariant[];
  readonly adjacentCardIds: readonly string[];
  readonly modality: "mouse" | "pen" | "touch" | "keyboard";
  readonly reason: RevealReason;
  readonly geometry: RevealGeometrySnapshot;
  readonly shownSecondaryCount: number;
  readonly droppedSecondaryCount: number;
  readonly shownAdjacentCount: number;
  readonly droppedAdjacentCount: number;
  readonly fallbacks: {
    readonly pressInPlace: boolean;
    readonly sideFallback: boolean;
    readonly secondaryTruncation: boolean;
    readonly adjacentTruncation: boolean;
    readonly bestEffortPrimaryOverlap: boolean;
  };
}

export function logRevealOpened(value: RevealOpenedDiagnostic): void {
  const { geometry } = value;
  logEvent("cumulus_entity_reveal_opened", {
    sourceEntityType: value.source.entityType,
    sourceEntityId: value.source.entityId,
    interactionId: value.interactionId,
    primaryKind: value.primary.kind,
    primaryVariant: value.primary.variant,
    secondaryVariants: [...value.secondaryVariants],
    adjacentCardIds: [...value.adjacentCardIds],
    viewport: geometry.viewport,
    modality: value.modality,
    reason: value.reason,
    sourceRect: geometry.sourceRect,
    ...(geometry.touchPoint === undefined ? {} : { touchPoint: geometry.touchPoint }),
    placement: geometry.placement,
    finalRects: geometry.finalRects,
    shownSecondaryCount: value.shownSecondaryCount,
    droppedSecondaryCount: value.droppedSecondaryCount,
    shownAdjacentCount: value.shownAdjacentCount,
    droppedAdjacentCount: value.droppedAdjacentCount,
    fallbacks: value.fallbacks,
    ...(geometry.circleClearance === undefined ? {} : { circleClearance: geometry.circleClearance }),
  });
}

export function logRevealClosed(value: {
  readonly source: RevealSourceIdentity;
  readonly interactionId: number;
  readonly reason: RevealReason;
  readonly dismissalReason: RevealDismissalReason;
  readonly activationOutcome: RevealActivationOutcome;
}): void {
  logEvent("cumulus_entity_reveal_closed", {
    sourceEntityType: value.source.entityType,
    sourceEntityId: value.source.entityId,
    interactionId: value.interactionId,
    reason: value.reason,
    dismissalReason: value.dismissalReason,
    activationOutcome: value.activationOutcome,
  });
}

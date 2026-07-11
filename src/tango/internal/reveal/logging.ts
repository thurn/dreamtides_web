import { logEvent } from "../../../logging";
import type {
  RevealActivationOutcome, RevealDismissalReason, RevealGeometrySnapshot,
  RevealReason, RevealSourceIdentity,
} from "./model";
import type { InfoCardVariant } from "../../components/overlay/InfoCard";

export interface RevealOpenedDiagnostic {
  readonly source: RevealSourceIdentity;
  readonly primary: { readonly kind: "gameCard" | "infoCard"; readonly variant: string };
  readonly secondaryVariants: readonly InfoCardVariant[];
  readonly modality: "mouse" | "pen" | "touch" | "keyboard";
  readonly reason: RevealReason;
  readonly geometry: RevealGeometrySnapshot;
  readonly shownSecondaryCount: number;
  readonly droppedSecondaryCount: number;
  readonly fallbacks: {
    readonly pressInPlace: boolean;
    readonly sideFallback: boolean;
    readonly secondaryTruncation: boolean;
    readonly bestEffortPrimaryOverlap: boolean;
  };
}

export function logRevealOpened(value: RevealOpenedDiagnostic): void {
  const { geometry } = value;
  logEvent("tango_entity_reveal_opened", {
    sourceEntityType: value.source.entityType,
    sourceEntityId: value.source.entityId,
    primaryKind: value.primary.kind,
    primaryVariant: value.primary.variant,
    secondaryVariants: [...value.secondaryVariants],
    viewport: geometry.viewport,
    modality: value.modality,
    reason: value.reason,
    sourceRect: geometry.sourceRect,
    ...(geometry.touchPoint === undefined ? {} : { touchPoint: geometry.touchPoint }),
    placement: geometry.placement,
    finalRects: geometry.finalRects,
    shownSecondaryCount: value.shownSecondaryCount,
    droppedSecondaryCount: value.droppedSecondaryCount,
    fallbacks: value.fallbacks,
    ...(geometry.circleClearance === undefined ? {} : { circleClearance: geometry.circleClearance }),
  });
}

export function logRevealClosed(value: {
  readonly source: RevealSourceIdentity;
  readonly dismissalReason: RevealDismissalReason;
  readonly activationOutcome: RevealActivationOutcome;
}): void {
  logEvent("tango_entity_reveal_closed", {
    sourceEntityType: value.source.entityType,
    sourceEntityId: value.source.entityId,
    dismissalReason: value.dismissalReason,
    activationOutcome: value.activationOutcome,
  });
}

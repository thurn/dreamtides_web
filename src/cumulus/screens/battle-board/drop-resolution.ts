/** Resolves where a dragged battle card lands from its release point and the rendered drop targets. */
import type { BattleSlotViewId } from "../../../types/identifiers";
import { parseBattleSlotViewId } from "../../../types/identifiers";
import type {
  MobileBattleDropCandidate,
  MobileBattleDropResolution,
  MobileBattleInteractions,
  MobileBattleOwner,
  MobileBattleSlotTarget,
} from "../MobileBattleScreen";

export function sameSlotTarget(
  left: MobileBattleSlotTarget,
  right: MobileBattleSlotTarget,
): boolean {
  return (
    left.owner === right.owner &&
    left.rank === right.rank &&
    left.slotId === right.slotId
  );
}

export function slotTargetFromElement(
  element: Element | null | undefined,
): MobileBattleSlotTarget | null {
  const slot = element?.closest<HTMLElement>(
    '[data-battle-mobile-drop-kind="slot"]',
  );
  const owner = slot?.dataset.battleMobileDropOwner;
  const rank = slot?.dataset.battleMobileDropRank;
  const slotId = slot?.dataset.battleMobileDropSlotId;
  if (
    (owner !== "player" && owner !== "enemy") ||
    (rank !== "back" && rank !== "front") ||
    slotId === undefined
  ) {
    return null;
  }
  return { owner, rank, slotId: parseBattleSlotViewId(slotId) };
}

export function findSlotElement(target: MobileBattleSlotTarget): HTMLElement | null {
  return (
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-battle-mobile-drop-kind="slot"]',
      ),
    ].find((element) => {
      const elementTarget = slotTargetFromElement(element);
      return elementTarget !== null && sameSlotTarget(elementTarget, target);
    }) ?? null
  );
}

export function slotTargetIsEligible(
  interactions: MobileBattleInteractions,
  target: MobileBattleSlotTarget,
): boolean {
  if (
    interactions.sourceSlotTarget !== null &&
    interactions.sourceSlotTarget !== undefined &&
    sameSlotTarget(interactions.sourceSlotTarget, target)
  ) {
    return false;
  }
  if (interactions.isSlotDropEligible !== undefined) {
    return interactions.isSlotDropEligible(target);
  }
  if (interactions.eligibleSlotRanks !== undefined) {
    return interactions.eligibleSlotRanks.includes(target.rank);
  }
  return (
    interactions.eligibleSlotTargets === undefined ||
    interactions.eligibleSlotTargets.some((eligibleTarget) =>
      sameSlotTarget(eligibleTarget, target),
    )
  );
}

export function dropMobileCardAtPoint(
  interactions: MobileBattleInteractions,
  clientX: number,
  clientY: number,
  placementClientX: number,
  placementClientY: number,
): void {
  const hitTarget = document.elementFromPoint(clientX, clientY);
  if (interactions.pendingCardSource === "near-hand") {
    const battleScreen = hitTarget?.closest<HTMLElement>(
      "[data-battle-mobile]",
    );
    interactions.onHandCardDrop?.(
      battleScreen === undefined || battleScreen === null
        ? undefined
        : closestOpenBackRankSlot(
            battleScreen,
            interactions.nearSide ?? interactions.pendingCardOwner ?? "player",
            clientX,
            clientY,
          ),
    );
    return;
  }
  if (
    interactions.eligibleSlotRanks !== undefined ||
    interactions.eligibleSlotTargets !== undefined ||
    interactions.isSlotDropEligible !== undefined
  ) {
    if (
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY) ||
      !Number.isFinite(placementClientX) ||
      !Number.isFinite(placementClientY)
    ) {
      interactions.onBattlefieldDropRejected?.({
        reason: "invalid-release-point",
        clientX,
        clientY,
      });
      return;
    }
    const battleScreen =
      hitTarget?.closest<HTMLElement>("[data-battle-mobile]") ??
      document.querySelector<HTMLElement>("[data-battle-mobile]");
    if (battleScreen === null) {
      interactions.onBattlefieldDropRejected?.({
        reason: "battlefield-unavailable",
        clientX,
        clientY,
      });
      return;
    }
    const placementHitTarget = document.elementFromPoint(
      placementClientX,
      placementClientY,
    );
    const resolution = resolveBattlefieldSlot(
      battleScreen,
      interactions.pendingCardOwner ?? interactions.nearSide ?? "player",
      interactions,
      clientX,
      clientY,
      placementHitTarget,
      placementClientX,
      placementClientY,
    );
    interactions.onBattlefieldDropResolved?.(resolution);
    if (resolution.chosenTarget === null) {
      interactions.onBattlefieldDropRejected?.({
        reason: "no-eligible-slot",
        clientX,
        clientY,
      });
      return;
    }
    const chosenCandidate = resolution.candidates.find((candidate) =>
      sameSlotTarget(
        candidate.target,
        resolution.chosenTarget as MobileBattleSlotTarget,
      ),
    );
    if (chosenCandidate?.eligible !== true) {
      interactions.onBattlefieldDropRejected?.({
        reason:
          interactions.sourceSlotTarget !== null &&
          interactions.sourceSlotTarget !== undefined &&
          sameSlotTarget(interactions.sourceSlotTarget, resolution.chosenTarget)
            ? "source-slot"
            : "ineligible-slot",
        clientX,
        clientY,
      });
      return;
    }
    interactions.onSlotDrop(resolution.chosenTarget);
    return;
  }
  const target = hitTarget?.closest<HTMLElement>(
    "[data-battle-mobile-drop-kind]",
  );
  if (target === undefined || target === null) return;
  const owner = target.dataset.battleMobileDropOwner;
  if (owner !== "enemy" && owner !== "player") return;
  if (
    interactions.pendingCardOwner !== null &&
    interactions.pendingCardOwner !== undefined &&
    interactions.pendingCardOwner !== owner
  ) {
    return;
  }
  if (target.dataset.battleMobileDropKind === "slot") {
    const rank = target.dataset.battleMobileDropRank;
    const slotId = target.dataset.battleMobileDropSlotId;
    if ((rank !== "back" && rank !== "front") || slotId === undefined) return;
    interactions.onSlotDrop({
      owner,
      rank,
      slotId: parseBattleSlotViewId(slotId),
    });
    return;
  }
  const zone = target.dataset.battleMobileDropZone;
  if (zone !== "deck" && zone !== "hand" && zone !== "void") return;
  interactions.onZoneDrop({ owner, zone });
}

function resolveBattlefieldSlot(
  battleScreen: HTMLElement,
  owner: MobileBattleOwner,
  interactions: MobileBattleInteractions,
  clientX: number,
  clientY: number,
  placementHitTarget: Element | null,
  placementClientX: number,
  placementClientY: number,
): MobileBattleDropResolution {
  const candidates: MobileBattleDropCandidate[] = [];
  const slots = battleScreen.querySelectorAll<HTMLElement>(
    `[data-battle-mobile-drop-kind="slot"][data-battle-mobile-drop-owner="${owner}"]`,
  );
  slots.forEach((slot) => {
    const rank = slot.dataset.battleMobileDropRank;
    const slotId = slot.dataset.battleMobileDropSlotId;
    if ((rank !== "back" && rank !== "front") || slotId === undefined) {
      return;
    }
    const target = {
      owner,
      rank,
      slotId: parseBattleSlotViewId(slotId),
    } as const;
    const bounds = slot.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const deltaX = placementClientX - centerX;
    const deltaY = placementClientY - centerY;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    const edgeDeltaX = Math.max(
      bounds.left - placementClientX,
      0,
      placementClientX - bounds.right,
    );
    const edgeDeltaY = Math.max(
      bounds.top - placementClientY,
      0,
      placementClientY - bounds.bottom,
    );
    candidates.push({
      target,
      eligible: slotTargetIsEligible(interactions, target),
      rect: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        centerX,
        centerY,
      },
      deltaX,
      deltaY,
      distanceSquared,
      containsRelease:
        clientX >= bounds.left &&
        clientX <= bounds.right &&
        clientY >= bounds.top &&
        clientY <= bounds.bottom,
      containsPlacement:
        placementClientX >= bounds.left &&
        placementClientX <= bounds.right &&
        placementClientY >= bounds.top &&
        placementClientY <= bounds.bottom,
      edgeDistanceSquared: edgeDeltaX * edgeDeltaX + edgeDeltaY * edgeDeltaY,
    });
  });
  candidates.sort(
    (left, right) =>
      left.distanceSquared - right.distanceSquared ||
      `${left.target.rank}:${left.target.slotId}`.localeCompare(
        `${right.target.rank}:${right.target.slotId}`,
      ),
  );
  const hitSlot = placementHitTarget?.closest<HTMLElement>(
    `[data-battle-mobile-drop-kind="slot"][data-battle-mobile-drop-owner="${owner}"]`,
  );
  const directHit =
    hitSlot === null || hitSlot === undefined
      ? undefined
      : candidates.find(
          (candidate) =>
            candidate.target.rank === hitSlot.dataset.battleMobileDropRank &&
            candidate.target.slotId === hitSlot.dataset.battleMobileDropSlotId,
        );
  const contained = candidates.find((candidate) => candidate.containsPlacement);
  const nearest = candidates[0];
  const withinSnapTolerance =
    nearest !== undefined &&
    nearest.edgeDistanceSquared <=
      Math.min(nearest.rect.width, nearest.rect.height) ** 2 / 4;
  const chosen =
    directHit ?? contained ?? (withinSnapTolerance ? nearest : undefined);
  return {
    releasePoint: { clientX, clientY },
    placementPoint: {
      clientX: placementClientX,
      clientY: placementClientY,
    },
    candidates,
    chosenTarget: chosen?.target ?? null,
    strategy:
      directHit !== undefined || contained !== undefined
        ? "direct-hit"
        : chosen === undefined
          ? "none"
          : "nearest-center",
  };
}

export function closestOpenBackRankSlot(
  battleScreen: HTMLElement,
  owner: MobileBattleOwner,
  clientX: number,
  clientY: number,
): MobileBattleSlotTarget | undefined {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return undefined;

  let closest:
    { readonly slotId: BattleSlotViewId; readonly distanceSquared: number } | undefined;
  const slots = battleScreen.querySelectorAll<HTMLElement>(
    `[data-battle-rank="${owner}-back"] [data-battle-slot-filled="false"]`,
  );
  slots.forEach((slot) => {
    const slotId = slot.dataset.battleSlotId;
    if (slotId === undefined) return;
    const bounds = slot.getBoundingClientRect();
    const deltaX = clientX - (bounds.left + bounds.width / 2);
    const deltaY = clientY - (bounds.top + bounds.height / 2);
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (closest === undefined || distanceSquared < closest.distanceSquared) {
      closest = {
        slotId: parseBattleSlotViewId(slotId),
        distanceSquared,
      };
    }
  });

  return closest === undefined
    ? undefined
    : { owner, rank: "back", slotId: closest.slotId };
}

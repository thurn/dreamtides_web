/** Battlefield geometry for the battle board: slot windows, card sizes, and track widths. */
import { token } from "../../primitives/tokens";
import type { BattleCardId, BattleSlotViewId } from "../../../types/identifiers";
import { parseBattleSlotViewId } from "../../../types/identifiers";
import {
  DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS,
  MOBILE_BATTLE_COMPACT_RANK_THRESHOLD,
  MOBILE_BATTLE_MAX_BACK_RANK_SLOTS,
  MOBILE_BATTLE_MAX_FRONT_RANK_SLOTS,
  MOBILE_BATTLE_MIN_BACK_RANK_SLOTS,
  MOBILE_BATTLE_MIN_FRONT_RANK_SLOTS,
} from "../mobile-battle-layout";
import type {
  MobileBattleCardView,
  MobileBattleRank,
  MobileBattleSlotView,
  MobileBattleView,
} from "../MobileBattleScreen";

const BATTLEFIELD_SIDE_INSET_PERCENT = 6;
const BATTLEFIELD_COMPACT_SIDE_INSET_PERCENT = 3;
const BATTLEFIELD_FULL_SIDE_INSET_PERCENT = 1;
const BATTLEFIELD_WIDTH_PERCENT = 100 - BATTLEFIELD_SIDE_INSET_PERCENT * 2;
const BATTLEFIELD_FULL_WIDTH_PERCENT =
  100 - BATTLEFIELD_FULL_SIDE_INSET_PERCENT * 2;
export const DESKTOP_PLAY_AREA_HEIGHT_PERCENT = 23;

export function desktopBattlefieldLayoutBackSlotCount(view: MobileBattleView): number {
  const sides = [view.enemy, view.player] as const;
  return Math.max(
    DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS,
    ...sides.map((side) => side.backRank.length),
    ...sides.map((side) => side.frontRank.length + 1),
  );
}

export function mobileBattlefieldWindow(view: MobileBattleView): {
  readonly backSlotCount: number;
  readonly frontSlotCount: number;
  readonly startIndex: number;
} {
  const sides = [view.enemy, view.player] as const;
  const backOccupancies = sides.map((side) =>
    rankOccupancy(side.backRank, "back"),
  );
  const frontOccupancies = sides.map((side) =>
    rankOccupancy(side.frontRank, "front"),
  );
  // A back-rank character at B<i> may move forward to F<i-1> or F<i>, so
  // the front window covers both front lanes beside every occupied back slot.
  const backFrontReach = backOccupancies
    .filter((occupancy) => occupancy.highestOccupiedIndex >= 0)
    .map((occupancy) => ({
      count: occupancy.count,
      lowestOccupiedIndex: Math.max(0, occupancy.lowestOccupiedIndex - 1),
      highestOccupiedIndex: Math.min(
        MOBILE_BATTLE_MAX_FRONT_RANK_SLOTS - 1,
        occupancy.highestOccupiedIndex,
      ),
    }));
  const frontSlotCount = Math.min(
    MOBILE_BATTLE_MAX_FRONT_RANK_SLOTS,
    Math.max(
      MOBILE_BATTLE_MIN_FRONT_RANK_SLOTS,
      ...frontOccupancies.map(
        (occupancy) => occupancy.highestOccupiedIndex + 1,
      ),
      ...backFrontReach.map((reach) => reach.highestOccupiedIndex + 1),
      ...frontOccupancies.map((occupancy) => occupancy.count + 1),
      ...backOccupancies.map((occupancy) => occupancy.count),
    ),
  );
  const backSlotCount = Math.max(
    MOBILE_BATTLE_MIN_BACK_RANK_SLOTS,
    Math.min(frontSlotCount + 1, MOBILE_BATTLE_MAX_BACK_RANK_SLOTS),
  );
  const maximumStart = MOBILE_BATTLE_MAX_BACK_RANK_SLOTS - backSlotCount;
  const centeredStart = Math.floor(maximumStart / 2);
  const occupiedRanges = [
    ...backOccupancies.map((occupancy) => ({
      ...occupancy,
      slotCount: backSlotCount,
    })),
    ...[...frontOccupancies, ...backFrontReach].map((occupancy) => ({
      ...occupancy,
      slotCount: frontSlotCount,
    })),
  ].filter((occupancy) => occupancy.highestOccupiedIndex >= 0);
  const minimumStart = Math.max(
    0,
    ...occupiedRanges.map(
      (occupancy) => occupancy.highestOccupiedIndex - occupancy.slotCount + 1,
    ),
  );
  const maximumOccupiedStart = Math.min(
    maximumStart,
    ...occupiedRanges.map((occupancy) => occupancy.lowestOccupiedIndex),
  );
  const startIndex =
    occupiedRanges.length > 0 && minimumStart <= maximumOccupiedStart
      ? Math.min(Math.max(centeredStart, minimumStart), maximumOccupiedStart)
      : centeredStart;
  return {
    frontSlotCount,
    backSlotCount,
    startIndex,
  };
}

function rankOccupancy(
  slots: readonly MobileBattleSlotView[],
  rank: MobileBattleRank,
): {
  readonly count: number;
  readonly lowestOccupiedIndex: number;
  readonly highestOccupiedIndex: number;
} {
  let count = 0;
  let lowestOccupiedIndex = Number.POSITIVE_INFINITY;
  let highestOccupiedIndex = -1;
  slots.forEach((slot, index) => {
    if (slot.card === null) return;
    count += 1;
    const occupiedIndex = canonicalRankIndex(slot.id, rank) ?? index;
    lowestOccupiedIndex = Math.min(lowestOccupiedIndex, occupiedIndex);
    highestOccupiedIndex = Math.max(highestOccupiedIndex, occupiedIndex);
  });
  return {
    count,
    lowestOccupiedIndex:
      lowestOccupiedIndex === Number.POSITIVE_INFINITY
        ? -1
        : lowestOccupiedIndex,
    highestOccupiedIndex,
  };
}

export function battlefieldDensityBackSlotCount(view: MobileBattleView): number {
  const sides = [view.enemy, view.player] as const;
  const occupiedCount = (slots: readonly MobileBattleSlotView[]) =>
    slots.filter((slot) => slot.card !== null).length;
  return Math.max(
    ...sides.map((side) => occupiedCount(side.backRank)),
    ...sides.map((side) => occupiedCount(side.frontRank) + 1),
  );
}

export function mobileBattlefieldDensity(layoutBackSlotCount: number): {
  readonly gap: string;
  readonly sideInsetPercent: number;
} {
  if (layoutBackSlotCount >= MOBILE_BATTLE_MAX_BACK_RANK_SLOTS) {
    return {
      gap: "0px",
      sideInsetPercent: BATTLEFIELD_FULL_SIDE_INSET_PERCENT,
    };
  }
  if (layoutBackSlotCount > MOBILE_BATTLE_COMPACT_RANK_THRESHOLD) {
    return {
      gap: token("--space-xxs"),
      sideInsetPercent: BATTLEFIELD_COMPACT_SIDE_INSET_PERCENT,
    };
  }
  return {
    gap: token("--space-xs"),
    sideInsetPercent: BATTLEFIELD_SIDE_INSET_PERCENT,
  };
}

export function battlefieldCardSize(
  layoutBackSlotCount: number,
  isDesktop: boolean,
  densityBackSlotCount: number,
  centerOffset: string,
): string {
  const slotCount = Math.max(layoutBackSlotCount, 1);
  if (!isDesktop && densityBackSlotCount >= MOBILE_BATTLE_MAX_BACK_RANK_SLOTS) {
    return `min(22cqw, calc((${String(BATTLEFIELD_FULL_WIDTH_PERCENT)}cqw - 0 * ${token("--space-xxs")}) / ${String(MOBILE_BATTLE_MAX_BACK_RANK_SLOTS)}), calc((100cqh - ${centerOffset} - ${centerOffset}) / 2))`;
  }
  const horizontalGapCount = Math.max(slotCount - 1, 0);
  const density = isDesktop
    ? {
        gap: token("--space-xs"),
        sideInsetPercent: BATTLEFIELD_SIDE_INSET_PERCENT,
      }
    : mobileBattlefieldDensity(densityBackSlotCount);
  const battlefieldWidthPercent = 100 - density.sideInsetPercent * 2;
  return `min(22cqw, calc((${String(battlefieldWidthPercent)}cqw - ${String(horizontalGapCount)} * ${density.gap}) / ${String(slotCount)}), calc((100cqh - ${density.gap} - ${centerOffset} - ${centerOffset}) / 2))`;
}

export function desktopControlCardSize(layoutBackSlotCount: number): string {
  const slotCount = Math.max(layoutBackSlotCount, 1);
  const horizontalGapCount = Math.max(slotCount - 1, 0);
  const pairedPlayAreaHeight = DESKTOP_PLAY_AREA_HEIGHT_PERCENT * 2;
  return `min(22cqw, calc((${String(BATTLEFIELD_WIDTH_PERCENT)}cqw - ${String(horizontalGapCount)} * ${token("--space-xs")}) / ${String(slotCount)}), calc((${String(pairedPlayAreaHeight)}dvh - 3 * ${token("--space-xs")}) / 4))`;
}

export function battlefieldTrackWidth(
  slotCount: number,
  cardSize: string,
  gap: string,
): string {
  if (gap === "0px") {
    const slotWidthPercent =
      BATTLEFIELD_FULL_WIDTH_PERCENT / MOBILE_BATTLE_MAX_BACK_RANK_SLOTS;
    return `${String(slotCount * slotWidthPercent)}cqw`;
  }
  const gapCount = Math.max(slotCount - 1, 0);
  return `calc(${String(slotCount)} * ${cardSize} + ${String(gapCount)} * ${gap})`;
}

export function visibleRankSlots(
  slots: readonly MobileBattleSlotView[],
  rank: MobileBattleRank,
  slotCount: number,
): readonly MobileBattleSlotView[] {
  if (slots.length >= slotCount) return slots.slice(0, slotCount);
  const prefix = rank === "back" ? "B" : "F";
  return [
    ...slots,
    ...Array.from({ length: slotCount - slots.length }, (_unused, offset) => ({
      id: parseBattleSlotViewId(`${prefix}${String(slots.length + offset)}`),
      card: null,
    })),
  ];
}

function canonicalRankIndex(
  slotId: BattleSlotViewId,
  rank: MobileBattleRank,
): number | null {
  const prefix = rank === "back" ? "B" : "F";
  const match = new RegExp(`^${prefix}(\\d+)$`).exec(slotId);
  if (match === null) return null;
  const index = Number.parseInt(match[1] ?? "", 10);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

/**
 * Selects a centered window from the canonical battle formation on mobile.
 * Occupied edge cells pull the window just far enough to remain visible, while
 * compact tutorial-only formations keep their authored local slot identities.
 */
export function visibleMobileRankSlots(
  slots: readonly MobileBattleSlotView[],
  rank: MobileBattleRank,
  slotCount: number,
  startIndex: number,
): readonly MobileBattleSlotView[] {
  const maximumSlotCount =
    rank === "back"
      ? MOBILE_BATTLE_MAX_BACK_RANK_SLOTS
      : MOBILE_BATTLE_MAX_FRONT_RANK_SLOTS;
  const canonicalSlots = slots.map((slot) => ({
    slot,
    index: canonicalRankIndex(slot.id, rank),
  }));
  const usesCanonicalSlots = canonicalSlots.every(
    (entry) => entry.index !== null,
  );
  if (!usesCanonicalSlots) {
    return visibleRankSlots(slots, rank, slotCount);
  }

  const prefix = rank === "back" ? "B" : "F";
  const slotsByIndex = new Map(
    canonicalSlots.flatMap(({ slot, index }) =>
      index === null || index >= maximumSlotCount ? [] : [[index, slot]],
    ),
  );
  const normalizedSlots = Array.from(
    { length: maximumSlotCount },
    (_unused, index) =>
      slotsByIndex.get(index) ?? {
        id: parseBattleSlotViewId(`${prefix}${String(index)}`),
        card: null,
      },
  );
  const visibleCount = Math.min(Math.max(slotCount, 1), normalizedSlots.length);
  const maximumStart = normalizedSlots.length - visibleCount;
  const start = Math.min(Math.max(startIndex, 0), maximumStart);
  return normalizedSlots.slice(start, start + visibleCount);
}

export function findBattleCardView(
  view: MobileBattleView,
  battleCardId: BattleCardId,
): MobileBattleCardView | null {
  const cards = [
    ...view.player.backRank.flatMap((slot) =>
      slot.card === null ? [] : [slot.card],
    ),
    ...view.player.frontRank.flatMap((slot) =>
      slot.card === null ? [] : [slot.card],
    ),
    ...view.enemy.backRank.flatMap((slot) =>
      slot.card === null ? [] : [slot.card],
    ),
    ...view.enemy.frontRank.flatMap((slot) =>
      slot.card === null ? [] : [slot.card],
    ),
    ...view.playerHand,
    ...view.enemyHand,
  ];
  return cards.find((card) => card.id === battleCardId) ?? null;
}

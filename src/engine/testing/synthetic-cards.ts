/**
 * Synthetic card definitions: test fixtures that exercise engine rules, not
 * catalog content. Their UUIDs use the reserved `5e5e5e5e-` prefix.
 */
import {
  createCatalog,
  type ContentState,
  type EmblemDefinitions,
  type EngineCardDefinition,
  type EngineCatalog,
  type EngineDreamwellDefinition,
  type EngineFigmentDefinition,
} from "../catalog";
import { parseCardId } from "../../types/card-identity";
import { parseDreamwellCardId } from "../../types/identifiers";
import { energy, keyword } from "../dsl/builders";
import type { CardId } from "../state/ids";

export function syntheticId(index: number): CardId {
  return parseCardId(`5e5e5e5e-0000-4000-8000-${index.toString(16).padStart(12, "0")}`);
}

function character(
  index: number,
  cost: number,
  spark: number,
  options: Partial<Pick<EngineCardDefinition, "speed" | "subtype" | "abilities">> = {},
): EngineCardDefinition {
  return {
    id: syntheticId(index),
    cardType: "character",
    costs: [energy(cost)],
    spark,
    subtype: options.subtype ?? "Warrior",
    speed: options.speed ?? "standard",
    status: "vanilla",
    abilities: options.abilities ?? (() => []),
  };
}

function event(index: number, cost: number, speed: EngineCardDefinition["speed"]): EngineCardDefinition {
  return {
    id: syntheticId(index),
    cardType: "event",
    costs: [energy(cost)],
    spark: null,
    subtype: "",
    speed,
    status: "vanilla",
    abilities: () => [],
  };
}

/** Synthetic definitions by role. */
export const SYNTHETIC = {
  vanilla0: character(1, 0, 0),
  vanilla1: character(2, 1, 1),
  vanilla2: character(3, 2, 2),
  vanilla3: character(4, 3, 3),
  vanilla5: character(5, 5, 5),
  vanilla8: character(6, 6, 8),
  fastCharacter: character(7, 2, 2, { speed: "fast" }),
  interruptCharacter: character(8, 2, 1, { speed: "interrupt" }),
  vengeful1: character(9, 1, 1, { abilities: () => [keyword("vengeful")] }),
  awakened2: character(10, 2, 2, { abilities: () => [keyword("awakened")] }),
  event0: event(11, 0, "standard"),
  event1: event(12, 1, "standard"),
  fastEvent: event(13, 1, "fast"),
  interruptEvent: event(14, 1, "interrupt"),
} as const;

export const SYNTHETIC_CARDS: readonly EngineCardDefinition[] = Object.values(SYNTHETIC);

function dreamwell(index: number, order: number, energyAdded: number, status: ContentState): EngineDreamwellDefinition {
  return {
    id: parseDreamwellCardId(`5e5e5e5e-0000-4000-8000-${(0xe00 + index).toString(16).padStart(12, "0")}`),
    order,
    energyAdded,
    status,
  };
}

/**
 * Synthetic Dreamwell cards, ids 0xe00+: three in each recurring tier, adding
 * 0, 1, or 2 energy, with a pending card (text-less, D36) in every tier.
 */
export const SYNTHETIC_DREAMWELL: readonly EngineDreamwellDefinition[] = [
  dreamwell(0, 1, 1, "vanilla"),
  dreamwell(1, 1, 1, "pending"),
  dreamwell(2, 1, 1, "vanilla"),
  dreamwell(3, 2, 1, "vanilla"),
  dreamwell(4, 2, 2, "pending"),
  dreamwell(5, 2, 1, "vanilla"),
  dreamwell(6, 3, 0, "pending"),
  dreamwell(7, 3, 1, "vanilla"),
  dreamwell(8, 3, 2, "vanilla"),
  dreamwell(9, 4, 0, "vanilla"),
  dreamwell(10, 4, 1, "pending"),
  dreamwell(11, 4, 0, "vanilla"),
];

/** A catalog of the synthetic cards and Dreamwell plus the given cards, emblems, and figments. */
export function testCatalog(
  extra: readonly EngineCardDefinition[] = [],
  emblems: EmblemDefinitions = {},
  figments: readonly EngineFigmentDefinition[] = [],
): EngineCatalog {
  return createCatalog([...SYNTHETIC_CARDS, ...extra], SYNTHETIC_DREAMWELL, emblems, figments);
}

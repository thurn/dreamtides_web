/**
 * Shared synthetic fixtures for the trigger tests: local trigger cards,
 * watcher and sign definitions, the trigger engine, and its board, play, and
 * event-reading helpers.
 */
import type { EngineAvatarDefinition, EngineCardDefinition, EngineDreamsignDefinition } from "../catalog";
import { all, characterYouControl, enemyCharacter, energy, event, self, target } from "../dsl/builders";
import {
  atStartOfTurn,
  onDawn,
  onDissolved,
  onMaterialized,
  triggered,
  triggeringCard,
  untilOpponentPays,
  whenDiscard,
  whenDraw,
  whenGainsSpark,
  whenLeavesPlay,
  whenOpponentPlays,
  whenYouPlay,
} from "../dsl/triggers";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import { eventSeenBy, type EngineEvent } from "../events";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { Answer } from "../prompts/types";
import { boardState, type BoardSetup } from "../testing/board";
import { CONTINUOUS } from "../testing/continuous-cards";
import { SYNTHETIC, syntheticId } from "../testing/synthetic-cards";
import { TRIGGER } from "../testing/trigger-cards";
import { triggerCatalog } from "../testing/trigger-harness";
import { parseAvatarId, parseDreamsignId } from "../../types/identifiers";

export const v = SYNTHETIC;
export const t = TRIGGER;
export const deck = Array.from({ length: 8 }, () => v.vanilla1.id);

export function local(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], spark = 1): EngineCardDefinition {
  return {
    id: syntheticId(800 + index),
    cardType,
    costs: [energy(0)],
    spark: cardType === "character" ? spark : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const watching = () => [
  triggered(whenYouPlay(), p.gainEnergy(1), { zone: "any" }),
  triggered(whenOpponentPlays(), p.gainEnergy(1), { zone: "any" }),
];
export const L = {
  boundedPlayWatcher: local(27, "character", () => [
    triggered(whenYouPlay({ costAtLeast: 2, costAtMost: 2 }, 2), p.gainPoints(1)),
    triggered(whenYouPlay({ costAtMost: 0 }, 2), p.gainPoints(1)),
    triggered(whenYouPlay({ cardType: "character" }, 2), p.gainEnergy(1)),
  ]),
  /** "When you play a card, gain 1●. When the opponent plays a card, gain 1●." — in every zone. */
  watcher: local(1, "character", watching),
  dissolvedDraw: local(2, "character", () => [triggered(onDissolved(), p.draw(1))]),
  dissolvedEnergy: local(3, "character", () => [triggered(onDissolved(), p.gainEnergy(1))]),
  drawPoints: local(4, "character", () => [triggered(whenDraw(), p.gainPoints(1))], 2),
  /** "Dissolve each character you control with ✦ ≤ 1." */
  sweep: local(5, "event", () => [event(p.dissolve(all(characterYouControl({ sparkAtMost: 1 }))))]),
  /** "▸Materialized: Trigger this character's ▸Materialized ability." — a mandatory cycle. */
  echo: local(7, "character", () => [triggered(onMaterialized(), p.triggerAbility(self(), "materialized"))]),
  /** "If this card is in your void, when a character you control leaves play, gain 1●." */
  voidLeavesWatcher: local(8, "character", () => [triggered(whenLeavesPlay(characterYouControl()), p.gainEnergy(1), { zone: "void" })]),
  /** "▸Dawn: If you control 2 or more warriors, gain 1⍟." */
  ifTwoWarriors: local(6, "character", () => [
    triggered(onDawn(), p.gainPoints(1), { condition: { cond: "controls", selector: characterYouControl({ subtype: "Warrior" }), atLeast: 2 } }),
  ]),
  /** "When you play a Mage, gain 1●. When you play your second Mage in a turn, gain 1⍟." */
  mageWatcher: local(9, "character", () => [
    triggered(whenYouPlay({ subtype: "Mage" }), p.gainEnergy(1)),
    triggered(whenYouPlay({ subtype: "Mage" }, 2), p.gainPoints(1)),
  ]),
  /** A vanilla Warrior. */
  warrior: local(10, "character", () => []),
  /** "A character you control gains +0✦." */
  gainZero: local(11, "event", () => [event(p.gainSpark(target(characterYouControl()), 0))]),
  /** "A character you control gains −1✦." */
  shrinkAlly: local(12, "event", () => [event(p.gainSpark(target(characterYouControl()), -1))]),
  /** "A character you control gains +1✦ until the opponent pays 1●." */
  pumpUntilPays: local(13, "event", () => [event(p.gainSpark(target(characterYouControl()), 1, untilOpponentPays(1)))]),
  /** "When the opponent plays a card, this character gains +1✦." */
  opponentPlaysPump: local(14, "character", () => [triggered(whenOpponentPlays(), p.gainSpark(self(), 1))]),
  /** "A character you control gains 1 additional ✦" outside a gain trigger: a definition error. */
  strayAdditional: local(15, "event", () => [event(p.gainAdditionalSpark(target(characterYouControl()), 1))]),
  /** "Once per turn, when a character you control gains ✦, it gains 1 additional ✦." */
  additionalOnce: local(16, "character", () => [triggered(whenGainsSpark(), p.gainAdditionalSpark(triggeringCard(), 1), { oncePerTurn: true })]),
  /** "When a character you control gains ✦, gain 1●." */
  gainWatcher: local(17, "character", () => [triggered(whenGainsSpark(), p.gainEnergy(1))]),
  /** "When the opponent plays a card, if this card is in your hand, you win the game." */
  handWin: local(18, "character", () => [triggered(whenOpponentPlays(), p.winTheGame(), { zone: "hand" })]),
  /** "When the opponent plays a card, you win the game." — in every zone. */
  anywhereWin: local(19, "character", () => [triggered(whenOpponentPlays(), p.winTheGame(), { zone: "any" })]),
  /** "When you discard a card, gain 1●." */
  discardWatcher: local(20, "character", () => [triggered(whenDiscard(), p.gainEnergy(1))]),
  /** "Draw a card, then discard a card." */
  drawThenDiscard: local(21, "event", () => [event(p.sequence(p.draw(1), p.discard(1)))]),
  /** "When the opponent plays a card, the next time you play a card, gain 1●." — in every zone. */
  anywhereDelayed: local(22, "character", () => [triggered(whenOpponentPlays(), p.delayed(whenYouPlay(), p.gainEnergy(1)), { zone: "any" })]),
  /** "When the opponent plays a card, until the opponent pays 1●, the opponent's characters get -1✦." — in every zone. */
  anywherePayable: local(23, "character", () => [
    triggered(whenOpponentPlays(), p.forDuration(untilOpponentPays(1), p.sparkModifier(all(enemyCharacter()), -1)), { zone: "any" }),
  ]),
  /** "When the opponent plays a card, dissolve a character you control." — in every zone. */
  anywhereDissolveOwn: local(24, "character", () => [triggered(whenOpponentPlays(), p.dissolve(target(characterYouControl())), { zone: "any" })]),
  /** "When the opponent plays a card, draw a card." — in every zone. */
  anywhereDraw: local(25, "character", () => [triggered(whenOpponentPlays(), p.draw(1), { zone: "any" })]),
  /** "Discard a chosen card from the opponent's hand." */
  chosenDiscard: local(26, "event", () => [event(p.discardChosen())]),
} as const;
export const WATCHER_AVATAR: EngineAvatarDefinition = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000000391"), status: "authored", abilities: watching };
export const WATCHER_SIGN: EngineDreamsignDefinition = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000392"), status: "authored", abilities: watching };
/** "At the start of your turn, you may gain 1⍟." — a prompt while the turn is beginning. */
export const START_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000394"),
  status: "authored",
  abilities: () => [triggered(atStartOfTurn(), p.optional(p.gainPoints(1)))],
};
/** "When you draw a card, gain 1●." */
export const DRAW_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000395"),
  status: "authored",
  abilities: () => [triggered(whenDraw(), p.gainEnergy(1))],
};
/** "▸Dawn: Dissolve a character you control." */
export const DAWN_AVATAR: EngineAvatarDefinition = {
  id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000000393"),
  status: "authored",
  abilities: () => [triggered(onDawn(), p.dissolve(target(characterYouControl())))],
};

/** "When a character you control gains ✦, return it to its owner's hand." */
export const BOUNCE_GAINER_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000396"),
  status: "authored",
  abilities: () => [triggered(whenGainsSpark(), p.returnToHand(triggeringCard()))],
};
/** "When a character you control gains ✦, return each character you control with ✦ ≤ 1 to its owner's hand." */
export const BOUNCE_SMALL_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000397"),
  status: "authored",
  abilities: () => [triggered(whenGainsSpark(), p.returnToHand(all(characterYouControl({ sparkAtMost: 1 }))))],
};
/** "When a character the opponent controls gains ✦, gain control of it." */
export const STEAL_SIGN: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000398"),
  status: "authored",
  abilities: () => [triggered(whenGainsSpark({ controller: "opponent" }), p.gainControl(triggeringCard()))],
};

export const C = CONTINUOUS;
export const engine = createEngine(
  triggerCatalog([...Object.values(L), C.warriorAnthem, C.supporter, C.spiritBond], {
    avatars: [WATCHER_AVATAR, DAWN_AVATAR],
    dreamsigns: [WATCHER_SIGN, START_SIGN, DRAW_SIGN, BOUNCE_GAINER_SIGN, BOUNCE_SMALL_SIGN, STEAL_SIGN],
  }),
);

export function board(setup: Omit<BoardSetup, "phase" | "active"> & Partial<Pick<BoardSetup, "phase" | "active">>) {
  return boardState(engine.catalog, { active: "player", phase: "day", ...setup });
}

export function play(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  const source = new ScriptedSource(answers);
  const result = engine.apply(state, side, { kind: "play", card, from: "hand" }, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  return result;
}

export function resolvedSources(events: readonly EngineEvent[]): (AbilitySource | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerResolved" ? [entry.source] : []));
}

export function queuedCount(events: readonly EngineEvent[], source: AbilitySource): number {
  return events.filter((entry) => entry.kind === "triggerQueued" && JSON.stringify(entry.source) === JSON.stringify(source)).length;
}

/** Every string in a value, keys included. */
export function strings(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    into.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) strings(entry, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      into.add(key);
      strings(entry, into);
    }
  }
  return into;
}

/** `events` as `viewer` sees them in `state` (`eventSeenBy`). */
export function seenBy(events: readonly EngineEvent[], viewer: Side, state: BattleState): EngineEvent[] {
  return events.flatMap((entry) => {
    const seen = eventSeenBy(entry, viewer, state);
    return seen === null ? [] : [seen];
  });
}

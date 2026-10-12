/** Synthetic fixtures shared by the `loseAllAbilities` contracts, independent of catalog text. */
import { expect } from "vitest";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { activated, all, anyCharacter, characterYouControl, energy, enemyCharacter, event, fromVoid, keyword, self, staticAbility, target } from "../../../dsl/builders";
import { onDissolved, onMaterialized, triggered, untilOpponentPays, whenLeavesPlay, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { BattleSlice } from "../../../fold/slice";
import type { Action } from "../../../rules/actions";
import { instanceOrigin, originAbilities } from "../../../rules/activation";
import { ceaseToExist, instanceOf } from "../../../rules/zones";
import { parseFigmentId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, FloatingEffect } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import type { BoardSetup } from "../../../testing/board";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { dissolve } from "../dissolve";
import { gainAbilities } from "../gain-abilities";
import { gainPoints } from "../gain-points";
import { grant } from "../grant";
import { loseAllAbilities } from "../lose-all-abilities";
import { returnToHand } from "../return-to-hand";
import { sparkModifier } from "../spark-modifier";

function card(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition {
  return {
    id: syntheticId(0x11a00 + index), cardType, costs: [energy(0)], spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed, status: "authored", abilities,
  };
}

/** Resolves "this character gains the abilities of the first character in the opponent's void" for `side`'s first back-rank character. */
function lendTo(side: Side): EngineCardDefinition["synthetic"] {
  return {
    resolve(ctx) {
      const source = ctx.state.sides[side].backRank[0]!;
      const owner = ctx.state.instances[source].controller === "player" ? "enemy" : "player";
      resolveEffect(ctx, gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player: "opponent" })])), {
        source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0, controller: ctx.state.instances[source].controller,
        x: null, optionalPaid: [], choices: { modes: [], targets: [[ctx.state.sides[owner].void[0]]] },
      });
    },
  };
}

/** Resolves the hijacker's ability with the first card in the player's void as its source, on the enemy's first back-rank character. */
const stealFromVoid: EngineCardDefinition["synthetic"] = {
  resolve(ctx) {
    const source = ctx.state.sides.player.void[0];
    resolveEffect(ctx, loseAllAbilities(target(enemyCharacter()), { sourceGains: true }), {
      source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0, controller: "player",
      x: null, optionalPaid: [], choices: { modes: [], targets: [[ctx.state.sides.enemy.backRank[0]!]] },
    });
  },
};

/**
 * In one resolution, at one clock: the player's first back-rank character loses all its abilities, then
 * takes the abilities of the enemy's first back-rank character, as a queued hijack resolving after it lost them.
 */
const lossThenSteal: EngineCardDefinition["synthetic"] = {
  resolve(ctx) {
    const source = ctx.state.sides.player.backRank[0]!;
    const env = (target: InstanceId) => ({
      source, origin: instanceOrigin(instanceOf(ctx.state, source)), ability: 0, controller: "player" as const,
      x: null, optionalPaid: [], choices: { modes: [], targets: [[target]] },
    });
    resolveEffect(ctx, loseAllAbilities(target(anyCharacter())), env(source));
    resolveEffect(ctx, loseAllAbilities(target(enemyCharacter()), { sourceGains: true }), env(ctx.state.sides.enemy.backRank[0]!));
  },
};

/**
 * A created hijacker (the player's first back-rank character) ceases to exist, then its ▸Materialized ability
 * resolves on the enemy's first back-rank character, as a trigger queued before it ceased.
 */
const ceasedHijack: EngineCardDefinition["synthetic"] = {
  resolve(ctx) {
    const source = ctx.state.sides.player.backRank[0]!;
    const origin = instanceOrigin(instanceOf(ctx.state, source));
    ceaseToExist(ctx, source, { silent: true });
    resolveEffect(ctx, loseAllAbilities(target(enemyCharacter()), { sourceGains: true }), {
      source, origin, ability: 0, controller: "player", x: null, optionalPaid: [],
      choices: { modes: [], targets: [[ctx.state.sides.enemy.backRank[0]!]] },
    });
  },
};

/** A figment type with a keyword, a static ability and a triggered ability. */
export const WISP: EngineFigmentDefinition = {
  id: parseFigmentId(syntheticId(0x11a80)), subtype: "Spirit Animal", spark: 1, status: "authored",
  abilities: () => [keyword("vengeful"), staticAbility(sparkModifier(self(), 2)), triggered(whenYouPlay({ cardType: "event" }), gainPoints(5))],
};

/** Synthetic losses and gains of abilities. */
export const LA = {
  /** "An enemy loses all abilities until the opponent pays 3● (4● amplified)." */
  fracture: card(0, "event", (variant) => [event(loseAllAbilities(target(enemyCharacter()), { duration: untilOpponentPays(variant.amplified ? 4 : 3) }))]),
  /** "▸Materialized: An enemy loses all abilities. This character gains those abilities." */
  hijacker: card(1, "character", () => [triggered(onMaterialized(), loseAllAbilities(target(enemyCharacter()), { sourceGains: true }))]),
  /** "A character loses all abilities." */
  silence: card(2, "event", () => [event(loseAllAbilities(target(anyCharacter())))]),
  /** Vengeful; "1●: Gain 1 point. Once per turn."; "When you play an event, gain 2 points"; "Characters you control have +1✦". */
  donor: card(3, "character", () => [
    keyword("vengeful"),
    activated([energy(1)], gainPoints(1), { oncePerTurn: true }),
    triggered(whenYouPlay({ cardType: "event" }), gainPoints(2)),
    staticAbility(sparkModifier(all(characterYouControl()), 1)),
  ]),
  /** "When this character leaves play, gain 1 point"; "▸Dissolved: Gain 4 points." */
  mourner: card(4, "character", () => [triggered(whenLeavesPlay("self"), gainPoints(1)), triggered(onDissolved(), gainPoints(4))]),
  /** A 0● Interrupt: "Dissolve a character." */
  dissolver: card(5, "event", () => [event(dissolve(target(anyCharacter())))], "interrupt"),
  /** "Return a character to hand." */
  returner: card(6, "event", () => [event(returnToHand(target(anyCharacter())))]),
  /** "A character gains Veil." */
  veil: card(7, "event", () => [event(grant(target(anyCharacter()), "veil"))]),
  /** "Characters you control have Veil." */
  anthem: card(8, "character", () => [staticAbility(grant(all(characterYouControl()), "veil"))]),
  /** The player's first back-rank character gains the abilities of the first character in the enemy void. */
  lendPlayer: { ...card(9, "event", () => []), synthetic: lendTo("player") },
  /** The enemy's first back-rank character gains the abilities of the first character in the player's void. */
  lendEnemy: { ...card(10, "event", () => []), synthetic: lendTo("enemy") },
  /** The hijacker's ability, resolved for a source that is not in play. */
  stealFromVoid: { ...card(11, "event", () => []), synthetic: stealFromVoid },
  /** "This character has Veil." */
  veiler: card(12, "character", () => [staticAbility(grant(self(), "veil"))]),
  /** The player's first back-rank character loses its abilities, then takes the enemy's, at one clock. */
  lossThenSteal: { ...card(13, "event", () => []), synthetic: lossThenSteal },
  /** A created hijacker ceases to exist before its ability resolves. */
  ceasedHijack: { ...card(14, "event", () => []), synthetic: ceasedHijack },
} as const satisfies Record<string, EngineCardDefinition>;

export const engine = createEngine(testCatalog(Object.values(LA), {}, [WISP]));
export const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
export { v };

export const decklists = (player: readonly EngineCardDefinition[], enemy: readonly EngineCardDefinition[]) => ({
  player: [...player.map((definition) => definition.id), ...deck].map((cardId) => ({ cardId })),
  enemy: [...enemy.map((definition) => definition.id), ...deck].map((cardId) => ({ cardId })),
});

export const board = (player: BoardSetup["player"], enemy: BoardSetup["enemy"], active: Side = "player"): BoardSetup => ({
  active, phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, energy: 5, ...enemy },
});

export const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

/** A saved journey battle around `slice`, as a save file holds it. */
export function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return {
    mode: { kind: "journey" },
    init: {
      battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
      avatarSummary: null, cardDefinitions: [],
    },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown },
  };
}

/** Runs `actions` in order, checking every step's event redaction, then passes until the stack is empty. */
export function run(start: BattleState, actions: readonly (readonly [Side, Action])[], answers: ScriptedSource = new ScriptedSource([])) {
  let state = start;
  const events: EngineEvent[] = [];
  for (const [side, action] of actions) {
    const result = engine.apply(state, side, action, answers);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    events.push(...result.events);
    state = result.state;
  }
  const resolved = passUntil(engine, state, (next) => next.stack.length === 0, answers);
  answers.assertExhausted();
  return { state: resolved.state, events: [...events, ...resolved.events] };
}

export const play = (card: InstanceId): Action => ({ kind: "play", card, from: "hand" });
export const activate = (source: InstanceId, ability = 0): Action => ({ kind: "activate", source, ability });
export const losses = (state: BattleState): FloatingEffect[] => state.floating.filter(({ change }) => change.kind === "loseAbilities");
export const gains = (state: BattleState): FloatingEffect[] => state.floating.filter(({ change }) => change.kind === "abilities");
/** The indexes and kinds of the abilities an instance has now, lost ones left out. */
export const abilityKinds = (state: BattleState, id: InstanceId): string[] =>
  originAbilities(engine.catalog, instanceOrigin(instanceOf(state, id))).flatMap((ability, index) => [`${String(index)}:${ability.kind}`]);
/** The ability indexes `side` may activate on `source` now. */
export const activations = (state: BattleState, side: Side, source: InstanceId): number[] =>
  engine.legalActions(state, side).flatMap((action) => (action.kind === "activate" && action.source === source ? [action.ability] : []));
/** The payable effects `side` may pay to end now. */
export const payments = (state: BattleState, side: Side): string[] =>
  engine.legalActions(state, side).flatMap((action) => (action.kind === "payToEnd" ? [action.effect] : []));

import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { characteristicsOf } from "../../../continuous/characteristics";
import { anyCharacter, countCards, energy, event, everyIn, self, staticAbility, target } from "../../../dsl/builders";
import { triggered, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { PolicyRandom } from "../../../policy/random";
import { battleSeed, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, ContinuousChange } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { DSL_CARDS } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { Decklists } from "../../../view/determinize";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { cardsIn, grantCardKeyword } from "../grant-card-keyword";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { sparkModifier } from "../spark-modifier";
import { deck, knowing, v } from "./cards-support";

/** Synthetic fixtures for ✦ bounds read by static abilities and by played records (RD-hv-umm2.464-1). */
const lowSparkOffering: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1127), status: "authored",
  abilities: () => [staticAbility(grantCardKeyword(cardsIn("hand", { sparkAtMost: 2 }), "offering"))],
};

const highSparkVengeful: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1128), status: "authored",
  abilities: () => [staticAbility(grantCardKeyword(cardsIn("hand", { sparkAtLeast: 3 }), "vengeful"))],
};

/** "This character has +1✦ for each ≥3✦ card in your void" (layer 5). */
const voidSparkCounter: EngineCardDefinition = {
  ...v.vanilla0, id: syntheticId(1129), status: "authored",
  abilities: () => [staticAbility(sparkModifier(self(), countCards("void", { sparkAtLeast: 3 })))],
};

/** "When you play your second ≤1✦ card this turn, gain 1⍟." */
const secondLowSparkPlay: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1130), status: "authored",
  abilities: () => [triggered(whenYouPlay({ sparkAtMost: 1 }, 2), gainPoints(1))],
};

/** Dissolves a character, then shuffles every character in your void into your deck. */
const dissolveAndShuffle: EngineCardDefinition = {
  ...v.event0, id: syntheticId(1131), costs: [energy(0)], status: "authored",
  abilities: () => [event(sequence(dissolve(target(anyCharacter())), shuffleInto([everyIn("void", { cardType: "character" })])))],
};

const engine = createEngine(testCatalog([...DSL_CARDS, lowSparkOffering, highSparkVengeful, voidSparkCounter, secondLowSparkPlay, dissolveAndShuffle]));

/** Gives `id` spark until end of turn, as a resolved "gains +N✦ this turn" would. */
function temporarySpark(state: BattleState, id: InstanceId, amount: number): void {
  const change: ContinuousChange = { kind: "spark", instance: id, amount };
  state.floating.push({ id: `e${state.nextEffect}`, controller: "player", source: { kind: "avatar", side: "player" }, timestamp: 1, expiry: { at: "endOfTurn" }, change });
  state.nextEffect += 1;
}

describe("✦ bounds read by static abilities", () => {
  it("grants a keyword to hand cards by their final spark, gained and temporary spark included", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { back: [lowSparkOffering.id, highSparkVengeful.id], hand: [v.vanilla1.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck },
      enemy: { deck },
    });
    const [gained, temporary, two, three] = ids.player.hand;
    state.instances[gained].status.gainedSpark = 2;
    temporarySpark(state, temporary, 2);
    const keywords = (id: InstanceId) => characteristicsOf(state, engine.catalog, id).keywords;
    expect([gained, temporary, two, three].map((id) => characteristicsOf(state, engine.catalog, id).spark)).toEqual([3, 3, 2, 3]);
    expect([gained, temporary, two, three].map(keywords)).toEqual([["vengeful"], ["vengeful"], ["offering"], ["vengeful"]]);
  });

  it("counts void cards for a spark-changing static by their final spark, without reading its own change", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { back: [voidSparkCounter.id], void: [v.vanilla1.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck },
      enemy: { deck },
    });
    const [gained, temporary] = ids.player.void;
    state.instances[gained].status.gainedSpark = 2;
    temporarySpark(state, temporary, 2);
    // The gained 3✦, the temporary 3✦ and the printed 3✦; not the 2✦.
    expect(characteristicsOf(state, engine.catalog, ids.player.back[0]!).spark).toBe(3);
  });
});

describe("✦ bounds on played records", () => {
  const setup = () => boardState(engine.catalog, {
    active: "player", phase: "day",
    player: { back: [secondLowSparkPlay.id], hand: [v.vanilla1.id, dissolveAndShuffle.id, v.vanilla0.id], energy: 10, deck },
    enemy: { deck },
  });
  const play = (state: BattleState, card: InstanceId, answers: InstanceId[][] = []) =>
    engine.apply(state, "player", { kind: "play", card, from: "hand" }, new ScriptedSource(answers)).state;

  it("matches a play by the spark the card was played with", () => {
    const { state, ids } = setup();
    const [low, , zero] = ids.player.hand;
    const first = play(state, low);
    first.instances[low].status.gainedSpark = 2;
    expect(play(first, zero).sides.player.score).toBe(1);
  });

  it("matches a played card that left for a hidden zone alike in the real state and in each side's determinization", () => {
    const { state, ids } = setup();
    const [low, shuffler, zero] = ids.player.hand;
    const shuffled = play(play(state, low), shuffler, [[low]]);
    expect(shuffled.sides.player.deck).toContain(low);
    // The opponent knows the last hand card, so its determinization plays the same card.
    const before = knowing(shuffled, "enemy", [zero]);
    const decklists: Decklists = {
      player: [secondLowSparkPlay.id, v.vanilla1.id, dissolveAndShuffle.id, v.vanilla0.id, ...deck].map((cardId) => ({ cardId })),
      enemy: deck.map((cardId) => ({ cardId })),
    };
    expect(play(before, zero).sides.player.score).toBe(1);
    for (const viewer of ["player", "enemy"] as const satisfies readonly Side[]) {
      const seen = engine.view(before, viewer);
      expect(seen.turnLog.played.player[0]?.instance).toBeNull();
      const random = new PolicyRandom(battleSeed(`played-spark-${viewer}`));
      const sampled = engine.determinize(seen, decklists, () => random.next());
      expect(invariantViolations(sampled, engine.catalog)).toEqual([]);
      expect(play(sampled, zero).sides.player.score).toBe(1);
    }
    expect(determinizationDivergences(engine, before, decklists, battleSeed("played-spark"), 0)).toEqual([]);
  });
});

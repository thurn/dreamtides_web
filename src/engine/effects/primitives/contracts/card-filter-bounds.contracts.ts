import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer, ChooseCardsPrompt } from "../../../prompts/types";
import { characterYouControl, costExactly, count, energy, energyX, event, fromVoid, staticAbility, x } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { triggered, whenMaterialize, whenYouPlay } from "../../../dsl/triggers";
import { hasKeyword } from "../../../rules/keywords";
import { deserializeState, serializeState } from "../../../state/hash";
import { type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, cardIdOf } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { labBoard } from "../../../testing/lab-solver";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId } from "../../../testing/synthetic-cards";
import { ZONE, zoneCatalog } from "../../../testing/zone-cards";
import { createCopyInHand } from "../create-copy-in-hand";
import { discover } from "../discover";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { cardsIn, grantCardKeyword } from "../grant-card-keyword";
import { costModifier } from "../cost-modifier";
import { v, deck } from "./cards-support";

/** Synthetic cost-bound filter and selector fixtures; contracts never depend on live card data. */
const playedAtMostOne: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1100), status: "authored",
  abilities: () => [triggered(whenYouPlay({ costAtMost: 1 }), gainPoints(1))],
};

const secondExactTwo: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1101), status: "authored",
  abilities: () => [triggered(whenYouPlay(costExactly(2), 2), gainPoints(1))],
};

const boundedDiscover: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(1102), costs: [energy(0)],
  abilities: () => [event(discover({ cardType: "character", costAtMost: 1 }))],
};

const dearAtLeastTwo: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1103), status: "authored",
  abilities: () => [staticAbility(costModifier("you", { costAtLeast: 2 }, 1))],
};

const cheapHandOffering: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1104), status: "authored",
  abilities: () => [staticAbility(grantCardKeyword(cardsIn("hand", { costAtMost: 1 }), "offering"))],
};

const copyDearVoidCard: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(1105), costs: [energy(0)],
  abilities: () => [event(createCopyInHand(fromVoid({ costAtLeast: 5 })))],
};

const nonFigmentWatcher: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1106), status: "authored",
  abilities: () => [triggered(whenMaterialize(characterYouControl({ figment: false, costAtMost: 2 })), gainPoints(1))],
};

const figmentWatcher: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1107), status: "authored",
  abilities: () => [triggered(whenMaterialize(characterYouControl({ figment: true })), draw(1))],
};

const xCountPoints: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(1109), costs: [energyX(0)],
  abilities: () => [event(gainPoints(count(characterYouControl(costExactly(x())))))],
};

const xWatcher: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1108), status: "authored", costs: [energy(1), energyX(0)],
  abilities: () => [triggered(whenMaterialize(characterYouControl(costExactly(x()))), draw(1))],
};

describe("card filter cost bounds", () => {
  const bounds = createEngine(zoneCatalog([
    playedAtMostOne, secondExactTwo, boundedDiscover, dearAtLeastTwo, cheapHandOffering, copyDearVoidCard, nonFigmentWatcher, figmentWatcher, xWatcher, xCountPoints,
  ]));
  const longDeck = Array.from({ length: 10 }, () => v.vanilla1.id);
  const reduced = (state: BattleState, id: InstanceId, costReduction: number): void => {
    state.instances[id] = { ...state.instances[id], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction } } };
  };
  const play = (state: BattleState, card: InstanceId, answers: readonly Answer[] = []): BattleState => {
    const source = new ScriptedSource(answers);
    const after = bounds.apply(state, "player", { kind: "play", card, from: "hand" }, source);
    source.assertExhausted();
    return after.state;
  };

  it("matches a play by copiable cost, X counting as 0, and counts only matching plays toward nth", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { back: [playedAtMostOne.id, secondExactTwo.id], hand: [v.vanilla2.id, v.event1.id, DSL.variableSpark.id, v.vanilla3.id, v.vanilla2.id], energy: 20, deck: longDeck },
      enemy: { deck },
    });
    const [firstTwo, oneCost, variable, reducedThree, secondTwo] = ids.player.hand;
    reduced(state, reducedThree, 2);
    let after = play(state, firstTwo);
    expect(after.sides.player.score).toBe(0);
    after = play(after, oneCost);
    expect(after.sides.player.score).toBe(1);
    after = play(after, variable, [3]);
    expect(after.sides.player.score).toBe(2);
    // A deck-entry reduction lowers the copiable cost the filter reads: 3● less 2● is 1●.
    after = play(after, reducedThree);
    expect(after.sides.player.score).toBe(3);
    // The second 2● card played this turn, though not the second card played.
    after = play(after, secondTwo);
    expect(after.sides.player.score).toBe(4);
  });

  it("matches an earlier play of a created card that has ceased to exist by the cost it was played with", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { back: [playedAtMostOne.id, v.vanilla2.id], hand: [ZONE.handEcho.id, DSL.returnAnyToHand.id, v.event1.id, v.vanilla2.id], energy: 20, deck: longDeck },
      enemy: { deck },
    });
    const [echo, bounce, oneCost, twoCost] = ids.player.hand;
    const original = ids.player.back[1]!;
    // A created copy of the 2● character, played, then returned to hand, where it ceases to exist.
    let after = play(state, echo, [[original]]);
    const copy = after.sides.player.hand.find((id) => !ids.player.hand.includes(id))!;
    after = play(after, copy);
    after = play(after, bounce, [[copy]]);
    expect(after.instances[copy]).toBeUndefined();
    expect(after.turnLog.played.player.map((card) => [card.instance, card.cost])).toContainEqual([copy, 2]);
    expect(after.sides.player.score).toBe(2);
    after = play(after, oneCost);
    expect(after.sides.player.score).toBe(3);
    after = play(after, twoCost);
    expect(after.sides.player.score).toBe(3);
  });

  it("discovers only cards within the bounds, by copiable cost", () => {
    const fold = createFoldAdapter(bounds);
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { hand: [boundedDiscover.id], energy: 1, deck: [v.vanilla2.id, DSL.variableSpark.id, v.vanilla3.id, v.event1.id, v.vanilla5.id] },
      enemy: { deck },
    });
    reduced(state, ids.player.deck[2], 2);
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    if (outcome.kind !== "applied") throw new Error("bounced");
    const prompt = fold.pending(outcome.slice)!.prompt as ChooseCardsPrompt;
    expect([...prompt.candidates].sort()).toEqual([ids.player.deck[1], ids.player.deck[2]].sort());
  });

  it("applies a cost modifier only to cards within the bounds", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { back: [dearAtLeastTwo.id], hand: [v.event1.id, v.vanilla2.id, v.vanilla3.id], energy: 10, deck: longDeck },
      enemy: { deck },
    });
    const [oneCost, twoCost, reducedThree] = ids.player.hand;
    reduced(state, reducedThree, 2);
    let after = play(state, twoCost);
    expect(after.sides.player.currentEnergy).toBe(7);
    after = play(after, oneCost);
    expect(after.sides.player.currentEnergy).toBe(6);
    after = play(after, reducedThree);
    expect(after.sides.player.currentEnergy).toBe(5);
  });

  it("grants a keyword only to cards within the bounds", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { back: [cheapHandOffering.id], hand: [v.event1.id, v.vanilla2.id, v.vanilla3.id, DSL.variableSpark.id], energy: 10, deck: longDeck },
      enemy: { deck },
    });
    reduced(state, ids.player.hand[2], 2);
    expect(ids.player.hand.map((id) => hasKeyword(state, bounds.catalog, id, "offering"))).toEqual([true, false, true, true]);
  });

  it("targets only void cards within the bounds, and the lab stages one", () => {
    const { setup } = labBoard(bounds, copyDearVoidCard.id, [v.vanilla1, v.vanilla5]);
    expect(setup.player?.void).toEqual([v.vanilla5.id]);
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day", player: { hand: [copyDearVoidCard.id], void: [v.vanilla1.id, v.vanilla3.id, v.vanilla5.id], energy: 1, deck: longDeck }, enemy: { deck },
    });
    const after = play(state, ids.player.hand[0]);
    expect(after.sides.player.hand.map((id) => cardIdOf(after, id))).toEqual([v.vanilla5.id]);
  });

  it("tells figments, figment copies included, from other characters, and bounds the others by copiable cost", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { back: [nonFigmentWatcher.id, figmentWatcher.id, ZONE.twinner.id], hand: [ZONE.twoWarriors.id, v.vanilla2.id, v.vanilla3.id], energy: 20, deck: longDeck },
      enemy: { deck },
    });
    const [warriors, twoCost, threeCost] = ids.player.hand;
    let after = play(state, warriors);
    expect([after.sides.player.score, after.sides.player.hand.length]).toEqual([0, 4]);
    after = play(after, twoCost);
    expect([after.sides.player.score, after.sides.player.hand.length]).toEqual([1, 3]);
    after = play(after, threeCost);
    expect([after.sides.player.score, after.sides.player.hand.length]).toEqual([1, 2]);
    // A figment copy of the 2● character keeps its cost, and is a figment.
    const source = new ScriptedSource([[twoCost]]);
    after = bounds.apply(after, "player", { kind: "activate", source: ids.player.back[2]!, ability: 0 }, source).state;
    source.assertExhausted();
    expect([after.sides.player.score, after.sides.player.hand.length]).toEqual([1, 3]);
  });

  it("reads the X paid for its source while it is in play, across a reload, and 0 once it left play or was never played", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { hand: [xWatcher.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, DSL.returnAnyToHand.id], energy: 20, deck: longDeck },
      enemy: { deck },
    });
    const [watcher, oneCost, twoCost, threeCost, bounce] = ids.player.hand;
    // X = 2: its own copiable cost is 1●, so its own materialization does not match.
    let after = play(state, watcher, [2]);
    expect(after.instances[watcher].status.x).toBe(2);
    expect(after.sides.player.hand).toHaveLength(4);
    after = deserializeState(serializeState(after));
    after = play(after, oneCost);
    expect(after.sides.player.hand).toHaveLength(3);
    after = play(after, twoCost);
    expect(after.sides.player.hand).toHaveLength(3);
    // Returned to hand, it keeps no X: replayed with X = 1, it matches its own 1● materialization, and a 3● one no more.
    after = play(after, bounce, [[watcher]]);
    expect(after.instances[watcher].status.x).toBeNull();
    expect(after.sides.player.hand).toHaveLength(3);
    after = play(after, watcher, [1]);
    expect(after.sides.player.hand).toHaveLength(3);
    after = play(after, threeCost);
    expect(after.sides.player.hand).toHaveLength(2);
    // A source that was never played has X = 0, which a figment's 0● cost matches.
    const placed = boardState(bounds.catalog, {
      active: "player", phase: "day", player: { back: [xWatcher.id], hand: [ZONE.twoWarriors.id], energy: 5, deck: longDeck }, enemy: { deck },
    });
    expect(play(placed.state, placed.ids.player.hand[0]).sides.player.hand).toHaveLength(2);
  });

  it("matches only its own controller's materializations, each source reading its own X", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { back: [xWatcher.id, xWatcher.id], hand: [v.vanilla2.id], energy: 5, deck: longDeck },
      enemy: { back: [xWatcher.id], deck: longDeck },
    });
    state.instances[ids.player.back[0]!].status.x = 2;
    state.instances[ids.player.back[1]!].status.x = 3;
    state.instances[ids.enemy.back[0]!].status.x = 2;
    const after = play(state, ids.player.hand[0]);
    expect(after.sides.player.hand).toHaveLength(1);
    expect(after.sides.enemy.hand).toHaveLength(0);
  });

  it("reads the X chosen for a source card on the stack as it resolves", () => {
    const { state, ids } = boardState(bounds.catalog, {
      active: "player", phase: "day",
      player: { back: [v.vanilla1.id, v.vanilla2.id, v.vanilla2.id, v.vanilla3.id], hand: [xCountPoints.id], energy: 5, deck: longDeck },
      enemy: { back: [v.vanilla2.id], deck },
    });
    expect(play(state, ids.player.hand[0], [2]).sides.player.score).toBe(2);
  });
});

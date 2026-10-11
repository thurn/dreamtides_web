import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { engineCardFromContent } from "../../../content-catalog";
import type { CardDefinition } from "../../../../content/define";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import { abandonCost, activated, energy, energyX, event, x } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { discover } from "../discover";
import { draw } from "../draw";
import { v, deck, knowing } from "./cards-support";

/** Discovers a character, then throws: a step that fails after its Discover's answer was accepted. */
const discoverThenFail: EngineCardDefinition = {
  id: syntheticId(920),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discover({ cardType: "character" }), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its discovery");
    },
  },
};

/** Synthetic cost-bound fixtures; contracts never depend on live card data. */
const paidCostDiscover: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(950), costs: [energyX(0)],
  abilities: () => [event(discover({}, { costExactly: x() }))],
};

const freeCostDiscover: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(951), costs: [energy(1)],
  abilities: () => [event(discover({ cardType: "character" }, { chooseCost: true }))],
};

const exactSparkSacrifice: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(952), status: "authored",
  abilities: () => [activated([energy(2), abandonCost({ sparkAtLeast: 1, sparkAtMost: 1 })], draw(2))],
};

const freeCostThenFail: EngineCardDefinition = {
  ...discoverThenFail, id: syntheticId(953), costs: [energy(1)],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, discover({ cardType: "character" }, { chooseCost: true }), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
      ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic resolution failure");
  } },
};

describe("selector cost and spark bounds", () => {
  const bounded = createEngine(testCatalog([paidCostDiscover, freeCostDiscover, exactSparkSacrifice, freeCostThenFail, DSL.variableSpark]));
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
    return outcome.slice;
  };

  it("discovers exactly the paid X cost, retaining distinct instances of the same UUID", () => {
    const result = runScenario(bounded, {
      board: { active: "player", phase: "day", player: { hand: [paidCostDiscover.id], energy: 4, deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla2.id, v.vanilla3.id] }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [2, [ids.player.deck[2]]],
    });
    expect(result.state.sides.player.currentEnergy).toBe(2);
    expect(result.state.sides.player.hand).toEqual([result.ids.player.deck[2]]);
    expect(result.state.sides.player.deck).toContain(result.ids.player.deck[1]);
    expect(result.events.filter((item) => item.kind === "cardDiscovered")).toEqual([{ kind: "cardDiscovered", side: "player", instance: result.ids.player.deck[2] }]);
  });

  it("counts candidate X as zero and reads copiable cost reductions", () => {
    const { state, ids } = boardState(bounded.catalog, {
      active: "player", phase: "day", player: { hand: [paidCostDiscover.id], energy: 1, deck: [DSL.variableSpark.id, v.vanilla2.id, v.vanilla3.id] }, enemy: { deck },
    });
    state.instances[ids.player.deck[1]] = { ...state.instances[ids.player.deck[1]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 2 } } };
    const source = new ScriptedSource([0, [ids.player.deck[1]]]);
    const after = bounded.apply(state, "player", playFromHand(ids, "player").action, source);
    source.assertExhausted();
    expect(after.state.sides.player.currentEnergy).toBe(1);
    expect(after.state.sides.player.hand).toEqual([ids.player.deck[1]]);
    expect(after.state.sides.player.deck).toContain(ids.player.deck[0]);
  });

  it("freely chooses zero, a cost above available energy, and a public no-match value without paying X", () => {
    for (const cost of [0, 5, bounded.catalog.maximumFixedCost + 1]) {
      const result = runScenario(bounded, {
        board: { active: "player", phase: "day", player: { hand: [freeCostDiscover.id], energy: 1, deck: [v.vanilla0.id, v.vanilla5.id, v.event1.id] }, enemy: { deck } },
        steps: (ids) => [playFromHand(ids, "player")], answers: () => [cost],
      });
      expect(result.state.sides.player.currentEnergy).toBe(0);
      expect(result.state.sides.player.hand).toEqual(cost === 0 ? [result.ids.player.deck[0]] : cost === 5 ? [result.ids.player.deck[1]] : []);
      if (cost > bounded.catalog.maximumFixedCost) {
        expect(result.state.sides.player.deck).toEqual(result.ids.player.deck);
        expect(result.state.rng["random:discover"]).toBeUndefined();
        expect(result.state.rng["shuffle:player"]).toEqual(result.start.rng["shuffle:player"]);
      }
    }
  });

  it("replays both resolving choices after reload, rejects invalid/stale/foreign input, and commits Discover atomically", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(bounded, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(bounded.catalog, {
      active: "player", phase: "day", player: { hand: [freeCostDiscover.id], energy: 1, deck: [v.vanilla1.id, v.vanilla1.id] }, enemy: { deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waitingX = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const fresh = createFoldAdapter(bounded, { checkEventPrefix: true, log: (record) => records.push(record) });
    const saved = JSON.parse(JSON.stringify(waitingX)) as BattleSlice;
    const xPrompt = fresh.pending(saved)!.prompt;
    expect(xPrompt).toMatchObject({ kind: "chooseNumber", min: 0, max: bounded.catalog.maximumFixedCost + 1, cancellable: false, purpose: { role: "discoverCost" } });
    expect(xPrompt.id).toBe(fold.pending(waitingX)!.prompt.id);
    const answerX = { kind: "answer", side: "player", promptId: xPrompt.id, value: 1 } as const;
    expect(fresh.reduce(saved, { ...answerX, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [-1, bounded.catalog.maximumFixedCost + 2]) expect(fresh.reduce(saved, { ...answerX, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const waitingCard = applied(fresh.reduce(saved, answerX));
    expect(waitingCard.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(waitingCard.committed.sides.player.hand).toEqual([]);
    expect(waitingCard.committed.rng["random:discover"]).toBeUndefined();
    const savedCard = JSON.parse(JSON.stringify(waitingCard)) as BattleSlice;
    const prompt = fresh.pending(savedCard)!.prompt as ChooseCardsPrompt & { id: typeof xPrompt.id };
    expect(prompt.candidates).toEqual(expect.arrayContaining(ids.player.deck));
    expect(fresh.pending(savedCard)!.prompt.id).toBe(fold.pending(waitingCard)!.prompt.id);
    expect(fresh.reduce(savedCard, answerX)).toMatchObject({ kind: "bounced" });
    expect(fresh.reduce(savedCard, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    const answerCard = { kind: "answer", side: "player", promptId: prompt.id, value: [prompt.candidates[0]] } as const;
    const outcome = fresh.reduce(savedCard, answerCard);
    const done = applied(outcome);
    expect(done.committed.sides.player.hand).toEqual(answerCard.value);
    expect(done.committed.sides.player.currentEnergy).toBe(0);
    if (outcome.kind !== "applied") throw new Error("bounced");
    expect(outcome.published.filter((item) => item.kind === "cardDiscovered")).toHaveLength(1);
    expect(fresh.reduce(done, answerCard)).toMatchObject({ kind: "bounced" });
    expect(records.some((record) => record.event === "engine.promptAnswered")).toBe(true);
  });

  it("commits no discovery, shuffle, or draw, only the offer's knowledge, when resolution fails after both cost choices", () => {
    const fold = createFoldAdapter(bounded, { checkEventPrefix: true });
    const { state, ids } = boardState(bounded.catalog, { active: "player", phase: "day", player: { hand: [freeCostThenFail.id], energy: 1, deck: [v.vanilla1.id, v.vanilla1.id] }, enemy: { deck } });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waitingX = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const waitingCard = applied(fold.reduce(waitingX, { kind: "answer", side: "player", promptId: fold.pending(waitingX)!.prompt.id, value: 1 }));
    const prompt = fold.pending(waitingCard)!.prompt as ChooseCardsPrompt;
    const pending = fold.pending(waitingCard)!;
    const outcome = fold.reduce(waitingCard, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [prompt.candidates[0]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected a resolution failure");
    expect(outcome.published).toEqual([]);
    // Only the offer's private knowledge outlives the failure.
    expect(outcome.slice.committed).toEqual(knowing(waitingCard.committed, "player", prompt.candidates));
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.committed.sides.player.hand).toEqual([]);
  });

  it("pays an exact effective-spark sacrifice, allows the source, and draws exactly two", () => {
    const fold = createFoldAdapter(bounded);
    const { state, ids } = boardState(bounded.catalog, { active: "player", phase: "day", player: { back: [exactSparkSacrifice.id, v.vanilla0.id, v.vanilla1.id, v.vanilla2.id], energy: 2, deck }, enemy: { back: [v.vanilla1.id], deck } });
    state.instances[ids.player.back[1]!].status.gainedSpark = 1;
    state.instances[ids.player.back[2]!].status.gainedSpark = 1;
    state.instances[ids.player.back[3]!].status.gainedSpark = -1;
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waiting = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } }));
    const pending = fold.pending(waiting)!;
    expect((pending.prompt as ChooseCardsPrompt).candidates).toEqual([ids.player.back[0], ids.player.back[1], ids.player.back[3]]);
    const done = applied(fold.reduce(waiting, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.back[0]!] }));
    expect(done.committed.instances[ids.player.back[0]!].zone).toBe("void");
    expect(done.committed.sides.player.currentEnergy).toBe(0);
    expect(done.committed.sides.player.hand).toEqual(ids.player.deck.slice(0, 2));
  });

  it("maps contextual zero-X authored metadata while retaining the default minimum", () => {
    const content: CardDefinition = {
      id: "5e5e5e5e-0000-4000-8000-0000000003ba", name: "Synthetic", mtgName: "", renderedText: "",
      energyCost: null, cardType: "Event", subtype: "", rarity: "Common", isFast: false, isInterrupt: false,
      spark: null, tags: [], imageNumber: 0, artOwned: false, cardNumber: 1, isStarter: false, pending: true,
    };
    expect(engineCardFromContent(content).costs).toEqual([energyX(1)]);
    expect(engineCardFromContent({ ...content, xMinimum: 0 }).costs).toEqual([energyX(0)]);
  });
});

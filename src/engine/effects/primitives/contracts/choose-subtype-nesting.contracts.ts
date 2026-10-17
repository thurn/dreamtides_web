import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, anyCharacter, cardsMovedBy, costOf, energy, event, target } from "../../../dsl/builders";
import { whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineEvent } from "../../../events";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { resolveEffect } from "../../interpreter";
import { effectiveSpark } from "../../../rules/spark";
import { boardState, type BoardSetup } from "../../../testing/board";
import type { InstanceId, Side } from "../../../state/ids";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { ResolvingEffect } from "../../registry";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { drawMatching } from "../draw-matching";
import { chooseOne } from "../choose-one";
import { exhaust } from "../exhaust";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { delayed, floating } from "../floating-trigger";
import { sequence } from "../sequence";

const mage: EngineCardDefinition = { id: syntheticId(0x7820), cardType: "character", costs: [energy(3)], spark: 2,
  subtype: "Mage", speed: "standard", status: "vanilla", abilities: () => [] };
const warrior: EngineCardDefinition = { ...mage, id: syntheticId(0x7821), costs: [energy(4)], subtype: "Warrior" };
function fixture(effect: ResolvingEffect, side: Side, failAfter = false) {
  const spell: EngineCardDefinition = { id: syntheticId(0x7822), cardType: "event", costs: [energy(1)], spark: null,
    subtype: "", speed: "fast", status: "authored", abilities: () => [event(effect)],
    ...(failAfter ? { synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, effect, { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      throw new Error("synthetic failure after nested chosen installation");
    } } } satisfies Pick<EngineCardDefinition, "synthetic"> : {}),
  };
  const engine = createEngine(testCatalog([mage, warrior, spell]));
  const board = { active: side, phase: "day" as const, [side]: { hand: [spell.id, warrior.id], energy: 8,
    deck: [mage.id, warrior.id, mage.id, warrior.id] } };
  return { engine, board, mode: (type: "Mage" | "Warrior") => engine.catalog.characterTypes.indexOf(type) };
}

function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}
function interactive(effect: ResolvingEffect, side: Side, failAfter = false) {
  const { engine, mode } = fixture(effect, side, failAfter);
  const setup: BoardSetup = { active: side, phase: "day", [side]: { hand: [syntheticId(0x7822), warrior.id, mage.id],
    back: [mage.id, mage.id, warrior.id, warrior.id], energy: 12, deck: [mage.id, warrior.id, mage.id, warrior.id, mage.id, warrior.id] } };
  const { state, ids } = boardState(engine.catalog, setup);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  let fold = createFoldAdapter(engine, { checkEventPrefix: true });
  let current = start;
  const intents: BattleIntent[] = [];
  const publications: EngineEvent[] = [];
  const reduce = (intent: BattleIntent) => {
    const result = fold.reduce(current, intent);
    current = applied(result);
    intents.push(intent);
    if (result.kind === "applied") publications.push(...result.published);
  };
  return { engine, ids, state, start, intents, publications, mode, reduce,
    get current() { return current; }, get fold() { return fold; },
    play: (index: number) => reduce({ kind: "battleAction", side, action: playFromHand(ids, side, index).action }),
    answer: (value: number | readonly InstanceId[]) => reduce({ kind: "answer", side, promptId: fold.pending(current)!.prompt.id, value }),
    reload() {
      const pending = fold.pending(current);
      const parsed = parseJourneyBattleFoldState({ mode: { kind: "journey" },
        init: { battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
          enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [] },
        engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(current)) as unknown },
      });
      if (parsed === null) throw new Error("invalid nested saved battle");
      current = parsed.engine.slice;
      fold = createFoldAdapter(engine, { checkEventPrefix: true });
      expect(fold.pending(current)).toEqual(pending);
    },
    replay() {
      const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
      let replay = start;
      const events: EngineEvent[] = [];
      for (const intent of intents) {
        const result = fresh.reduce(replay, intent);
        replay = applied(result);
        if (result.kind === "applied") events.push(...result.published);
      }
      expect(replay).toEqual(current);
      expect(events).toEqual(publications);
      expect(invariantViolations(current.committed, engine.catalog)).toEqual([]);
    },
  };
}

describe("chosen subtype nesting", () => {
  for (const side of ["player", "enemy"] as const) {
    it(`binds the inner type and retains the outer sibling for ${side}`, () => {
      const effect = chooseSubtype({ then: sequence(
        chooseSubtype({ then: drawMatching({ subtype: CHOSEN_SUBTYPE }) }), drawMatching({ subtype: CHOSEN_SUBTYPE })) });
      const { engine, board, mode } = fixture(effect, side);
      const snapshot = JSON.stringify(effect);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [mode("Mage"), mode("Warrior")] });
      expect(result.state.sides[side].hand).toEqual([result.ids[side].hand[1], result.ids[side].deck[1], result.ids[side].deck[0]]);
      expect(result.events.filter(event => event.kind === "subtypeChosen").map(event => event.subtype)).toEqual(["Mage", "Warrior"]);
      expect(JSON.stringify(effect)).toBe(snapshot);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    });

    it(`binds a new inner choice in a later callback and retains its outer sibling for ${side}`, () => {
      const effect = chooseSubtype({ then: delayed(whenYouPlay({ cardType: "character" }), sequence(
        chooseSubtype({ then: drawMatching({ subtype: CHOSEN_SUBTYPE }) }), drawMatching({ subtype: CHOSEN_SUBTYPE }))) });
      const { engine, board, mode } = fixture(effect, side);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side), playFromHand(ids, side, 1)],
        answers: () => [mode("Mage"), mode("Warrior")] });
      expect(result.state.sides[side].hand).toEqual([result.ids[side].deck[1], result.ids[side].deck[0]]);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    });

    it(`isolates nested sibling branches and positive and negative predicates for ${side}`, () => {
      const positive = () => all(anyCharacter({ subtype: CHOSEN_SUBTYPE }));
      const effect = chooseSubtype({ then: sequence(gainSpark(positive(), 1),
        ifThen({ cond: "cardsIn", player: "you", zone: "hand", atLeast: 0 }, chooseSubtype({ then: sequence(
          exhaust(all(anyCharacter({ notSubtype: CHOSEN_SUBTYPE }))), gainSpark(positive(), 2)) })),
        chooseSubtype({ then: gainSpark(positive(), 3) }), gainSpark(positive(), 4)) });
      const run = interactive(effect, side);
      run.play(0);
      for (const type of ["Mage", "Warrior", "Mage"] as const) run.answer(run.mode(type));
      expect(run.ids[side].back.map(id => effectiveSpark(run.current.committed, run.engine.catalog, id!))).toEqual([10, 10, 4, 4]);
      expect(run.ids[side].back.map(id => run.current.committed.instances[id!].status.exhausted)).toEqual([true, true, false, false]);
      run.replay();
    });

    it(`retains canonical moved captures across different inner types for ${side}`, () => {
      const draw = drawMatching({ subtype: CHOSEN_SUBTYPE });
      const effect = chooseSubtype({ then: sequence(draw, gainPoints(costOf(cardsMovedBy(draw))),
        chooseSubtype({ then: sequence(draw, gainPoints(costOf(cardsMovedBy(draw)))) }),
        gainPoints(costOf(cardsMovedBy(draw))), drawMatching({ subtype: CHOSEN_SUBTYPE })) });
      Object.freeze(draw.filter);
      Object.freeze(draw);
      const snapshot = JSON.stringify(effect);
      const run = interactive(effect, side);
      run.play(0);
      run.answer(run.mode("Mage"));
      run.reload();
      run.answer(run.mode("Warrior"));
      expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].hand[1], run.ids[side].hand[2], run.ids[side].deck[0], run.ids[side].deck[1], run.ids[side].deck[2]]);
      expect(run.current.committed.sides[side].score).toBe(11);
      expect(JSON.stringify(effect)).toBe(snapshot);
      run.replay();
    });

    for (const shared of [false, true]) {
      it(`retains ${shared ? "shared" : "distinct equal-looking"} targets across lexical boundaries for ${side}`, () => {
        const first = target(anyCharacter({ anyOf: [{ subtype: CHOSEN_SUBTYPE }, { subtype: "Mage" }, { subtype: "Warrior" }] }));
        const second = shared ? first : target({ ...first.selector });
        const effect = chooseSubtype({ then: sequence(gainSpark(first, 1),
          chooseSubtype({ then: gainSpark(second, 2) }), gainSpark(first, 4)) });
        Object.freeze(first.selector);
        Object.freeze(first);
        const run = interactive(effect, side);
        run.play(0);
        run.answer(run.mode("Mage"));
        run.answer([run.ids[side].back[0]!]);
        run.answer(run.mode("Warrior"));
        if (!shared) run.answer([run.ids[side].back[2]!]);
        expect(effectiveSpark(run.current.committed, run.engine.catalog, run.ids[side].back[0]!)).toBe(shared ? 9 : 7);
        expect(effectiveSpark(run.current.committed, run.engine.catalog, run.ids[side].back[2]!)).toBe(shared ? 2 : 4);
        run.replay();
      });
    }

    it(`retains an enclosing zero mode through two nested substitutions for ${side}`, () => {
      const modal = chooseOne(drawMatching({ subtype: CHOSEN_SUBTYPE }), gainPoints(20));
      const effect = chooseSubtype({ then: sequence(modal, chooseSubtype({ then: modal })) });
      const run = interactive(effect, side);
      run.play(0);
      run.answer(run.mode("Mage"));
      run.answer(0);
      run.reload();
      run.answer(run.mode("Warrior"));
      expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].hand[1], run.ids[side].hand[2], run.ids[side].deck[0], run.ids[side].deck[1]]);
      expect(run.current.committed.sides[side].score).toBe(0);
      run.replay();
    });


    it(`keeps the installation's public draw proof after a different inner choice for ${side}`, () => {
      const effect = chooseSubtype({ then: delayed(whenYouPlay({ cardType: "character" }), sequence(
        chooseSubtype({ then: gainPoints(1) }), drawMatching({ subtype: CHOSEN_SUBTYPE }))) });
      const run = interactive(effect, side);
      run.state.knownTo = { player: [run.ids[side].deck[2]], enemy: [run.ids[side].deck[2]] };
      const initial = JSON.stringify(run.state);
      run.play(0);
      run.answer(run.mode("Mage"));
      run.reload();
      run.play(1);
      run.answer(run.mode("Warrior"));
      expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].hand[2], run.ids[side].deck[0]]);
      for (const viewer of ["player", "enemy"] as const) expect(run.engine.view(run.current.committed, viewer).sides[side].deck.known)
        .toEqual([{ id: run.ids[side].deck[2], index: 1 }]);
      expect(JSON.stringify(run.state)).toBe(initial);
      run.replay();
    });

    it(`rolls back nested captured draws and a partial callback installation after an error for ${side}`, () => {
      const effect = chooseSubtype({ then: sequence(drawMatching({ subtype: CHOSEN_SUBTYPE }),
        delayed(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), gainPoints(1)),
        chooseSubtype({ then: sequence(drawMatching({ subtype: CHOSEN_SUBTYPE }),
          delayed(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), gainPoints(2))) })) });
      const run = interactive(effect, side, true);
      run.play(0);
      run.answer(run.mode("Mage"));
      expect(run.fold.pending(run.current)!.display.floating).toHaveLength(1);
      expect(run.current.committed.floating).toEqual([]);
      run.reload();
      const answer = { kind: "answer" as const, side, promptId: run.fold.pending(run.current)!.prompt.id, value: run.mode("Warrior") };
      const failed = run.fold.reduce(run.current, answer);
      const fresh = createFoldAdapter(run.engine, { checkEventPrefix: true });
      expect(fresh.reduce(JSON.parse(JSON.stringify(run.current)) as BattleSlice, answer)).toEqual(failed);
      if (failed.kind !== "applied") throw new Error("expected nested rollback");
      expect(failed.error).not.toBeNull();
      expect(failed.published).toEqual([]);
      expect(failed.slice.inFlight).toBeNull();
      expect(failed.slice.committed.sides).toEqual(run.current.committed.sides);
      expect(failed.slice.committed.instances).toEqual(run.current.committed.instances);
      expect(failed.slice.committed.floating).toEqual([]);
    });

    it(`keeps a shared installation node canonical across different lexical choices for ${side}`, () => {
      const instruction = delayed(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), drawMatching({ subtype: CHOSEN_SUBTYPE }));
      const effect = chooseSubtype({ then: sequence(instruction, chooseSubtype({ then: instruction }), instruction) });
      const snapshot = JSON.stringify(effect);
      const run = interactive(effect, side);
      run.play(0);
      run.answer(run.mode("Mage"));
      run.answer(run.mode("Warrior"));
      const records = run.current.committed.floating.map(item => item.change);
      expect(records).toMatchObject(["Mage", "Warrior", "Mage"].map(chosenSubtype => ({ ref: { chosenSubtype } })));
      const indices = records.map(change => change.kind === "trigger" ? change.ref.node : -1);
      expect(new Set(indices).size).toBe(1);
      run.reload();
      run.play(1);
      expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].hand[2], run.ids[side].deck[1]]);
      run.reload();
      run.play(2);
      expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].deck[1], run.ids[side].deck[0], run.ids[side].deck[2]]);
      expect(run.current.committed.floating).toEqual([]);
      expect(JSON.stringify(effect)).toBe(snapshot);
      run.replay();
    });

    for (const once of [false, true]) {
      it(`retains ${once ? "delayed" : "floating"} installation scope through an inner choice, later installation and reload for ${side}`, () => {
        const future = sequence(drawMatching({ subtype: CHOSEN_SUBTYPE }), chooseSubtype({ then: sequence(
          drawMatching({ subtype: CHOSEN_SUBTYPE }), delayed(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), drawMatching({ subtype: CHOSEN_SUBTYPE }))) }),
        drawMatching({ subtype: CHOSEN_SUBTYPE }));
        const callback = once ? delayed(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), future) : floating(whenYouPlay({ subtype: CHOSEN_SUBTYPE }), future, "permanent");
        const effect = chooseSubtype({ then: chooseSubtype({ then: callback }) });
        const snapshot = JSON.stringify(effect);
        const run = interactive(effect, side);
        run.play(0);
        run.answer(run.mode("Mage"));
        run.answer(run.mode("Warrior"));
        expect(run.current.committed.floating[0].change).toMatchObject({ ref: { chosenSubtype: "Warrior" } });
        run.reload();
        run.play(1);
        const prompt = run.fold.pending(run.current)!.prompt;
        run.reload();
        const answer = { kind: "answer" as const, side, promptId: prompt.id, value: run.mode("Mage") };
        expect(run.fold.reduce(run.current, { ...answer, side: side === "player" ? "enemy" : "player" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
        expect(run.fold.reduce(run.current, { ...answer, value: -1 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
        expect(run.fold.reduce({ ...run.current, attempt: run.current.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
        expect(run.fold.reduce(run.current, { kind: "cancel", side, promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
        expect(run.fold.reduce(run.current, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
        run.reduce(answer);
        expect(run.fold.reduce(run.current, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
        expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].hand[2], run.ids[side].deck[1], run.ids[side].deck[0], run.ids[side].deck[3]]);
        const installed = run.current.committed.floating.filter(item => item.change.kind === "trigger").map(item => item.change);
        expect(installed).toHaveLength(once ? 1 : 2);
        expect(installed[installed.length - 1]).toMatchObject({ ref: { chosenSubtype: "Mage" } });
        run.reload();
        run.play(2);
        expect(run.current.committed.sides[side].hand).toEqual([run.ids[side].deck[1], run.ids[side].deck[0], run.ids[side].deck[3], run.ids[side].deck[2]]);
        expect(JSON.stringify(effect)).toBe(snapshot);
        run.replay();
      });
    }
  }
});

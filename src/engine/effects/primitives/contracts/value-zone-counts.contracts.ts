/**
 * Counts of cards in a zone (`countCards(zone, filter, player)`, the
 * valueZoneCounts DSL form) as a value and as a ✦ bound, in resolving
 * effects and in static abilities, on synthetic cards.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, characterYouControl, countCards, enemyCharacter, event, everyIn, self, staticAbility, target } from "../../../dsl/builders";
import { BASE_VARIANT, NO_DECK_MODS } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { copiableCostOf } from "../../../continuous/characteristics";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { ChooseTargetsPrompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { labBoard } from "../../../testing/lab-solver";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

const card = (index: number, cardType: "event" | "character", abilities: EngineCardDefinition["abilities"], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition =>
  cardType === "event"
    ? { id: syntheticId(index), cardType, costs: [], spark: null, subtype: "", speed, status: "authored", abilities }
    : { ...v.vanilla1, id: syntheticId(index), speed, status: "authored", abilities };

/** "Dissolve an enemy with ✦ less than or equal to the number of cards in your void." */
const weigh = card(1500, "event", () => [event(dissolve(target(enemyCharacter({ sparkAtMost: countCards("void") }))))], "interrupt");
/** Gains one ⍟ per card each count names: your void, your ≤2● cost characters there, the opponent's void, both hands, and your deck. */
const pointsPer = (index: number, value: Parameters<typeof gainPoints>[0]) => card(index, "event", () => [event(gainPoints(value))]);
const yourVoid = pointsPer(1501, countCards("void"));
const cheapCharacters = pointsPer(1502, countCards("void", { cardType: "character", costAtMost: 2 }));
const theirVoid = pointsPer(1503, countCards("void", {}, "opponent"));
const yourHand = pointsPer(1504, countCards("hand"));
const theirHand = pointsPer(1505, countCards("hand", undefined, "opponent"));
const yourDeck = pointsPer(1506, countCards("deck"));
/** Interrupt responses: banish every card in the opponent's void; your characters gain +1✦. */
const emptyTheirVoid = card(1507, "event", () => [event(banishCards([everyIn("void", {}, { player: "opponent" })]))], "interrupt");
const pumpYours = card(1508, "event", () => [event(gainSpark(all(characterYouControl()), 1))], "interrupt");
/** "This character has +1✦ for each character in your void." */
const walker = card(1509, "character", () => [staticAbility(sparkModifier(self(), countCards("void", { cardType: "character" })))]);
/** "This character has +1✦ for each card in your void." */
const hoarder = card(1510, "character", () => [staticAbility(sparkModifier(self(), countCards("void")))]);
/** "Characters you control with ✦ less than or equal to the number of cards in your void have +1✦." */
const lowAnthem = card(1511, "character", () => [staticAbility(sparkModifier(all(characterYouControl({ sparkAtMost: countCards("void") })), 1))]);
/** Counts the void and dissolves every enemy the count bounds, then throws: a step that fails after both writes. */
const weighThenFail: EngineCardDefinition = {
  ...card(1512, "event", () => []),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, sequence(gainPoints(countCards("void")), dissolve(all(enemyCharacter({ sparkAtMost: countCards("void") })))), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its dissolve");
    },
  },
};

/** "Dissolve an enemy with cost less than or equal to the number of cards in your void." */
const weighCost = card(1513, "event", () => [event(dissolve(target(enemyCharacter({ costAtMost: countCards("void") }))))], "interrupt");
/** "Dissolve an enemy with cost greater than or equal to the number of cards in your void." */
const weighCostAbove = card(1514, "event", () => [event(dissolve(target(enemyCharacter({ costAtLeast: countCards("void") }))))], "interrupt");
/** Characters whose cost differs from their ✦: a 1● 4✦ one and a 3● 1✦ one. */
const cheapStrong: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(1515), spark: 4 };
const costlyWeak: EngineCardDefinition = { ...v.vanilla3, id: syntheticId(1516), spark: 1 };

const engine = createEngine(testCatalog([
  weigh, yourVoid, cheapCharacters, theirVoid, yourHand, theirHand, yourDeck, emptyTheirVoid, pumpYours, walker, hoarder, lowAnthem, weighThenFail,
  weighCost, weighCostAbove, cheapStrong, costlyWeak,
]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
const other = (side: Side): Side => (side === "player" ? "enemy" : "player");
const board = (active: Side, mine: SideSetup, theirs: SideSetup = {}) =>
  boardState(engine.catalog, { active, phase: "day", [active]: { deck, energy: 5, ...mine }, [other(active)]: { deck, ...theirs } });
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
  return outcome.slice;
};
/** The candidates of the target prompt a play raises; the play stops there. */
function offered(state: BattleState, side: Side, card: InstanceId): readonly InstanceId[] {
  const asked: ChooseTargetsPrompt[] = [];
  const stop = new Error("stop after the offer");
  try {
    engine.apply(state, side, { kind: "play", card, from: "hand" }, {
      answer(prompt) {
        if (prompt.kind !== "chooseTargets") throw new Error(`Unexpected ${prompt.kind}`);
        asked.push(prompt);
        throw stop;
      },
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (asked[0] === undefined) throw new Error("the play offered no targets");
  return asked[0].candidates;
}
const playable = (state: BattleState, side: Side, card: InstanceId): boolean =>
  engine.legalActions(state, side).some((action) => action.kind === "play" && action.card === card);

describe("countCards as a value", () => {
  it("counts the controller's or the opponent's zone for either controller, filtering void cards by effective type and copiable cost", () => {
    for (const side of ["player", "enemy"] as const) {
      const points = (source: EngineCardDefinition, setup: (ids: ReturnType<typeof board>["ids"], state: BattleState) => void = () => undefined) => {
        const { state, ids } = board(side,
          { hand: [source.id, v.event0.id, v.event0.id], void: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.event0.id, v.vanilla0.id] },
          { hand: [v.vanilla1.id], void: [v.event1.id, v.vanilla5.id] });
        setup(ids, state);
        const after = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
        const resolved = passUntil(engine, after.state, (next) => next.stack.length === 0);
        expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
        return resolved.state.sides[side].score;
      };
      expect(points(yourVoid)).toBe(5);
      // The 1●, 2●, and 0● characters; never the 3● character or the event.
      expect(points(cheapCharacters)).toBe(3);
      // A void character whose copiable type became an event no longer matches; a 3● event typed as a character does not either.
      expect(points(cheapCharacters, (ids, state) => {
        const changed = ids[side].void[0];
        state.instances[changed] = { ...instanceOf(state, changed), variant: { ...BASE_VARIANT, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } } };
      })).toBe(2);
      expect(points(theirVoid)).toBe(2);
      // The played card has left the hand for the stack.
      expect(points(yourHand)).toBe(2);
      expect(points(theirHand)).toBe(1);
      expect(points(yourDeck)).toBe(deck.length);
    }
  });

  it("takes a filter only for a void, so a hidden hand or deck yields only its public size", () => {
    expect(countCards("void")).toEqual({ value: "countCards", zone: "void", player: "you", filter: {} });
    expect(countCards("hand", undefined, "opponent")).toEqual({ value: "countCards", zone: "hand", player: "opponent" });
    expect(() => countCards("deck", { cardType: "event" } as never)).toThrow();
  });
});

describe("countCards as a ✦ bound", () => {
  it("offers only enemies whose effective ✦ is at most the controller's void count, for either controller", () => {
    for (const side of ["player", "enemy"] as const) {
      // The 3✦ enemy's gained ✦ decides whether it is within the count of 2; the 1✦ enemy lost 2✦, clamped to 0✦.
      for (const [gained, within] of [[-1, true], [0, false]] as const) {
        const { state, ids } = board(side,
          { hand: [weigh.id], void: [v.event0.id, v.event1.id], back: [v.vanilla0.id] },
          { back: [v.vanilla0.id, v.vanilla2.id, v.vanilla3.id, v.vanilla1.id], void: [v.event0.id, v.event0.id, v.event0.id, v.event0.id] });
        const theirs = ids[other(side)].back as InstanceId[];
        state.instances[theirs[3]].status.gainedSpark = -2;
        state.instances[theirs[2]].status.gainedSpark = gained;
        const expected = within ? [theirs[0], theirs[1], theirs[2], theirs[3]] : [theirs[0], theirs[1], theirs[3]];
        expect([...offered(state, side, ids[side].hand[0])].sort()).toEqual(expected.sort());
      }
    }
  });

  it("does not count the card itself, which is on the stack, and is unplayable while no enemy is within the count", () => {
    const { state, ids } = board("player", { hand: [weigh.id], void: [] }, { back: [v.vanilla1.id] });
    expect(playable(state, "player", ids.player.hand[0])).toBe(false);
    const one = board("player", { hand: [weigh.id], void: [v.event0.id] }, { back: [v.vanilla1.id, v.vanilla2.id] });
    expect(playable(one.state, "player", one.ids.player.hand[0])).toBe(true);
    const result = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [weigh.id], void: [v.event0.id], deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } },
      // The 1✦ enemy is the only target within the count, so the target choice is automatic.
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(result.state.instances[result.ids.enemy.back[0]!]?.zone).toBe("void");
    expect(result.state.instances[result.ids.enemy.back[1]!]?.zone).toBe("play");
    expect([...result.state.sides.player.void].sort()).toEqual([result.ids.player.void[0], result.ids.player.hand[0]].sort());
  });

  it("rechecks the count as the effect resolves: a response that empties the void or raises the target's ✦ leaves no legal target", () => {
    for (const response of [emptyTheirVoid, pumpYours]) {
      const { state, ids } = board("player", { hand: [weigh.id], void: [v.event0.id, v.event1.id] }, { hand: [response.id], energy: 1, back: [v.vanilla2.id] });
      const enemy = ids.enemy.back[0]!;
      const played = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, { answer: () => [enemy] });
      const responded = engine.apply(played.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
      const resolved = passUntil(engine, responded.state, (next) => next.stack.length === 0);
      expect([...responded.events, ...resolved.events]).toContainEqual({ kind: "noLegalTarget", source: ids.player.hand[0] });
      expect(resolved.state.instances[enemy]?.zone).toBe("play");
      expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
    }
  });

  it("dissolves a target whose ✦ a response raised while it stays within the count", () => {
    const { state, ids } = board("player", { hand: [weigh.id], void: [v.event0.id, v.event1.id, v.event0.id] }, { hand: [pumpYours.id], energy: 1, back: [v.vanilla2.id] });
    const enemy = ids.enemy.back[0]!;
    const played = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, { answer: () => [enemy] });
    const responded = engine.apply(played.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    const resolved = passUntil(engine, responded.state, (next) => next.stack.length === 0);
    expect(resolved.state.instances[enemy]?.zone).toBe("void");
  });

  it("keeps its offer across a reload mid-prompt and rejects stale, uncounted, and foreign answers", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = board("player", { hand: [weigh.id], void: [v.event0.id] }, { back: [v.vanilla1.id, v.vanilla2.id, v.vanilla0.id] });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waiting = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const saved = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = fresh.pending(saved)!;
    const prompt = pending.prompt as ChooseTargetsPrompt;
    expect(pending.prompt.id).toBe(fold.pending(waiting)!.prompt.id);
    expect([...prompt.candidates].sort()).toEqual([ids.enemy.back[0], ids.enemy.back[2]].sort());
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.back[0]!] } as const;
    expect(fresh.reduce(saved, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    // The 2✦ enemy exceeds the count of one card.
    expect(fresh.reduce(saved, { ...answer, value: [ids.enemy.back[1]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const done = applied(fresh.reduce(saved, answer));
    expect(fresh.reduce(done, answer)).toMatchObject({ kind: "bounced" });
    const resolved = passUntil(engine, done.committed, (next) => next.stack.length === 0);
    expect(resolved.state.instances[ids.enemy.back[0]!]?.zone).toBe("void");
  });

  it("commits nothing when the step fails after counting and dissolving", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = board("player", { hand: [weighThenFail.id], void: [v.event0.id] }, { back: [v.vanilla1.id] });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected a resolution failure");
    expect(outcome.error.message).toMatch(/after its dissolve/);
    // The play committed; the failing resolution's ⍟ gain and dissolve did not.
    expect(outcome.published.map((event) => event.kind)).not.toContain("dissolved");
    expect(outcome.slice.committed.instances[ids.enemy.back[0]!]?.zone).toBe("play");
    expect(outcome.slice.committed.sides.player.score).toBe(0);
    expect(outcome.slice.committed.sides.player.void).toEqual(ids.player.void);
    expect(invariantViolations(outcome.slice.committed, engine.catalog)).toEqual([]);
  });

  it("the lab solver stages an enemy with ✦ and as many void cards, so the card is playable", () => {
    for (const side of ["player", "enemy"] as const) {
      const { state } = labBoard(engine, weigh.id, [], side);
      const enemy = state.sides[other(side)].backRank.find((id) => id !== null)!;
      const spark = effectiveSpark(state, engine.catalog, enemy);
      expect(spark).toBeGreaterThan(0);
      expect(state.sides[side].void).toHaveLength(spark);
    }
  });
});

describe("countCards as a cost bound", () => {
  it("offers enemies by copiable cost, not ✦, within an upper or lower bound by the count, for either controller", () => {
    for (const side of ["player", "enemy"] as const) {
      for (const [source, within] of [[weighCost, [0, 2]], [weighCostAbove, [1, 2]]] as const) {
        const { state, ids } = board(side,
          { hand: [source.id], void: [v.event0.id, v.event1.id] },
          { back: [cheapStrong.id, costlyWeak.id, v.vanilla2.id], void: [v.event0.id] });
        const theirs = ids[other(side)].back as InstanceId[];
        expect([...offered(state, side, ids[side].hand[0])].sort()).toEqual(within.map((index) => theirs[index]).sort());
      }
    }
  });

  it("rechecks the count as the effect resolves: emptying the void leaves no legal target, and raising the target's ✦ does not", () => {
    for (const [response, dissolved] of [[emptyTheirVoid, false], [pumpYours, true]] as const) {
      const { state, ids } = board("player", { hand: [weighCost.id], void: [v.event0.id] }, { hand: [response.id], energy: 1, back: [cheapStrong.id] });
      const enemy = ids.enemy.back[0]!;
      const played = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, { answer: () => [enemy] });
      const responded = engine.apply(played.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
      const resolved = passUntil(engine, responded.state, (next) => next.stack.length === 0);
      expect(resolved.state.instances[enemy]?.zone).toBe(dissolved ? "void" : "play");
      if (!dissolved) expect([...responded.events, ...resolved.events]).toContainEqual({ kind: "noLegalTarget", source: ids.player.hand[0] });
      expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
    }
  });

  it("the lab solver stages an enemy with a cost and as many void cards, so the card is playable", () => {
    for (const side of ["player", "enemy"] as const) {
      const { state } = labBoard(engine, weighCost.id, [], side);
      const enemy = state.sides[other(side)].backRank.find((id) => id !== null)!;
      const cost = copiableCostOf(state, engine.catalog, enemy);
      expect(cost).toBeGreaterThan(0);
      expect(state.sides[side].void).toHaveLength(cost);
    }
  });
});

describe("countCards in static abilities", () => {
  it("is read live through the layers, counting void cards by type for its controller only", () => {
    for (const side of ["player", "enemy"] as const) {
      const { state, ids } = board(side,
        { back: [walker.id, hoarder.id], hand: [v.event0.id], void: [v.vanilla1.id, v.event0.id, v.vanilla3.id] },
        { void: [v.vanilla1.id, v.vanilla2.id] });
      const [walks, hoards] = [ids[side].back[0]!, ids[side].back[1]!];
      // Base 1✦ plus two characters, and plus all three cards.
      expect(effectiveSpark(state, engine.catalog, walks)).toBe(3);
      expect(effectiveSpark(state, engine.catalog, hoards)).toBe(4);
      const after = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
      const resolved = passUntil(engine, after.state, (next) => next.stack.length === 0).state;
      expect(effectiveSpark(resolved, engine.catalog, walks)).toBe(3);
      expect(effectiveSpark(resolved, engine.catalog, hoards)).toBe(5);
      expect(invariantViolations(resolved, engine.catalog)).toEqual([]);
    }
  });

  it("as a static selector's ✦ bound, reads the ✦ of the layers before its own", () => {
    const { state, ids } = board("player", { back: [lowAnthem.id, v.vanilla2.id, v.vanilla3.id], void: [v.event0.id, v.event0.id] });
    const [anthem, two, three] = ids.player.back as InstanceId[];
    // The anthem (1✦) and the 2✦ character are within the count of 2 before the bonus; the 3✦ one is not.
    expect(effectiveSpark(state, engine.catalog, anthem)).toBe(2);
    expect(effectiveSpark(state, engine.catalog, two)).toBe(3);
    expect(effectiveSpark(state, engine.catalog, three)).toBe(3);
    expect(invariantViolations(state, engine.catalog)).toEqual([]);
  });
});

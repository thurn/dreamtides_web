/** Synthetic public lab contracts: resolution, prompt progress, and staging failures. */
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { abandonCost, additionalCost, energyX, event, everyIn, fromVoid, x } from "../dsl/builders";
import { copiableCostOf } from "../continuous/characteristics";
import { materialize } from "../effects/primitives/materialize";
import type { CardCost, ZoneEverySpec } from "../dsl/types";
import { createCopyInHand } from "../effects/primitives/create-copy-in-hand";
import { LAB, PROMPT_LAB_DEFINITIONS } from "./prompt-lab";
import { parseCardSubtype } from "../../types/card-identity";
import { cardLabBattle } from "./card-lab";
import { runCardLabPreflight } from "./lab-preflight";
import { labBoard } from "./lab-solver";
import { STACK } from "./stack-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";

const definitions = PROMPT_LAB_DEFINITIONS;
const engine = createEngine(createCatalog(definitions.cards, [], definitions.emblems, definitions.figments));
const request = (card: EngineCardDefinition, side: "player" | "enemy" = "player") => ({ entry: { cardId: card.id }, variant: "base" as const, side });

describe("node card-lab preflight", () => {
  it("resolves synthetic lab cards through legal target, private-card, arrangement, and discard prompts on both sides", () => {
    for (const card of [LAB.drawTwoThenDiscard, LAB.discardChosen, LAB.putFromTop, LAB.abandon]) for (const side of ["player", "enemy"] as const) {
      const result = runCardLabPreflight(engine, request(card, side), definitions.cards);
      expect(result, `${card.id}/${side}`).toMatchObject({ uuid: card.id, side, verdict: "pass", reason: null, resolved: true, zone: "void" });
      expect(result.events).toContainEqual(expect.objectContaining({ kind: "resolved", instance: result.instance }));
    }
  });

  it("retains actual enemy fixture events when an unanswerable response window resolves during setup", () => {
    const immediateEvent: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(1953), synthetic: { play: (ctx) => { ctx.state.sides.player.currentEnergy = 0; return {}; } } };
    const immediate = createEngine(testCatalog([immediateEvent]));
    const result = runCardLabPreflight(immediate, request(immediateEvent, "enemy"), []);
    expect(result).toMatchObject({ verdict: "pass", resolved: true, zone: "void", passes: 0, answers: 0 });
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "resolved", instance: result.instance }));
  });

  it("reports an unsatisfied solver staging filter before any play or resolution", () => {
    const impossible: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(1950), status: "authored", abilities: () => [event(createCopyInHand(fromVoid({ subtype: parseCardSubtype("MissingFixtureSubtype") })))] };
    const failing = createEngine(testCatalog([impossible]));
    const result = runCardLabPreflight(failing, request(impossible), []);
    expect(result).toMatchObject({ verdict: "fail", reason: "fixtureFailed", instance: null, resolved: false, events: [] });
    const unplayable = runCardLabPreflight(engine, { ...request(LAB.drawTwoThenDiscard), stage: { player: { energy: 0 } } }, definitions.cards);
    expect(unplayable).toMatchObject({ verdict: "fail", reason: "unplayable", resolved: false, events: [] });
  });

  it("stages an 'each ≤X● cost' void materialization for the least X a play can choose, and a constant bound as printed", () => {
    const borrowing = (index: number, costs: readonly CardCost[], costAtLeast: number, costAtMost: ZoneEverySpec["costAtMost"]): EngineCardDefinition => ({
      ...SYNTHETIC.event0, id: syntheticId(index), status: "authored", costs,
      abilities: () => [event(materialize(everyIn("void", { cardType: "character", costAtLeast }, { costAtMost })))],
    });
    // A void character costing at least 2● that X = 2 admits, and one costing exactly 3●.
    const cases = [{ card: borrowing(1955, [energyX(2)], 2, x()), cost: 2 }, { card: borrowing(1956, SYNTHETIC.event0.costs, 3, 3), cost: 3 }];
    const staging = createEngine(testCatalog(cases.map(({ card }) => card)));
    for (const { card, cost } of cases) for (const side of ["player", "enemy"] as const) {
      const { state } = labBoard(staging, card.id, [], side);
      expect(state.sides[side].void.map((id) => copiableCostOf(state, staging.catalog, id)), `${card.id}/${side}`).toEqual([cost]);
      const result = runCardLabPreflight(staging, request(card, side), []);
      expect(result, `${card.id}/${side}`).toMatchObject({ verdict: "pass", resolved: true });
      expect(result.events.filter((entry) => entry.kind === "materialized")).toHaveLength(1);
    }
  });

  it("tracks the played physical source when an additional cost stages the same printing", () => {
    const subtype = parseCardSubtype("UniqueStagingSubtype");
    const card: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(1954), subtype, status: "authored", abilities: () => [additionalCost(abandonCost({ subtype }))] };
    const duplicate = createEngine(testCatalog([card]));
    for (const side of ["player", "enemy"] as const) {
      const result = runCardLabPreflight(duplicate, request(card, side), [card]);
      expect(result).toMatchObject({ verdict: "pass", resolved: true, zone: "play" });
      expect(result.events).toContainEqual(expect.objectContaining({ kind: "cardPlayed", instance: result.instance }));
      const abandoned = result.events.find((event) => event.kind === "abandoned");
      expect(abandoned?.kind === "abandoned" ? abandoned.instance : null).not.toBe(result.instance);
    }
  });

  it("reports a thrown resolution and preserves source-scoped evidence instead of accepting an empty stack", () => {
    const fault: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(1951), synthetic: { resolve: () => { throw new Error("synthetic resolution fault"); } } };
    const failing = createEngine(testCatalog([fault]));
    const result = runCardLabPreflight(failing, request(fault), []);
    expect(result).toMatchObject({ verdict: "fail", reason: "engineError", resolved: false });
    expect(result.instance).not.toBeNull();
  });

  it("plays a stack-target card in answer to the opponent's staged opener, staging its unless-abandon character, on both sides", () => {
    for (const side of ["player", "enemy"] as const) {
      const other = side === "player" ? "enemy" : "player";
      const { committed } = cardLabBattle(engine, request(STACK.preventUnlessAbandons, side), definitions.cards).slice;
      expect(committed.turn.active).toBe(other);
      expect(committed.stack.map((item) => item.controller)).toEqual(side === "player" ? [other] : [other, side]);
      expect(committed.sides[other].backRank.filter((id) => id !== null)).toHaveLength(1);
      // Either way the lab stops on the human's response window: with the card in hand, or holding a playable Interrupt.
      expect(engine.decision(committed)).toMatchObject({ kind: "respond", side: "player" });
      const result = runCardLabPreflight(engine, request(STACK.preventUnlessAbandons, side), definitions.cards);
      expect(result, side).toMatchObject({ verdict: "pass", resolved: true, zone: "void" });
      expect(result.events.filter((event) => event.kind === "abandoned" || event.kind === "prevented")).toHaveLength(1);
    }
  });

  it("distinguishes pending definitions and bounds multi-prompt progress", () => {
    const pending: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(1952), status: "pending" };
    expect(runCardLabPreflight(createEngine(testCatalog([pending])), request(pending), [])).toMatchObject({ verdict: "pending", resolved: true });
    const guarded = runCardLabPreflight(engine, request(LAB.putFromTop), definitions.cards, 1);
    expect(guarded).toMatchObject({ verdict: "fail", reason: "stalled" });
    expect(guarded.detail).toContain("Intent guard exhausted");
  });
});

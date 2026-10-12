/** Synthetic public lab contracts: resolution, prompt progress, and staging failures. */
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { abandonCost, additionalCost, energy, energyX, event, everyIn, fromVoid, x } from "../dsl/builders";
import { copiableCostOf } from "../continuous/characteristics";
import { materialize } from "../effects/primitives/materialize";
import type { CardCost, ZoneEverySpec } from "../dsl/types";
import { createCopyInHand } from "../effects/primitives/create-copy-in-hand";
import { grantReclaim } from "../effects/primitives/grant-reclaim";
import { firstLegalAnswer } from "../prompts/answers";
import type { ChooseNumberPrompt } from "../prompts/types";
import { hasKeyword } from "../rules/keywords";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { LAB, PROMPT_LAB_DEFINITIONS } from "./prompt-lab";
import { parseCardSubtype } from "../../types/card-identity";
import { cardLabBattle } from "./card-lab";
import { dreamwellLabEvidence, runCardLabPreflight, runDreamwellLabPreflight } from "./lab-preflight";
import { labBoard } from "./lab-solver";
import { STACK } from "./stack-cards";
import { SYNTHETIC, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "./synthetic-cards";
import { passUntil } from "./trigger-harness";

const definitions = PROMPT_LAB_DEFINITIONS;
const engine = createEngine(createCatalog(definitions.cards, [], definitions.emblems, definitions.figments));
const request = (card: EngineCardDefinition, side: "player" | "enemy" = "player") => ({ entry: { cardId: card.id }, variant: "base" as const, side });

describe("node Dreamwell lab preflight", () => {
  const labEngine = createEngine(testCatalog());
  const catalog = SYNTHETIC_DREAMWELL.map((card) => card.id);
  for (const side of ["player", "enemy"] as const) for (const definition of [SYNTHETIC_DREAMWELL[6], SYNTHETIC_DREAMWELL[8]]) {
    it(`reports the actual ${side} draw for energy ${definition.energyAdded}`, () => {
      const result = runDreamwellLabPreflight(labEngine, { cardId: definition.id, side }, catalog);
      expect(result).toMatchObject({ uuid: definition.id, side, entityKind: "dreamwell", variant: "base", verdict: definition.status === "pending" ? "pending" : "pass", reason: null, drawn: true, instance: null, zone: null, passes: 1, answers: 0 });
      expect(result.events.filter((event) => event.kind === "dreamwellDrawn")).toEqual([
        { kind: "dreamwellDrawn", side, card: definition.id, energyAdded: definition.energyAdded },
      ]);
      expect(dreamwellLabEvidence(result.events, { cardId: definition.id, side }, definition.energyAdded)).toBeNull();
    });
  }
  it("classifies an unavailable fixture and an invalid intent budget", () => {
    const source = { cardId: catalog[0], side: "player" as const };
    expect(runDreamwellLabPreflight(labEngine, source, catalog.slice(1))).toMatchObject({ verdict: "fail", reason: "fixtureFailed", events: [], drawn: false });
    expect(runDreamwellLabPreflight(labEngine, source, catalog, 0)).toMatchObject({ verdict: "fail", reason: "stalled", events: [], drawn: false });
    const stalled = { ...labEngine, decision: () => null };
    expect(runDreamwellLabPreflight(stalled, source, catalog)).toMatchObject({ verdict: "fail", reason: "missingDraw", events: [], drawn: false });
    const failed = { ...labEngine, decision: () => { throw new Error("synthetic engine failure"); } };
    expect(runDreamwellLabPreflight(failed, source, catalog)).toMatchObject({ verdict: "fail", reason: "engineError", events: [], drawn: false });
  });

  for (const side of ["player", "enemy"] as const) for (const energy of [0, 2]) {
    it(`validates ordered ${side} evidence across publications with catalog energy ${energy}`, () => {
      const source = { cardId: catalog[6], side };
      const other = side === "player" ? "enemy" : "player";
      const draw: EngineEvent = { kind: "dreamwellDrawn", side, card: source.cardId, energyAdded: energy };
      const refresh: EngineEvent = { kind: "energyChanged", side, cause: "refresh", current: 2 + energy, max: 2 + energy, change: energy, maxChange: energy };
      const day: EngineEvent = { kind: "phaseChanged", active: side, phase: "day" };
      const ended: EngineEvent = { kind: "battleEnded", result: { kind: "draw", reason: "turnLimit" } };
      // A draw publication can precede the answer batch containing refresh
      // and Day. Later phase evidence does not invalidate the observed Day.
      const publications: readonly (readonly EngineEvent[])[] = [[refresh, day], [draw], [refresh, day], [{ kind: "phaseChanged", active: side, phase: "dusk" }]];
      expect(dreamwellLabEvidence(publications.flat(), source, energy)).toBeNull();
      expect(dreamwellLabEvidence([draw, refresh, ended], source, energy)).toBeNull();
      for (const events of [[], [{ ...draw, card: catalog[7] }], [{ ...draw, side: other }]] as readonly EngineEvent[][]) {
        expect(dreamwellLabEvidence(events, source, energy)).toBe("missingDraw");
      }
      for (const events of [[day, draw, refresh], [draw, refresh, { ...day, active: other }], [ended, draw, refresh]] as readonly EngineEvent[][]) {
        expect(dreamwellLabEvidence(events, source, energy)).toBe("missingDay");
      }
      for (const events of [
        [refresh, draw, day], [draw, { ...refresh, side: other }, day],
        [draw, { ...refresh, cause: "payment" }, day], [draw, { ...refresh, maxChange: energy + 1 }, refresh, day],
        [{ ...draw, energyAdded: energy + 1 }, refresh, day],
      ] as readonly EngineEvent[][]) {
        expect(dreamwellLabEvidence(events, source, energy)).toBe("energyMismatch");
      }
    });
  }
});

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

  it("stages a void target bounded by X beside a constant lower bound at an X the play can choose, and plays an X that admits it", () => {
    /** "X●: Choose (up to) one ≥1● ≤X● cost event in your void to gain reclaim 0●", playable for X = 0. */
    const reclaiming = (index: number, upTo: boolean): EngineCardDefinition => ({
      ...SYNTHETIC.event0, id: syntheticId(index), status: "authored", costs: [energyX(0)],
      abilities: () => [event(grantReclaim(fromVoid({ cardType: "event", costAtLeast: 1 }, { costAtMost: x(), upTo }), { costs: [energy(0)] }))],
    });
    const required = reclaiming(1957, false);
    const optional = reclaiming(1958, true);
    const staging = createEngine(testCatalog([required, optional]));
    /** Plays the lab card at the X `chooseX` picks, choosing every offered target, and resolves it. */
    const playAt = (state: BattleState, side: Side, chooseX: (prompt: ChooseNumberPrompt) => number) => {
      const play = staging.legalActions(state, side).find((action) => action.kind === "play");
      if (play === undefined) throw new Error("no play");
      let chosen: number | null = null;
      let offered: readonly InstanceId[] = [];
      const played = staging.apply(state, side, play, {
        answer(prompt) {
          if (prompt.kind === "chooseNumber") return (chosen = chooseX(prompt));
          if (prompt.kind === "chooseTargets") return (offered = prompt.candidates);
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      return { x: chosen, offered, resolved: passUntil(staging, played.state, (next) => next.stack.length === 0).state };
    };
    for (const card of [required, optional]) for (const side of ["player", "enemy"] as const) {
      const { state } = labBoard(staging, card.id, [], side);
      expect(state.sides[side].void, `${card.id}/${side}`).toHaveLength(1);
      const [staged] = state.sides[side].void as [InstanceId];
      const cost = copiableCostOf(state, staging.catalog, staged);
      expect(cost).toBeGreaterThanOrEqual(1);
      expect(runCardLabPreflight(staging, request(card, side), []), `${card.id}/${side}`).toMatchObject({ verdict: "pass", resolved: true });
      // The lab answers the X prompt with its first legal answer: a required target leaves only the Xs that admit the staged card.
      const lab = playAt(state, side, (prompt) => firstLegalAnswer(prompt) as number);
      if (card === required) {
        // The single legal target is chosen without a prompt.
        expect(lab.x).toBeGreaterThanOrEqual(cost);
        expect(hasKeyword(lab.resolved, staging.catalog, staged, "reclaim")).toBe(true);
      } else {
        // An optional target leaves X = 0 legal, and the staged card is offered at an X up to the lab's energy.
        expect(lab.x).toBe(0);
        expect(playAt(state, side, (prompt) => prompt.max).offered).toEqual([staged]);
      }
      expect(hasKeyword(playAt(state, side, () => cost).resolved, staging.catalog, staged, "reclaim")).toBe(true);
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

/** Synthetic public lab contracts: resolution, prompt progress, and staging failures. */
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { abandonCost, additionalCost, event, fromVoid } from "../dsl/builders";
import { createCopyInHand } from "../effects/primitives/create-copy-in-hand";
import { LAB, PROMPT_LAB_DEFINITIONS } from "./prompt-lab";
import { parseCardSubtype } from "../../types/card-identity";
import { runCardLabPreflight } from "./lab-preflight";
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

  it("distinguishes pending definitions and bounds multi-prompt progress", () => {
    const pending: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(1952), status: "pending" };
    expect(runCardLabPreflight(createEngine(testCatalog([pending])), request(pending), [])).toMatchObject({ verdict: "pending", resolved: true });
    const guarded = runCardLabPreflight(engine, request(LAB.putFromTop), definitions.cards, 1);
    expect(guarded).toMatchObject({ verdict: "fail", reason: "stalled" });
    expect(guarded.detail).toContain("Intent guard exhausted");
  });
});

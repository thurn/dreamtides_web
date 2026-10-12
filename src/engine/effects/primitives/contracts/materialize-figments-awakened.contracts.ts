/** Figments with awakened enter ready; entry watchers observe that status. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { characterYouControl, event, keyword } from "../../../dsl/builders";
import { triggered, whenMaterialize } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { hasKeyword } from "../../../rules/keywords";
import { BACK_RANK_SIZE, parseFigmentId } from "../../../state/ids";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { runScenario } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";
import { materializeFigments } from "../materialize-figments";

const plain: EngineFigmentDefinition = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000017800"), subtype: "Warrior", spark: 1, status: "vanilla", abilities: () => [] };
const ready: EngineFigmentDefinition = { ...plain, id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000017801"), status: "authored", abilities: () => [keyword("awakened")] };
const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x17802), status: "authored", abilities: () => [
  triggered(whenMaterialize(characterYouControl({ figment: true, exhausted: true })), gainPoints(1)),
  triggered(whenMaterialize(characterYouControl({ figment: true, exhausted: false })), gainPoints(10)),
] };
const deck = [v.vanilla1.id, v.vanilla2.id];
function engine(awakened?: boolean, catalogReady = false, count = 1) {
  const effect = materializeFigments(catalogReady ? ready.id : plain.id, count, { awakened, spark: 2 });
  const spell: EngineCardDefinition = { ...v.event0, id: syntheticId(0x17803), status: "authored", abilities: () => [event(effect)] };
  const response: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x17804), status: "authored", abilities: () => [event(materializeFigments(plain.id, 2, { player: "opponent" }))] };
  return { engine: createEngine(testCatalog([spell, watcher, response], {}, [plain, ready])), spell, response };
}

describe("materialize figments with awakened", () => {
  describe.each(["player", "enemy"] as const)("%s", (side) => {
    it.each([false, true])("%s entry is observed with its actual readiness", (awakened) => {
      const fixture = engine(awakened);
      const result = runScenario(fixture.engine, { board: { active: side, phase: "day", [side]: { hand: [fixture.spell.id], front: [watcher.id], deck }, [side === "player" ? "enemy" : "player"]: { deck } },
        steps: ids => [{ side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } }] });
      const entered = result.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
      expect(entered).toHaveLength(1);
      expect(result.state.instances[entered[0]]).toMatchObject({ controller: side, zone: "play", status: { exhausted: !awakened }, printing: { kind: "figment", figment: plain.id, spark: 2 } });
      expect(result.state.sides[side].score).toBe(awakened ? 10 : 1);
      expect(hasKeyword(result.state, fixture.engine.catalog, entered[0], "awakened")).toBe(false);
      expect(result.events.filter(e => e.kind === "exhaustionChanged" || e.kind === "effectStarted")).toEqual([]);
    });

    it("preserves catalog Awakened with the default entry option", () => {
      const fixture = engine(undefined, true);
      const result = runScenario(fixture.engine, { board: { active: side, phase: "day", [side]: { hand: [fixture.spell.id], front: [watcher.id], deck } },
        steps: ids => [{ side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } }] });
      const entered = result.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
      expect(result.state.instances[entered[0]].status.exhausted).toBe(false);
      expect(hasKeyword(result.state, fixture.engine.catalog, entered[0], "awakened")).toBe(true);
      expect(result.state.sides[side].score).toBe(10);
    });

    it.each([false, true])("preserves existing figments at %s full capacity", (full) => {
      const fixture = engine(true, false, 5);
      const board = { active: side, phase: "day" as const, [side]: { hand: [fixture.spell.id], front: [watcher.id], deck,
        back: Array.from({ length: BACK_RANK_SIZE - 2 }, (_, index) => index === 0 ? null : v.vanilla1.id),
        figments: [{ slot: { rank: "back" as const, index: 0 }, printing: { kind: "figment" as const, figment: plain.id, spark: 7 } }],
      }, [side === "player" ? "enemy" : "player"]: { hand: [fixture.response.id], energy: 2, deck } };
      const start = boardState(fixture.engine.catalog, board);
      const existing = start.state.sides[side].backRank[0]!;
      // Isolated public steps exercise resolution capacity, independently of announcement legality.
      const played = runStep(start.state, { kind: "play", card: start.ids[side].hand[0], from: "hand" }, NO_PROMPTS, fixture.engine.catalog);
      if (played.kind !== "done") throw new Error("unexpected play prompt");
      let pending = played.state;
      if (full) {
        const other = side === "player" ? "enemy" : "player";
        const responding = runStep(pending, { kind: "play", card: start.ids[other].hand[0], from: "hand" }, NO_PROMPTS, fixture.engine.catalog);
        if (responding.kind !== "done") throw new Error("unexpected response prompt");
        const filled = runStep(responding.state, { kind: "resolveTop" }, NO_PROMPTS, fixture.engine.catalog);
        if (filled.kind !== "done") throw new Error("unexpected fill prompt");
        pending = filled.state;
        for (let index = 0; index < 2; index++) {
          const trigger = runStep(pending, { kind: "resolveTrigger" }, NO_PROMPTS, fixture.engine.catalog);
          if (trigger.kind !== "done") throw new Error("unexpected fill trigger prompt");
          pending = trigger.state;
        }
      }
      const result = runStep(pending, { kind: "resolveTop" }, NO_PROMPTS, fixture.engine.catalog);
      if (result.kind !== "done") throw new Error("unexpected resolution prompt");
      const entered = result.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
      expect(entered).toHaveLength(full ? 0 : 2);
      expect(result.state.instances[existing]).toEqual(start.state.instances[existing]);
      expect(result.events).toContainEqual({ kind: "capacityReached", side, instance: null, missing: full ? 5 : 3 });
      let settled = result.state;
      for (let index = 0; index < entered.length; index++) {
        const trigger = runStep(settled, { kind: "resolveTrigger" }, NO_PROMPTS, fixture.engine.catalog);
        if (trigger.kind !== "done") throw new Error("unexpected entry trigger prompt");
        settled = trigger.state;
      }
      expect(settled.sides[side].score).toBe(full ? 2 : 20);
      for (const id of entered) expect(result.state.instances[id]).toMatchObject({ status: { exhausted: false }, printing: { kind: "figment", figment: plain.id, spark: 5 } });
      expect(entered).toEqual(full ? [] : result.state.sides[side].backRank.slice(-2));
    });
  });
});

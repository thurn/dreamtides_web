import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";
/** Dreamsign routes own exact engine emblems, final init observations and display metadata. */
import { expect, it, vi } from "vitest";
import * as providers from "../session/providers/battle-init-provider";
import { createEngine } from "../engine/engine";
import { atStartOfFirstTurn, triggered } from "../engine/dsl/triggers";
import { gainPoints } from "../engine/effects/primitives/gain-points";
import { EngineProbeHistory } from "../battle/components/engine-probe-events";
import { parseDreamsignId, parseQaSceneId } from "../types/identifiers";
import { testEventActor } from "../types/test-identities";
import type { CommittedEvent } from "../eventlog/local-log";
import { initialFoldState } from "../rules/fold-state";
import { journeyBattleOf } from "../rules/battle/fold";
import { reduceGameEvent } from "../rules/reducer";
import { buildQaScene, buildQaSceneBattle } from "./qa-scenes";
import { battleSceneContent, SCENE_OPTIONS } from "./qa-scenes.fixtures";

const id = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000022800");
const contentOf = () => ({ ...battleSceneContent(), dreamsignTemplates: [{ id, name: "Synthetic", effectDescription: "Synthetic", rarity: "Common" as const, tideIds: [] }] });

for (const side of ["player", "enemy"] as const) it(`owns the final ${side} Dreamsign LOAD_STATE init and its real first-turn observation`, () => {
  const content = contentOf(); const factory = providers.createBattleInitProvider; const original = factory(content).engine;
  const definition = { id, status: "authored" as const, abilities: () => [triggered(atStartOfFirstTurn(), gainPoints(2))] };
  const engine = createEngine({ ...original.catalog, dreamsign: candidate => candidate === id ? definition : original.catalog.dreamsign(candidate) });
  const injected = vi.spyOn(providers, "createBattleInitProvider").mockImplementation(value => factory(value, engine));
  try {
    const scene = parseQaSceneId(`card-lab-dreamsign:${id}:base:${side}`); const journey = buildQaScene(scene, content, SCENE_OPTIONS);
    if (journey === null) throw new Error("Synthetic journey missing");
    const battle = buildQaSceneBattle(scene, content, journey);
    if (battle === null) throw new Error("Synthetic battle missing");
    const selected = battle.engine.slice.committed.sides[side]; const other = battle.engine.slice.committed.sides[side === "player" ? "enemy" : "player"];
    expect(selected.dreamsigns).toEqual([{ id }]); expect(other.dreamsigns).toEqual([]); expect(selected.avatar).toBeNull(); expect(other.avatar).toBeNull(); expect(selected.score).toBe(2);
    expect(battle.init.avatarSummary).toBeNull(); expect(battle.init.opponentAbilityActive).toBe(false);
    expect(journey.dreamsigns.map(sign => sign.id)).toEqual(side === "player" ? [id] : []);
    expect(battle.init.enemyDescriptor.dreamsigns.map(sign => sign.id)).toEqual(side === "enemy" ? [id] : []);
    const load: CommittedEvent = { seq: 7, event: { type: "LOAD_STATE", payload: { snapshot: journey, battle }, actor: testEventActor("dreamsign-init"), clientTimestamp: new Date(0).toISOString(), basedOnSeq: 6 } };
    const applied = reduceGameEvent(initialFoldState(journey.seed, TEST_CONTENT_CONFIG), load.event, { contentConfig: TEST_CONTENT_CONFIG, seq: 7, rng: () => 0, intervening: [], timestamp: new Date(0).toISOString() });
    expect(applied.outcome).toBe("applied"); const loaded = journeyBattleOf(applied.state.battle);
    if (loaded === null) throw new Error("Synthetic LOAD_STATE missing"); expect(loaded.init).toBe(battle.init);
    const history = new EngineProbeHistory(loaded.init, [load]);
    expect(history.events.find(({ event }) => event.kind === "triggerResolved")?.event).toMatchObject({ source: { kind: "dreamsign", side, index: 0 }, controller: side });
    expect(history.events.map(({ seq, index }) => [seq, index])).toEqual(history.events.map((_, index) => [7, index]));
    expect(new EngineProbeHistory({ ...loaded.init }, [load]).events).toEqual([]);
    const cloned = structuredClone(battle); expect(new EngineProbeHistory(cloned.init, [{ ...load, event: { ...load.event, payload: { snapshot: journey, battle: cloned } } }]).events).toEqual([]);
    expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ dreamsign: id, side, status: "ready", entityKind: "dreamsign" });
  } finally { injected.mockRestore(); }
});

it("rejects invalid Dreamsign domains, sides, variants, staging and ambiguity atomically", () => {
  const content = contentOf(); const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const [prefix, uuid, suffix, reason] of [
      ["card-lab-dreamsign", "malformed", "base:player", "unknownDreamsign"],
      ["card-lab-dreamsign", content.avatars[0].id, "base:player", "unknownDreamsign"],
      ["card-lab-dreamsign", id, "base:invalid", "unknownSide"],
      ["card-lab-dreamsign", id, "invalid:player", "unknownVariant"],
      ["card-lab-dreamsign", id, "amplified:player", "ineligibleVariant"],
      ["card-lab-dreamsign", id, "base:player:%7B%7D", "invalidStage"],
      ["card-lab-dreamsign-ambiguous", id, "base:player", "ambiguousRequest"],
    ]) {
      const scene = parseQaSceneId(`${prefix}:${uuid}:${suffix}`); const journey = buildQaScene(scene, content, SCENE_OPTIONS);
      if (journey === null) throw new Error("Synthetic fallback journey missing");
      expect(buildQaSceneBattle(scene, content, journey)?.engine.slice.history).toBeUndefined();
      expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "rejected", reason });
    }
  } finally { errors.mockRestore(); }
});

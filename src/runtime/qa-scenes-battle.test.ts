// Battle QA scenes: battle-loading, prompt-lab, and card-lab scenes load an
// engine battle that BEGIN_BATTLE and LOAD_STATE agree on, and the layer
// battle scenes park on their Battle start screens.

import { describe, expect, it, vi } from "vitest";
import { parseQaSceneId } from "../types/identifiers";
import { layerOrdinal } from "../types/layer-name";
import {
  QA_SCENES,
  buildQaScene,
  buildQaSceneBattle,
  qaSceneLoadsBattle,
} from "./qa-scenes";
import { createBattleInitProvider } from "../session/providers/battle-init-provider";
import {
  beginBattle,
  registerBattleInitProvider,
} from "../rules/battle/journey-battle";
import { initialFoldState, type FoldState } from "../rules/fold-state";
import { reduceGameEvent } from "../rules/reducer";
import { validateLoadedState } from "../rules/journey/lifecycle";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";
import { testCardId, testEventActor } from "../types/test-identities";
import { journeyBattleOf } from "../rules/battle/fold";
import { SYNTHETIC } from "../engine/testing/synthetic-cards";
import { aiDecision } from "../engine/policy/decide";
import {
  activeSiteOf,
  battleSceneContent,
  makeJourneyContent,
  SCENE_OPTIONS,
} from "./qa-scenes.fixtures";

describe("the battle layer QA scenes", () => {
  it("loads a forced Dreamwell UUID for either side and validates requests before publishing it", () => {
    const content = battleSceneContent();
    const card = content.dreamwellCards[0];
    const report = () => (globalThis as { __cardLab?: unknown }).__cardLab;
    const labOf = (token: string) => {
      const id = parseQaSceneId(token);
      const journey = buildQaScene(id, content, SCENE_OPTIONS);
      if (journey === null) throw new Error("scene did not build");
      return { journey, battle: buildQaSceneBattle(id, content, journey) };
    };
    for (const side of ["player", "enemy"] as const) {
      const { journey, battle } = labOf(`card-lab:${card.id}:base:${side}`);
      expect(report()).toMatchObject({ status: "ready", entityKind: "dreamwell", cardStatus: "pending", eligibleVariants: ["base"] });
      expect(battle?.engine?.init.dreamwell).toEqual(content.dreamwellCards.map((definition) => definition.id));
      expect(battle?.engine?.slice.committed.dreamwell).toEqual({ deck: [card.id], next: 0, catalog: content.dreamwellCards.map((definition) => definition.id) });
      expect(battle?.engine?.slice.committed.turn).toMatchObject({ active: side === "player" ? "enemy" : "player", phase: "night" });
      const loaded = validateLoadedState({ ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey }, { snapshot: journey, battle });
      expect(loaded).not.toBeNull();
      expect(battle?.engine?.slice.history?.entries).toEqual([]);
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const [suffix, reason] of [["bogus:player", "unknownVariant"], ["base:nobody", "unknownSide"], ["amplified:player", "ineligibleVariant"], ["base:player:%7B%7D", "invalidStage"]]) {
        const { battle } = labOf(`card-lab:${card.id}:${suffix}`);
        expect(report()).toMatchObject({ status: "rejected", reason });
        expect(battle?.engine?.slice.history).toBeUndefined();
      }
      labOf("card-lab:not-a-uuid:base:player");
      expect(report()).toMatchObject({ status: "rejected", reason: "unknownCard" });
    } finally { errors.mockRestore(); }
  });
  const displayLayers = [1, 2, 3, 4, 5, 6, 7];

  const battleScenes = QA_SCENES.filter(
    (scene) => qaSceneLoadsBattle(scene.id) && scene.promptLab === undefined,
  );
  const labScenes = QA_SCENES.filter((scene) => scene.promptLab !== undefined);

  it("has battle-loading scenes to open", () => {
    expect(battleScenes.length).toBeGreaterThan(0);
  });

  for (const scene of battleScenes) {
    it(`${scene.id} loads the battle BEGIN_BATTLE folds, and LOAD_STATE accepts it`, () => {
      const content = battleSceneContent();
      const journey = buildQaScene(scene.id, content, SCENE_OPTIONS);
      if (journey === null) throw new Error("the scene did not build");
      const battle = buildQaSceneBattle(scene.id, content, journey);
      expect(battle?.engine).toBeDefined();

      const fold = {
        ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG),
        journey,
      };
      const loaded = validateLoadedState(fold, { snapshot: journey, battle });
      expect(journeyBattleOf(loaded?.battle ?? null)?.engine).toEqual(battle?.engine);

      registerBattleInitProvider(createBattleInitProvider(content));
      try {
        const begun = beginBattle(
          fold,
          { siteId: activeSiteOf(journey) },
          {
            contentConfig: TEST_CONTENT_CONFIG,
            seq: 0,
            rng: () => 0,
            intervening: [],
            timestamp: new Date(0).toISOString(),
          },
        );
        expect(begun?.battle).toEqual(battle);
      } finally {
        registerBattleInitProvider(null);
      }
    });
  }

  it("loads each prompt-lab fixture's synthetic battle, which LOAD_STATE accepts and the journey engine replays", () => {
    const content = battleSceneContent();
    const engine = createBattleInitProvider(content).engine;
    expect(labScenes.length).toBeGreaterThan(0);
    for (const scene of labScenes) {
      const journey = buildQaScene(scene.id, content, SCENE_OPTIONS);
      if (journey === null || scene.promptLab === undefined) throw new Error(`${scene.id} did not build`);
      const battle = buildQaSceneBattle(scene.id, content, journey);
      const fold = { ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey };
      const loaded = validateLoadedState(fold, { snapshot: journey, battle });
      const slice = journeyBattleOf(loaded?.battle ?? null)?.engine.slice;
      if (slice === undefined) throw new Error(`${scene.id} loaded no engine battle`);

      expect(slice.committed.version, scene.id).toBe(battle?.engine?.slice.committed.version);
      expect(slice.inFlight === null || engine.decision(slice.committed) === null, scene.id).toBe(true);
      expect(battle?.init.cardDefinitions.some((definition) => definition.renderedText.length > 0), scene.id).toBe(true);
    }
  });

  it("loads a card-lab battle, reports a request it cannot serve, and folds debug actions that replay identically", () => {
    const content = battleSceneContent();
    const [card] = content.cardDatabase.values();
    if (card === undefined) throw new Error("no fixture card");
    const provider = createBattleInitProvider(content);
    const labOf = (token: string) => {
      const sceneId = parseQaSceneId(token);
      const journey = buildQaScene(sceneId, content, SCENE_OPTIONS);
      if (journey === null) throw new Error(`${token} did not build`);
      return { journey, battle: buildQaSceneBattle(sceneId, content, journey) };
    };
    const report = () => (globalThis as { __cardLab?: { status: string; reason: string | null } }).__cardLab;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { journey, battle } = labOf(`card-lab:${card.id}:base:player`);
      const slice = battle?.engine?.slice;
      expect(report()).toMatchObject({ status: "ready" });
      expect(slice?.history?.entries).toEqual([]);
      expect(
        slice?.committed.sides.player.hand.map((id) => slice.committed.instances[id]?.printing),
      ).toEqual([{ kind: "card", cardId: card.id }]);
      const asEnemy = journeyBattleOf(labOf(`card-lab:${card.id}:base:enemy`).battle)?.engine.slice.committed;
      expect(asEnemy?.sides.enemy.hand).toEqual([]);

      for (const [token, reason] of [
        [`card-lab:${testCardId("missing")}:base:player`, "unknownCard"],
        [`card-lab:${card.id}:bogus:player`, "unknownVariant"],
        [`card-lab:${card.id}:base:nobody`, "unknownSide"],
      ] as const) {
        expect(journeyBattleOf(labOf(token).battle)?.engine.slice.history, token).toBeUndefined();
        expect(report(), token).toMatchObject({ status: "rejected", reason });
      }
      expect(errors).toHaveBeenCalledTimes(3);

      registerBattleInitProvider(provider);
      let seq = 0;
      const fold = (state: FoldState, op: unknown) =>
        reduceGameEvent(
          state,
          {
            type: "BATTLE_DEBUG",
            payload: { op },
            actor: testEventActor("p1"),
            clientTimestamp: new Date(0).toISOString(),
            basedOnSeq: seq,
          },
          { contentConfig: TEST_CONTENT_CONFIG, seq: ++seq, rng: () => 0, intervening: [], timestamp: new Date(0).toISOString() },
        );
      const loaded = validateLoadedState({ ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey }, { snapshot: journey, battle });
      if (loaded === null) throw new Error("LOAD_STATE refused the card-lab battle");
      const energized = fold(loaded, { kind: "setEnergy", side: "player", energy: 3 });
      expect(energized.outcome).toBe("applied");
      expect(journeyBattleOf(energized.state.battle)?.engine.slice.committed.sides.player.currentEnergy).toBe(3);
      expect(fold(loaded, { kind: "setEnergy", side: "player", energy: 3 }).state).toEqual(energized.state);
      expect(fold(energized.state, { kind: "setEnergy", side: "player" }).outcome).toBe("bounced");
      expect(journeyBattleOf(fold(energized.state, { kind: "undo", keep: 0 }).state.battle)?.engine.slice.committed).toEqual(slice?.committed);
      expect(fold({ ...energized.state, battle: null }, { kind: "undo", keep: 0 }).outcome).toBe("bounced");
    } finally {
      errors.mockRestore();
      registerBattleInitProvider(null);
    }
  });

  it("retains declared physical targets and script progress through a serialized LOAD_STATE event", () => {
    const content = battleSceneContent();
    const [card] = content.cardDatabase.values();
    if (card === undefined) throw new Error("no fixture card");
    const stage = { player: { energy: 5 }, enemy: { back: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla2.id], energy: 4 }, enemyScript: [{ kind: "advance", ref: { zone: "back", index: 1 }, lane: 2 }, { kind: "challenge" }] };
    const scene = parseQaSceneId(`card-lab:${card.id}:base:enemy:${encodeURIComponent(JSON.stringify(stage))}`);
    const journey = buildQaScene(scene, content, SCENE_OPTIONS);
    if (journey === null) throw new Error("no declared journey");
    const battle = buildQaSceneBattle(scene, content, journey);
    const engine = createBattleInitProvider(content).engine;
    const payload = JSON.parse(JSON.stringify({ snapshot: journey, battle })) as Record<string, unknown>;
    const starting = initialFoldState(journey.seed, TEST_CONTENT_CONFIG);
    const loaded = reduceGameEvent(starting, { type: "LOAD_STATE", payload, actor: testEventActor("p1"), clientTimestamp: new Date(0).toISOString(), basedOnSeq: 0 }, { contentConfig: TEST_CONTENT_CONFIG, seq: 1, rng: () => 0, intervening: [], timestamp: new Date(0).toISOString() });
    expect(loaded.outcome).toBe("applied");
    const fold = journeyBattleOf(loaded.state.battle)?.engine;
    if (fold === undefined) throw new Error("LOAD_STATE lost declared engine data");
    const physical = fold.slice.committed.sides.enemy.backRank[1];
    const input = { engine, ...fold, pending: null, side: "enemy" as const, policy: "greedy" as const };
    expect(aiDecision(input)?.forced).toEqual({ kind: "action", action: { kind: "reposition", card: physical, to: { rank: "front", index: 2 } } });
    expect(aiDecision(input)).toEqual(aiDecision(input));
    registerBattleInitProvider(createBattleInitProvider(content));
    try {
      const moved = reduceGameEvent(loaded.state, { type: "BATTLE_ACTION", payload: { side: "enemy", action: { kind: "reposition", card: physical, to: { rank: "front", index: 2 } } }, actor: testEventActor("ai:enemy"), clientTimestamp: new Date(0).toISOString(), basedOnSeq: 1 }, { contentConfig: TEST_CONTENT_CONFIG, seq: 2, rng: () => 0, intervening: [], timestamp: new Date(0).toISOString() });
      expect(moved.outcome).toBe("applied");
      const resumedPayload = JSON.parse(JSON.stringify({ snapshot: moved.state.journey, battle: moved.state.battle })) as Record<string, unknown>;
      const reloaded = reduceGameEvent(starting, { type: "LOAD_STATE", payload: resumedPayload, actor: testEventActor("p1"), clientTimestamp: new Date(0).toISOString(), basedOnSeq: 0 }, { contentConfig: TEST_CONTENT_CONFIG, seq: 3, rng: () => 0, intervening: [], timestamp: new Date(0).toISOString() });
      expect(reloaded.outcome).toBe("applied");
      const resumed = journeyBattleOf(reloaded.state.battle)?.engine;
      if (resumed === undefined) throw new Error("LOAD_STATE lost script progress");
      expect(resumed.slice.committed.sides.enemy.frontRank[2]).toBe(physical);
      expect(aiDecision({ ...input, ...resumed })?.forced).toEqual({ kind: "action", action: { kind: "pass" } });
    } finally { registerBattleInitProvider(null); }
    const rejected = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const badScene = parseQaSceneId(`card-lab:${card.id}:base:enemy:${encodeURIComponent(JSON.stringify({ enemy: { energy: -1 } }))}`);
      const badJourney = buildQaScene(badScene, content, SCENE_OPTIONS);
      if (badJourney === null) throw new Error("no rejected scene journey");
      expect(buildQaSceneBattle(badScene, content, badJourney)?.engine.slice.history).toBeUndefined();
      expect((globalThis as { __cardLab?: { reason: string } }).__cardLab?.reason).toBe("invalidStage");
    } finally { rejected.mockRestore(); }
  });

  it("loads an active battle only for the dedicated playable scene", () => {
    expect(qaSceneLoadsBattle(parseQaSceneId("battle"))).toBe(false);
    expect(qaSceneLoadsBattle(parseQaSceneId("battle3"))).toBe(false);
    expect(qaSceneLoadsBattle(parseQaSceneId("battle-playable"))).toBe(true);
  });

  for (const displayLayer of [1, 2]) {
    it(`parks the tutorial journey on its Layer ${String(displayLayer)} Battle start screen`, () => {
      const state = buildQaScene(
        parseQaSceneId(`tutorial-battle${String(displayLayer)}`),
        makeJourneyContent(),
        SCENE_OPTIONS,
      );

      expect(state?.screen.type).toBe("site");
      expect(state?.completionLevel).toBe(displayLayer - 1);
      expect(state?.isTutorialJourney).toBe(true);
    });
  }

  for (const displayLayer of displayLayers) {
    it(`battle${String(displayLayer)} parks on the Layer ${String(displayLayer)} Battle start screen`, () => {
      const state = buildQaScene(
        parseQaSceneId(`battle${String(displayLayer)}`),
        makeJourneyContent(),
        SCENE_OPTIONS,
      );

      expect(state).not.toBeNull();
      expect(state?.completionLevel).toBe(displayLayer - 1);
      expect(state?.screen.type).toBe("site");
      expect(state?.currentDreamscape).not.toBeNull();

      const node =
        state?.currentDreamscape == null
          ? undefined
          : state.atlas.nodes[state.currentDreamscape];
      expect(node).toBeDefined();
      expect(node === undefined ? undefined : layerOrdinal(node.layer)).toBe(
        displayLayer - 1,
      );
      const battleSite = node?.sites.find(
        (site) => site.id === activeSiteOf(state),
      );
      expect(battleSite?.type).toBe("Battle");
      expect(
        node?.sites
          .filter((site) => site.type !== "Battle")
          .every((site) => site.isVisited),
      ).toBe(true);
    });
  }

  it('aliases plain "battle" to the Layer 1 battle scene', () => {
    const state = buildQaScene(
      parseQaSceneId("battle"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

    expect(state).not.toBeNull();
    expect(state?.completionLevel).toBe(0);
    expect(state?.screen.type).toBe("site");
    const node =
      state?.currentDreamscape == null
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    expect(node === undefined ? undefined : layerOrdinal(node.layer)).toBe(0);
    expect(
      node?.sites.find((site) => site.id === activeSiteOf(state))?.type,
    ).toBe("Battle");
  });
});

// Battle QA scenes: battle-loading, prompt-lab, and card-lab scenes load an
// engine battle that BEGIN_BATTLE and LOAD_STATE agree on, and the layer
// battle scenes park on their Battle start screens.

import { describe, expect, it, vi } from "vitest";
import * as battleInitProviders from "../session/providers/battle-init-provider";
import { createEngine, type EngineEvent } from "../engine";
import { atStartOfFirstTurn, triggered } from "../engine/dsl/triggers";
import { gainPoints } from "../engine/effects/primitives/gain-points";
import { avatarLabBattle } from "../engine/testing/avatar-lab";
import { EngineProbeHistory } from "../battle/components/engine-probe-events";
import type { CommittedEvent } from "../eventlog/local-log";
import { buildBattleAvatarStatus } from "../battle/ui/battle-avatar-status";
import { resolveEnemyAvatarSummary } from "../battle/components/enemy-avatar-summary";
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
import { AVATAR } from "../engine/testing/stack-cards";
import { journeyBattleOf } from "../rules/battle/fold";
import { SYNTHETIC } from "../engine/testing/synthetic-cards";
import { aiDecision } from "../engine/policy/decide";
import {
  activeSiteOf,
  battleSceneContent,
  makeJourneyContent,
  makeAvatar,
  SCENE_OPTIONS,
} from "./qa-scenes.fixtures";

describe("the battle layer QA scenes", () => {
  it("loads an exact avatar emblem and presentation for either controller and rejects invalid requests atomically", () => {
    const base = battleSceneContent();
    const content = { ...base, apollyonIncarnations: base.apollyonIncarnations.map(incarnation => ({ ...incarnation, title: base.avatars[0].name })) };
    const avatar = content.avatars[0];
    const unregistered = makeAvatar("unregistered-avatar");
    expect(unregistered.name).toBe(avatar.name);
    const targets = [avatar, ...content.apollyonIncarnations.map(incarnation => ({ id: incarnation.aspect.id, name: incarnation.title, renderedText: incarnation.aspect.renderedText }))];
    const build = (token: string) => {
      const id = parseQaSceneId(token);
      const journey = buildQaScene(id, content, SCENE_OPTIONS);
      if (journey === null) throw new Error("Avatar scene did not build");
      return { journey, battle: buildQaSceneBattle(id, content, journey) };
    };
    for (const target of targets) for (const side of ["player", "enemy"] as const) {
      const { journey, battle } = build(`card-lab-avatar:${target.id}:base:${side}`);
      expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "ready", entityKind: "avatar", avatar: target.id, cardStatus: "pending", eligibleVariants: ["base"] });
      expect(battle?.engine.init.avatars).toEqual({ [side]: target.id });
      expect(battle?.engine.slice.committed.sides[side].avatar).toEqual({ id: target.id, exhausted: false });
      expect(battle?.engine.slice.committed.sides[side === "player" ? "enemy" : "player"].avatar).toBeNull();
      if (side === "player") expect(battle?.init.avatarSummary?.id).toBe(target.id);
      else {
        expect(battle?.init).toMatchObject({ opponentAbilityActive: true, enemyDescriptor: { name: target.name, abilityText: target.renderedText } });
        expect(battle?.init.enemyDescriptor.avatarId).toBe(target.id === avatar.id ? target.id : undefined);
        expect(battle?.init.enemyDescriptor.aspectId).toBe(target.id === avatar.id ? undefined : target.id);
      }
      if (battle === null) throw new Error("Avatar lab missing");
      const profile = side === "player" ? battle.init.avatarSummary : resolveEnemyAvatarSummary(battle.init.enemyDescriptor, content);
      expect(buildBattleAvatarStatus(profile, false).avatarProfile?.id).toBe(target.id);
      const snapshot = { snapshot: journey, battle };
      const loaded = validateLoadedState({ ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey }, JSON.parse(JSON.stringify(snapshot)) as typeof snapshot);
      expect(journeyBattleOf(loaded?.battle ?? null)?.engine.slice).toEqual(battle?.engine.slice);
      expect(journeyBattleOf(loaded?.battle ?? null)?.init).toEqual(battle.init);
      const uppercase = build(`CARD-LAB-AVATAR:${target.id}:base:${side}`).battle;
      expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "ready", entityKind: "avatar", avatar: target.id });
      expect(uppercase?.engine.init.avatars).toEqual({ [side]: target.id });
    }
    expect(createBattleInitProvider(content).engine.catalog.avatar(AVATAR.drawer.id).id).toBe(AVATAR.drawer.id);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const validId of [avatar.id, content.apollyonIncarnations[0].aspect.id]) for (const [prefix, uuid, suffix, reason] of [
        ["card-lab-avatar", "bogus", "base:player", "unknownAvatar"],
        ["card-lab-avatar", SYNTHETIC.vanilla1.id, "base:player", "unknownAvatar"],
        ["card-lab-avatar", unregistered.id, "base:player", "unknownAvatar"],
        ["card-lab-avatar", AVATAR.drawer.id, "base:player", "unknownAvatar"],
        ["card-lab-avatar", content.apollyonIncarnations[0].id, "base:player", "unknownAvatar"],
        ["card-lab-avatar", validId, "base:other", "unknownSide"],
        ["card-lab-avatar", validId, "bogus:player", "unknownVariant"],
        ["card-lab-avatar", validId, "amplified:player", "ineligibleVariant"],
        ["card-lab-avatar", validId, "base:player:%7B%7D", "invalidStage"],
        ["card-lab-avatar", validId, "base:player::%7B%7D", "invalidMods"],
        ["card-lab-avatar-ambiguous", validId, "base:player", "ambiguousRequest"],
      ]) {
        const { battle } = build(`${prefix}:${uuid}:${suffix}`);
        expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "rejected", reason });
        expect(battle?.engine.slice.history).toBeUndefined();
      }
    } finally { errors.mockRestore(); }
  });

  it.each(["player", "enemy"] as const)("presents only the %s avatar ability as available", side => {
    const base = battleSceneContent();
    const content = { ...base, opponentsData: { ...base.opponentsData, progression: { ...base.opponentsData.progression, abilityActiveFromLayer: 0 } } };
    const avatar = content.avatars[0];
    const scene = parseQaSceneId(`card-lab-avatar:${avatar.id}:base:${side}`);
    const journey = buildQaScene(scene, content, SCENE_OPTIONS);
    if (journey === null) throw new Error("Avatar journey missing");
    const battle = buildQaSceneBattle(scene, content, journey);
    if (battle === null) throw new Error("Avatar lab missing");
    const profiles = { player: buildBattleAvatarStatus(battle.init.avatarSummary, false), enemy: buildBattleAvatarStatus(resolveEnemyAvatarSummary(battle.init.enemyDescriptor, content), !battle.init.opponentAbilityActive) };
    expect(profiles[side].avatarProfile?.id).toBe(avatar.id);
    if (side === "enemy") expect(profiles.player.avatarProfile).toBeUndefined();
    else expect(profiles.enemy.avatarProfile?.unavailable).toBe(true);
  });

  it.each((["player", "enemy"] as const).flatMap(side => (["roster", "aspect"] as const).map(kind => ({ side, kind }))))("retains $side $kind first-turn observations at the exact final LOAD_STATE init", ({ side, kind }) => {
    const content = battleSceneContent();
    const avatar = kind === "roster" ? content.avatars[0] : content.apollyonIncarnations[0].aspect;
    const factory = battleInitProviders.createBattleInitProvider;
    const original = factory(content).engine;
    const definition = { id: avatar.id, status: "authored" as const, abilities: () => [triggered(atStartOfFirstTurn(), gainPoints(2))] };
    const engine = createEngine({ ...original.catalog, avatar: id => id === avatar.id ? definition : original.catalog.avatar(id) });
    const injected = vi.spyOn(battleInitProviders, "createBattleInitProvider").mockImplementation(value => factory(value, engine));
    try {
      const scene = parseQaSceneId(`card-lab-avatar:${avatar.id}:base:${side}`);
      const journey = buildQaScene(scene, content, SCENE_OPTIONS);
      if (journey === null) throw new Error("Synthetic avatar journey missing");
      const expected: EngineEvent[] = [];
      avatarLabBattle(engine, { avatarId: avatar.id, side }, events => expected.push(...events));
      const battle = buildQaSceneBattle(scene, content, journey);
      if (battle === null) throw new Error("Synthetic avatar battle missing");
      const load = (seq: number, value: typeof battle): CommittedEvent => ({ seq, event: { type: "LOAD_STATE", payload: { snapshot: journey, battle: value }, actor: testEventActor("avatar-observation"), clientTimestamp: new Date(0).toISOString(), basedOnSeq: seq - 1 } });
      const committed = load(7, battle);
      const applied = reduceGameEvent(initialFoldState(journey.seed, TEST_CONTENT_CONFIG), committed.event, { contentConfig: TEST_CONTENT_CONFIG, seq: committed.seq, rng: () => 0, intervening: [], timestamp: new Date(0).toISOString() });
      expect(applied.outcome).toBe("applied");
      const loaded = journeyBattleOf(applied.state.battle);
      if (loaded === null) throw new Error("Synthetic avatar LOAD_STATE missing");
      expect(loaded.init).toBe(battle.init);
      expect(loaded.engine.slice.committed.sides[side].score).toBe(2);
      const shadow = { ...battle, init: { ...battle.init } };
      const history = new EngineProbeHistory(loaded.init, [committed, load(9, shadow)]);
      expect(history.events.map(({ seq, index, event }) => [seq, index, event])).toEqual(expected.map((event, index) => [7, index, event]));
      expect(history.events.find(({ event }) => event.kind === "triggerResolved")?.event).toMatchObject({ source: { kind: "avatar", side }, controller: side });
      history.append({ seq: 7, events: expected });
      expect(history.events).toHaveLength(expected.length);
      expect(new EngineProbeHistory(battle.init, [load(9, shadow)]).events).toEqual([]);
      expect(new EngineProbeHistory(shadow.init, [committed]).events).toEqual([]);
      const reloaded = structuredClone(battle);
      expect(new EngineProbeHistory(reloaded.init, [load(11, reloaded)]).events).toEqual([]);
      const [card] = content.cardDatabase.values();
      const ordinary = parseQaSceneId(`card-lab:${card.id}:base:enemy`);
      const ordinaryJourney = buildQaScene(ordinary, content, SCENE_OPTIONS);
      if (ordinaryJourney === null) throw new Error("Card control journey missing");
      const ordinaryBattle = buildQaSceneBattle(ordinary, content, ordinaryJourney);
      if (ordinaryBattle === null) throw new Error("Card control battle missing");
      const cardLoad: CommittedEvent = { seq: 13, event: { ...committed.event, payload: { snapshot: ordinaryJourney, battle: ordinaryBattle } } };
      const control = new EngineProbeHistory(ordinaryBattle.init, [cardLoad]).events.find(({ event }) => event.kind === "cardPlayed" && event.side === "enemy");
      expect(control).toMatchObject({ seq: 13, kind: "cardPlayed", event: { side: "enemy" } });
    } finally { injected.mockRestore(); }
  });

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
      for (const [suffix, reason] of [["bogus:player", "unknownVariant"], ["base:nobody", "unknownSide"], ["amplified:player", "ineligibleVariant"], ["base:player:%7B%22enemyScript%22%3A%5B%5D%7D", "invalidStage"]]) {
        const { battle } = labOf(`card-lab:${card.id}:${suffix}`);
        expect(report()).toMatchObject({ status: "rejected", reason });
        expect(battle?.engine?.slice.history).toBeUndefined();
      }
      labOf("card-lab:not-a-uuid:base:player");
      expect(report()).toMatchObject({ status: "rejected", reason: "unknownCard" });
    } finally { errors.mockRestore(); }
  });
  for (const side of ["player", "enemy"] as const) it(`loads and persists declared Dreamwell hands for ${side}`, () => {
    const content = battleSceneContent();
    const card = content.dreamwellCards[0];
    const stage = { player: { hand: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla2.id] }, enemy: { hand: [SYNTHETIC.vanilla3.id] } };
    const encoded = encodeURIComponent(JSON.stringify(stage));
    const id = parseQaSceneId(`card-lab:${card.id}:base:${side}:${encoded}`);
    const journey = buildQaScene(id, content, SCENE_OPTIONS);
    if (journey === null) throw new Error("declared Dreamwell scene did not build");
    const battle = buildQaSceneBattle(id, content, journey);
    if (battle === null) throw new Error("declared Dreamwell battle did not build");
    const state = battle.engine.slice.committed;
    expect(state.sides.player.hand).toHaveLength(2);
    expect(new Set(state.sides.player.hand).size).toBe(2);
    expect(state.sides.enemy.hand).toHaveLength(1);
    expect(state.sides.player.hand.map(instance => state.instances[instance].printing)).toEqual(stage.player.hand.map(cardId => ({ kind: "card", cardId })));
    expect(state.sides.enemy.hand.map(instance => state.instances[instance].printing)).toEqual(stage.enemy.hand.map(cardId => ({ kind: "card", cardId })));
    expect(state.turn).toMatchObject({ active: side === "player" ? "enemy" : "player", phase: "night" });
    expect(state.sides.player.currentEnergy).toBe(2);
    expect(state.sides.enemy.currentEnergy).toBe(2);
    expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "ready", stage: JSON.stringify(stage) });
    const load = { snapshot: journey, battle };
    const loaded = validateLoadedState({ ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey }, JSON.parse(JSON.stringify(load)) as typeof load);
    expect(journeyBattleOf(loaded?.battle ?? null)?.engine.slice).toEqual(battle.engine.slice);
    expect(battle.engine.slice.history?.base.committed.sides.player.hand).toEqual(state.sides.player.hand);
  });
  it("accepts an empty hand declaration and rejects unsupported or unknown hand inputs atomically", () => {
    const content = battleSceneContent();
    const card = content.dreamwellCards[0];
    const build = (stage: unknown, side: "player" | "enemy") => {
      const suffix = stage === undefined ? "" : `:${encodeURIComponent(JSON.stringify(stage))}`;
      const id = parseQaSceneId(`card-lab:${card.id}:base:${side}${suffix}`);
      const journey = buildQaScene(id, content, SCENE_OPTIONS);
      if (journey === null) throw new Error("scene missing");
      return buildQaSceneBattle(id, content, journey);
    };
    for (const side of ["player", "enemy"] as const) for (const stage of [undefined, {}]) {
      expect(build(stage, side)?.engine.slice.committed.sides[side].hand).toEqual([]);
      expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "ready" });
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const side of ["player", "enemy"] as const) for (const stage of [{ [side]: { deck: [] } }, { enemyScript: [] }, { [side]: { hand: ["bogus"] } }, { [side]: { hand: [testCardId("unknown-stage-card")] } }]) {
        expect(build(stage, side)?.engine.slice.history).toBeUndefined();
        expect.soft((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "rejected", reason: "invalidStage" });
      }
    } finally { errors.mockRestore(); }
  });
  const displayLayers = [1, 2, 3, 4, 5, 6, 7];

  const battleScenes = QA_SCENES.filter(
    (scene) => qaSceneLoadsBattle(scene.id) && scene.promptLab === undefined && scene.karevPayment === undefined,
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
        [`card-lab:${card.id}:base:player:${encodeURIComponent(JSON.stringify({ player: { front: [SYNTHETIC.event0.id] } }))}`, "unplayable"],
      ] as const) {
        expect(journeyBattleOf(labOf(token).battle)?.engine.slice.history, token).toBeUndefined();
        expect(report(), token).toMatchObject({ status: "rejected", reason });
      }
      expect(errors).toHaveBeenCalledTimes(4);

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

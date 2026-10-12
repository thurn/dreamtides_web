/** Stable public contracts for the four exact-UUID Karev QA declarations. */
import { describe, expect, it, vi } from "vitest";
import * as providers from "../session/providers/battle-init-provider";
import { createEngine, type Engine, type EngineEvent } from "../engine";
import { staticAbility } from "../engine/dsl/builders";
import { revealDeckTop } from "../engine/effects/primitives/reveal-deck-top";
import { opponent, type Side } from "../engine/state/ids";
import { promptLabBattle, type PromptLabFixture } from "../engine/testing/prompt-lab";
import { SYNTHETIC } from "../engine/testing/synthetic-cards";
import { EngineProbeHistory } from "../battle/components/engine-probe-events";
import type { CommittedEvent } from "../eventlog/local-log";
import type { JourneyContent } from "../data/journey-content";
import type { JourneyState } from "../types/journey";
import type { JourneyBattleFoldState } from "../rules/battle/fold";
import { journeyBattleOf } from "../rules/battle/fold";
import { startJourneyBattle } from "../rules/battle/journey-battle";
import { activeSiteIdOf } from "../rules/journey/sites";
import { takeEngineLogRecords } from "../rules/battle/engine-battle";
import { initialFoldState } from "../rules/fold-state";
import { foldInvariantViolations } from "../rules/invariants";
import { reduceGameEvent } from "../rules/reducer";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";
import { parseAvatarId, parseQaSceneId } from "../types/identifiers";
import { testEventActor, testJourneySeed } from "../types/test-identities";
import { buildQaScene, buildQaSceneBattle, findQaScene, QA_SCENES } from "./qa-scenes";
import { battleSceneContent, SCENE_OPTIONS } from "./qa-scenes.fixtures";

// This UUID is the public declaration's identity, not a production ability fixture.
const REQUIRED = parseAvatarId("9e4862fd-e18c-463e-9d5f-e5d73c29a66f");
const CASES = [
  { id: "karev-payment", controller: "enemy", payerEnergy: 1, layer: 2 },
  { id: "karev-unaffordable", controller: "enemy", payerEnergy: 0, layer: 2 },
  { id: "karev-controller-player", controller: "player", payerEnergy: 1, layer: 2 },
  { id: "karev-inactive", controller: "enemy", payerEnergy: 1, layer: 1 },
] as const;
type Declaration = (typeof CASES)[number];

function freezeInput<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freezeInput(nested);
    Object.freeze(value);
  }
  return value;
}

function contentOf(abilityActiveFromLayer = 1): JourneyContent {
  const base = battleSceneContent();
  return {
    ...base,
    avatars: [...base.avatars, { ...base.avatars[0], id: REQUIRED }],
    opponentsData: {
      ...base.opponentsData,
      progression: { ...base.opponentsData.progression, abilityActiveFromLayer },
    },
  };
}

/** Inject a synthetic definition through the actual public factory and engine. */
function withEngine<T>(content: JourneyContent, run: (engine: Engine) => T, broken = false): T {
  const factory = providers.createBattleInitProvider;
  const original = factory(content).engine;
  const error = new Error("synthetic catalog rejection");
  const definition = { id: REQUIRED, status: "authored" as const, abilities: () => [staticAbility(revealDeckTop())] };
  const engine = createEngine({
    ...original.catalog,
    avatar: id => id === REQUIRED ? definition : original.catalog.avatar(id),
    card: id => {
      if (broken && id === SYNTHETIC.vanilla5.id) throw error;
      return original.catalog.card(id);
    },
  });
  const injected = vi.spyOn(providers, "createBattleInitProvider").mockImplementation(value => factory(value, engine));
  try { return run(engine); }
  finally { injected.mockRestore(); }
}

function build(declaration: Declaration, content: JourneyContent) {
  const id = parseQaSceneId(declaration.id);
  const journey = buildQaScene(id, content, SCENE_OPTIONS);
  if (journey === null) throw new Error("Synthetic scene journey missing");
  const battle = buildQaSceneBattle(id, content, journey);
  if (battle === null) throw new Error("Synthetic scene battle missing");
  return { journey, battle };
}

function fixtureOf(declaration: Declaration, active: boolean): PromptLabFixture {
  const payer = opponent(declaration.controller);
  const deck = Array.from({ length: 12 }, () => SYNTHETIC.vanilla5.id);
  return {
    name: `karev-payment-${declaration.controller}-${declaration.payerEnergy}-${declaration.layer - 1}`,
    description: "Synthetic observation witness",
    setup: {
      active: payer, phase: "day", scoreToWin: 100,
      [payer]: { front: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: declaration.payerEnergy, deck },
      [declaration.controller]: { ...(active ? { avatar: REQUIRED } : {}), energy: 4, deck },
    },
    script: [],
  };
}

function loadOf(seq: number, journey: JourneyState, battle: JourneyBattleFoldState): CommittedEvent {
  return {
    seq,
    event: {
      type: "LOAD_STATE", payload: { snapshot: journey, battle },
      actor: testEventActor("karev-scene-observation"),
      clientTimestamp: new Date(0).toISOString(), basedOnSeq: seq - 1,
    },
  };
}

function applyLoad(committed: CommittedEvent, journey: JourneyState) {
  return reduceGameEvent(initialFoldState(journey.seed, TEST_CONTENT_CONFIG), committed.event, {
    contentConfig: TEST_CONTENT_CONFIG, seq: committed.seq, rng: () => 0,
    intervening: [], timestamp: new Date(0).toISOString(),
  });
}

function avatarOf(battle: JourneyBattleFoldState, side: Side) {
  return battle.engine.slice.committed.sides[side].avatar;
}

describe("Karev scene declarations", () => {
  it("registers precisely the four separately declared workflows", () => {
    expect(QA_SCENES.filter(scene => scene.karevPayment !== undefined).map(scene => scene.id)).toEqual(CASES.map(candidate => candidate.id));
    for (const declaration of CASES) {
      const scene = findQaScene(parseQaSceneId(declaration.id));
      expect(scene?.loadsBattle).toBe(true);
      expect(scene?.karevPayment).toEqual({ controller: declaration.controller, payerEnergy: declaration.payerEnergy });
    }
  });

  for (const declaration of CASES) {
    it(`${declaration.id} rejects partial content at both public construction boundaries`, () => {
      const complete = contentOf();
      const missing = freezeInput({ ...complete, avatars: complete.avatars.filter(avatar => avatar.id !== REQUIRED) });
      const before = JSON.stringify(missing);
      expect(missing.avatars.length).toBeGreaterThan(0);
      expect(buildQaScene(parseQaSceneId(`battle${declaration.layer}`), missing, SCENE_OPTIONS)).not.toBeNull();
      const scene = findQaScene(parseQaSceneId(declaration.id));
      expect(scene?.build(missing, SCENE_OPTIONS)).toBeNull();
      expect(buildQaScene(parseQaSceneId(declaration.id), missing, SCENE_OPTIONS)).toBeNull();
      const parked = freezeInput(buildQaScene(parseQaSceneId(declaration.id), complete, SCENE_OPTIONS));
      if (parked === null) throw new Error("Complete scene missing");
      const factory = vi.spyOn(providers, "createBattleInitProvider");
      try {
        expect(buildQaSceneBattle(parseQaSceneId(declaration.id), missing, parked)).toBeNull();
        expect(factory).not.toHaveBeenCalled();
      } finally { factory.mockRestore(); }
      expect(JSON.stringify(missing)).toBe(before);
      expect(buildQaScene(parseQaSceneId(declaration.id), complete, SCENE_OPTIONS)).toEqual(parked);
    });

    it(`${declaration.id} retains its controller, payer, native boundary and selected metadata through LOAD_STATE`, () => {
      const content = contentOf();
      withEngine(content, () => {
        const { journey, battle } = build(declaration, content);
        const payer = opponent(declaration.controller);
        const state = battle.engine.slice.committed;
        const active = declaration.controller === "player" || declaration.layer > 1;
        const ordinaryId = parseQaSceneId(`battle${declaration.layer}`);
        const ordinaryJourney = buildQaScene(ordinaryId, content, SCENE_OPTIONS);
        if (ordinaryJourney === null) throw new Error("Native control journey missing");
        const siteId = activeSiteIdOf(ordinaryJourney);
        if (siteId === null) throw new Error("Native control Battle site missing");
        const ordinary = startJourneyBattle(providers.createBattleInitProvider(content), {
          journey: ordinaryJourney, siteId, seedOverride: null, seq: 0,
          rng: () => 0, timestamp: new Date(0).toISOString(),
        });
        providers.settleDeferredOpponentLog(0, false);
        takeEngineLogRecords(0);
        expect(journey.completionLevel).toBe(declaration.layer - 1);
        expect(battle.init.completionLevelAtStart).toBe(ordinary?.init.completionLevelAtStart);
        expect(battle.init.opponentAbilityActive).toBe(declaration.controller === "player" ? false : ordinary?.init.opponentAbilityActive);
        expect(avatarOf(battle, declaration.controller)).toEqual(active ? { id: REQUIRED, exhausted: false } : null);
        expect(avatarOf(battle, payer)).toBeNull();
        expect(state.turn).toMatchObject({ active: payer, phase: "day" });
        expect(state.sides[payer].currentEnergy).toBe(declaration.payerEnergy);
        expect(state.sides[declaration.controller].currentEnergy).toBe(4);
        expect(state.sides[payer].frontRank.filter(id => id !== null).map(id => state.instances[id].printing)).toEqual([
          { kind: "card", cardId: SYNTHETIC.vanilla1.id }, { kind: "card", cardId: SYNTHETIC.vanilla2.id },
        ]);
        expect(state.sides[declaration.controller].frontRank.every(id => id === null)).toBe(true);
        for (const side of ["player", "enemy"] as const) {
          expect(state.sides[side].deck).toHaveLength(12);
          expect(state.sides[side].deck.map(id => state.instances[id].printing)).toEqual(Array.from({ length: 12 }, () => ({ kind: "card", cardId: SYNTHETIC.vanilla5.id })));
        }
        const avatar = content.avatars.find(candidate => candidate.id === REQUIRED);
        if (avatar === undefined) throw new Error("Synthetic Avatar missing");
        if (declaration.controller === "player") expect(battle.init.avatarSummary).toEqual(avatar);
        else {
          expect(battle.init.avatarSummary).toBeNull();
          expect(battle.init.enemyDescriptor).toMatchObject({ avatarId: avatar.id, name: avatar.name, subtitle: avatar.title, imageNumber: avatar.imageNumber, abilityText: avatar.renderedText });
        }
        const loaded = applyLoad(loadOf(7, journey, battle), journey);
        expect(loaded.outcome).toBe("applied");
        expect(foldInvariantViolations(loaded.state)).toEqual([]);
        expect(journeyBattleOf(loaded.state.battle)?.init).toBe(battle.init);
        const serialized = JSON.parse(JSON.stringify(battle)) as JourneyBattleFoldState;
        const reloaded = applyLoad(loadOf(11, journey, serialized), journey);
        expect(reloaded.outcome).toBe("applied");
        expect(foldInvariantViolations(reloaded.state)).toEqual([]);
        expect(journeyBattleOf(reloaded.state.battle)).toEqual(battle);
      });
    });

    it(`${declaration.id} binds genuine constructor observations to the final loaded init only`, () => {
      const content = contentOf();
      withEngine(content, engine => {
        const { journey, battle } = build(declaration, content);
        const active = declaration.controller === "player" || declaration.layer > 1;
        const expected: EngineEvent[] = [];
        promptLabBattle(engine, fixtureOf(declaration, active), events => expected.push(...events));
        if (active) expect(expected).toMatchObject([{ kind: "revealed", side: declaration.controller, zone: "deck" }]);
        else expect(expected).toEqual([]); // No emblem means no synthetic revelation.
        const committed = loadOf(7, journey, battle);
        const applied = applyLoad(committed, journey);
        const loaded = journeyBattleOf(applied.state.battle);
        if (loaded === null) throw new Error("Loaded scene missing");
        expect(loaded.init).toBe(battle.init);
        const unrelated = build(declaration, content).battle;
        const history = new EngineProbeHistory(loaded.init, [committed, loadOf(9, journey, unrelated)]);
        expect(history.events.map(({ seq, index, event }) => [seq, index, event])).toEqual(expected.map((event, index) => [7, index, event]));
        history.append({ seq: 7, events: expected });
        expect(history.events).toHaveLength(expected.length);
        expect(new EngineProbeHistory(loaded.init, [loadOf(9, journey, unrelated)]).events).toEqual([]);
        expect(new EngineProbeHistory(unrelated.init, [committed]).events).toEqual([]);
        expect(new EngineProbeHistory({ ...loaded.init }, [committed]).events).toEqual([]);
        const reloaded = JSON.parse(JSON.stringify(battle)) as JourneyBattleFoldState;
        expect(new EngineProbeHistory(reloaded.init, [loadOf(11, journey, reloaded)]).events).toEqual([]);
        expect(new EngineProbeHistory(unrelated.init, [loadOf(13, journey, unrelated)]).events.map(item => item.seq)).toEqual(expected.map(() => 13));
      });
    });
  }

  it("rejects a frozen same-name Avatar under a different UUID without substituting it", () => {
    const complete = contentOf();
    const wrong = freezeInput({
      ...complete,
      avatars: complete.avatars.map(avatar => avatar.id === REQUIRED
        ? { ...avatar, id: parseAvatarId("00000000-0000-4000-8000-000000008000") }
        : avatar),
    });
    const before = JSON.stringify(wrong);
    for (const declaration of CASES) {
      const id = parseQaSceneId(declaration.id);
      const journey = buildQaScene(id, complete, SCENE_OPTIONS);
      if (journey === null) throw new Error("Complete scene missing");
      expect(buildQaScene(id, wrong, SCENE_OPTIONS)).toBeNull();
      expect(buildQaSceneBattle(id, wrong, freezeInput(journey))).toBeNull();
    }
    expect(JSON.stringify(wrong)).toBe(before);
  });

  it("uses the configured native opponent boundary and always includes a selected player emblem", () => {
    const content = contentOf(2);
    withEngine(content, () => {
      for (const declaration of CASES) {
        const { battle } = build(declaration, content);
        expect(battle.init.opponentAbilityActive).toBe(false);
        expect(avatarOf(battle, declaration.controller)).toEqual(declaration.controller === "player" ? { id: REQUIRED, exhausted: false } : null);
      }
    });
  });

  it("propagates constructor failures without input writes, then rebuilds cleanly", () => {
    const content = contentOf();
    const declaration = CASES[0];
    const journey = buildQaScene(parseQaSceneId(declaration.id), content, SCENE_OPTIONS);
    if (journey === null) throw new Error("Synthetic journey missing");
    const before = JSON.stringify({ content, journey });
    withEngine(content, () => expect(() => buildQaSceneBattle(parseQaSceneId(declaration.id), content, journey)).toThrow("synthetic catalog rejection"), true);
    expect(JSON.stringify({ content, journey })).toBe(before);
    withEngine(content, () => {
      const first = build(declaration, content);
      const interleaved = build(CASES[2], content);
      expect(interleaved.battle.init).not.toBe(first.battle.init);
      buildQaScene(parseQaSceneId(CASES[3].id), content, { journeySeed: testJourneySeed("independent-scene") });
      expect(build(declaration, content)).toEqual(first);
      expect(JSON.stringify({ content, journey })).toBe(before);
    });
  });
});

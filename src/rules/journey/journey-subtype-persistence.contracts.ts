import { registerTutorialFrontDoorContentProvider } from "../front-door";
import { registerTutorialBattleInitProvider } from "../battle/tutorial-lifecycle";
import { engine as tutorialEngine, CARDS, prefixSetup, prefixActions, init as tutorialInit, display } from "../battle/tutorial-contracts-fixture";
import { genesisFoldState } from "../fold-state";
import { parseBattleId } from "../../types/identifiers";
import { testCardId, testAvatarId } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";
import { setup, apply, intent, clear, TOAD, registry } from "./journey-subtype.fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { assertJourneySubtypeCheckpoint } from "./journey-subtype";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { GENESIS, ctx, event } from "./lifecycle-fixtures";
import { reduceGameEvent } from "../reducer";
import type { EngineConfig } from "../../eventlog/types";
import type { FoldState } from "../fold-state";
import toad from "../../content/dreamsigns/toad-8e2d26a8";
import { parseDreamsignId } from "../../types/identifiers";
afterEach(clear);
describe("saved journey subtype acquisition", () => {
  it("pairs a public tutorial battle acquisition with its front-door identity and continuation", () => {
    setup();
    registerTutorialFrontDoorContentProvider({ playerCardId: CARDS.strong, journeyAvatarId: testAvatarId("subtype-tutorial") });
    registerTutorialBattleInitProvider({ engine: tutorialEngine, overrides: [], beginTutorialPrefix: () => prefixSetup(), beginTutorialBattle: input => ({ init: { ...display(), battleId: parseBattleId(`subtype-tutorial:${input.tutorialRunId}`) }, engineInit: tutorialInit("player", CARDS.strong) }) });
    let state = genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" });
    state = apply(state, "BEGIN_TUTORIAL", { actions: prefixActions, startAtEnd: true }).state;
    state = apply(state, "BEGIN_TUTORIAL_BATTLE", { tutorialRunId: state.frontDoor.tutorial!.runId }).state;
    expect(state.battle?.mode.kind).toBe("tutorial");
    const original = state, acquired = apply(state, "ADD_DREAMSIGN", { dreamsignId: TOAD }); expect(acquired.outcome).toBe("applied"); state = acquired.state;
    const loaded = apply(state, "LOAD_STATE", { snapshot: structuredClone(state.journey), battle: structuredClone(state.battle) }); expect(loaded.outcome).toBe("applied");
    const wrong = { ...state, frontDoor: { ...state.frontDoor, phase: "journey" as const } };
    expect(apply(wrong, "LOAD_STATE", { snapshot: structuredClone(state.journey), battle: structuredClone(state.battle) }).state).toBe(wrong);
    const done = apply(loaded.state, "RESOLVE_JOURNEY_SUBTYPE", intent(loaded.state)); expect(done.outcome).toBe("applied");
    expect(done.state.battle).toBe(loaded.state.battle); expect(done.state.frontDoor).toEqual(original.frontDoor); expect(done.state.journey.screen).toEqual(original.journey.screen);
  });
  it("reloads an earned cohort and reproduces a durable event fold and hash", () => {
    const initial = setup(), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (state, action, context) => reduceGameEvent(state, action, context, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("ADD_DREAMSIGN", {}).actor, now: () => ctx().timestamp, devMode: false });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: TOAD } });
    const pending = log.state(), loaded = apply(pending, "LOAD_STATE", { snapshot: structuredClone(pending.journey) }); expect(loaded.outcome).toBe("applied");
    log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(pending) });
    const replay = foldEvents(config, GENESIS, { seq: 0, state: initial }, [...log.events()]);
    expect(replay.state).toEqual(log.state()); expect(config.hash(replay.state)).toBe(config.hash(log.state()));
    expect(apply(loaded.state, "RESOLVE_JOURNEY_SUBTYPE", intent(loaded.state)).state.journey.deck).toEqual(log.state().journey.deck);
  });
  it("round-trips the production registered role through the canonical checkpoint codec", () => {
    const state = setup(), id = parseDreamsignId(toad.id);
    const result = reduceGameEvent(state, event("ADD_DREAMSIGN", { dreamsignId: id }), ctx()); expect(result.outcome).toBe("applied");
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(result.state)); expect(decoded).toEqual(result.state); expect(GAME_ENGINE_CONFIG.hash(decoded)).toBe(GAME_ENGINE_CONFIG.hash(result.state));
  });
  it("rejects malformed saved roles at LOAD and checkpoint intake", () => {
    const pending = apply(setup(), "ADD_DREAMSIGN", { dreamsignId: TOAD }).state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Missing permission");
    const choice = pending.journey.screen.choice;
    const transformed = { entry: { ...pending.journey.deck[0], transfiguration: "Kindled" }, cardId: testCardId(`subtype-card-${pending.journey.deck[0].cardNumber}`), cardType: "Character" };
    const patches: Record<string, unknown>[] = [
      { resume: { ...choice.resume, transfigurations: [transformed, transformed] } },
      { resume: { ...choice.resume, copySources: [choice.resume.sources[0]] } },
      { resume: { ...choice.resume, starterSources: [{ ...choice.resume.sources[0], maxCount: 1, entries: [] }] } },
      ...[{ keywordModification: "invalid" }, { keywordModification: { fast: 1 } }, { keywordModification: { reclaim: "invalid" } }, { statOverride: null }, { statOverride: { spark: "invalid" } }].map(patch => ({ resume: { ...choice.resume, before: { ...choice.resume.before, deck: [{ ...pending.journey.deck[0], ...patch }] } } })),
      { current: { kind: "other" } }, { current: { kind: "deckSubtype", entries: [] } }, { current: { kind: "deckSubtype", entries: [{ entryId: "invalid", cardId: "invalid" }] } },
      { resume: { ...choice.resume, sourceIndex: 999 } }, { resume: { ...choice.resume, sources: [...choice.resume.sources, choice.resume.sources[0]] } },
      { resume: { ...choice.resume, observerSources: [{ ...choice.resume.observerSources[0], heldIndex: 8 }] } },
      { resume: { ...choice.resume, before: {} } }, { resume: { ...choice.resume, before: { ...choice.resume.before, essence: null } } },
      ...["attemptedEntries", "purges", "transfigurations", "starterSources", "copySources"].map(key => ({ resume: { ...choice.resume, [key]: [{}] } })),
      { resume: { ...choice.resume, eventType: "LOAD_STATE" } }, { continuation: { type: "journeyDreamsign", choice: {} } },
      { suspendedBattle: { battleId: "unknown", mode: "journey" } },
    ];
    for (const patch of patches) {
      const bad = { ...pending, journey: { ...pending.journey, screen: { type: "journeyDreamsign", choice: { ...choice, ...patch } } } };
      expect(apply(pending, "LOAD_STATE", { snapshot: bad.journey }).state).toBe(pending);
      expect(() => assertJourneySubtypeCheckpoint(bad, registry)).toThrow();
    }
  });
  it("contains unavailable content before any partial write and resumes the same permission on retry", () => {
    const initial = setup(), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (state, action, context) => reduceGameEvent(state, action, context, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("ADD_DREAMSIGN", {}).actor, now: () => ctx().timestamp, devMode: false });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: TOAD } }); const pending = log.state();
    const rows: LocalLogRecord<FoldState>[] = []; log.subscribe(row => rows.push(row));
    clear(); log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(pending) }); expect(log.state()).toEqual(pending);
    setup(); log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(pending) }); expect(log.state().journey.screen.type).toBe("journeyStart");
    expect(rows[0].outcome).toBe("bounced"); expect(rows[0].logRecords).toBeUndefined();
  });
});

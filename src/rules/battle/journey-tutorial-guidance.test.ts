import { currentTutorialPresentation } from "./tutorial-checkpoints";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { buildBattleTutorialGuidanceView } from "../../screens/cumulus_adapters/battle-tutorial-guidance-view-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { hashState } from "../../eventlog/hash";
import { makeActions } from "../../session/actions";
import { testCardId, testEventActor, testTutorialTriggerId, testCardSubtype } from "../../types/test-identities";
import { parseBattleCardId, parseCardTypeChangePredicateId, parseIntentKey, parsePresentationId } from "../../types/identifiers";
import type { BattleInit } from "../../engine";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import { NO_DECK_MODS } from "../../engine/dsl/types";
import { GLOSSARY_IDS } from "../../data/glossary";
import { createBaseBattleDeckCardDefinition } from "../../battle/card-definition";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { currentCardTutorialScreenKey, openCardTutorialGuidance, registerCardTutorialGuidanceContentProvider } from "../card-tutorial-guidance";
import { registerBattleInitProvider, startJourneyBattle } from "./journey-battle";
import { parseJourneyBattleFoldState, journeyBattleOf } from "./fold";
import { genesisFoldState } from "../fold-state";
import { battleGuidanceOf } from "./journey-tutorial-guidance";
import { pendingEnginePrompt, reduceEngineIntentWithCommits, foldAdapterFor, foldEngineIntent } from "./engine-battle";
import { EngineAiDriver } from "../../battle/engine-ai/engine-ai-driver";
import { createInlinePolicyHost } from "../../engine/policy/host";
import { CARDS, WELL, SUMMON, LATE_SUMMON, FIGMENT, CREATE_STRONG, CREATE_TARGET, engine, GENESIS, context, host, teaching, play, passUntilGuidance, passUntilCreatedHand, apply, room, allCards } from "./journey-tutorial-guidance.fixtures";
import { display, init } from "./tutorial-contracts-fixture";

beforeEach(() => registerBattleInitProvider({ engine, beginBattle: () => null }));
afterEach(() => { registerBattleInitProvider(null); registerCardTutorialGuidanceContentProvider(null); });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function current(state: ReturnType<typeof host>) {
  const battle = journeyBattleOf(state.battle);
  if (battle?.guidance === undefined) throw Error("missing journey guidance");
  return battle;
}
function finish(state: ReturnType<typeof host>) {
  const presentation = currentTutorialPresentation(current(state).guidance);
  if (presentation === null) throw Error("missing presentation");
  return apply(state, "COMPLETE_TUTORIAL_BATTLE_PRESENTATION", { presentationId: presentation.id, messageIndex: presentation.messageIndex }, 50);
}
function drawHost(triggers = [teaching("dreamwell-resolve", WELL)]) {
  const base = init("enemy", CARDS.strong);
  return host("enemy", CARDS.strong, triggers, { setup: { ...base.setup!, placements: [
    { side: "enemy", deckIndex: 0, zone: "hand" }, { side: "enemy", deckIndex: 1, zone: "hand" }, { side: "player", deckIndex: 0, zone: "hand" }, { side: "player", deckIndex: 1, zone: "hand" },
  ] } });
}

describe("journey battle guidance from public engine work", () => {
  it("keeps a renderable transient figment checkpoint through a long public action", () => {
    const initial = host("player", LATE_SUMMON, [teaching("figment-created")]);
    const physical = current(initial).engine.slice.committed.sides.player.hand[0];
    const action = { side: "player", action: { kind: "play", card: physical, from: "hand" } };
    const result = apply(initial, "BATTLE_ACTION", action);
    expect(result.outcome).toBe("applied");
    const next = result.state, battle = current(next), checkpoint = battle.guidance!.checkpoints[0];
    const publication = foldEngineIntent(foldAdapterFor(engine), current(initial).engine.slice, "BATTLE_ACTION", action);
    if (publication.kind !== "applied" || checkpoint?.presentation.kind !== "tutorial-guidance" || checkpoint.presentation.source.kind !== "figment") throw Error("missing public transient figment producer");
    const source = checkpoint.presentation.source.battleCardId;
    const created = publication.published.findIndex(event => event.kind === "cardCreated" && event.instance === source);
    expect(publication.published.slice(0, created).filter(event => event.kind === "energyChanged").length).toBeGreaterThan(1);
    expect(publication.published.findIndex(event => event.kind === "ceasedToExist" && event.instance === source)).toBeGreaterThan(created);
    const physicalSource = publication.published[created];
    if (physicalSource.kind !== "cardCreated") throw Error("missing synthetic physical creation");
    expect(battle.engine.slice.committed.instances[physicalSource.instance]).toBeUndefined();
    const cards = createEngineCardModels({ definitions: battle.init.cardDefinitions, cards: new Map(allCards.map(card => [card.id, card])), figment: () => undefined });
    const view = buildBattleTutorialGuidanceView(battleGuidanceOf(battle)!, engine, cards);
    expect(view, JSON.stringify({ created, physicalInCheckpoint: checkpoint.state.instances[physicalSource.instance] !== undefined, physicalInCommitted: battle.engine.slice.committed.instances[physicalSource.instance] !== undefined })).not.toBeNull();
    expect(view?.source).toMatchObject({ kind: "card", figment: true, battleCardId: source });
    expect(parseJourneyBattleFoldState({ ...clone(battle) })).not.toBeNull();
    const loaded = apply(next, "LOAD_STATE", { snapshot: next.journey, battle: clone(battle) }, 45);
    expect(loaded.outcome).toBe("applied");
    expect(current(loaded.state).guidance?.checkpoints).toEqual(battle.guidance?.checkpoints);
    const completed = finish(next);
    expect(completed.outcome).toBe("applied");
    expect(current(completed.state).guidance?.checkpoints).toEqual([]);
    expect(current(completed.state).engine).toEqual(battle.engine);
  });

  it("binds a lane's challenge source to its actual turn before automatic turn advance", () => {
    const base = init("player", CARDS.strong);
    let state = host("player", CARDS.strong, [teaching("challenge-resolved")], { scoreToWin: 1000, decks: { player: [{ cardId: CARDS.strong }], enemy: [{ cardId: CARDS.weak }] }, setup: { ...base.setup!, placements: [{ side: "player", deckIndex: 0, zone: "play", slot: { rank: "front", index: 0 } }] } });
    for (let seq = 20; seq < 30; seq++) {
      const before = current(state), side = engine.decision(before.engine.slice.committed)?.side;
      if (side === undefined) throw Error("no public challenge decision");
      const payload = { side, action: { kind: "pass" } };
      const result = apply(state, "BATTLE_ACTION", payload, seq);
      expect(result.outcome).toBe("applied");
      state = result.state;
      const battle = current(state), checkpoint = battle.guidance!.checkpoints[0];
      if (checkpoint === undefined) continue;
      const published = foldEngineIntent(foldAdapterFor(engine), before.engine.slice, "BATTLE_ACTION", payload);
      if (published.kind !== "applied" || checkpoint.presentation.kind !== "tutorial-guidance") throw Error("missing actual lane publication");
      const lane = published.published.findIndex(event => event.kind === "laneResolved");
      expect(lane).toBeGreaterThan(0);
      expect(published.published.findIndex(event => event.kind === "turnStarted")).toBeGreaterThan(lane);
      expect(checkpoint.state.turn.active).toBe("player");
      expect(battle.engine.slice.committed.turn.active).toBe("enemy");
      expect(checkpoint.presentation.source).toMatchObject({ kind: "challenge", activeSide: "player", turnNumber: checkpoint.state.turn.turnNumber });
      expect(checkpoint.before.turn.active).toBe("player");
      expect(parseJourneyBattleFoldState({ ...clone(battle) })).not.toBeNull();
      return;
    }
    throw Error("late synthetic lane did not resolve");
  });

  it("captures potential sources independently of shared history and supplements changed metadata on the same engine slice", () => {
    const trigger = teaching("figment-created"), initial = host("player", LATE_SUMMON, [trigger]);
    const seenFirst = play({ ...initial, tutorialTriggerIdsSeen: [trigger.id] });
    expect(current(seenFirst).guidance?.checkpoints).toEqual([]);
    const freshHistory = play(initial), checkpoint = current(freshHistory).guidance!.checkpoints[0];
    expect(checkpoint.presentation.kind).toBe("tutorial-guidance");
    expect(current(freshHistory).engine).toEqual(current(seenFirst).engine);
    expect(parseJourneyBattleFoldState({ ...clone(current(freshHistory)) })).not.toBeNull();
    const withoutTriggers = host("player", LATE_SUMMON, []), inactive = play(withoutTriggers);
    expect(current(inactive).guidance?.checkpoints).toEqual([]);
    const battle = current(withoutTriggers);
    const changed = play({ ...withoutTriggers, battle: { ...battle, guidance: { ...battle.guidance!, tutorialTriggers: [trigger] } } });
    expect(current(changed).engine).toEqual(current(inactive).engine);
    expect(parseJourneyBattleFoldState({ ...clone(current(changed)) })).not.toBeNull();
    expect(current(changed).guidance?.tutorialPresentation?.kind).toBe("tutorial-guidance");
  });

  it.each(["card-play", "card-no-valid-targets"] as const)("uses pinned UUID catalog text for a created source absent from dealt definitions on %s", edge => {
    const created = edge === "card-play" ? CARDS.strong : CARDS.target, maker = edge === "card-play" ? CREATE_STRONG : CREATE_TARGET;
    const expected = testTutorialTriggerId(`${edge}-created-foresee`);
    const triggers: readonly TutorialTriggerDefinition[] = [{ ...teaching(edge), id: expected, match: { kind: "glossary", id: GLOSSARY_IDS.foresee } }];
    registerBattleInitProvider({ engine, beginBattle: () => null, guidanceCardText: id => id === created ? "Foresee 1." : undefined });
    const base = init("player", maker), initial = host("player", maker, triggers, { decks: { player: [{ cardId: maker }, { cardId: CARDS.weak }, { cardId: CARDS.weak }], enemy: [{ cardId: CARDS.weak }, { cardId: CARDS.weak }] }, setup: base.setup });
    const battle = current(initial), fixture = { ...initial, battle: { ...battle, init: { ...battle.init, cardDefinitions: battle.init.cardDefinitions.filter(card => card.cardId === maker || card.cardId === CARDS.weak) } } };
    const ready = passUntilCreatedHand(play(fixture), created), board = ready.battle!.engine.slice.committed;
    const physical = board.sides.player.hand.find(id => { const printing = board.instances[id].printing; return printing.kind === "card" && printing.cardId === created; });
    if (physical === undefined) throw Error("missing created physical card");
    const next = edge === "card-play" ? apply(ready, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: physical, from: "hand" } }).state : apply(ready, "TUTORIAL_CARD_ATTEMPT", { battleId: battle.init.battleId, instance: physical }).state;
    expect(next.tutorialTriggerIdsSeen).toEqual([expected]);
    expect(current(next).guidance?.tutorialPresentation?.source).toMatchObject({ kind: "card", cardId: created, battleCardId: physical });
  });

  it.each(["card-play", "card-no-valid-targets"] as const)("resolves the exact same-UUID physical variant for %s", edge => {
    const cardId = edge === "card-play" ? CARDS.strong : CARDS.target, subtype = testCardSubtype("fixture");
    const override = edge === "card-play" ? { predicateId: parseCardTypeChangePredicateId("synthetic-guidance-event"), cardType: "Event" as const, subtype, label: "synthetic" } : null;
    const mods = { ...NO_DECK_MODS, fast: true, typeChange: override === null ? null : { cardType: "event" as const, subtype } };
    const base = init("player", cardId), expected = testTutorialTriggerId(`${edge}-physical-foresee`);
    const triggers: readonly TutorialTriggerDefinition[] = [
      { ...teaching(edge), id: testTutorialTriggerId(`${edge}-wrong-support`), match: { kind: "glossary", id: GLOSSARY_IDS.support } },
      { ...teaching(edge), id: expected, match: { kind: "glossary", id: GLOSSARY_IDS.foresee } },
    ];
    const initial = host("player", cardId, triggers, { decks: { ...base.decks, player: [{ cardId }, { cardId, deckMods: mods }] }, setup: { ...base.setup!, placements: [{ side: "player", deckIndex: 1, zone: "hand" }] } });
    const battle = current(initial), definition = createBaseBattleDeckCardDefinition(allCards.find(card => card.id === cardId)!);
    const fixture = { ...initial, battle: { ...battle, init: { ...battle.init, cardDefinitions: [
      { ...definition, renderedText: "Support." },
      { ...definition, renderedText: "Foresee 1.", battleCardKind: "event" as const, keywordModification: { fast: true }, typeChange: override },
    ] } } };
    const physical = fixture.battle.engine.slice.committed.sides.player.hand[0];
    const next = edge === "card-play" ? play(fixture) : apply(fixture, "TUTORIAL_CARD_ATTEMPT", { battleId: battle.init.battleId, instance: physical }).state;
    expect(next.tutorialTriggerIdsSeen).toEqual([expected]);
    expect(current(next).guidance?.tutorialPresentation?.source).toMatchObject({ kind: "card", cardId, battleCardId: physical, cardKind: "event" });
  });

  it.each(["player", "enemy"] as const)("opens an actual %s card-play checkpoint without changing the journey host", side => {
    const initial = host(side, CARDS.strong, [teaching("card-play")]), next = play(initial), battle = current(next);
    expect(battle.mode.kind).toBe("journey");
    expect(battle.guidance?.tutorialPresentation?.source).toMatchObject({ kind: "card", cardId: CARDS.strong, side });
    expect(battle.guidance?.checkpoints[0]?.producer).toMatchObject({ seq: 10 });
    expect(battle.guidance?.tutorialPresentation?.messages[0]?.delay).toBe(0.5);
    expect(next.tutorialTriggerIdsSeen).toEqual([teaching("card-play").id]);
    const receipt = reduceEngineIntentWithCommits(initial, "BATTLE_ACTION", { side, action: { kind: "play", card: initial.battle!.engine.slice.committed.sides[side].hand[0], from: "hand" } }, context(), engine);
    expect(receipt?.committedSteps.some(step => step.events.some(event => event.kind === "cardPlayed"))).toBe(true);
  });

  it("opens a real Dreamwell checkpoint ahead of its suspended discard and restores both on reload", () => {
    const next = passUntilGuidance(drawHost()), battle = current(next), pending = pendingEnginePrompt(battle, engine);
    expect(battle.guidance?.tutorialPresentation?.source.kind).toBe("dreamwell");
    expect(pending?.prompt.kind).toBe("chooseCards");
    const loaded = apply(genesisFoldState(GENESIS), "LOAD_STATE", { snapshot: clone(next.journey), battle: clone(battle) }, 40);
    expect(loaded.outcome).toBe("applied");
    expect(loaded.state.battle).toEqual(battle);
    expect(pendingEnginePrompt(loaded.state.battle, engine)).toEqual(pending);
    const completed = finish(loaded.state);
    expect(completed.outcome).toBe("applied");
    const prompt = pendingEnginePrompt(completed.state.battle, engine)?.prompt;
    if (prompt?.kind !== "chooseCards") throw Error("missing resumed discard");
    const answered = apply(completed.state, "BATTLE_ANSWER", { side: prompt.side, promptId: prompt.id, value: [prompt.candidates[0]] }, 51);
    expect(answered.outcome).toBe("applied");
    expect(answered.state.battle?.engine.slice.inFlight).toBeNull();
  });

  it("uses the real figment producer's UUID and physical source", () => {
    const next = passUntilGuidance(play(host("player", SUMMON, [teaching("figment-created")]))), battle = current(next);
    const source = battle.guidance?.tutorialPresentation?.source;
    expect(source).toMatchObject({ kind: "figment", cardId: FIGMENT, side: "player" });
    if (source?.kind !== "figment") throw Error("missing figment source");
    expect(Object.values(battle.guidance!.checkpoints[0].state.instances).find(card => parseBattleCardId(card.id) === source.battleCardId)?.printing).toMatchObject({ kind: "figment", figment: FIGMENT });
    expect(parseJourneyBattleFoldState({ ...clone(battle) })).toEqual(battle);
  });

  it("opens only the authored challenge guidance for a real lane result", () => {
    const base = init("player", CARDS.strong);
    const extra: Partial<BattleInit> = { decks: { player: [{ cardId: CARDS.strong }], enemy: [{ cardId: CARDS.strong }] }, setup: { ...base.setup!, placements: [
      { side: "player", deckIndex: 0, zone: "play", slot: { rank: "front", index: 4 } }, { side: "enemy", deckIndex: 0, zone: "play", slot: { rank: "front", index: 4 } },
    ] } };
    const initial = host("player", CARDS.strong, [teaching("challenge-resolved"), teaching("opponent-reposition-opportunity"), teaching("player-night-phase")], extra);
    const next = passUntilGuidance(initial), checkpoints = current(next).guidance!.checkpoints;
    expect(checkpoints.map(checkpoint => checkpoint.presentation.kind)).toEqual(["tutorial-guidance"]);
    expect(current(next).guidance?.tutorialPresentation?.source).toMatchObject({ kind: "challenge", activeSide: "player", slotId: "F4" });
    expect(next.tutorialTriggerIdsSeen).toEqual([teaching("challenge-resolved").id]);
  });

  it("opens only a true required-target refusal and publishes no probe work", () => {
    const initial = host("player", CARDS.target, [teaching("card-no-valid-targets")]), battle = current(initial), instance = battle.engine.slice.committed.sides.player.hand[0];
    const refused = apply(initial, "TUTORIAL_CARD_ATTEMPT", { battleId: battle.init.battleId, instance });
    expect(refused.outcome).toBe("applied");
    expect(refused.state.battle?.engine).toBe(battle.engine);
    expect(current(refused.state).guidance?.tutorialPresentation?.source).toMatchObject({ kind: "card", cardId: CARDS.target, battleCardId: instance });
    const unrelated = host("player", CARDS.blockedCost, [{ ...teaching("card-no-valid-targets"), match: { kind: "any" } }]);
    expect(apply(unrelated, "TUTORIAL_CARD_ATTEMPT", { battleId: unrelated.battle!.init.battleId, instance: unrelated.battle!.engine.slice.committed.sides.player.hand[0] }).outcome).toBe("bounced");
    expect(apply(initial, "TUTORIAL_CARD_ATTEMPT", { battleId: "foreign", instance }).outcome).toBe("bounced");
    expect(apply(initial, "TUTORIAL_CARD_ATTEMPT", { battleId: battle.init.battleId, instance: "i999" }).outcome).toBe("bounced");
  });

  it("keeps BEGIN_BATTLE setup history empty and accepts legacy absence of the host", () => {
    const metadata = display([teaching("card-play"), teaching("figment-created")]);
    const started = startJourneyBattle({ engine, beginBattle: () => ({ init: metadata, engineInit: init("player", CARDS.strong), guidance: metadata }) }, { journey: host().journey, siteId: metadata.siteId, seedOverride: null, seq: 1, rng: () => 0, timestamp: context().timestamp });
    expect(started?.guidance?.checkpoints).toEqual([]);
    expect(started?.guidance?.tutorialPresentation).toBeNull();
    if (started === null) throw Error("missing start");
    const legacy = { mode: started.mode, init: started.init, engine: started.engine };
    expect(parseJourneyBattleFoldState(clone(legacy))).toEqual(legacy);
    expect(battleGuidanceOf(legacy)).toBeNull();
  });

  it("keeps cancelled and stale cost attempts out of committed guidance history", () => {
    const initial = host("player", CARDS.choice, [teaching("card-play", CARDS.choice)]), pending = play(initial), prompt = pendingEnginePrompt(pending.battle, engine)?.prompt;
    expect(prompt?.kind).toBe("chooseNumber");
    expect(pending.tutorialTriggerIdsSeen).toEqual([]);
    if (prompt === undefined) throw Error("missing cost prompt");
    const stale = apply(pending, "BATTLE_ANSWER", { side: "player", promptId: "foreign", value: 0 });
    expect(stale.outcome).toBe("bounced");
    const cancelled = apply(pending, "BATTLE_CANCEL", { side: "player", promptId: prompt.id });
    expect(cancelled.outcome).toBe("applied");
    expect(cancelled.state.battle?.engine.slice.committed).toEqual(initial.battle?.engine.slice.committed);
    expect(cancelled.state.tutorialTriggerIdsSeen).toEqual([]);
    const answered = apply(pending, "BATTLE_ANSWER", { side: "player", promptId: prompt.id, value: 0 });
    expect(answered.outcome).toBe("applied");
    expect(answered.state.tutorialTriggerIdsSeen).toEqual([teaching("card-play").id]);
    expect(apply(initial, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: "i999", from: "hand" } }).state).toBe(initial);
  });
});

describe("journey guidance replay, stale input and shared history", () => {
  it("reloads ordered producers, holds both actors until exact completion and resumes the same prompt", () => {
    const next = passUntilGuidance(drawHost([teaching("dreamwell-resolve", WELL), teaching("figment-created")])), battle = current(next), queue = battle.guidance!.checkpoints;
    expect(queue.map(checkpoint => checkpoint.presentation.source.kind)).toEqual(["dreamwell", "figment"]);
    expect(queue[0].producer!.index).toBeLessThan(queue[1].producer!.index);
    expect(queue[0].producer!.seq).toBe(queue[1].producer!.seq);
    const pending = pendingEnginePrompt(battle, engine)!;
    if (pending.prompt.kind !== "chooseCards") throw Error("missing discard prompt");
    const loaded = apply(genesisFoldState(GENESIS), "LOAD_STATE", { snapshot: clone(next.journey), battle: clone(battle) });
    expect(loaded.outcome).toBe("applied");
    expect(JSON.stringify(loaded.state.battle)).toBe(JSON.stringify(battle));
    expect(hashState(loaded.state.battle)).toBe(hashState(battle));
    let held = loaded.state;
    for (const checkpoint of queue) {
      expect(current(held).guidance!.checkpoints[0]).toEqual(checkpoint);
      for (const [type, payload] of [
        ["BATTLE_ACTION", { side: "player", action: { kind: "pass" } }], ["BATTLE_ACTION", { side: "enemy", action: { kind: "pass" } }],
        ["BATTLE_ANSWER", { side: pending.prompt.side, promptId: pending.prompt.id, value: [pending.prompt.candidates[0]] }], ["BATTLE_CANCEL", { side: pending.prompt.side, promptId: pending.prompt.id }],
        ["END_BATTLE", {}], ["TUTORIAL_CARD_ATTEMPT", { battleId: battle.init.battleId, instance: "i1" }],
      ] as const) expect(apply(held, type, payload).state).toBe(held);
      expect(apply(held, "COMPLETE_TUTORIAL_BATTLE_PRESENTATION", { presentationId: "foreign", messageIndex: 0 }).outcome).toBe("bounced");
      expect(apply(held, "COMPLETE_TUTORIAL_BATTLE_PRESENTATION", { presentationId: checkpoint.presentation.id, messageIndex: 1 }).outcome).toBe("bounced");
      const completed = finish(held);
      expect(completed.outcome).toBe("applied");
      expect(completed.state.battle?.engine).toBe(held.battle?.engine);
      expect(apply(completed.state, "COMPLETE_TUTORIAL_BATTLE_PRESENTATION", { presentationId: checkpoint.presentation.id, messageIndex: 0 }).outcome).toBe("bounced");
      held = completed.state;
    }
    expect(current(held).guidance!.checkpoints).toEqual([]);
    expect(pendingEnginePrompt(held.battle, engine)).toEqual(pending);
    expect(apply(held, "BATTLE_ANSWER", { side: "player", promptId: parsePresentationId("stale"), value: [] }).outcome).toBe("bounced");
    const answered = apply(held, "BATTLE_ANSWER", { side: pending.prompt.side, promptId: pending.prompt.id, value: [pending.prompt.candidates[0]] });
    expect(answered.outcome).toBe("applied");
    expect(answered.state.battle?.engine.slice.inFlight).toBeNull();
  });

  it("holds an otherwise legal top-level pass until the exact teaching checkpoint completes", () => {
    const held = play(host("player", CARDS.strong, [teaching("card-play")])), side = engine.decision(held.battle!.engine.slice.committed)?.side;
    if (side === undefined) throw Error("missing top-level decision");
    expect(engine.legalActions(held.battle!.engine.slice.committed, side)).toContainEqual({ kind: "pass" });
    expect(apply(held, "BATTLE_ACTION", { side, action: { kind: "pass" } }).state).toBe(held);
    expect(apply(finish(held).state, "BATTLE_ACTION", { side, action: { kind: "pass" } }).outcome).toBe("applied");
  });

  it("suppresses the same first occurrence across actual room and battle opens in either direction", () => {
    const shared = { ...teaching("card-play"), on: ["card-seen", "card-play"] as const };
    const card = allCards.find(card => card.id === CARDS.strong)!;
    const provider = { triggers: [shared], cardById: (id: typeof card.id) => id === card.id ? { ...card, cardNumber: 1 } : undefined, hasVisibleTransfigurationReward: () => false };
    registerCardTutorialGuidanceContentProvider(provider);
    const firstRoom = room(), opened = openCardTutorialGuidance(firstRoom, { screenKey: currentCardTutorialScreenKey(firstRoom), cardIds: [card.id] });
    expect(opened?.tutorialTriggerIdsSeen).toEqual([shared.id]);
    const initial = host("player", CARDS.strong, [shared]);
    expect(current(play({ ...initial, tutorialTriggerIdsSeen: opened!.tutorialTriggerIdsSeen })).guidance?.tutorialPresentation).toBeNull();
    const battleFirst = play(initial), laterRoom = room(battleFirst.tutorialTriggerIdsSeen);
    expect(openCardTutorialGuidance(laterRoom, { screenKey: currentCardTutorialScreenKey(laterRoom), cardIds: [card.id] })).toBeNull();
  });

  it("replays the actual LocalLog action and exact completion at the same state hash", () => {
    const initial = host("player", CARDS.strong, [teaching("card-play")]);
    const options = { config: GAME_ENGINE_CONFIG, genesis: GENESIS, localActor: testEventActor("journey-log"), now: () => context().timestamp, devMode: false };
    const log = createLocalLog(options), actions = makeActions(draft => Promise.resolve(log.append(draft)));
    const outcomes: string[] = []; log.subscribe(record => outcomes.push(record.outcome));
    void actions.loadState(initial.journey, initial.battle);
    const instance = initial.battle!.engine.slice.committed.sides.player.hand[0];
    void actions.battleAction("player", { kind: "play", card: instance, from: "hand" });
    expect(outcomes).toEqual(["applied", "applied"]);
    const presentation = current(log.state()).guidance!.tutorialPresentation;
    expect(presentation).not.toBeNull();
    const resumed = createLocalLog({ ...options, events: log.events() });
    expect(hashState(resumed.state())).toBe(hashState(log.state()));
    if (presentation === null) throw Error("missing logged guidance");
    void actions.completeTutorialBattlePresentation(presentation.id, parseIntentKey("journey-guidance-complete"), testEventActor("journey-log"), presentation.messageIndex);
    const replayed = createLocalLog({ ...options, events: log.events() });
    expect(hashState(replayed.state())).toBe(hashState(log.state()));
    expect(current(replayed.state()).guidance?.tutorialPresentation).toBeNull();
  });

  it("abandons scheduled enemy work while durable journey guidance holds it", async () => {
    const initial = host("enemy", CARDS.strong, [teaching("card-play")]), held = play(initial), scheduled: (() => void)[] = [], submitted: unknown[] = [];
    const driver = new EngineAiDriver({ side: "enemy", policy: "greedy", engine, host: createInlinePolicyHost(engine), submit: intent => submitted.push(intent), log: () => {}, now: () => 0, schedule: task => scheduled.push(task), budgets: { turnPlanning: { iterations: 2 }, response: { iterations: 2 } } });
    try {
      driver.update(initial);
      await new Promise(resolve => setImmediate(resolve));
      driver.update(initial);
      expect(scheduled.length).toBeGreaterThan(0);
      driver.update(held);
      for (const task of scheduled) task();
      expect(submitted).toEqual([]);
      driver.update(finish(held).state);
      await new Promise(resolve => setImmediate(resolve));
      driver.update(finish(held).state);
    } finally { driver.dispose(); }
  });

  it("rejects malformed or unrenderable own saved checkpoints", () => {
    const battle = current(play(host("player", CARDS.strong, [teaching("card-play")])));
    expect(parseJourneyBattleFoldState({ ...clone(battle) })).toEqual(battle);
    const first = battle.guidance!.checkpoints[0], presentation = battle.guidance!.tutorialPresentation!;
    for (const change of [
      { tutorialPresentation: null }, { tutorialPresentation: { ...presentation, messageIndex: 99 } },
      { checkpoints: [{ ...first, state: {} }] },
      { checkpoints: [{ ...first, presentation: { ...presentation, source: { ...presentation.source, battleCardId: "i999" } } }], tutorialPresentation: { ...presentation, source: { ...presentation.source, battleCardId: "i999" } } },
      { checkpoints: [{ ...first, presentation: { ...presentation, source: { ...presentation.source, cardId: testCardId("foreign-source") } } }], tutorialPresentation: { ...presentation, source: { ...presentation.source, cardId: testCardId("foreign-source") } } },
      { tutorialTriggers: [] }, { checkpoints: [first, first] },
    ]) expect(parseJourneyBattleFoldState(clone({ ...battle, guidance: { ...battle.guidance, ...change } }))).toBeNull();
    const hidden = first.state.sides.player.deck.find(id => first.state.instances[id].printing.kind === "card" && first.state.instances[id].printing.cardId === CARDS.strong);
    if (hidden === undefined) throw Error("missing valid hidden physical fixture");
    expect(engine.view(first.state, "player").instances[hidden]).toBeUndefined();
    const hiddenPresentation = { ...presentation, source: { ...presentation.source, battleCardId: parseBattleCardId(hidden) } };
    const hiddenBattle = { ...battle, guidance: { ...battle.guidance!, checkpoints: [{ ...first, presentation: hiddenPresentation }], tutorialPresentation: hiddenPresentation } };
    expect(parseJourneyBattleFoldState(clone(hiddenBattle))).toBeNull();
    expect(apply(genesisFoldState(GENESIS), "LOAD_STATE", { snapshot: clone(host().journey), battle: clone(hiddenBattle) }).outcome).toBe("bounced");
    const dreamwell = current(passUntilGuidance(drawHost()));
    expect(parseJourneyBattleFoldState(clone({ ...dreamwell, guidance: { ...dreamwell.guidance, dreamwellDeck: [] } }))).toBeNull();
    expect(battle.engine.slice.committed).toEqual(current(play(host("player", CARDS.strong, [teaching("card-play")]))).engine.slice.committed);
  });
});

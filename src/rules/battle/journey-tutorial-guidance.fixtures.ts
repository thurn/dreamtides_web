import { createCatalog, createEngine, type BattleInit, type EngineCardDefinition, type Side } from "../../engine";
import { all, characterYouControl, event as effect } from "../../engine/dsl/builders";
import { createCard, discard, dissolve, gainEnergy, materializeFigments, sequence } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { createBaseBattleDeckCardDefinition } from "../../battle/card-definition";
import { parseCardName, type CardId } from "../../types/card-identity";
import { parseAtlasNodeId, parseJourneyId, parseSiteId, type DreamwellCardId } from "../../types/identifiers";
import { testCardId, testCardSubtype, testDreamscapeId, testEventActor, testJourneySeed, testTutorialTriggerId } from "../../types/test-identities";
import type { CardData } from "../../types/cards";
import type { TutorialTriggerDefinition, TutorialTriggerEvent } from "../../types/tutorial";
import { LayerName } from "../../types/layer-name";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { startEngineBattle } from "./engine-battle";
import { battleGuidanceOf } from "./journey-tutorial-guidance";
import { CARDS, WELL, context, display, init, engine as baseEngine, trigger } from "./tutorial-contracts-fixture";
import type { GameEvent, Genesis } from "../../eventlog/types";

export { CARDS, WELL, context };
export const SUMMON = testCardId("journey-guidance-summon");
export const LATE_SUMMON = testCardId("journey-guidance-late-summon");
export const CREATE_STRONG = testCardId("journey-guidance-create-strong");
export const CREATE_TARGET = testCardId("journey-guidance-create-target");
export const FIGMENT = parseFigmentId("5e5e5e5e-0000-4000-8000-000000033103");
const summon: EngineCardDefinition = { ...baseEngine.catalog.card(CARDS.target), id: SUMMON, abilities: () => [effect(materializeFigments(FIGMENT))] };
const lateSummon: EngineCardDefinition = { ...summon, id: LATE_SUMMON, abilities: () => [effect(sequence(...Array.from({ length: 65 }, () => gainEnergy(1)), materializeFigments(FIGMENT), dissolve(all(characterYouControl()))))] };
const creators: readonly EngineCardDefinition[] = [[CREATE_STRONG, CARDS.strong], [CREATE_TARGET, CARDS.target]].map(([id, created]) => ({ ...baseEngine.catalog.card(CARDS.target), id, abilities: () => [effect(createCard(created))] }));
export const engine = createEngine(createCatalog([...baseEngine.catalog.cardDefinitions, summon, lateSummon, ...creators], [
  { ...baseEngine.catalog.dreamwellCard(WELL), abilities: () => [effect(sequence(materializeFigments(FIGMENT), discard(1)))] },
], {}, [{ id: FIGMENT, subtype: testCardSubtype("fixture"), spark: 1, status: "vanilla", abilities: () => [] }]));
export const GENESIS: Genesis = { seed: testJourneySeed("journey-guidance"), reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
export const allCards: readonly CardData[] = engine.catalog.cardDefinitions.map((card, index) => ({ id: card.id, name: parseCardName(`Synthetic ${index}`), cardNumber: index + 1, cardType: card.cardType === "character" ? "Character" : "Event", subtype: testCardSubtype("fixture"), isStarter: false, energyCost: 0, spark: typeof card.spark === "number" ? card.spark : null, isFast: false, renderedText: "", imageNumber: 1, artOwned: false }));
export function teaching(event: TutorialTriggerEvent, cardId?: CardId | DreamwellCardId): TutorialTriggerDefinition {
  const base = trigger(testTutorialTriggerId(`journey-${event}`), event);
  return cardId === undefined ? base : { ...base, match: { kind: "card-id", cardId } };
}
export function host(side: Side = "player", card = CARDS.strong, triggers: readonly TutorialTriggerDefinition[] = [], extra: Partial<BattleInit> = {}): FoldState {
  const engineInit = init(side, card, extra), fold = startEngineBattle(engineInit, engine, 1);
  if (fold === null) throw Error("synthetic journey init refused");
  const base = room(), metadata = display(triggers), nodeId = parseAtlasNodeId("guidance-node"), node = base.journey.atlas.nodes[nodeId];
  return { ...base, frontDoor: { phase: "journey", journeyId: null, tutorial: null }, journey: { ...base.journey, currentDreamscape: nodeId, screen: { type: "site", siteId: metadata.siteId }, draftState: null,
    atlas: { ...base.journey.atlas, nodes: { [nodeId]: { ...node, sites: [{ id: metadata.siteId, type: "Battle", isVisited: false, isEnhanced: false }] } } } }, battle: {
    mode: { kind: "journey" }, init: { ...metadata, nodeId, cardDefinitions: allCards.map(createBaseBattleDeckCardDefinition) }, engine: fold,
    guidance: { tutorialTriggers: triggers, dreamwellDeck: metadata.dreamwellDeck, checkpoints: [], tutorialPresentation: null },
  } };
}
export function apply(state: FoldState, type: GameEvent["type"], payload: Record<string, unknown>, seq = 10) {
  return reduceGameEvent(state, { type, payload, actor: testEventActor("journey-guidance"), basedOnSeq: 0, clientTimestamp: "1970-01-01T00:00:00.000Z" }, context(seq));
}
export function play(state: FoldState): FoldState {
  if (state.battle === null) throw Error("missing battle");
  const board = state.battle.engine.slice.committed, side = engine.decision(board)?.side;
  const action = side === undefined ? undefined : engine.legalActions(board, side).find(action => action.kind === "play");
  if (side === undefined || action === undefined) throw Error("no legal play");
  const next = apply(state, "BATTLE_ACTION", { side, action });
  if (next.outcome !== "applied") throw Error("play refused");
  return next.state;
}
export function passUntilGuidance(state: FoldState): FoldState {
  for (let seq = 20; seq < 40; seq++) {
    if (battleGuidanceOf(state.battle)?.tutorialPresentation != null) return state;
    if (state.battle === null) throw Error("missing battle");
    const side = engine.decision(state.battle.engine.slice.committed)?.side;
    if (side === undefined) throw Error("no passing decision");
    const next = apply(state, "BATTLE_ACTION", { side, action: { kind: "pass" } }, seq);
    if (next.outcome !== "applied") throw Error("pass refused");
    state = next.state;
  }
  throw Error("synthetic producer did not arrive");
}
/** Resolve the fixture's ordinary creator through public response passes. */
export function passUntilCreatedHand(state: FoldState, cardId: CardId): FoldState {
  for (let seq = 20; seq < 30; seq++) {
    const board = state.battle!.engine.slice.committed;
    if (board.sides.player.hand.some(id => { const printing = board.instances[id].printing; return printing.kind === "card" && printing.cardId === cardId; })) return state;
    const side = engine.decision(board)?.side;
    if (side === undefined) throw Error("missing creator response");
    const next = apply(state, "BATTLE_ACTION", { side, action: { kind: "pass" } }, seq);
    if (next.outcome !== "applied") throw Error("creator response refused");
    state = next.state;
  }
  throw Error("created card did not reach the hand");
}
/** A later Draft offer, beyond first-visit priority, using synthetic UUIDs. */
export function room(seen: FoldState["tutorialTriggerIdsSeen"] = []): FoldState {
  const base = genesisFoldState(GENESIS), nodeId = parseAtlasNodeId("guidance-node"), siteId = parseSiteId("guidance-draft");
  return { ...base, tutorialTriggerIdsSeen: seen, journey: { ...base.journey, runId: parseJourneyId("guidance-run"), hasSeenStartingDeckPopup: true,
    screen: { type: "site", siteId }, draftState: { mode: "tides4", currentOffer: [1], activeSiteId: siteId, pickNumber: 2, sitePicksCompleted: 1, siteShownCardNumbers: [1], draftPoolCopiesByCard: {}, remainingCopiesByCard: {} },
    atlas: { ...base.journey.atlas, nodes: { [nodeId]: { id: nodeId, layer: LayerName.One, indexInLayer: 0, dreamscapeId: testDreamscapeId("guidance-room"), sites: [{ id: siteId, type: "Draft", isEnhanced: false, isVisited: false }], position: { x: 0, y: 0 }, state: "available", enhancedSiteType: null, forwardIds: [], backwardIds: [], knownDreamsignId: null } } },
  } };
}

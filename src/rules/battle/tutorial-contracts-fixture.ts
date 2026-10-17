import { tutorialCheckpointQueue } from "./tutorial-checkpoints";
import { createCatalog, createEngine, type BattleInit, type EngineCardDefinition, type Side } from "../../engine";
import { energy, energyX, event, target, enemyCharacter, characterYouControl, returnCost, additionalCost } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { battleSeed } from "../../engine/state/ids";
import { initialFoldState, type FoldState } from "../fold-state";
import { testCardId, testCardSubtype, testDreamwellCardId, testTutorialAiActionOverrideId, testJourneySeed, testDreamwellCardName, testTutorialRunId } from "../../types/test-identities";
import { parseBattleId, parseSiteId, parseOpponentId } from "../../types/identifiers";
import { startEngineBattle } from "./engine-battle";
import type { TutorialBattleDisplayInit, TutorialBattleFoldState } from "./fold";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import type { EventContext } from "../../eventlog/types";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
export const CARDS = { strong: testCardId("tutorial-contract-strong"), weak: testCardId("tutorial-contract-weak"), choice: testCardId("tutorial-contract-choice"), target: testCardId("tutorial-contract-target"), bounce: testCardId("tutorial-contract-bounce"), blockedCost:testCardId("tutorial-contract-blocked-cost") };
export const WELL = testDreamwellCardId("tutorial-contract-well");
const character = (id: typeof CARDS.strong, spark: number): EngineCardDefinition => ({ id, cardType: "character", costs: [energy(0)], spark, subtype: testCardSubtype("fixture"), speed: "standard", status: "vanilla", abilities: () => [] });
export const engine = createEngine(createCatalog([
    character(CARDS.strong, 4), character(CARDS.weak, 2),
    { ...character(CARDS.choice, 1), costs: [energyX(0)] },
    { id: CARDS.target, cardType: "event", costs: [energy(0)], spark: null, subtype: testCardSubtype("fixture"), speed: "standard", status: "authored", abilities: () => [event(p.gainSpark(target(enemyCharacter()), 1))] },
    { id: CARDS.bounce, cardType: "event", costs: [energy(0)], spark: null, subtype: testCardSubtype("fixture"), speed: "standard", status: "authored", abilities: () => [event(p.returnToHand(target(characterYouControl())))] },
    {id:CARDS.blockedCost,cardType:"event",costs:[energy(0)],spark:null,subtype:testCardSubtype("fixture"),speed:"standard",status:"authored",abilities:()=>[additionalCost(returnCost()), event(p.draw(1))]},
], [{ id: WELL, order: 1, energyAdded: 1, status: "authored", abilities: () => [event(p.gainPoints(2))] }]));
export const RUN = testTutorialRunId("tutorial-contract-run");
export function context(seq = 10): EventContext { return { contentConfig: TEST_CONTENT_CONFIG, seq, rng: () => 0, timestamp: "1970-01-01T00:00:00.000Z" }; }
export function display(triggers: readonly TutorialTriggerDefinition[] = []): TutorialBattleDisplayInit {
    return { battleId: parseBattleId("tutorial-contract-battle"), siteId: parseSiteId("tutorial-contract-site"), nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false, avatarSummary: null, enemyDescriptor: { id: parseOpponentId("tutorial-contract-opponent"), name: "Fixture", subtitle: "", imageNumber: "1", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, cardDefinitions: [], dreamwellDeck: [{ id: WELL, name: testDreamwellCardName("Fixture"), renderedText: "", energyAdded: 1, order: 1, cardNumber: 1, imageNumber: 1 }], tutorialTriggers: triggers };
}
export function init(side: Side = "enemy", card = CARDS.choice, extra: Partial<BattleInit> = {}): BattleInit {
    const other = side === "player" ? "enemy" : "player";
    return { seed: battleSeed("tutorial-contract-seed"), scoreToWin: 10, startingSide: side, decks: { player: [{ cardId: CARDS.strong }, { cardId: CARDS.target }], enemy: [{ cardId: CARDS.weak }], [side]: [{ cardId: card }, { cardId: CARDS.strong }, { cardId: CARDS.target }] }, dreamwell: [WELL], turnLimit: null, victorySides: ["player"], setup: { placements: [{ side, deckIndex: 0, zone: "hand" }], sides: { player: { currentEnergy: 5, maxEnergy: 5, score: 0 }, enemy: { currentEnergy: 5, maxEnergy: 5, score: 0 } }, turn: { active: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { [side]: 1, [other]: 0 } as Record<Side, number>, lastNormal: side }, dreamwell: { deck: [WELL], next: 0 } }, ...extra };
}
export function trigger(id: TutorialTriggerDefinition["id"], eventName: TutorialTriggerDefinition["on"][number], priority = 0): TutorialTriggerDefinition { return { id, on: [eventName], priority, match: eventName === "card-play" ? { kind: "card-id", cardId: CARDS.strong } : eventName === "card-no-valid-targets" ? { kind: "card-id", cardId: CARDS.target } : { kind: "any" }, speaker: "mira", text: "synthetic", duration: 1, delay: { [eventName]: 0.5 }, horizontalOffset: 0, verticalOffset: 0, bubbleWidth: 400 }; }
export function root(): FoldState { return initialFoldState(testJourneySeed("tutorial-contract"), { defaultStartingEssence: 0, dreamsignCap: 3 }, "tutorial"); }
export function host(side: Side = "enemy", card = CARDS.choice, triggers: readonly TutorialTriggerDefinition[] = [], extra: Partial<BattleInit> = {}): FoldState {
    const engineInit = init(side, card, extra), fold = startEngineBattle(engineInit, engine, 1);
    if (fold === null)
        throw Error("synthetic init refused");
    const battle: TutorialBattleFoldState = { mode: { kind: "tutorial", tutorialRunId: RUN, restartNumber: 0 }, init: display(triggers), engine: fold, ...tutorialCheckpointQueue([]), overrides: { definitions: [{ id: testTutorialAiActionOverrideId("tutorial-contract-override"), trigger: { kind: "after-dreamwell", side, cardId: WELL }, action: { kind: "play-card", cardId: card } }], consumed: [], dreamwell: { side, cardId: WELL, turnNumber: 1 } }, pendingOverride: null, overrideCommits: [] };
    return { ...root(), battle };
}
import { testTutorialActionId } from "../../types/test-identities";
import type { TutorialAction } from "../../types/tutorial";
const id = testTutorialActionId;
export const prefixActions: readonly TutorialAction[] = [
    { id: id("initial-reveal"), action: "draw-opponent-card", cardId: CARDS.weak, wait: 0 },
    { id: id("initial-play"), action: "reveal-and-play-opponent-card", cardId: CARDS.weak, wait: 0, revealDuration: 1 },
    { id: id("end"), action: "end-turn", wait: 0 },
    { id: id("well"), action: "draw-dreamwell-card", owner: "enemy", cardId: WELL, wait: 0 },
    { id: id("second-reveal"), action: "draw-opponent-card", cardId: CARDS.strong, wait: 0 },
    { id: id("second-play"), action: "reveal-and-play-opponent-card", cardId: CARDS.strong, wait: 0, revealDuration: 1 },
    { id: id("move-enemy"), action: "reposition-opponent-character", cardId: CARDS.weak, wait: 0 },
    { id: id("move-player"), action: "reposition-player-character", cardId: CARDS.strong, opposingCardId: CARDS.weak, wait: 0 },
    { id: id("challenge"), action: "resolve-challenge", challengerCardId: CARDS.weak, blockerCardId: CARDS.strong, wait: 0 },
];
export function prefixSetup() {
    return { init: display(), engineInit: init("enemy", CARDS.weak, { decks: { player: Array.from({ length: 6 }, () => ({ cardId: CARDS.strong })), enemy: [{ cardId: CARDS.weak }, ...Array.from({ length: 5 }, () => ({ cardId: CARDS.strong }))] } }) };
}

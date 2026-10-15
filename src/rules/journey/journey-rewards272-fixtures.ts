import { registerTutorialFrontDoorContentProvider } from "../front-door";
import { registerTutorialBattleInitProvider } from "../battle/tutorial-lifecycle";
import { engine as tutorialEngine, CARDS as TUTORIAL_CARDS, prefixSetup, prefixActions, init as tutorialInit, display as tutorialDisplay } from "../battle/tutorial-contracts-fixture";
import { testAvatarId } from "../../types/test-identities";
import { parseBattleId } from "../../types/identifiers";
import type { EngineCardDefinition } from "../../engine/catalog";
import { createEngine } from "../../engine";
import { all, anyCharacter, enemyCharacter, event as ability, self, target } from "../../engine/dsl/builders";
import { onDawn, triggered, whenDissolvesEnemyInChallenge } from "../../engine/dsl/triggers";
import * as effects from "../../engine/effects/primitives";
import { syntheticId, SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { battleSeed } from "../../engine/state/ids";
import { testDreamsignId, testCardId } from "../../types/test-identities";
import { parseCardSubtype } from "../../types/card-identity";
import { parseDeckEntryId, type DreamsignId } from "../../types/identifiers";
import type { DeckEntry, JourneyState } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { genesisFoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import type { GameEventType } from "../events";
import type { EventContext } from "../../eventlog/types";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyEssence } from "./journey-essence";
import { journeyOnGain } from "./journey-on-gain";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerDeckContentProvider } from "./deck";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { beginBattle as oldBattle, clear, sign } from "./journey-on-gain-fixtures";
import { fixtureBattleInitProvider } from "../replay/fixture-providers";
import { registerBattleInitProvider } from "../battle/journey-battle";
export { clear, sign, ctx, event, GENESIS };
export const BONE = testDreamsignId("rewards272-bone"), SKULL = testDreamsignId("rewards272-skull"), TEETH = testDreamsignId("rewards272-teeth"), JELLY = testDreamsignId("rewards272-jelly"), FRUIT = testDreamsignId("rewards272-fruit"), TOME = testDreamsignId("rewards272-tome");
export const registry = createJourneyModifierRegistry([
  journeyEssence(BONE, { kind: "enemyRemovalOutsideChallengeEssence", amount: 7 }), journeyEssence(SKULL, { kind: "challengeDissolveEssence", amount: 11 }),
  journeyEssence(FRUIT, { kind: "purgedCardEssence", amount: 3 }), journeyOnGain(TEETH, { kind: "purgeStarterOnGain", maxCount: 4 }),
  journeyOnGain(JELLY, { kind: "perfectStarterOnGain", transfiguration: "Perfected" }), journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
]);
export const entry = (n: number, cardNumber = n): DeckEntry => ({ entryId: parseDeckEntryId(`rewards272-entry-${n}`), cardNumber, isBane: false, transfiguration: null });
export function installStarter() {
  registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
  registerJourneyTransfigurationProvider({ resolve: (e) => ({ cardId: testCardId(`rewards272-card-${e.cardNumber}`), cardType: e.typeChange?.cardType ?? "Event", subtype: parseCardSubtype(""), forms: ["Inspired"], starter: e.cardNumber !== 9, perfectedEligible: e.cardNumber !== 8 }) });
  registerSiteContentProvider(testSiteContentProvider());
}
export function initial(held: readonly DreamsignId[] = [], deck = [entry(1), entry(2), entry(3), entry(4), entry(5), entry(9)]): FoldState {
  installStarter(); const state = genesisFoldState(GENESIS);
  return { ...state, journey: { ...state.journey, essence: 100, dreamsigns: held.map(sign), deck } };
}
export function apply(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}) {
  return reduceGameEvent(state, event(type, payload), ctx(context), registry);
}
export function accepted(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}) {
  const result = apply(state, type, payload, context); if (result.outcome !== "applied") throw new Error(`Unexpected ${type} bounce: ${result.bounceReason}`); return result.state;
}
export function purgePayload(journey: JourneyState, entryIds: readonly unknown[] = []) {
  if (journey.screen.type !== "journeyStarterPurge") throw new Error("Missing starter choice");
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  return { dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq, entryIds };
}
export function battleWorld(options: { held?: readonly DreamsignId[]; effect?: import("../../engine/effects/registry").Effect; challenge?: boolean; cascade?: boolean; openingRemoval?: boolean; fail?: boolean; discard?: boolean } = {}) {
  const spell: EngineCardDefinition = { ...v.event0, id: syntheticId(0x272001), status: "authored", abilities: () => [ability(options.fail ? effects.sequence(effects.dissolve(target(anyCharacter())), effects.gainAdditionalSpark(self(), 1)) : options.discard ? effects.sequence(effects.dissolve(target(anyCharacter())), effects.discard(1)) : options.effect ?? effects.dissolve(target(anyCharacter())))] };
  const signs = options.held ?? [BONE, SKULL];
  const engine = createEngine(testCatalog([spell], { dreamsigns: [...new Set(signs)].map((id) => ({ id, status: "authored", abilities: () => id === SKULL ? options.openingRemoval ? [triggered(onDawn(), effects.dissolve(all(enemyCharacter())))] : options.cascade ? [triggered(whenDissolvesEnemyInChallenge(), effects.dissolve(all(enemyCharacter())))] : [] : [] })) }));
  const baseProvider = fixtureBattleInitProvider();
  const state = oldBattle(signs, () => registerBattleInitProvider({ engine, beginBattle(input) {
    const base = baseProvider.beginBattle(input); if (base === null) return null;
    return { init: base.init, engineInit: { seed: battleSeed("rewards272"), scoreToWin: 999, startingSide: "player", dreamwell: [],
      decks: { player: [{ cardId: spell.id }, ...Array.from({ length: 12 }, () => ({ cardId: v.vanilla3.id }))], enemy: Array.from({ length: 12 }, () => ({ cardId: v.vanilla2.id })) },
      dreamsigns: { player: signs }, setup: { placements: [
        { side: "player", deckIndex: 0, zone: "hand" }, { side: "player", deckIndex: 1, zone: "hand" }, { side: "player", deckIndex: 2, zone: "hand" },
        ...(options.challenge ? [{ side: "player" as const, deckIndex: 3, zone: "play" as const, slot: { rank: "front" as const, index: 0 } }] : []),
        ...(options.cascade ? [{ side: "enemy" as const, deckIndex: 1, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }] : []),
        { side: "enemy", deckIndex: 0, zone: "play", slot: { rank: options.challenge ? "front" : "back", index: 0 } }],
        sides: { player: { currentEnergy: 20, maxEnergy: 20, score: 0 }, enemy: { currentEnergy: 20, maxEnergy: 20, score: 0 } },
        turn: { active: "player", phase: options.openingRemoval ? "dawn" : "day", round: 2, turnNumber: 3, sideTurns: { player: 2, enemy: 1 }, lastNormal: "player" }, dreamwell: { deck: [], next: 0 } } } };
  } }));
  return { state, engine, spell };
}

/** Real public tutorial prefix and handoff, with the synthetic starter catalog. */
export function tutorialBattle(): FoldState {
  initial();
  registerBattleInitProvider({ engine: tutorialEngine, beginBattle: () => null });
  registerTutorialFrontDoorContentProvider({ playerCardId: TUTORIAL_CARDS.strong, journeyAvatarId: testAvatarId("rewards272-tutorial-avatar") });
  registerTutorialBattleInitProvider({ engine: tutorialEngine, overrides: [], beginTutorialPrefix: () => prefixSetup(), beginTutorialBattle: (input) => ({ init: { ...tutorialDisplay(), battleId: parseBattleId(`rewards272-tutorial:${input.tutorialRunId}`) }, engineInit: tutorialInit("player", TUTORIAL_CARDS.strong) }) });
  const started = accepted(genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" }), "BEGIN_TUTORIAL", { actions: prefixActions, startAtEnd: true }, { seq: 1 });
  return accepted(started, "BEGIN_TUTORIAL_BATTLE", { tutorialRunId: started.frontDoor.tutorial!.runId }, { seq: 2 });
}

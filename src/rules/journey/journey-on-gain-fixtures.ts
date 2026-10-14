import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GENESIS, ctx, event } from "./lifecycle-fixtures";
import { parseDeckEntryId, type DreamsignId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testJourneySeed } from "../../types/test-identities";
import { registerDeckContentProvider } from "./deck";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyOnGain } from "./journey-on-gain";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyPurge } from "./journey-purge";
import { journeyTransfiguration } from "./journey-transfiguration";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { registerSiteContentProvider } from "./sites";
import type { DreamsignTemplate } from "../../types/content";
import { parseCardSubtype } from "../../types/card-identity";
import type { Dreamsign } from "../../types/journey";
import type { GameEventType } from "../events";
import type { EventContext } from "../../eventlog/types";
import * as replay from "../replay/fixture-providers";
import { clearGameProviders } from "../../session/providers/register-game-providers";
export const RAVEN = testDreamsignId("gain-raven");
export const RAT = testDreamsignId("gain-rat");
export const DOLL = testDreamsignId("gain-doll");
export const RED = testDreamsignId("gain-red");
export const SLUG = testDreamsignId("gain-slug"), SLIME = testDreamsignId("gain-slime"), TOME = testDreamsignId("gain-tome");
export const registry = createJourneyModifierRegistry([journeyDeckEntry(RAVEN, { kind: "preventNightmare" }), journeyOnGain(RAT, { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 2 }), journeyOnGain(DOLL, { kind: "copyOwnedDreamsignOnGain" }), journeyOnGain(RED, { kind: "afterBattleDreamsignChoice", offerCount: 3 }), journeyPurge(SLUG, { kind: "afterBattlePurge", maxCount: 2 }), journeyTransfiguration(SLIME, { kind: "afterBattleTransfiguration", maxCount: 3 }), journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" })]);
export const sign = (id: DreamsignId): Dreamsign => ({ id, name: "Synthetic", effectDescription: "" });
export const templates = [RAT, DOLL, RED, SLUG, SLIME, TOME, RAVEN].map((id): DreamsignTemplate => ({ id, name: "Synthetic", effectDescription: "Synthetic", imageName: "synthetic.png" }));
export function installGainContent() {
  registerSiteContentProvider(createSiteContentProvider(makeAuguryTestContent({ cards: [makeAuguryTestCard({ id: testCardId("gain-event"), cardNumber: 1, cardType: "Event" })], dreamsignTemplates: templates })));
  registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
  registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: testCardId(`gain-card-${entry.cardNumber}`), cardType: "Event", subtype: parseCardSubtype(""), forms: entry.transfiguration === null ? ["Enduring"] : [] }) });
}
export function initial(held: readonly DreamsignId[] = []): FoldState {
  installGainContent(); const state = genesisFoldState(GENESIS);
  return { ...state, journey: { ...state.journey, dreamsigns: held.map(sign), deck: [1, 2, 3, 4, 5].map((n) => ({ entryId: parseDeckEntryId(`gain-entry-${n}`), cardNumber: n, isBane: false, transfiguration: null })) } };
}
export function apply(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}) {
  return reduceGameEvent(state, event(type, payload), { ...ctx(), ...context }, registry);
}
export function beginBattle(held: readonly DreamsignId[], configure?: () => void) {
  replay.registerReplayFixtureProviders(); installGainContent(); configure?.();
  let state = genesisFoldState({ ...GENESIS, seed: testJourneySeed("fixture-battle") });
  for (const [type, payload] of [["START_JOURNEY", { avatarId: replay.AVATAR_ID }], ...held.map((dreamsignId) => ["ADD_DREAMSIGN", { dreamsignId }]), ["ENTER_SITE", { siteId: replay.BATTLE_SITE_ID }], ["BEGIN_BATTLE", { siteId: replay.BATTLE_SITE_ID }]] as [GameEventType, Record<string, unknown>][]) {
    const result = apply(state, type, payload); if (result.outcome !== "applied") throw new Error(`Synthetic ${type} failed`); state = result.state;
  }
  return state;
}
export function clear() { clearGameProviders(); replay.clearReplayFixtureProviders(); }

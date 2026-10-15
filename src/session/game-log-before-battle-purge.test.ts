import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../eventlog/local-log";
import { parseClientId, parseGameId } from "../types/identifiers";
import { testCardId, testDreamsignId, testEventActor } from "../types/test-identities";
import { getLogEntries, resetLog } from "../logging";
import { clearReplayFixtureProviders } from "../rules/replay/fixture-providers";
import { registerBattleInitProvider } from "../rules/battle/journey-battle";
import { initial, pending, payload, registry, config, SOURCE, SITE_ID } from "../rules/journey/journey-before-battle-purge-fixtures";
import { createJourneyModifierRegistry, type JourneyModifierRegistry } from "../rules/journey/modifier-registry";
import { journeyPurge } from "../rules/journey/journey-purge";
import { makeSite, stateWithSites } from "../rules/journey/sites-fixtures";
import { GENESIS } from "../rules/journey/lifecycle-fixtures";
import { makeJourneyContent } from "./providers/register-game-providers.fixtures";
import { createBattleInitProvider, settleDeferredOpponentLog } from "./providers/battle-init-provider";
import { attachGameLog } from "./game-log";
import type { FoldState } from "../rules/fold-state";

beforeEach(() => resetLog());
afterEach(() => { clearReplayFixtureProviders(); resetLog(); });
function world() {
  const content = makeJourneyContent();
  content.dreamsignTemplates = [...content.dreamsignTemplates, { ...content.dreamsignTemplates[0], id: SOURCE }];
  const s = initial(); s.journey.deck = s.journey.deck.map((entry) => ({ ...entry, cardNumber: [...content.cardDatabase.keys()][0] }));
  const base = createBattleInitProvider(content); registerBattleInitProvider(base);
  const p = pending(s);
  return { base, p };
}
function attached(state: FoldState, mods: JourneyModifierRegistry = registry()) {
  const genesis = { ...GENESIS, seed: state.journey.seed };
  const log = createLocalLog({ config: config(state, mods), genesis, localActor: testEventActor("alice"), base: { seq: 10, state, intentKeys: [] }, devMode: false });
  const detach = attachGameLog({ gameId: parseGameId("before729-host"), localPlayerId: parseClientId("alice"), genesis, log, opened: { checkpointSeq: 10, checkpointRejected: false, replayedEvents: 0, replayFoldErrors: 0 }, flush: async () => {}, close: async () => {} }, { mirror: () => {} });
  return { log, detach };
}
const opponentLogs = () => getLogEntries().filter((entry) => entry.event === "opponent_signature_cards_selected");
describe("before-battle deferred production provider logging", () => {
  it("leaves an unrelated Essence purge outside the before-battle callback branch", () => {
    const { base, p } = world(), SICKLE = testDreamsignId("before729-host-essence");
    base.beginBattle({ journey: { ...p.journey, screen: { type: "site", siteId: SITE_ID } }, siteId: SITE_ID, seedOverride: null, seq: 10, rng: () => 0, timestamp: "1970-01-01T00:00:00.000Z" });
    const mods = createJourneyModifierRegistry([journeyPurge(SICKLE, { kind: "replaceEssenceWithPurge", count: 2 })]);
    const s = stateWithSites([makeSite("Essence")], { deck: p.journey.deck, siteRuntime: { [SITE_ID]: { kind: "essence", amount: 9, accepted: false } }, screen: { type: "journeyPurge", choice: { kind: "essenceSite", siteId: SITE_ID, dreamsignId: SICKLE, heldIndex: 0, count: 2 } } });
    const { log, detach } = attached(s, mods);
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: { siteId: SITE_ID, dreamsignId: SICKLE, heldIndex: 0, choiceIndex: 0, entryIds: s.journey.deck.slice(0, 2).map((e) => e.entryId) } });
    expect(log.state().journey.deck).toHaveLength(2); expect(opponentLogs()).toHaveLength(0);
    expect(settleDeferredOpponentLog(10, false)).toBe(true); detach();
  });
  it("preserves ordinary BEGIN callback settlement at its actual event key", () => {
    const { base } = world(), s = initial([]);
    const content = makeJourneyContent(); s.journey.deck = s.journey.deck.map((entry) => ({ ...entry, cardNumber: [...content.cardDatabase.keys()][0] }));
    registerBattleInitProvider(base); const { log, detach } = attached(s);
    log.append({ type: "BEGIN_BATTLE", payload: { siteId: SITE_ID } });
    expect(log.state().battle).not.toBeNull(); expect(opponentLogs()).toHaveLength(1);
    expect(settleDeferredOpponentLog(11, true)).toBe(false); detach();
  });

  it("settles the original earning key only on the actual successful resolution, once", () => {
    const { p } = world(), { log, detach } = attached(p);
    expect(opponentLogs()).toHaveLength(0);
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(p, [p.journey.deck[0].entryId]) });
    expect(log.state().battle).not.toBeNull(); expect(opponentLogs()).toHaveLength(1);
    expect(settleDeferredOpponentLog(10, true)).toBe(false);
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(p) }); expect(opponentLogs()).toHaveLength(1);
    detach();
  });
  it.each(["decline", "throw", "engine", "bounce"])("drops the original callback on %s and retries without stale emission", (failure) => {
    const { base, p } = world(); let failing = true;
    registerBattleInitProvider({ ...base, beginBattle(input) {
      const start = base.beginBattle(input);
      if (!failing) return start;
      if (failure === "throw") throw new Error("synthetic provider failure after deferred log");
      if (failure === "decline") return null;
      if (failure === "engine" && start !== null) return { ...start, engineInit: { ...start.engineInit, decks: { ...start.engineInit.decks, player: [{ cardId: testCardId("before729-unknown-engine-card") }] } } };
      return start;
    } });
    if (failure === "bounce") base.beginBattle({ journey: { ...p.journey, screen: { type: "site", siteId: SITE_ID } }, siteId: SITE_ID, seedOverride: null, seq: 10, rng: () => 0, timestamp: "1970-01-01T00:00:00.000Z" });
    const { log, detach } = attached(p);
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: { ...payload(p), ...(failure === "bounce" ? { heldIndex: 99 } : {}) } });
    expect(log.state()).toBe(p); expect(opponentLogs()).toHaveLength(0); expect(settleDeferredOpponentLog(10, true)).toBe(false);
    failing = false; log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(p) });
    expect(log.state().battle).not.toBeNull(); expect(opponentLogs()).toHaveLength(1);
    detach();
  });
});

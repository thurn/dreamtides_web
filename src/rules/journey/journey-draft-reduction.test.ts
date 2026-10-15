import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, Genesis } from "../../eventlog/types";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { parseSiteId, type DreamsignId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testEventActor } from "../../types/test-identities";
import type { JourneyState } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerDeckContentProvider } from "./deck";
import { registerDraftContentProvider } from "./draft";
import { ctx, poolDraftState, stateWithDraftSites } from "./draft-fixtures";
import { journeyDraft } from "./journey-draft";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { testDraftContentProvider } from "./test-content-providers";

const LESS = testDreamsignId("fewer-choice"), MORE = testDreamsignId("more-choice"), CONDITIONAL = testDreamsignId("conditional-choice");
const SITE = parseSiteId("site-a"), ACTOR = testEventActor("reduced-draft");
const sign = (id: DreamsignId) => ({ id, name: "Same synthetic name", effectDescription: "" });
const cards = Array.from({ length: 40 }, (_, i) => makeAuguryTestCard({ id: testCardId(`reduced-${i}`), cardNumber: i + 1 }));
const database = new Map(cards.map((card) => [card.cardNumber, card]));
const copies = Object.fromEntries(cards.map((card) => [String(card.cardNumber), 1]));
const config = { packSize: 4, sitePickCount: 3, rarityCaps: [] };
function registry() {
  return createJourneyModifierRegistry([
    journeyDraft(LESS, { kind: "fewerDraftChoices", fewerCards: 2 }),
    journeyDraft(MORE, { kind: "additionalDraftChoices", additionalCards: 3 }),
    journeyDraft(CONDITIONAL, { kind: "additionalDraftChoices", additionalCards: 2, minimumEssence: 7 }),
  ]);
}
function fixture(ids: readonly DreamsignId[] = [LESS], essence = 0, extra: Partial<JourneyState> = {}) {
  return stateWithDraftSites(poolDraftState({ activeSiteId: null, currentOffer: [], siteShownCardNumbers: [],
    draftPoolCopiesByCard: copies, remainingCopiesByCard: copies }), { dreamsigns: ids.map(sign), essence,
    screen: { type: "site", siteId: SITE }, ...extra });
}
function apply(state: FoldState, type: Parameters<typeof reduceGameEvent>[1]["type"], payload: Record<string, unknown> = {}, modifiers = registry(), context = ctx()) {
  return reduceGameEvent(state, { type, payload, actor: ACTOR, basedOnSeq: 0, clientTimestamp: context.timestamp }, context, modifiers);
}
function pick(state: FoldState) {
  const draft = state.journey.draftState!, card = database.get(draft.currentOffer[0])!;
  return apply(state, "PICK_DRAFT_CARD", { packIndex: 0, cardId: card.id });
}
beforeEach(() => {
  registerDraftContentProvider(testDraftContentProvider({ resolveCardNumber: (id) => cards.find((card) => card.id === id)?.cardNumber ?? null,
    cardDatabase: () => database, draftConfigFor: () => config }));
  registerDeckContentProvider({ resolveCardNumber: (id) => cards.find((card) => card.id === id)?.cardNumber ?? null, resolveDreamsign: sign });
});
afterEach(clearGameProviders);

describe("reduced Draft choices through public folds", () => {
  it.each([
    { held: [LESS], essence: 0, count: 2 },
    { held: [LESS, LESS], essence: 0, count: 1 },
    { held: [LESS, LESS, LESS], essence: 0, count: 1 },
    { held: [LESS, MORE, LESS], essence: 0, count: 3 },
    { held: [MORE, LESS, LESS], essence: 0, count: 3 },
    { held: [LESS, CONDITIONAL], essence: 6, count: 2 },
    { held: [CONDITIONAL, LESS], essence: 7, count: 4 },
  ])("combines signed contributions before one minimum (%j)", ({ held, essence, count }) => {
    const before = fixture(held, essence), saved = structuredClone(before);
    const result = apply(before, "ENTER_DRAFT_SITE", { siteId: SITE });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState?.currentOfferCount).toBe(count);
    expect(result.state.journey.draftState?.currentOffer).toHaveLength(count);
    expect(new Set(result.state.journey.draftState?.currentOffer).size).toBe(count);
    expect(before).toEqual(saved);
    const rows = result.logRecords ?? [];
    expect(rows.map((row) => row.fields.heldIndex)).toEqual(held.flatMap((id, i) => id === CONDITIONAL && essence < 7 ? [] : [i]));
    expect(rows.every((row) => !JSON.stringify(row).includes("Same synthetic name"))).toBe(true);
    expect(rows.every((row) => row.fields.after && (row.fields.after as Record<string, number>).quotedCount === count)).toBe(true);
  });

  it("preserves prepared quotes through source edits and reload, then quotes each actual next offer", () => {
    const entered = apply(fixture(), "ENTER_DRAFT_SITE", { siteId: SITE }).state;
    const old = structuredClone(entered.journey.draftState);
    const gained = apply(entered, "ADD_DREAMSIGN", { dreamsignId: LESS }).state;
    expect(gained.journey.draftState).toEqual(old);
    const loaded = apply(gained, "LOAD_STATE", { snapshot: structuredClone(gained.journey) });
    expect(loaded.outcome).toBe("applied"); expect(loaded.state.journey.draftState).toEqual(old);
    const next = pick(loaded.state);
    expect(next.state.journey.draftState?.currentOfferCount).toBe(1);
    const lost = apply(next.state, "REMOVE_DREAMSIGN", { dreamsignId: LESS }).state;
    expect(lost.journey.draftState).toEqual(next.state.journey.draftState);
    const reroll = apply(lost, "REROLL_DRAFT_OFFER", { siteId: SITE });
    expect(reroll.state.journey.draftState?.currentOfferCount).toBe(1);
    const third = pick(reroll.state);
    expect(third.state.journey.draftState?.currentOfferCount).toBe(2);
    const final = pick(third.state);
    expect(final.outcome).toBe("applied"); expect(final.state.journey.draftState?.currentOffer).toEqual([]);
    expect(final.logRecords).toBeUndefined();
  });

  it("allows cancellation of unsafe prefixes and reports only safe source/final values", () => {
    const up = testDreamsignId("large-up"), down = testDreamsignId("large-down"), one = testDreamsignId("one-up"), minusOne = testDreamsignId("one-down");
    const definitions = [journeyDraft(up, { kind: "additionalDraftChoices", additionalCards: Number.MAX_SAFE_INTEGER }),
      journeyDraft(down, { kind: "fewerDraftChoices", fewerCards: Number.MAX_SAFE_INTEGER }),
      journeyDraft(one, { kind: "additionalDraftChoices", additionalCards: 1 }), journeyDraft(minusOne, { kind: "fewerDraftChoices", fewerCards: 1 })];
    const modifiers = createJourneyModifierRegistry(definitions);
    for (const held of [[up, one, down, minusOne], [minusOne, down, one, up]]) {
      const result = apply(fixture(held), "ENTER_DRAFT_SITE", { siteId: SITE }, modifiers);
      expect(result.outcome).toBe("applied"); expect(result.state.journey.draftState?.currentOfferCount).toBe(config.packSize);
      expect(result.logRecords).toHaveLength(4);
      for (const row of result.logRecords ?? []) {
        expect(row.fields.after).toMatchObject({ totalAdjustment: 0, quotedCount: config.packSize });
        expect(Object.values(row.fields.after as Record<string, number>).every(Number.isSafeInteger)).toBe(true);
      }
    }
    for (const held of [[up], [down, down]]) {
      const before = fixture(held), saved = structuredClone(before);
      const engine: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before,
        reducer: (state, event, context) => reduceGameEvent(state, event, context, modifiers) };
      const genesis: Genesis = { seed: before.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
      const log = createLocalLog({ config: engine, genesis, localActor: ACTOR, now: () => ctx().timestamp, devMode: false });
      log.append({ type: "ENTER_DRAFT_SITE", payload: { siteId: SITE } });
      expect(log.state()).toBe(before); expect(before).toEqual(saved);
      expect(foldEvents(engine, genesis, { seq: 0, state: before }, [...log.events()], { devMode: false }).state).toEqual(before);
    }
  });

  it("atomically refuses unavailable choices and stale picks without consuming a minimum offer", () => {
    const empty = fixture([LESS, LESS], 0, { draftState: poolDraftState({ activeSiteId: null, currentOffer: [], siteShownCardNumbers: [], draftPoolCopiesByCard: {}, remainingCopiesByCard: {} }) });
    const refused = apply(empty, "ENTER_DRAFT_SITE", { siteId: SITE });
    expect(refused.outcome).toBe("bounced"); expect(refused.state).toBe(empty); expect(refused.logRecords).toBeUndefined();
    const entered = apply(fixture([LESS, LESS]), "ENTER_DRAFT_SITE", { siteId: SITE }).state;
    const stale = apply(entered, "PICK_DRAFT_CARD", { packIndex: 4, cardId: cards[0].id });
    expect(stale.state).toBe(entered); expect(stale.logRecords).toBeUndefined();
    expect(apply(entered, "PICK_DRAFT_CARD", { packIndex: 0, cardId: database.get(entered.journey.draftState!.currentOffer[0])!.id }, registry(), ctx({ intervening: "unknown" })).outcome).toBe("bounced");
  });

  it("replays actual minimum offers and physical source diagnostics deterministically", () => {
    const before = fixture([LESS, LESS, MORE]), modifiers = registry();
    const engine: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before,
      reducer: (state, event, context) => reduceGameEvent(state, event, context, modifiers) };
    const genesis: Genesis = { seed: before.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
    const log = createLocalLog({ config: engine, genesis, localActor: ACTOR, now: () => ctx().timestamp });
    log.append({ type: "ENTER_DRAFT_SITE", payload: { siteId: SITE } });
    const number = log.state().journey.draftState!.currentOffer[0];
    log.append({ type: "PICK_DRAFT_CARD", payload: { packIndex: 0, cardId: database.get(number)!.id } });
    expect(foldEvents(engine, genesis, { seq: 0, state: before }, [...log.events()]).state).toEqual(log.state());
    expect(before.journey.draftState?.currentOffer).toEqual([]);
  });

  it("rejects invalid decrement catalog values", () => {
    for (const fewerCards of [0, -1, .5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => journeyDraft(LESS, { kind: "fewerDraftChoices", fewerCards })).toThrow(RangeError);
    }
  });
});

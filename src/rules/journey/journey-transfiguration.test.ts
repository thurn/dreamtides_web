import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDeckEntryId, parseCardTypeChangePredicateId } from "../../types/identifiers";
import { cardSubtypeFromUnknown } from "../../types/card-identity";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig } from "../../eventlog/types";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import type { FoldState } from "../fold-state";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { reduceGameEvent } from "../reducer";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { accepted, apply, card, installProviders, LEAF, registry, runtime, SITE_ID, siteState, TOME } from "./transfiguration-fixtures";
const open = { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION };
const select = (entryToken: string) => ({ siteId: SITE_ID, entryId: parseDeckEntryId(entryToken) });
beforeEach(installProviders);
afterEach(clearGameProviders);

describe("journeyTransfiguration public folded contracts", () => {
  it.each([false, true])("retains the same prepared two-card quote after first choice and restores it after reload, enhanced=%s", (enhanced) => {
    const initial = siteState([LEAF], enhanced), before = accepted(initial, "OPEN_SITE", open);
    const offers = before.journey.siteRuntime[SITE_ID];
    const first = accepted(before, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1"));
    expect(first.journey.screen).toEqual(before.journey.screen);
    expect(first.journey.essence).toBe(23);
    expect(first.journey.siteRuntime[SITE_ID]).toMatchObject({ acceptedEntryIds: ["entry-1"] });
    expect(first.journey.siteRuntime[SITE_ID]).toMatchObject({ transfigurationOffers: (offers as ReturnType<typeof runtime> & { transfigurationOffers: unknown }).transfigurationOffers });
    const restored = accepted(first, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(first.journey)) });
    const second = accepted(restored, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-2"));
    expect(second.journey.screen.type).toBe("dreamscape"); expect(second.journey.essence).toBe(16);
    expect(second.journey.siteRuntime[SITE_ID]).toMatchObject({ acceptedEntryIds: ["entry-1", "entry-2"] });
    expect(initial.journey.deck.every((entry) => entry.transfiguration === null)).toBe(true);
  });
  it("keeps the prepared replacement count through source loss; gaining it later does not change ordinary allowance", () => {
    let s = accepted(siteState([LEAF, LEAF]), "OPEN_SITE", open);
    s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: LEAF }); s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: LEAF });
    s = accepted(s, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1")); expect(s.journey.screen.type).toBe("site");
    s = accepted(s, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-2")); expect(s.journey.screen.type).toBe("dreamscape");
    const ordinary = accepted(siteState(), "OPEN_SITE", open);
    const gained = accepted(ordinary, "ADD_DREAMSIGN", { dreamsignId: LEAF });
    expect(accepted(gained, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1")).journey.screen.type).toBe("dreamscape");
  });
  it("refuses stale, unavailable, unaffordable and repeated entries atomically and allows finishing early", () => {
    const opened = accepted(siteState([LEAF]), "OPEN_SITE", open), first = accepted(opened, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1"));
    for (const payload of [select("entry-1"), select("missing"), { ...select("entry-2"), type: "Perfected" }, { ...select("entry-2"), siteId: "foreign" }]) {
      const out = apply(first, "ACCEPT_TRANSFIGURATION_CHOICE", payload); expect(out.state).toBe(first); expect(out.logRecords).toBeUndefined();
    }
    const poor = { ...first, journey: { ...first.journey, essence: 6 } };
    expect(apply(poor, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-2")).state).toBe(poor);
    const elsewhere = { ...first, journey: { ...first.journey, screen: { type: "dreamscape" as const } } };
    expect(apply(elsewhere, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-2")).state).toBe(elsewhere);
    expect(accepted(first, "COMPLETE_SITE", { siteId: SITE_ID }).journey.screen.type).toBe("dreamscape");
  });
  it("rejects forged saved allowances while accepting loss of the quoted source", () => {
    const s = accepted(siteState([LEAF]), "OPEN_SITE", open), quote = s.journey.siteRuntime[SITE_ID];
    for (const permission of [{ dreamsignId: TOME, heldIndex: 0, count: 2 }, { dreamsignId: LEAF, heldIndex: -1, count: 2 }, { dreamsignId: LEAF, heldIndex: 0, count: 99 }]) {
      const snapshot = { ...s.journey, siteRuntime: { [SITE_ID]: { ...quote, journeyTransfigurationCount: permission } } };
      expect(apply(s, "LOAD_STATE", { snapshot }).state).toBe(s);
    }
  });
  it("copies the exact transformed original Event per held source, including modifiers and overrides, with unique IDs", () => {
    const initial = siteState([TOME, TOME, LEAF]);
    initial.journey.deck[0] = { ...initial.journey.deck[0], keywordModification: { fast: true, reclaim: 2 }, sparkBonus: 4, statOverride: { energyCost: 3 } };
    const opened = accepted(initial, "OPEN_SITE", open);
    const out = apply(opened, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1"));
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(6);
    const original = out.state.journey.deck[0];
    for (const copy of out.state.journey.deck.slice(4)) expect({ ...copy, entryId: original.entryId }).toEqual(original);
    expect(new Set(out.state.journey.deck.map((entry) => entry.entryId)).size).toBe(6);
    expect(out.logRecords?.filter((record) => record.event === "journey_modifier_applied")).toHaveLength(2);
    expect(apply(out.state, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1")).state).toBe(out.state);
  });
  it.each(["Event", "Character"] as const)("uses current D39 card type %s rather than printed identity", (type) => {
    const initial = siteState([TOME]);
    initial.journey.deck[0] = { ...initial.journey.deck[0], cardNumber: type === "Event" ? 2 : 1,
      typeChange: { predicateId: parseCardTypeChangePredicateId("synthetic-type"), cardType: type, subtype: cardSubtypeFromUnknown("")!, label: "" } };
    const out = accepted(accepted(initial, "OPEN_SITE", open), "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1"));
    expect(out.journey.deck).toHaveLength(type === "Event" ? 5 : 4);
  });
  it("does not react to administration, newly gained preformed cards, or copies of formed entries", () => {
    const s = siteState([TOME]);
    const transformed = accepted(s, "TRANSFIGURE_CARD", { entryId: "entry-1", transfiguration: "Inspired" });
    expect(transformed.journey.deck).toHaveLength(4);
    expect(accepted(transformed, "DUPLICATE_DECK_ENTRY", { entryId: "entry-1" }).journey.deck).toHaveLength(5);
    expect(accepted(s, "ADD_CARD", { cardId: card.id, transfiguration: "Inspired" }).journey.deck).toHaveLength(5);
    expect(accepted(transformed, "LOAD_STATE", { snapshot: transformed.journey }).journey.deck).toHaveLength(4);
  });
  it("preserves existing no-Tome transfiguration without requiring the new provider", () => {
    registerJourneyTransfigurationProvider(null);
    const s = accepted(siteState(), "OPEN_SITE", open);
    expect(accepted(s, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1")).journey.deck).toHaveLength(4);
  });
  it("contains a needed provider failure after domain mutation with no partial copy/cost, then retries and replays once", () => {
    const initial = accepted(siteState([TOME, LEAF]), "OPEN_SITE", open);
    let fail = true;
    registerJourneyTransfigurationProvider({ resolve: () => { if (fail) throw new Error("synthetic type lookup failure"); return { cardId: card.id, cardType: "Event", forms: [] }; } });
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (s, e, c) => reduceGameEvent(s, e, c, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("END_BATTLE", {}).actor, now: () => ctx().timestamp, devMode: false });
    log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: select("entry-1") }); expect(log.state()).toEqual(initial);
    fail = false; log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: select("entry-1") });
    expect(log.state().journey.deck).toHaveLength(5); expect(log.state().journey.essence).toBe(23);
    expect(foldEvents(config, GENESIS, { seq: 1, state: initial }, [...log.events()].filter(({ seq }) => seq > 1)).state).toEqual(log.state());
  });
  it("uses CAS for concurrent and unknown windows, leaving acceptance/logs unchanged", () => {
    const s = accepted(siteState([LEAF, TOME]), "OPEN_SITE", open);
    for (const intervening of ["unknown" as const, [{ seq: 1, actor: event("END_BATTLE", {}, "partner").actor, type: "ADD_DREAMSIGN" as const }]]) {
      const out = apply(s, "ACCEPT_TRANSFIGURATION_CHOICE", select("entry-1"), ctx({ intervening }));
      expect(out.state).toBe(s); expect(out.logRecords).toBeUndefined();
    }
  });
  it("does not draw RNG or create a source copy when a choice is refused", () => {
    const rng = vi.fn(() => 0), s = accepted(siteState([TOME]), "OPEN_SITE", open);
    expect(apply(s, "ACCEPT_TRANSFIGURATION_CHOICE", select("missing"), ctx({ rng })).state).toBe(s); expect(rng).not.toHaveBeenCalled();
  });
  it("validates the public descriptor discriminant/count", () => {
    for (const descriptor of [{ kind: "unknown" }, { kind: "afterBattleTransfiguration", maxCount: 0 }, { kind: "afterBattleTransfiguration", maxCount: 1.5 }]) {
      expect(() => journeyTransfiguration(TOME, descriptor as Parameters<typeof journeyTransfiguration>[1])).toThrow(RangeError);
    }
  });
});

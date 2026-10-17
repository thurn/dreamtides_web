import { RED } from "./journey-on-gain-fixtures";
import { afterBattleChoice } from "./journey-after-battle";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { FIXTURE_POINTS_MODE } from "../replay/fixture-providers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setup, apply, intent, clear, TOAD, ACORN, MASK, RAT, DOLL, sign, registry } from "./journey-subtype.fixtures";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId, testExplorationActionId } from "../../types/test-identities";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import type { ExplorationSiteRuntime } from "../../types/journey";
import { reduceGameEvent } from "../reducer";
import { ctx, event } from "./lifecycle-fixtures";
import { beginBattle } from "./journey-on-gain-fixtures";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { FIXTURE_ENGINE } from "../replay/fixture-providers";
afterEach(clear);
function compound(numbers: number[], sources = [TOAD]) {
  setup();
  const runtime: ExplorationSiteRuntime = { kind: "exploration", encounterCardId: testCardId("subtype-compound"), selectionRulesVersion: SELECTION_RULES_VERSION, actionOffers: [], resolution: null };
  const before = stateWithSites([makeSite("Exploration")], { dreamsigns: [sign(ACORN)], deck: [], screen: { type: "site", siteId: SITE_ID }, siteRuntime: { [SITE_ID]: runtime } });
  registerSiteContentProvider(testSiteContentProvider({ resolveExploration: ({ journey }) => ({ purges: [], journey: { ...journey, dreamsigns: [...journey.dreamsigns, ...sources.map(sign)], deck: numbers.map((cardNumber, n) => makeEntry({ cardNumber, entryId: parseDeckEntryId(`cohort-fresh-${n}`) })), siteRuntime: { [SITE_ID]: { ...runtime, resolution: { actionId: testExplorationActionId("subtype-compound"), gainedCardIds: numbers.map(n => testCardId(`subtype-card-${n}`)), gainedDreamsignIds: sources, dreamsignMutation: { beforeIds: journey.dreamsigns.map(sign => sign.id), afterIds: [...journey.dreamsigns.map(sign => sign.id), ...sources], gainedIds: sources, purgedIds: [], replacements: [], offeredIds: sources, poolBeforeIds: [], poolAfterIds: [], poolRegenerated: false }, purgedCardIds: [], affectedEntryIds: [], essenceGained: 0 } } } } }) }));
  const result = apply(before, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID });
  expect(result.outcome).toBe("applied"); return result.state;
}
describe("journey subtype acquisition", () => {
  it.each([false, true])("resumes an actual earned Dreamsign offer and terminal route, final=%s", final => {
    let state = beginBattle([RED]); setup();
    if (final) state = { ...state, journey: { ...state.journey, atlas: { ...state.journey.atlas, layers: [state.journey.atlas.layers[0]] } } };
    registerSiteContentProvider(createSiteContentProvider(makeAuguryTestContent({ cards: [makeAuguryTestCard({ id: testCardId("earned-subtype"), cardNumber: 1 })], dreamsignTemplates: [{ ...sign(TOAD), imageName: "synthetic.png" }] })));
    state = { ...state, journey: { ...state.journey, remainingDreamsignPool: [TOAD] } };
    const card = journeyBattleOf(state.battle)!.engine.slice.committed.sides.player.hand[0];
    state = apply(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } }).state;
    const prompt = pendingEnginePrompt(state.battle, FIXTURE_ENGINE)!;
    state = apply(state, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE }).state;
    const ended = apply(state, "END_BATTLE", {}, { seq: 30 }); expect(ended.outcome).toBe("applied"); state = ended.state;
    const earned = afterBattleChoice(state.journey.screen)!, source = earned.sources[earned.index]; if (source.kind !== "dreamsign") throw new Error("Missing earned Dreamsign");
    const acquired = apply(state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId: earned.siteId, dreamsignId: RED, heldIndex: 0, choiceIndex: 0, earnedSeq: source.earnedSeq, offeredDreamsignId: TOAD }, { seq: 31 }); expect(acquired.outcome).toBe("applied");
    const loaded = apply(acquired.state, "LOAD_STATE", { snapshot: structuredClone(acquired.state.journey) }); expect(loaded.outcome).toBe("applied");
    const done = apply(loaded.state, "RESOLVE_JOURNEY_SUBTYPE", intent(loaded.state)); expect(done.outcome).toBe("applied"); expect(done.state.journey.screen.type).toBe(final ? "journeyComplete" : "atlas"); expect(done.state.battle).toBeNull();
  });
  it.each([[1, "Mage", 0], [2, "Warrior", 1]] as const)("classifies fresh Character %i after acquisition choice %s", (number, chosen, bonus) => {
    const pending = compound([number, 3]);
    expect(pending.journey.deck[0].sparkBonus).toBeUndefined();
    const result = apply(pending, "RESOLVE_JOURNEY_SUBTYPE", intent(pending, chosen));
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck[0].sparkBonus ?? 0).toBe(bonus);
    expect(result.state.journey.deck[0].typeChange?.subtype).toBe(chosen);
    expect(result.state.journey.deck[1].typeChange).toBeUndefined();
  });
  it("changes only earned physical Characters, preserving modifications and future additions", () => {
    const before = setup([ACORN]); before.journey.deck[0] = { ...before.journey.deck[0], transfiguration: "Kindled", sparkBonus: 4, keywordModification: { fast: true } };
    const pending = apply(before, "ADD_DREAMSIGN", { dreamsignId: TOAD }).state;
    const result = apply(pending, "RESOLVE_JOURNEY_SUBTYPE", intent(pending)); expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck[0]).toMatchObject({ entryId: before.journey.deck[0].entryId, transfiguration: "Kindled", sparkBonus: 4, keywordModification: { fast: true } });
    expect(result.state.journey.deck[1].sparkBonus).toBeUndefined();
    const added = apply(result.state, "ADD_CARD", { cardId: testCardId("future-character") }); expect(added.outcome).toBe("applied"); expect(added.state.journey.deck[added.state.journey.deck.length - 1]?.typeChange).toBeUndefined();
  });
  it.each([{ numbers: [] }, { numbers: [2] }])("requires a choice for an empty or same-subtype cohort %j", ({ numbers }) => {
    const pending = compound(numbers); expect(pending.journey.screen.type).toBe("journeyDreamsign");
    expect(apply(pending, "RESOLVE_JOURNEY_SUBTYPE", intent(pending)).outcome).toBe("applied");
  });
  it.each([{ sources: [MASK, TOAD] }, { sources: [TOAD, MASK] }])("continues mixed acquisitions in original physical order %j", ({ sources }) => {
    let pending = compound([1], sources);
    expect(intent(pending).sourceDreamsignId).toBe(sources[0]);
    pending = apply(pending, "RESOLVE_JOURNEY_SUBTYPE", intent(pending, "Mage")).state;
    expect(intent(pending).sourceDreamsignId).toBe(sources[1]);
    const done = apply(pending, "RESOLVE_JOURNEY_SUBTYPE", intent(pending, "Warrior")); expect(done.outcome).toBe("applied");
    expect(done.state.journey.typeRemap).toBe(sources[0] === MASK ? "Mage" : "Warrior");
    expect(done.state.journey.deck[0].typeChange?.subtype).toBe(sources[0] === TOAD ? "Mage" : "Warrior");
  });
  it("keeps prior acquired effects once and uses resolver randomness for later effects", () => {
    const rng = vi.fn(() => 0), pending = compound([1, 2, 1, 2], [RAT, TOAD, RAT]);
    expect(pending.journey.deck.filter(entry => entry.transfiguration !== null)).toHaveLength(2);
    const result = apply(pending, "RESOLVE_JOURNEY_SUBTYPE", intent(pending), { seq: 90, rng }); expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck.filter(entry => entry.transfiguration !== null)).toHaveLength(4); expect(rng).toHaveBeenCalledTimes(4);
    expect(result.logRecords?.some(row => row.fields.rngEventSeq === 90)).toBe(true);
  });
  it("preserves earned source identity through loss and refuses independent copy invalidation", () => {
    const pending = apply(setup([ACORN]), "ADD_DREAMSIGN", { dreamsignId: TOAD }).state;
    const lost = apply(pending, "REMOVE_DREAMSIGN", { dreamsignId: TOAD }); expect(lost.outcome).toBe("applied");
    expect(apply(lost.state, "RESOLVE_JOURNEY_SUBTYPE", intent(lost.state)).outcome).toBe("applied");
    const copyPending = compound([1], [DOLL, TOAD]);
    expect(apply(copyPending, "REMOVE_DREAMSIGN", { dreamsignId: ACORN }).state).toBe(copyPending);
  });
  it("rejects stale and repeated confirmations without draws or partial writes", () => {
    const pending = apply(setup(), "ADD_DREAMSIGN", { dreamsignId: TOAD }).state, payload = intent(pending), rng = vi.fn(() => 0);
    for (const patch of [{ permissionSeq: 999 }, { heldIndex: 999 }, { choiceIndex: 1 }, { sourceDreamsignId: MASK }, { chosenSubtype: "unsupported" }]) expect(apply(pending, "RESOLVE_JOURNEY_SUBTYPE", { ...payload, ...patch }, { rng }).state).toBe(pending);
    expect(apply(pending, "ADD_CARD", { cardId: testCardId("blocked") }, { rng }).state).toBe(pending);
    const done = apply(pending, "RESOLVE_JOURNEY_SUBTYPE", payload).state; expect(apply(done, "RESOLVE_JOURNEY_SUBTYPE", payload, { rng }).state).toBe(done); expect(rng).not.toHaveBeenCalled();
  });
  it("resolves with a genuine suspended engine prompt after safe source loss", () => {
    const battle = beginBattle([]); setup();
    const reduce = (state: typeof battle, type: Parameters<typeof event>[0], payload: Record<string, unknown>) => reduceGameEvent(state, event(type, payload), ctx(), registry);
    const suspended = reduce(battle, "ADD_DREAMSIGN", { dreamsignId: TOAD }); expect(suspended.outcome).toBe("applied");
    const card = journeyBattleOf(battle.battle)!.engine.slice.committed.sides.player.hand[0];
    const played = reduce(battle, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } }); expect(played.outcome).toBe("applied"); expect(pendingEnginePrompt(played.state.battle, FIXTURE_ENGINE)).not.toBeNull();
    const loaded = reduce(suspended.state, "LOAD_STATE", { snapshot: structuredClone(suspended.state.journey), battle: structuredClone(played.state.battle) }); expect(loaded.outcome).toBe("applied");
    const lost = reduce(loaded.state, "REMOVE_DREAMSIGN", { dreamsignId: TOAD }); expect(lost.outcome).toBe("applied");
    const done = reduce(lost.state, "RESOLVE_JOURNEY_SUBTYPE", intent(lost.state)); expect(done.outcome).toBe("applied"); expect(done.state.battle).toBe(lost.state.battle);
  });
});

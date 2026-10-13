import { beforeEach, describe, expect, it } from "vitest";
import { createBattleInit, type CreateBattleInitInput } from "./create-battle-init";
import { makeBattleTestAvatars, makeBattleTestCardDatabase, makeBattleTestSite, makeBattleTestState } from "../test-support";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { economyFixture } from "../../testing/economy-fixture";
import { MINIMAL_ATLAS_DATA, MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import { makeTestPoolContext } from "../../testing/pool-context";
import { testJourneyState } from "../../testing/journey-genesis";
import { testApollyonIncarnationId, testAvatarId, testCardId, testDreamsignId, testTideId } from "../../types/test-identities";
import { parseBattleEntryKey, parseAtlasNodeId } from "../../types/identifiers";
import { parseCardName } from "../../types/card-identity";
import type { ApollyonIncarnationContent } from "../../types/content";
import type { JourneyContent } from "../../data/journey-content";
import { createBattleInitProvider, settleDeferredOpponentLog } from "../../session/providers/battle-init-provider";
import { createCatalog, createEngine, type EngineCardDefinition } from "../../engine";
import { energy } from "../../engine/dsl/builders";
import { atStartOfFirstTurn, triggered } from "../../engine/dsl/triggers";
import { gainPoints } from "../../engine/effects/primitives/gain-points";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { createFoldAdapter } from "../../engine/fold/slice";
import { parseJourneyBattleFoldState } from "../../rules/battle/fold";
import { catalogManifest, manifestCatalog } from "../../engine/policy/catalog-manifest";
import { getLogEntries, resetLog } from "../../logging";
import { generatePoolFromData } from "../../draft/pool/generate";
import { resolveEnemyAvatarSummary } from "../components/enemy-avatar-summary";

/** The inputs here are plain persisted init/manifest fixtures, with their type retained after serialization. */
function jsonClone<T>(value: T): T {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  return parsed as T;
}

function fixture() {
  const avatars = makeBattleTestAvatars();
  const cardDatabase = makeBattleTestCardDatabase();
  const cards = [...cardDatabase.values()].filter((card) => !card.isStarter);
  const [first, second] = cards;
  if (first === undefined || second === undefined || avatars[0] === undefined) throw new Error("Incomplete synthetic corpus");
  cardDatabase.set(second.cardNumber, { ...second, name: parseCardName(first.name) });
  const tideId = testTideId("apollyon-pool");
  const signId = testDreamsignId("apollyon-sign");
  const incarnation: ApollyonIncarnationContent = {
    id: testApollyonIncarnationId("selected-boss"), title: "Synthetic boss", description: "Synthetic design", deckType: "fixture",
    aspect: { id: testAvatarId("selected-aspect"), renderedText: "Synthetic pending aspect", proposedAbilities: () => [triggered(atStartOfFirstTurn(), gainPoints(2))], pending: true },
    deckRecipe: { poolAvatarId: avatars[0].id, archetypeTideIds: [tideId], signatureCardIds: [first.id, second.id] },
    dreamsignIds: [signId],
  };
  const defaultIncarnation: ApollyonIncarnationContent = {
    ...incarnation, id: testApollyonIncarnationId("default-boss"),
    aspect: { ...incarnation.aspect, id: testAvatarId("default-aspect") },
  };
  const state = makeBattleTestState();
  state.avatar = null;
  state.dreamsigns = [];
  state.atlas = { ...state.atlas, bossIncarnationId: incarnation.id };
  const tides4Decks = {
    version: 2 as const, selection: { bandFraction: 0.25, bandMinimum: 5 },
    tides: [{ id: tideId, displayName: "Synthetic tide", auguryPackageReference: "fixture", displayDescription: "fixture", resonance: "wild" as const, role: "signature" as const, cards: cards.map((card) => ({ id: card.id, copies: 2 })) }],
    tidePoolByAvatar: Object.fromEntries(avatars.map((avatar) => [avatar.id, { starter: tideId, facets: [], neutral: [] }])),
  };
  const input: CreateBattleInitInput = {
    opponentsData: opponentsFixture(), transfigurationData: transfigurationFixture(),
    battleEntryKey: parseBattleEntryKey("apollyon-fixture"), site: makeBattleTestSite(), state, cardDatabase, avatars,
    apollyon: { incarnations: [defaultIncarnation, incarnation], legacyDefaultIncarnationId: defaultIncarnation.id },
    dreamsignTemplates: [{ id: signId, name: "Synthetic sign", effectDescription: "fixture", tideIds: [tideId] }],
    tides4Decks, tides4Tuning: { dealSize: 60, copyCap: 2, maxFacets: 1 }, seedOverride: 21,
  };
  return { input, incarnation, defaultIncarnation };
}

function engineFor(input: CreateBattleInitInput, incarnation: ApollyonIncarnationContent) {
  const definitions: EngineCardDefinition[] = [...input.cardDatabase.values()].map((card) => ({
    id: card.id, cardType: card.cardType === "Character" ? "character" : "event", costs: [energy(card.energyCost ?? 0)], spark: card.spark,
    subtype: card.subtype, speed: "standard", status: "pending", abilities: () => [],
  }));
  return createEngine(createCatalog(definitions, [], {
    avatars: [{ id: incarnation.aspect.id, status: incarnation.aspect.abilities === undefined ? "pending" : "authored", abilities: incarnation.aspect.abilities ?? (() => []) }],
    dreamsigns: (input.dreamsignTemplates ?? []).map((sign) => ({ id: sign.id, status: "pending", abilities: () => [] })),
  }));
}

function providerFixture(input: CreateBattleInitInput) {
  const poolContext = makeTestPoolContext();
  const content: JourneyContent = {
    ...CONFIG_DATA_FIXTURE, cardDatabase: new Map(input.cardDatabase), avatars: [...input.avatars], dreamsignTemplates: [...(input.dreamsignTemplates ?? [])],
    atlasData: MINIMAL_ATLAS_DATA, sitesData: MINIMAL_SITES_DATA, draftData: draftDataFixture(), economyData: economyFixture(),
    dreamwellCards: [], dreamscapes: [], affiliations: [], guides: [], opponentsData: input.opponentsData,
    transfigurationData: input.transfigurationData, apollyonIncarnations: [...(input.apollyon?.incarnations ?? [])],
    poolContext: { ...poolContext, poolData: { ...poolContext.poolData, tides4Decks: input.tides4Decks }, tides4Tuning: input.tides4Tuning! },
  };
  return { provider: createBattleInitProvider(content), journey: { ...testJourneyState(), ...input.state } };
}

describe("run-scoped Apollyon battle construction", () => {
  beforeEach(resetLog);

  it("carries the exact selected incarnation, distinct Aspect, pinned UUIDs and authored Dreamsigns", () => {
    const { input, incarnation } = fixture();
    const start = createBattleInit(input);
    expect(start.init.enemyDescriptor.incarnationId).toBe(incarnation.id);
    expect(start.init.enemyDescriptor.aspectId).toBe(incarnation.aspect.id);
    expect(start.engineInit.avatars?.enemy).toBe(incarnation.aspect.id);
    expect(start.init.enemyDescriptor.avatarId).toBeUndefined();
    expect(start.engineInit.dreamsigns?.enemy).toEqual(incarnation.dreamsignIds);
    expect(start.init.enemyDescriptor.signatureCards.map((card) => card.cardId)).toEqual(incarnation.deckRecipe.signatureCardIds);
    for (const id of incarnation.deckRecipe.signatureCardIds) expect(start.engineInit.decks.enemy.filter((card) => card.cardId === id)).toHaveLength(1);
    expect(new Set(start.engineInit.decks.enemy.map((card) => card.cardId)).size).toBe(start.engineInit.decks.enemy.length);
    expect(resolveEnemyAvatarSummary(start.init.enemyDescriptor, { avatars: [...input.avatars] }).id).toBe(incarnation.aspect.id);
    expect(start.init.opponentAbilityActive).toBe(false);
  });

  it("preserves the actual generated opponent multiset through init, reconstruction logs and strict reload", () => {
    const { input, incarnation } = fixture();
    const start = createBattleInit(input);
    const log = getLogEntries().find((entry) => entry.event === "tide_opponent_deck_constructed");
    if (log === undefined || typeof log.poolSeed !== "number") throw new Error("generated pool log missing");
    const generated = generatePoolFromData({ tides4Decks: input.tides4Decks!, cardNameById: new Map([...input.cardDatabase.values()].map((card) => [card.id, card.name])) }, log.poolSeed, incarnation.deckRecipe.poolAvatarId, input.tides4Tuning);
    const expected = [...generated.counts].flatMap(([id, copies]) => Array.from({ length: copies }, () => id)).sort();
    expect(start.engineInit.draftPools?.enemy).toEqual(expected);
    expect(log.draftPoolCardIds).toEqual(expected);
    const outcome = createFoldAdapter(engineFor(input, incarnation)).start(start.engineInit);
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("synthetic pool init failed");
    const stored = jsonClone({ mode: { kind: "journey" }, init: start.init, engine: { init: start.engineInit, slice: outcome.slice } });
    expect(parseJourneyBattleFoldState(stored)?.engine.slice.committed.draftPools?.enemy).toEqual(expected);
  });

  it("preserves pinned signatures under maximal starter dilution", () => {
    const { input, incarnation } = fixture();
    input.opponentsData.progression.starterDilution[input.state.completionLevel] = input.opponentsData.opponentDeckSize;
    const start = createBattleInit(input);
    for (const id of incarnation.deckRecipe.signatureCardIds) expect(start.engineInit.decks.enemy.filter((card) => card.cardId === id)).toHaveLength(1);
  });

  it("rebuilds the same init and reloads paired identities through the public fold parser", () => {
    const { input, incarnation } = fixture();
    const start = createBattleInit(input);
    expect(createBattleInit(input)).toEqual(start);
    expect(JSON.parse(JSON.stringify(start))).toEqual(start);
    const outcome = createFoldAdapter(engineFor(input, incarnation)).start(start.engineInit);
    if (outcome.kind !== "applied") throw new Error("Synthetic engine did not start");
    const stored = jsonClone({ mode: { kind: "journey" }, init: start.init, engine: { init: start.engineInit, slice: outcome.slice } });
    expect(parseJourneyBattleFoldState(stored)?.init.enemyDescriptor.aspectId).toBe(incarnation.aspect.id);
    delete stored.init.enemyDescriptor.aspectId;
    expect(parseJourneyBattleFoldState(stored)).toBeNull();
  });

  it("keeps proposed abilities separate from pending runtime, with an authored control", () => {
    const { input, incarnation } = fixture();
    const init = { ...createBattleInit(input).engineInit, startingSide: "enemy" as const };
    const pending = engineFor(input, incarnation).createBattle(init, NO_PROMPTS).state;
    expect(pending.sides.enemy.avatar?.id).toBe(incarnation.aspect.id);
    expect(pending.sides.enemy.score).toBe(0);
    const authored: ApollyonIncarnationContent = { ...incarnation, aspect: { id: incarnation.aspect.id, renderedText: incarnation.aspect.renderedText, proposedAbilities: incarnation.aspect.proposedAbilities, abilities: incarnation.aspect.proposedAbilities, verifiedText: "synthetic-control" } };
    expect(engineFor(input, authored).createBattle(init, NO_PROMPTS).state.sides.enemy.score).toBe(2);
    const manifest = catalogManifest(engineFor(input, incarnation).catalog, init);
    expect(manifestCatalog(jsonClone(manifest)).avatar(incarnation.aspect.id).status).toBe("pending");
  });

  it.each([null, undefined])("uses the configured default for historical selected ID %s", (selected) => {
    const { input, defaultIncarnation } = fixture();
    input.state.atlas.bossIncarnationId = selected;
    expect(createBattleInit(input).init.enemyDescriptor.incarnationId).toBe(defaultIncarnation.id);
    expect(getLogEntries().find((entry) => entry.event === "apollyon_opponent_constructed")?.selection).toBe("legacy-default");
  });

  it.each(["old-api", "empty", "missing-default", "ordinary-site"])("retains seeded compatibility for %s", (kind) => {
    const { input } = fixture();
    input.state.atlas.bossIncarnationId = null;
    if (kind === "old-api") delete input.apollyon;
    if (kind === "empty") input.apollyon = { ...input.apollyon!, incarnations: [] };
    if (kind === "missing-default") input.apollyon = { ...input.apollyon!, legacyDefaultIncarnationId: testApollyonIncarnationId("absent-default") };
    if (kind === "ordinary-site") input.state.atlas.bossNodeId = parseAtlasNodeId("other-node");
    const first = createBattleInit(input);
    expect(first.init.enemyDescriptor.incarnationId).toBeUndefined();
    expect(createBattleInit(input)).toEqual(first);
  });

  it.each(["incarnation", "pool", "pool-entry", "tide", "card", "dreamsign", "duplicate-signature", "too-many-signatures", "no-dreamsign", "duplicate-dreamsign", "missing-pool-data"])("rejects invalid %s before reconstruction logging", (kind) => {
    const { input, incarnation } = fixture();
    if (kind === "incarnation") input.state.atlas.bossIncarnationId = testApollyonIncarnationId("unknown");
    const recipe = { ...incarnation.deckRecipe };
    if (kind === "pool") recipe.poolAvatarId = testAvatarId("unknown-pool");
    if (kind === "pool-entry") input.tides4Decks = { ...input.tides4Decks!, tidePoolByAvatar: {} };
    if (kind === "tide") recipe.archetypeTideIds = [testTideId("unknown")];
    if (kind === "card") recipe.signatureCardIds = [testCardId("unknown")];
    if (kind === "duplicate-signature") recipe.signatureCardIds = [...recipe.signatureCardIds, recipe.signatureCardIds[0]];
    if (kind === "too-many-signatures") recipe.signatureCardIds = [...input.cardDatabase.values()].slice(0, 11).map((card) => card.id);
    let dreamsignIds = incarnation.dreamsignIds;
    if (kind === "dreamsign") dreamsignIds = [testDreamsignId("unknown")];
    if (kind === "duplicate-dreamsign") dreamsignIds = [dreamsignIds[0], dreamsignIds[0]];
    const changed = { ...incarnation, deckRecipe: recipe, dreamsignIds };
    if (kind === "no-dreamsign") Object.assign(changed, { dreamsignIds: [] });
    input.apollyon = { ...input.apollyon!, incarnations: [changed] };
    if (kind === "missing-pool-data") delete input.tides4Decks;
    expect(() => createBattleInit(input)).toThrow();
    expect(getLogEntries()).toEqual([]);
  });

  it("defers speculative logs and emits reconstruction once for competing identical actor builds", () => {
    const { input, incarnation } = fixture();
    const { provider, journey } = providerFixture(input);
    const begin = (seq: number) => provider.beginBattle({ journey, siteId: input.site.id, seedOverride: input.seedOverride ?? null, seq, rng: () => 0, timestamp: new Date(0).toISOString() });
    begin(40);
    expect(getLogEntries()).toEqual([]);
    expect(settleDeferredOpponentLog(40, false)).toBe(true);
    expect(getLogEntries()).toEqual([]);
    const first = begin(41);
    expect(begin(41)).toEqual(first);
    expect(settleDeferredOpponentLog(41, true)).toBe(true);
    expect(settleDeferredOpponentLog(41, true)).toBe(false);
    const records = getLogEntries().filter((entry) => entry.event === "apollyon_opponent_constructed");
    expect(records).toHaveLength(1);
    expect(records[0]?.incarnationId).toBe(incarnation.id);
    expect(records[0]?.aspectId).toBe(incarnation.aspect.id);
    expect(records[0]).not.toHaveProperty("name");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDefinition } from "../content/define";
import { engineCardFromContent } from "../engine/content-catalog";
import { BASE_VARIANT } from "../engine/dsl/types";
import { assertJsonSafe } from "../eventlog/hash";
import { createLocalLog } from "../eventlog/local-log";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import { clearGameProviders, registerGameProviders } from "../session/providers/register-game-providers";
import { AUGURY_GENESIS, makeAuguryFixture, OPEN } from "../session/providers/register-game-providers.fixtures";
import { makeAuguryTestDeckEntry } from "../journey_v2/testing/fixtures";
import { parseCardId, parseCardName, parseCardSubtype } from "../types/card-identity";
import { parseDeckEntryId } from "../types/identifiers";
import { testEventActor } from "../types/test-identities";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
import { buildIdIndex, loadCardsV2Database } from "./cards-v2-database";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function authoredCard() {
  return {
    id: ID, name: "Synthetic", cardNumber: 1, cardType: "Character",
    subtype: "Warrior", isStarter: false, energyCost: 2, spark: 3,
    isFast: false, isInterrupt: false, renderedText: "Synthetic ability",
    amplifiedText: "Synthetic amplified ability", mtgName: "Synthetic reference",
    rarity: "Rare", imageNumber: 1, artOwned: false,
    roles: ["starter-deck"], energyCosts: ["2"], sparkVariable: false,
    art: { x: 0, y: -0.5, scale: 1 }, tags: ["synthetic"],
    abilities: vi.fn(() => []), verifiedText: "synthetic-hash", xMinimum: 0,
  } satisfies CardDefinition;
}

afterEach(clearGameProviders);

describe("card display catalog boundary", () => {
  it("preserves every declared display field and copies readonly containers without evaluating abilities", () => {
    const source = { ...authoredCard(), reclaimCost: null };
    Object.freeze(source.roles);
    Object.freeze(source.energyCosts);
    Object.freeze(source.art);
    Object.freeze(source);
    const loaded = loadCardsV2Database([source]).get(1);
    expect(loaded).toEqual({
      id: parseCardId(ID), name: parseCardName("Synthetic"), cardNumber: 1,
      cardType: "Character", subtype: parseCardSubtype("Warrior"), isStarter: false,
      energyCost: 2, spark: 3, isFast: false, isInterrupt: false,
      renderedText: "Synthetic ability", amplifiedText: "Synthetic amplified ability",
      mtgName: "Synthetic reference", rarity: "Rare", imageNumber: 1, artOwned: false,
      roles: ["starter-deck"], energyCosts: ["2"], sparkVariable: false,
      reclaimCost: null, art: { x: 0, y: -0.5, scale: 1 },
    });
    expect(loaded?.roles).not.toBe(source.roles);
    expect(loaded?.energyCosts).not.toBe(source.energyCosts);
    expect(loaded?.art).not.toBe(source.art);
    expect(source.abilities).not.toHaveBeenCalled();
    expect(() => assertJsonSafe(loaded, "displayCard")).not.toThrow();
    const engineCard = engineCardFromContent(source);
    expect(engineCard.abilities).toBe(source.abilities);
    expect(engineCard.abilities(BASE_VARIANT)).toEqual([]);
    expect(source.abilities).toHaveBeenCalledExactlyOnceWith(BASE_VARIANT);
    expect(engineCard.status).toBe("authored");
  });

  it("preserves nulls, zeroes, empty containers and absent optional values", () => {
    const minimal = {
      id: ID, name: "Synthetic", cardNumber: 1, cardType: "Event" as const,
      subtype: "" as const, isStarter: false, energyCost: null, spark: null,
      isFast: false, renderedText: "", imageNumber: 0, artOwned: false,
    } as const;
    expect(loadCardsV2Database([minimal]).get(1)).toEqual({
      ...minimal, id: parseCardId(ID), name: parseCardName(minimal.name), subtype: parseCardSubtype(""),
    });
    const source = { ...minimal, reclaimCost: 0, roles: [], energyCosts: [], amplifiedText: "", mtgName: "" };
    const loaded = loadCardsV2Database([source]).get(1);
    expect(loaded).toMatchObject({ reclaimCost: 0, roles: [], energyCosts: [], amplifiedText: "", mtgName: "" });
    expect(() => assertJsonSafe(loaded, "displayCard")).not.toThrow();
  });

  it("projects only display fields for authored, pending and vanilla records", () => {
    const source = authoredCard();
    const { abilities, verifiedText, ...fields } = source;
    const records = [source, { ...fields, pending: true as const }, { ...fields, vanilla: true as const }];
    const outputs = records.map((record) => loadCardsV2Database([record]).get(1));
    expect(outputs[1]).toEqual(outputs[0]);
    expect(outputs[2]).toEqual(outputs[0]);
    for (const output of outputs) {
      for (const field of ["abilities", "verifiedText", "pending", "vanilla", "xMinimum", "tags"]) {
        expect(output).not.toHaveProperty(field);
      }
      expect(() => assertJsonSafe(output, "displayCard")).not.toThrow();
    }
    expect(verifiedText).toBe("synthetic-hash");
    expect(abilities).not.toHaveBeenCalled();
  });

  it("retains distinct UUID identities for equal display names and validates the boundary", () => {
    const source = authoredCard();
    const database = loadCardsV2Database([source, { ...source, id: OTHER_ID, cardNumber: 2 }]);
    expect([...buildIdIndex(database)]).toEqual([[parseCardId(ID), 1], [parseCardId(OTHER_ID), 2]]);
    expect(() => loadCardsV2Database([{ ...source, name: "" }])).toThrow();
    // An external decoder can supply a structurally UUID-like but invalid value.
    expect(() => loadCardsV2Database([{ ...source, id: "bad-bad-bad-bad-bad" }])).toThrow();
  });
});

describe("loaded display cards in persisted Transfiguration", () => {
  it.each([false, true])("opens, reloads and resolves a real %s-enhanced site with JSON-safe previews", (isEnhanced) => {
    const source = authoredCard();
    const cards = loadCardsV2Database([source, { ...source, id: OTHER_ID, cardNumber: 2 }]);
    const fixture = makeAuguryFixture();
    const site = { ...fixture.site, type: "Transfiguration" as const, isEnhanced };
    const nodeId = fixture.journey.currentDreamscape!;
    const journey = {
      ...fixture.journey, screen: { type: "atlas" as const }, essence: 1000,
      deck: [1, 2].map((cardNumber) => makeAuguryTestDeckEntry({
        entryId: parseDeckEntryId(`display-entry-${cardNumber}`), cardNumber,
      })),
      atlas: { ...fixture.journey.atlas, nodes: {
        ...fixture.journey.atlas.nodes,
        [nodeId]: { ...fixture.journey.atlas.nodes[nodeId], sites: [site] },
      } },
    };
    registerGameProviders({ ...fixture.content, cardDatabase: cards, transfigurationData: transfigurationFixture() });
    const options = {
      config: GAME_ENGINE_CONFIG, genesis: AUGURY_GENESIS,
      localActor: testEventActor("display-loader"), devMode: true,
      now: () => "1970-01-01T00:00:00.000Z",
    };
    const log = createLocalLog({ ...options, base: {
      seq: 0, state: { ...GAME_ENGINE_CONFIG.genesisState(AUGURY_GENESIS), journey }, intentKeys: [],
    } });
    const outcomes: string[] = [];
    log.subscribe((record) => outcomes.push(record.outcome));
    log.append({ type: "OPEN_SITE", payload: { siteId: site.id, ...OPEN } });
    expect(outcomes).toEqual(["applied"]);
    const runtime = log.state().journey.siteRuntime[site.id];
    if (runtime.kind !== "cardChoice" || runtime.choiceKind !== "transfiguration") throw new Error("Expected Transfiguration choices");
    expect(runtime.entryIds).toHaveLength(2);
    expect(runtime.transfigurationOffers.length).toBeGreaterThan(0);
    expect(() => assertJsonSafe(log.state(), "persistedState")).not.toThrow();
    const checkpoint = log.checkpoint();
    const restored = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(checkpoint.state));
    expect(restored).toEqual(checkpoint.state);
    const reloaded = createLocalLog({ ...options, base: { ...checkpoint, state: restored }, history: log.events() });
    const resolvedOutcomes: string[] = [];
    reloaded.subscribe((record) => resolvedOutcomes.push(record.outcome));
    const offer = runtime.transfigurationOffers[0];
    const choice = { type: "ACCEPT_TRANSFIGURATION_CHOICE" as const, payload: {
      siteId: site.id, entryId: offer.entryId, type: offer.type,
    } };
    reloaded.append(choice);
    expect(resolvedOutcomes).toEqual(["applied"]);
    expect(reloaded.state().journey.deck.find(({ entryId }) => entryId === offer.entryId)?.transfiguration).toBe(offer.type);
    expect(reloaded.state().journey.essence).toBe(1000 - offer.essenceCost);
    expect(() => assertJsonSafe(reloaded.state(), "resolvedState")).not.toThrow();
    const completedState = reloaded.state();
    reloaded.append(choice);
    expect(resolvedOutcomes).toEqual(["applied", "bounced"]);
    expect(reloaded.state()).toEqual(completedState);
    expect(source.abilities).not.toHaveBeenCalled();
  });
});

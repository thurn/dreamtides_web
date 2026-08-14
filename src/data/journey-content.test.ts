import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../__test-helpers__/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { economyFixture } from "../testing/economy-fixture";
import { gambleFixture } from "../testing/gamble-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import explorationJson from "../../public/exploration-data.json";
import { loadJourneyContent } from "./journey-content";

function makeCard(cardNumber: number): CardData {
  return {
    name: asCardName(`Card ${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: cardNumber === 1,
    roles: cardNumber === 1 ? ["starter-deck"] : undefined,
    rarity: cardNumber === 1 ? "Starter" : "Common",
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

beforeEach(() => vi.restoreAllMocks());

describe("loadJourneyContent", () => {
  function stubFetch(input: {
    cards: CardData[];
    dreamAvatars: unknown[];
    failingPaths?: string[];
    economy?: ReturnType<typeof economyFixture>;
  }): void {
    const draftData = draftDataFixture();
    const gambleData = {
      ...gambleFixture(),
      contentHash: "e".repeat(64),
      foldHash: "f".repeat(64),
    };
    const tides = {
      version: 2,
      selection: { bandFraction: 0.25, bandMinimum: 5 },
      tides: [
        {
          id: "tide-a",
          displayName: "Tide A",
          displayDescription: "A synthetic tide.",
          resonance: "ember",
          role: "neutral",
          cards: [{ id: "card-1", copies: 1 }],
        },
      ],
      tidePoolByDreamAvatar: {},
    };
    const exploration = {
      schemaVersion: explorationJson.schemaVersion,
      contentHash: explorationJson.contentHash,
      foldHash: explorationJson.foldHash,
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: asCardId("card-1"),
          prose: "A fixture encounter.",
          action: [
            {
              id: "fixture-action",
              label: "Invite someone through",
              effectText: "Gain a card",
              effectKind: "gain-offered-card",
              canonicalMechanicId: "gain-card",
              selectionPolicyId: "card-fit-quality",
              predicate: "cheap-character",
              count: 1,
            },
          ],
        },
      ],
    };
    const assets = new Map<string, unknown>([
      ["/cards_v2-data.json", input.cards],
      ["/exploration-data.json", exploration],
      ["/augury-data.json", CONFIG_DATA_FIXTURE.auguryData],
      ["/dream-avatars-v2-data.json", input.dreamAvatars],
      ["/dreamwell-data.json", []],
      ["/dreamsign-data.json", []],
      ["/tides4-data.json", tides],
      ["/dreamscapes-data.json", []],
      ["/affiliations-data.json", []],
      [
        "/dream-guides-data.json",
        { schemaVersion: 1, contentHash: "a".repeat(64), guides: [] },
      ],
      ["/atlas-data.json", MINIMAL_ATLAS_DATA],
      ["/sites-data.json", MINIMAL_SITES_DATA],
      ["/economy-data.json", input.economy ?? economyFixture()],
      ["/gamble-data.json", gambleData],
      ["/draft-data.json", draftData],
      ["/transfiguration-data.json", transfigurationFixture()],
      ["/opponents-data.json", opponentsFixture()],
      ["/apollyon-incarnations-data.json", []],
      ["/figments-data.json", []],
    ]);
    const failures = new Set(input.failingPaths ?? []);
    vi.stubGlobal(
      "fetch",
      vi.fn((request: string | URL | Request) => {
        const path =
          typeof request === "string"
            ? request
            : request instanceof URL
              ? request.pathname
              : new URL(request.url).pathname;
        const ok = !failures.has(path) && assets.has(path);
        return Promise.resolve({
          ok,
          status: ok ? 200 : 503,
          statusText: ok ? "OK" : "Test Failure",
          json: () => Promise.resolve(assets.get(path) ?? null),
        } as Response);
      }),
    );
  }

  it("loads the current catalogs and assembles selection tuning from their owners", async () => {
    stubFetch({
      cards: [makeCard(1), makeCard(2)],
      dreamAvatars: [
        {
          id: "avatar-1",
          name: "Test Avatar",
          title: "Speaker of Tests",
          renderedText: "Test rules text.",
          imageNumber: "0001",
          startingEssence: 235,
          signatureCards: [],
          signatureCardIds: [],
        },
      ],
    });
    const content = await loadJourneyContent();
    expect(content.cardDatabase.size).toBe(2);
    expect(content.poolContext?.poolData.tides4Decks?.version).toBe(2);
    expect(content.rewardSelectionData.tuning).toMatchObject({
      bandFraction: 0.25,
      minDeckForPurge: MINIMAL_SITES_DATA.selection.minDeckForPurge,
      subtypeMinPoolCards:
        CONFIG_DATA_FIXTURE.auguryData.selection.subtypeMinPoolCards,
    });
  });

  it("rejects when the Tides catalog is unavailable", async () => {
    stubFetch({
      cards: [makeCard(1)],
      dreamAvatars: [],
      failingPaths: ["/tides4-data.json"],
    });
    await expect(loadJourneyContent()).rejects.toThrow(
      "Missing Tides4 catalog",
    );
  });

  it("uses the authored economy default when an avatar omits starting essence", async () => {
    const economy = economyFixture();
    economy.journey.defaultStartingEssence = 137;
    stubFetch({
      cards: [makeCard(1)],
      economy,
      dreamAvatars: [
        {
          id: "avatar-defaulted",
          name: "Defaulted",
          title: "D",
          renderedText: "",
          imageNumber: "0001",
          signatureCards: [],
          signatureCardIds: [],
        },
      ],
    });
    const content = await loadJourneyContent();
    expect(content.dreamAvatars[0].startingEssence).toBe(137);
  });
});

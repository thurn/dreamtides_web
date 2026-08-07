import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import type { DreamAvatarContent } from "../types/content";
import type { FitModel } from "../draft/replay/fit-model";
import {
  selectRecordIndex,
  selectReplayRecordIndex,
} from "../draft/replay/draft-records";
import { MINIMAL_ATLAS_DATA } from "../__test-helpers__/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import explorationJson from "../../public/exploration-data.json";
import type { DraftRecord, KnownGoodDecklist } from "./cards-v2-database";
import {
  buildReplayDraftState,
  hashStringToSeed,
  loadJourneyContent,
} from "./journey-content";

const DRAFT_HASH = "d".repeat(64);
const DRAFT_DATA = draftDataFixture({
  contentHash: DRAFT_HASH,
  foldHash: DRAFT_HASH,
});

function makeCard(cardNumber: number): CardData {
  return {
    name: asCardName(`Card ${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeCards(count: number): CardData[] {
  return Array.from({ length: count }, (_value, index) => makeCard(index + 1));
}

function makeRecord(id: string, packCardIds: string[][]): DraftRecord {
  return {
    id,
    draftId: `draft-${id}`,
    sourceFile: `draft-${id}-records.json`,
    mainboard: packCardIds.flat(),
    mainboardIds: packCardIds.flat(),
    packs: packCardIds,
    picks: packCardIds.map(() => []),
    packIds: packCardIds,
    pickIds: packCardIds.map(() => []),
  };
}

function makeDreamAvatar(signatureCardIds: string[]): DreamAvatarContent {
  return {
    id: "avatar-test",
    name: "Test Avatar",
    title: "Speaker of Tests",
    renderedText: "",
    imageNumber: "0001",
    startingEssence: 250,
    signatureCardIds,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadJourneyContent", () => {
  function stubFetch({
    cards,
    dreamAvatars,
    decklistIds,
    draftRecords = [],
    knownGoodDecklists = [],
    failingPaths = [],
    economy = economyFixture(),
  }: {
    cards: CardData[];
    dreamAvatars: unknown[];
    decklistIds: string[][];
    draftRecords?: DraftRecord[];
    knownGoodDecklists?: KnownGoodDecklist[];
    failingPaths?: string[];
    economy?: ReturnType<typeof economyFixture>;
  }): void {
    const explorationData = {
      schemaVersion: explorationJson.schemaVersion,
      actionsPerEncounter: explorationJson.actionsPerEncounter,
      contentHash: explorationJson.contentHash,
      foldHash: explorationJson.foldHash,
      effectKinds: explorationJson.effectKinds,
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: "exploration-fixture",
          prose: "A synthetic encounter.",
          action: [
            {
              id: "choice-a",
              label: "Choose A",
              effectText: "Gain the fixture card.",
              effectKind: "gain-card",
              cardId: String(cards[0]?.id ?? "fixture-card"),
            },
            {
              id: "choice-b",
              label: "Choose B",
              effectText: "Gain the fixture card.",
              effectKind: "gain-card",
              cardId: String(cards[0]?.id ?? "fixture-card"),
            },
          ],
        },
      ],
    };
    const assets = new Map<string, unknown>([
      ["/cards_v2-data.json", cards],
      ["/exploration-data.json", explorationData],
      ["/reward-selection-data.json", CONFIG_DATA_FIXTURE.rewardSelectionData],
      ["/augury-data.json", CONFIG_DATA_FIXTURE.auguryData],
      ["/dream-avatars-v2-data.json", dreamAvatars],
      ["/dreamwell-data.json", []],
      ["/dreamsign-data.json", []],
      ["/decklist-ids-data.json", decklistIds],
      ["/draft-records-data.json", draftRecords],
      ["/known-good-decklists-data.json", knownGoodDecklists],
      [
        "/merchant-corpus-data.json",
        { version: 1, source: "test", cards: {}, clusters: [] },
      ],
      ["/dreamsign-profiles-data.json", []],
      ["/dreamsign-signatures-data.json", []],
      ["/dreamscapes-data.json", []],
      ["/affiliations-data.json", []],
      ["/dream-guides-data.json", []],
      ["/atlas-data.json", MINIMAL_ATLAS_DATA],
      ["/economy-data.json", economy],
      ["/draft-data.json", DRAFT_DATA],
      ["/opponents-data.json", opponentsFixture()],
      ["/apollyon-incarnations-data.json", []],
      ["/figments-data.json", []],
    ]);
    const failures = new Set(failingPaths);

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const path =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.pathname
              : new URL(input.url).pathname;
        if (failures.has(path) || !assets.has(path)) {
          return Promise.resolve({
            ok: false,
            status: failures.has(path) ? 503 : 404,
            statusText: failures.has(path) ? "Test Failure" : "Not Found",
            json: () => Promise.resolve(null),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve(assets.get(path)),
        } as Response);
      }),
    );
  }

  it("loads the current catalog and builds a tides4 pool context", async () => {
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const avatar = {
      id: "avatar-1",
      name: "Test Avatar",
      title: "Speaker of Tests",
      renderedText: "Test rules text.",
      imageNumber: "0001",
      startingEssence: 235,
      signatureCards: ["Card 1", "Card 2"],
      signatureCardIds: ["card-1", "card-2"],
    };
    stubFetch({
      cards,
      dreamAvatars: [avatar],
      decklistIds: [["card-1", "card-2", "card-3"]],
    });

    const content = await loadJourneyContent();

    expect(content.cardDatabase.size).toBe(3);
    expect(content.dreamAvatars[0]).toMatchObject({
      id: "avatar-1",
      startingEssence: 235,
      signatureCardIds: ["card-1", "card-2"],
    });
    expect(content.poolContext?.poolVariant).toBe("tides4");
    expect(content.poolContext?.poolData.decklistIds).toEqual([
      ["card-1", "card-2", "card-3"],
    ]);
    expect(content.poolContext?.tides4Tuning).toEqual(DRAFT_DATA.pool.tides4);
    expect(content.opponentsData).toEqual(opponentsFixture());

    const fetchedPaths = vi.mocked(fetch).mock.calls.map(([input]) =>
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname,
    );
    expect(fetchedPaths).toContain("/tides4-data.json");
  });

  it.each([
    ["/decklist-ids-data.json", "Failed to load decklist ids"],
    ["/draft-records-data.json", "Failed to load draft records"],
    ["/known-good-decklists-data.json", "Failed to load known-good decklists"],
    ["/merchant-corpus-data.json", "Failed to load merchant corpus"],
    ["/opponents-data.json", "Failed to load opponent data"],
  ])("rejects when current content fetch %s fails", async (path, message) => {
    stubFetch({
      cards: [makeCard(1)],
      dreamAvatars: [],
      decklistIds: [["card-1"]],
      failingPaths: [path],
    });

    await expect(loadJourneyContent()).rejects.toThrow(message);
  });

  it("builds the shared fit model from draft records in pool mode", async () => {
    const cards = makeCards(20);
    const record = makeRecord("record-1", [cards.map((card) => card.id)]);
    stubFetch({
      cards,
      dreamAvatars: [],
      decklistIds: [cards.map((card) => card.id)],
      draftRecords: [record],
    });

    const content = await loadJourneyContent("tides4", "pool");

    expect(content.draftMode).toBe("pool");
    expect(content.draftRecords).toEqual([record]);
    expect(content.fitModel).toBeDefined();
    expect(content.fresh20PackSize).toBeUndefined();
  });

  it("defaults an omitted starting essence and carries replay mode", async () => {
    const economy = economyFixture();
    economy.journey.defaultStartingEssence = 137;
    const record = makeRecord("record-1", [["card-1"]]);
    stubFetch({
      cards: [makeCard(1)],
      dreamAvatars: [
        {
          id: "avatar-defaulted",
          name: "Defaulted",
          title: "D",
          renderedText: "",
          imageNumber: "0001",
          signatureCards: ["Card 1"],
          signatureCardIds: ["card-1"],
        },
      ],
      decklistIds: [["card-1"]],
      draftRecords: [record],
      economy,
    });

    const content = await loadJourneyContent("tides4", "replay");

    expect(content.dreamAvatars[0].startingEssence).toBe(137);
    expect(content.draftMode).toBe("replay");
    expect(content.draftRecords).toEqual([record]);
    expect(content.fitModel).toBeDefined();
  });
});

describe("buildReplayDraftState", () => {
  const cards = [makeCard(101), makeCard(102), makeCard(103), makeCard(104)];
  const idIndex = new Map<string, number>(
    cards.map((card) => [card.id, card.cardNumber]),
  );
  const recordA = makeRecord("record-a", [
    [cards[0].id, cards[1].id],
    [cards[2].id],
  ]);
  const recordB = makeRecord("record-b", [
    [cards[1].id, cards[2].id],
    [cards[3].id],
  ]);
  const records = [recordA, recordB];

  it("rejects an empty record corpus", () => {
    expect(() =>
      buildReplayDraftState(makeDreamAvatar([]), idIndex, "seed", []),
    ).toThrow("requires at least one draft record");
  });

  it("is deterministic and resolves packs plus signature UUIDs", () => {
    const avatar = makeDreamAvatar([cards[0].id, "unknown", cards[2].id]);
    const first = buildReplayDraftState(avatar, idIndex, "seed-a", records);
    const second = buildReplayDraftState(avatar, idIndex, "seed-a", records);

    expect(first).toEqual(second);
    expect(first.mode).toBe("replay");
    expect(first.signatureCardNumbers).toEqual([101, 103]);
    expect(first.packSequence.flat()).toEqual(
      records.find((record) => record.id === first.recordId)?.packIds
        .flat()
        .map((id) => idIndex.get(id)),
    );
  });

  it("draws both records across deterministic seeds", () => {
    const ids = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      ids.add(
        buildReplayDraftState(
          makeDreamAvatar([]),
          idIndex,
          `seed-${String(index)}`,
          records,
        ).recordId,
      );
    }
    expect(ids).toEqual(new Set(["record-a", "record-b"]));
  });

  it("uses the uniform fallback without a fit model", () => {
    const seed = "uniform-seed";
    const state = buildReplayDraftState(
      makeDreamAvatar([cards[0].id]),
      idIndex,
      seed,
      records,
    );
    const expectedIndex = selectRecordIndex(
      hashStringToSeed(`${seed}:replay`),
      records.length,
    );
    expect(state.recordId).toBe(records[expectedIndex].id);
  });

  it("uses positive signature IDF to select a matching record", () => {
    const fitModel: FitModel = {
      idf: new Map([[cards[0].id, 3]]),
      decks: [],
      prior: new Map(),
      coocNorm: new Map(),
      numberToId: new Map(),
      idIndex: new Map(),
      tuning: {
        alpha: 1,
        beta: 0.9,
        gamma: 0.25,
        K: 50,
        idfPower: 1,
        minDf: 2,
        maxDfFrac: 0.6,
        minDeckSize: 16,
        maxDeckSize: 34,
      },
    };
    const avatar = makeDreamAvatar([cards[0].id]);
    const ordered = [recordB, recordA];
    const seed = "fit-seed";
    const state = buildReplayDraftState(avatar, idIndex, seed, ordered, fitModel);
    const expectedIndex = selectReplayRecordIndex(
      avatar.signatureCardIds ?? [],
      ordered,
      fitModel.idf,
      hashStringToSeed(`${seed}:replay`),
    );

    expect(state.recordId).toBe(ordered[expectedIndex].id);
  });
});

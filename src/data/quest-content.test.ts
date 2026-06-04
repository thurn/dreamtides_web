import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadQuestContent } from "./quest-content";
import type { CardData } from "../types/cards";

function makeCard(
  cardNumber: number,
  tides: string[],
): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    tides,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadQuestContent", () => {
  function stubFetch({
    cards,
    dreamcallers,
    dreamsigns,
    decklists,
  }: {
    cards: CardData[];
    dreamcallers: unknown[];
    dreamsigns: unknown[];
    decklists: string[][];
  }): void {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) => {
        const path = String(input);
        if (path === "/cards_v2-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(cards) });
        }
        if (path === "/dreamcallers-v2-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamcallers),
          });
        }
        if (path === "/dreamsign-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamsigns),
          });
        }
        if (path === "/decklists-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(decklists),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch path: ${path}`));
      }),
    );
  }

  it("loads V2 cards, Dreamcallers, decklists and builds the run pool context", async () => {
    const cards = [
      makeCard(1, ["core"]),
      makeCard(2, ["core"]),
      makeCard(3, ["support"]),
    ];
    const v2Dreamcaller = {
      id: "dreamcaller-1",
      name: "Test Dreamcaller",
      title: "Speaker of Tests",
      renderedText: "Test rules text.",
      imageNumber: "0001",
      startingEssence: 235,
      signatureCards: ["Card 1", "Card 2"],
    };

    stubFetch({
      cards,
      dreamcallers: [v2Dreamcaller],
      dreamsigns: [],
      decklists: [["Card 1", "Card 2", "Card 3"]],
    });

    const content = await loadQuestContent();

    expect(content.cardDatabase.size).toBe(cards.length);
    expect(content.dreamcallers).toHaveLength(1);
    // The Dreamcaller mapping must carry the V2 signature cards through.
    expect(content.dreamcallers[0].signatureCards).toEqual(["Card 1", "Card 2"]);
    expect(content.dreamcallers[0].startingEssence).toBe(235);

    // The pool context indexes every loaded card and carries the decklists.
    expect(content.poolContext).toBeDefined();
    const poolContext = content.poolContext!;
    for (const card of cards) {
      expect(poolContext.nameIndex.get(card.name)).toBe(card.cardNumber);
    }
    expect(poolContext.poolData.decklists).not.toHaveLength(0);
  });

  it("offers every Dreamcaller without a validation skip loop", async () => {
    const cards = [makeCard(1, ["core"]), makeCard(2, ["support"])];
    const dreamcallers = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 0,
        signatureCards: ["Card 1"],
      },
      {
        id: "dc-b",
        name: "Beta",
        title: "B",
        renderedText: "",
        imageNumber: "0002",
        startingEssence: 250,
        signatureCards: [],
      },
    ];

    stubFetch({ cards, dreamcallers, dreamsigns: [], decklists: [["Card 1"]] });

    const content = await loadQuestContent();

    expect(content.dreamcallers.map((dc) => dc.id)).toEqual(["dc-a", "dc-b"]);
    // A zero startingEssence falls back to the default rather than being dropped.
    expect(content.dreamcallers[0].startingEssence).toBe(250);
  });
});

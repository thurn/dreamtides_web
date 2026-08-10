import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import { loadTutorialCards } from "./tutorial-cards";
import { TEST_TUTORIAL_CARD_CONSTANTS } from "../test/tutorial-configuration-fixture";

const TUTORIAL_OPPONENT_CARD_ID = TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId;
const TUTORIAL_PLAYER_CARD_ID = TEST_TUTORIAL_CARD_CONSTANTS.tutorialPlayerCharacterCardId;
const TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID =
  TEST_TUTORIAL_CARD_CONSTANTS.handoffEnemyCharacterCardId;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadTutorialCards", () => {
  it("loads the canonical card data without partitioning it by tutorial owner", async () => {
    const other = { id: "other-card", cardNumber: 519 } as CardData;
    const opponent = {
      id: TUTORIAL_OPPONENT_CARD_ID,
      cardNumber: 519,
    } as CardData;
    const player = {
      id: TUTORIAL_PLAYER_CARD_ID,
      cardNumber: 512,
    } as CardData;
    const runeboundChampion = {
      id: TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
      cardNumber: 512,
    } as CardData;
    const finalWitness = {
      id: "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481",
    } as CardData;
    const nocturneStrummer = {
      id: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
    } as CardData;
    const flashpointDetonation = {
      id: "4408b942-09a0-4f4e-a403-10c708c6e3c5",
    } as CardData;
    const glimpseOfWhatWas = {
      id: "2162742c-09d0-4e62-ae49-0f8f79b45adc",
    } as CardData;
    const dreamwell = {
      id: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
      name: "Autumn Glade",
      renderedText: "Gain 2⍟.",
      order: 1,
      energyAdded: 1,
      cardNumber: 5,
      automation: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              path === "/dreamwell-data.json"
                ? [dreamwell]
                : [
                    other,
                    player,
                    opponent,
                    runeboundChampion,
                    finalWitness,
                    nocturneStrummer,
                    flashpointDetonation,
                    glimpseOfWhatWas,
                  ],
            ),
        }),
      ),
    );

    await expect(loadTutorialCards()).resolves.toEqual({
      cards: [
        other,
        player,
        opponent,
        runeboundChampion,
        finalWitness,
        nocturneStrummer,
        flashpointDetonation,
        glimpseOfWhatWas,
      ],
      dreamwell: [dreamwell],
    });
  });

  it("reports card-data fetch failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Unavailable",
      }),
    );
    await expect(loadTutorialCards()).rejects.toThrow("503 Unavailable");
  });
});

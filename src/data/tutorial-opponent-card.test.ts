import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import {
  loadTutorialCards,
  loadTutorialOpponentCard,
  TUTORIAL_FINAL_WITNESS_CARD_ID,
  TUTORIAL_FLASHPOINT_DETONATION_CARD_ID,
  TUTORIAL_GLIMPSE_OF_WHAT_WAS_CARD_ID,
  TUTORIAL_NOCTURNE_STRUMMER_CARD_ID,
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_ID,
  TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
} from "./tutorial-opponent-card";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadTutorialOpponentCard", () => {
  it("resolves both tutorial cards by UUID when card numbers collide", async () => {
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
      id: TUTORIAL_FINAL_WITNESS_CARD_ID,
    } as CardData;
    const nocturneStrummer = {
      id: TUTORIAL_NOCTURNE_STRUMMER_CARD_ID,
    } as CardData;
    const flashpointDetonation = {
      id: TUTORIAL_FLASHPOINT_DETONATION_CARD_ID,
    } as CardData;
    const glimpseOfWhatWas = {
      id: TUTORIAL_GLIMPSE_OF_WHAT_WAS_CARD_ID,
    } as CardData;
    const dreamwell = {
      id: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
      name: "Autumn Glade",
      renderedText: "Gain 2⍟.",
      order: 1,
      energyAdded: 1,
      cardNumber: 5,
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
      opponents: [opponent, runeboundChampion, finalWitness],
      players: [
        player,
        nocturneStrummer,
        flashpointDetonation,
        glimpseOfWhatWas,
      ],
      dreamwell: [dreamwell],
    });
  });

  it("reports a missing UUID and fetch failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              path === "/dreamwell-data.json"
                ? []
                : [
                    { id: TUTORIAL_OPPONENT_CARD_ID } as CardData,
                    {
                      id: TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
                    } as CardData,
                  ],
            ),
        }),
      ),
    );
    await expect(loadTutorialCards()).rejects.toThrow(TUTORIAL_PLAYER_CARD_ID);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Unavailable",
      }),
    );
    await expect(loadTutorialOpponentCard()).rejects.toThrow("503 Unavailable");
  });

  it("keeps the opponent-only loader compatible with UUID-safe callers", async () => {
    const opponent = { id: TUTORIAL_OPPONENT_CARD_ID } as CardData;
    const player = { id: TUTORIAL_PLAYER_CARD_ID } as CardData;
    const runeboundChampion = {
      id: TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
    } as CardData;
    const finalWitness = {
      id: TUTORIAL_FINAL_WITNESS_CARD_ID,
    } as CardData;
    const nocturneStrummer = {
      id: TUTORIAL_NOCTURNE_STRUMMER_CARD_ID,
    } as CardData;
    const flashpointDetonation = {
      id: TUTORIAL_FLASHPOINT_DETONATION_CARD_ID,
    } as CardData;
    const glimpseOfWhatWas = {
      id: TUTORIAL_GLIMPSE_OF_WHAT_WAS_CARD_ID,
    } as CardData;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              path === "/dreamwell-data.json"
                ? []
                : [
                    opponent,
                    player,
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

    await expect(loadTutorialOpponentCard()).resolves.toBe(opponent);
  });
});

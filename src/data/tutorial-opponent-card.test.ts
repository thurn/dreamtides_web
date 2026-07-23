import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import {
  loadTutorialCards,
  loadTutorialOpponentCard,
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_ID,
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
                : [other, player, opponent],
            ),
        }),
      ),
    );

    await expect(loadTutorialCards()).resolves.toEqual({
      opponent,
      player,
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
                : [{ id: TUTORIAL_OPPONENT_CARD_ID } as CardData],
            ),
        }),
      ),
    );
    await expect(loadTutorialCards()).rejects.toThrow(
      TUTORIAL_PLAYER_CARD_ID,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Unavailable",
      }),
    );
    await expect(loadTutorialOpponentCard()).rejects.toThrow(
      "503 Unavailable",
    );
  });

  it("keeps the opponent-only loader compatible with UUID-safe callers", async () => {
    const opponent = { id: TUTORIAL_OPPONENT_CARD_ID } as CardData;
    const player = { id: TUTORIAL_PLAYER_CARD_ID } as CardData;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              path === "/dreamwell-data.json" ? [] : [opponent, player],
            ),
        }),
      ),
    );

    await expect(loadTutorialOpponentCard()).resolves.toBe(opponent);
  });
});

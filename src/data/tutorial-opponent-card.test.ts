import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import {
  loadTutorialOpponentCard,
  TUTORIAL_OPPONENT_CARD_ID,
} from "./tutorial-opponent-card";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadTutorialOpponentCard", () => {
  it("resolves the tutorial card by UUID when card numbers collide", async () => {
    const other = { id: "other-card", cardNumber: 519 } as CardData;
    const tutorial = {
      id: TUTORIAL_OPPONENT_CARD_ID,
      cardNumber: 519,
    } as CardData;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([other, tutorial]),
      }),
    );

    await expect(loadTutorialOpponentCard()).resolves.toBe(tutorial);
  });

  it("reports a missing UUID and fetch failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );
    await expect(loadTutorialOpponentCard()).rejects.toThrow(
      TUTORIAL_OPPONENT_CARD_ID,
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
});

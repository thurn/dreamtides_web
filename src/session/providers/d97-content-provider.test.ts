// The real D97 content provider over synthetic journey content: its reward
// pool is the pool the journey's draft builds for the same Avatar and seed
// (per-card caps applied, cards of rarities bags never hold left out), and a D97 run started
// through the registered providers gets its full starting collection.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAvatarPackage,
  hashStringToSeed,
} from "../../data/journey-content";
import {
  D97_COLLECTION,
  D97_STARTING_PACKAGE,
} from "../../content/d97/collection";
import { eventRng } from "../../eventlog/rng";
import { genesisFoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import { ctx, event } from "../../rules/reducer-fixtures";
import { serializeCardNumber } from "../../types/draft";
import { testJourneySeed } from "../../types/test-identities";
import { createD97ContentProvider } from "./d97-content-provider";
import {
  AVATAR_ID,
  GENESIS,
  makeJourneyContent,
} from "./register-game-providers.fixtures";
import {
  clearGameProviders,
  registerGameProviders,
} from "./register-game-providers";

afterEach(() => {
  clearGameProviders();
  vi.restoreAllMocks();
});

/**
 * The synthetic journey content with rarities: Starter cards are Starter,
 * every fifth other card Legendary and the rest Common.
 */
function makeRarityContent() {
  const content = makeJourneyContent();
  let index = 0;
  for (const [cardNumber, card] of content.cardDatabase) {
    const rarity = card.isStarter
      ? "Starter"
      : index++ % 5 === 0
        ? "Legendary"
        : "Common";
    content.cardDatabase.set(cardNumber, { ...card, rarity });
  }
  return content;
}

describe("createD97ContentProvider", () => {
  it("deals the pool the journey draft deals for the same Avatar and seed", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const content = makeRarityContent();
    const avatar = content.avatars.find((entry) => entry.id === AVATAR_ID);
    if (avatar === undefined) throw new Error("missing Avatar");
    const journeySeed = testJourneySeed("d97-deal");
    const journey = buildAvatarPackage(avatar, content.poolContext, journeySeed);
    const deal = createD97ContentProvider(content).dealRewardPool(
      AVATAR_ID,
      hashStringToSeed(`${journeySeed}:${AVATAR_ID}`),
    );
    const byId = new Map(
      [...content.cardDatabase.values()].map((card) => [card.id, card]),
    );
    const dealtByNumber = Object.fromEntries(
      deal.cards.map(({ cardId, copies }) => {
        const card = byId.get(cardId);
        if (card === undefined) throw new Error("unknown dealt card");
        return [serializeCardNumber(card.cardNumber), copies];
      }),
    );
    const eligible = Object.fromEntries(
      Object.entries(journey.draftPoolCopiesByCard).filter(([number]) => {
        const rarity = content.cardDatabase.get(Number(number))?.rarity;
        return rarity !== undefined && D97_COLLECTION.bagRarities.includes(rarity);
      }),
    );
    expect(Object.keys(eligible).length).toBeGreaterThan(0);
    expect(dealtByNumber).toEqual(eligible);
    expect(deal.joinedTideIds).toEqual(journey.joinedTideIds);
    expect(deal.cards.some(({ cardId }) => byId.get(cardId)?.isStarter)).toBe(
      false,
    );
    expect(
      Object.keys(journey.draftPoolCopiesByCard).some(
        (number) => content.cardDatabase.get(Number(number))?.rarity === "Legendary",
      ),
    ).toBe(true);
    expect(
      deal.cards.some(({ cardId }) => byId.get(cardId)?.rarity === "Legendary"),
    ).toBe(false);
  });

  it("starts a D97 run with its full starting deck through the registered providers", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const content = makeRarityContent();
    registerGameProviders(content);
    const d97Genesis = { ...GENESIS, mode: "d97" as const };
    const result = reduceGameEvent(
      genesisFoldState(d97Genesis),
      event("D97_START_RUN", { avatarId: AVATAR_ID }),
      ctx({ seq: 1, rng: eventRng(d97Genesis.seed, 1) }),
    );
    expect(result.outcome).toBe("applied");
    const copies = result.state.d97?.run?.collection.copies ?? [];
    expect(copies).toHaveLength(D97_STARTING_PACKAGE.pickCount);
    const starters = copies.filter(
      (copy) =>
        [...content.cardDatabase.values()].find((card) => card.id === copy.cardId)
          ?.isStarter === true,
    );
    expect(starters).toHaveLength(
      D97_STARTING_PACKAGE.starterBase +
        D97_STARTING_PACKAGE.starterPerDifficulty * D97_STARTING_PACKAGE.difficulty,
    );
  });
});

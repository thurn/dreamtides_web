// The real D97 content provider over synthetic journey content: a production
// provider registers the dream catalog and no development dream, a
// development provider registers the development dream beside it, each with
// its own speakers; each pinned pool's rings are its tide set's eligible
// cards over the loaded tide catalog (ring 2 outside ring 1, Legendary and
// Starter cards left out), its dealt pool the cards the catalog knows; an
// Avatar without a pinned pool has none; and a D97 run started on the
// provider gets its starting collection from ring 1.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  D97_COLLECTION,
  D97_STARTING_PACKAGE,
} from "../../content/d97/collection";
import { D97_DREAMS } from "../../content/d97/dreams";
import { incarnationFor, type D97DreamResident } from "../../content/d97/dreams/schema";
import { D97_DEVELOPMENT_CONTENT } from "../../d97/development-content";
import { eventRng } from "../../eventlog/rng";
import { genesisFoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import { ctx, event } from "../../rules/reducer-fixtures";
import type { D97PinnedPool } from "../../content/d97/pools/schema";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import { testAvatarId, testCardId } from "../../types/test-identities";
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

/** A pinned pool for the synthetic Avatar over the synthetic tide catalog: signature tide 1, facets 2, 3 and 2. */
function syntheticPinnedPool(content: ReturnType<typeof makeRarityContent>): D97PinnedPool {
  const [first, second, third] = content.poolContext.poolData.tides4Decks!.tides;
  if (first === undefined || second === undefined || third === undefined) throw new Error("synthetic tides missing");
  return {
    avatarId: AVATAR_ID,
    signatureTideId: first.id,
    borrowedSignature: false,
    facetTideIds: [second.id, third.id, second.id],
    dealSeed: 0,
    dealt: [...first.cards.map((card) => ({ cardId: card.id, copies: 1 })), { cardId: testCardId("d97-retired-card"), copies: 1 }],
  };
}

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
  it("registers the dream catalog and no development fixture in production", () => {
    const provider = createD97ContentProvider(makeJourneyContent(), null);
    const development = D97_DEVELOPMENT_CONTENT;
    expect([...provider.dreams.keys()]).toEqual(D97_DREAMS.map((dream) => dream.id));
    expect(provider.dreams.has(development.dream.id)).toBe(false);
    expect(provider.defaultDreamId).toBe(D97_DREAMS[0]?.id ?? null);
    for (const module of development.dialogue.dialogues) expect(provider.dialogue.dialogues.has(module.id)).toBe(false);
    for (const quest of development.dialogue.quests) expect(provider.quests.has(quest.id)).toBe(false);
  });

  it("registers the development dream beside the catalog in development", () => {
    const provider = createD97ContentProvider(makeJourneyContent(), D97_DEVELOPMENT_CONTENT);
    const { dream, map } = D97_DEVELOPMENT_CONTENT;
    expect([...provider.dreams.keys()]).toEqual([...D97_DREAMS.map((entry) => entry.id), dream.id]);
    expect(provider.defaultDreamId).toBe(D97_DREAMS[0]?.id ?? null);
    expect(provider.dreams.get(dream.id)?.anchors.map((anchor) => anchor.id)).toEqual(map.anchors.map((anchor) => anchor.id));
  });

  it("finds each speaking resident's registered dialogue by its anchor, in its own dream", () => {
    const provider = createD97ContentProvider(makeJourneyContent(), D97_DEVELOPMENT_CONTENT);
    const dreams = [...D97_DREAMS, D97_DEVELOPMENT_CONTENT.dream];
    const player = testAvatarId("d97-provider-player");
    const spoken = (resident: D97DreamResident) => incarnationFor(resident, player).dialogueId;
    expect(dreams.some((dream) => dream.residents.some((resident) => spoken(resident) !== null))).toBe(true);
    for (const dream of dreams) {
      const registered = provider.dreams.get(dream.id);
      for (const resident of dream.residents) {
        expect(registered?.speakerDialogue(resident.anchorId, player)?.id ?? null).toBe(spoken(resident));
      }
      for (const other of dreams.filter((entry) => entry.id !== dream.id)) {
        for (const resident of other.residents) expect(registered?.speakerDialogue(resident.anchorId, player)).toBeNull();
      }
    }
  });

  it("builds each pinned pool's rings over the tide catalog's eligible cards", () => {
    const content = makeRarityContent();
    const provider = createD97ContentProvider(content, null, [syntheticPinnedPool(content)]);
    const pool = provider.rewardPool(AVATAR_ID);
    if (pool === null) throw new Error("no pinned pool");
    const byId = new Map([...content.cardDatabase.values()].map((card) => [card.id, card]));
    const tides = content.poolContext.poolData.tides4Decks!.tides;
    const tideCards = (index: number) => new Set(tides[index].cards.map((card) => card.id));
    expect(pool.tideIds).toEqual([tides[0].id, tides[1].id, tides[2].id, tides[1].id]);
    expect(pool.ring1.length).toBeGreaterThan(0);
    expect(pool.ring2.length).toBeGreaterThan(0);
    for (const cardId of pool.ring1) expect(tideCards(0).has(cardId)).toBe(true);
    for (const cardId of pool.ring2) {
      expect(tideCards(0).has(cardId)).toBe(false);
      expect(tideCards(1).has(cardId) || tideCards(2).has(cardId)).toBe(true);
    }
    for (const cardId of [...pool.ring1, ...pool.ring2]) {
      const card = byId.get(cardId);
      expect(card?.isStarter).toBe(false);
      expect(D97_COLLECTION.bagRarities).toContain(card?.rarity);
    }
    const legendary = [...tideCards(0)].filter((cardId) => byId.get(cardId)?.rarity === "Legendary");
    expect(legendary.length).toBeGreaterThan(0);
    expect(pool.dealt.every(({ cardId }) => byId.has(cardId))).toBe(true);
    expect(pool.dealt.length).toBeGreaterThan(0);
    expect(provider.rewardPool(testAvatarId("d97-unpinned-avatar"))).toBeNull();
  });

  it("starts a D97 run with its full starting deck through the registered providers", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const content = makeRarityContent();
    registerGameProviders(content);
    const provider = createD97ContentProvider(content, null, [syntheticPinnedPool(content)]);
    registerD97ContentProvider(provider);
    const ring1 = provider.rewardPool(AVATAR_ID)?.ring1 ?? [];
    const d97Genesis = { ...GENESIS, mode: "d97" as const };
    const result = reduceGameEvent(
      genesisFoldState(d97Genesis),
      event("D97_START_RUN", { avatarId: AVATAR_ID }),
      ctx({ seq: 1, rng: eventRng(d97Genesis.seed, 1) }),
    );
    expect(result.outcome).toBe("applied");
    const copies = result.state.d97?.run?.collection.copies ?? [];
    expect(copies).toHaveLength(Math.min(D97_STARTING_PACKAGE.pickCount, ring1.length));
    const starters = copies.filter(
      (copy) =>
        [...content.cardDatabase.values()].find((card) => card.id === copy.cardId)
          ?.isStarter === true,
    );
    for (const copy of copies) expect(ring1.includes(copy.cardId) || starters.includes(copy)).toBe(true);
    expect(starters).toHaveLength(
      D97_STARTING_PACKAGE.starterBase +
        D97_STARTING_PACKAGE.starterPerDifficulty * D97_STARTING_PACKAGE.difficulty,
    );
  });
});

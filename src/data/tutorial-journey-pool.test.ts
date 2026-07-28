import { describe, expect, it, vi } from "vitest";
import type { DreamAvatarContent } from "../types/content";
import type { RunPoolContext } from "./journey-content";
import { buildTutorialJourneyPackage } from "./tutorial-journey-package";
import { validateTutorialJourneyPool } from "./tutorial-journey-pool";

const CARD_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
] as const;

function syntheticSource(): Record<string, unknown> {
  return {
    "dream-avatar-id": "00000000-0000-4000-8000-000000000010",
    "pool-size": 4,
    tides: [
      {
        id: "first-tide",
        name: "First Tide",
        description: "First description.",
        type: "valor",
        cards: [{ id: CARD_IDS[0], copies: 2 }],
      },
      {
        id: "second-tide",
        name: "Second Tide",
        description: "Second description.",
        type: "valor",
        cards: [{ id: CARD_IDS[1], copies: 1 }],
      },
      {
        id: "third-tide",
        name: "Third Tide",
        description: "Third description.",
        type: "valor",
        cards: [{ id: CARD_IDS[2], copies: 1 }],
      },
    ],
  };
}

function dreamAvatar(id: string): DreamAvatarContent {
  return {
    id,
    name: "Tutorial Avatar",
    title: "Keeper of the Example",
    renderedText: "The first warrior costs less.",
    imageNumber: "1",
    portraitFocus: { x: 0.5, y: 0.5 },
    startingEssence: 100,
  };
}

describe("validateTutorialJourneyPool", () => {
  it("accepts three distinct valor tides whose UUID copies fill the pool", () => {
    const pool = validateTutorialJourneyPool(syntheticSource(), 4);

    expect(pool.tides.map((tide) => tide.type)).toEqual([
      "valor",
      "valor",
      "valor",
    ]);
    expect(pool.tides.flatMap((tide) => tide.cards)).toEqual([
      { id: CARD_IDS[0], copies: 2 },
      { id: CARD_IDS[1], copies: 1 },
      { id: CARD_IDS[2], copies: 1 },
    ]);
  });

  it("rejects pool-wide duplicate card UUIDs", () => {
    const source = syntheticSource();
    const tides = source.tides as Array<Record<string, unknown>>;
    tides[1].cards = [{ id: CARD_IDS[0], copies: 1 }];

    expect(() => validateTutorialJourneyPool(source, 4)).toThrow(
      /duplicates.*00000000-0000-4000-8000-000000000001/u,
    );
  });

  it("rejects a pool that does not match the normal journey size", () => {
    expect(() => validateTutorialJourneyPool(syntheticSource(), 150)).toThrow(
      /normal journey pool size \(150\)/u,
    );
  });
});

describe("buildTutorialJourneyPackage", () => {
  it("resolves UUIDs to a normal draft multiset and logs its tide provenance", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const pool = validateTutorialJourneyPool(syntheticSource(), 4);
    const context = {
      idIndex: new Map([
        [CARD_IDS[0], 101],
        [CARD_IDS[1], 102],
        [CARD_IDS[2], 103],
      ]),
      allDreamsignPoolIds: ["dreamsign-a"],
      poolData: {
        core: new Set(),
        archLists: new Map(),
        draftLists: new Map(),
      },
    } satisfies RunPoolContext;

    const pkg = buildTutorialJourneyPackage(
      dreamAvatar(pool.dreamAvatarId),
      context,
      pool,
    );

    expect(pkg.draftPoolCopiesByCard).toEqual({
      "101": 2,
      "102": 1,
      "103": 1,
    });
    expect(pkg.draftPoolSize).toBe(4);
    expect(pkg.doubledCardCount).toBe(1);
    expect(pkg.dreamsignPoolIds).toEqual(["dreamsign-a"]);
    expect(console.log).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)).toMatchObject({
      event: "draft_pool_constructed",
      algo: "tutorial_tides",
      poolSize: 4,
      distinctCardCount: 3,
      tideIds: ["first-tide", "second-tide", "third-tide"],
    });
  });

  it("rejects an unknown authored card UUID", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const pool = validateTutorialJourneyPool(syntheticSource(), 4);
    const context = {
      idIndex: new Map([[CARD_IDS[0], 101]]),
      allDreamsignPoolIds: [],
      poolData: {
        core: new Set(),
        archLists: new Map(),
        draftLists: new Map(),
      },
    } satisfies RunPoolContext;

    expect(() =>
      buildTutorialJourneyPackage(
        dreamAvatar(pool.dreamAvatarId),
        context,
        pool,
      ),
    ).toThrow(/unknown card UUIDs/u);
  });
});

// The select-screen tides preview must show the EXACT tides the draft will deal
// from, so these tests pin it against `generateTides4` run with the same seed
// formula the pool builder uses. They use a synthetic tides artifact, never the
// committed `data/tides4.jsonc`, whose content is baked design data.

import { describe, expect, it } from "vitest";

import { makeRng } from "../draft/pool/rng.ts";
import type { Tides4DecksJson } from "../draft/pool/tides4-io.ts";
import { generateTides4 } from "../draft/pool/variant-tides4.ts";
import type { PoolData } from "../draft/pool/types.ts";
import type { DreamAvatarContent } from "../types/content.ts";
import { hashStringToSeed, type RunPoolContext } from "./quest-content.ts";
import { selectedTides4Decks } from "./tides4-preview.ts";

function makeTides4(): Tides4DecksJson {
  const mkCards = (tideId: string) =>
    Array.from({ length: 30 }, (_, i) => ({
      id: `${tideId}-card-${String(i)}`,
      name: `Card ${tideId}.${String(i)}`,
      copies: 2,
    }));
  const tides: Tides4DecksJson["tides"] = [
    {
      id: "tide-sig-1",
      name: "Sig 1",
      role: "signature",
      color: "purple",
      cards: mkCards("tide-sig-1"),
    },
    ...Array.from({ length: 6 }, (_, f) => ({
      id: `tide-fac-${String(f + 1)}`,
      name: `Facet ${String(f + 1)}`,
      role: "facet" as const,
      color: "green" as const,
      cards: mkCards(`tide-fac-${String(f + 1)}`),
    })),
    ...Array.from({ length: 2 }, (_, n) => ({
      id: `tide-neu-${String(n + 1)}`,
      name: `Neutral ${String(n + 1)}`,
      role: "neutral" as const,
      color: "blue" as const,
      cards: mkCards(`tide-neu-${String(n + 1)}`),
    })),
  ];
  const facetIds = tides.filter((t) => t.role === "facet").map((t) => t.id);
  const neutralIds = tides.filter((t) => t.role === "neutral").map((t) => t.id);
  return {
    version: 1,
    tides,
    tidePoolByDreamAvatar: {
      "dc-a": { starter: "tide-sig-1", facets: facetIds, neutral: neutralIds },
    },
  };
}

function makeContext(
  decks: Tides4DecksJson | undefined,
  poolVariant: RunPoolContext["poolVariant"],
): RunPoolContext {
  const poolData: PoolData = {
    core: new Set(),
    archLists: new Map(),
    draftLists: new Map(),
    tides4Decks: decks,
  };
  return {
    poolData,
    idIndex: new Map(),
    allDreamsignPoolIds: [],
    poolVariant,
  };
}

const DREAM_AVATAR = { id: "dc-a" } as unknown as DreamAvatarContent;

describe("selectedTides4Decks", () => {
  it("returns the tides the draft deals from, in join order, matching generateTides4", () => {
    const decks = makeTides4();
    const ctx = makeContext(decks, "tides4");
    const seed = "quest-seed-1";

    const preview = selectedTides4Decks(ctx, DREAM_AVATAR, seed);
    const direct = generateTides4(
      makeRng(hashStringToSeed(`${seed}:${DREAM_AVATAR.id}`)),
      ctx.poolData,
      DREAM_AVATAR.id,
    );

    expect(preview.map((t) => t.id)).toEqual(direct.selected.slice(1));
    // The signature/starter tide is always joined first.
    expect(preview[0]?.id).toBe("tide-sig-1");
  });

  it("is deterministic for a given seed", () => {
    const ctx = makeContext(makeTides4(), "tides4");
    const a = selectedTides4Decks(ctx, DREAM_AVATAR, "seed-x");
    const b = selectedTides4Decks(ctx, DREAM_AVATAR, "seed-x");
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
  });

  it("returns nothing for a non-tides4 run", () => {
    const ctx = makeContext(makeTides4(), "idf3");
    expect(selectedTides4Decks(ctx, DREAM_AVATAR, "seed-x")).toEqual([]);
  });

  it("returns nothing when no tide artifact is loaded", () => {
    const ctx = makeContext(undefined, "tides4");
    expect(selectedTides4Decks(ctx, DREAM_AVATAR, "seed-x")).toEqual([]);
  });

  it("returns nothing when there is no pool context", () => {
    expect(selectedTides4Decks(undefined, DREAM_AVATAR, "seed-x")).toEqual([]);
  });
});

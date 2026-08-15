import { testJourneySeed } from "../types/test-identities";
// The select-screen tides preview must show the EXACT tides the draft will deal
// from, so these tests pin it against `generateTides4` run with the same seed
// formula the pool builder uses. They use a synthetic tides artifact, never the
// manually curated production catalog.

import { describe, expect, it } from "vitest";

import { makeRng } from "../draft/pool/rng.ts";
import type { Tides4DecksJson } from "../draft/pool/tides4-io.ts";
import { generateTides4 } from "../draft/pool/variant-tides4.ts";
import type { PoolData } from "../draft/pool/types.ts";
import type { AvatarContent } from "../types/content.ts";
import { hashStringToSeed, type RunPoolContext } from "./journey-content.ts";
import { selectedTides4Decks } from "./tides4-preview.ts";
import {
  testCardId,
  testAvatarId,
  testTideId,
} from "../types/test-identities";

const AVATAR_ID = testAvatarId("dc-a");
const SIGNATURE_TIDE_ID = testTideId("tide-sig-1");

function makeTides4(): Tides4DecksJson {
  const mkCards = (tideIdSeed: string) =>
    Array.from({ length: 30 }, (_, i) => ({
      id: testCardId(`${tideIdSeed}-card-${String(i)}`),
      copies: 2,
    }));
  const tides: Tides4DecksJson["tides"] = [
    {
      id: SIGNATURE_TIDE_ID,
      displayName: "Sig 1",
      auguryPackageReference: "Sig 1 package",
      displayDescription: "Signature description",
      role: "signature",
      resonance: "shadow",
      cards: mkCards("tide-sig-1"),
    },
    ...Array.from({ length: 6 }, (_, f) => ({
      id: testTideId(`tide-fac-${String(f + 1)}`),
      displayName: `Facet ${String(f + 1)}`,
      auguryPackageReference: `Facet ${String(f + 1)} package`,
      displayDescription: `Facet ${String(f + 1)} description`,
      role: "facet" as const,
      resonance: "wild" as const,
      cards: mkCards(`tide-fac-${String(f + 1)}`),
    })),
    ...Array.from({ length: 2 }, (_, n) => ({
      id: testTideId(`tide-neu-${String(n + 1)}`),
      displayName: `Neutral ${String(n + 1)}`,
      auguryPackageReference: `Neutral ${String(n + 1)} package`,
      displayDescription: `Neutral ${String(n + 1)} description`,
      role: "neutral" as const,
      resonance: "vision" as const,
      cards: mkCards(`tide-neu-${String(n + 1)}`),
    })),
  ];
  const facetIds = tides.filter((t) => t.role === "facet").map((t) => t.id);
  const neutralIds = tides.filter((t) => t.role === "neutral").map((t) => t.id);
  return {
    version: 2,
    selection: { bandFraction: 0.25, bandMinimum: 5 },
    tides,
    tidePoolByAvatar: {
      [AVATAR_ID]: {
        starter: SIGNATURE_TIDE_ID,
        facets: facetIds,
        neutral: neutralIds,
      },
    },
  };
}

function makeContext(
  decks: Tides4DecksJson | undefined,
  poolVariant: RunPoolContext["poolVariant"],
): RunPoolContext {
  const poolData: PoolData = {
    tides4Decks: decks,
  };
  return {
    poolData,
    idIndex: new Map(),
    starterCardNumbers: [],
    allDreamsignPoolIds: [],
    poolVariant,
  };
}

const AVATAR: AvatarContent = {
  id: AVATAR_ID,
  name: "Fixture Avatar",
  title: "Fixture",
  renderedText: "",
  imageNumber: "0000",
  startingEssence: 100,
};

describe("selectedTides4Decks", () => {
  it("returns the tides the draft deals from, in join order, matching generateTides4", () => {
    const decks = makeTides4();
    const ctx = makeContext(decks, "tides4");
    const seed = "journey-seed-1";

    const preview = selectedTides4Decks(ctx, AVATAR, testJourneySeed(seed));
    const direct = generateTides4(
      makeRng(hashStringToSeed(`${seed}:${AVATAR.id}`)),
      ctx.poolData,
      AVATAR.id,
    );

    expect(preview.map((t) => t.id)).toEqual(direct.selected.slice(1));
    // The signature/starter tide is always joined first.
    expect(preview[0]?.id).toBe(testTideId("tide-sig-1"));
  });

  it("is deterministic for a given seed", () => {
    const ctx = makeContext(makeTides4(), "tides4");
    const a = selectedTides4Decks(ctx, AVATAR, testJourneySeed("seed-x"));
    const b = selectedTides4Decks(ctx, AVATAR, testJourneySeed("seed-x"));
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
  });

  it("returns nothing when no tide artifact is loaded", () => {
    const ctx = makeContext(undefined, "tides4");
    expect(selectedTides4Decks(ctx, AVATAR, testJourneySeed("seed-x"))).toEqual([]);
  });

  it("returns nothing when there is no pool context", () => {
    expect(selectedTides4Decks(undefined, AVATAR, testJourneySeed("seed-x"))).toEqual([]);
  });
});

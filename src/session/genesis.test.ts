// Stored-genesis contracts: a genesis decodes from storage whether or not its
// content configuration was pinned, only a complete pinned configuration equal
// to this build's opens, and anything else reaches the config gate. A new
// genesis draws a fresh seed unless a URL seed override fixes it.

import { describe, expect, it } from "vitest";
import type { PinnedContentConfig } from "../eventlog/types";
import { decodeGenesis, isFoldableGenesis } from "../eventlog/wire";
import { testFoldHash } from "../types/test-identities";
import {
  createFreshGenesis,
  genesisCompatibility,
  journeySeedFromSeedOverride,
} from "./genesis";
import { CURRENT_REDUCER_VERSION } from "./reducer-version";

const HASH = testFoldHash("genesis");

const CONTENT: PinnedContentConfig = {
  poolVariant: "tides4",
  atlasFoldHash: HASH,
  sitesFoldHash: HASH,
  draftFoldHash: HASH,
  cardRolesFoldHash: HASH,
  economyFoldHash: HASH,
  gambleFoldHash: HASH,
  transfigurationFoldHash: HASH,
  rewardSelectionFoldHash: HASH,
  auguryFoldHash: HASH,
  explorationFoldHash: HASH,
  tutorialFoldHash: HASH,
  opponentsFoldHash: HASH,
  defaultStartingEssence: 200,
  dreamsignCap: 12,
};

function stored(contentConfig?: object): string {
  return JSON.stringify({
    seed: "genesis-seed",
    reducerVersion: CURRENT_REDUCER_VERSION,
    createdAt: 0,
    ...(contentConfig === undefined ? {} : { contentConfig }),
  });
}

describe("stored genesis", () => {
  it("opens a genesis pinned to this build's content", () => {
    const genesis = decodeGenesis(stored(CONTENT));
    expect(genesis).not.toBeNull();
    if (genesis === null) return;
    expect(isFoldableGenesis(genesis)).toBe(true);
    expect(genesisCompatibility(genesis, CONTENT)).toBe("ready");
  });

  it("decodes a genesis without a content configuration and gates it", () => {
    const genesis = decodeGenesis(stored());
    expect(genesis).not.toBeNull();
    if (genesis === null) return;
    expect(isFoldableGenesis(genesis)).toBe(false);
    expect(genesisCompatibility(genesis, CONTENT)).toBe("configGate");
  });

  it("decodes a genesis whose content configuration lacks the economy and gates it", () => {
    const unpinned: Record<string, unknown> = { ...CONTENT };
    delete unpinned.defaultStartingEssence;
    delete unpinned.dreamsignCap;
    const genesis = decodeGenesis(stored(unpinned));
    expect(genesis).not.toBeNull();
    if (genesis === null) return;
    expect(isFoldableGenesis(genesis)).toBe(false);
    expect(genesisCompatibility(genesis, CONTENT)).toBe("configGate");
  });
});

describe("new genesis seed", () => {
  it("draws a fresh seed for each game without a seed override", () => {
    expect(createFreshGenesis(CONTENT).seed).not.toBe(
      createFreshGenesis(CONTENT).seed,
    );
  });

  it("derives the seed from a seed override", () => {
    expect(createFreshGenesis(CONTENT, "main", 7).seed).toBe(
      createFreshGenesis(CONTENT, undefined, 7).seed,
    );
    expect(createFreshGenesis(CONTENT, "main", 7).seed).toBe(
      journeySeedFromSeedOverride(7),
    );
    expect(journeySeedFromSeedOverride(7)).not.toBe(
      journeySeedFromSeedOverride(8),
    );
  });
});

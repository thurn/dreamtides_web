// Stored-genesis contracts: a genesis decodes from storage whether or not its
// content configuration was pinned, only a complete pinned configuration equal
// to this build's opens, and anything else reaches the config gate.

import { describe, expect, it } from "vitest";
import type { PinnedContentConfig } from "../eventlog/types";
import { decodeGenesis, isFoldableGenesis } from "../eventlog/wire";
import { testFoldHash } from "../types/test-identities";
import { genesisCompatibility } from "./genesis";
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

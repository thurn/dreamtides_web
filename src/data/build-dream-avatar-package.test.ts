import { beforeEach, describe, expect, it } from "vitest";

import { makeTestPoolContext } from "../__test-helpers__/pool-context";
import { getLogEntries, resetLog } from "../logging";
import type { DreamAvatarContent } from "../types/content";
import {
  buildDreamAvatarPackage,
  buildDreamAvatarTides4Provenance,
} from "./journey-content";
import { asDreamAvatarId } from "../types/identifiers";

const DREAM_AVATAR: DreamAvatarContent = {
  id: asDreamAvatarId("test-avatar"),
  name: "Test Avatar",
  title: "The Tester",
  renderedText: "",
  imageNumber: "1",
  startingEssence: 250,
  signatureCards: [],
  signatureCardIds: [],
};

describe("tides4 DreamAvatar packages", () => {
  beforeEach(() => resetLog());

  it("builds a deterministic resolved pool and records its tide selection", () => {
    const context = makeTestPoolContext();
    const first = buildDreamAvatarPackage(
      DREAM_AVATAR,
      context,
      "journey-seed",
    );
    const second = buildDreamAvatarPackage(
      DREAM_AVATAR,
      context,
      "journey-seed",
    );

    expect(first.draftPoolCopiesByCard).toEqual(second.draftPoolCopiesByCard);
    expect(first.draftPoolSize).toBe(60);
    expect(first.dreamsignPoolIds).toEqual(["dreamsign-a", "dreamsign-b"]);

    const event = getLogEntries().find(
      (entry) => entry.event === "draft_pool_constructed",
    );
    expect(event?.algo).toBe("tides4");
    expect(event?.tideDeckIds).toEqual(expect.any(Array));
  });

  it("reconstructs card and tide provenance for the same pool", () => {
    const context = makeTestPoolContext();
    const provenance = buildDreamAvatarTides4Provenance(
      DREAM_AVATAR,
      context,
      "journey-seed",
    );

    expect(provenance).not.toBeNull();
    expect(provenance?.dealSize).toBe(60);
    expect(provenance?.tides.some((tide) => tide.joined)).toBe(true);
    expect(
      Object.keys(provenance?.cardProvenanceByNumber ?? {}),
    ).not.toHaveLength(0);
  });
});

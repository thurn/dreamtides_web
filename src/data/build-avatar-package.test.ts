import { testJourneySeed } from "../types/test-identities";
import { beforeEach, describe, expect, it } from "vitest";

import { makeTestPoolContext } from "../__test-helpers__/pool-context";
import { getLogEntries, resetLog } from "../logging";
import type { AvatarContent } from "../types/content";
import {
  buildAvatarPackage,
  buildAvatarTides4Provenance,
} from "./journey-content";
import {
  testAvatarId,
  testDreamsignId,
} from "../types/test-identities";

const AVATAR: AvatarContent = {
  id: testAvatarId("test-avatar"),
  name: "Test Avatar",
  title: "The Tester",
  renderedText: "",
  imageNumber: "1",
  startingEssence: 250,
  signatureCards: [],
  signatureCardIds: [],
};

describe("tides4 Avatar packages", () => {
  beforeEach(() => resetLog());

  it("builds a deterministic resolved pool and records its tide selection", () => {
    const context = makeTestPoolContext();
    const first = buildAvatarPackage(
      AVATAR,
      context,
      testJourneySeed("journey-seed"),
    );
    const second = buildAvatarPackage(
      AVATAR,
      context,
      testJourneySeed("journey-seed"),
    );

    expect(first.draftPoolCopiesByCard).toEqual(second.draftPoolCopiesByCard);
    expect(first.draftPoolSize).toBe(60);
    expect(first.dreamsignPoolIds).toEqual([
      testDreamsignId("dreamsign-a"),
      testDreamsignId("dreamsign-b"),
    ]);

    const event = getLogEntries().find(
      (entry) => entry.event === "draft_pool_constructed",
    );
    expect(event?.algo).toBe("tides4");
    expect(event?.tideDeckIds).toEqual(expect.any(Array));
  });

  it("reconstructs card and tide provenance for the same pool", () => {
    const context = makeTestPoolContext();
    const provenance = buildAvatarTides4Provenance(
      AVATAR,
      context,
      testJourneySeed("journey-seed"),
    );

    expect(provenance).not.toBeNull();
    expect(provenance?.dealSize).toBe(60);
    expect(provenance?.tides.some((tide) => tide.joined)).toBe(true);
    expect(
      Object.keys(provenance?.cardProvenanceByNumber ?? {}),
    ).not.toHaveLength(0);
  });
});

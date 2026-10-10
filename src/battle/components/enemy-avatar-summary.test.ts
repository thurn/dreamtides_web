// The enemy Avatar summary resolves its content Avatar by the descriptor's
// Avatar UUID only. Names are display text: a descriptor whose name matches an
// Avatar is never resolved to it, and an unknown Avatar UUID is logged.
import { beforeEach, describe, expect, it } from "vitest";
import { getLogEntries, resetLog } from "../../logging";
import type { AvatarContent } from "../../types/content";
import { testAvatarId, testOpponentId } from "../../types/test-identities";
import type { BattleEnemyDescriptor } from "../types";
import { resolveEnemyAvatarSummary } from "./enemy-avatar-summary";

const SHARED_NAME = "Synthetic Rival";

const FOCUSED_AVATAR: AvatarContent = {
  id: testAvatarId("avatar-focused"),
  name: SHARED_NAME,
  title: "Focused Title",
  renderedText: "Focused ability.",
  imageNumber: "042",
  portraitFocus: { x: 0.25, y: 0.75 },
  startingEssence: 250,
};

const TWIN_AVATAR: AvatarContent = {
  id: testAvatarId("avatar-twin"),
  name: SHARED_NAME,
  title: "Twin Title",
  renderedText: "Twin ability.",
  imageNumber: "043",
  portraitFocus: { x: 0.5, y: 0.5 },
  startingEssence: 250,
};

const CONTENT = { avatars: [TWIN_AVATAR, FOCUSED_AVATAR] };

function descriptor(
  overrides: Partial<BattleEnemyDescriptor> = {},
): BattleEnemyDescriptor {
  return {
    id: testOpponentId("opponent-under-test"),
    name: SHARED_NAME,
    subtitle: "Descriptor Title",
    portraitSeed: 0,
    abilityText: "Descriptor ability.",
    dreamsigns: [],
    signatureCards: [],
    ...overrides,
  };
}

describe("resolveEnemyAvatarSummary", () => {
  beforeEach(() => resetLog());

  it("resolves the Avatar the descriptor's UUID names among same-name Avatars", () => {
    const summary = resolveEnemyAvatarSummary(
      descriptor({ avatarId: FOCUSED_AVATAR.id }),
      CONTENT,
    );

    expect(summary.id).toBe(FOCUSED_AVATAR.id);
    expect(summary.imageNumber).toBe(FOCUSED_AVATAR.imageNumber);
    expect(summary.portraitFocus).toEqual(FOCUSED_AVATAR.portraitFocus);
    expect(getLogEntries()).toEqual([]);
  });

  it("resolves no Avatar for a descriptor without an Avatar UUID, whatever its name", () => {
    const opponent = descriptor();
    const summary = resolveEnemyAvatarSummary(opponent, CONTENT);

    expect(summary.id).toBe(opponent.id);
    expect(summary.imageNumber).toBe("001");
    expect(summary.portraitFocus).toBeUndefined();
    expect(getLogEntries()).toEqual([]);
  });

  it("logs an Avatar UUID missing from the content instead of guessing by name", () => {
    const missingId = testAvatarId("avatar-missing");
    const opponent = descriptor({ avatarId: missingId, imageNumber: "007" });

    const summary = resolveEnemyAvatarSummary(opponent, CONTENT);
    resolveEnemyAvatarSummary(opponent, CONTENT);

    expect(summary.id).toBe(opponent.id);
    expect(summary.imageNumber).toBe("007");
    expect(summary.portraitFocus).toBeUndefined();
    const missing = getLogEntries().filter(
      (entry) => entry.event === "battle_enemy_avatar_missing",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      opponentId: opponent.id,
      avatarId: missingId,
    });
  });
});

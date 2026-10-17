// The D97 encounter preview view model: an Avatar character leads with its
// Avatar's name and epithet and fights with its ability; a generic opponent
// leads with the name its dialogue speaks under, or its role when it has
// none, names no Avatar and carries no ability; every opponent carries its
// own character for the bust; the stakes and stats pass through.

import { describe, expect, it } from "vitest";
import { emptyCollection } from "../../../d97/collection/collection";
import type { D97Encounter } from "../../../rules/d97/d97-state";
import type { AvatarContent } from "../../../types/content";
import { parseD97CharacterId, parseDreamAnchorId } from "../../../types/identifiers";
import { testAvatarId } from "../../../types/test-identities";
import { buildD97EncounterPreviewView } from "./d97-encounter-preview-view-model";

const AVATAR: AvatarContent = {
  id: testAvatarId("preview-avatar"),
  name: "Avatar Name",
  title: "Avatar Epithet",
  renderedText: "Avatar ability.",
  imageNumber: "0001",
  startingEssence: 200,
};

const ENCOUNTER: D97Encounter = {
  anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000101"),
  characterId: parseD97CharacterId("d9700000-0000-4000-8000-000000000102"),
  role: "challenger",
  kind: "generic",
  tier: 4,
  avatarId: AVATAR.id,
  abilityActive: false,
  deck: [],
  draftPool: [],
  dreamsignIds: [],
  signatureCardIds: [],
  scoreToWin: 15,
  playerAnteCopyId: null,
  opponentAnteCardId: null,
  extra: { kind: "essence", amount: 10 },
  battles: 0,
  beaten: false,
};

function preview(encounter: D97Encounter, speakerName: string | null) {
  const view = buildD97EncounterPreviewView(emptyCollection(), encounter, [AVATAR], new Map(), speakerName);
  if (view === null) throw new Error("no preview");
  return view;
}

describe("buildD97EncounterPreviewView", () => {
  it("leads a generic opponent with its speaker name and names no Avatar", () => {
    const view = preview(ENCOUNTER, "Speaker Name");
    expect(view.opponent.name).toBe("Speaker Name");
    expect(view.opponent.characterId).toBe(ENCOUNTER.characterId);
    expect([view.opponent.name, view.opponent.epithet]).not.toContain(AVATAR.name);
    expect(view.avatar.ability).toBeNull();
    expect(view.scoreToWin).toBe(15);
    expect(view.extraEssence).toBe(10);
  });

  it("falls back to the role for a generic opponent with no name", () => {
    const view = preview(ENCOUNTER, null);
    expect(view.opponent.name).toBe(view.opponent.epithet);
    expect(view.opponent.name).not.toBe(AVATAR.name);
  });

  it("leads an Avatar character with its Avatar and its ability", () => {
    const view = preview({ ...ENCOUNTER, kind: "avatar", abilityActive: true }, "Speaker Name");
    expect(view.opponent).toEqual({ name: AVATAR.name, epithet: AVATAR.title, characterId: ENCOUNTER.characterId });
    expect(view.avatar.ability).toBe(AVATAR.renderedText);
  });

  it("is null for an Avatar outside the roster", () => {
    expect(buildD97EncounterPreviewView(emptyCollection(), ENCOUNTER, [], new Map(), null)).toBeNull();
  });
});

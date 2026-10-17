// D97 slice-end and door-veil view-model rules: the summary counts battles,
// beaten opponents, owned copies and the active deck from the run and shows
// its Avatar (or none when it is missing from the roster); only the exit door
// gets the act-exit veil.

import { describe, expect, it } from "vitest";
import { DEVELOPMENT_DREAM } from "../../../content/d97/dreams/development";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { AvatarContent } from "../../../types/content";
import { parseDreamAnchorId } from "../../../types/identifiers";
import { testAvatarId } from "../../../types/test-identities";
import { buildD97DoorVeils } from "./d97-overworld-view-model";
import { buildD97SliceEndView } from "./d97-slice-end-view-model";

const AVATAR = { id: testAvatarId("slice-end"), name: "Name", title: "Title", renderedText: "Ability", imageNumber: "7" } as AvatarContent;
const BEATEN = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000b1");
const STANDING = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000b2");

const RUN = {
  avatarId: AVATAR.id,
  battlesFought: 3,
  essence: 140,
  encounters: { [BEATEN]: { anchorId: BEATEN, beaten: true }, [STANDING]: { anchorId: STANDING, beaten: false } },
  collection: { copies: [{ zone: "deck" }, { zone: "deck" }, { zone: "reserve" }] },
} as unknown as D97Run;

describe("buildD97SliceEndView", () => {
  it("summarizes the run under its Avatar", () => {
    const view = buildD97SliceEndView(RUN, [AVATAR]);
    expect(view.avatar?.id).toBe(AVATAR.id);
    expect(Object.fromEntries(view.stats.map((stat) => [stat.id, stat.value]))).toEqual({
      battles: 3,
      beaten: 1,
      collection: 3,
      deck: 2,
      essence: 140,
    });
    expect(view.stats.find((stat) => stat.id === "essence")?.kind).toBe("essence");
  });

  it("shows no portrait for an Avatar missing from the roster", () => {
    expect(buildD97SliceEndView(RUN, []).avatar).toBeNull();
  });
});

describe("buildD97DoorVeils", () => {
  it("gives only the exit door the act-exit veil", () => {
    const { topology } = DEVELOPMENT_DREAM;
    const veils = buildD97DoorVeils(topology);
    expect(veils.get(topology.exitDoorAnchorId)).toBe("actExit");
    expect(veils.has(topology.arrivalDoorAnchorId)).toBe(false);
  });
});

// Version 3 to 4 over a synthetic version-3 run: bag v0 becomes the version-4
// bags at stage 1, the run's Avatar's draws each card's `acquired` less its
// owned ante copies (floored at zero, cards without draws left out), every
// other bag empty; the rest of the run is kept; a save without a run passes
// through.

import { describe, expect, it } from "vitest";
import { V3_TO_V4 } from "./v3-to-v4";

const AVATAR = "a0000000-0000-4000-8000-000000000001";
const [A, B, C, D] = ["c0000000-0000-4000-8000-00000000000a", "c0000000-0000-4000-8000-00000000000b", "c0000000-0000-4000-8000-00000000000c", "c0000000-0000-4000-8000-00000000000d"];

function copy(card: string, channel: string) {
  return { copyId: `${card}-${channel}`, cardId: card, zone: "reserve", modifications: [], provenance: { channel, battleCount: 0 } };
}

const V3 = {
  format: "dreamtides-97-save",
  schemaVersion: 3,
  d97: {
    screen: { type: "overworld" },
    run: {
      avatarId: AVATAR,
      collection: { copies: [copy(A, "starting"), copy(B, "ante"), copy(B, "bundle"), copy(C, "ante")], nextCopyOrdinal: 4 },
      bag: {
        avatarId: AVATAR,
        dealSeed: 9,
        joinedTideIds: ["t0000000-0000-4000-8000-000000000001"],
        entries: [
          { cardId: B, target: 2, acquired: 2 },
          { cardId: A, target: 2, acquired: 1 },
          { cardId: C, target: 1, acquired: 1 },
          { cardId: D, target: 2, acquired: 0 },
        ],
      },
      encounters: { anchor: { anchorId: "anchor", tier: 4 } },
    },
  },
};

describe("V3_TO_V4", () => {
  it("derives each bag-v0 card's draws from its acquisitions outside antes", () => {
    const run = (V3_TO_V4.migrate(V3).d97 as { run: Record<string, unknown> }).run;
    expect(run).not.toHaveProperty("bag");
    expect(run.bags).toEqual({ stage: 1, drawn: { [AVATAR]: { [A]: 1, [B]: 1 } } });
    expect(Object.keys((run.bags as { drawn: Record<string, Record<string, number>> }).drawn[AVATAR])).toEqual([A, B]);
    expect(run.encounters).toEqual({ anchor: { anchorId: "anchor", tier: 4 } });
  });

  it("starts every bag empty when bag v0 counted no draws", () => {
    const empty = { ...V3, d97: { ...V3.d97, run: { ...V3.d97.run, bag: { ...V3.d97.run.bag, entries: [{ cardId: C, target: 1, acquired: 1 }] } } } };
    expect((V3_TO_V4.migrate(empty).d97 as { run: Record<string, unknown> }).run.bags).toEqual({ stage: 1, drawn: {} });
  });

  it("passes a save without a run through", () => {
    const select = { ...V3, d97: { screen: { type: "avatarSelect" }, run: null } };
    expect(V3_TO_V4.migrate(select)).toEqual(select);
  });
});

// The permanent reducer regression net.
//
// Each checked-in fixture (`fixtures/*.json`) stores `{ providerSet, genesis,
// events, finalHash }`. Replaying its event log through `GAME_ENGINE_CONFIG`
// must reproduce the stamped `finalHash`. A mismatch means either the reducer
// changed behavior (an intentional change → regenerate via
// `scripts/regenerate-replay-fixtures.mjs`) or nondeterminism / an unintended
// rules change crept in (a bug). This is the whole-reducer safety net.
//
// The fixtures are SYNTHETIC seeds built with the DETERMINISTIC providers in
// `./fixture-providers` (the real content generators are deferred to Stage D).
// The test MUST register the SAME providers the generator used, or the replay
// would fold differently than when the hash was stamped — hence the shared
// module and the beforeAll/afterAll registration (cleared so no other suite is
// affected).

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Genesis } from "../../eventlog/types";
import { NIGHTMARE_CARD_NUMBER } from "../../data/nightmare";
import { createMessageDescriptor } from "../../data/localization-descriptors";
import type { FoldState } from "../fold-state";
import { GAME_ENGINE_CONFIG, replayLog, type SeqEvent } from "./replay";
import {
  FIXTURE_PROVIDER_SET,
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "./fixture-providers";
import adversarial from "./fixtures/adversarial.json";
import battle from "./fixtures/battle.json";
import journeyOnly from "./fixtures/journey-only.json";

interface ReplayFixture {
  providerSet: string;
  genesis: Genesis;
  events: SeqEvent[];
  finalHash: string;
}

const FIXTURES: Array<{ name: string; fixture: ReplayFixture }> = [
  { name: "journey-only", fixture: journeyOnly },
  { name: "battle", fixture: battle },
  { name: "adversarial", fixture: adversarial },
];

beforeAll(() => {
  registerReplayFixtureProviders();
});

afterAll(() => {
  clearReplayFixtureProviders();
});

describe("replay fixtures", () => {
  it("round-trips a descriptor-bearing pending prompt through compaction", () => {
    const base = GAME_ENGINE_CONFIG.genesisState(journeyOnly.genesis);
    const state: FoldState = {
      ...base,
      battle: {
        init: {} as never,
        board: {} as never,
        effectQueue: [],
        pendingPrompt: {
          promptId: 17,
          run: { scriptRef: { table: "battle", id: "synthetic" }, cursor: [0], side: "player" },
          kind: "choice",
          options: {
            kind: "choice",
            label: createMessageDescriptor("battle-prompt-choose-one"),
            options: [{ label: createMessageDescriptor("battle-prompt-confirm-yes") }],
          },
        },
        dawnFired: {} as never,
      },
    };
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(state));
    expect(decoded.battle?.pendingPrompt).toEqual(state.battle?.pendingPrompt);
  });

  it("normalizes every compacted Bane reference to Nightmare", () => {
    const state = GAME_ENGINE_CONFIG.genesisState(journeyOnly.genesis);
    const decoded = GAME_ENGINE_CONFIG.decode(
      JSON.stringify({
        ...state,
        journey: {
          ...state.journey,
          deck: [
            { entryId: "nightmare", cardNumber: NIGHTMARE_CARD_NUMBER, isBane: false },
            { entryId: "retired", cardNumber: 44, isBane: true },
          ],
          dreamsigns: [
            { id: "negative", name: "Sign", effectDescription: "", isBane: true },
          ],
          battleModifiers: [
            {
              kind: "temporary_bane_grant",
              count: 1,
              battlesRemaining: 1,
              addedEntryIds: ["nightmare"],
              source: "historical-log",
            },
            {
              kind: "temporary_bane_grant",
              count: 1,
              battlesRemaining: 1,
              addedEntryIds: ["retired"],
              source: "historical-log",
            },
          ],
        },
      }),
    );

    expect(decoded.journey.deck).toEqual([
      expect.objectContaining({ entryId: "nightmare", isBane: true }),
      expect.objectContaining({
        entryId: "retired",
        cardNumber: NIGHTMARE_CARD_NUMBER,
        isBane: true,
      }),
    ]);
    expect(decoded.journey.dreamsigns).toEqual([
      expect.objectContaining({ id: "negative" }),
    ]);
    expect(decoded.journey.dreamsigns[0]).not.toHaveProperty("isBane");
    expect(decoded.journey.dreamsigns[0]).not.toHaveProperty("isNegative");
    expect(decoded.journey.battleModifiers).toEqual([
      expect.objectContaining({ kind: "temporary_nightmare_grant" }),
      expect.objectContaining({ kind: "temporary_nightmare_grant" }),
    ]);
  });

  it.each(FIXTURES)(
    "$name replays to its stamped finalHash",
    ({ fixture }) => {
      expect(fixture.providerSet).toBe(FIXTURE_PROVIDER_SET);
      const result = replayLog({
        genesis: fixture.genesis,
        events: fixture.events,
      });
      expect(result.finalHash).toBe(fixture.finalHash);
    },
  );

  it.each(FIXTURES)(
    "$name replays deterministically (same hash twice)",
    ({ fixture }) => {
      const once = replayLog({ genesis: fixture.genesis, events: fixture.events });
      const twice = replayLog({ genesis: fixture.genesis, events: fixture.events });
      expect(once.finalHash).toBe(twice.finalHash);
    },
  );

  it.each(FIXTURES)(
    "$name final state survives the config's encode/decode round-trip",
    ({ fixture }) => {
      const { finalState } = replayLog({
        genesis: fixture.genesis,
        events: fixture.events,
      });
      const roundTripped = GAME_ENGINE_CONFIG.decode(
        GAME_ENGINE_CONFIG.encode(finalState),
      );
      expect(GAME_ENGINE_CONFIG.hash(roundTripped)).toBe(fixture.finalHash);
    },
  );
});

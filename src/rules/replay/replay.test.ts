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
import { GAME_ENGINE_CONFIG, replayLog, type SeqEvent } from "./replay";
import {
  FIXTURE_PROVIDER_SET,
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "./fixture-providers";
import adversarial from "./fixtures/adversarial.json";
import battle from "./fixtures/battle.json";
import questOnly from "./fixtures/quest-only.json";

interface ReplayFixture {
  providerSet: string;
  genesis: Genesis;
  events: SeqEvent[];
  finalHash: string;
}

const FIXTURES: Array<{ name: string; fixture: ReplayFixture }> = [
  { name: "quest-only", fixture: questOnly as unknown as ReplayFixture },
  { name: "battle", fixture: battle as unknown as ReplayFixture },
  { name: "adversarial", fixture: adversarial as unknown as ReplayFixture },
];

beforeAll(() => {
  registerReplayFixtureProviders();
});

afterAll(() => {
  clearReplayFixtureProviders();
});

describe("replay fixtures", () => {
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

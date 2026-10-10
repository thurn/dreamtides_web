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
// `./fixture-providers`, never the real content generators, so the fixtures
// never couple to catalog data.
// The test MUST register the SAME providers the generator used, or the replay
// would fold differently than when the hash was stamped — hence the shared
// module and the beforeAll/afterAll registration (cleared so no other suite is
// affected).

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Genesis } from "../../eventlog/types";
import { decodeEvent, decodeGenesis, isFoldableGenesis } from "../../eventlog/wire";
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
  // eslint-disable-next-line dreamtides/no-raw-string-identity -- the replay fixture records the expected state hash as raw JSON text
  finalHash: string;
}

function parseReplayFixture(raw: {
  providerSet: string;
  genesis: unknown;
  events: Array<{ seq: number; event: unknown }>;
  // eslint-disable-next-line dreamtides/no-raw-string-identity -- the replay fixture records the expected state hash as raw JSON text
  finalHash: string;
}): ReplayFixture {
  const genesis = decodeGenesis(JSON.stringify(raw.genesis));
  if (genesis === null || !isFoldableGenesis(genesis)) {
    throw new Error("Replay fixture has invalid genesis.");
  }
  const events = raw.events.map(({ seq, event }) => ({
    seq,
    event: decodeEvent(JSON.stringify(event)),
  }));
  return { ...raw, genesis, events };
}

const JOURNEY_ONLY_FIXTURE = parseReplayFixture(journeyOnly);
const BATTLE_FIXTURE = parseReplayFixture(battle);
const ADVERSARIAL_FIXTURE = parseReplayFixture(adversarial);

const FIXTURES: Array<{ name: string; fixture: ReplayFixture }> = [
  { name: "journey-only", fixture: JOURNEY_ONLY_FIXTURE },
  { name: "battle", fixture: BATTLE_FIXTURE },
  { name: "adversarial", fixture: ADVERSARIAL_FIXTURE },
];

beforeAll(() => {
  registerReplayFixtureProviders();
});

afterAll(() => {
  clearReplayFixtureProviders();
});

describe("replay fixtures", () => {
  it.each(FIXTURES)("$name replays to its stamped finalHash", ({ fixture }) => {
    expect(fixture.providerSet).toBe(FIXTURE_PROVIDER_SET);
    const result = replayLog({
      genesis: fixture.genesis,
      events: fixture.events,
    });
    expect(result.finalHash).toBe(fixture.finalHash);
  });

  it.each(FIXTURES)(
    "$name replays deterministically (same hash twice)",
    ({ fixture }) => {
      const once = replayLog({
        genesis: fixture.genesis,
        events: fixture.events,
      });
      const twice = replayLog({
        genesis: fixture.genesis,
        events: fixture.events,
      });
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

// Regenerate the synthetic replay fixtures — the permanent reducer regression
// net (src/rules/replay/fixtures/*.json).
//
//   npm run regenerate-replay-fixtures
//
// The rules modules use TS enums and extensionless imports that node's
// --experimental-strip-types resolver cannot follow, so this script runs under
// `tsx`.
//
// Each fixture is a checked-in `{ providerSet, genesis, events, finalHash }`.
// These are SYNTHETIC seeds: they use the DETERMINISTIC fixture providers
// (src/rules/replay/fixture-providers.ts, shared with replay.test.ts), NOT the
// real content generators (which live in src/session/providers/). The fixtures
// stay synthetic on purpose: real-content hashes would couple this regression
// net to the content catalogs. When an intentional reducer or rules-table
// change moves the hashes, re-run this script to re-stamp `finalHash`. The
// fixtures assert on HASHES only, never on card content: Dreamwell scripts are
// selected from the live effects table by structure, and card definitions in
// the fixtures are synthetic, so a content edit does not move them.
//
// Determinism check: run twice; the two runs must produce byte-identical files.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { parseEventActor, parseEventType } from "../src/eventlog/types.ts";
import { replayLog } from "../src/rules/replay/replay.ts";
import { pendingEnginePrompt } from "../src/rules/battle/engine-battle.ts";
import { SELECTION_RULES_VERSION } from "../src/reward-selection/types.ts";
import { parseJourneySeed } from "../src/types/journey-seed.ts";
import { parseReducerVersion } from "../src/types/reducer-version.ts";
import {
  BATTLE_SITE_ID,
  AVATAR_ID,
  ESSENCE_SITE_ID,
  FIXTURE_ENGINE,
  FIXTURE_POINTS_MODE,
  FIXTURE_PROVIDER_SET,
  NODE_ID,
  SHOP_SITE_ID,
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../src/rules/replay/fixture-providers.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../src/rules/replay/fixtures");
const TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * @typedef {import("../src/eventlog/types.ts").Genesis} Genesis
 * @typedef {import("../src/rules/replay/replay.ts").SeqEvent} SeqEvent
 * @typedef {Record<string, unknown>} Payload
 */

/**
 * Build a committed event.
 *
 * @param {number} seq
 * @param {string} type
 * @param {Payload} payload
 * @param {string} actor
 * @param {number} basedOnSeq
 * @returns {SeqEvent}
 */
function ev(seq, type, payload, actor, basedOnSeq) {
  return {
    seq,
    event: {
      type: parseEventType(type),
      payload,
      actor: parseEventActor(actor),
      clientTimestamp: TIMESTAMP,
      basedOnSeq,
    },
  };
}

/**
 * A single-actor chain: basedOnSeq = seq - 1, so every intervening window is empty.
 *
 * @param {string} actor
 * @param {Array<[string, Payload]>} steps
 * @returns {SeqEvent[]}
 */
function chain(actor, steps) {
  return steps.map(([type, payload], index) =>
    ev(index + 1, type, payload, actor, index),
  );
}

/**
 * The first card in the player's hand of the engine battle `events` fold to.
 *
 * @param {Genesis} gen
 * @param {SeqEvent[]} events
 * @returns {string}
 */
function firstHandCard(gen, events) {
  const { finalState } = replayLog({ genesis: gen, events });
  const card = finalState.battle?.engine?.slice.committed.sides.player.hand[0];
  if (card === undefined) {
    throw new Error("the engine battle has no card in the player's hand");
  }
  return card;
}

/**
 * The id of the engine prompt `events` fold to.
 *
 * @param {Genesis} gen
 * @param {SeqEvent[]} events
 * @returns {string}
 */
function pendingPromptId(gen, events) {
  const { finalState } = replayLog({ genesis: gen, events });
  const pending = pendingEnginePrompt(finalState.battle, FIXTURE_ENGINE);
  if (pending === null) throw new Error("no engine prompt is pending");
  return pending.prompt.id;
}

/**
 * A BATTLE_ACTION playing `card` from the player's hand.
 *
 * @param {string} card
 * @returns {Payload}
 */
function playFromHand(card) {
  return { side: "player", action: { kind: "play", card, from: "hand" } };
}

/**
 * Synthetic economy pinned into every fixture genesis. The initial fold state
 * reads the starting Essence and Dreamsign cap from the genesis content
 * configuration, so these values participate in the replayed hash.
 */
const FIXTURE_ECONOMY = { defaultStartingEssence: 200, dreamsignCap: 12 };

/**
 * @param {string} seed
 * @returns {Genesis}
 */
function genesis(seed) {
  return {
    seed: parseJourneySeed(seed),
    reducerVersion: parseReducerVersion("fixture"),
    createdAt: 0,
    contentConfig: { poolVariant: "tides4", ...FIXTURE_ECONOMY },
  };
}

/**
 * Fold `events`, asserting the outcome at each 1-indexed position matches.
 *
 * @param {string} label
 * @param {SeqEvent[]} events
 * @param {Genesis} gen
 * @param {Record<number, string>} expected
 */
function expectOutcomes(label, events, gen, expected) {
  const { outcomes } = replayLog({ genesis: gen, events });
  for (const [seq, want] of Object.entries(expected)) {
    const got = outcomes.find((o) => o.seq === Number(seq));
    if (got === undefined) {
      throw new Error(`${label}: no outcome for seq ${seq}`);
    }
    if (got.outcome !== want) {
      const why = got.error ? ` (error: ${got.error.message})` : "";
      throw new Error(
        `${label}: seq ${seq} expected ${want} but got ${got.outcome}${why}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// (a) journey-only: start -> avatar -> open/accept -> shop buy
// ---------------------------------------------------------------------------

function journeyOnlyFixture() {
  const gen = genesis("fixture-journey-only");
  const events = chain("p1", [
    ["START_JOURNEY", { avatarId: AVATAR_ID }],
    ["SELECT_AVATAR", { avatarId: AVATAR_ID }],
    ["OPEN_SITE", { siteId: ESSENCE_SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION }],
    ["ACCEPT_ESSENCE", { siteId: ESSENCE_SITE_ID }],
    ["OPEN_SITE", { siteId: SHOP_SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION }],
    ["BUY_SHOP_SLOT", { siteId: SHOP_SITE_ID, slotIndex: 0 }],
  ]);
  expectOutcomes("journey-only", events, gen, {
    1: "applied",
    2: "applied",
    3: "applied",
    4: "applied",
    5: "applied",
    6: "applied",
  });
  return finalize("journey-only", gen, events);
}

// ---------------------------------------------------------------------------
// (b) battle: begin -> play -> cancel at the prompt -> play -> answer -> victory
// ---------------------------------------------------------------------------

function battleFixture() {
  const gen = genesis("fixture-battle");
  const begun = chain("p1", [
    ["START_JOURNEY", { avatarId: AVATAR_ID }],
    ["ENTER_SITE", { siteId: BATTLE_SITE_ID }],
    ["BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }],
  ]);
  const card = firstHandCard(gen, begun);
  // Play the points card, cancel at its mode prompt, then play it again.
  const played = [...begun, ev(4, "BATTLE_ACTION", playFromHand(card), "p1", 3)];
  const cancelled = [
    ...played,
    ev(5, "BATTLE_CANCEL", { side: "player", promptId: pendingPromptId(gen, played) }, "p1", 4),
  ];
  const replayed = [...cancelled, ev(6, "BATTLE_ACTION", playFromHand(card), "p1", 5)];
  const events = [
    ...replayed,
    ev(
      7,
      "BATTLE_ANSWER",
      { side: "player", promptId: pendingPromptId(gen, replayed), value: FIXTURE_POINTS_MODE },
      "p1",
      6,
    ),
    ev(8, "END_BATTLE", {}, "p1", 7),
  ];
  expectOutcomes("battle", events, gen, {
    1: "applied",
    2: "applied",
    3: "applied",
    4: "applied",
    5: "applied",
    6: "applied",
    7: "applied",
    8: "applied",
  });
  // Victory clears the battle slice.
  const done = replayLog({ genesis: gen, events });
  if (done.finalState.battle !== null) {
    throw new Error("battle fixture: END_BATTLE victory did not clear the battle");
  }
  if (
    done.finalState.journey.completionLevel !== 1 ||
    done.finalState.journey.atlas.nodes[NODE_ID]?.state !== "completed"
  ) {
    throw new Error("battle fixture: END_BATTLE did not commit Atlas progress");
  }
  return finalize("battle", gen, events);
}

// ---------------------------------------------------------------------------
// (c) adversarial: two actors — CAS bounce, OPEN_SITE race, prompt race
// ---------------------------------------------------------------------------

function adversarialFixture() {
  const gen = genesis("fixture-adversarial");
  const begun = [
    ev(1, "START_JOURNEY", { avatarId: AVATAR_ID }, "alice", 0),
    // bob's essence adjust applies; alice's, based on the pre-bob state, sees
    // bob's applied non-neutral event in its window and BOUNCES (CAS rule 3).
    ev(2, "ADJUST_ESSENCE", { delta: 10 }, "bob", 1),
    ev(3, "ADJUST_ESSENCE", { delta: 20 }, "alice", 1),
    ev(4, "ENTER_SITE", { siteId: ESSENCE_SITE_ID }, "alice", 3),
    // OPEN_SITE race — both are accepted at the log boundary; bob's reducer
    // attempt observes the already-open runtime and bounces.
    ev(5, "OPEN_SITE", { siteId: ESSENCE_SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION }, "alice", 4),
    ev(6, "OPEN_SITE", { siteId: ESSENCE_SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION }, "bob", 4),
    ev(7, "ACCEPT_ESSENCE", { siteId: ESSENCE_SITE_ID }, "alice", 6),
    ev(8, "ENTER_SITE", { siteId: BATTLE_SITE_ID }, "alice", 7),
    ev(9, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }, "alice", 8),
  ];
  // Park an engine prompt: alice plays the points card.
  const prefix = [
    ...begun,
    ev(10, "BATTLE_ACTION", playFromHand(firstHandCard(gen, begun)), "alice", 9),
  ];
  const answer = {
    side: "player",
    promptId: pendingPromptId(gen, prefix),
    value: FIXTURE_POINTS_MODE,
  };
  const events = [
    ...prefix,
    // Prompt race — alice's matching answer applies, bob's duplicate bounces.
    ev(11, "BATTLE_ANSWER", answer, "alice", 10),
    ev(12, "BATTLE_ANSWER", answer, "bob", 10),
  ];
  expectOutcomes("adversarial", events, gen, {
    1: "applied",
    2: "applied",
    3: "bounced", // CAS intervening-window bounce
    4: "applied",
    5: "applied",
    6: "bounced", // OPEN_SITE race loser observes the already-open site
    7: "applied",
    8: "applied",
    9: "applied",
    10: "applied",
    11: "applied", // prompt race winner
    12: "bounced", // prompt race loser
  });
  return finalize("adversarial", gen, events);
}

// ---------------------------------------------------------------------------
// Finalize + write
// ---------------------------------------------------------------------------

/**
 * @param {string} name
 * @param {Genesis} gen
 * @param {SeqEvent[]} events
 */
function finalize(name, gen, events) {
  const { finalHash } = replayLog({ genesis: gen, events });
  return {
    name,
    fixture: {
      providerSet: FIXTURE_PROVIDER_SET,
      genesis: gen,
      events,
      finalHash,
    },
  };
}

function main() {
  registerReplayFixtureProviders();
  try {
    const fixtures = [journeyOnlyFixture(), battleFixture(), adversarialFixture()];
    for (const { name, fixture } of fixtures) {
      const path = resolve(FIXTURE_DIR, `${name}.json`);
      writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
      console.log(`wrote ${name}.json  finalHash=${fixture.finalHash}`);
    }
  } finally {
    clearReplayFixtureProviders();
  }
}

main();

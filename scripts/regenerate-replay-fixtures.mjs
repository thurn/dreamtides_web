// Regenerate the synthetic replay fixtures — the permanent reducer regression
// net (src/rules/replay/fixtures/*.json).
//
//   npm run regenerate-replay-fixtures
//
// The rules modules use TS enums and extensionless imports node's
// --experimental-strip-types resolver cannot follow, so this script runs under
// `tsx` (the supported fallback per docs/journey_prototype/qa_tooling.md).
//
// Each fixture is a checked-in `{ providerSet, genesis, events, finalHash }`.
// These are SYNTHETIC seeds: they use the DETERMINISTIC fixture providers
// (src/rules/replay/fixture-providers.ts, shared with replay.test.ts), NOT the
// real content generators (which live in src/coop/providers/). The fixtures stay
// synthetic on purpose: real-content hashes would couple this regression net to
// the TOML data, which AGENTS.md forbids. When an intentional reducer /
// rules-table change moves the hashes, re-run this script to re-stamp
// `finalHash`. Per AGENTS.md the fixtures assert on HASHES only, never on TOML
// card content: Dreamwell scripts are selected from the live effects table by
// structure, and card
// definitions in the fixtures are synthetic, so a TOML edit does not move them.
//
// Determinism check: run twice; the two runs must produce byte-identical files.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { replayLog } from "../src/rules/replay/replay.ts";
import {
  BATTLE_CARD_DETERMINISTIC,
  BATTLE_CARD_FORESEE,
  BATTLE_SITE_ID,
  DETERMINISTIC_SLOT,
  DREAM_AVATAR_ID,
  ESSENCE_SITE_ID,
  FIXTURE_PROVIDER_SET,
  FORESEE_SLOT,
  NODE_ID,
  SHOP_SITE_ID,
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../src/rules/replay/fixture-providers.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(HERE, "../src/rules/replay/fixtures");
const TIMESTAMP = "1970-01-01T00:00:00.000Z";

/** Build a committed event. */
function ev(seq, type, payload, actor, basedOnSeq) {
  return {
    seq,
    event: {
      type,
      payload,
      actor,
      clientTimestamp: TIMESTAMP,
      basedOnSeq,
    },
  };
}

/** A single-actor chain: basedOnSeq = seq - 1, so every intervening window is empty. */
function chain(actor, steps) {
  return steps.map(([type, payload], index) =>
    ev(index + 1, type, payload, actor, index),
  );
}

/** A DEBUG_EDIT battle command payload. */
function debugEdit(edit) {
  return { command: { id: "DEBUG_EDIT", edit } };
}

function moveToFront(battleCardId, slotId) {
  return debugEdit({
    kind: "MOVE_CARD_TO_ZONE",
    battleCardId,
    destination: { side: "player", zone: "frontRank", slotId },
  });
}

function drawDreamwell() {
  return debugEdit({ kind: "DRAW_DREAMWELL_CARD", side: "player", turnNumber: 2 });
}

function genesis(seed) {
  // `contentConfig` is pinned into every genesis at room creation; the fold
  // never reads it, so a fixed placeholder keeps fixtures a valid Genesis shape
  // without affecting the replayed hash.
  return {
    seed,
    reducerVersion: "fixture",
    createdAt: 0,
    contentConfig: { poolVariant: "fixture", draftMode: "pool", fresh20PackSize: null },
  };
}

/** Fold `events`, asserting the outcome at each 1-indexed position matches. */
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
// (a) journey-only: start -> dreamAvatar -> travel -> open/accept -> shop buy
// ---------------------------------------------------------------------------

function journeyOnlyFixture() {
  const gen = genesis("fixture-journey-only");
  const events = chain("p1", [
    ["START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID }],
    ["SELECT_DREAM_AVATAR", { dreamAvatarId: DREAM_AVATAR_ID }],
    ["TRAVEL_TO_DREAMSCAPE", { nodeId: NODE_ID }],
    ["OPEN_SITE", { siteId: ESSENCE_SITE_ID }],
    ["ACCEPT_ESSENCE", { siteId: ESSENCE_SITE_ID }],
    ["OPEN_SITE", { siteId: SHOP_SITE_ID }],
    ["BUY_SHOP_SLOT", { siteId: SHOP_SITE_ID, slotIndex: 0 }],
  ]);
  expectOutcomes("journey-only", events, gen, {
    1: "applied",
    2: "applied",
    3: "applied",
    4: "applied",
    5: "applied",
    6: "applied",
    7: "applied",
  });
  return finalize("journey-only", gen, events);
}

// ---------------------------------------------------------------------------
// (b) battle: begin -> move character -> Dreamwell prompt -> resolve -> victory
// ---------------------------------------------------------------------------

function battleFixture() {
  const gen = genesis("fixture-battle");
  // Events up to the prompt-parking command; discover the promptId by folding.
  const prefix = chain("p1", [
    ["START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID }],
    ["BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }],
    ["BATTLE_COMMAND", moveToFront(BATTLE_CARD_DETERMINISTIC, DETERMINISTIC_SLOT)],
    ["BATTLE_COMMAND", drawDreamwell()],
  ]);
  const parked = replayLog({ genesis: gen, events: prefix });
  const promptId = parked.finalState.battle?.pendingPrompt?.promptId;
  if (typeof promptId !== "number") {
    throw new Error("battle fixture: Dreamwell reveal did not park a prompt");
  }
  const events = [
    ...prefix,
    ev(5, "RESOLVE_PROMPT", { promptId, resolution: { kind: "foresee" } }, "p1", 4),
    ev(6, "END_BATTLE", { result: "victory" }, "p1", 5),
  ];
  expectOutcomes("battle", events, gen, {
    1: "applied",
    2: "applied",
    3: "applied",
    4: "applied",
    5: "applied",
    6: "applied",
  });
  // Victory clears the battle slice.
  const done = replayLog({ genesis: gen, events });
  if (done.finalState.battle !== null) {
    throw new Error("battle fixture: END_BATTLE victory did not clear the battle");
  }
  return finalize("battle", gen, events);
}

// ---------------------------------------------------------------------------
// (c) adversarial: two actors — CAS bounce, OPEN_SITE race, prompt race
// ---------------------------------------------------------------------------

function adversarialFixture() {
  const gen = genesis("fixture-adversarial");
  const prefix = [
    ev(1, "START_JOURNEY", { dreamAvatarId: DREAM_AVATAR_ID }, "alice", 0),
    // bob's essence adjust applies; alice's, based on the pre-bob state, sees
    // bob's applied non-neutral event in its window and BOUNCES (CAS rule 3).
    ev(2, "ADJUST_ESSENCE", { delta: 10 }, "bob", 1),
    ev(3, "ADJUST_ESSENCE", { delta: 20 }, "alice", 1),
    // OPEN_SITE race — both apply (CAS-exempt); bob's is an idempotent no-op.
    ev(4, "OPEN_SITE", { siteId: ESSENCE_SITE_ID }, "alice", 1),
    ev(5, "OPEN_SITE", { siteId: ESSENCE_SITE_ID }, "bob", 1),
    // Begin a battle and park a Dreamwell Foresee prompt.
    ev(6, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }, "alice", 5),
    ev(7, "BATTLE_COMMAND", drawDreamwell(), "alice", 6),
  ];
  const parked = replayLog({ genesis: gen, events: prefix });
  const promptId = parked.finalState.battle?.pendingPrompt?.promptId;
  if (typeof promptId !== "number") {
    throw new Error("adversarial fixture: Dreamwell reveal did not park a prompt");
  }
  const events = [
    ...prefix,
    // Prompt race — alice's matching resolve applies, bob's duplicate bounces.
    ev(8, "RESOLVE_PROMPT", { promptId, resolution: { kind: "foresee" } }, "alice", 7),
    ev(9, "RESOLVE_PROMPT", { promptId, resolution: { kind: "foresee" } }, "bob", 7),
  ];
  expectOutcomes("adversarial", events, gen, {
    1: "applied",
    2: "applied",
    3: "bounced", // CAS intervening-window bounce
    4: "applied",
    5: "bounced", // OPEN_SITE race loser observes the already-open site
    6: "applied",
    7: "applied",
    8: "applied", // prompt race winner
    9: "bounced", // prompt race loser
  });
  return finalize("adversarial", gen, events);
}

// ---------------------------------------------------------------------------
// Finalize + write
// ---------------------------------------------------------------------------

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
      // eslint-disable-next-line no-console
      console.log(`wrote ${name}.json  finalHash=${fixture.finalHash}`);
    }
  } finally {
    clearReplayFixtureProviders();
  }
}

main();

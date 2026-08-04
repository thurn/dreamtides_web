# Cooperative Demo Fuzzing

The cooperative demo certification harness covers the publisher workflow with
two browser clients and the same event-log engine used by hosted rooms. It
targets crashes, JavaScript errors, contained fold errors, controller-policy
violations, duplicate automatic intents, stale-client reconciliation, and
player-facing action failure messages.

## Test layers

The deterministic model runs two `LogClient` instances against one in-memory
room. Generated schedules delay either subscriber, remount clients, submit from
stale confirmed heads, race shared intent keys, and deliver the room in RTDB's
object, dense-array, and omitted-null shapes. The room uses the canonical game
engine and deterministic synthetic content providers. Every generated case
finishes by requiring:

- both clients to reach the canonical room head;
- both confirmed state hashes to match a fresh replay;
- an empty fold-error and divergence buffer;
- at most one applied event for each logical intent key;
- an empty semantic fold-invariant violation set.

Each model invocation also runs three deterministic sentinels: a complete
battle victory must atomically commit reward, Battle-site completion, Atlas
progress, assigned frontier, routing, and teardown; a malformed
committed event must be contained, reported by both clients, and converge; a
205-event schedule must compact and converge from a non-zero base sequence and
encoded snapshot.

Run the model with a stable seed:

```bash
npm run fuzz:coop -- --seed 20260729 --runs 500 --operations 35
```

Fast-check prints the seed and shrink path for a failing case. Reusing the
printed seed reproduces the generated schedule.

The browser harness starts an isolated Firebase Database emulator and serves a
fresh production-style Vite build, launches publisher and host contexts, and
drives the visible UI. The
smoke profile covers the fixed tutorial Dream Avatar selection, a second-client
join, an Augury exit back to its Dreamscape, a playable battle,
**Control Opponent**, and an opponent score edit through the battle inspector.
It then skips to rewards, continues to the Atlas, checks the complete victory
handoff on both clients, reloads both clients, and checks the persisted fold
again. The rehearsal profile enters through `/main`, plays all authored
tutorial actions at accelerated playback, waits for the shared live-battle
handoff, and then runs the avatar, Augury, and cooperative battle
scenarios. The soak profile repeats smoke runs for a bounded duration with a new
deterministic seed per room.

```bash
npm run fuzz:demo -- --profile smoke --seed 20260729 --runs 1
npm run fuzz:demo:built
npm run fuzz:demo -- --profile rehearsal --seed 20260729 --runs 1
npm run fuzz:demo -- --profile soak --seed 20260729 --duration-minutes 60
```

`demo:certify` runs the 500-case deterministic model followed by one browser
smoke run:

```bash
npm run demo:certify
```

The browser harness requires Playwright Chromium:

```bash
npx playwright install chromium
```

## Browser oracle

`VITE_FUZZ_TEST=1` installs `window.__questFuzzProbe` in the isolated
certification build.
The probe is read-only: `snapshot()` returns copies of displayed and confirmed
fold state together with the confirmed head, canonical hashes, client id,
controller id, route, screen type, and battle id. The production bundle and
ordinary development sessions do not install the probe.

A browser run fails on:

- `pageerror` or `console.error`;
- visible text matching fold errors, tutorial-authoritative errors,
  application failures, or “action not applied”;
- clients that do not converge to the same confirmed head and state hash;
- a journey route whose displayed fold screen is missing, transparent, has no
  layout area, or sits wholly outside the viewport;
- a displayed route whose visible controls cannot receive pointer hits;
- a transparent inactive route that still intercepts pointer input, or retains
  keyboard focus;
- a failed image occupying visible space on the displayed journey route;
- a required publisher/host interaction that is absent or disabled.

An init-script observer records every cooperative bounce toast as it appears,
so the four-second toast lifetime cannot hide an error from the final oracle.
Each iteration first renders a synthetic bounce toast and requires the observer
to capture it as a negative control. It also renders the stuck-transition shape
of a transparent, interactive site route while the fold expects a Dreamscape
and requires the presentation oracle to reject it.

## Failure artifacts and replay

Each browser iteration writes under `artifacts/coop-fuzz/`, which is ignored by
Git. A run directory contains:

- `metadata.json` with profile, seed, scenario URLs, probes, and failure stack;
- the final presentation-oracle reports for both clients in `metadata.json`;
- `actions.json` with the ordered semantic UI actions;
- `browser-records.json` with console, page, and request failures;
- one `room-<game>.json` RTDB dump for each scenario;
- final screenshots for both clients;
- publisher and host Playwright traces when the run fails.

Replay a failing browser seed from its run directory:

```bash
npm run fuzz:replay -- artifacts/coop-fuzz/<run>/run-<seed>
```

Open a trace with:

```bash
npx playwright show-trace artifacts/coop-fuzz/<run>/run-<seed>/host-trace.zip
```

The room's persisted `fold_error` record includes the committed sequence,
event type, actor, nonce, intent key, message, stack, before/after state hashes,
observer client id, game id, and invariant codes when the failure is semantic.
Successful terminal victories emit `battle_victory_committed` with the reward,
completion delta, completed node state, and assigned frontier. These records can
be correlated with the RTDB room dump and the action timeline without relying
on a browser console that may have closed.

## Pre-demo gate

Use this sequence on the intended demo revision:

1. Run `npm run review:full`.
2. Run `npm run demo:certify`.
3. Run the rehearsal profile once.
4. Run the soak profile for 60 minutes.
5. Replay and fix every failure; keep its original artifact directory until the
   same seed passes.
6. Perform one manual two-window rehearsal through `/main?game=<room>`, the
   fixed tutorial Dream Avatar route, several dreamscapes, and multiple battles.
7. Treat any fold error, JavaScript error, crash, controller-policy failure,
   divergence, or visible action failure as a release blocker.

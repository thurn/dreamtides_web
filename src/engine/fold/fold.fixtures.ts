/**
 * Shared synthetic effects for the prompt-protocol tests: a deliberately
 * nondeterministic effect, malformed and edge-case prompts, the engine and
 * fold over them, and the slice helpers.
 */
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import type { ArrangePrompt, ChooseCardsPrompt, ChooseNumberPrompt, PromptPurpose } from "../prompts/types";
import { opponent } from "../state/ids";
import type { InstanceId } from "../state/ids";
import type { StepContext } from "../steps/types";
import { energy, event } from "../dsl/builders";
import * as primitives from "../effects/primitives";
import { boardState, type BoardSetup } from "../testing/board";
import { fuzzEngineCatalog, SYNTHETIC_FUZZ_POOL } from "../testing/fuzz";
import { SYNTHETIC, syntheticId } from "../testing/synthetic-cards";
import { PROMPTING } from "../testing/synthetic-effects";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "./slice";

export const v = SYNTHETIC;
export const p = PROMPTING;
export const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

// A deliberately nondeterministic effect: its prompt's candidates change on
// every run of the step, which replay must detect.
// eslint-disable-next-line dreamtides/engine-purity -- the fixture must be nondeterministic
let divergentRuns = 0;

/** Restarts the nondeterministic fixture's run count. */
export function resetDivergentRuns(): void {
  // eslint-disable-next-line dreamtides/engine-purity -- reset the nondeterministic fixture
  divergentRuns = 0;
}
export const divergent: EngineCardDefinition = {
  id: syntheticId(901),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [],
  synthetic: {
    resolve: (ctx, item) => {
      // eslint-disable-next-line dreamtides/engine-purity -- the fixture must be nondeterministic
      divergentRuns += 1;
      const run = divergentRuns;
      const hand = ctx.state.sides[item.controller].hand;
      ctx.choose<ChooseCardsPrompt>({
        kind: "chooseCards",
        side: item.controller,
        purpose: { source: item.instance, cardId: null, ability: 0, role: "discard" },
        candidates: run % 2 === 1 ? hand : hand.slice(1),
        min: 1,
        max: 1,
      });
    },
  },
};

// Raises a prompt with no legal answer, which rules code must never do.
export const emptyPrompt: EngineCardDefinition = {
  ...divergent,
  id: syntheticId(902),
  synthetic: {
    resolve: (ctx, item) => {
      ctx.choose<ChooseCardsPrompt>({
        kind: "chooseCards",
        side: item.controller,
        purpose: { source: item.instance, cardId: null, ability: 0, role: "discard" },
        candidates: [],
        min: 1,
        max: 1,
      });
    },
  },
};

// Emits an event before its cancellable play-time prompt, so its published
// event prefix is non-empty while it can still be cancelled.
export const emitThenChoose: EngineCardDefinition = {
  ...divergent,
  id: syntheticId(903),
  synthetic: {
    play: (ctx, self) => {
      ctx.emit({ kind: "noLegalTarget", source: self });
      return {
        x: ctx.choose<ChooseNumberPrompt>({
          kind: "chooseNumber",
          side: ctx.state.instances[self]?.owner ?? "player",
          purpose: { source: self, cardId: null, ability: 0, role: "chooseX" },
          min: 0,
          max: 1,
        }),
      };
    },
  },
};

// The same nondeterminism in a play-time prompt, so a top-level step fails on
// replay. Its candidates follow a switch the test flips between runs: the
// legality search and prompt narrowing run the step several times each.
// eslint-disable-next-line dreamtides/engine-purity -- the fixture must be nondeterministic
let divergentPlayShifted = false;

/** Flips the switch the divergent play-time prompt's candidates follow. */
export function shiftDivergentPlay(shifted: boolean): void {
  // eslint-disable-next-line dreamtides/engine-purity -- the test flips the nondeterministic fixture between runs
  divergentPlayShifted = shifted;
}
export const divergentPlay: EngineCardDefinition = {
  ...divergent,
  id: syntheticId(908),
  synthetic: {
    play: (ctx, self) => {
      const hand = ctx.state.sides.player.hand.filter((card) => card !== self);
      ctx.choose<ChooseCardsPrompt>({
        kind: "chooseCards",
        side: "player",
        purpose: { source: self, cardId: null, ability: 0, role: "discard" },
        candidates: divergentPlayShifted ? hand.slice(1) : hand,
        min: 1,
        max: 1,
      });
      return {};
    },
  },
};

// The opponent chooses a number while the card is played, before its commit point.
export const opponentChoosesAtPlay: EngineCardDefinition = {
  ...divergent,
  id: syntheticId(909),
  synthetic: {
    play: (ctx, self) => {
      ctx.choose<ChooseNumberPrompt>({
        kind: "chooseNumber",
        side: opponent(ctx.state.instances[self]?.controller ?? "player"),
        purpose: { source: self, cardId: null, ability: 0, role: "chooseX" },
        min: 0,
        max: 1,
      });
      return {};
    },
  },
};

// Its player looks at the top two cards of their deck while it is played, before its commit point.
export const lookAtPlay: EngineCardDefinition = {
  ...divergent,
  id: syntheticId(910),
  synthetic: {
    play: (ctx, self) => {
      const side = ctx.state.instances[self]?.controller ?? "player";
      ctx.choose<ChooseCardsPrompt>({
        kind: "chooseCards",
        side,
        privateTo: side,
        purpose: { source: self, cardId: null, ability: 0, role: "lookAtTop" },
        candidates: ctx.state.sides[side].deck.slice(0, 2),
        min: 1,
        max: 1,
      });
      return {};
    },
  },
};

// Malformed prompts, which rules code must never raise.
function malformed(index: number, raise: (ctx: StepContext, source: InstanceId) => void): EngineCardDefinition {
  return { ...divergent, id: syntheticId(index), synthetic: { resolve: (ctx, item) => raise(ctx, item.instance) } };
}
const malformedPurpose = (source: InstanceId): PromptPurpose => ({ source, cardId: null, ability: 0, role: "discard" });
export const MALFORMED = [
  malformed(904, (ctx, source) =>
    ctx.choose<ChooseCardsPrompt>({ kind: "chooseCards", side: "player", purpose: malformedPurpose(source), candidates: [source, source], min: 2, max: 2 }),
  ),
  malformed(905, (ctx, source) =>
    ctx.choose<ChooseCardsPrompt>({ kind: "chooseCards", side: "player", purpose: malformedPurpose(source), candidates: [source], min: -1, max: 1 }),
  ),
  malformed(906, (ctx, source) =>
    ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side: "player", purpose: malformedPurpose(source), min: 2, max: 1 }),
  ),
  malformed(907, (ctx, source) =>
    ctx.choose<ArrangePrompt>({
      kind: "arrange",
      side: "player",
      purpose: malformedPurpose(source),
      cards: [source],
      destinations: [{ to: "top", min: 0, max: 1 }, { to: "top", min: 0, max: 1 }],
    }),
  ),
];

/** "Draw a card, then discard a card": the deck empties before the discard prompt. */
export const drawThenDiscard: EngineCardDefinition = {
  id: syntheticId(0x985),
  cardType: "event",
  costs: [energy(0)],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [event(primitives.sequence(primitives.draw(1), primitives.discard(1)))],
};

export const engine = createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL, [divergent, emptyPrompt, emitThenChoose, divergentPlay, opponentChoosesAtPlay, lookAtPlay, drawThenDiscard, ...MALFORMED]));
export const fold = createFoldAdapter(engine, { checkEventPrefix: true });

export function slice(setup: BoardSetup): { slice: BattleSlice; ids: ReturnType<typeof boardState>["ids"] } {
  const { state, ids } = boardState(engine.catalog, setup);
  return { slice: { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, ids };
}

export function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}

export function pendingOf(current: BattleSlice) {
  const pending = fold.pending(current);
  if (pending === null) throw new Error("no pending prompt");
  return pending;
}

export function play(current: BattleSlice, card: string): IntentOutcome {
  return fold.reduce(current, {
    kind: "battleAction",
    side: "player",
    action: { kind: "play", card: card as `i${number}`, from: "hand" },
  });
}

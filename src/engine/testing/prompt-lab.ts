/**
 * The prompt lab: deterministic synthetic battles that raise each prompt
 * kind, response window, and notice the battle screen's PromptHost renders,
 * for the `?goto=prompt-lab-<name>` QA scenes (README § Browser QA) and
 * for tests. A fixture is a board (`boardState`) plus a script of intents
 * applied through the fold adapter, so a fixture can stop mid-step, mid-AI
 * turn, or on the human's response window. Test fixtures only, never
 * catalog content; the lab's own cards use synthetic ids 0x300+.
 *
 * Development builds add `PROMPT_LAB_DEFINITIONS` to the journey engine and
 * the policy worker's catalog (`developmentLabDefinitions`), so a lab battle
 * folds, replays on reload, and plays against the AI host like any battle.
 */
import type { EmblemDefinitions, EngineCardDefinition, EngineFigmentDefinition } from "../catalog";
import { energy, event } from "../dsl/builders";
import type { Engine } from "../engine";
import * as p from "../effects/primitives";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../fold/slice";
import type { Answer } from "../prompts/types";
import type { Action } from "../rules/actions";
import { BACK_RANK_SIZE, battleSeed, SIDES, type AvatarId, type CardId, type DreamsignId, type InstanceId, type Side } from "../state/ids";
import type { BattleInit, DeckEntry } from "../state/types";
import { boardState, type BoardSetup } from "./board";
import { CONTINUOUS_CARDS } from "./continuous-cards";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { LOOP, LOOP_CARDS } from "./loop-cards";
import { AVATAR, DREAMSIGN, STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "./stack-cards";
import { SYNTHETIC, SYNTHETIC_CARDS, syntheticId } from "./synthetic-cards";
import { TRIGGER_CARDS } from "./trigger-cards";
import { ZONE, ZONE_CARDS, ZONE_FIGMENTS } from "./zone-cards";

function labEvent(index: number, cost: number, effect: Parameters<typeof event>[0]): EngineCardDefinition {
  return {
    id: syntheticId(0x300 + index),
    cardType: "event",
    costs: [energy(cost)],
    spark: null,
    subtype: "",
    speed: "standard",
    status: "authored",
    abilities: () => [event(effect)],
  };
}

/** The lab's own cards. */
export const LAB = {
  /** "Draw 2 cards, then discard a card." */
  drawTwoThenDiscard: labEvent(1, 1, p.sequence(p.draw(2), p.discard(1))),
  /** "Each player discards a card." */
  eachPlayerDiscards: labEvent(2, 1, p.sequence(p.discard(1), p.discard(1, "opponent"))),
} as const satisfies Record<string, EngineCardDefinition>;

/** Every definition a lab battle may name: the synthetic, DSL, stack, loop, trigger, continuous, zone, and lab cards. */
export const PROMPT_LAB_DEFINITIONS: {
  readonly cards: readonly EngineCardDefinition[];
  readonly emblems: EmblemDefinitions;
  readonly figments: readonly EngineFigmentDefinition[];
} = {
  cards: [
    ...SYNTHETIC_CARDS,
    ...DSL_CARDS,
    ...STACK_CARDS,
    ...LOOP_CARDS,
    ...TRIGGER_CARDS,
    ...CONTINUOUS_CARDS,
    ...ZONE_CARDS,
    ...Object.values(LAB),
  ],
  emblems: SYNTHETIC_EMBLEMS,
  figments: ZONE_FIGMENTS,
};

const NO_DEFINITIONS: typeof PROMPT_LAB_DEFINITIONS = { cards: [], emblems: {}, figments: [] };

/**
 * The lab definitions in a development build, and none in a production
 * build, whose catalogs hold content only (P7). Every fold of one build
 * sees the same answer, as provider registration requires.
 */
export function developmentLabDefinitions(): typeof PROMPT_LAB_DEFINITIONS {
  return import.meta.env?.DEV === true ? PROMPT_LAB_DEFINITIONS : NO_DEFINITIONS;
}

/** Display data for the lab cards a fixture places: QA labels, not player copy. */
export const PROMPT_LAB_CARD_TEXT: Readonly<Record<CardId, { readonly name: string; readonly text: string }>> = {
  [SYNTHETIC.vanilla1.id]: { name: "Lab Recruit", text: "" },
  [SYNTHETIC.vanilla2.id]: { name: "Lab Sentry", text: "" },
  [SYNTHETIC.vanilla3.id]: { name: "Lab Veteran", text: "" },
  [SYNTHETIC.interruptEvent.id]: { name: "Lab Quickstep", text: "Interrupt. No effect." },
  [DSL.drawTwo.id]: { name: "Lab Study", text: "Draw 2 cards." },
  [DSL.dissolveEnemy.id]: { name: "Lab Unmaking", text: "Fast. Dissolve an enemy." },
  [DSL.pumpPermanently.id]: { name: "Lab Blessing", text: "Up to 2 characters you control gain +1✦." },
  [DSL.chooseDrawOrPoints.id]: { name: "Lab Crossroads", text: "Choose one: Draw a card; or gain 1⍟." },
  [DSL.mayDrawTwo.id]: { name: "Lab Temptation", text: "You may draw 2 cards." },
  [DSL.pointsTimesX.id]: { name: "Lab Surge", text: "Gain X⍟." },
  [DSL.foreseeTwo.id]: { name: "Lab Scrying", text: "Foresee 2." },
  [STACK.preventUnlessPays.id]: { name: "Lab Denial", text: "Prevent a card the opponent played unless they pay 2●." },
  [STACK.banishVoidToDraw.id]: { name: "Lab Exhumation", text: "To play this card, banish 2 cards from your void. Draw a card." },
  [LOOP.freePoints.id]: { name: "Lab Engine", text: "Gain 1⍟." },
  [ZONE.offeringDraw.id]: { name: "Lab Offering", text: "Offering. Draw 2 cards." },
  [ZONE.reclaimDraw.id]: { name: "Lab Echo", text: "Draw a card. Reclaim 1●." },
  [ZONE.twoWarriors.id]: { name: "Lab Muster", text: "Materialize two 1✦ Warrior figments." },
  [LAB.drawTwoThenDiscard.id]: { name: "Lab Sifting", text: "Draw 2 cards, then discard a card." },
  [LAB.eachPlayerDiscards.id]: { name: "Lab Tithe", text: "Each player discards a card." },
};

/** Instance ids of the placed cards, per side and zone, in setup order. */
export type LabIds = ReturnType<typeof boardState>["ids"];

/** One scripted intent, built from the placed cards' ids. */
export type LabStep =
  | { readonly side: Side; readonly action: (ids: LabIds) => Action }
  | { readonly side: Side; readonly answer: (ids: LabIds) => Answer };

export interface PromptLabFixture {
  /** The fixture's scene token: `?goto=prompt-lab-<name>`. */
  readonly name: string;
  /** What the fixture opens on, for logs and the scene list. */
  readonly description: string;
  readonly setup: BoardSetup;
  /** Intents applied in order after the board is placed. */
  readonly script: readonly LabStep[];
}

const deck = (count: number): CardId[] => Array.from({ length: count }, () => SYNTHETIC.vanilla1.id);
const vanillas = [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id];

function first(ids: readonly (InstanceId | null)[]): InstanceId {
  const id = ids.find((candidate) => candidate !== null);
  if (id === undefined || id === null) throw new Error("The lab fixture places no such card");
  return id;
}

const play = (side: Side, card: (ids: LabIds) => InstanceId): LabStep => ({
  side,
  action: (ids) => ({ kind: "play", card: card(ids), from: "hand" }),
});

export const PROMPT_LAB_FIXTURES: readonly PromptLabFixture[] = [
  {
    name: "targets",
    description: "Board targets with Cancel, and up to two targets on the card picker",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.dissolveEnemy.id, DSL.pumpPermanently.id], back: [vanillas[0], vanillas[1]], energy: 6, deck: deck(6) },
      enemy: { back: [vanillas[1], vanillas[2]], deck: deck(6) },
    },
    script: [],
  },
  {
    name: "auto-target",
    description: "A target prompt with one legal answer, answered automatically",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.dissolveEnemy.id], energy: 4, deck: deck(6) },
      enemy: { back: [vanillas[1]], deck: deck(6) },
    },
    script: [],
  },
  {
    name: "choices",
    description: "A mode, a you-may, and an X cost",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.chooseDrawOrPoints.id, DSL.mayDrawTwo.id, DSL.pointsTimesX.id], energy: 5, deck: deck(8) },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "foresee",
    description: "Foresee 2: an arrangement private to the human",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.foreseeTwo.id], energy: 2, deck: [vanillas[0], vanillas[1], vanillas[2], ...deck(4)] },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "draw-discard",
    description: "Draw 2, then discard: the discard prompt follows the draws' presentation",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [LAB.drawTwoThenDiscard.id, vanillas[0]], energy: 2, deck: [vanillas[1], vanillas[2], ...deck(4)] },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "offering",
    description: "The play route of an Offering card, then the hand cards it banishes",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [ZONE.offeringDraw.id, vanillas[0], vanillas[1]], energy: 3, deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "void-cost",
    description: "An additional cost that banishes void cards: the gallery card picker",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [STACK.banishVoidToDraw.id], void: [vanillas[0], vanillas[1], vanillas[2]], deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "reclaim",
    description: "A Reclaim play from the void, an Avatar activation, and a Dreamsign activation",
    setup: {
      active: "player",
      phase: "day",
      player: {
        void: [ZONE.reclaimDraw.id],
        energy: 4,
        deck: deck(6),
        avatar: AVATAR.drawer.id,
        dreamsigns: [DREAMSIGN.points.id],
      },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "capacity",
    description: "Materializing two figments into a back rank with room for one",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [ZONE.twoWarriors.id], back: Array.from({ length: BACK_RANK_SIZE - 1 }, () => vanillas[0]), energy: 2, deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "ai-discard",
    description: "The AI plays “each player discards a card”: the human discards during the AI's turn",
    setup: {
      active: "enemy",
      phase: "day",
      player: { hand: [vanillas[0], vanillas[1], vanillas[2]], deck: deck(6) },
      enemy: { hand: [LAB.eachPlayerDiscards.id, vanillas[0], vanillas[1]], energy: 3, deck: deck(6) },
    },
    script: [play("enemy", (ids) => first(ids.enemy.hand))],
  },
  {
    name: "ai-foresee",
    description: "The AI foresees: a private prompt the human sees only as the opponent choosing",
    setup: {
      active: "enemy",
      phase: "day",
      player: { hand: [vanillas[0]], deck: deck(6) },
      enemy: { hand: [DSL.foreseeTwo.id], energy: 2, deck: [vanillas[0], vanillas[1], vanillas[2], ...deck(4)] },
    },
    script: [play("enemy", (ids) => first(ids.enemy.hand))],
  },
  {
    name: "respond",
    description: "The AI plays an event while the human holds an Interrupt response",
    setup: {
      active: "enemy",
      phase: "day",
      player: { hand: [SYNTHETIC.interruptEvent.id, vanillas[0]], energy: 2, deck: deck(6) },
      enemy: { hand: [DSL.drawTwo.id], energy: 2, deck: deck(6) },
    },
    script: [play("enemy", (ids) => first(ids.enemy.hand))],
  },
  {
    name: "prevent",
    description: "The AI prevents the human's event unless the human pays 2●",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.drawTwo.id], energy: 4, deck: deck(6) },
      enemy: { hand: [STACK.preventUnlessPays.id], energy: 2, deck: deck(6) },
    },
    script: [play("player", (ids) => first(ids.player.hand)), play("enemy", (ids) => first(ids.enemy.hand))],
  },
  {
    name: "loop",
    description: "A free activated ability once used: the loop shortcut is on offer",
    setup: {
      active: "player",
      phase: "day",
      player: { back: [LOOP.freePoints.id], deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [{ side: "player", action: (ids) => ({ kind: "activate", source: first(ids.player.back), ability: 0 }) }],
  },
];

/** The fixture a scene token names, or `null`. */
export function promptLabFixture(name: string): PromptLabFixture | null {
  return PROMPT_LAB_FIXTURES.find((fixture) => fixture.name === name) ?? null;
}

/** Every card a side's setup places, as the decklist the battle dealt. */
function labDeck(setup: BoardSetup, side: Side): DeckEntry[] {
  const sideSetup = setup[side] ?? {};
  const placed = [
    ...(sideSetup.front ?? []),
    ...(sideSetup.back ?? []),
    ...(sideSetup.hand ?? []).map((entry) => (typeof entry === "string" ? entry : entry.cardId)),
    ...(sideSetup.deck ?? []),
    ...(sideSetup.void ?? []),
  ];
  return placed.flatMap((cardId) => (cardId === null ? [] : [{ cardId }]));
}

/**
 * Builds a fixture's battle on `engine`, whose catalog must hold the lab
 * definitions: its engine init (the decks are the placed cards, so the AI's
 * determinization deals from them) and its slice after the script. Throws
 * when a scripted intent bounces or errors, so a stale fixture fails loudly.
 */
export function promptLabBattle(engine: Engine, fixture: PromptLabFixture): { init: BattleInit; slice: BattleSlice } {
  const { state, ids } = boardState(engine.catalog, fixture.setup);
  const avatars: Partial<Record<Side, AvatarId>> = {};
  const dreamsigns: Partial<Record<Side, readonly DreamsignId[]>> = {};
  for (const side of SIDES) {
    const { avatar, dreamsigns: held } = fixture.setup[side] ?? {};
    if (avatar !== undefined) avatars[side] = avatar;
    if (held !== undefined) dreamsigns[side] = held;
  }
  const init: BattleInit = {
    seed: battleSeed(`prompt-lab:${fixture.name}`),
    scoreToWin: state.config.scoreToWin,
    startingSide: "player",
    decks: { player: labDeck(fixture.setup, "player"), enemy: labDeck(fixture.setup, "enemy") },
    dreamwell: [],
    avatars,
    dreamsigns,
  };
  const adapter = createFoldAdapter(engine);
  let slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  for (const step of fixture.script) {
    let intent: BattleIntent;
    if ("action" in step) {
      intent = { kind: "battleAction", side: step.side, action: step.action(ids) };
    } else {
      const pending = adapter.pending(slice);
      if (pending === null) throw new Error(`Lab fixture ${fixture.name} scripts an answer with no prompt pending`);
      intent = { kind: "answer", side: step.side, promptId: pending.prompt.id, value: step.answer(ids) };
    }
    const outcome = adapter.reduce(slice, intent);
    if (outcome.kind === "bounced") throw new Error(`Lab fixture ${fixture.name} bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(`Lab fixture ${fixture.name} failed: ${outcome.error.message}`);
    slice = outcome.slice;
  }
  return { init, slice };
}

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
 * the policy worker's catalog (`developmentLabDefinitions`, `../development.ts`),
 * so a lab battle folds, replays on reload, and plays against the AI host
 * like any battle. The card-lab (`card-lab.ts`) plays the same definitions.
 *
 * The `present-*` fixtures (and the prompt fixtures with `presents` steps)
 * are the battle screen's presentation cases: each lists the intents a
 * judged QA pass takes through the UI after the scene loads, and together
 * they publish every engine event kind (`promptLabPresentation`).
 */
import { printedCardId, type EngineCardDefinition, type SyntheticHooks } from "../catalog";
import type { LabDefinitions } from "../development";
import { enemyCharacter, energy, event, upTo } from "../dsl/builders";
import type { Engine } from "../engine";
import * as p from "../effects/primitives";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../fold/slice";
import type { Answer, ArrangePrompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { charactersInPlay, instanceOf, moveInstance } from "../rules/zones";
import { BACK_RANK_SIZE, battleSeed, SIDES, type AvatarId, type CardId, type DreamsignId, type InstanceId, type Side } from "../state/ids";
import type { BattleInit, BattleState, DeckEntry } from "../state/types";
import type { EngineEvent } from "../events";
import { boardState, type BoardSetup } from "./board";
import { CONTINUOUS, CONTINUOUS_CARDS } from "./continuous-cards";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { LOOP, LOOP_CARDS } from "./loop-cards";
import { AVATAR, DREAMSIGN, STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "./stack-cards";
import { SYNTHETIC, SYNTHETIC_CARDS, syntheticId } from "./synthetic-cards";
import { TRIGGER, TRIGGER_CARDS } from "./trigger-cards";
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

function labSyntheticEvent(index: number, cost: number, synthetic: SyntheticHooks): EngineCardDefinition {
  return {
    id: syntheticId(0x300 + index),
    cardType: "event",
    costs: [energy(cost)],
    spark: null,
    subtype: "",
    speed: "standard",
    status: "authored",
    abilities: () => [],
    synthetic,
  };
}

/** The lab's own cards. */
export const LAB = {
  /** "Draw 2 cards, then discard a card." */
  drawTwoThenDiscard: labEvent(1, 1, p.sequence(p.draw(2), p.discard(1))),
  /** "Each player discards a card." */
  eachPlayerDiscards: labEvent(2, 1, p.sequence(p.discard(1), p.discard(1, "opponent"))),
  /** "Dissolve up to one enemy." */
  dissolveUpToOne: labEvent(3, 1, p.dissolve(upTo(enemyCharacter(), 1))),
  /** A pending event (D36): it plays text-less and reports its pending ability. */
  sketch: { ...labEvent(6, 0, p.draw(1)), status: "pending" },
  /** "Put 2 memory counters on each character you control." */
  hourglass: labSyntheticEvent(5, 0, {
    resolve: (ctx, item) => {
      for (const id of charactersInPlay(ctx.state, item.controller)) {
        const status = instanceOf(ctx.state, id).status;
        status.counters += 2;
        ctx.emit({ kind: "countersChanged", instance: id, counters: status.counters });
      }
    },
  }),
  /**
   * "As you play this, look at the top 2 cards of your deck: put one into
   * your hand and the other on the top or bottom of your deck." A play-time
   * arrangement among three destinations, so it may be cancelled.
   */
  divination: labSyntheticEvent(4, 1, {
    play: (ctx, self) => {
      const source = instanceOf(ctx.state, self);
      const side = source.controller;
      const cards = ctx.state.sides[side].deck.slice(0, 2);
      if (cards.length < 2) return {};
      const arrangement = ctx.choose<ArrangePrompt>({
        kind: "arrange",
        side,
        privateTo: side,
        purpose: { source: self, cardId: printedCardId(source.printing), ability: 0, role: "foresee" },
        cards,
        destinations: [
          { to: "top", min: 0, max: 1 },
          { to: "bottom", min: 0, max: 1 },
          { to: "hand", min: 1, max: 1 },
        ],
      });
      const placed = (to: ArrangePrompt["destinations"][number]["to"]) =>
        arrangement.filter((entry) => entry.to === to).map((entry) => entry.card);
      for (const card of placed("hand")) moveInstance(ctx, card, "hand");
      const sideState = ctx.state.sides[side];
      const rest = sideState.deck.filter((card) => !cards.includes(card));
      sideState.deck = [...placed("top"), ...rest, ...placed("bottom")];
      return {};
    },
  }),
} as const satisfies Record<string, EngineCardDefinition>;

/** Every definition a lab battle may name: the synthetic, DSL, stack, loop, trigger, continuous, zone, and lab cards. */
export const PROMPT_LAB_DEFINITIONS: LabDefinitions = {
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
  [LAB.dissolveUpToOne.id]: { name: "Lab Mercy", text: "Dissolve up to one enemy." },
  [LAB.sketch.id]: { name: "Lab Sketch", text: "" },
  [LAB.hourglass.id]: { name: "Lab Hourglass", text: "Put 2 memory counters on each character you control." },
  [DSL.dissolveEnemy.id]: { name: "Lab Unmaking", text: "Fast. Dissolve an enemy." },
  [DSL.banishEnemyWithSparkAtMostTwo.id]: { name: "Lab Exile", text: "Banish an enemy with spark 2 or less." },
  [DSL.returnAnyToHand.id]: { name: "Lab Recall", text: "Return a character to its owner's hand." },
  [DSL.erodeThree.id]: { name: "Lab Erosion", text: "The opponent erodes 3." },
  [DSL.pumpUntilEndOfTurn.id]: { name: "Lab Rally", text: "A character you control gains +3✦ until end of turn." },
  [DSL.exhaustEnemies.id]: { name: "Lab Lull", text: "Exhaust each enemy." },
  [DSL.gainThreePoints.id]: { name: "Lab Triumph", text: "Gain 3⍟." },
  [DSL.winIfDeckEmpty.id]: { name: "Lab Terminus", text: "If you have no cards in your deck, you win the game." },
  [ZONE.exile.id]: { name: "Lab Banishment", text: "Banish an enemy until end of turn." },
  [ZONE.seize.id]: { name: "Lab Seizure", text: "Gain control of an enemy." },
  [ZONE.echo.id]: { name: "Lab Echo Mage", text: "When you play an event, copy it." },
  [TRIGGER.dissolvedRevenge.id]: { name: "Lab Avenger", text: "▸Dissolved: Dissolve an enemy." },
  [TRIGGER.silenceEnemy.id]: { name: "Lab Silence", text: "An enemy's triggered abilities don't trigger this turn." },
  [TRIGGER.shrinkUntilPays.id]: { name: "Lab Toll", text: "An enemy gains −2✦ until the opponent pays 1●." },
  [TRIGGER.floatingDraw.id]: { name: "Lab Inspiration", text: "Until end of turn, when you play a character, draw a card." },
  [TRIGGER.duskPoints.id]: { name: "Lab Vesper", text: "▸Dusk: Gain 1⍟." },
  [CONTINUOUS.vengefulThisTurn.id]: { name: "Lab Fury", text: "A character you control gains Vengeful until end of turn." },
  [CONTINUOUS.nextEventDiscount.id]: { name: "Lab Bargain", text: "The next event you play this turn costs 2● less." },
  [STACK.abandonToDraw.id]: { name: "Lab Sacrificer", text: "Abandon a character: Draw 2 cards." },
  [STACK.counterBattery.id]: { name: "Lab Battery", text: "1⧗, ☾: Gain 2●." },
  [STACK.revealWarrior.id]: { name: "Lab Herald", text: "Reveal a Warrior card from your hand: Gain 1●. Once per turn." },
  [STACK.payableEffect.id]: { name: "Lab Shackles", text: "Until the opponent pays 2●, each enemy is shackled." },
  [LAB.divination.id]: {
    name: "Lab Divination",
    text: "As you play this, look at the top 2 cards of your deck: put one into your hand and the other on the top or bottom of your deck.",
  },
};

/** Instance ids of the placed cards, per side and zone, in setup order. */
export type LabIds = ReturnType<typeof boardState>["ids"];

/**
 * One scripted intent, built from the placed cards' ids, or passes by
 * whichever side owns the decision until `side`'s Day begins.
 */
export type LabStep =
  | { readonly side: Side; readonly action: (ids: LabIds, state: BattleState) => Action }
  | { readonly side: Side; readonly answer: (ids: LabIds, state: BattleState) => Answer }
  | { readonly passUntilDayOf: Side };

export interface PromptLabFixture {
  /** The fixture's scene token: `?goto=prompt-lab-<name>`. */
  readonly name: string;
  /** What the fixture opens on, for logs and the scene list. */
  readonly description: string;
  readonly setup: BoardSetup;
  /** Intents applied in order after the board is placed. */
  readonly script: readonly LabStep[];
  /** The intents a presentation QA pass takes through the UI after the scene loads, in order. */
  readonly presents?: readonly LabStep[];
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

/** Placed card `index` of a side's zone, which the fixture places. */
function at(ids: readonly (InstanceId | null)[], index: number): InstanceId {
  const id = ids[index];
  if (id === undefined || id === null) throw new Error(`The lab fixture places no card at ${String(index)}`);
  return id;
}

const playHand = (index: number): LabStep => play("player", (ids) => at(ids.player.hand, index));
const target = (choose: (ids: LabIds) => InstanceId): LabStep => ({ side: "player", answer: (ids) => [choose(ids)] });

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
    presents: [playHand(0)],
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
    name: "up-to-one-target",
    description: "Up to one target among characters in play: tap a target, or Skip",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [LAB.dissolveUpToOne.id], back: [vanillas[0]], energy: 4, deck: deck(6) },
      enemy: { back: [vanillas[1], vanillas[2]], deck: deck(6) },
    },
    script: [],
  },
  {
    name: "arrange",
    description: "A cancellable arrangement among the top, the bottom, and the hand",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [LAB.divination.id], energy: 2, deck: [vanillas[0], vanillas[1], vanillas[2], ...deck(4)] },
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
    presents: [playHand(0), { side: "player", answer: (ids) => [at(ids.player.hand, 1)] }],
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
    presents: [
      { side: "player", action: () => ({ kind: "activate", source: { kind: "avatar", side: "player" }, ability: 0 }) },
      { side: "player", action: (ids) => ({ kind: "play", card: at(ids.player.void, 0), from: "void" }) },
    ],
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
    presents: [playHand(0)],
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
    presents: [{ side: "player", answer: () => false }],
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
    presents: [
      {
        side: "player",
        action: (_ids, state) => {
          const loop = state.loops.candidate;
          if (loop === null) throw new Error("loop offers no loop");
          return { kind: "repeatLoop", loop: loop.id, count: 3 };
        },
      },
    ],
  },
  {
    name: "present-zones",
    description: "Presentation: dissolve (and a trigger with no legal target), banish, banish until end of turn, return, erode, figments, and gain control",
    setup: {
      active: "player",
      phase: "day",
      player: {
        hand: [
          DSL.dissolveEnemy.id,
          DSL.banishEnemyWithSparkAtMostTwo.id,
          ZONE.exile.id,
          DSL.returnAnyToHand.id,
          DSL.erodeThree.id,
          ZONE.twoWarriors.id,
          ZONE.seize.id,
          LAB.sketch.id,
        ],
        energy: 20,
        deck: deck(8),
      },
      enemy: { back: [TRIGGER.dissolvedRevenge.id, vanillas[0], vanillas[1], vanillas[2], vanillas[0]], deck: deck(8) },
    },
    script: [],
    presents: [
      playHand(0),
      target((ids) => at(ids.enemy.back, 0)),
      playHand(1),
      target((ids) => at(ids.enemy.back, 1)),
      playHand(2),
      target((ids) => at(ids.enemy.back, 2)),
      playHand(3),
      target((ids) => at(ids.enemy.back, 3)),
      playHand(4),
      playHand(5),
      playHand(6),
      playHand(7),
    ],
  },
  {
    name: "present-status",
    description: "Presentation: durations, a granted keyword, disabled triggers, a cost change, a payable effect, exhaustion, points, and a floating trigger, then the turn ends",
    setup: {
      active: "player",
      phase: "day",
      player: {
        hand: [
          DSL.pumpUntilEndOfTurn.id,
          CONTINUOUS.vengefulThisTurn.id,
          TRIGGER.silenceEnemy.id,
          CONTINUOUS.nextEventDiscount.id,
          TRIGGER.shrinkUntilPays.id,
          DSL.exhaustEnemies.id,
          DSL.gainThreePoints.id,
          TRIGGER.floatingDraw.id,
        ],
        back: [vanillas[0], vanillas[1]],
        energy: 20,
        deck: deck(8),
      },
      enemy: { back: [TRIGGER.duskPoints.id, vanillas[2]], deck: deck(8) },
    },
    script: [],
    presents: [
      playHand(0),
      target((ids) => at(ids.player.back, 0)),
      playHand(1),
      target((ids) => at(ids.player.back, 1)),
      playHand(2),
      target((ids) => at(ids.enemy.back, 0)),
      playHand(3),
      playHand(4),
      target((ids) => at(ids.enemy.back, 1)),
      playHand(5),
      playHand(6),
      playHand(7),
      { passUntilDayOf: "enemy" },
    ],
  },
  {
    name: "present-challenge",
    description: "Presentation: All Forward, then a Challenge with a blocked lane and a scoring lane, into the opponent's turn",
    setup: {
      active: "player",
      phase: "day",
      player: { front: [vanillas[2], vanillas[1]], back: [null, null, vanillas[0]], deck: deck(8) },
      enemy: { front: [vanillas[0]], deck: deck(8) },
    },
    script: [],
    presents: [
      { side: "player", action: (ids) => ({ kind: "reposition", card: at(ids.player.back, 2), to: { rank: "front", index: 2 } }) },
      { passUntilDayOf: "enemy" },
    ],
  },
  {
    name: "present-costs",
    description: "Presentation: counters, a figment merge, an abandon, a reveal, and a copied event",
    setup: {
      active: "player",
      phase: "day",
      player: {
        hand: [LAB.hourglass.id, ZONE.twoWarriors.id, DSL.drawTwo.id, vanillas[0]],
        back: [STACK.counterBattery.id, STACK.abandonToDraw.id, STACK.revealWarrior.id, ZONE.echo.id],
        energy: 10,
        deck: deck(12),
      },
      enemy: { deck: deck(8) },
    },
    script: [],
    presents: [
      playHand(0),
      { side: "player", action: (ids) => ({ kind: "activate", source: at(ids.player.back, 0), ability: 0 }) },
      playHand(1),
      {
        side: "player",
        action: (_ids, state) => {
          const figments = state.sides.player.backRank.filter(
            (id): id is InstanceId => id !== null && instanceOf(state, id).printing.kind === "figment",
          );
          const [source, destination] = figments;
          const index = destination === undefined ? -1 : state.sides.player.backRank.indexOf(destination);
          if (source === undefined || index < 0) throw new Error("present-costs has no two figments to merge");
          return { kind: "reposition", card: source, to: { rank: "back", index } };
        },
      },
      { side: "player", action: (ids) => ({ kind: "activate", source: at(ids.player.back, 1), ability: 0 }) },
      {
        side: "player",
        answer: (_ids, state) => [
          first(state.sides.player.backRank.filter((id) => id !== null && instanceOf(state, id).printing.kind === "figment")),
        ],
      },
      { side: "player", action: (ids) => ({ kind: "activate", source: at(ids.player.back, 2), ability: 0 }) },
      { side: "player", answer: (ids) => [at(ids.player.hand, 3)] },
      playHand(2),
    ],
  },
  {
    name: "present-ending",
    description: "Presentation: a draw from an empty deck (fatigue), then a win condition that ends the battle",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.drawTwo.id, DSL.winIfDeckEmpty.id], energy: 5, deck: [] },
      enemy: { deck: deck(8) },
    },
    script: [],
    presents: [playHand(0), playHand(1)],
  },
  {
    name: "present-opponent",
    description: "Presentation: the AI's turn, its plays at reading size before they travel, a payable effect it registers",
    setup: {
      active: "enemy",
      phase: "day",
      player: { back: [vanillas[2]], hand: [vanillas[0]], energy: 3, deck: deck(8) },
      enemy: { hand: [SYNTHETIC.vanilla2.id, DSL.dissolveEnemy.id, STACK.payableEffect.id], energy: 5, deck: deck(8) },
    },
    script: [],
    presents: [
      play("enemy", (ids) => at(ids.enemy.hand, 2)),
      play("enemy", (ids) => at(ids.enemy.hand, 0)),
      { passUntilDayOf: "player" },
      {
        side: "player",
        action: (_ids, state) => {
          const effect = state.payable[0];
          if (effect === undefined) throw new Error("present-opponent registers no payable effect");
          return { kind: "payToEnd", effect: effect.id };
        },
      },
    ],
  },
];

/** The fixture a scene token names, or `null`. */
export function promptLabFixture(name: string): PromptLabFixture | null {
  return PROMPT_LAB_FIXTURES.find((fixture) => fixture.name === name) ?? null;
}

/** Every card a side's setup places, with its variant, as the decklist the battle dealt. */
function labDeck(setup: BoardSetup, side: Side): DeckEntry[] {
  const sideSetup = setup[side] ?? {};
  const placed = [
    ...(sideSetup.front ?? []),
    ...(sideSetup.back ?? []),
    ...(sideSetup.hand ?? []),
    ...(sideSetup.deck ?? []),
    ...(sideSetup.void ?? []),
  ];
  return placed.flatMap((entry) => (entry === null ? [] : [typeof entry === "string" ? { cardId: entry } : entry]));
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
  for (const step of fixture.script) slice = applyLabStep(engine, adapter, fixture, ids, slice, step).slice;
  return { init, slice };
}

/** The most passes a `passUntilDayOf` step makes before it fails the fixture. */
const MAX_LAB_PASSES = 64;

/** Applies one lab step to `slice`, with the events it published; throws when an intent bounces or errors. */
function applyLabStep(
  engine: Engine,
  adapter: ReturnType<typeof createFoldAdapter>,
  fixture: PromptLabFixture,
  ids: LabIds,
  from: BattleSlice,
  step: LabStep,
): { slice: BattleSlice; published: EngineEvent[] } {
  const published: EngineEvent[] = [];
  const apply = (slice: BattleSlice, intent: BattleIntent): BattleSlice => {
    const outcome = adapter.reduce(slice, intent);
    if (outcome.kind === "bounced") throw new Error(`Lab fixture ${fixture.name} bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(`Lab fixture ${fixture.name} failed: ${outcome.error.message}`);
    published.push(...outcome.published);
    return outcome.slice;
  };
  if ("passUntilDayOf" in step) {
    let slice = from;
    for (let passes = 0; passes < MAX_LAB_PASSES; passes += 1) {
      if (adapter.pending(slice) !== null) throw new Error(`Lab fixture ${fixture.name} stopped at a prompt while passing`);
      const { turn } = slice.committed;
      const decision = engine.decision(slice.committed);
      if (decision === null) throw new Error(`Lab fixture ${fixture.name} has no decision while passing`);
      if (decision.side === step.passUntilDayOf && turn.active === step.passUntilDayOf && turn.phase === "day") {
        return { slice, published };
      }
      slice = apply(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } });
    }
    throw new Error(`Lab fixture ${fixture.name} never reached the Day of ${step.passUntilDayOf}`);
  }
  const state = adapter.pending(from)?.display ?? from.committed;
  if ("action" in step) {
    return { slice: apply(from, { kind: "battleAction", side: step.side, action: step.action(ids, state) }), published };
  }
  const pending = adapter.pending(from);
  if (pending === null) throw new Error(`Lab fixture ${fixture.name} scripts an answer with no prompt pending`);
  return {
    slice: apply(from, { kind: "answer", side: step.side, promptId: pending.prompt.id, value: step.answer(ids, state) }),
    published,
  };
}

/** One `presents` step as the battle screen receives it: its events, and the states before and after it. */
export interface LabPresentationStep {
  readonly published: readonly EngineEvent[];
  readonly before: BattleState;
  readonly after: BattleState;
}

/**
 * Each of a fixture's `presents` steps applied from where its scene starts:
 * what a presentation QA pass sees. States are the suspended step's display
 * while a prompt is pending, as the screen shows them.
 */
export function promptLabPresentation(engine: Engine, fixture: PromptLabFixture): LabPresentationStep[] {
  const { state, ids } = boardState(engine.catalog, fixture.setup);
  const adapter = createFoldAdapter(engine);
  const shown = (slice: BattleSlice) => adapter.pending(slice)?.display ?? slice.committed;
  let slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  for (const step of fixture.script) slice = applyLabStep(engine, adapter, fixture, ids, slice, step).slice;
  return (fixture.presents ?? []).map((step) => {
    const before = shown(slice);
    const applied = applyLabStep(engine, adapter, fixture, ids, slice, step);
    slice = applied.slice;
    return { published: applied.published, before, after: shown(slice) };
  });
}

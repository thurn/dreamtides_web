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
import { BATTLE } from "../../content/battle";
import { printedCardId, type EngineCardDefinition, type SyntheticHooks } from "../catalog";
import type { LabDefinitions } from "../development";
import { additionalCost, discardCostFilter, optionalCost, reclaim, activated, abandonCost, banishFromAnyVoidCost, banishFromVoidCost, returnCost, characterYouControl, enemyCharacter, energy, energyX, event, everyIn, fromVoid, self, staticAbility, target as characterTarget, thisCardIn, upTo, x } from "../dsl/builders";
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
import { CONDITIONAL, CONDITIONAL_STATIC_CARDS } from "./conditional-static-cards";
import { CAPTURE, CAPTURE_CARDS, CAPTURE_FIGMENT } from "./captured-figment-cards";
import { CONTINUOUS, CONTINUOUS_CARDS } from "./continuous-cards";
import { DSL, DSL_CARDS } from "./dsl-cards";
import { LOOP, LOOP_CARDS } from "./loop-cards";
import { AVATAR, DREAMSIGN, STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "./stack-cards";
import { SYNTHETIC, SYNTHETIC_CARDS, syntheticId } from "./synthetic-cards";
import { TRIGGER, TRIGGER_CARDS } from "./trigger-cards";
import { ZONE, ZONE_CARDS, ZONE_FIGMENTS } from "./zone-cards";
import { CHOSEN_HAND_BANISH_CARDS, HAND_BANISH } from "./chosen-hand-banish-cards";

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
  /** A complete optional resolving energy and discard payment before drawing. */
  resolvingPayment: labEvent(0x43800, 0, p.payTo({ energy: 2, discard: 1 }, p.draw(2))),
  /** Grant a full extra turn using the ordinary queue. */
  extraTurn: labEvent(0x11200, 0, p.takeExtraTurn()),
  /** An explicit zero-energy Reclaim route with an optional one-energy payment. */
  routeCharacter: {
    ...SYNTHETIC.vanilla2, id: syntheticId(0x41910), status: "authored",
    abilities: () => [reclaim(energy(0)), additionalCost(optionalCost(energy(1)))],
  },
  /** Draw the synthetic character and set its ordinary energy component. */
  routeSetter: labEvent(0x41911, 0, p.modifyCardCost(p.drawMatching({ cardType: "character", costAtMost: 2 }), { set: 0 })),
  /** Discard the drawn character so its chosen route can be played normally. */
  routeDiscarder: {
    ...SYNTHETIC.event0, id: syntheticId(0x41912), status: "authored",
    abilities: () => [additionalCost(discardCostFilter({ cardType: "character" })), event(p.gainPoints(1))],
  },
  /** A Fast activation that chooses an empty position for its source. */
  mover: {
    id: syntheticId(0x372), cardType: "character", costs: [energy(1)], spark: 1,
    subtype: "Warrior", speed: "standard", status: "authored",
    abilities: () => [activated([energy(1)], p.move(self()), { speed: "fast" })],
  },
  /** An Interrupt that takes control of a selected enemy character. */
  transferMover: {
    id: syntheticId(0x416), cardType: "event", costs: [energy(1)], spark: null,
    subtype: "", speed: "interrupt", status: "authored",
    abilities: () => [event(p.gainControl(characterTarget(enemyCharacter())))],
  },
  /** Choose X, then a character with exactly that copiable cost. */
  xCostTarget: {
    id: syntheticId(0x308), cardType: "event", costs: [energyX(0)], spark: null,
    subtype: "", speed: "standard", status: "authored",
    abilities: () => [event(p.gainSpark(characterTarget(characterYouControl({ costAtLeast: x(), costAtMost: x() })), 1))],
  },
  /** Return a controlled character as an activation cost, choosing among public battlefield cards. */
  returnPayer: {
    id: syntheticId(0x37f), cardType: "character", costs: [energy(1)], spark: 1,
    subtype: "Warrior", speed: "standard", status: "authored",
    abilities: () => [activated([returnCost()], p.gainPoints(1))],
  },
  /** Pay by banishing one of several opponent void cards in the existing gallery. */
  anyVoidPayer: {
    id: syntheticId(0x392), cardType: "character", costs: [energy(0)], spark: 1,
    subtype: "Mage", speed: "standard", status: "authored",
    abilities: () => [activated([banishFromAnyVoidCost(1, {}, "opponent")], p.gainPoints(1))],
  },
  /** "Abandon a character: Materialize this character from your void." Works only from its owner's void. */
  voidRevenant: {
    id: syntheticId(0x49000), cardType: "character", costs: [energy(3)], spark: 2,
    subtype: "Ancient", speed: "standard", status: "authored",
    abilities: () => [activated([abandonCost()], p.materialize(thisCardIn("void")), { zone: "void" })],
  },
  /** "2●, Banish a card from your void: Materialize this character from your void." Works only from its owner's void. */
  voidReaper: {
    id: syntheticId(0x49001), cardType: "character", costs: [energy(4)], spark: 3,
    subtype: "Ancient", speed: "standard", status: "authored",
    abilities: () => [activated([energy(2), banishFromVoidCost(1)], p.materialize(thisCardIn("void")), { zone: "void" })],
  },
  /** "You may play characters from your void." */
  voidPermit: {
    id: syntheticId(0x371), cardType: "character", costs: [energy(2)], spark: 1,
    subtype: "Warrior", speed: "standard", status: "authored",
    abilities: () => [staticAbility(p.playFromZone("void", { cardType: "character" }))],
  },
  /** A public permission covering only characters within inclusive spark bounds. */
  sparkVoidPermit: {
    ...SYNTHETIC.vanilla1, id: syntheticId(0x46200), status: "authored",
    abilities: () => [staticAbility(p.playFromZone("void", { sparkAtLeast: 1, sparkAtMost: 2 }))],
  },
  /** Return a void card after an optional resolution-time payment. */
  optionalReturn: labEvent(0x70, 0, p.returnFromVoid(everyIn("void"), { pay: 1 })),
  /** "Draw 2 cards, then discard a card." */
  drawTwoThenDiscard: labEvent(1, 1, p.sequence(p.draw(2), p.discard(1))),
  /** "Each player discards a card." */
  eachPlayerDiscards: labEvent(2, 1, p.sequence(p.discard(1), p.discard(1, "opponent"))),
  /** Privately choose a card from the opponent's hand to discard. */
  discardChosen: labEvent(9, 1, p.discardChosen()),
  /** Privately choose a character from the opponent's hand to banish. */
  banishChosen: labEvent(0x61, 1, p.banishChosen({ cardType: "character" })),
  /** "Choose a card in the opponent's hand. That card cannot be played this turn." */
  restrictChosen: labEvent(0x64, 1, p.cannotPlayChosen({ duration: "untilEndOfTurn" })),
  /** "Shuffle up to one card from your void into your deck. Draw a card, then shuffle 2 cards from your hand into your deck." */
  shuffleInto: labEvent(11, 1, p.sequence(
    p.shuffleInto([fromVoid({}, { upTo: true })]),
    p.draw(1),
    p.shuffleInto([], { chooseFromHand: 2 }),
  )),
  /** "Look at the top 4 cards of your deck. Put one on top of your deck, one on the bottom of your deck, and one into your hand. Put the rest into your void." */
  putFromTop: labEvent(13, 1, p.putFromTop(4, [
    { to: "top", count: 1 },
    { to: "bottom", count: 1 },
    { to: "hand", count: 1 },
    { to: "void", count: "rest" },
  ])),
  /** A placement that publicly exposes one card, followed by an actual blind shuffle. */
  putFromTopThenShuffle: labEvent(0x59, 0, p.sequence(
    p.putFromTop(2, [{ to: "top", count: 1 }, { to: "void", count: 1 }]),
    p.shuffleInto([everyIn("void")]),
  )),
  /** Choose a free Discover cost, then choose a matching character. */
  discoverCost: labEvent(10, 1, p.discover({ cardType: "character" }, { chooseCost: true })),
  /** Choose either player to discard and draw, preserving the source controller. */
  choosePlayer: labEvent(0x60, 1, p.choosePlayer((player) => p.sequence(p.discard(1, player), p.draw(1, player)))),
  /** Choose a character type, then discover a character of that type onto the top of the deck. */
  chooseSubtype: labEvent(0x63, 1, p.chooseSubtype({ then: p.discover({ cardType: "character", subtype: p.CHOSEN_SUBTYPE }, {}, "deckTop") })),
  /** Choose one of your characters to abandon during resolution. */
  abandon: labEvent(0x62, 1, p.abandon()),
  /** "Return all but one character you control to hand. Draw a card for each character returned." */
  keep: labEvent(0x65, 1, p.returnAllButOne({ drawForEach: true })),
  /** "Dissolve up to one enemy." */
  dissolveUpToOne: labEvent(3, 1, p.dissolve(upTo(enemyCharacter(), 1))),
  /** A pending event (D36): it plays text-less and reports its pending ability. */
  sketch: { ...labEvent(6, 0, p.draw(1)), status: "pending" },
  /** "Reveal the opponent's hand. Draw a card." */
  spyglass: labEvent(7, 0, p.sequence(p.reveal("opponent"), p.draw(1))),
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
    ...CONDITIONAL_STATIC_CARDS,
    ...CAPTURE_CARDS,
    ...ZONE_CARDS,
    ...CHOSEN_HAND_BANISH_CARDS,
    ...Object.values(LAB),
  ],
  emblems: SYNTHETIC_EMBLEMS,
  figments: [...ZONE_FIGMENTS, CAPTURE_FIGMENT],
};

/** Display data for the lab cards a fixture places: QA labels, not player copy. */
export const PROMPT_LAB_CARD_TEXT: Readonly<Record<CardId, { readonly name: string; readonly text: string }>> = {
  [CAPTURE.caller.id]: { name: "Lab Ember Keeper", text: "☾: Materialize two awakened Ember figments. Abandon them at end of turn." },
  [CAPTURE.watcher.id]: { name: "Lab Departure Witness", text: "When you abandon a character, gain 1⍟." },
  [HAND_BANISH.freeCard.id]: { name: "Lab Hand Keeper", text: "▸Materialized: Banish a chosen card from the opponent's hand until this character leaves play." },
  [HAND_BANISH.paidCard.id]: { name: "Lab Paid Hand Keeper", text: "▸Materialized: Banish a chosen card from the opponent's hand until this character leaves play." },
  [HAND_BANISH.freeCharacter.id]: { name: "Lab Character Keeper", text: "▸Materialized: Banish a chosen character from the opponent's hand until this character leaves play." },
  [HAND_BANISH.paidCharacter.id]: { name: "Lab Paid Character Keeper", text: "▸Materialized: Banish a chosen character from the opponent's hand until this character leaves play." },
  [HAND_BANISH.bounce.id]: { name: "Lab Hand Return", text: "Return a character to hand." },
  [HAND_BANISH.candidate.id]: { name: "Lab Return Witness", text: "▸Materialized: Gain 3 points." },
  [HAND_BANISH.absent.id]: { name: "Lab Departing Keeper", text: "▸Materialized: Return this character to hand, then banish a chosen card from the opponent's hand until this character leaves play." },
  [HAND_BANISH.timedCard.id]: { name: "Lab Ending Keeper", text: "▸Materialized: Banish a chosen card from the opponent's hand until end of turn." },
  [CONDITIONAL.permit.id]: { name: "Lab Conditional Gatekeeper", text: "Once per turn, if you have one or fewer cards in hand, you may play an event from your void. 0●: Draw a card." },
  [CONDITIONAL.freeEvent.id]: { name: "Lab Conditional Witness", text: "Gain 1⍟." },
  [LAB.extraTurn.id]: { name: "Lab Moment", text: "Take an extra turn after this one." },
  [LAB.abandon.id]: { name: "Lab Farewell", text: "Abandon a character." },
  [LAB.voidPermit.id]: { name: "Lab Gatekeeper", text: "You may play characters from your void." },
  [LAB.optionalReturn.id]: { name: "Lab Return", text: "You may pay 1● to return your void cards to hand." },
  [LAB.putFromTopThenShuffle.id]: { name: "Lab Recollection", text: "Look at the top 2 cards of your deck. Put one on top of your deck and the other into your void. Shuffle your void into your deck." },
  [LAB.choosePlayer.id]: { name: "Lab Rekindling", text: "Choose a player. That player discards a card, then draws a card." },
  [LAB.chooseSubtype.id]: { name: "Lab Calling", text: "Choose a character type. Discover a character of that type and put it on top of your deck." },
  [LAB.xCostTarget.id]: { name: "Lab Variable Blessing", text: "A character you control with cost X gains +1✦." },
  [LAB.resolvingPayment.id]: { name: "Lab Bargain", text: "You may pay 2● and discard a card. If you do, draw 2 cards." },
  [LAB.routeCharacter.id]: { name: "Lab Wayfarer", text: "As an additional cost to play this character, you may pay 1●. Reclaim 0●" },
  [LAB.routeSetter.id]: { name: "Lab Summons", text: "Draw a ≤2● cost character from your deck. It costs 0●." },
  [LAB.routeDiscarder.id]: { name: "Lab Sacrifice", text: "To play this card, discard a character. Gain 1⍟." },
  [LAB.returnPayer.id]: { name: "Lab Recaller", text: "Return a character you control to hand: Gain 1⍟." },
  [LAB.anyVoidPayer.id]: { name: "Lab Grave Robber", text: "Banish a card from the opponent's void: Gain 1⍟." },
  [LAB.sparkVoidPermit.id]: { name: "Lab Warden", text: "You may play 1✦ to 2✦ cards from your void." },
  [LAB.discardChosen.id]: { name: "Lab Inquisition", text: "Discard a chosen card from the opponent's hand." },
  [LAB.banishChosen.id]: { name: "Lab Exile", text: "Banish a chosen character from the opponent's hand." },
  [LAB.restrictChosen.id]: { name: "Lab Silence", text: "Choose a card in the opponent's hand. That card cannot be played this turn." },
  [LAB.discoverCost.id]: { name: "Lab Seeking", text: "Choose a cost. Discover a character with that cost." },
  [LAB.keep.id]: { name: "Lab Recall", text: "Return all but one character you control to hand. Draw a card for each character returned." },
  [SYNTHETIC.vanilla0.id]: { name: "Lab Squire", text: "" },
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
  [DSL.discoverCharacter.id]: { name: "Lab Arrival", text: "Discover a character." },
  [DSL.erodeTakeCharacter.id]: {
    name: "Lab Sifting Sands",
    text: "Erode 3. You may put a ≤2● cost character from among those cards into your hand.",
  },
  [DSL.erodeTakeTwo.id]: { name: "Lab Parting Mist", text: "Erode 4. You may put two of those cards into your hand." },
  [DSL.takeFromOpponentHand.id]: { name: "Lab Pickpocket", text: "Look at the opponent's hand. Put a card from it into your hand." },
  [DSL.linkedBanish.id]: { name: "Lab Linked Banish", text: "Materialized: Look at the top 4 cards and banish one. Dissolved: Put the banished card into your hand." },
  [DSL.lookAtTopDraw.id]: {
    name: "Lab Pilgrimage",
    text: "Look at the top 4 cards of your deck. Choose one: Draw 1 of the cards, or draw 2 of the cards and they gain ephemeral.",
  },
  [STACK.preventUnlessPays.id]: { name: "Lab Denial", text: "Prevent a card the opponent played unless they pay 2●." },
  [STACK.preventToDeckBottom.id]: { name: "Lab Undertow", text: "Prevent a played card. Put it on the bottom of its owner's deck." },
  [STACK.preventUnlessAbandons.id]: { name: "Lab Ransom", text: "Prevent a card the opponent played unless they abandon a non-figment character." },
  [STACK.banishVoidToDraw.id]: { name: "Lab Exhumation", text: "To play this card, banish 2 cards from your void. Draw a card." },
  [LOOP.freePoints.id]: { name: "Lab Engine", text: "Gain 1⍟." },
  [ZONE.offeringDraw.id]: { name: "Lab Offering", text: "Offering. Draw 2 cards." },
  [ZONE.reclaimDraw.id]: { name: "Lab Echo", text: "Draw a card. Reclaim 1●." },
  [ZONE.twoWarriors.id]: { name: "Lab Muster", text: "Materialize two 1✦ Warrior figments." },
  [ZONE.handEcho.id]: { name: "Lab Reflection", text: "Add an ephemeral copy of a character you control to your hand." },
  [ZONE.ephemeralDraw.id]: { name: "Lab Glimpse", text: "Draw 2 cards with ephemeral." },
  [ZONE.reclaimer.id]: { name: "Lab Revenant", text: "Reclaim" },
  [LAB.transferMover.id]: { name: "Lab Transfer", text: "Interrupt. Gain control of an enemy." },
  [LAB.mover.id]: { name: "Lab Mover", text: "❖ – 1●: Move this character to an unoccupied position." },
  [LAB.drawTwoThenDiscard.id]: { name: "Lab Sifting", text: "Draw 2 cards, then discard a card." },
  [LAB.eachPlayerDiscards.id]: { name: "Lab Tithe", text: "Each player discards a card." },
  [LAB.dissolveUpToOne.id]: { name: "Lab Mercy", text: "Dissolve up to one enemy." },
  [LAB.shuffleInto.id]: {
    name: "Lab Reshuffle",
    text: "Shuffle up to one card from your void into your deck. Draw a card, then shuffle 2 cards from your hand into your deck.",
  },
  [LAB.putFromTop.id]: {
    name: "Lab Augury",
    text: "Look at the top 4 cards of your deck. Put one on top of your deck, one on the bottom of your deck, and one into your hand. Put the rest into your void.",
  },
  [LAB.sketch.id]: { name: "Lab Sketch", text: "" },
  [LAB.spyglass.id]: { name: "Lab Spyglass", text: "Reveal the opponent's hand. Draw a card." },
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
  [LAB.voidRevenant.id]: { name: "Lab Revenant", text: "Abandon a character: Materialize this character from your void." },
  [LAB.voidReaper.id]: { name: "Lab Reaper", text: "2●, Banish a card from your void: Materialize this character from your void." },
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
    name: "captured-figment-abandon",
    description: "A normal activation materializes two awakened figments and abandons their captured cohort at end of turn",
    setup: { active: "player", phase: "day", player: {
      back: [CAPTURE.caller.id, CAPTURE.watcher.id], deck: deck(6),
    }, enemy: { deck: deck(6) } },
    script: [],
  },
  {
    name: "conditional-static-permission",
    description: "A conditional void permission whose allowance survives its hand-count condition toggling",
    setup: { active: "player", phase: "day", player: {
      back: [CONDITIONAL.permit.id], hand: [CONDITIONAL.freeEvent.id],
      void: [CONDITIONAL.freeEvent.id, CONDITIONAL.freeEvent.id],
      deck: Array.from({ length: 6 }, () => CONDITIONAL.freeEvent.id),
    }, enemy: { deck: deck(6) } },
    script: [],
  },
  {
    name: "chosen-hand-banish-duration",
    description: "A paid chosen-hand banishment, a public duration and a return to the owner's hand",
    setup: { active: "player", phase: "day",
      player: { hand: [HAND_BANISH.paidCharacter.id, HAND_BANISH.bounce.id], back: [SYNTHETIC.vanilla1.id], energy: 1, deck: deck(6) },
      enemy: { hand: [HAND_BANISH.candidate.id, HAND_BANISH.candidate.id, SYNTHETIC.event0.id], deck: deck(6) } },
    script: [],
    presents: [playHand(0), { side: "player", answer: (ids) => [at(ids.enemy.hand, 1)] },
      playHand(1), target((ids) => at(ids.player.hand, 0))],
  },
  ...SIDES.flatMap((side): PromptLabFixture[] => ["event", "character"].flatMap((kind) => [false, true].map((paid): PromptLabFixture => {
    const source = kind === "character"
      ? paid ? HAND_BANISH.paidCharacter.id : HAND_BANISH.freeCharacter.id
      : paid ? HAND_BANISH.paidCard.id : HAND_BANISH.freeCard.id;
    const candidate = kind === "character" ? HAND_BANISH.candidate.id : SYNTHETIC.event0.id;
    return {
      name: `chosen-hand-${side}-${kind}-${paid ? "paid" : "free"}`,
      description: "Chosen-hand banishment with matching physical twins and a source departure",
      setup: {
        active: side, phase: "day",
        player: side === "player"
          ? { back: [source], hand: [source, HAND_BANISH.bounce.id], energy: paid ? 1 : 0, deck: deck(6) }
          : { hand: [candidate, candidate, HAND_BANISH.bounce.id, HAND_BANISH.bounce.id], deck: deck(6) },
        enemy: side === "enemy"
          ? { back: [source], hand: [source], energy: paid ? 1 : 0, deck: deck(6) }
          : { hand: kind === "character" ? [candidate, candidate, SYNTHETIC.event0.id] : [candidate, candidate], deck: deck(6) },
      },
      // The enemy prelude is a public play intent; its private choice and
      // resolution continue through the battle's normal AI prompt host.
      script: side === "enemy" ? [play("enemy", (ids) => first(ids.enemy.hand))] : [],
    };
  }))),
  {
    name: "resolving-payment-energy-short",
    description: "A resolving payment with insufficient energy",
    setup: { active: "player", phase: "day", player: { hand: [LAB.resolvingPayment.id, vanillas[0], vanillas[1]], energy: 1, deck: deck(6) }, enemy: { deck: deck(6) } },
    script: [play("player", (ids) => first(ids.player.hand))],
  },
  {
    name: "resolving-payment-hand-short",
    description: "A resolving payment with an empty remaining hand",
    setup: { active: "player", phase: "day", player: { hand: [LAB.resolvingPayment.id], energy: 3, deck: deck(6) }, enemy: { deck: deck(6) } },
    script: [play("player", (ids) => first(ids.player.hand))],
  },
  {
    name: "resolving-payment",
    description: "An optional fixed energy and exact discard payment during resolution",
    setup: { active: "player", phase: "day", player: { hand: [LAB.resolvingPayment.id, vanillas[0], vanillas[1]], energy: 3, deck: deck(6) }, enemy: { deck: deck(6) } },
    script: [play("player", (ids) => first(ids.player.hand))],
    presents: [{ side: "player", answer: () => true }, { side: "player", answer: (ids) => [at(ids.player.hand, 1)] }],
  },

  {
    name: "route-cost-set", description: "Choose an optional payment when reclaiming a drawn card with its own cost set",
    setup: { active: "player", phase: "day",
      player: { hand: [LAB.routeSetter.id, LAB.routeDiscarder.id], energy: 1, deck: [LAB.routeCharacter.id, ...deck(6)] },
      enemy: { hand: [], energy: 0, deck: deck(6) } },
    script: [],
  },
  {
    name: "move", description: "Choose an empty battlefield position during a Fast activation",
    setup: { active: "player", phase: "night",
      player: { back: [LAB.mover.id], energy: 2, deck: deck(6) }, enemy: { deck: deck(6) } },
    script: [{ side: "player", action: (ids) => ({ kind: "activate", source: at(ids.player.back, 0), ability: 0 }) }],
  },
  {
    name: "move-transferred", description: "Choose a position on the opponent’s battlefield after control changes in response",
    setup: { active: "player", phase: "night",
      player: { back: [LAB.mover.id], energy: 2, deck: deck(6) },
      enemy: { hand: [LAB.transferMover.id], energy: 1, deck: deck(6) } },
    script: [
      { side: "player", action: (ids) => ({ kind: "activate", source: at(ids.player.back, 0), ability: 0 }) },
      play("enemy", (ids) => at(ids.enemy.hand, 0)),
    ],
  },
  {
    name: "optional-payment", description: "Pay or decline a resolution-time return from the void",
    setup: { active: "player", phase: "day", player: { hand: [LAB.optionalReturn.id], void: [vanillas[0]], energy: 1, deck: deck(6) }, enemy: { deck: deck(6) } },
    script: [playHand(0)],
  },
  {
    name: "abandon",
    description: "Choose one public battlefield character to abandon as the effect resolves",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.abandon.id], back: [vanillas[0], vanillas[0]], energy: 2, deck: deck(6) },
      enemy: { back: [vanillas[1]], hand: [vanillas[2]], deck: deck(6) },
    },
    script: [],
  },
  {
    name: "keep",
    description: "Choose one public battlefield character to keep as the rest return to hand, then draw for each return",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.keep.id], back: [vanillas[0], vanillas[1]], front: [vanillas[2]], energy: 2, deck: deck(6) },
      enemy: { back: [vanillas[1]], deck: deck(6) },
    },
    script: [],
  },
  {
    name: "choose-player",
    description: "Choose either player, then that player chooses their own discard",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.choosePlayer.id, ...vanillas], energy: 2, deck: deck(6) },
      enemy: { hand: vanillas, deck: deck(6) },
    },
    script: [],
  },
  {
    name: "choose-subtype",
    description: "Choose a character type among the catalog's, then discover a character of it onto the top of the deck",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.chooseSubtype.id], energy: 2, deck: [...vanillas, ...deck(3)] },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [playHand(0), { side: "player", answer: () => 0 }],
  },
  {
    name: "costs",
    description: "Alternative and optional costs, with abandon, discard, and reveal selections",
    setup: {
      active: "player", phase: "day",
      player: {
        hand: [STACK.abandonOrDiscardToDraw.id, STACK.optionalKicker.id, ...vanillas],
        back: [STACK.abandonToDraw.id, STACK.discardToDissolve.id, STACK.revealWarrior.id, vanillas[0]],
        energy: 5, deck: deck(6),
      },
      enemy: { back: [vanillas[1], vanillas[2]], deck: deck(6) },
    },
    script: [],
  },
  {
    name: "return-cost", description: "Return a controlled front- or back-rank character as a cost",
    setup: { active: "player", phase: "day", player: { front: [vanillas[0]], back: [LAB.returnPayer.id, vanillas[1]], deck: deck(6) }, enemy: { deck: deck(6) } },
    script: [],
  },
  {
    name: "hand-limit",
    description: "The active side discards down to its hand limit at the end of the turn",
    setup: {
      active: "player", phase: "night",
      player: { hand: deck(BATTLE.handLimit + 2), deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
  {
    name: "discard-chosen",
    description: "A private gallery selection from the opponent's hand to discard",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.discardChosen.id], energy: 2, deck: deck(6) },
      enemy: { hand: vanillas, deck: deck(6) },
    },
    script: [],
  },
  {
    name: "banish-chosen",
    description: "A private gallery selection of a character from the opponent's hand to banish",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.banishChosen.id], energy: 2, deck: deck(6) },
      enemy: { hand: [...vanillas, LAB.discardChosen.id], deck: deck(6) },
    },
    script: [],
  },
  {
    name: "restrict-chosen",
    description: "A private gallery selection of an opponent hand card that cannot be played",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.restrictChosen.id], energy: 2, deck: deck(6) },
      enemy: { hand: vanillas, deck: deck(6) },
    },
    script: [],
  },
  {
    name: "discover-cost",
    description: "A free Discover cost choice, followed by matching cards from the deck",
    setup: {
      active: "player", phase: "day",
      player: { hand: [LAB.discoverCost.id], energy: 2, deck: [...vanillas, ...deck(6)] },
      enemy: { deck: deck(6) },
    },
    script: [],
  },
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
    description: "Foresee 2: an arrangement private to the human, presented as one card into the void and one kept on top",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.foreseeTwo.id], energy: 2, deck: [vanillas[0], vanillas[1], vanillas[2], ...deck(4)] },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [
      playHand(0),
      {
        side: "player",
        answer: (ids) => [
          { card: at(ids.player.deck, 1), to: "top" },
          { card: at(ids.player.deck, 0), to: "void" },
        ],
      },
    ],
  },
  {
    name: "discover",
    description: "Discover a character: a private pick of one of the three characters in the deck",
    setup: {
      active: "player",
      phase: "day",
      player: {
        hand: [DSL.discoverCharacter.id],
        energy: 2,
        deck: [vanillas[0], SYNTHETIC.interruptEvent.id, vanillas[1], SYNTHETIC.interruptEvent.id, vanillas[2]],
      },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [playHand(0), { side: "player", answer: (ids) => [at(ids.player.deck, 2)] }],
  },
  {
    name: "linked-banish",
    description: "Choose one top-deck card to banish for the source's paired departure ability",
    setup: { active: "player", phase: "day", player: { hand: [DSL.linkedBanish.id], deck: [...vanillas, ...deck(3)] }, enemy: { deck: deck(6) } },
    script: [], presents: [playHand(0), { side: "player", answer: (ids) => [at(ids.player.deck, 2)] }],
  },
  {
    name: "take-from-among",
    description: "Erode 3, then up to one ≤2● cost character from among the eroded cards into the hand, or Skip",
    setup: {
      active: "player",
      phase: "day",
      player: {
        hand: [DSL.erodeTakeCharacter.id],
        energy: 2,
        deck: [vanillas[0], vanillas[2], SYNTHETIC.interruptEvent.id, vanillas[1], ...deck(3)],
      },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [playHand(0), { side: "player", answer: (ids) => [at(ids.player.deck, 0)] }],
  },
  {
    name: "take-two-from-among",
    description: "Erode 4, then a \"you may\" and, on Yes, exactly two of the eroded cards into the hand",
    setup: {
      active: "player",
      phase: "day",
      player: {
        hand: [DSL.erodeTakeTwo.id],
        energy: 2,
        deck: [vanillas[0], vanillas[2], SYNTHETIC.interruptEvent.id, vanillas[1], ...deck(3)],
      },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [playHand(0), { side: "player", answer: () => true }, { side: "player", answer: (ids) => [at(ids.player.deck, 0), at(ids.player.deck, 3)] }],
  },
  {
    name: "take-from-opponent-hand",
    description: "Look at the opponent's hand: a private pick of one of its cards, which goes into the human's hand",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.takeFromOpponentHand.id], energy: 2, deck: deck(6) },
      enemy: { hand: [vanillas[0], vanillas[1], vanillas[2]], deck: deck(6) },
    },
    script: [],
    presents: [playHand(0), { side: "player", answer: (ids) => [at(ids.enemy.hand, 1)] }],
  },
  {
    name: "look-at-top",
    description: "Look at the top 4: choose a mode, then a private pick of the 2 cards drawn with ephemeral; the rest stay on top",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.lookAtTopDraw.id], energy: 2, deck: [vanillas[0], vanillas[1], vanillas[2], SYNTHETIC.interruptEvent.id, ...deck(3)] },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [
      playHand(0),
      { side: "player", answer: () => 1 },
      { side: "player", answer: (ids) => [at(ids.player.deck, 1), at(ids.player.deck, 3)] },
    ],
  },
  {
    name: "shuffle-into",
    description: "A void target shuffled into the deck, a draw, then a pick of 2 hand cards shuffled into the deck",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [LAB.shuffleInto.id, vanillas[1], vanillas[2]], void: [vanillas[0]], energy: 2, deck: deck(4) },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [
      playHand(0),
      target((ids) => at(ids.player.void, 0)),
      { side: "player", answer: (ids) => [at(ids.player.hand, 1), at(ids.player.hand, 2)] },
    ],
  },
  {
    name: "put-in-deck-log",
    description: "Public placement retains its authorized log identity through a later blind shuffle",
    setup: { active: "player", phase: "day",
      player: { hand: [LAB.putFromTopThenShuffle.id], energy: 2, deck: [vanillas[0], vanillas[1]] }, enemy: { deck: deck(6) } },
    script: [],
    presents: [playHand(0), { side: "player", answer: (ids) => [
      { card: at(ids.player.deck, 0), to: "top" }, { card: at(ids.player.deck, 1), to: "void" },
    ] }],
  },
  {
    name: "put-in-deck-opponent-log",
    description: "Opponent's public placement remains named in the human log after a blind shuffle",
    setup: { active: "enemy", phase: "day",
      player: { deck: deck(6) }, enemy: { hand: [LAB.putFromTopThenShuffle.id], energy: 2, deck: [vanillas[0], vanillas[1]] } },
    script: [play("enemy", (ids) => at(ids.enemy.hand, 0))],
    presents: [{ side: "enemy", answer: (ids) => [
      { card: at(ids.enemy.deck, 0), to: "top" }, { card: at(ids.enemy.deck, 1), to: "void" },
    ] }],
  },
  {
    name: "put-in-deck",
    description: "Look at the top 4: a private arrangement of one card on top, one on the bottom, one into the hand, and the rest into the void",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [LAB.putFromTop.id], energy: 2, deck: [vanillas[0], vanillas[1], vanillas[2], SYNTHETIC.interruptEvent.id, ...deck(3)] },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [
      playHand(0),
      {
        side: "player",
        answer: (ids) => [
          { card: at(ids.player.deck, 1), to: "top" },
          { card: at(ids.player.deck, 0), to: "bottom" },
          { card: at(ids.player.deck, 2), to: "hand" },
          { card: at(ids.player.deck, 3), to: "void" },
        ],
      },
    ],
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
    name: "any-void-cost", description: "Banish an opponent void card as an activation cost",
    setup: { active: "player", phase: "day", player: { back: [LAB.anyVoidPayer.id], deck: deck(6) }, enemy: { void: [vanillas[0], vanillas[1], vanillas[2]], deck: deck(6) } },
    script: [],
  },
  {
    name: "void-activation",
    description: "Activated abilities that work from the void: a ringed void pile and void browser tiles that activate",
    setup: {
      active: "player",
      phase: "day",
      player: { back: [vanillas[0], vanillas[2]], void: [vanillas[1], LAB.voidRevenant.id, LAB.voidReaper.id], energy: 2, deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [
      { side: "player", action: (ids) => ({ kind: "activate", source: at(ids.player.void, 1), ability: 0 }) },
      target((ids) => at(ids.player.back, 0)),
    ],
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
    name: "void-route",
    description: "A void character that both a play permission and Reclaim cover: the void play route",
    setup: {
      active: "player",
      phase: "day",
      player: { back: [LAB.voidPermit.id], void: [ZONE.reclaimer.id], energy: 3, deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [{ side: "player", action: (ids) => ({ kind: "play", card: at(ids.player.void, 0), from: "void" }) }],
  },
  {
    name: "spark-void-permission",
    description: "A spark-bounded void permission with both boundary matches and nonmatching cards",
    setup: {
      active: "player", phase: "day",
      player: { back: [LAB.sparkVoidPermit.id], void: [SYNTHETIC.vanilla0.id, vanillas[0], vanillas[1], vanillas[2], SYNTHETIC.event0.id], energy: 3, deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [],
    presents: [{ side: "player", action: (ids) => ({ kind: "play", card: at(ids.player.void, 1), from: "void" }) }],
  },
  {
    name: "card-statuses",
    description: "A character played by Reclaim, an ephemeral copy created in hand, and two cards drawn with ephemeral: each card status badge",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [ZONE.handEcho.id, ZONE.ephemeralDraw.id], back: [vanillas[1]], void: [ZONE.reclaimer.id], energy: 10, deck: deck(6) },
      enemy: { deck: deck(6) },
    },
    script: [
      playHand(0),
      playHand(1),
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
    name: "prevent-deck-bottom-player",
    description: "The human prevents the enemy's event onto the bottom of its owner's deck",
    setup: {
      active: "enemy", phase: "day",
      player: { hand: [STACK.preventToDeckBottom.id], energy: 2, deck: deck(6) },
      enemy: { hand: [SYNTHETIC.event0.id], energy: 2, deck: deck(6) },
    },
    script: [play("enemy", (ids) => first(ids.enemy.hand))],
  },
  {
    name: "prevent-deck-bottom-enemy",
    description: "The enemy prevents the human's event onto the bottom of its owner's deck",
    setup: {
      active: "player", phase: "day",
      player: { hand: [SYNTHETIC.event0.id, SYNTHETIC.interruptEvent.id], energy: 2, deck: deck(6) },
      enemy: { hand: [STACK.preventToDeckBottom.id], energy: 2, deck: deck(6) },
    },
    script: [play("player", (ids) => first(ids.player.hand)), play("enemy", (ids) => first(ids.enemy.hand))],
  },
  {
    name: "prevent-unless-abandons",
    description: "The AI prevents the human's event unless the human abandons one of their characters",
    setup: {
      active: "player",
      phase: "day",
      player: { hand: [DSL.drawTwo.id], back: [vanillas[0], vanillas[1]], energy: 4, deck: deck(6) },
      enemy: { hand: [STACK.preventUnlessAbandons.id], back: [vanillas[2]], energy: 2, deck: deck(6) },
    },
    script: [play("player", (ids) => first(ids.player.hand)), play("enemy", (ids) => first(ids.enemy.hand))],
    presents: [{ side: "player", answer: () => true }, { side: "player", answer: (ids) => [at(ids.player.back, 1)] }],
  },
  {
    name: "pay-to-end",
    description: "The player's Day, with the AI's effect on the player's characters lasting until the player pays 2●",
    setup: {
      active: "enemy",
      phase: "day",
      player: { back: [vanillas[0], vanillas[1]], energy: 3, deck: deck(8) },
      enemy: { hand: [STACK.payableEffect.id], energy: 5, deck: deck(8) },
    },
    script: [play("enemy", (ids) => at(ids.enemy.hand, 0)), { passUntilDayOf: "player" }],
    presents: [
      {
        side: "player",
        action: (_ids, state) => {
          const effect = state.payable[0];
          if (effect === undefined) throw new Error("pay-to-end registers no payable effect");
          return { kind: "payToEnd", effect: effect.id };
        },
      },
    ],
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
    description: "Presentation: durations, a granted keyword, disabled triggers, a cost change, a payable effect, exhaustion, points, a floating trigger, and an extra turn, then the player's extra turn passes into the enemy Day",
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
          LAB.extraTurn.id,
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
      playHand(8),
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
    name: "present-reveal",
    description: "Presentation: the AI reveals the human's hand and draws a card, then draws for its next turn",
    setup: {
      active: "enemy",
      phase: "day",
      player: { hand: [vanillas[0], SYNTHETIC.interruptEvent.id], deck: deck(8) },
      enemy: { hand: [LAB.spyglass.id], energy: 2, deck: deck(8) },
    },
    script: [],
    presents: [play("enemy", (ids) => at(ids.enemy.hand, 0)), { passUntilDayOf: "player" }, { passUntilDayOf: "enemy" }],
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
 * An optional observer receives each successful script step's published events.
 */
export function promptLabBattle(engine: Engine, fixture: PromptLabFixture, published?: (events: readonly EngineEvent[]) => void): { init: BattleInit; slice: BattleSlice } {
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
    const result = applyLabStep(engine, adapter, fixture, ids, slice, step);
    slice = result.slice;
    published?.(result.published);
  }
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
  /**
   * The events the engine step this one continues published before it: a
   * step that ends at a prompt goes on in the next, which may make a move an
   * earlier event announced. Empty when the step begins a new engine step.
   */
  readonly earlier: readonly EngineEvent[];
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
  let earlier: readonly EngineEvent[] = [];
  const apply = (step: LabStep) => {
    const applied = applyLabStep(engine, adapter, fixture, ids, slice, step);
    const continued = earlier;
    slice = applied.slice;
    earlier = adapter.pending(slice) === null ? [] : [...continued, ...applied.published];
    return { published: applied.published, earlier: continued };
  };
  for (const step of fixture.script) apply(step);
  return (fixture.presents ?? []).map((step) => {
    const before = shown(slice);
    const applied = apply(step);
    return { ...applied, before, after: shown(slice) };
  });
}

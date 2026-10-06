/**
 * Synthetic effects that raise every prompt kind, for prompt-protocol tests
 * and the fuzzer. Test fixtures only: catalog cards never carry hooks.
 */
import { printedCardId, type EngineCardDefinition, type SyntheticHooks } from "../catalog";
import { energy, energyX } from "../dsl/builders";
import type { CardCost } from "../dsl/types";
import type {
  ArrangeDestination,
  ArrangePrompt,
  ChooseCardsPrompt,
  ChooseModePrompt,
  ChooseNumberPrompt,
  ChooseTargetsPrompt,
  ConfirmPrompt,
  PayOrDeclinePrompt,
  PromptPurpose,
} from "../prompts/types";
import { discardCard, drawCard } from "../rules/resources";
import { charactersInPlay, dissolve, instanceOf, moveInstance } from "../rules/zones";
import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { StepContext } from "../steps/types";
import { syntheticId } from "./synthetic-cards";

function purpose(ctx: StepContext, source: InstanceId, role: string): PromptPurpose {
  return { source, cardId: printedCardId(instanceOf(ctx.state, source).printing), ability: 0, role };
}

/** Has `side` choose a card from its hand to discard, or emits noLegalTarget for an empty hand. */
export function chooseAndDiscard(ctx: StepContext, side: Side, source: InstanceId): void {
  const hand = ctx.state.sides[side].hand.filter((card) => card !== source);
  if (hand.length === 0) {
    ctx.emit({ kind: "noLegalTarget", source });
    return;
  }
  const [card] = ctx.choose<ChooseCardsPrompt>({
    kind: "chooseCards",
    side,
    purpose: purpose(ctx, source, "discard"),
    candidates: hand,
    min: 1,
    max: 1,
  });
  if (card !== undefined) discardCard(ctx, side, card);
}

function event(
  index: number,
  cost: number | readonly CardCost[],
  synthetic: SyntheticHooks,
  speed: EngineCardDefinition["speed"] = "standard",
): EngineCardDefinition {
  return {
    id: syntheticId(index),
    cardType: "event",
    costs: typeof cost === "number" ? [energy(cost)] : cost,
    spark: null,
    subtype: "",
    speed,
    keywords: [],
    status: "authored",
    abilities: () => [],
    synthetic,
  };
}

/** Synthetic prompting events, by role. */
export const PROMPTING = {
  /** "Discard a card." */
  discard: event(101, 0, {
    resolve: (ctx, item) => chooseAndDiscard(ctx, item.controller, item.instance),
  }),
  /** "The opponent discards a card." */
  opponentDiscards: event(102, 1, {
    resolve: (ctx, item) => chooseAndDiscard(ctx, opponent(item.controller), item.instance),
  }),
  /** "Each player discards a card," the controller first: prompts alternate sides in one step. */
  eachPlayerDiscards: event(103, 1, {
    resolve: (ctx, item) => {
      chooseAndDiscard(ctx, item.controller, item.instance);
      chooseAndDiscard(ctx, opponent(item.controller), item.instance);
    },
  }),
  /** "Dissolve an enemy character." A play-time target, so it cannot be played without one. */
  dissolveEnemy: event(104, 1, {
    play: (ctx, self) => {
      const side = instanceOf(ctx.state, self).controller;
      return {
        targets: [ctx.choose<ChooseTargetsPrompt>({
          kind: "chooseTargets",
          side,
          purpose: purpose(ctx, self, "dissolveEnemy"),
          candidates: charactersInPlay(ctx.state, opponent(side)),
          min: 1,
          max: 1,
        })],
      };
    },
    resolve: (ctx, item) => {
      const target = item.targets[0]?.[0];
      if (target !== undefined && instanceOf(ctx.state, target).zone === "play") {
        dissolve(ctx, target, item.controller);
      } else {
        ctx.emit({ kind: "noLegalTarget", source: item.instance });
      }
    },
  }, "fast"),
  /** "Choose one: draw a card; or gain 1●." */
  chooseOne: event(105, 0, {
    resolve: (ctx, item) => {
      const mode = ctx.choose<ChooseModePrompt>({
        kind: "chooseMode",
        side: item.controller,
        purpose: purpose(ctx, item.instance, "chooseOne"),
        options: [
          { mode: 0, legal: true },
          { mode: 1, legal: true },
        ],
      });
      if (mode === 0) {
        drawCard(ctx, item.controller);
      } else {
        ctx.state.sides[item.controller].currentEnergy += 1;
      }
    },
  }),
  /** "X: draw X cards," with X (from 0) chosen at play time. */
  drawX: event(106, [energyX(0)], {
    play: (ctx, self) => {
      const side = instanceOf(ctx.state, self).controller;
      return {
        x: ctx.choose<ChooseNumberPrompt>({
          kind: "chooseNumber",
          side,
          purpose: purpose(ctx, self, "chooseX"),
          min: 0,
          max: Math.min(2, ctx.state.sides[side].currentEnergy),
        }),
      };
    },
    resolve: (ctx, item) => {
      for (let count = 0; count < (item.x ?? 0); count++) drawCard(ctx, item.controller);
    },
  }),
  /** "Foresee 2." */
  foresee: event(107, 0, {
    resolve: (ctx, item) => {
      const deck = ctx.state.sides[item.controller].deck;
      const cards = deck.slice(0, 2);
      if (cards.length === 0) return;
      const arrangement = ctx.choose<ArrangePrompt>({
        kind: "arrange",
        side: item.controller,
        purpose: purpose(ctx, item.instance, "foresee"),
        privateTo: item.controller,
        cards,
        destinations: [
          { to: "top", min: 0, max: cards.length },
          { to: "void", min: 0, max: cards.length },
        ],
      });
      const toTop = arrangement.filter((entry) => entry.to === "top").map((entry) => entry.card);
      for (const entry of arrangement) {
        if (entry.to === "void") moveInstance(ctx, entry.card, "void");
      }
      const rest = ctx.state.sides[item.controller].deck.filter((card) => !toTop.includes(card));
      ctx.state.sides[item.controller].deck = [...toTop, ...rest];
    },
  }),
  /** "Look at the top 2 cards of your deck. Put one on top and the other on the bottom." */
  topAndBottom: event(110, 0, {
    resolve: (ctx, item) => {
      const side = ctx.state.sides[item.controller];
      const cards = side.deck.slice(0, 2);
      if (cards.length === 0) return;
      // With a single card left, it may go to either end.
      const min = cards.length === 2 ? 1 : 0;
      const arrangement = ctx.choose<ArrangePrompt>({
        kind: "arrange",
        side: item.controller,
        purpose: purpose(ctx, item.instance, "topAndBottom"),
        privateTo: item.controller,
        cards,
        destinations: [
          { to: "top", min, max: 1 },
          { to: "bottom", min, max: 1 },
        ],
      });
      const placed = (to: ArrangeDestination) => arrangement.filter((entry) => entry.to === to).map((entry) => entry.card);
      const top = placed("top");
      const bottom = placed("bottom");
      const rest = side.deck.filter((card) => !cards.includes(card));
      side.deck = [...top, ...rest, ...bottom];
    },
  }),
  /** "You may draw a card." */
  mayDraw: event(108, 0, {
    resolve: (ctx, item) => {
      const accept = ctx.choose<ConfirmPrompt>({
        kind: "confirm",
        side: item.controller,
        purpose: purpose(ctx, item.instance, "mayDraw"),
      });
      if (accept) drawCard(ctx, item.controller);
    },
  }),
  /** "Draw a card unless the opponent pays 1●." */
  drawUnlessPays: event(109, 1, {
    resolve: (ctx, item) => {
      const payer = opponent(item.controller);
      const energy = ctx.state.sides[payer].currentEnergy;
      const pays = ctx.choose<PayOrDeclinePrompt>({
        kind: "payOrDecline",
        side: payer,
        purpose: purpose(ctx, item.instance, "drawUnlessPays"),
        energy: 1,
        payable: energy >= 1,
      });
      if (pays) {
        ctx.state.sides[payer].currentEnergy -= 1;
      } else {
        drawCard(ctx, item.controller);
      }
    },
  }, "interrupt"),
} as const;

export const PROMPTING_CARDS: readonly EngineCardDefinition[] = Object.values(PROMPTING);

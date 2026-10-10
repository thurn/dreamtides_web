/**
 * The card-lab (`?goto=card-lab&card=<uuid>&variant=<v>&as=<side>`): a
 * deterministic battle that plays one catalog card in one variant, built
 * from the setup solver (`lab-solver.ts`) plus `lab-overrides.ts`, for the
 * card-lab QA scene and the card sweep (`scripts/qa/card-sweep.mjs`). As
 * the enemy, the lab battle opens with the enemy's play of the card on the
 * stack, so the AI host answers its prompts and the human follows it.
 */
import type { EngineCardDefinition } from "../catalog";
import type { Engine } from "../engine";
import type { BattleSlice } from "../fold/slice";
import type { Side } from "../state/ids";
import type { BattleInit, DeckEntry } from "../state/types";
import type { TransfigurationType } from "../../types/journey";
import { fixedEnergy } from "../dsl/energy";
import type { BoardSetup } from "./board";
import { labBoard } from "./lab-solver";
import { SYNTHETIC } from "./synthetic-cards";
import { promptLabBattle, type PromptLabFixture } from "./prompt-lab";

/** Every variant the card-lab plays: the base card and each transfiguration. */
export const CARD_LAB_VARIANTS = [
  "base",
  "amplified",
  "empowered",
  "kindled",
  "resonant",
  "inspired",
  "enduring",
  "hastened",
  "attuned",
  "perfected",
] as const;

export type CardLabVariant = (typeof CARD_LAB_VARIANTS)[number];

const TRANSFIGURATIONS: Readonly<Record<Exclude<CardLabVariant, "base">, TransfigurationType>> = {
  amplified: "Amplified",
  empowered: "Empowered",
  kindled: "Kindled",
  resonant: "Resonant",
  inspired: "Inspired",
  enduring: "Enduring",
  hastened: "Hastened",
  attuned: "Attuned",
  perfected: "Perfected",
};

/** The variant a URL token names, or `null`. */
export function cardLabVariant(token: string): CardLabVariant | null {
  return CARD_LAB_VARIANTS.find((variant) => variant === token) ?? null;
}

/** The journey transfiguration a variant applies; `null` for the base card. */
export function variantTransfiguration(variant: CardLabVariant): TransfigurationType | null {
  return variant === "base" ? null : TRANSFIGURATIONS[variant];
}

/** A card-lab request: one card UUID's deck entry, with its variant, played by `side`. */
export interface CardLabRequest {
  readonly entry: DeckEntry;
  readonly variant: CardLabVariant;
  readonly side: Side;
}

/**
 * The lab battle's fixture: the solved board (throws when the card stays
 * unplayable) and, as the enemy, the enemy's play of the card. The human
 * then holds a no-effect Interrupt, so the battle stops on the human's
 * response window (P1) with the card on the stack, and its resolution is
 * presented when the human passes.
 */
export function cardLabFixture(engine: Engine, request: CardLabRequest, pool: readonly EngineCardDefinition[]): PromptLabFixture {
  const solved = labBoard(engine, request.entry, pool, request.side).setup;
  const responder = SYNTHETIC.interruptEvent;
  const setup: BoardSetup =
    request.side === "enemy"
      ? { ...solved, player: { ...solved.player, hand: [responder.id], energy: fixedEnergy(responder.costs) } }
      : solved;
  const name = `card-lab:${request.entry.cardId}:${request.variant}:${request.side}`;
  return {
    name,
    description: `The card-lab battle of ${request.entry.cardId} (${request.variant}) for the ${request.side}`,
    setup,
    script:
      request.side === "enemy"
        ? [
            {
              side: "enemy",
              action: (ids) => {
                const card = ids.enemy.hand[0];
                if (card === undefined) throw new Error(`${name} places no enemy hand card`);
                return { kind: "play", card, from: "hand" };
              },
            },
          ]
        : [],
  };
}

/** The card-lab battle: its engine init and its slice, at the card's play. */
export function cardLabBattle(
  engine: Engine,
  request: CardLabRequest,
  pool: readonly EngineCardDefinition[],
): { init: BattleInit; slice: BattleSlice } {
  return promptLabBattle(engine, cardLabFixture(engine, request, pool));
}

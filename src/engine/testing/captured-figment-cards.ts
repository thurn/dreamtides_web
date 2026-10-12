/** Synthetic captured-materialization fixtures shared by contracts, the prompt lab and weighted fuzz. */
import type { EngineCardDefinition, EngineFigmentDefinition } from "../catalog";
import { activated, anyCharacter, characterYouControl, energy, event, everyIn, exhaustSelf, keyword, target } from "../dsl/builders";
import { atEndOfTurn, onDissolved, triggered, whenAbandon } from "../dsl/triggers";
import * as p from "../effects/primitives";
import { parseFigmentId } from "../state/ids";
import { syntheticId } from "./synthetic-cards";

/** An awakened Ember whose own dissolved trigger survives its departure. */
export const CAPTURE_FIGMENT: EngineFigmentDefinition = {
  id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000053380"), subtype: "Ember", spark: 1, status: "authored",
  abilities: () => [keyword("awakened"), triggered(onDissolved(), p.gainPoints(1))],
};

const abandonThem = () => p.abandonCards([p.capturedCards()]);
const summon = (effect: Parameters<typeof p.delayed>[1] = abandonThem()) =>
  p.withMaterialized(p.materializeFigments(CAPTURE_FIGMENT.id, 2), p.delayed(atEndOfTurn(), effect));
const spell = (index: number, effect: Parameters<typeof event>[0], speed: "standard" | "fast" | "interrupt" = "standard"): EngineCardDefinition => ({
  id: syntheticId(0x53300 + index), cardType: "event", costs: [energy(0)], spark: null,
  subtype: "", speed, status: "authored", abilities: () => [event(effect)],
});

export const CAPTURE = {
  caller: { id: syntheticId(0x53301), cardType: "character", costs: [energy(0)], spark: 1, subtype: "Mage",
    speed: "standard", status: "authored", abilities: () => [activated([exhaustSelf()], summon())] },
  fill: spell(11, p.materializeFigments(CAPTURE_FIGMENT.id, 1, { player: "opponent" }), "interrupt"),
  raise: spell(2, summon()),
  duplicates: spell(3, summon(p.abandonCards([p.capturedCards(), p.capturedCards()]))),
  outside: spell(4, p.sequence(summon(), p.materializeFigments(CAPTURE_FIGMENT.id))),
  chooseAfter: spell(5, summon(p.sequence(abandonThem(), p.returnToHand(target(characterYouControl()))))),
  ordinary: spell(6, p.withMaterialized(p.materialize(everyIn("void", { cardType: "character" })), p.delayed(atEndOfTurn(), abandonThem()))),
  bounce: spell(7, p.returnToHand(target(anyCharacter())), "fast"),
  kill: spell(8, p.dissolve(target(anyCharacter())), "fast"),
  seize: spell(9, p.gainControl(target(anyCharacter())), "fast"),
  watcher: { id: syntheticId(0x5330a), cardType: "character", costs: [energy(0)], spark: 1, subtype: "Mage",
    speed: "standard", status: "authored", abilities: () => [triggered(whenAbandon(), p.gainPoints(1))] },
} satisfies Record<string, EngineCardDefinition>;

export const CAPTURE_CARDS: readonly EngineCardDefinition[] = Object.values(CAPTURE);

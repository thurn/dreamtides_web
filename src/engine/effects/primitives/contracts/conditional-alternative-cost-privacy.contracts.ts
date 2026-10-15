/** New physical method observations and dynamic hidden-source aggregate legality. */
import { describe, expect, it } from "vitest";
import { activated, all, enemyCharacter, self, sourceWasAlternativePlayed, thisCardIn } from "../../../dsl/builders";
import type { EngineCardDefinition } from "../../../catalog";
import { cloneState } from "../../../state/clone";
import { SIDES, battleSeed, opponent, type Side } from "../../../state/ids";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { materialize, moveInstance } from "../../../rules/zones";
import { drawCard } from "../../../rules/resources";
import { shuffleDeck } from "../../../rules/shuffle";
import { comparableView, determinizationDivergences } from "../../../testing/determinization-fidelity";
import { redactionViolations, strings } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { disableTriggers } from "../disable-triggers";
import { gainPoints } from "../gain-points";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { conditionalAnswers, conditionalCard, conditionalDeck, conditionalFixture } from "./conditional-alternative-cost-support";

function listsOf(state: ReturnType<typeof conditionalFixture>["state"]) {
  const entries = (side: Side) => Object.values(state.instances).flatMap(card => card.owner === side && card.printing.kind === "card" && !card.status.created ? [{ cardId: card.printing.cardId, ...card.variant }] : []);
  return { player: entries("player"), enemy: entries("enemy") };
}
function observedWorld(side: Side, legacyUnknown = false) {
  const c = conditionalCard(40); const f = conditionalFixture(side, c, { deck: [c.id, c.id, ...conditionalDeck] });
  const played = f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state;
  const entered = passUntil(f.engine, played, s => s.stack.length === 0).state;
  const state = cloneState(entered), lists = listsOf(state);
  if (legacyUnknown) delete state.instances[f.id].status.playedViaAlternativeCost;
  moveInstance(new Context(state, f.engine.catalog, NO_PROMPTS), f.id, "deck"); shuffleDeck(state, side);
  return { ...f, state, lists };
}
function opaqueWorld(side: Side) {
  const other = opponent(side);
  const target: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x698151), abilities: () => [activated([], gainPoints(1))] };
  const c = conditionalCard(41, { extras: [activated([], sequence(
    disableTriggers(all(enemyCharacter()), "permanent", sourceWasAlternativePlayed(), "triggeredAndActivated"),
    returnToHand(self()), shuffleInto([thisCardIn("hand")]),
  ))] });
  const f = conditionalFixture(side, c, {}, { back: [target.id, target.id] }, [target]);
  const played = f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state;
  const entered = passUntil(f.engine, played, s => s.stack.length === 0).state;
  const activatedState = f.engine.apply(entered, side, { kind: "activate", source: f.id, ability: 2 }, NO_PROMPTS).state;
  const hidden = passUntil(f.engine, activatedState, s => s.stack.length === 0).state;
  // Legacy observation absence with a real recorded method: preserve only what the viewer knows.
  const state = cloneState(hidden); delete state.rememberedCards;
  return { ...f, state, lists: listsOf(state), other };
}

describe.each(SIDES)("conditional alternative privacy for %s", side => {
  const other = opponent(side);
  it("preserves the observed physical method among duplicate hidden printings through draw and reentry", () => {
    const f = observedWorld(side), seen = f.engine.view(f.state, other);
    expect(strings(seen).has(f.id)).toBe(false); expect(redactionViolations(f.state, f.engine.catalog)).toEqual([]);
    for (const entropy of [0, 0.4, 0.99]) {
      const sampled = f.engine.determinize(seen, f.lists, () => entropy);
      expect(comparableView(f.engine.view(sampled, other))).toEqual(comparableView(seen));
      const historical = Object.values(sampled.instances).filter(card => card.status.playedViaAlternativeCost === true);
      expect(historical).toHaveLength(1);
      expect(historical[0].printing).toEqual(f.state.instances[f.id].printing);
      expect(sampled.rememberedCards?.[other].some(card => card.status.playedViaAlternativeCost === true)).toBe(true);
      const ctx = new Context(sampled, f.engine.catalog, NO_PROMPTS);
      while (sampled.sides[side].deck.length > 0) drawCard(ctx, side);
      expect(historical[0].zone).toBe("hand"); expect(materialize(ctx, historical[0].id, side)).toBe(true);
      const publicCard = f.engine.view(cloneState(sampled), other).instances[historical[0].id];
      expect(publicCard.status).toMatchObject({ playedViaAlternativeCost: true, exhausted: true });
    }
    expect(determinizationDivergences(f.engine, f.state, f.lists, battleSeed("conditional-history"), 0)).toEqual([]);
  });
  it("preserves an observed legacy unknown as unknown when its predicate is inapplicable", () => {
    const f = observedWorld(side, true), seen = f.engine.view(f.state, other);
    expect(seen.hiddenCards?.[side].some(card => !Object.prototype.hasOwnProperty.call(card.status, "playedViaAlternativeCost"))).toBe(true);
    for (const entropy of [0, 0.5, 0.99]) {
      const sampled = f.engine.determinize(seen, f.lists, () => entropy);
      expect(comparableView(f.engine.view(sampled, other))).toEqual(comparableView(seen));
      const unknown = Object.values(sampled.instances).filter(card => !Object.prototype.hasOwnProperty.call(card.status, "playedViaAlternativeCost"));
      expect(unknown).toHaveLength(1);
      expect(unknown[0].printing).toEqual(f.state.instances[f.id].printing);
      const ctx = new Context(sampled, f.engine.catalog, NO_PROMPTS);
      while (sampled.sides[side].deck.length > 0) drawCard(ctx, side);
      expect(materialize(ctx, unknown[0].id, side)).toBe(true);
      expect(f.engine.view(cloneState(sampled), other).instances[unknown[0].id].status).not.toHaveProperty("playedViaAlternativeCost");
    }
  });
  it("keeps later private method writes out of a viewer's last public observation", () => {
    const f = observedWorld(side), seen = f.engine.view(f.state, other);
    const changed = cloneState(f.state); changed.instances[f.id].status.playedViaAlternativeCost = false;
    expect(f.engine.view(changed, other)).toEqual(seen);
    const copy = cloneState(f.state), remembered = copy.rememberedCards?.[other].find(card => card.status.playedViaAlternativeCost === true);
    if (remembered === undefined) throw new Error("Missing last public method"); remembered.status.playedViaAlternativeCost = false;
    expect(f.state.rememberedCards?.[other].some(card => card.status.playedViaAlternativeCost === true)).toBe(true);
  });
  it("reconstructs unobserved alternative-method producers from actual aggregate disabled actions", () => {
    const f = opaqueWorld(side), seen = f.engine.view(f.state, other);
    expect(f.state.instances[f.id].zone).toBe("deck"); expect(f.state.instances[f.id].status.playedViaAlternativeCost).toBe(true);
    expect(strings(seen).has(f.id)).toBe(false); expect(seen.disabledActivations).toHaveLength(2);
    for (const entropy of [0, 0.5, 0.99]) {
      const sampled = f.engine.determinize(seen, f.lists, () => entropy);
      expect(comparableView(f.engine.view(sampled, other))).toEqual(comparableView(seen));
      expect(sampled.floating.every(effect => typeof effect.source !== "string" || sampled.instances[effect.source]?.status.playedViaAlternativeCost === true)).toBe(true);
      expect(f.engine.legalActions(sampled, other)).toEqual(f.engine.legalActions(f.state, other));
    }
    expect(determinizationDivergences(f.engine, f.state, f.lists, battleSeed("conditional-opaque"), 0)).toEqual([]);
    const lost = cloneState(f.state); delete lost.instances[f.id]; lost.sides[side].deck = lost.sides[side].deck.filter(id => id !== f.id);
    expect(f.engine.view(lost, other).disabledActivations).toEqual([]);
  });
});

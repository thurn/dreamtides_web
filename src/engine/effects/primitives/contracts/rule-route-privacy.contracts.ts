/** Route metadata follows source identity while owner prompts and transactions remain intact. */
import { describe, expect, it } from "vitest";
import { additionalCost, choiceCost, discardCost, energy, event, keyword } from "../../../dsl/builders";
import { createFoldAdapter } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { isLegalAnswer } from "../../../prompts/answers";
import { isWellFormedPrompt } from "../../../prompts/structure";
import type { ChooseModePrompt } from "../../../prompts/types";
import { stateHash } from "../../../state/hash";
import { SIDES, opponent, type Side } from "../../../state/ids";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { revealToBoth } from "../../../view/knowledge";
import { promptView } from "../../../view/view";
import { draw } from "../draw";
import { SIGN, applied, card, deck, restored, sliceOf, world } from "./rule-modifier-support";

function pending(side: Side, speed: "fast" | "interrupt", offering: boolean, known = false) {
  const spell = card(0x172, draw(1), { speed, abilities: () => [
    ...(offering ? [keyword("offering")] : []), additionalCost(discardCost()), event(draw(1)),
  ] });
  const w = world(side, [spell], { [side]: { hand: [spell.id, v.vanilla1.id, v.vanilla2.id], dreamsigns: [SIGN.apple], energy: 10, deck } });
  const source = w.ids[side].hand[0];
  if (known) revealToBoth(w.state, [source]);
  const fold = createFoldAdapter(w.engine);
  const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: source, from: "hand" } }));
  const shown = fold.pending(opened.slice);
  if (shown?.prompt.kind !== "chooseMode") throw new Error("Expected real route prompt");
  expect(isWellFormedPrompt(shown.prompt)).toBe(true);
  return { ...w, fold, opened, shown, prompt: shown.prompt, source };
}

function pendingCost(side: Side, known: boolean) {
  const spell = card(0x173, draw(1), { speed: "standard", abilities: () => [
    additionalCost(choiceCost([energy(4)], [energy(1)])), event(draw(1)),
  ] });
  const w = world(side, [spell], { [side]: { hand: [spell.id], dreamsigns: [], energy: 10, deck } });
  const source = w.ids[side].hand[0];
  if (known) revealToBoth(w.state, [source]);
  const fold = createFoldAdapter(w.engine);
  const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: source, from: "hand" } }));
  const shown = fold.pending(opened.slice);
  if (shown?.prompt.kind !== "chooseMode" || shown.prompt.purpose.role !== "chooseCost") throw new Error("Expected real cost choice");
  expect(isWellFormedPrompt(shown.prompt)).toBe(true);
  expect(shown.prompt.costOptions).toEqual([[energy(4)], [energy(1)]]);
  expect(shown.prompt.options.every(option => option.route === undefined)).toBe(true);
  return { ...w, fold, opened, shown, prompt: shown.prompt };
}

describe("rule route projection privacy", () => {
  it.each(SIDES.flatMap(side => (["fast", "interrupt"] as const).flatMap(speed => [false, true].map(offering => ({ side, speed, offering })))))("withholds hidden $speed route categories for $side (Offering=$offering)", ({ side, speed, offering }) => {
    const w = pending(side, speed, offering), other = opponent(side);
    const before = stateHash(w.shown.display), input = JSON.stringify(w.prompt), slice = JSON.stringify(w.opened.slice);
    const hidden = promptView(w.prompt, other, w.shown.display) as ChooseModePrompt;
    expect(hidden.purpose).toMatchObject({ source: null, cardId: null });
    expect(hidden.options).toEqual(w.prompt.options.map(({ route: _route, ...option }) => option));
    expect(hidden.options).toHaveLength(offering ? 3 : 2);
    expect(promptView(w.prompt, side, w.shown.display)).toEqual(w.prompt);
    expect(w.prompt.options.map(option => option.route)).toEqual(offering ? ["normal", "offering", "eventAlternative"] : ["normal", "eventAlternative"]);
    for (const option of w.prompt.options) expect(isLegalAnswer(w.prompt, option.mode)).toBe(option.legal);
    expect(stateHash(w.shown.display)).toBe(before);
    expect(JSON.stringify(w.prompt)).toBe(input);
    expect(JSON.stringify(w.opened.slice)).toBe(slice);
    const reloaded = createFoldAdapter(w.engine).pending(restored(w.opened.slice));
    expect(reloaded?.prompt).toEqual(w.prompt);
    expect(promptFingerprint(reloaded!.prompt)).toBe(promptFingerprint(w.prompt));
    const cancelled = applied(w.fold.reduce(w.opened.slice, { kind: "cancel", side, promptId: w.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(w.state));
    expect(w.engine.view(cancelled.slice.committed, other).instances[w.source]).toBeUndefined();
    expect(cancelled.slice.committed.sides[side].currentEnergy).toBe(10);
  });

  it.each(SIDES)("retains identified routes and owner metadata for %s", side => {
    const w = pending(side, "fast", false, true), other = opponent(side);
    const before = stateHash(w.shown.display), serialized = JSON.stringify(w.prompt);
    expect(promptView(w.prompt, other, w.shown.display)).toEqual(w.prompt);
    expect(promptView(w.prompt, side, w.shown.display)).toEqual(w.prompt);
    expect(stateHash(w.shown.display)).toBe(before);
    expect(JSON.stringify(w.prompt)).toBe(serialized);
  });

  it.each(SIDES.flatMap(side => [false, true].map(known => ({ side, known })) ))("projects real chooseCost metadata for $side known=$known", ({ side, known }) => {
    const w = pendingCost(side, known), other = opponent(side);
    const before = stateHash(w.shown.display), serialized = JSON.stringify(w.prompt), saved = JSON.stringify(w.opened.slice);
    const projected = promptView(w.prompt, other, w.shown.display) as ChooseModePrompt;
    if (known) expect(projected).toEqual(w.prompt);
    else {
      const { costOptions: _costs, ...withoutCosts } = w.prompt;
      expect(projected).toEqual({ ...withoutCosts, purpose: { ...withoutCosts.purpose, source: null, cardId: null } });
    }
    expect(promptView(w.prompt, side, w.shown.display)).toEqual(w.prompt);
    // Projection-only private control: planCosts emits the actual non-private prompt above.
    const privatePrompt: ChooseModePrompt = { ...w.prompt, privateTo: side };
    expect(isWellFormedPrompt(privatePrompt)).toBe(true);
    expect(promptView(privatePrompt, other, w.shown.display)).not.toHaveProperty("costOptions");
    expect(promptView(privatePrompt, side, w.shown.display)).toEqual(privatePrompt);
    expect(stateHash(w.shown.display)).toBe(before);
    expect(JSON.stringify(w.prompt)).toBe(serialized);
    expect(JSON.stringify(w.opened.slice)).toBe(saved);
    const reloaded = createFoldAdapter(w.engine).pending(restored(w.opened.slice));
    expect(reloaded?.prompt).toEqual(w.prompt);
    expect(promptFingerprint(reloaded!.prompt)).toBe(promptFingerprint(w.prompt));
    const cancelled = applied(w.fold.reduce(w.opened.slice, { kind: "cancel", side, promptId: w.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(w.state));
    expect(cancelled.slice.committed.sides[side].currentEnergy).toBe(10);
  });
});

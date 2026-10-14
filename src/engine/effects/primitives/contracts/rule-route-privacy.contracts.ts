/** Route metadata follows source identity while owner prompts and transactions remain intact. */
import { describe, expect, it } from "vitest";
import { additionalCost, discardCost, energy, event, keyword } from "../../../dsl/builders";
import { createFoldAdapter } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { isLegalAnswer } from "../../../prompts/answers";
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
  return { ...w, fold, opened, shown, prompt: shown.prompt, source };
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

  it.each(SIDES)("retains identified routes while keeping independent private cost redaction for %s", side => {
    const w = pending(side, "fast", false, true), other = opponent(side);
    const prompt: ChooseModePrompt = { ...w.prompt, costOptions: [[energy(4)], [energy(1)]] };
    const before = stateHash(w.shown.display), serialized = JSON.stringify(prompt);
    expect(promptView(prompt, other, w.shown.display)).toEqual(prompt);
    const privatePrompt = { ...prompt, privateTo: side };
    const projected = promptView(privatePrompt, other, w.shown.display) as ChooseModePrompt;
    const { costOptions: _costs, ...withoutCosts } = privatePrompt;
    expect(projected).toEqual(withoutCosts);
    expect(projected.options).toEqual(prompt.options);
    expect(promptView(privatePrompt, side, w.shown.display)).toEqual(privatePrompt);
    expect(stateHash(w.shown.display)).toBe(before);
    expect(JSON.stringify(prompt)).toBe(serialized);
  });

  it.each(SIDES)("preserves hidden cost redaction and full owner metadata for %s", side => {
    const w = pending(side, "interrupt", false), other = opponent(side);
    const costed: ChooseModePrompt = { ...w.prompt, costOptions: [[energy(4)], [energy(1)]] };
    const hidden = promptView(costed, other, w.shown.display) as ChooseModePrompt;
    expect(hidden).not.toHaveProperty("costOptions");
    expect(hidden.options.every(option => option.route === undefined)).toBe(true);
    expect(promptView(costed, side, w.shown.display)).toEqual(costed);
  });
});

import { describe, expect, it } from "vitest";
import { BATTLE_TRIGGERED_EFFECTS } from "./battle-card-effects-table";
import { DREAMWELL_EFFECTS } from "./dreamwell-effects-table";
import type { EffectPrompt, EffectStep } from "./effect-step";
import { isFluentMessageDescriptor } from "../../data/localization-descriptors";
import { isDreamwellPromptRef } from "../../data/dreamwell-prompts";

function visitPrompt(
  prompt: EffectPrompt,
  visit: (value: unknown) => void,
): void {
  if (prompt.kind === "foresee") return;
  visit(prompt.label);
  if (prompt.kind === "pick-cards") {
    if (prompt.subtitle !== undefined) visit(prompt.subtitle);
    return;
  }
  if (prompt.kind === "choice") {
    for (const option of prompt.options) visit(option.label);
    return;
  }
  for (const step of prompt.onYes) visitSteps(step, visit);
}

function visitSteps(step: EffectStep, visit: (value: unknown) => void): void {
  if (step.kind === "prompt") visitPrompt(step.prompt, visit);
}

describe("production battle prompt text", () => {
  it("uses valid JSON-safe semantic references for every active prompt definition", () => {
    const references: unknown[] = [];
    const collect = (step: EffectStep): void =>
      visitSteps(step, (value) => references.push(value));

    for (const script of Object.values(DREAMWELL_EFFECTS)) {
      for (const step of script.steps) collect(step);
    }
    for (const script of Object.values(BATTLE_TRIGGERED_EFFECTS)) {
      for (const steps of Object.values(script.triggers)) {
        for (const step of steps ?? []) collect(step);
      }
    }

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      const isPromptReference = (value: unknown): boolean =>
        isFluentMessageDescriptor(value) || isDreamwellPromptRef(value);
      expect(isPromptReference(reference)).toBe(true);
      expect(isPromptReference(JSON.parse(JSON.stringify(reference)))).toBe(
        true,
      );
    }
  });
});

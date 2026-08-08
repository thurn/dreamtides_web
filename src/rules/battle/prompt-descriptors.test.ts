import { describe, expect, it } from "vitest";
import { BATTLE_TRIGGERED_EFFECTS } from "./battle-card-effects-table";
import { DREAMWELL_EFFECTS } from "./dreamwell-effects-table";
import type { EffectPrompt, EffectStep } from "./effect-step";
import { isFluentMessageDescriptor } from "../../data/localization-descriptors";

function visitPrompt(prompt: EffectPrompt, visit: (value: unknown) => void): void {
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

describe("production battle prompt descriptors", () => {
  it("uses valid JSON-safe descriptors for every active prompt definition", () => {
    const descriptors: unknown[] = [];
    const collect = (step: EffectStep): void => visitSteps(step, (value) => descriptors.push(value));

    for (const script of Object.values(DREAMWELL_EFFECTS)) {
      for (const step of script.steps) collect(step);
    }
    for (const script of Object.values(BATTLE_TRIGGERED_EFFECTS)) {
      for (const steps of Object.values(script.triggers)) {
        for (const step of steps ?? []) collect(step);
      }
    }

    expect(descriptors.length).toBeGreaterThan(0);
    for (const descriptor of descriptors) {
      expect(isFluentMessageDescriptor(descriptor)).toBe(true);
      expect(
        isFluentMessageDescriptor(JSON.parse(JSON.stringify(descriptor))),
      ).toBe(true);
    }
  });
});

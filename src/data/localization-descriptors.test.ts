import { describe, expect, it } from "vitest";
import { appLocalization } from "./localization";
import {
  createMessageDescriptor,
  isFluentMessageDescriptor,
} from "./localization-descriptors";
import type { MessageFormatter } from "../cumulus/hooks/use-messages";
import { formatMessageDescriptor } from "../cumulus/hooks/use-messages";

function formatter(): MessageFormatter {
  return ((id, variables) => appLocalization.getString(id, variables)) as MessageFormatter;
}

function _descriptorTypeGuards() {
  const validWithoutVariables = createMessageDescriptor(
    "localization-invalid-message-fallback",
  );
  const validWithVariables = createMessageDescriptor(
    "journey-complete-stat-battles",
    { count: 1 },
  );
  const aliased = { count: 1, unexpected: "value" };

  // @ts-expect-error Unknown message IDs are rejected.
  createMessageDescriptor("localization-invalid-message-falback");
  // @ts-expect-error Required variables are rejected when omitted.
  createMessageDescriptor("journey-complete-stat-battles");
  // @ts-expect-error Misspelled variables are rejected.
  createMessageDescriptor("journey-complete-stat-battles", { counnt: 1 });
  // @ts-expect-error Extra keys are rejected even through an alias.
  createMessageDescriptor("journey-complete-stat-battles", aliased);

  return [validWithoutVariables, validWithVariables];
}
void _descriptorTypeGuards;

describe("localization descriptors", () => {
  it("accepts valid descriptors and rejects malformed persisted shapes", () => {
    expect(
      isFluentMessageDescriptor(
        createMessageDescriptor("journey-complete-stat-battles", { count: 1 }),
      ),
    ).toBe(true);
    expect(
      isFluentMessageDescriptor(
        createMessageDescriptor("localization-invalid-message-fallback"),
      ),
    ).toBe(true);

    const invalidValues: unknown[] = [
      { id: "unknown-message" },
      { id: "journey-complete-stat-battles" },
      { id: "journey-complete-stat-battles", variables: { count: 1, extra: "x" } },
      { id: "localization-invalid-message-fallback", variables: {} },
      { id: "journey-complete-stat-battles", variables: [] },
      { id: "journey-complete-stat-battles", variables: null },
      { id: "journey-complete-stat-battles", variables: { count: true } },
      { id: "journey-complete-stat-battles", variables: { count: { value: 1 } } },
      { id: "journey-complete-stat-battles", variables: { count: new Date() } },
      { id: "journey-complete-stat-battles", variables: { count: Number.NaN } },
      { id: "journey-complete-stat-battles", variables: { count: Number.POSITIVE_INFINITY } },
      { id: "journey-complete-stat-battles", variables: Object.create(null) as Record<string, unknown> },
    ];

    for (const value of invalidValues) {
      expect(isFluentMessageDescriptor(value)).toBe(false);
    }
  });

  it("formats valid descriptors and uses a safe fallback for invalid input", () => {
    const t = formatter();
    const valid = formatMessageDescriptor(
      t,
      createMessageDescriptor("journey-complete-stat-battles", { count: 2 }),
    );
    expect(valid).not.toBe("");
    expect(valid).not.toContain("journey-complete-stat-battles");

    const invalidValue = "secret-invalid-value";
    const fallback = formatMessageDescriptor(t, {
      id: "not-a-real-message",
      variables: { value: invalidValue },
    });
    expect(fallback).not.toBe("");
    expect(fallback).not.toContain("not-a-real-message");
    expect(fallback).not.toContain(invalidValue);
  });

  it("rejects non-finite constructor variables before they can cross a boundary", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        createMessageDescriptor("journey-complete-stat-battles", { count: value }),
      ).toThrow(TypeError);
    }
  });
});

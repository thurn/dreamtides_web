import { describe, expect, it } from "vitest";
import { compileJourneyData } from "./journey-data.mjs";

function fixture() {
  return {
    "schema-version": 1,
    presentation: {
      start: {
        title: "Start",
        choose_action: "Choose",
        reroll_action: "Reroll",
      },
      starting_deck: {
        title: "Deck",
        subtitle: "Cards",
        empty_state: "Empty",
        begin_action: "Begin",
      },
      dreamsign_replacement: {
        title: "Replace",
        new_dreamsign_label: "New",
        replace_action: "Replace",
        keep_current_action: "Keep",
      },
    },
  };
}

describe("compileJourneyData", () => {
  it("normalizes authored presentation with a deterministic hash", () => {
    const first = compileJourneyData(fixture());
    const second = compileJourneyData(fixture());
    expect(second).toEqual(first);
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.presentation.start.chooseAction).toBe("Choose");
  });

  it("rejects unknown fields and empty authored text", () => {
    const unknown = fixture();
    unknown.presentation.start.extra = "Unexpected";
    expect(() => compileJourneyData(unknown)).toThrow(/unknown key/u);
    const empty = fixture();
    empty.presentation.start.title = " ";
    expect(() => compileJourneyData(empty)).toThrow(/non-empty string/u);
  });
});

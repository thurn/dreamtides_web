// @vitest-environment jsdom

// GlossaryTerm: inline stationary definition semantics.
import { act } from "react";
import { describe, expect, it } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { GlossaryTerm } from "./GlossaryTerm";
import { describedText } from "./card-components.fixtures";

describe("GlossaryTerm", () => {
  const entry = {
    term: "Lumenstep",
    definition: "Move through a fixed semantic fixture.",
  };

  it("registers stationary inline definition semantics without changing sentence flow", () => {
    const { container } = renderInCumulus(
      <p>
        Before <GlossaryTerm entry={entry} text={"lumensteps"} /> after.
      </p>,
    );
    const source = container.querySelector<HTMLElement>("[data-glossary-term]");
    expect(container.querySelector("p")?.textContent).toBe(
      "Before lumensteps after.",
    );
    expect(source?.dataset.revealFeedback).toBe("stationary");
    expect(source?.dataset.revealEntityType).toBe("glossary-term");
    expect(source?.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(describedText(source)).toContain(entry.definition);

    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
  });
});

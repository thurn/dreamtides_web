import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { GlossaryTerm } from "./GlossaryTerm";
import { RulesText } from "./RulesText";
import { testCardId } from "../../../types/test-identities";

const CARD_ID = testCardId("11111111-1111-4111-8111-111111111111");

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GlossaryTerm", () => {
  it("registers stationary inline definition semantics without changing sentence flow", () => {
    const entry = FIXTURE;
    const { container } = mount(
      <p>
        Before <GlossaryTerm entry={entry} text={assertLocalized("figments")} />{" "}
        after.
      </p>,
    );
    const source = container.querySelector<HTMLElement>("[data-glossary-term]");
    expect(container.querySelector("p")?.textContent).toBe(
      "Before figments after.",
    );
    expect(source?.dataset.revealFeedback).toBe("stationary");
    expect(source?.dataset.revealEntityType).toBe("glossary-term");
    expect(source?.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source?.dataset.revealPrimaryVariant).toBe("text");
    expect(source?.dataset.revealSecondaryTitles).toBe("");
    expect(source?.style.cursor).toBe("default");
    expect(source?.getAttribute("aria-describedby")).toMatch(
      /^cumulus-reveal-description-/,
    );
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain(entry.term);
    expect(description?.textContent).toContain(entry.definition);
  });

  it("becomes the active semantic source through focus", () => {
    const entry = FIXTURE;
    const { container } = mount(
      <GlossaryTerm entry={entry} text={assertLocalized(entry.term)} />,
    );
    const source = container.querySelector<HTMLElement>("[data-glossary-term]");
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain(entry.definition);
  });

  it("makes the complete RulesText block one stationary source while preserving rich marks", () => {
    const entry = FIXTURE;
    const { container } = mount(
      <RulesText
        text={assertLocalized(`${entry.term} 2● and 3✦.`)}
        owner={{ kind: "card", id: CARD_ID }}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-rules-text-source]",
    );
    expect(container.querySelector("[data-glossary-term]")).toBeNull();
    expect(source?.textContent).toContain(entry.term);
    expect(source?.dataset.revealFeedback).toBe("stationary");
    expect(source?.style.cursor).toBe("default");
    expect(container.querySelectorAll("[data-rules-text-source]")).toHaveLength(
      1,
    );
    expect(container.querySelector('[aria-label="energy"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="spark"]')).not.toBeNull();

    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain(entry.definition);
  });

  it("renders passive RulesText copy when glossary interaction belongs to an outer entity", () => {
    const { container } = mount(
      <RulesText
        text={assertLocalized(`${FIXTURE.term} 2●.`)}
        owner={{ kind: "card", id: CARD_ID }}
        glossaryInteraction="delegated"
      />,
    );

    expect(container.querySelector("[data-rules-text-source]")).toBeNull();
    expect(container.querySelector("[data-glossary-term]")).toBeNull();
    expect(container.querySelector('[aria-label="energy"]')).not.toBeNull();
  });
});
const FIXTURE = vi.hoisted(() => ({
  term: "Lumenstep",
  definition: "Move through a fixed semantic fixture.",
}));

vi.mock("../../../data/glossary", () => ({
  GLOSSARY: [FIXTURE],
  glossaryRulesTextForms: () => [FIXTURE.term],
  GLOSSARY_IDS: {
    fast: "fast",
    interrupt: "interrupt",
    exhaustCost: "exhaust-cost",
    nightTrigger: "night-trigger",
  },
  glossaryEntry: () => undefined,
  glossaryEntryDisplayTitle: (entry: typeof FIXTURE) => entry.term,
  rulesSymbolGlossaryEntry: (token: string) => ({
    rulesSymbol: {
      token,
      glyph: token === "spark" ? "sparkInline" : token,
      accessibleLabel: token,
      semanticColorRole:
        token === "essence" || token === "energy" || token === "spark"
          ? token
          : undefined,
    },
  }),
  lookupGlossaryTerm: (term: string) =>
    term.toLocaleLowerCase() === FIXTURE.term.toLocaleLowerCase()
      ? FIXTURE
      : undefined,
}));

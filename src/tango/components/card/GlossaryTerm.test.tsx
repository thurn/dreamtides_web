// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GLOSSARY } from "../../../data/glossary";
import { TangoRoot } from "../../TangoRoot";
import { GlossaryTerm } from "./GlossaryTerm";
import { RulesText } from "./RulesText";

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<TangoRoot>{element}</TangoRoot>));
  return { container, root };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => { document.body.innerHTML = ""; });

describe("GlossaryTerm", () => {
  it("registers stationary inline definition semantics without changing sentence flow", () => {
    const entry = GLOSSARY[0];
    const { container } = mount(<p>Before <GlossaryTerm entry={entry} text="figments" /> after.</p>);
    const source = container.querySelector<HTMLElement>("[data-glossary-term]");
    expect(container.querySelector("p")?.textContent).toBe("Before figments after.");
    expect(source?.dataset.revealFeedback).toBe("stationary");
    expect(source?.getAttribute("aria-describedby")).toMatch(/^tango-reveal-description-/);
    const description = document.getElementById(source?.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain(entry.term);
    expect(description?.textContent).toContain(entry.definition);
  });

  it("becomes the active semantic source through focus", () => {
    const entry = GLOSSARY[0];
    const { container } = mount(<GlossaryTerm entry={entry} text={entry.term} />);
    const source = container.querySelector<HTMLElement>("[data-glossary-term]");
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    const description = document.getElementById(source?.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain(entry.definition);
  });

  it("makes recognized RulesText terms stationary semantic sources while preserving rich marks", () => {
    const entry = GLOSSARY.find((candidate) => !candidate.term.startsWith("▸")) ?? GLOSSARY[0];
    const { container } = mount(<RulesText text={`${entry.term} 2● and 3✦.`} />);
    const term = container.querySelector<HTMLElement>("[data-glossary-term]");
    expect(term?.textContent).toBe(entry.term);
    expect(term?.dataset.revealFeedback).toBe("stationary");
    expect(container.querySelector('[aria-label="energy"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="spark"]')).not.toBeNull();
  });
});

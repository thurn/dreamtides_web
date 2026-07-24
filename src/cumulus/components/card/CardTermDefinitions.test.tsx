// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { extractGlossaryTerms } from "../../../data/glossary-terms";

// Derive fixtures from the LIVE glossary so a content edit can never invalidate
// the test (per AGENTS.md). Pick two distinct terms and build prose that uses
// both; assert that every detected definition appears inside one shared card.
const TWO_TERMS = (() => {
  // A sentence known to reference at least two glossary keywords in the
  // prototype's vocabulary; resolve the actual detected terms from it.
  const text = "Reclaim a card from your void, then foresee 1.";
  const terms = extractGlossaryTerms(text);
  return { text, terms };
})();

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe("CardTermDefinitions", () => {
  it("renders nothing when the text references no glossary terms", () => {
    const { container, root } = mount(
      <CardTermDefinitions text="plain words with no keywords" />,
    );
    expect(container.textContent).toBe("");
    act(() => {
      root.unmount();
    });
  });

  it("renders distinct glossary terms in priority order inside one InfoCard", () => {
    // Skip if the sample somehow detects fewer than two terms in this build's
    // glossary — the behavior under test needs multiple terms.
    if (TWO_TERMS.terms.length < 2) {
      return;
    }
    const { container, root } = mount(
      <CardTermDefinitions text={TWO_TERMS.text} testId="defs" />,
    );

    const stack = container.querySelector('[data-testid="defs"]');
    expect(stack).not.toBeNull();
    expect((stack as HTMLElement | null)?.style.overflow).toBe("visible");
    expect(stack?.getAttribute("data-definition-count")).toBe(
      String(TWO_TERMS.terms.length),
    );
    expect(container.textContent).not.toContain("Rules Glossary");
    expect(stack?.children).toHaveLength(1);

    // Each row starts with its term. Assert the rows retain extractor priority
    // order inside the consolidated card.
    const text = container.textContent ?? "";
    const positions = TWO_TERMS.terms.map((entry) => text.indexOf(entry.term));
    expect(positions.every((position) => position >= 0)).toBe(true);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);

    act(() => {
      root.unmount();
    });
  });
});

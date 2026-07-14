// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import {
  QuestCompleteScreen,
  type QuestCompleteView,
} from "./QuestCompleteScreen";

const VIEW: QuestCompleteView = {
  stats: [
    { id: "battles", label: "Battles Won", value: 7, kind: "number" },
    { id: "dreamscapes", label: "Dreamscapes", value: 7, kind: "number" },
    { id: "cards", label: "Final Deck", value: 30, kind: "number" },
    { id: "dreamsigns", label: "Dreamsigns", value: 4, kind: "number" },
    { id: "essence", label: "Essence Remaining", value: 140, kind: "essence" },
  ],
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

describe("Cumulus QuestCompleteScreen", () => {
  it("renders the run summary without Dreamcaller or secondary actions", () => {
    const { container, root } = mount(
      <QuestCompleteScreen view={VIEW} onNewQuest={vi.fn()} />,
    );

    expect(container.textContent).toContain("Quest Complete");
    expect(container.querySelectorAll("[data-quest-complete-stat]")).toHaveLength(5);
    expect(
      container.querySelector('[data-quest-complete-stat="essence"]')?.textContent,
    ).toContain("140");
    expect(container.querySelector("[data-quest-complete-dreamcaller]")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[title="Victory"]')).toBeNull();
    expect(container.querySelector('[data-testid="quest-complete-view-deck"]')).toBeNull();
    expect(container.querySelector('[data-testid="quest-complete-download-log"]')).toBeNull();

    act(() => root.unmount());
  });

  it("renders the bottom action as accent glass and reports activation", () => {
    const onNewQuest = vi.fn();
    const { container, root } = mount(
      <QuestCompleteScreen view={VIEW} onNewQuest={onNewQuest} />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="quest-complete-new-quest"]',
    );

    expect(button?.dataset.glassVariant).toBe("accent");
    act(() => button?.click());
    expect(onNewQuest).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});

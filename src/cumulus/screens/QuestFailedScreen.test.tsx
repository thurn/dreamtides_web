// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import {
  QuestFailedScreen,
  type QuestFailedView,
} from "./QuestFailedScreen";

const VIEW: QuestFailedView = {
  result: "defeat",
  reason: "score_target_reached",
  title: "Quest Ended",
  message: "Your journey ends here.",
  reasonLabel: "Score Threshold Reached",
  dreamcaller: {
    id: "00000000-0000-4000-8000-000000000061",
    name: "The Wayfinder",
    title: "Bearer of the Last Light",
    ability: "Whenever you map a dream, gain 1 essence.",
    imageNumber: "001",
    portraitFocus: { x: 0.42, y: 0.18 },
  },
  stats: [
    { id: "battles", label: "Battles Won", value: 2 },
    { id: "round", label: "Final Round", value: 6 },
    { id: "playerScore", label: "Your Score", value: 4 },
    { id: "enemyScore", label: "Opponent Score", value: 10 },
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

describe("Cumulus QuestFailedScreen", () => {
  it("orders the result, interactive portrait, and terminal summary", () => {
    const { container, root } = mount(
      <QuestFailedScreen view={VIEW} onNewQuest={vi.fn()} />,
    );

    const screen = container.querySelector<HTMLElement>(
      "[data-quest-failed-screen]",
    );
    const hierarchy = container.querySelector("[data-quest-failed-hierarchy]");
    const portrait = hierarchy?.querySelector<HTMLElement>(
      "[data-quest-failed-dreamcaller]",
    );

    expect(screen?.dataset.questFailedScreen).toBe("defeat");
    expect(screen?.dataset.questFailedReason).toBe("score_target_reached");
    expect(container.textContent).toContain("Quest Ended");
    expect(container.textContent).toContain("Your journey ends here.");
    expect(container.textContent).toContain("Score Threshold Reached");
    expect(container.querySelector("h1")?.style.color).toBe(
      "var(--text-primary)",
    );
    expect(
      container.querySelector<HTMLElement>(
        '[data-quest-failed-reason="score_target_reached"]:not([data-quest-failed-screen])',
      )?.style.color,
    ).toBe("var(--danger)");
    expect(
      Array.from(hierarchy?.children ?? []).map((element) =>
        element.getAttribute("data-quest-failed-section"),
      ),
    ).toEqual(["title", "portrait", "stats"]);
    expect(portrait?.textContent).toBe("");
    expect(portrait?.querySelector("[data-dreamcaller-source]")).not.toBeNull();
    expect(container.querySelectorAll("[data-quest-failed-stat]")).toHaveLength(4);
    expect(
      container.querySelector('[data-quest-failed-stat="enemyScore"]')
        ?.textContent,
    ).toContain("10");

    act(() => root.unmount());
  });

  it("renders the bottom action as accent glass and reports activation", () => {
    const onNewQuest = vi.fn();
    const { container, root } = mount(
      <QuestFailedScreen view={VIEW} onNewQuest={onNewQuest} />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="quest-failed-start-new-run"]',
    );

    expect(button?.dataset.glassVariant).toBe("accent");
    act(() => button?.click());
    expect(onNewQuest).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("renders a safe fallback without an action when the summary is missing", () => {
    const { container, root } = mount(
      <QuestFailedScreen view={null} onNewQuest={vi.fn()} />,
    );

    expect(container.textContent).toContain("Quest failure summary not found");
    expect(
      container.querySelector('[data-testid="quest-failed-start-new-run"]'),
    ).toBeNull();

    act(() => root.unmount());
  });
});

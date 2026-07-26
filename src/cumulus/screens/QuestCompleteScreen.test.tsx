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
  dreamAvatar: {
    id: "00000000-0000-4000-8000-000000000061",
    name: "The Wayfinder",
    title: "Bearer of the Last Light",
    ability: "Whenever you map a dream, gain 1 essence.",
    imageNumber: "001",
    portraitFocus: { x: 0.42, y: 0.18 },
  },
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
  it("orders the title, interactive portrait, and run summary without a resting name", () => {
    const { container, root } = mount(
      <QuestCompleteScreen view={VIEW} onNewQuest={vi.fn()} />,
    );

    expect(container.textContent).toContain("Quest Complete");
    const hierarchy = container.querySelector("[data-quest-complete-hierarchy]");
    const portrait = hierarchy?.querySelector<HTMLElement>(
      "[data-quest-complete-dream-avatar]",
    );
    expect(
      Array.from(hierarchy?.children ?? []).map((element) =>
        element.getAttribute("data-quest-complete-section"),
      ),
    ).toEqual(["title", "portrait", "stats"]);
    const statsSection = hierarchy?.querySelector<HTMLElement>(
      '[data-quest-complete-section="stats"]',
    );
    expect(statsSection?.style.flex).toBe("1 1 0%");
    expect(statsSection?.style.justifyContent).toBe("center");
    expect(portrait?.textContent).toBe("");
    expect(portrait?.querySelector("[data-dream-avatar-source]")).not.toBeNull();
    expect(portrait?.querySelector("img")?.getAttribute("alt")).toContain(
      "The Wayfinder",
    );
    expect(container.querySelectorAll("[data-quest-complete-stat]")).toHaveLength(5);
    expect(
      container.querySelector('[data-quest-complete-stat="essence"]')?.textContent,
    ).toContain("140");
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

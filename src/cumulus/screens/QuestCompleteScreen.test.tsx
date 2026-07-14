// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { Pressable } from "../primitives/Pressable";
import {
  QuestCompleteScreen,
  type QuestCompleteView,
} from "./QuestCompleteScreen";

vi.mock("./DeckGalleryOverlay", () => ({
  DeckGalleryOverlay: ({
    isOpen,
    title,
    onClose,
  }: {
    isOpen: boolean;
    title: string;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <Pressable as="button" onClick={onClose}>Close</Pressable>
      </div>
    ) : null,
}));

const VIEW: QuestCompleteView = {
  dreamcaller: {
    id: "dreamcaller-uuid",
    name: "The Wayfinder",
    title: "Bearer of the Last Light",
    imageNumber: "001",
  },
  stats: [
    { id: "battles", label: "Battles Won", value: 7, kind: "number" },
    { id: "dreamscapes", label: "Dreamscapes", value: 7, kind: "number" },
    { id: "cards", label: "Final Deck", value: 30, kind: "number" },
    { id: "dreamsigns", label: "Dreamsigns", value: 4, kind: "number" },
    { id: "essence", label: "Essence Remaining", value: 140, kind: "essence" },
  ],
  finalDeck: [],
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
  it("renders the victory identity, Dreamcaller, and complete run summary", () => {
    const { container, root } = mount(
      <QuestCompleteScreen
        view={VIEW}
        onNewQuest={vi.fn()}
        onDownloadLog={vi.fn()}
        onOpenFinalDeck={vi.fn()}
        onCloseFinalDeck={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Quest Complete");
    expect(container.textContent).toContain("The Wayfinder");
    expect(container.querySelectorAll("[data-quest-complete-stat]")).toHaveLength(5);
    expect(
      container.querySelector('[data-quest-complete-stat="essence"]')?.textContent,
    ).toContain("140");

    act(() => root.unmount());
  });

  it("reports every action and opens the shared final-deck gallery", () => {
    const onNewQuest = vi.fn();
    const onDownloadLog = vi.fn();
    const onOpenFinalDeck = vi.fn();
    const onCloseFinalDeck = vi.fn();
    const { container, root } = mount(
      <QuestCompleteScreen
        view={VIEW}
        onNewQuest={onNewQuest}
        onDownloadLog={onDownloadLog}
        onOpenFinalDeck={onOpenFinalDeck}
        onCloseFinalDeck={onCloseFinalDeck}
      />,
    );

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-quest-complete-action="new-quest"] button',
      )?.click();
      container.querySelector<HTMLButtonElement>(
        '[data-testid="quest-complete-download-log"]',
      )?.click();
      container.querySelector<HTMLButtonElement>(
        '[data-testid="quest-complete-view-deck"]',
      )?.click();
    });

    expect(onNewQuest).toHaveBeenCalledOnce();
    expect(onDownloadLog).toHaveBeenCalledOnce();
    expect(onOpenFinalDeck).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"][aria-label="Final Deck"]')).not.toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('[role="dialog"] button')?.click();
    });
    expect(onCloseFinalDeck).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => root.unmount());
  });
});

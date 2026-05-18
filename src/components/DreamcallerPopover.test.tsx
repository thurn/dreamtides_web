// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreamcallerPopover } from "./DreamcallerPopover";
import type { Dreamcaller } from "../types/quest";

vi.mock("./DreamcallerPortrait", () => ({
  DreamcallerPortrait: () => <div data-testid="dreamcaller-portrait" />,
}));

vi.mock("./RulesText", () => ({
  RulesText: ({ text }: { text: string }) => <span>{text}</span>,
}));

function makeDreamcaller(): Dreamcaller {
  return {
    id: "corvath",
    name: "Corvath",
    title: "the Salvage-Born",
    renderedText: "When you discard a card, it gains reclaim until end of turn.",
    imageNumber: "001",
    startingEssence: 255,
  };
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamcallerPopover", () => {
  it("shows the dreamcaller's name, title, and rules text", () => {
    const { container, root } = mount(
      <DreamcallerPopover dreamcaller={makeDreamcaller()} />,
    );

    expect(container.textContent).toContain("Corvath");
    expect(container.textContent).toContain("the Salvage-Born");
    expect(container.textContent).toContain(
      "When you discard a card, it gains reclaim until end of turn.",
    );

    act(() => {
      root.unmount();
    });
  });

  it("does not render the word 'dreamcaller' in the active-dreamcaller hover card", () => {
    const { container, root } = mount(
      <DreamcallerPopover dreamcaller={makeDreamcaller()} />,
    );

    // Per task 005: the active-dreamcaller hover card must not render the
    // literal string "dreamcaller". The selection screen is the only player
    // surface that uses the term.
    expect(container.textContent ?? "").not.toMatch(/dreamcaller/i);

    act(() => {
      root.unmount();
    });
  });

  it("does not render any tide names or tide-derived labels", () => {
    const { container, root } = mount(
      <DreamcallerPopover dreamcaller={makeDreamcaller()} />,
    );

    // Tides are an internal organizing concept. They appear only on the
    // dreamcaller selection screen, not on this in-run hover card.
    expect(container.textContent ?? "").not.toMatch(/tide/i);
    expect(container.textContent ?? "").not.toContain("discard_velocity");
    expect(container.textContent ?? "").not.toContain("void_recursion");
    expect(container.textContent ?? "").not.toContain("discard velocity");
    expect(container.textContent ?? "").not.toContain("void recursion");

    act(() => {
      root.unmount();
    });
  });
});

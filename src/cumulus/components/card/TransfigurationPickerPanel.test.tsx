// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountCumulus,
  syntheticGameCard,
} from "../../test-helpers/component-test-fixtures";
import { TransfigurationPickerPanel } from "./TransfigurationPickerPanel";
import { parseDeckEntryId } from "../../../types/identifiers";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("TransfigurationPickerPanel", () => {
  it.each([
    {
      state: { kind: "loading" as const },
      kind: "loading",
      presentation: undefined,
    },
    {
      state: {
        kind: "ready" as const,
        presentation: "offer" as const,
        cards: [],
      },
      kind: "ready",
      presentation: "offer",
    },
    {
      state: {
        kind: "ready" as const,
        presentation: "open-deck" as const,
        cards: [],
      },
      kind: "ready",
      presentation: "open-deck",
    },
  ])(
    "renders $kind $presentation state with an empty readable surface",
    ({ state, kind, presentation }) => {
      const { container, root } = mountCumulus(
        <TransfigurationPickerPanel
          state={state}
          onCardPress={() => {}}
          onDismiss={() => {}}
        />,
      );
      const boundary = container.querySelector<HTMLElement>(
        "[data-transfiguration-picker-state]",
      );
      expect(boundary?.dataset.transfigurationPickerState).toBe(kind);
      expect(boundary?.dataset.transfigurationPickerPresentation).toBe(
        presentation,
      );
      expect(
        container.querySelectorAll("[data-gallery-entry-id]"),
      ).toHaveLength(0);
      expect(
        container.querySelector(
          '[data-testid="cumulus-transfiguration-picker"]',
        ),
      ).not.toBeNull();
      act(() => root.unmount());
    },
  );

  it("emits only the exact available entry ID while keeping reforged cards readable", () => {
    const onCardPress = vi.fn();
    const { container, root } = mountCumulus(
      <TransfigurationPickerPanel
        state={{
          kind: "ready",
          presentation: "open-deck",
          cards: [
            {
              entryId: parseDeckEntryId("available"),
              card: syntheticGameCard(1),
              availability: "available",
            },
            {
              entryId: parseDeckEntryId("reforged"),
              card: syntheticGameCard(2),
              availability: "reforged",
              reforgedType: "Empowered",
            },
          ],
        }}
        onCardPress={onCardPress}
        onDismiss={() => undefined}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-gallery-entry-id="available"] [data-game-card-source]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-gallery-entry-id="reforged"] [data-game-card-source]',
        )
        ?.click(),
    );
    expect(onCardPress).toHaveBeenCalledOnce();
    expect(onCardPress).toHaveBeenCalledWith("available");
    expect(
      container.querySelector('[data-gallery-entry-id="reforged"]'),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it.each([
    { desktop: true, presentation: "offer" as const, inFooter: true },
    { desktop: true, presentation: "open-deck" as const, inFooter: false },
    { desktop: false, presentation: "offer" as const, inFooter: false },
  ])(
    "owns $presentation decline placement when desktop is $desktop",
    ({ desktop, presentation, inFooter }) => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("min-width") ? desktop : false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      const { container, root } = mountCumulus(
        <TransfigurationPickerPanel
          state={{ kind: "ready", presentation, cards: [] }}
          onCardPress={() => {}}
          onDismiss={() => {}}
        />,
      );
      const decline = container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-decline"]',
      );
      expect(decline?.closest("[data-glass-panel-footer]") !== null).toBe(
        inFooter,
      );
      act(() => root.unmount());
    },
  );
});

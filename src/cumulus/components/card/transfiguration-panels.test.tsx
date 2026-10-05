// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { parseDeckEntryId } from "../../../types/identifiers";
import { syntheticGameCard } from "../../test-helpers/component-test-fixtures";
import { localizedTransfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";
import { renderInCumulus } from "../../testing/render";
import {
  TransfigurationDetailPanel,
  type TransfigurationDetailCandidate,
} from "./TransfigurationDetailPanel";
import { TransfigurationPickerPanel } from "./TransfigurationPickerPanel";

function click(container: HTMLElement, selector: string): void {
  act(() => container.querySelector<HTMLElement>(selector)?.click());
}

describe("TransfigurationDetailPanel", () => {
  const candidate: TransfigurationDetailCandidate = {
    card: syntheticGameCard(1),
    forms: [
      {
        type: "Empowered",
        presentation: localizedTransfigurationFormFixture("Empowered"),
        pricing: { kind: "unpriced" },
        previewModel: syntheticGameCard(2),
      },
      {
        type: "Kindled",
        presentation: localizedTransfigurationFormFixture("Kindled"),
        pricing: { kind: "essence", amount: 40, affordable: false },
        previewModel: syntheticGameCard(3),
      },
      {
        type: "Resonant",
        presentation: localizedTransfigurationFormFixture("Resonant"),
        pricing: { kind: "essence", amount: 30, affordable: true },
        previewModel: syntheticGameCard(4),
      },
    ],
  };
  const CONFIRM = '[data-testid="cumulus-transfiguration-confirm"]';
  const CHOOSE_AGAIN = '[data-testid="cumulus-transfiguration-choose-again"]';

  it("emits form types and confirms an affordable controlled selection", () => {
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    const { container } = renderInCumulus(
      <TransfigurationDetailPanel
        candidate={candidate}
        value="Empowered"
        status="idle"
        navigation={{ kind: "fixed" }}
        onChange={onChange}
        onConfirm={onConfirm}
      />,
    );
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-status]")
        ?.dataset.transfigurationStatus,
    ).toBe("idle");
    expect(
      container.querySelectorAll("[data-transfiguration-button-layout]"),
    ).toHaveLength(3);
    expect(container.querySelector(CHOOSE_AGAIN)).toBeNull();
    click(container, '[data-testid="cumulus-transfiguration-form-Resonant"]');
    click(container, CONFIRM);
    expect(onChange).toHaveBeenCalledWith("Resonant");
    expect(onConfirm).toHaveBeenCalledWith("Empowered");
  });

  it("prevents confirmation for null and unaffordable selections", () => {
    for (const value of [null, "Kindled"] as const) {
      const onConfirm = vi.fn();
      const { container, unmount } = renderInCumulus(
        <TransfigurationDetailPanel
          candidate={candidate}
          value={value}
          status="idle"
          navigation={{ kind: "fixed" }}
          onChange={() => {}}
          onConfirm={onConfirm}
        />,
      );
      click(container, CONFIRM);
      expect(onConfirm).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("supports reselectable navigation without a selected form", () => {
    const onBack = vi.fn();
    const onConfirm = vi.fn();
    const { container } = renderInCumulus(
      <TransfigurationDetailPanel
        candidate={candidate}
        value={null}
        status="idle"
        navigation={{ kind: "reselectable", onBack }}
        onChange={() => undefined}
        onConfirm={onConfirm}
      />,
    );
    click(container, CHOOSE_AGAIN);
    click(container, CONFIRM);
    expect(onBack).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("TransfigurationPickerPanel", () => {
  it("exposes loading and ready states on the picker boundary", () => {
    const picker = (
      state: Parameters<typeof TransfigurationPickerPanel>[0]["state"],
    ) => (
      <TransfigurationPickerPanel
        state={state}
        onCardPress={() => {}}
        onDismiss={() => {}}
      />
    );
    const { container, rerender } = renderInCumulus(
      picker({ kind: "loading" }),
    );
    const boundary = () =>
      container.querySelector<HTMLElement>(
        "[data-transfiguration-picker-state]",
      )?.dataset;
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-picker"]'),
    ).not.toBeNull();
    expect(boundary()?.transfigurationPickerState).toBe("loading");

    rerender(picker({ kind: "ready", presentation: "offer", cards: [] }));
    expect(boundary()?.transfigurationPickerState).toBe("ready");
    expect(boundary()?.transfigurationPickerPresentation).toBe("offer");
    expect(container.querySelectorAll("[data-gallery-entry-id]")).toHaveLength(
      0,
    );
  });

  it("emits only the exact available entry ID while keeping reforged cards readable", () => {
    const onCardPress = vi.fn();
    const { container } = renderInCumulus(
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
    click(
      container,
      '[data-gallery-entry-id="available"] [data-game-card-source]',
    );
    click(
      container,
      '[data-gallery-entry-id="reforged"] [data-game-card-source]',
    );
    expect(onCardPress).toHaveBeenCalledOnce();
    expect(onCardPress).toHaveBeenCalledWith("available");
    expect(
      container.querySelector('[data-gallery-entry-id="reforged"]'),
    ).not.toBeNull();
  });
});

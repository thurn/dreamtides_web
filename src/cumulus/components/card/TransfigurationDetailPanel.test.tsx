// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountCumulus,
  syntheticGameCard,
} from "../../test-helpers/component-test-fixtures";
import { localizedTransfigurationFormFixture } from "../../test-helpers/transfiguration-fixture";
import { assertLocalized } from "@trox/runtime";
import {
  TransfigurationDetailPanel,
  type TransfigurationDetailCandidate,
} from "./TransfigurationDetailPanel";
import { parseDeckEntryId } from "../../../types/identifiers";

const candidate: TransfigurationDetailCandidate = {
  entryId: parseDeckEntryId("entry"),
  card: syntheticGameCard(1),
  forms: [
    {
      type: "Empowered",
      presentation: localizedTransfigurationFormFixture("Empowered"),
      change: { kind: "energy-delta", from: 2, to: 1 },
      essenceCost: 20,
      affordable: true,
      previewModel: syntheticGameCard(2),
    },
    {
      type: "Kindled",
      presentation: localizedTransfigurationFormFixture("Kindled"),
      change: { kind: "spark-delta", from: 1, to: 2 },
      essenceCost: 40,
      affordable: false,
      previewModel: syntheticGameCard(3),
    },
    {
      type: "Resonant",
      presentation: {
        ...localizedTransfigurationFormFixture("Resonant"),
        name: assertLocalized("Resonant Across the Unending Luminous Horizon"),
      },
      change: { kind: "spark-delta", from: 1, to: 3 },
      essenceCost: 30,
      affordable: true,
      previewModel: syntheticGameCard(4),
    },
  ],
};
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

describe("TransfigurationDetailPanel", () => {
  it("emits form types and confirms only an affordable controlled selection", () => {
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    const { container, root } = mountCumulus(
      <TransfigurationDetailPanel
        candidate={candidate}
        value="Empowered"
        status="idle"
        quote="included"
        navigation={{ kind: "fixed" }}
        onChange={onChange}
        onConfirm={onConfirm}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-transfiguration-form-Resonant"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-transfiguration-confirm"]',
        )
        ?.click(),
    );
    expect(onChange).toHaveBeenCalledWith("Resonant");
    expect(onConfirm).toHaveBeenCalledWith("Empowered");
    expect(container.querySelector("[data-essence-cost]")).toBeNull();
    act(() => root.unmount());
  });

  it.each(["idle", "submitting", "accepted"] as const)(
    "exposes controlled %s status with fixed navigation",
    (status) => {
      const { container, root } = mountCumulus(
        <TransfigurationDetailPanel
          candidate={candidate}
          value={status === "idle" ? null : "Empowered"}
          status={status}
          quote="show-cost"
          navigation={{ kind: "fixed" }}
          onChange={() => {}}
          onConfirm={() => {}}
        />,
      );
      expect(
        container.querySelector<HTMLElement>("[data-transfiguration-status]")
          ?.dataset.transfigurationStatus,
      ).toBe(status);
      expect(
        container.querySelector(
          '[data-testid="cumulus-transfiguration-choose-again"]',
        ),
      ).toBeNull();
      expect(
        container.querySelectorAll("[data-transfiguration-button-variant]"),
      ).toHaveLength(3);
      act(() => root.unmount());
    },
  );

  it("prevents confirmation for null and unaffordable selections", () => {
    for (const value of [null, "Kindled"] as const) {
      const onConfirm = vi.fn();
      const { container, root } = mountCumulus(
        <TransfigurationDetailPanel
          candidate={candidate}
          value={value}
          status="idle"
          quote="show-cost"
          navigation={{ kind: "fixed" }}
          onChange={() => {}}
          onConfirm={onConfirm}
        />,
      );
      act(() =>
        container
          .querySelector<HTMLElement>(
            '[data-testid="cumulus-transfiguration-confirm"]',
          )
          ?.click(),
      );
      expect(onConfirm).not.toHaveBeenCalled();
      act(() => root.unmount());
    }
  });

  it.each([
    { desktop: true, layout: "desktop", optionLayout: "priced" },
    { desktop: false, layout: "mobile", optionLayout: "compact" },
  ])(
    "owns $layout layout for three-plus forms",
    ({ desktop, layout, optionLayout }) => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("min-width") ? desktop : false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      const { container, root } = mountCumulus(
        <TransfigurationDetailPanel
          candidate={candidate}
          value="Resonant"
          status="idle"
          quote="included"
          navigation={{ kind: "fixed" }}
          onChange={() => {}}
          onConfirm={() => {}}
        />,
      );
      expect(
        container.querySelector<HTMLElement>(
          "[data-transfiguration-detail-layout]",
        )?.dataset.transfigurationDetailLayout,
      ).toBe(layout);
      expect(
        container.querySelector<HTMLElement>(
          "[data-transfiguration-option-layout]",
        )?.dataset.transfigurationOptionLayout,
      ).toBe(optionLayout);
      expect(container.querySelector("[data-essence-cost]")).toBeNull();
      act(() => root.unmount());
    },
  );

  it("exposes accepted status and reselectable navigation without confirming", () => {
    const onBack = vi.fn();
    const onConfirm = vi.fn();
    const { container, root } = mountCumulus(
      <TransfigurationDetailPanel
        candidate={candidate}
        value="Empowered"
        status="accepted"
        quote="show-cost"
        navigation={{ kind: "reselectable", onBack }}
        onChange={() => undefined}
        onConfirm={onConfirm}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-transfiguration-choose-again"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-transfiguration-confirm"]',
        )
        ?.click(),
    );
    expect(onBack).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

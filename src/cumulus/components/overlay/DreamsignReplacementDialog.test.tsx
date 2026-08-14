// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalized } from "@trox/runtime";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { mountCumulus } from "../../test-helpers/component-test-fixtures";
import { DreamsignReplacementDialog } from "./DreamsignReplacementDialog";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamsignReplacementDialog", () => {
  it("routes replacement by UUID and both dismissal controls through one intent", () => {
    const incoming = localizedDreamsignFixture({
      id: "10000000-0000-4000-8000-000000000001",
      name: "Incoming",
    });
    const held = [1, 2].map((index) =>
      localizedDreamsignFixture({
        id: `20000000-0000-4000-8000-00000000000${String(index)}`,
        name: `Held ${String(index)}`,
      }),
    );
    const onDreamsignPress = vi.fn();
    const onDismiss = vi.fn();
    const { container, root } = mountCumulus(
      <DreamsignReplacementDialog
        model={{
          incoming,
          held,
          capacity: 2,
          dismissLabel: assertLocalized("Dismiss"),
          closeLabel: assertLocalized("Close"),
        }}
        onDreamsignPress={onDreamsignPress}
        onDismiss={onDismiss}
      />,
    );
    const replaceButton = container.querySelector<HTMLButtonElement>(
      `[data-replace-dreamsign-id="${held[1].id}"] button`,
    );
    expect(replaceButton?.tagName).toBe("BUTTON");
    act(() => replaceButton?.click());
    expect(onDreamsignPress).toHaveBeenCalledWith(held[1].id);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    act(() => buttons[0]?.click());
    act(() => buttons[buttons.length - 1]?.click());
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("[data-reveal-entity-id]")).toHaveLength(
      3,
    );
    act(() => root.unmount());
  });

  it.each([
    { capacity: 1, heldCount: 0 },
    { capacity: 2, heldCount: 1 },
    { capacity: 12, heldCount: 12 },
  ])(
    "renders a reveal-registered held collection at capacity $capacity with $heldCount entries",
    ({ capacity, heldCount }) => {
      const incoming = localizedDreamsignFixture({
        id: "10000000-0000-4000-8000-000000000010",
        name: "Incoming",
      });
      const held = Array.from({ length: heldCount }, (_, index) =>
        localizedDreamsignFixture({
          id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          name: `Held ${String(index + 1)}`,
        }),
      );
      const { container, root } = mountCumulus(
        <DreamsignReplacementDialog
          model={{
            incoming,
            held,
            capacity,
            dismissLabel: assertLocalized("Dismiss"),
            closeLabel: assertLocalized("Close"),
          }}
          onDreamsignPress={() => {}}
          onDismiss={() => {}}
        />,
      );
      const dialog = container.querySelector<HTMLElement>(
        "[data-dreamsign-replacement-dialog]",
      );
      expect(dialog?.dataset.dreamsignReplacementCapacity).toBe(
        String(capacity),
      );
      expect(
        container.querySelector<HTMLElement>(
          "[data-dreamsign-replacement-held-count]",
        )?.dataset.dreamsignReplacementHeldCount,
      ).toBe(String(heldCount));
      expect(
        container.querySelectorAll("[data-reveal-entity-id]"),
      ).toHaveLength(heldCount + 1);
      act(() => root.unmount());
    },
  );
});

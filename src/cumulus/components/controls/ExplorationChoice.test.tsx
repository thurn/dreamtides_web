// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalized } from "@trox/runtime";
import {
  mountCumulus,
  syntheticGameCard,
} from "../../test-helpers/component-test-fixtures";
import {
  ExplorationChoice,
  type ExplorationChoiceEntity,
} from "./ExplorationChoice";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";

const entityCard = syntheticGameCard(1);
const entity: ExplorationChoiceEntity = {
  kind: "card",
  id: entityCard.cardId,
  entryId: "entry",
  label: assertLocalized("Entity"),
  card: entityCard,
};
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function touchPointer(
  type: "pointerdown" | "pointerup",
  pointerId: number,
  timeStamp: number,
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 120,
    clientY: 80,
  });
  Object.defineProperties(event, {
    pointerType: { value: "touch" },
    pointerId: { value: pointerId },
    timeStamp: { value: timeStamp },
  });
  return event;
}

describe("ExplorationChoice", () => {
  it("renders ordered prepared parts and emits its action ID once", () => {
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId: "action",
          label: assertLocalized("Choice"),
          description: [
            { kind: "text", value: assertLocalized("Before ") },
            { kind: "entity", entity },
            { kind: "rules", value: assertLocalized(" after") },
          ],
          availability: "available",
          preview: entity,
        }}
        onPress={onPress}
      />,
    );
    const choice = container.querySelector<HTMLElement>(
      '[data-exploration-action-id="action"]',
    )!;
    act(() => choice.click());
    expect(onPress).toHaveBeenCalledOnce();
    expect(onPress).toHaveBeenCalledWith("action");
    expect(
      container.querySelector<HTMLElement>("[data-exploration-entity-label]")
        ?.dataset.entityId,
    ).toBe(entity.id);
    act(() => root.unmount());
  });

  it("emits exactly once for quick mouse, keyboard-compatible, and touch activation", () => {
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId: "activation",
          label: assertLocalized("Choice"),
          description: [{ kind: "text", value: assertLocalized("Plain") }],
          availability: "available",
        }}
        onPress={onPress}
      />,
    );
    const choice = container.querySelector<HTMLElement>(
      '[data-exploration-action-id="activation"]',
    )!;
    act(() => {
      choice.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => {
      choice.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 0 }),
      );
    });
    expect(onPress).toHaveBeenCalledTimes(2);
    act(() => {
      choice.dispatchEvent(touchPointer("pointerdown", 7, 100));
    });
    act(() => {
      choice.dispatchEvent(touchPointer("pointerup", 7, 180));
    });
    expect(onPress).toHaveBeenCalledTimes(3);
    act(() => {
      choice.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onPress).toHaveBeenCalledTimes(3);
    expect(onPress).toHaveBeenNthCalledWith(3, "activation");
    act(() => root.unmount());
  });

  it("uses touch hold for reading without activation", () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId: "hold",
          label: assertLocalized("Choice"),
          description: [{ kind: "entity", entity }],
          availability: "available",
          preview: entity,
        }}
        onPress={onPress}
      />,
    );
    const choice = container.querySelector<HTMLElement>(
      '[data-exploration-action-id="hold"]',
    )!;
    act(() => {
      choice.dispatchEvent(touchPointer("pointerdown", 8, 100));
    });
    act(() => {
      vi.advanceTimersByTime(35);
    });
    act(() => {
      choice.dispatchEvent(touchPointer("pointerup", 8, 401));
      choice.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onPress).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("preserves authored order for repeated labels and multiple UUID-backed entity kinds", () => {
    const secondCard = syntheticGameCard(2);
    const repeatedCard = {
      ...entity,
      id: secondCard.cardId,
      entryId: "entry-two",
      card: secondCard,
    };
    const dreamsign = localizedDreamsignFixture({
      id: "40000000-0000-4000-8000-000000000001",
      name: "Entity",
    });
    const dreamsignEntity: ExplorationChoiceEntity = {
      kind: "dreamsign",
      id: dreamsign.id,
      label: assertLocalized("Entity"),
      dreamsign,
    };
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId: "ordered",
          label: assertLocalized(
            "A long localized choice label that must remain readable",
          ),
          description: [
            { kind: "entity", entity },
            { kind: "text", value: assertLocalized(" then ") },
            { kind: "entity", entity: repeatedCard },
            { kind: "rules", value: assertLocalized(" then reveal ") },
            { kind: "entity", entity: dreamsignEntity },
          ],
          availability: "available",
          preview: dreamsignEntity,
        }}
        onPress={() => {}}
      />,
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-exploration-entity-label]",
        ),
        (element) => element.dataset.entityId,
      ),
    ).toEqual([entity.id, repeatedCard.id, dreamsign.id]);
    expect(
      container.querySelector<HTMLElement>("[data-exploration-action-id]")
        ?.dataset.explorationEntityPreview,
    ).toBe("dreamsign");
    act(() => root.unmount());
  });

  it("keeps unavailable entity reveals mounted without activating", () => {
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId: "blocked",
          label: assertLocalized("Choice"),
          description: [{ kind: "entity", entity }],
          availability: "unavailable",
          preview: entity,
        }}
        onPress={onPress}
      />,
    );
    act(() =>
      container
        .querySelector<HTMLElement>('[data-exploration-action-id="blocked"]')
        ?.click(),
    );
    expect(onPress).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-exploration-entity-label]"),
    ).not.toBeNull();
    act(() => root.unmount());
  });
});

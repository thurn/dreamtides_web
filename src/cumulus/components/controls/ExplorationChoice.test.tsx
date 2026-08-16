// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalized, opaque, txa } from "@trox/runtime";
import {
  mountCumulus,
  syntheticGameCard,
} from "../../test-helpers/component-test-fixtures";
import {
  ExplorationChoice,
  type ExplorationChoiceEntity,
} from "./ExplorationChoice";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { parseDeckEntryId } from "../../../types/identifiers";
import { testExplorationActionId } from "../../../types/test-identities";
import { richText } from "../card/rich-text";

const entityCard = syntheticGameCard(1);
const entity: ExplorationChoiceEntity = {
  kind: "card",
  id: entityCard.cardId,
  entryId: parseDeckEntryId("entry"),
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
    const actionId = testExplorationActionId("action");
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: assertLocalized("Choice"),
          description: richText.annotated(
            txa(
              "Before {entity} after",
              { entity: opaque(assertLocalized("Entity")) },
              "[exploration] Synthetic choice effect surrounding one revealable entity. entity is a fixture card name.",
            ).annotate({ entity }),
          ),
          availability: "available",
          preview: entity,
        }}
        onPress={onPress}
      />,
    );
    const choice = container.querySelector<HTMLElement>(
      `[data-exploration-action-id="${actionId}"]`,
    )!;
    act(() => choice.click());
    expect(onPress).toHaveBeenCalledOnce();
    expect(onPress).toHaveBeenCalledWith(actionId);
    expect(
      container.querySelector<HTMLElement>("[data-exploration-entity-label]")
        ?.dataset.entityId,
    ).toBe(entity.id);
    act(() => root.unmount());
  });

  it("emits exactly once for quick mouse, keyboard-compatible, and touch activation", () => {
    const actionId = testExplorationActionId("activation");
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: assertLocalized("Choice"),
          description: richText.rules(assertLocalized("Plain")),
          availability: "available",
        }}
        onPress={onPress}
      />,
    );
    const choice = container.querySelector<HTMLElement>(
      `[data-exploration-action-id="${actionId}"]`,
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
    expect(onPress).toHaveBeenNthCalledWith(3, actionId);
    act(() => root.unmount());
  });

  it("uses touch hold for reading without activation", () => {
    const actionId = testExplorationActionId("hold");
    vi.useFakeTimers();
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: assertLocalized("Choice"),
          description: richText.annotated(
            txa(
              "{entity}",
              { entity: opaque(assertLocalized("Entity")) },
              "[exploration] Synthetic choice effect containing one revealable entity. entity is a fixture card name.",
            ).annotate({ entity }),
          ),
          availability: "available",
          preview: entity,
        }}
        onPress={onPress}
      />,
    );
    const choice = container.querySelector<HTMLElement>(
      `[data-exploration-action-id="${actionId}"]`,
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
      entryId: parseDeckEntryId("entry-two"),
      card: secondCard,
    };
    const dreamsign = localizedDreamsignFixture({
      idSeed: "40000000-0000-4000-8000-000000000001",
      name: "Entity",
    });
    const dreamsignEntity: ExplorationChoiceEntity = {
      kind: "dreamsign",
      id: dreamsign.id,
      dreamsign,
    };
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId: testExplorationActionId("ordered"),
          label: assertLocalized(
            "A long localized choice label that must remain readable",
          ),
          description: richText.annotated(
            txa(
              "{first_entity} then {second_entity} then reveal {dreamsign}",
              {
                first_entity: opaque(assertLocalized("Entity")),
                second_entity: opaque(assertLocalized("Entity")),
                dreamsign: opaque(dreamsign.name),
              },
              "[exploration] Synthetic choice effect containing two fixture cards and one Dreamsign. Each placeholder is the proper name of its revealable entity.",
            ).annotate({
              first_entity: entity,
              second_entity: repeatedCard,
              dreamsign: dreamsignEntity,
            }),
          ),
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

  it("keeps unavailable entity labels visible without activating", () => {
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <ExplorationChoice
        model={{
          actionId: testExplorationActionId("blocked"),
          label: assertLocalized("Choice"),
          description: richText.annotated(
            txa(
              "{entity}",
              { entity: opaque(assertLocalized("Entity")) },
              "[exploration] Synthetic unavailable choice effect containing one revealable entity. entity is a fixture card name.",
            ).annotate({ entity }),
          ),
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
    expect(
      container
        .querySelector("[data-exploration-entity-label]")
        ?.hasAttribute("tabindex"),
    ).toBe(false);
    expect(
      container
        .querySelector("[data-exploration-entity-label]")
        ?.hasAttribute("data-reveal-entity-id"),
    ).toBe(false);
    act(() => root.unmount());
  });
});

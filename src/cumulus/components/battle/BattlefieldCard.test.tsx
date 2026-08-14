// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mountCumulus,
  syntheticGameCard,
} from "../../test-helpers/component-test-fixtures";
import { BattlefieldCard, type BattlefieldCardModel } from "./BattlefieldCard";

const model: BattlefieldCardModel = {
  battleCardId: "battle-instance",
  card: syntheticGameCard(1),
  exhausted: true,
  storedMemory: 2,
  figment: true,
  selection: "selected",
  challengeMarker: { owner: "player", side: "near" },
  scoreAnnouncement: { points: 2, presentationId: "score" },
  motion: "snap",
  presentation: "battlefield",
};
afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattlefieldCard", () => {
  it("owns statuses while emitting the battle-instance ID on keyboard press", () => {
    const onPress = vi.fn();
    const { container, root } = mountCumulus(
      <BattlefieldCard
        model={model}
        interaction={{ kind: "pressable", onPress }}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      "[data-battlefield-card]",
    );
    act(() => {
      card?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onPress).toHaveBeenCalledWith("battle-instance");
    expect(
      container.querySelectorAll("[data-battle-card-status]"),
    ).toHaveLength(2);
    expect(
      container.querySelector("[data-battle-card-selection-ring]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-battle-challenger-chevron]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-radial-announcement]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-game-card-source]")).not.toBeNull();
    expect(model.battleCardId).not.toBe(model.card.cardId);
    act(() => root.unmount());
  });

  it("suppresses click after one completed drag and emits one semantic drop", () => {
    const onPress = vi.fn();
    const onDrop = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const { container, root } = mountCumulus(
      <BattlefieldCard
        model={{ ...model, exhausted: false }}
        interaction={{
          kind: "draggable",
          onPress,
          onDrop,
          onDragStart,
          onDragEnd,
        }}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      "[data-battlefield-card]",
    )!;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(card, { setPointerCapture, releasePointerCapture });
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: "mouse" },
        button: { value: 0 },
        clientX: { value: x },
        clientY: { value: 10 },
      });
      return event;
    };
    act(() => {
      card.dispatchEvent(pointer("pointerdown", 0));
      card.dispatchEvent(pointer("pointermove", 40));
      card.dispatchEvent(pointer("pointerup", 40));
      card.click();
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ battleCardId: "battle-instance" }),
    );
    expect(onPress).not.toHaveBeenCalled();
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    act(() => root.unmount());
  });

  it("keeps passive cards revealable without exposing an action role", () => {
    const { container, root } = mountCumulus(
      <BattlefieldCard
        model={{ ...model, exhausted: false }}
        interaction={{ kind: "passive" }}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      "[data-battlefield-card]",
    );
    expect(card?.getAttribute("role")).toBeNull();
    expect(card?.hasAttribute("tabindex")).toBe(false);
    expect(card?.querySelector("[data-game-card-source]")).not.toBeNull();
    act(() => root.unmount());
  });

  it("treats sub-slop pointer movement as one quick press", () => {
    const onPress = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const onDrop = vi.fn();
    const { container, root } = mountCumulus(
      <BattlefieldCard
        model={{ ...model, exhausted: false }}
        interaction={{
          kind: "draggable",
          onPress,
          onDragStart,
          onDragEnd,
          onDrop,
        }}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      "[data-battlefield-card]",
    )!;
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerId: { value: 7 },
        pointerType: { value: "mouse" },
        button: { value: 0 },
        clientX: { value: x },
        clientY: { value: 10 },
      });
      return event;
    };
    act(() => {
      card.dispatchEvent(pointer("pointerdown", 10));
      card.dispatchEvent(pointer("pointermove", 12));
      card.dispatchEvent(pointer("pointerup", 12));
      card.click();
    });
    expect(onPress).toHaveBeenCalledOnce();
    expect(onPress).toHaveBeenCalledWith(model.battleCardId);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("ends a cancelled drag once without committing a drop", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const onDrop = vi.fn();
    const { container, root } = mountCumulus(
      <BattlefieldCard
        model={{ ...model, exhausted: false }}
        interaction={{ kind: "draggable", onDragStart, onDragEnd, onDrop }}
      />,
    );
    const card = container.querySelector<HTMLElement>(
      "[data-battlefield-card]",
    )!;
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerId: { value: 3 },
        pointerType: { value: "mouse" },
        button: { value: 0 },
        clientX: { value: x },
        clientY: { value: 10 },
      });
      return event;
    };
    act(() => {
      card.dispatchEvent(pointer("pointerdown", 0));
      card.dispatchEvent(pointer("pointermove", 40));
      card.dispatchEvent(pointer("pointercancel", 40));
    });
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDragEnd).toHaveBeenCalledOnce();
    expect(onDrop).not.toHaveBeenCalled();
    expect(card.dataset.battlePointerDragging).toBe("false");
    act(() => root.unmount());
  });
});

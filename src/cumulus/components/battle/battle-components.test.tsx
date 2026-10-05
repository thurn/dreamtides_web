// @vitest-environment jsdom

import { act, useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { syntheticGameCard } from "../../test-helpers/component-test-fixtures";
import {
  parseBattleCardId,
  parsePresentationId,
} from "../../../types/identifiers";
import {
  testAvatarId,
  testDreamwellCardId,
} from "../../../types/test-identities";
import { BattlePhaseIndicator } from "./BattlePhaseIndicator";
import { BattleStatusDisplay } from "./BattleStatusDisplay";
import { BattlefieldCard, type BattlefieldCardModel } from "./BattlefieldCard";
import { CardBack } from "./CardBack";
import {
  CARD_PILE_VISIBLE_LAYER_CAP,
  CardPile,
  type BattlePileCard,
} from "./CardPile";
import { DreamwellCard, type DreamwellCardModel } from "./DreamwellCard";

type DraggableInteraction = Extract<
  ComponentProps<typeof BattlefieldCard>["interaction"],
  { readonly kind: "draggable" }
>;

function pointerEvent(type: string, pointerId: number, clientX: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "mouse" },
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: 10 },
  });
  return event;
}

describe("CardPile", () => {
  const model = syntheticGameCard(1);
  const cards: readonly BattlePileCard[] = [
    { face: "up", id: parseBattleCardId("instance-top"), model, figment: true },
    { face: "down", id: parseBattleCardId("instance-second") },
    { face: "up", id: parseBattleCardId("instance-third"), model },
    { face: "down", id: parseBattleCardId("instance-hidden") },
  ];

  it("renders the topmost physical layers in stable battle-instance order", () => {
    const { container } = renderInCumulus(
      <CardPile cards={cards} label={"Pile"} />,
    );
    const pile = container.querySelector<HTMLElement>("[data-card-pile]");
    const layers = Array.from(
      container.querySelectorAll<HTMLElement>("[data-card-pile-layer]"),
    );
    expect(pile?.dataset.pileCount).toBe("4");
    expect(pile?.dataset.pileVisibleCount).toBe(
      String(CARD_PILE_VISIBLE_LAYER_CAP),
    );
    expect(layers.map((layer) => layer.dataset.battleCardId)).toEqual([
      "instance-top",
      "instance-second",
      "instance-third",
    ]);
    expect(layers.map((layer) => layer.dataset.pileDepth)).toEqual([
      "0",
      "1",
      "2",
    ]);
    expect(layers.map((layer) => layer.dataset.cardFace)).toEqual([
      "up",
      "down",
      "up",
    ]);
    expect(layers.map((layer) => layer.dataset.battleCardLayoutId)).toEqual([
      "battle-card:instance-top",
      "battle-card:instance-second",
      "battle-card:instance-third",
    ]);
    expect(
      container.querySelector('[data-battle-card-id="instance-hidden"]'),
    ).toBeNull();
    expect(container.querySelectorAll("[data-card-back]")).toHaveLength(1);
    expect(container.querySelector("button")).toBeNull();
  });

  it("snaps a face-up card into a pile without shared-layout travel", () => {
    const { container } = renderInCumulus(
      <CardPile
        cards={[
          {
            face: "up",
            id: parseBattleCardId("resolved-card"),
            model,
            layoutMotion: "snap",
          },
        ]}
        label={"Pile"}
      />,
    );
    const layer = container.querySelector<HTMLElement>(
      '[data-battle-card-id="resolved-card"]',
    );
    expect(layer?.dataset.battleCardLayoutId).toBeUndefined();
    expect(layer?.dataset.battleCardLayoutMotion).toBe("snap");
  });

  it("activates the whole pile when pressable", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <CardPile cards={cards.slice(0, 1)} label={"Pile"} onPress={onPress} />,
    );
    act(() =>
      container.querySelector<HTMLButtonElement>("[data-card-pile]")?.click(),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("draws an outlined footprint for an empty pile when requested", () => {
    const { container } = renderInCumulus(
      <CardPile
        cards={[]}
        label={"Pile"}
        emptyState="outlined"
        emptyLabel={"Empty"}
      />,
    );
    const pile = container.querySelector<HTMLElement>("[data-card-pile]");
    expect(pile?.dataset.pileCount).toBe("0");
    expect(pile?.dataset.pileEmptyState).toBe("outlined");
    expect(container.querySelector("[data-card-pile-empty]")).not.toBeNull();
  });
});

describe("BattlefieldCard", () => {
  const model: BattlefieldCardModel = {
    battleCardId: parseBattleCardId("battle-instance"),
    card: syntheticGameCard(1),
    exhausted: true,
    storedMemory: 2,
    figment: true,
    selection: "selected",
    challengeMarker: { owner: "player", side: "near" },
    scoreAnnouncement: {
      points: 2,
      presentationId: parsePresentationId("score"),
    },
    motion: "snap",
    presentation: "battlefield",
  };

  function renderDraggable(
    handlers: Partial<Omit<DraggableInteraction, "kind">>,
  ): HTMLElement {
    const { container } = renderInCumulus(
      <BattlefieldCard
        model={{ ...model, exhausted: false }}
        interaction={{
          kind: "draggable",
          onDragStart: vi.fn(),
          onDragEnd: vi.fn(),
          onDrop: vi.fn(),
          ...handlers,
        }}
      />,
    );
    return container.querySelector<HTMLElement>("[data-battlefield-card]")!;
  }

  it("renders statuses and emits the battle-instance ID on keyboard press", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <BattlefieldCard
        model={model}
        interaction={{ kind: "pressable", onPress }}
      />,
    );
    act(() => {
      container
        .querySelector("[data-battlefield-card]")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
    });
    expect(onPress).toHaveBeenCalledWith(model.battleCardId);
    expect(
      container.querySelectorAll("[data-battle-card-status]"),
    ).toHaveLength(2);
    for (const landmark of [
      "[data-battle-card-selection-ring]",
      "[data-battle-challenger-chevron]",
      "[data-radial-announcement]",
      "[data-game-card-source]",
    ]) {
      expect(container.querySelector(landmark)).not.toBeNull();
    }
  });

  it("suppresses click after one completed drag and emits one semantic drop", () => {
    const onPress = vi.fn();
    const onDrop = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const card = renderDraggable({ onPress, onDrop, onDragStart, onDragEnd });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(card, { setPointerCapture, releasePointerCapture });
    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", 1, 0));
      card.dispatchEvent(pointerEvent("pointermove", 1, 40));
      card.dispatchEvent(pointerEvent("pointerup", 1, 40));
      card.click();
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ battleCardId: model.battleCardId }),
    );
    expect(onPress).not.toHaveBeenCalled();
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("treats sub-slop pointer movement as one quick press", () => {
    const onPress = vi.fn();
    const onDragStart = vi.fn();
    const onDrop = vi.fn();
    const card = renderDraggable({ onPress, onDragStart, onDrop });
    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", 7, 10));
      card.dispatchEvent(pointerEvent("pointermove", 7, 12));
      card.dispatchEvent(pointerEvent("pointerup", 7, 12));
      card.click();
    });
    expect(onPress).toHaveBeenCalledOnce();
    expect(onPress).toHaveBeenCalledWith(model.battleCardId);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("ends a cancelled drag once without committing a drop", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const onDrop = vi.fn();
    const card = renderDraggable({ onDragStart, onDragEnd, onDrop });
    act(() => {
      card.dispatchEvent(pointerEvent("pointerdown", 3, 0));
      card.dispatchEvent(pointerEvent("pointermove", 3, 40));
      card.dispatchEvent(pointerEvent("pointercancel", 3, 40));
    });
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDragEnd).toHaveBeenCalledOnce();
    expect(onDrop).not.toHaveBeenCalled();
    expect(card.dataset.battlePointerDragging).toBe("false");
  });

  it("keeps passive cards revealable without exposing an action role", () => {
    const { container } = renderInCumulus(
      <BattlefieldCard model={model} interaction={{ kind: "passive" }} />,
    );
    const card = container.querySelector("[data-battlefield-card]");
    expect(card?.getAttribute("role")).toBeNull();
    expect(card?.hasAttribute("tabindex")).toBe(false);
    expect(card?.querySelector("[data-game-card-source]")).not.toBeNull();
  });
});

describe("BattleStatusDisplay", () => {
  const resources = {
    currentEnergy: 2,
    maxEnergy: 3,
    points: 4,
    pointsToWin: 25,
  } as const;

  it("publishes resources as non-interactive labeled state", () => {
    const { container } = renderInCumulus(
      <BattleStatusDisplay
        owner="enemy"
        relationship="far"
        avatar={{ imageNumber: "0042", name: "Avatar", title: "Title" }}
        {...resources}
      />,
    );
    const status = container.querySelector<HTMLElement>("[data-battle-status]");
    expect(status?.dataset).toMatchObject({
      owner: "enemy",
      currentEnergy: "2",
      maxEnergy: "3",
      points: "4",
      pointsToWin: "25",
    });
    expect(status?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(container.querySelector("img")?.alt).not.toBe("");
    expect(container.querySelector("button, [role='button']")).toBeNull();
  });

  it("reserves a labeled placeholder while the portrait loads", () => {
    const { container } = renderInCumulus(
      <BattleStatusDisplay
        owner="player"
        relationship="near"
        avatar={null}
        {...resources}
      />,
    );
    expect(
      container
        .querySelector("[data-battle-status-avatar-placeholder]")
        ?.getAttribute("aria-label")
        ?.trim(),
    ).not.toBe("");
    expect(container.querySelector("img")).toBeNull();
  });

  it("registers populated portraits with their ability reveal by UUID", () => {
    const avatarId = testAvatarId("bfc40414-5264-41bf-86e1-a0f41ee4f5b5");
    const { container } = renderInCumulus(
      <BattleStatusDisplay
        owner="player"
        relationship="near"
        avatar={{ imageNumber: "0029", name: "Avatar", title: "Title" }}
        avatarProfile={{
          id: avatarId,
          ability: "Fixture ability",
          unavailable: true,
        }}
        {...resources}
      />,
    );
    const source = container.querySelector<HTMLElement>("[data-avatar-source]");
    expect(source?.dataset.revealEntityId).toBe(avatarId);
    expect(source?.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(source?.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toContain("Fixture ability");
  });
});

describe("DreamwellCard", () => {
  const model: DreamwellCardModel = {
    cardId: testDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
    displaySnapshot: {
      id: testDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
      name: "Fixture Beacon",
      renderedText: "Reclaim this card.",
      energyAdded: 2,
      imageNumber: 42,
      art: { x: 0.25, y: -0.5, scale: 1.4 },
    },
  };

  it("renders a static UUID-backed card that delegates reveal to the whole entity", () => {
    const { container } = renderInCumulus(<DreamwellCard model={model} />);
    const card = container.querySelector<HTMLElement>("[data-dreamwell-card]");
    expect(card?.dataset.dreamwellCard).toBe(model.cardId);
    expect(card?.dataset.revealEntityType).toBe("dreamwell-card");
    expect(card?.dataset.revealEntityId).toBe(model.cardId);
    expect(card?.getAttribute("tabindex")).toBe("0");
    expect(
      card?.querySelector(
        '[data-card-stat="dreamwellEnergy"] [data-card-stat-value]',
      )?.textContent,
    ).toBe("2");
    expect(card?.querySelector("[data-glossary-term]")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("BattlePhaseIndicator", () => {
  it("tracks rapid controlled phase and side changes", () => {
    function Harness() {
      const [phase, setPhase] = useState<"dawn" | "night" | "challenge">(
        "dawn",
      );
      const [side, setSide] = useState<"near" | "far">("near");
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setPhase("night");
              setPhase("challenge");
              setSide("far");
            }}
          />
          <BattlePhaseIndicator phase={phase} side={side} />
        </>
      );
    }
    const { container } = renderInCumulus(<Harness />);
    const indicator = () =>
      container.querySelector<HTMLElement>("[data-battle-phase]");
    expect(indicator()?.dataset).toMatchObject({
      battlePhase: "dawn",
      battleSide: "near",
    });
    expect(indicator()?.getAttribute("aria-label")).not.toBe("");
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(indicator()?.dataset).toMatchObject({
      battlePhase: "challenge",
      battleSide: "far",
    });
  });
});

describe("CardBack", () => {
  it("renders a labeled, non-draggable, non-interactive card back", () => {
    const { container } = renderInCumulus(
      <CardBack label={"Face-down card"} testId="enemy-card" />,
    );
    const image = container.querySelector<HTMLImageElement>("[data-card-back]");
    expect(image?.alt).toBe("Face-down card");
    expect(image?.dataset.testid).toBe("enemy-card");
    expect(image?.draggable).toBe(false);
    expect(container.querySelector("button")).toBeNull();
  });
});

// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { Dreamsign } from "../../../types/journey";
import { CumulusRoot } from "../../CumulusRoot";
import { EntityReference } from "./EntityReference";

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");
const CARD: CardData = {
  id: CARD_ID,
  name: asCardName("Fixture Ally"),
  cardNumber: 42,
  cardType: "Character",
  subtype: "Guide",
  isStarter: false,
  energyCost: 2,
  spark: 3,
  isFast: false,
  renderedText: "Support — Supported allies have +1✦.",
  imageNumber: 42,
  artOwned: true,
};
const DREAMSIGN: Dreamsign = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Bell",
  effectDescription: "At the start of battle, gain 1●.",
  imageName: "bell.png",
  imageAlt: "A small silver bell",
  isNegative: false,
};

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("EntityReference", () => {
  it("renders a canonical UUID-backed card name with the complete game-card reveal", () => {
    const { container, root } = mount(
      <p>
        Gain <EntityReference entity={{ kind: "card", card: CARD }} />.
      </p>,
    );
    const source = container.querySelector<HTMLElement>(
      '[data-entity-reference="card"]',
    );
    expect(container.querySelector("p")?.textContent).toBe("Gain Fixture Ally.");
    expect(source?.dataset.entityReferenceId).toBe(CARD_ID);
    expect(source?.dataset.entityReferenceCopies).toBe("1");
    expect(source?.dataset.revealEntityType).toBe("game-card");
    expect(source?.dataset.revealPrimaryVariant).toBe("gameCard");
    expect(source?.style.textDecoration).toBe("underline");
    expect(source?.style.font).toBe("inherit");
    expect(source?.dataset.revealFeedback).toBe("stationary");
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    act(() => root.unmount());
  });

  it("registers an exact repeated-card reveal without changing the displayed name", () => {
    const { container, root } = mount(
      <p>
        Gain 3 <EntityReference entity={{ kind: "card", card: CARD, copies: 3 }} /> cards.
      </p>,
    );
    const source = container.querySelector<HTMLElement>(
      '[data-entity-reference="card"]',
    );
    expect(container.querySelector("p")?.textContent).toBe(
      "Gain 3 Fixture Ally cards.",
    );
    expect(source?.dataset.entityReferenceCopies).toBe("3");
    expect(source?.dataset.revealEntityType).toBe("game-card-copies");
    expect(source?.dataset.revealEntityId).toBe(CARD_ID);
    act(() => root.unmount());
  });

  it("renders a canonical UUID-backed Dreamsign name with its object InfoCard", () => {
    const { container, root } = mount(
      <p>
        Gain <EntityReference entity={{ kind: "dreamsign", dreamsign: DREAMSIGN }} />.
      </p>,
    );
    const source = container.querySelector<HTMLElement>(
      '[data-entity-reference="dreamsign"]',
    );
    expect(container.querySelector("p")?.textContent).toBe("Gain Bell.");
    expect(source?.dataset.entityReferenceId).toBe(DREAMSIGN.id);
    expect(source?.dataset.revealEntityType).toBe("dreamsign");
    expect(source?.dataset.revealPrimaryVariant).toBe("object");
    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain(DREAMSIGN.effectDescription);
    act(() => root.unmount());
  });
});

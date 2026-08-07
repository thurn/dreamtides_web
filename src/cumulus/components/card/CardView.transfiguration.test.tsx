// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { CardTransfigurationDisplay } from "../../../runtime/transfiguration-display";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../../../runtime/transfigure-markers";
import { CardView, type GameCardSelection } from "./CardView";

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: CARD_ID,
    name: asCardName("Archive Sentry"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Synth",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "Draw two cards.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function display(markedText: string): CardTransfigurationDisplay {
  return {
    type: "Amplified",
    markedText,
    energyChanged: false,
    sparkChanged: false,
    fastChanged: false,
  };
}

function mount(
  transfiguration: CardTransfigurationDisplay,
  selection?: GameCardSelection,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CumulusRoot>
        <CardView
          card={card()}
          transfiguration={transfiguration}
          selection={selection}
        />
      </CumulusRoot>,
    );
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

describe("CardView transfiguration rules marker", () => {
  it("derives the selection ring from the semantic transfiguration type", () => {
    const { container, root } = mount(
      display(card().renderedText),
      "transfigured",
    );

    expect(
      container.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).toContain("#f59e0b");

    act(() => root.unmount());
    container.remove();
  });

  it("derives the canonical tint from the transfiguration type", () => {
    const { container, root } = mount(
      display(
        `Draw ${TRANSFIGURE_MARK_START}two${TRANSFIGURE_MARK_END} cards.`,
      ),
    );
    const changedText = Array.from(container.querySelectorAll("span")).find(
      (span) => span.style.fontWeight === "600",
    );

    expect(changedText?.style.color).toBe("rgb(252, 211, 77)");

    act(() => root.unmount());
    container.remove();
  });

  it("offsets the shared hammer badge inward from the rules box corner when marked text changes", () => {
    const { container, root } = mount(
      display(
        `Draw ${TRANSFIGURE_MARK_START}two${TRANSFIGURE_MARK_END} cards.`,
      ),
    );
    const rulesBox = container.querySelector<HTMLElement>(
      "[data-card-rules-box]",
    );
    const marker = container.querySelector<HTMLElement>(
      '[data-card-rules-text-change="Amplified"]',
    );
    const badge = marker?.querySelector<HTMLElement>("[role='img']");

    expect(marker).not.toBeNull();
    expect(marker?.parentElement).toBe(rulesBox?.parentElement);
    expect(marker?.style.right).toBe(
      "calc(var(--cv-transfiguration-change-badge-size) * -0.5 + var(--cv-rules-change-badge-corner-shift))",
    );
    expect(marker?.style.bottom).toBe(
      "calc(var(--cv-transfiguration-change-badge-size) * -0.5 + var(--cv-rules-change-badge-corner-shift))",
    );
    expect(badge?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(badge?.style.width).toBe(
      "var(--cv-transfiguration-change-badge-size)",
    );
    expect(badge?.querySelector(".fa-hammer")).not.toBeNull();
    expect(badge?.querySelector("[data-inline-glyph]")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("omits the rules badge for a stat-only transfiguration", () => {
    const { container, root } = mount(display(card().renderedText));

    expect(
      container.querySelector("[data-card-rules-text-change]"),
    ).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

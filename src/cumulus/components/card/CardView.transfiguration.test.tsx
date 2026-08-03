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
import { CardView } from "./CardView";

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
    color: "#fcd34d",
    markedText,
    energyChanged: false,
    sparkChanged: false,
    fastChanged: false,
  };
}

function mount(transfiguration: CardTransfigurationDisplay) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CumulusRoot>
        <CardView card={card()} transfiguration={transfiguration} />
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
  it("shows the shared hammer badge in the rules box when marked text changes", () => {
    const { container, root } = mount(
      display(
        `Draw ${TRANSFIGURE_MARK_START}two${TRANSFIGURE_MARK_END} cards.`,
      ),
    );
    const rulesBox = container.querySelector<HTMLElement>(
      "[data-card-rules-box]",
    );
    const marker = rulesBox?.querySelector<HTMLElement>(
      '[data-card-rules-text-change="Amplified"]',
    );
    const badge = marker?.querySelector<HTMLElement>("[role='img']");

    expect(marker).not.toBeNull();
    expect(marker?.style.right).toBe("var(--cv-textbox-pad-x)");
    expect(marker?.style.bottom).toBe("var(--cv-textbox-pad-y)");
    expect(badge?.getAttribute("aria-label")).toBe(
      "Rules text changed by Amplified transfiguration",
    );
    expect(badge?.style.width).toBe(
      "var(--cv-transfiguration-change-badge-size)",
    );
    expect(badge?.querySelector(".fa-hammer")).not.toBeNull();
    expect(
      (rulesBox?.firstElementChild as HTMLElement | null)?.style.paddingRight,
    ).toBe(
      "calc(var(--cv-transfiguration-change-badge-size) + var(--cv-rules-change-badge-gap))",
    );

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

// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import { BattleTutorialGuidance } from "./BattleTutorialGuidance";

class ResizeObserverStub {
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

describe("BattleTutorialGuidance", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver = ResizeObserverStub;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("floats the source and dismissible Mira dialogue without modal chrome", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onContinue = vi.fn();
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={{
              presentationId: "guidance:erode",
              triggerId: "erode",
              messageIndex: 0,
              messageCount: 1,
              text: "[yellow]Erode[/yellow] sends cards to the void. Score 3⍟ for each missing card.",
              source: {
                kind: "dreamwell",
                model: {
                  cardId: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
                  displaySnapshot: {
                    id: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
                    name: "Shadow Passage",
                    renderedText: "Erode 3.",
                    energyAdded: 1,
                    imageNumber: 3,
                  },
                },
              },
            }}
            onDismiss={onContinue}
          />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector('[data-testid="battle-tutorial-dreamwell"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Mira");
    expect(container.textContent).toContain("Erode");
    expect(
      container.querySelector('[aria-label="points"]'),
    ).not.toBeNull();
    const guidance = container.querySelector<HTMLElement>(
      "[data-battle-tutorial-guidance]",
    );
    expect(guidance?.getAttribute("aria-modal")).toBeNull();
    expect(guidance?.getAttribute("role")).toBeNull();
    expect(guidance?.style.background).toBe("");
    expect(
      container.querySelector('[data-testid="battle-tutorial-continue"]'),
    ).toBeNull();
    const dialogue = container.querySelector<HTMLElement>(
      '[data-testid="battle-tutorial-dismiss"]',
    );
    act(() => dialogue?.click());
    expect(onContinue).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});

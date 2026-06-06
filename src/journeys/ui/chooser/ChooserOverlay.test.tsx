// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import type { CardData } from "../../../types/cards";
import type { ChooserRequest } from "../../apply/chooserPlan";

import {
  CardChooser,
  type CardChooserCandidate,
} from "./CardChooser";
import {
  DreamsignChooser,
  type DreamsignChooserCandidate,
} from "./DreamsignChooser";
import { TransfigurationChooser } from "./TransfigurationChooser";

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function click(button: HTMLButtonElement): void {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function buttonByName(container: HTMLElement, name: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(name),
  );
  if (!button) throw new Error(`Button not found: ${name}`);
  return button;
}

function confirmButton(container: HTMLElement): HTMLButtonElement {
  return buttonByName(container, "Confirm");
}

function renderAgain(root: Root, element: ReactElement): void {
  act(() => {
    root.render(element);
  });
}

const cardRequest: ChooserRequest = {
  kind: "card",
  requestId: "choose-card",
  poolKind: "deck",
  minPicks: 1,
  maxPicks: 2,
  title: "Choose cards",
};

const cardCandidates: readonly CardChooserCandidate[] = [
  { entryId: "e1", cardId: "c1", name: "Alpha", rulesText: "First card." },
  { entryId: "e2", cardId: "c2", name: "Beta", rulesText: "Second card." },
  { entryId: "e3", cardId: "c3", name: "Gamma", rulesText: "Third card." },
  { entryId: "e4", cardId: "c4", name: "Delta", rulesText: "Fourth card." },
];

function makeCard(overrides: Partial<CardData>): CardData {
  return {
    name: "Alpha",
    id: "alpha",
    cardNumber: 101,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: true,
    renderedText: "Gain ●2. An ally gets ⍏1.",
    imageNumber: 101,
    artOwned: true,
    ...overrides,
  };
}

const dreamsignRequest: ChooserRequest = {
  kind: "dreamsign",
  requestId: "choose-dreamsign",
  poolKind: "active",
  minPicks: 1,
  maxPicks: 1,
  title: "Choose a dreamsign",
};

const dreamsignCandidates: readonly DreamsignChooserCandidate[] = [
  {
    index: 0,
    id: "small-door",
    name: "Small Door",
    description: "A patient way through.",
  },
  {
    index: 1,
    id: "bright-key",
    name: "Bright Key",
    description: "It opens what is ready.",
  },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Chooser overlay components", () => {
  it("gates card confirm by minPicks and maxPicks", () => {
    const { container, root } = mount(
      <CardChooser
        request={cardRequest}
        candidates={cardCandidates}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const confirm = confirmButton(container);
    expect(confirm.disabled).toBe(true);

    click(buttonByName(container, "Alpha"));
    expect(confirm.disabled).toBe(false);

    click(buttonByName(container, "Beta"));
    expect(confirm.disabled).toBe(false);

    click(buttonByName(container, "Gamma"));
    expect(confirm.disabled).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("resolves selected card entry ids when confirmed", () => {
    const onResolve = vi.fn();
    const { container, root } = mount(
      <CardChooser
        request={cardRequest}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Alpha"));
    click(buttonByName(container, "Gamma"));
    click(confirmButton(container));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({
      kind: "card",
      entryIds: ["e1", "e3"],
      cardIds: ["c1", "c3"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders card chooser candidates with the normal card display", () => {
    const { container, root } = mount(
      <CardChooser
        request={cardRequest}
        candidates={[
          {
            entryId: "card-alpha",
            cardId: "alpha",
            name: "Alpha",
            rulesText: "Fallback text.",
            card: makeCard({}),
          },
        ]}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-card-stat=\"energy\"]")?.textContent)
      .toBe("2");
    expect(container.querySelector("[data-testid=\"card-type-line\"]")?.textContent)
      .toContain("Warrior");
    expect(container.querySelectorAll("i.bxf.bx-flame[aria-label=\"energy\"]").length)
      .toBe(1);
    // One corner spark orb plus one inline ⍏ pip in the rules text.
    expect(container.querySelector("[data-card-stat=\"spark\"]")).not.toBeNull();
    expect(container.querySelectorAll("[data-pip-variant=\"spark\"]").length)
      .toBe(1);

    const cardButton = buttonByName(container, "Alpha");
    expect(cardButton.getAttribute("data-offering-card-selected")).toBe("false");
    click(cardButton);
    expect(cardButton.getAttribute("data-offering-card-selected")).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("replaces the previous card selection when maxPicks is one", () => {
    const onResolve = vi.fn();
    const { container, root } = mount(
      <CardChooser
        request={{ ...cardRequest, maxPicks: 1 }}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Alpha"));
    click(buttonByName(container, "Beta"));

    expect(buttonByName(container, "Alpha").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(buttonByName(container, "Beta").getAttribute("aria-pressed")).toBe(
      "true",
    );

    click(confirmButton(container));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({
      kind: "card",
      entryIds: ["e2"],
      cardIds: ["c2"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("resolves selected dreamsign indices and ids when confirmed", () => {
    const onResolve = vi.fn();
    const { container, root } = mount(
      <DreamsignChooser
        request={dreamsignRequest}
        candidates={dreamsignCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Bright Key"));
    click(confirmButton(container));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({
      kind: "dreamsign",
      indices: [1],
      dreamsignIds: ["bright-key"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("aligns dreamsign indices and ids in click order for multi-pick choices", () => {
    const onResolve = vi.fn();
    const { container, root } = mount(
      <DreamsignChooser
        request={{ ...dreamsignRequest, minPicks: 2, maxPicks: 2 }}
        candidates={dreamsignCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Bright Key"));
    click(buttonByName(container, "Small Door"));
    click(confirmButton(container));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({
      kind: "dreamsign",
      indices: [1, 0],
      dreamsignIds: ["bright-key", "small-door"],
    });

    act(() => {
      root.unmount();
    });
  });

  it("only allows eligible transfiguration tiles to be selected", () => {
    const request: ChooserRequest = {
      kind: "transfiguration",
      requestId: "choose-transfiguration",
      eligibleTransfigurations: ["Bronze", "Rose"],
      title: "Choose a transfiguration",
    };
    const { container, root } = mount(
      <TransfigurationChooser
        request={request}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const bronze = buttonByName(container, "Bronze");
    const azure = buttonByName(container, "Azure");
    expect(bronze.disabled).toBe(false);
    expect(azure.disabled).toBe(true);
    expect(azure.getAttribute("aria-disabled")).toBe("true");

    click(azure);
    expect(azure.getAttribute("aria-pressed")).toBe("false");

    click(bronze);
    expect(bronze.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("resolves the selected transfiguration type when confirmed", () => {
    const onResolve = vi.fn();
    const request: ChooserRequest = {
      kind: "transfiguration",
      requestId: "confirm-transfiguration",
      eligibleTransfigurations: ["Bronze", "Rose"],
      title: "Choose a transfiguration",
    };
    const { container, root } = mount(
      <TransfigurationChooser
        request={request}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Rose"));
    click(confirmButton(container));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({
      kind: "transfiguration",
      type: "Rose",
    });

    act(() => {
      root.unmount();
    });
  });

  it("resets stale card selection when the request changes", () => {
    const onResolve = vi.fn();
    const { container, root } = mount(
      <CardChooser
        request={cardRequest}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Alpha"));
    expect(confirmButton(container).disabled).toBe(false);

    renderAgain(
      root,
      <CardChooser
        request={{ ...cardRequest, requestId: "choose-card-next" }}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    expect(confirmButton(container).disabled).toBe(true);
    expect(buttonByName(container, "Alpha").getAttribute("aria-pressed")).toBe(
      "false",
    );

    renderAgain(
      root,
      <CardChooser
        request={cardRequest}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    expect(confirmButton(container).disabled).toBe(true);
    expect(buttonByName(container, "Alpha").getAttribute("aria-pressed")).toBe(
      "false",
    );

    act(() => {
      root.unmount();
    });
  });

  it("resets stale card selection when same-request semantics change", () => {
    const onResolve = vi.fn();
    const { container, root } = mount(
      <CardChooser
        request={cardRequest}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Alpha"));
    expect(confirmButton(container).disabled).toBe(false);

    renderAgain(
      root,
      <CardChooser
        request={{ ...cardRequest, minPicks: 2, maxPicks: 3 }}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    expect(confirmButton(container).disabled).toBe(true);
    expect(buttonByName(container, "Alpha").getAttribute("aria-pressed")).toBe(
      "false",
    );

    act(() => {
      root.unmount();
    });
  });

  it("resets stale dreamsign selection when the request changes", () => {
    const onResolve = vi.fn();
    const { container, root } = mount(
      <DreamsignChooser
        request={dreamsignRequest}
        candidates={dreamsignCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Bright Key"));
    expect(confirmButton(container).disabled).toBe(false);

    renderAgain(
      root,
      <DreamsignChooser
        request={{ ...dreamsignRequest, requestId: "choose-dreamsign-next" }}
        candidates={dreamsignCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    expect(confirmButton(container).disabled).toBe(true);
    expect(
      buttonByName(container, "Bright Key").getAttribute("aria-pressed"),
    ).toBe("false");

    renderAgain(
      root,
      <DreamsignChooser
        request={dreamsignRequest}
        candidates={dreamsignCandidates}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    expect(confirmButton(container).disabled).toBe(true);
    expect(
      buttonByName(container, "Bright Key").getAttribute("aria-pressed"),
    ).toBe("false");

    act(() => {
      root.unmount();
    });
  });

  it("resets stale transfiguration selection when the request changes", () => {
    const request: ChooserRequest = {
      kind: "transfiguration",
      requestId: "choose-transfiguration",
      eligibleTransfigurations: ["Bronze", "Rose"],
      title: "Choose a transfiguration",
    };
    const { container, root } = mount(
      <TransfigurationChooser
        request={request}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    click(buttonByName(container, "Bronze"));
    expect(confirmButton(container).disabled).toBe(false);

    renderAgain(
      root,
      <TransfigurationChooser
        request={{ ...request, requestId: "choose-transfiguration-next" }}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(confirmButton(container).disabled).toBe(true);
    expect(buttonByName(container, "Bronze").getAttribute("aria-pressed")).toBe(
      "false",
    );

    renderAgain(
      root,
      <TransfigurationChooser
        request={request}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(confirmButton(container).disabled).toBe(true);
    expect(buttonByName(container, "Bronze").getAttribute("aria-pressed")).toBe(
      "false",
    );

    act(() => {
      root.unmount();
    });
  });

  it("cancels without resolving", () => {
    const onCancel = vi.fn();
    const onResolve = vi.fn();
    const { container, root } = mount(
      <CardChooser
        request={cardRequest}
        candidates={cardCandidates}
        onResolve={onResolve}
        onCancel={onCancel}
      />,
    );

    click(buttonByName(container, "Alpha"));
    click(buttonByName(container, "Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});

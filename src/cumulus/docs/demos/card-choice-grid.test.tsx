// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";

const cardIds = [
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
] as const;

function card(id: string, index: number): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Choice ${String(index)}`),
    cardNumber: index,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: index,
    artOwned: true,
  };
}

vi.mock("../../../data/card-database", () => ({
  loadCardDatabase: vi.fn(),
}));

vi.mock("../../components/card/CardChoiceGrid", () => ({
  CardChoiceGrid: ({
    cards,
    columns,
    onCardPress,
  }: {
    cards: readonly {
      entryId: DeckEntryId;
      selection?: string;
      operation?: string;
    }[];
    columns: string;
    onCardPress?: (entryId: DeckEntryId) => void;
  }) => (
    <div data-card-choice-grid="" data-columns={columns}>
      {cards.map((entry) => (
        <button
          key={entry.entryId}
          data-entry-id={entry.entryId}
          data-selected={entry.selection === undefined ? undefined : "true"}
          data-operation={entry.operation}
          onClick={() => onCardPress?.(entry.entryId)}
        />
      ))}
    </div>
  ),
}));

vi.mock("../../components/overlay/GlassPanel", () => ({
  GlassPanel: ({ children }: { children: ReactNode }) => (
    <section data-glass-panel="">{children}</section>
  ),
}));

import { loadCardDatabase } from "../../../data/card-database";
import { cardChoiceGridDemo } from "./card-choice-grid";
import type { DeckEntryId } from "../../../types/identifiers";

describe("CardChoiceGrid documentation demo", () => {
  it("shows a selectable grid in a non-collapsing contextual surface", async () => {
    vi.mocked(loadCardDatabase).mockResolvedValue(
      new Map(cardIds.map((id, index) => [index, card(id, index)])),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const Demo = cardChoiceGridDemo.Component;

    await act(async () => {
      root.render(<Demo columns="two" />);
      await Promise.resolve();
    });

    const surface = container.querySelector<HTMLElement>(
      "[data-card-choice-grid-demo-surface]",
    );
    const grid = container.querySelector("[data-card-choice-grid]");
    const choices =
      container.querySelectorAll<HTMLButtonElement>("[data-entry-id]");

    expect(container.querySelector("[data-glass-panel]")).not.toBeNull();
    expect(surface?.style.containerType).toBe("inline-size");
    expect(grid?.getAttribute("data-columns")).toBe("two");
    expect(choices).toHaveLength(4);

    act(() => choices[1]?.click());
    expect(choices[1]?.dataset.selected).toBe("true");
    expect(choices[1]?.dataset.operation).toBe("copy");

    act(() => root.unmount());
    container.remove();
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { assertLocalized } from "@trox/runtime";
import { asCardId, asCardName } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import { PoolViewerScreen, type PoolViewerView } from "./PoolViewerScreen";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const card = { id: asCardId("00000000-0000-4000-8000-000000000001"), cardNumber: 1, name: asCardName("Pool Card"), cardType: "Character" as const, subtype: "Fixture", isStarter: false, energyCost: 1, spark: 1, isFast: false, renderedText: "Fixture rules", imageNumber: 1, artOwned: true };
const view: PoolViewerView = { title: "pool", frame: "fullScreen", source: "run", sourceOptions: ["run", "catalog"], filters: { query: "", sort: "name", direction: "asc", type: "all", subtype: "", cost: "all" }, cards: [{ entryId: "run:pool-card", model: { cardId: card.id, displaySnapshot: card } }], totalCount: 1, visibleCount: 1, sortOptions: ["name"], subtypeOptions: [{ value: "Fixture", label: assertLocalized("Fixture") }], disclosures: [{ id: "algorithm", variant: "fixture" }] };

describe("PoolViewerScreen", () => {
  it("uses Cumulus controls and reports stable source/filter/card ids", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); const onSourceChange = vi.fn(); const onFiltersChange = vi.fn(); const onCardPress = vi.fn();
    act(() => root.render(<CumulusRoot><PoolViewerScreen view={view} onClose={vi.fn()} onSourceChange={onSourceChange} onFiltersChange={onFiltersChange} onCardPress={onCardPress} /></CumulusRoot>));
    expect(container.querySelector('[data-pool-viewer="overlay"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pool-viewer-gallery"]')).not.toBeNull();
    const searchInput = container.querySelector('[data-testid="pool-viewer-search"]');
    const localizedSinkValues = [
      container.querySelector("h2")?.textContent,
      container.querySelector('[data-testid="pool-viewer-close"]')?.getAttribute("aria-label"),
      searchInput?.closest("label")?.querySelector("span")?.textContent,
      ...Array.from(container.querySelectorAll('button[aria-haspopup="listbox"]'))
        .map((button) => button.getAttribute("aria-label")),
    ];
    expect(localizedSinkValues.length).toBeGreaterThan(3);
    expect(localizedSinkValues.every((value) => (
      value !== null && value !== undefined && value.trim() !== "" && !value.includes("tx1_")
    ))).toBe(true);
    act(() => (container.querySelector('button[role="tab"][aria-selected="false"]') as HTMLButtonElement).click());
    expect(onSourceChange).toHaveBeenCalledWith("catalog");
    act(() => (container.querySelector('[data-gallery-entry-id="run:pool-card"] .card-view') as HTMLElement).click());
    expect(onCardPress).toHaveBeenCalledWith("run:pool-card");
    act(() => root.unmount()); container.remove();
  });
});

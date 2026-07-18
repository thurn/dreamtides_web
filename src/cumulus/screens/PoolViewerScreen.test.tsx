// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import { PoolViewerScreen, type PoolViewerView } from "./PoolViewerScreen";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= () => ({ matches: false, media: "", onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false });

const card = { id: asCardId("00000000-0000-4000-8000-000000000001"), cardNumber: 1, name: asCardName("Pool Card"), cardType: "Character" as const, subtype: "Fixture", isStarter: false, energyCost: 1, spark: 1, isFast: false, renderedText: "Fixture rules", imageNumber: 1, artOwned: true };
const view: PoolViewerView = { title: "Pool Viewer", frame: "fullScreen", source: "run", sourceOptions: [{ id: "run", label: "Run Pool" }, { id: "catalog", label: "All Cards" }], filters: { query: "", sort: "name", direction: "asc", type: "all", subtype: "", cost: "all", density: "standard" }, cards: [{ entryId: "run:pool-card", model: { cardId: card.id, displaySnapshot: card } }], totalCount: 1, visibleCount: 1, emptyLabel: "No cards", sortOptions: [{ value: "name", label: "Name" }], subtypeOptions: [{ value: "Fixture", label: "Fixture" }], disclosures: [{ id: "provenance", title: "Pool construction", body: "Fixture provenance" }], replayRows: [], error: null };

describe("PoolViewerScreen", () => {
  it("uses Cumulus controls and reports stable source/filter/card ids", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); const onSourceChange = vi.fn(); const onFiltersChange = vi.fn(); const onCardPress = vi.fn();
    act(() => root.render(<CumulusRoot><PoolViewerScreen view={view} onClose={vi.fn()} onSourceChange={onSourceChange} onFiltersChange={onFiltersChange} onCardPress={onCardPress} /></CumulusRoot>));
    expect(container.querySelector('[data-pool-viewer="overlay"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pool-viewer-gallery"]')).not.toBeNull();
    act(() => (container.querySelector('button[role="tab"][aria-selected="false"]') as HTMLButtonElement).click());
    expect(onSourceChange).toHaveBeenCalledWith("catalog");
    act(() => (container.querySelector('[data-gallery-entry-id="run:pool-card"] .card-view') as HTMLElement).click());
    expect(onCardPress).toHaveBeenCalledWith("run:pool-card");
    act(() => root.unmount()); container.remove();
  });
});

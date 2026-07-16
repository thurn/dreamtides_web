// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { BANISHED_ZONE_IMAGE_NUMBER } from "../../../data/battle-zone-art";
import { CumulusRoot } from "../../CumulusRoot";
import { BanishedZoneIndicator } from "./BanishedZoneIndicator";

describe("BanishedZoneIndicator", () => {
  it("renders fixed symbolic art with an edge fade and opens the zone", () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    act(() => {
      root.render(
        <CumulusRoot>
          <BanishedZoneIndicator
            count={2}
            label="Player banished zone"
            onActivate={onActivate}
            testId="player-banished"
          />
        </CumulusRoot>,
      );
    });

    const indicator = container.querySelector<HTMLButtonElement>(
      '[data-testid="player-banished"]',
    );
    const art = indicator?.querySelector<HTMLImageElement>(
      "[data-banished-zone-art]",
    );

    expect(indicator?.dataset.banishedZoneCount).toBe("2");
    expect(indicator?.getAttribute("aria-label")).toBe(
      "Player banished zone, 2 cards",
    );
    expect(art?.dataset.banishedZoneArt).toBe(
      String(BANISHED_ZONE_IMAGE_NUMBER),
    );
    expect(art?.getAttribute("src")).toContain(
      `/cards/${String(BANISHED_ZONE_IMAGE_NUMBER)}.webp`,
    );
    expect(art?.style.maskImage).toContain("radial-gradient");
    expect(art?.style.objectFit).toBe("cover");

    act(() => indicator?.click());
    expect(onActivate).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });
});

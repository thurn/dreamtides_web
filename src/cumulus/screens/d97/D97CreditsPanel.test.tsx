// @vitest-environment jsdom
// D97CreditsPanel contract: one entry per source, each linking to its page
// and listing its licenses and authors; the close disc and Escape close it.

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { D97CreditsPanel, type D97CreditsView } from "./D97CreditsPanel";

const VIEW: D97CreditsView = {
  sources: [
    { directory: "alpha", title: "t-a", url: "https://example.test/a", licenses: ["l-1", "l-2"], authors: ["a-1"], creditsFiles: ["f.txt"] },
    { directory: "beta", title: "t-b", url: "https://example.test/b", licenses: ["l-3"], authors: ["a-2", "a-3", "a-4"], creditsFiles: [] },
    { directory: "gamma", title: "t-c", url: "https://example.test/c", licenses: ["l-1"], authors: ["a-5"], creditsFiles: [] },
  ],
};

describe("D97CreditsPanel", () => {
  it("renders one entry per source with its link, licenses and authors", () => {
    const { container } = renderInCumulus(<D97CreditsPanel view={VIEW} onClose={() => undefined} />);
    const root = container.ownerDocument;
    const entries = [...root.querySelectorAll<HTMLElement>("[data-d97-credits-source]")];
    expect(entries.map((entry) => entry.dataset["d97CreditsSource"])).toEqual(VIEW.sources.map((source) => source.directory));
    for (const source of VIEW.sources) {
      const entry = root.querySelector(`[data-d97-credits-source="${source.directory}"]`);
      expect(entry?.querySelector("a")?.getAttribute("href")).toBe(source.url);
      expect(entry?.querySelector('[data-d97-credits-line="licenses"]')?.getAttribute("data-count")).toBe(String(source.licenses.length));
      expect(entry?.querySelector('[data-d97-credits-line="authors"]')?.getAttribute("data-count")).toBe(String(source.authors.length));
      expect(entry?.querySelector('[data-d97-credits-line="credits-files"]') !== null).toBe(source.creditsFiles.length > 0);
    }
  });

  it("closes from its close disc and on Escape", () => {
    const onClose = vi.fn();
    const { container } = renderInCumulus(<D97CreditsPanel view={VIEW} onClose={onClose} />);
    act(() => container.ownerDocument.querySelector<HTMLElement>('[data-testid="d97-credits-close"]')?.click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import CumulusApp from "./CumulusApp";
import { CUMULUS_COMPONENT_GROUPS } from "./registry";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = "";
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("Cumulus documentation route", () => {
  it("renders the complete overview with production localization checks", () => {
    vi.stubEnv("MODE", "production");
    vi.stubGlobal("scrollTo", vi.fn());
    // Keep data-backed demos in their deterministic loading state. This smoke
    // test covers the synchronous route shell and complete registry render.
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    window.location.hash = "";

    const container = document.createElement("div");
    document.body.append(container);
    const uncaughtErrors: unknown[] = [];
    const root = createRoot(container, {
      onUncaughtError: (error) => uncaughtErrors.push(error),
    });

    act(() => {
      root.render(
        <CumulusRoot>
          <CumulusApp />
        </CumulusRoot>,
      );
    });

    expect(uncaughtErrors).toEqual([]);
    expect(container.childElementCount).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-card-pile]")).toHaveLength(3);

    const components = container.querySelector<HTMLElement>(
      "[data-cumulus-components]",
    );
    const systems = container.querySelector<HTMLElement>(
      "[data-cumulus-ui-systems]",
    );
    expect(components?.querySelector(":scope > h2")?.textContent).toBe(
      "Components",
    );
    expect(
      Array.from(components?.querySelectorAll(":scope h3") ?? []).map(
        (heading) => heading.textContent,
      ),
    ).toEqual([...CUMULUS_COMPONENT_GROUPS]);
    expect(
      components?.compareDocumentPosition(systems as Node) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const tocButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Table of contents"] button',
      ),
    );
    const tocLabels = tocButtons.map((button) => button.textContent);
    const componentsButton = tocButtons.find(
      (button) => button.textContent === "Components",
    );
    const primitivesButton = tocButtons.find(
      (button) => button.textContent === "Primitives",
    );
    const pressableButton = tocButtons.find(
      (button) => button.textContent === "Pressable",
    );
    expect(componentsButton?.classList).not.toContain(
      "cumulus-toc__item--child",
    );
    expect(primitivesButton?.classList).toContain(
      "cumulus-toc__item--child",
    );
    expect(pressableButton?.classList).toContain(
      "cumulus-toc__item--grandchild",
    );
    expect(tocLabels.indexOf("Components")).toBeLessThan(
      tocLabels.indexOf("Primitives"),
    );
    expect(tocLabels.indexOf("Primitives")).toBeLessThan(
      tocLabels.indexOf("Pressable"),
    );
    expect(tocLabels.indexOf("Wager Prize Card")).toBeLessThan(
      tocLabels.indexOf("UI Systems"),
    );
    const topLevelButtons = tocButtons.filter(
      (button) =>
        !button.classList.contains("cumulus-toc__item--child") &&
        !button.classList.contains("cumulus-toc__item--grandchild"),
    );
    expect(topLevelButtons[topLevelButtons.length - 1]?.textContent).toBe(
      "UI Systems",
    );

    act(() => root.unmount());
  });
});

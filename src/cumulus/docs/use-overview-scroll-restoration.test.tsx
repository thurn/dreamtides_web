// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CumulusRoute } from "./route";
import { useOverviewScrollRestoration } from "./use-overview-scroll-restoration";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function ScrollRestorationHarness({ route }: { route: CumulusRoute }) {
  useOverviewScrollRestoration(route);
  return null;
}

function mount(route: CumulusRoute): Root {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<ScrollRestorationHarness route={route} />));
  return root;
}

beforeEach(() => {
  window.sessionStorage.clear();
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    writable: true,
    value: 0,
  });
  vi.spyOn(window, "scrollTo").mockImplementation(
    (x: number | ScrollToOptions, y?: number) => {
      window.scrollY = typeof x === "object" ? (x.top ?? 0) : (y ?? 0);
    },
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useOverviewScrollRestoration", () => {
  it("restores the overview position after the document remounts", () => {
    const firstRoot = mount({ view: "overview" });

    act(() => {
      window.scrollY = 734;
      window.dispatchEvent(new Event("scroll"));
    });
    act(() => firstRoot.unmount());

    window.scrollY = 0;
    const reloadedRoot = mount({ view: "overview" });

    expect(window.scrollY).toBe(734);
    act(() => reloadedRoot.unmount());
  });

  it("keeps component pages at the top without losing the overview position", () => {
    const root = mount({ view: "overview" });

    act(() => {
      window.scrollY = 418;
      window.dispatchEvent(new Event("scroll"));
      root.render(
        <ScrollRestorationHarness route={{ view: "component", id: "button" }} />,
      );
    });
    expect(window.scrollY).toBe(0);

    act(() => {
      root.render(<ScrollRestorationHarness route={{ view: "overview" }} />);
    });
    expect(window.scrollY).toBe(418);

    act(() => root.unmount());
  });
});

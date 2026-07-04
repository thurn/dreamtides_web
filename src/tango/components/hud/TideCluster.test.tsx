// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TideCluster, type TideClusterTideView } from "./TideCluster";

const TIDES: TideClusterTideView[] = [
  { id: "t1", label: "Singular Storm", description: "Foresight and spells.", tide: "vision" },
  { id: "t2", label: "Iron Bulwark", description: "An unbreaking host.", tide: "valor" },
  { id: "t3", label: "Risen Depths", description: "Death is a doorway.", tide: "shadow" },
];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // Force reduced motion so the toggle switches phase instantly (no flying
  // clones, which depend on real layout rects jsdom does not provide).
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe("TideCluster", () => {
  it("renders one collapsed disc per tide", () => {
    const { container, root } = mount(<TideCluster tides={TIDES} />);
    expect(container.querySelectorAll("[data-tide-disc]")).toHaveLength(
      TIDES.length,
    );
    act(() => {
      root.unmount();
    });
  });

  it("reveals a named pill per tide when the cluster is toggled open", () => {
    const { container, root } = mount(<TideCluster tides={TIDES} />);
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-tide-toggle="true"]',
    );
    if (toggle === null) {
      throw new Error("Missing tide cluster toggle");
    }
    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll("[data-tide-pill]")).toHaveLength(
      TIDES.length,
    );
    expect(container.textContent).toContain("Singular Storm");
    act(() => {
      root.unmount();
    });
  });
});

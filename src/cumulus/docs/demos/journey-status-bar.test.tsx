// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { journeyStatusBarDemo } from "./journey-status-bar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

describe("JourneyStatusBar documentation demo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("contains fixed HUD chrome within the specimen stage", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const Demo = journeyStatusBarDemo.Component;

    act(() =>
      root.render(
        <CumulusRoot>
          <Demo essence={200} deck={22} dreamsigns={[]} />
        </CumulusRoot>,
      ),
    );

    const anchor = container.querySelector<HTMLElement>(
      "[data-journey-status-bar-anchor]",
    );
    const stage = anchor?.parentElement?.parentElement;

    expect(stage?.style.position).toBe("relative");
    expect(stage?.style.transform).toBe("translateZ(0)");
    expect(stage?.style.overflow).toBe("hidden");
    expect(anchor?.querySelector<HTMLElement>("i")?.style.color).toBe(
      "var(--text-tutorial-highlight)",
    );

    act(() => root.unmount());
  });

  it("provides presentation-ready collectible art in its default model", () => {
    const defaults = journeyStatusBarDemo.demo.defaultArgs;
    const avatar = defaults.avatar as {
      readonly id?: unknown;
      readonly portrait?: { readonly kind?: string };
    };
    const dreamsigns = defaults.dreamsigns as readonly {
      readonly id?: unknown;
      readonly imageName?: string;
      readonly imageAlt?: unknown;
    }[];

    expect(avatar.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(avatar.portrait?.kind).toBe("avatar");
    expect(dreamsigns).toHaveLength(3);
    for (const dreamsign of dreamsigns) {
      expect(dreamsign.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(dreamsign.imageName).toMatch(/\.png$/);
      expect(dreamsign.imageAlt).toBeDefined();
    }
  });
});

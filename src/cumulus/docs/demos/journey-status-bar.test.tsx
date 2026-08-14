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

    act(() => root.unmount());
  });
});

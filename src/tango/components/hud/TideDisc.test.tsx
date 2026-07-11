// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { TangoRoot } from "../../TangoRoot";
import { TideDisc } from "./TideDisc";

describe("TideDisc", () => {
  it("derives its tide primary and definition secondary internally", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<TangoRoot><TideDisc tide="valor" id="tide-valor" label="Rising Valor" description="Stand firm." size="lg" /></TangoRoot>));
    const source = container.querySelector<HTMLElement>("[data-tide-disc]")!;
    expect(source.dataset.revealFeedback).toBe("measured");
    expect(source.dataset.revealEntityType).toBe("tide");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("tide");
    expect(source.dataset.revealSecondaryTitles).toBe("Tides");
    expect(source.tabIndex).toBe(0);
    const description = document.getElementById(source.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Rising Valor");
    expect(description?.textContent).toContain("Stand firm.");
    expect(description?.textContent).toContain("Pools of cards");
    act(() => root.unmount()); container.remove();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { TangoRoot } from "../../TangoRoot";
import { TideSelectionButton } from "./TideSelectionButton";

describe("TideSelectionButton", () => {
  it.each([
    ["starter", "Signature", "rgb(52, 199, 89)"],
    ["facet-drawn", "Theme · drawn", "rgb(45, 138, 128)"],
    ["facet-fill", "Theme · fill", "rgb(124, 138, 134)"],
    ["neutral-fill", "Broad", "rgb(91, 107, 120)"],
  ] as const)("derives %s presentation from the strict semantic role", (selectionRole, tag, accent) => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container); const onActivate = vi.fn();
    act(() => root.render(<TangoRoot><TideSelectionButton id="Tide-Case-A" label="Fixed Tide" description="Fixed description." selectionRole={selectionRole} active={false} joined onActivate={onActivate} /></TangoRoot>));
    const source = container.querySelector<HTMLButtonElement>('[data-pool-tide-button="Tide-Case-A"]')!;
    expect(source.textContent).toContain(tag);
    expect(source.querySelector<HTMLElement>('[data-tide-selection-mark]')?.style.background).toBe(accent);
    expect(source.dataset.revealFeedback).toBe("measured");
    expect(source.dataset.revealEntityType).toBe("tide");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("text");
    expect(source.dataset.revealSecondaryTitles).toBe("Tides");
    const description = document.getElementById(source.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Fixed Tide"); expect(description?.textContent).toContain("Tides");
    act(() => source.click()); expect(onActivate).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });
});

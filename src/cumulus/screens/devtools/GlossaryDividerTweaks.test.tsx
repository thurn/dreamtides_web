// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlossaryDividerTweaks } from "./GlossaryDividerTweaks";

const logging = vi.hoisted(() => ({ logEvent: vi.fn() }));

vi.mock("../../../logging", () => ({
  logEvent: logging.logEvent,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  logging.logEvent.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset.glossaryDividerPreset;
});

describe("GlossaryDividerTweaks", () => {
  it("applies the baseline preset and exposes all five choices", () => {
    act(() => root.render(<GlossaryDividerTweaks />));

    expect(
      container.querySelectorAll("[data-glossary-divider-option]"),
    ).toHaveLength(5);
    expect(document.documentElement.dataset.glossaryDividerPreset).toBe(
      "silver-whisper",
    );
    expect(
      container.querySelector("[data-glossary-divider-tweak-style]")
        ?.textContent,
    ).toContain("rgba(246, 246, 245, 0.23)");
  });

  it("switches the shared variables and logs the chosen preset", () => {
    act(() => root.render(<GlossaryDividerTweaks />));
    const option = container.querySelector<HTMLButtonElement>(
      '[data-glossary-divider-option="luminous-thread"]',
    );
    expect(option).not.toBeNull();

    act(() => option?.click());

    expect(document.documentElement.dataset.glossaryDividerPreset).toBe(
      "luminous-thread",
    );
    expect(
      container.querySelector("[data-glossary-divider-tweak-style]")
        ?.textContent,
    ).toContain("height: 2px");
    expect(
      container.querySelector("[data-glossary-divider-values]")?.textContent,
    ).toContain('"id": "luminous-thread"');
    expect(logging.logEvent).toHaveBeenCalledWith(
      "glossary_divider_tweak_selected",
      expect.objectContaining({ presetId: "luminous-thread" }),
    );
  });
});

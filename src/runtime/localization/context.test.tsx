// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { tx } from "@trox/runtime";
import { describe, expect, it } from "vitest";
import { TroxLocalizationProvider } from "./context";
import { requireSourceRuntime } from "./runtime";
import { useLocalizer } from "./use-localizer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Fixture() {
  const resolve = useLocalizer();
  return <span data-testid="resolved">{resolve(tx(
    "Search cards",
    "Visible label for the Pool Viewer field that searches authored card names and rules text.",
  ))}</span>;
}

describe("Trox localization provider", () => {
  it("injects a stable resolver and sets document locale metadata", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(
      <TroxLocalizationProvider runtime={requireSourceRuntime()}>
        <Fixture />
      </TroxLocalizationProvider>,
    ));
    expect(container.querySelector('[data-testid="resolved"]')?.textContent).not.toBe("");
    expect(document.documentElement.lang).toBe(requireSourceRuntime().locale);
    expect(document.documentElement.dir).toBe(requireSourceRuntime().direction);
    act(() => root.unmount());
  });

  it("uses a narrow emergency boundary when bundle bootstrap is unavailable", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(
      <TroxLocalizationProvider runtime={null}>
        <Fixture />
      </TroxLocalizationProvider>,
    ));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toBe("");
    act(() => root.unmount());
  });

  it("loads a development-only QA locale through the production provider path", async () => {
    const previous = window.location.href;
    window.history.replaceState(null, "", "/?qaLocale=es");
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <TroxLocalizationProvider>
          <Fixture />
        </TroxLocalizationProvider>,
      );
    });
    await act(async () => {
      await import("./qa-runtime");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.documentElement.lang).toBe("es");
    expect(container.querySelector('[data-testid="resolved"]')?.textContent).not.toContain("tx1_");
    act(() => root.unmount());
    window.history.replaceState(null, "", previous);
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationStateScreen,
  type ApplicationStateView,
} from "./ApplicationStateScreen";

let container: HTMLDivElement;
let root: Root;

function mount(view: ApplicationStateView): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<ApplicationStateScreen view={view} />));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("ApplicationStateScreen", () => {
  it.each<ApplicationStateView>([
    { kind: "loading", title: "Loading", message: "Wait.", busyLabel: "Loading" },
    { kind: "roomCreation", title: "Creating", message: "Wait.", busyLabel: "Creating" },
    { kind: "recoverableError", title: "Retry", message: "Try again." },
    { kind: "fatalConfiguration", title: "Configuration", message: "Check setup." },
    { kind: "versionGate", title: "Version", message: "Start again." },
    { kind: "contentConfigGate", title: "Settings", message: "Adopt settings.", comparison: [] },
    { kind: "unreadableRoom", title: "Unreadable", message: "Start again." },
    { kind: "unreachableRoom", title: "Unreachable", message: "Try another room." },
  ])("renders the strict $kind state", (view) => {
    mount(view);
    expect(container.querySelector(`[data-application-state="${view.kind}"]`)).not.toBeNull();
    expect(container.textContent).toContain(view.title);
  });

  it("renders structured comparisons and reports actions through callbacks", () => {
    const onPress = vi.fn();
    mount({
      kind: "contentConfigGate",
      title: "Settings",
      message: "Adopt settings.",
      comparison: [{ label: "Pool", expected: "Room", actual: "Local", differs: true }],
      actions: [{ id: "primary", label: "Adopt", onPress }],
    });
    expect(container.querySelector("[data-application-state-comparison]")?.textContent).toContain("Pool");
    act(() => container.querySelector<HTMLButtonElement>("[data-testid=application-state-action-primary]")!.click());
    expect(onPress).toHaveBeenCalledOnce();
  });
});

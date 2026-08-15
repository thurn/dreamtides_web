// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalized } from "@trox/runtime";
import {
  ApplicationStateScreen,
  type ApplicationStateView,
} from "./ApplicationStateScreen";
import { CumulusRoot } from "../CumulusRoot";
const COPY = assertLocalized("Synthetic application-state copy");

let container: HTMLDivElement;
let root: Root;

function mount(view: ApplicationStateView): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <CumulusRoot>
        <ApplicationStateScreen view={view} />
      </CumulusRoot>,
    ),
  );
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
    { kind: "loading", title: COPY, message: COPY, busyLabel: COPY },
    { kind: "roomCreation", title: COPY, message: COPY, busyLabel: COPY },
    { kind: "recoverableError", title: COPY, message: COPY },
    { kind: "fatalConfiguration", title: COPY, message: COPY },
    { kind: "versionGate", title: COPY, message: COPY },
    { kind: "contentConfigGate", title: COPY, message: COPY, comparison: [] },
    { kind: "unreadableRoom", title: COPY, message: COPY },
    { kind: "unreachableRoom", title: COPY, message: COPY },
  ])("renders the strict $kind state", (view) => {
    mount(view);
    expect(container.querySelector(`[data-application-state="${view.kind}"]`)).not.toBeNull();
    expect(container.textContent).not.toBe("");
  });

  it("renders structured comparisons and reports actions through callbacks", () => {
    const onPress = vi.fn();
    mount({
      kind: "contentConfigGate",
      title: COPY,
      message: COPY,
      comparison: [{
        id: "atlas",
        label: COPY,
        expected: { kind: "raw", value: "Room" },
        actual: { kind: "raw", value: "Local" },
        differs: true,
      }],
      actions: [{ id: "primary", label: COPY, onPress }],
    });
    expect(container.querySelector("[data-application-state-comparison]")?.textContent).not.toBe("");
    act(() => container.querySelector<HTMLButtonElement>("[data-testid=application-state-action-primary]")!.click());
    expect(onPress).toHaveBeenCalledOnce();
  });
});

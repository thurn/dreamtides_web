// @vitest-environment jsdom

import { act } from "react";
import { assertLocalized } from "@trox/runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransientStatusToast } from "./TransientStatusToast";
import { CumulusRoot } from "../../CumulusRoot";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("TransientStatusToast", () => {
  it("renders semantic structured copy and dispatches dismissal", () => {
    const onDismiss = vi.fn();
    act(() => {
      root.render(
        <CumulusRoot>
          <TransientStatusToast
            copy={{
              title: assertLocalized("Action Not Applied"),
              message: assertLocalized("Try again."),
            }}
            onDismiss={onDismiss}
          />
        </CumulusRoot>,
      );
    });
    expect(container.querySelector("[data-transient-status-toast=warning]")?.textContent).toContain("Action Not Applied");
    act(() => container.querySelector<HTMLButtonElement>("[data-transient-status-toast]")!.click());
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

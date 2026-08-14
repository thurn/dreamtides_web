// @vitest-environment jsdom

import { assertLocalized } from "@trox/runtime";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";
import { CumulusRoot } from "../../CumulusRoot";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TextField commit behavior", () => {
  it("commits once when Enter blurs the field", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onCommit = vi.fn();
    act(() =>
      root.render(
        <CumulusRoot>
          <TextField
            label={assertLocalized("Field")}
            value="draft"
            onChange={vi.fn()}
            onCommit={onCommit}
          />
        </CumulusRoot>,
      ),
    );
    const input = host.querySelector("input")!;
    input.focus();
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("draft");
    act(() => root.unmount());
  });

  it("commits when focus leaves the field", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onCommit = vi.fn();
    act(() =>
      root.render(
        <CumulusRoot>
          <TextField
            label={assertLocalized("Field")}
            value="draft"
            onChange={vi.fn()}
            onCommit={onCommit}
          />
        </CumulusRoot>,
      ),
    );
    const input = host.querySelector("input")!;
    input.focus();
    act(() => input.blur());
    expect(onCommit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});

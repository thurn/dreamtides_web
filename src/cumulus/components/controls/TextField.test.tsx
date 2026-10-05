// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";
import { CumulusRoot } from "../../CumulusRoot";

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
            label={"Field"}
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
            label={"Field"}
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

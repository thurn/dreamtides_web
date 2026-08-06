// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { NumberStepper } from "./NumberStepper";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("NumberStepper", () => {
  it.each([
    ["sm", "var(--space-xs)"],
    ["md", "var(--space-s)"],
  ] as const)("keeps the %s density on the named spacing grid", (size, gap) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CumulusRoot>
          <NumberStepper
            label="Quantity"
            value={1}
            decrementLabel="Decrease"
            incrementLabel="Increase"
            onDecrement={vi.fn()}
            onIncrement={vi.fn()}
            size={size}
            testId="stepper"
          />
        </CumulusRoot>,
      );
    });

    expect(host.querySelector<HTMLElement>('[data-testid="stepper"]')?.style.gap).toBe(
      gap,
    );

    act(() => root.unmount());
  });
});

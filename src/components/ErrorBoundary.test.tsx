// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { logEvent, resetLog, getLogEntries } from "../logging";

vi.mock("../logging", async () => {
  const actual = await vi.importActual<typeof import("../logging")>(
    "../logging",
  );
  return {
    ...actual,
    logEvent: vi.fn(actual.logEvent),
  };
});

/** Component that intentionally throws on render. */
function Bomb({ message }: { message: string }): ReactElement {
  throw new Error(message);
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLog();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // Suppress noisy React error logs from intentional throws during these
  // tests. The boundary still records the failure via logEvent + window.__caps.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  if (typeof window !== "undefined") {
    (
      window as typeof window & {
        __caps?: { errors: unknown[]; rejections: unknown[]; consoleErrors: unknown[] };
      }
    ).__caps = { errors: [], rejections: [], consoleErrors: [] };
  }
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("keeps the emergency fallback independent from Cumulus", () => {
    const source = readFileSync(fileURLToPath(import.meta.url).replace(".test.tsx", ".tsx"), "utf8");
    expect(source).toContain("emergency-fallback presentation exemption");
    expect(source).not.toContain("../cumulus/");
  });

  it("renders children unchanged when no error is thrown", () => {
    const { container } = mount(
      <ErrorBoundary scope="test-scope">
        <div data-testid="happy-path">All good</div>
      </ErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="happy-path"]')?.textContent)
      .toBe("All good");
  });

  it("catches a render-time error from a child and shows the fallback UI", () => {
    const { container } = mount(
      <ErrorBoundary scope="overlay">
        <Bomb message="kaboom" />
      </ErrorBoundary>,
    );

    expect(container.textContent).toContain("Something went wrong");
    expect(container.querySelector('[data-testid="error-boundary-fallback"]'))
      .not.toBeNull();
  });

  it("logs the caught error through logEvent so it lands in quest-log.jsonl", () => {
    mount(
      <ErrorBoundary scope="screen">
        <Bomb message="boom-in-screen" />
      </ErrorBoundary>,
    );

    expect(vi.mocked(logEvent)).toHaveBeenCalledWith(
      "error_boundary_caught",
      expect.objectContaining({
        scope: "screen",
        message: "boom-in-screen",
      }),
    );
    const entries = getLogEntries().filter(
      (e) => e.event === "error_boundary_caught",
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces the error on window.__caps.errors for browser-QA", () => {
    mount(
      <ErrorBoundary scope="app-shell">
        <Bomb message="surface-me" />
      </ErrorBoundary>,
    );

    const caps = (
      window as typeof window & {
        __caps?: { errors: Array<{ msg: string; scope?: string }> };
      }
    ).__caps;
    expect(caps).toBeDefined();
    expect(caps!.errors.some((e) => e.msg.includes("surface-me"))).toBe(true);
  });

  it("calls the onRetry handler when the Retry action is clicked", () => {
    const onRetry = vi.fn();
    const { container, root } = mount(
      <ErrorBoundary scope="overlay" onRetry={onRetry}>
        <Bomb message="retry-me" />
      </ErrorBoundary>,
    );

    const retryButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="error-boundary-retry"]',
    );
    expect(retryButton).not.toBeNull();
    act(() => {
      retryButton!.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });

  it("resets back to children when resetKey changes", () => {
    let shouldThrow = true;
    function ConditionallyBomb(): ReactElement {
      if (shouldThrow) {
        throw new Error("conditional-boom");
      }
      return <div data-testid="recovered">Recovered</div>;
    }

    const { container, root } = mount(
      <ErrorBoundary scope="per-screen" resetKey="key-A">
        <ConditionallyBomb />
      </ErrorBoundary>,
    );

    expect(container.textContent).toContain("Something went wrong");

    // Stop throwing, change the reset key — boundary should clear state
    // and re-render the children.
    shouldThrow = false;
    act(() => {
      root.render(
        <ErrorBoundary scope="per-screen" resetKey="key-B">
          <ConditionallyBomb />
        </ErrorBoundary>,
      );
    });

    expect(container.querySelector('[data-testid="recovered"]')?.textContent)
      .toBe("Recovered");
  });

  it("supports a custom fallback render prop", () => {
    const { container } = mount(
      <ErrorBoundary
        scope="custom"
        fallback={({ error }: { error: Error }) => (
          <div data-testid="custom-fallback">Custom: {error.message}</div>
        )}
      >
        <Bomb message="hello-fallback" />
      </ErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="custom-fallback"]')?.textContent)
      .toBe("Custom: hello-fallback");
  });

  it("calls the onClose handler when the Close action is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <ErrorBoundary scope="overlay" onClose={onClose}>
        <Bomb message="close-me" />
      </ErrorBoundary>,
    );

    const closeButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="error-boundary-close"]',
    );
    expect(closeButton).not.toBeNull();
    act(() => {
      closeButton!.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });
});

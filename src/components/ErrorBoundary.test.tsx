// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { logEvent, resetLog, getLogEntries } from "../logging";
import { renderInCumulus } from "../cumulus/testing/render";

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

beforeEach(() => {
  vi.clearAllMocks();
  resetLog();
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
  it("renders children unchanged when no error is thrown", () => {
    const { container } = renderInCumulus(
      <ErrorBoundary scope="test-scope">
        <div data-testid="happy-path">All good</div>
      </ErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="happy-path"]')?.textContent)
      .toBe("All good");
  });

  it("catches a render-time error from a child and shows the fallback UI", () => {
    const { container } = renderInCumulus(
      <ErrorBoundary scope="overlay">
        <Bomb message="kaboom" />
      </ErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="error-boundary-fallback"]'))
      .not.toBeNull();
  });

  it("logs the caught error through logEvent so it lands in journey-log.jsonl", () => {
    renderInCumulus(
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
    renderInCumulus(
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
    const { container } = renderInCumulus(
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
  });

  it("offers cold shared-room recovery from the contained fallback", () => {
    const onRecover = vi.fn();
    const { container } = renderInCumulus(
      <ErrorBoundary scope="screen" onRecover={onRecover}>
        <Bomb message="recover-me" />
      </ErrorBoundary>,
    );
    const recoverButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="error-boundary-recover"]',
    );
    expect(recoverButton).not.toBeNull();
    act(() => recoverButton!.click());
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("resets back to children when resetKey changes", () => {
    let shouldThrow = true;
    function ConditionallyBomb(): ReactElement {
      if (shouldThrow) {
        throw new Error("conditional-boom");
      }
      return <div data-testid="recovered">Recovered</div>;
    }

    const { container, rerender } = renderInCumulus(
      <ErrorBoundary scope="per-screen" resetKey="key-A">
        <ConditionallyBomb />
      </ErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="error-boundary-fallback"]'))
      .not.toBeNull();

    // Stop throwing, change the reset key — boundary should clear state
    // and re-render the children.
    shouldThrow = false;
    rerender(
      <ErrorBoundary scope="per-screen" resetKey="key-B">
        <ConditionallyBomb />
      </ErrorBoundary>
    );

    expect(container.querySelector('[data-testid="recovered"]')?.textContent)
      .toBe("Recovered");
  });

  it("supports a custom fallback render prop", () => {
    const { container } = renderInCumulus(
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
    const { container } = renderInCumulus(
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
  });
});

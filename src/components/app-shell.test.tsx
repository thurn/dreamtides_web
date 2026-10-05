// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { FrontDoorRouter } from "./FrontDoorRouter";
import { getLogEntries, logEvent, resetLog } from "../logging";
import { renderInCumulus } from "../cumulus/testing/render";
import { parseJourneyId, type JourneyId } from "../types/identifiers";

vi.mock("../logging", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../logging")>();
  return { ...actual, logEvent: vi.fn(actual.logEvent) };
});

const stateMocks = vi.hoisted<{
  frontDoor: {
    phase: "main" | "mainExiting" | "loading" | "tutorial" | "journey";
    journeyId: JourneyId | null;
  };
  battle?: { mode?: { kind: "tutorial" | "journey" } } | null;
}>(() => ({ frontDoor: { phase: "main", journeyId: null } }));
const adapterMocks = vi.hoisted(() => ({
  mainSpeed: null as number | null,
  loadingSpeed: null as number | null,
  tutorialSpeed: null as number | null,
  tutorialDirectLive: null as boolean | null,
  tutorialVictoryPreview: null as boolean | null,
}));

vi.mock("../state/front-door-context", () => ({
  useFrontDoor: () => ({ state: stateMocks.frontDoor, battle: stateMocks.battle }),
}));
vi.mock("../screens/cumulus_adapters/MainMenuScreenAdapter", () => ({
  MainMenuScreenAdapter: ({ playbackSpeed }: { playbackSpeed: number }) => {
    adapterMocks.mainSpeed = playbackSpeed;
    return <main data-main-menu />;
  },
}));
vi.mock("../screens/cumulus_adapters/LoadingScreenAdapter", () => ({
  LoadingScreenAdapter: ({ playbackSpeed }: { playbackSpeed: number }) => {
    adapterMocks.loadingSpeed = playbackSpeed;
    return <main data-loading-screen />;
  },
}));
vi.mock("../screens/cumulus_adapters/TutorialScreenAdapter", () => ({
  TutorialScreenAdapter: ({
    playbackSpeed,
    directLive,
  }: {
    playbackSpeed: number;
    directLive?: boolean;
  }) => {
    adapterMocks.tutorialSpeed = playbackSpeed;
    adapterMocks.tutorialDirectLive = directLive ?? false;
    return <main data-tutorial-screen />;
  },
}));
vi.mock("../screens/cumulus_adapters/TutorialBattleScreenAdapter", () => ({
  TutorialBattleScreenAdapter: ({ previewVictory }: { previewVictory?: boolean }) => {
    adapterMocks.tutorialVictoryPreview = previewVictory ?? false;
    return <main data-tutorial-live-battle />;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  /** Component that intentionally throws on render. */
  function Bomb({ message }: { message: string }): ReactElement {
    throw new Error(message);
  }

  type Caps = { errors: Array<{ msg: string }>; rejections: unknown[]; consoleErrors: unknown[] };
  const caps = () => (window as typeof window & { __caps?: Caps }).__caps;

  beforeEach(() => {
    vi.clearAllMocks();
    resetLog();
    // Silence React's logging of the intentional throws; the boundary still
    // records each failure through logEvent and window.__caps.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    (window as typeof window & { __caps?: Caps }).__caps = {
      errors: [],
      rejections: [],
      consoleErrors: [],
    };
  });

  it("renders children unchanged when no error is thrown", () => {
    const { container } = renderInCumulus(
      <ErrorBoundary scope="test-scope">
        <div data-testid="happy-path" />
      </ErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="happy-path"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).toBeNull();
  });

  it("shows the fallback, logs the error, and surfaces it on window.__caps", () => {
    const { container } = renderInCumulus(
      <ErrorBoundary scope="screen">
        <Bomb message="boom-in-screen" />
      </ErrorBoundary>,
    );

    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).not.toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      "error_boundary_caught",
      expect.objectContaining({ scope: "screen", message: "boom-in-screen" }),
    );
    expect(getLogEntries().some((entry) => entry.event === "error_boundary_caught")).toBe(true);
    expect(caps()?.errors.some((error) => error.msg.includes("boom-in-screen"))).toBe(true);
  });

  it.each([
    { prop: "onRetry", testId: "error-boundary-retry" },
    { prop: "onRecover", testId: "error-boundary-recover" },
    { prop: "onClose", testId: "error-boundary-close" },
  ] as const)("calls $prop from its fallback action", ({ prop, testId }) => {
    const handler = vi.fn();
    const { container } = renderInCumulus(
      <ErrorBoundary scope="overlay" {...{ [prop]: handler }}>
        <Bomb message="action" />
      </ErrorBoundary>,
    );
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    expect(button).not.toBeNull();
    act(() => button?.click());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("resets back to children when resetKey changes", () => {
    let shouldThrow = true;
    function ConditionallyBomb(): ReactElement {
      if (shouldThrow) throw new Error("conditional-boom");
      return <div data-testid="recovered" />;
    }
    const { container, rerender } = renderInCumulus(
      <ErrorBoundary scope="per-screen" resetKey="key-A">
        <ConditionallyBomb />
      </ErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).not.toBeNull();

    shouldThrow = false;
    rerender(
      <ErrorBoundary scope="per-screen" resetKey="key-B">
        <ConditionallyBomb />
      </ErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="recovered"]')).not.toBeNull();
  });

  it("supports a custom fallback render prop", () => {
    const { container } = renderInCumulus(
      <ErrorBoundary
        scope="custom"
        fallback={({ error }: { error: Error }) => (
          <div data-testid="custom-fallback" data-message={error.message} />
        )}
      >
        <Bomb message="hello-fallback" />
      </ErrorBoundary>,
    );
    expect(
      container.querySelector('[data-testid="custom-fallback"]')?.getAttribute("data-message"),
    ).toBe("hello-fallback");
  });
});

describe("FrontDoorRouter", () => {
  const AVATARS = [] as const;
  const journeyId = parseJourneyId("event:1");

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    window.history.replaceState(null, "", "/main?game=room42#shared");
    stateMocks.frontDoor = { phase: "main", journeyId: null };
    stateMocks.battle = null;
    for (const key of Object.keys(adapterMocks) as Array<keyof typeof adapterMocks>) {
      adapterMocks[key] = null;
    }
  });

  it("renders and reflects the room's shared scene while preserving its room URL", () => {
    const router = (journey?: ReactElement) => (
      <FrontDoorRouter avatars={AVATARS} tutorialPlaybackSpeed={4} journey={journey} />
    );
    const { container, rerender } = renderInCumulus(router());
    expect(container.querySelector("[data-main-menu]")).not.toBeNull();
    expect(adapterMocks.mainSpeed).toBe(4);

    stateMocks.frontDoor = { phase: "loading", journeyId };
    rerender(router());
    expect(container.querySelector("[data-loading-screen]")).not.toBeNull();
    expect(adapterMocks.loadingSpeed).toBe(4);
    expect(window.location.pathname).toBe("/loading");
    expect(window.location.search).toBe("?game=room42");
    expect(window.location.hash).toBe("#shared");

    stateMocks.frontDoor = { phase: "tutorial", journeyId };
    rerender(router());
    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(adapterMocks.tutorialSpeed).toBe(4);
    expect(window.location.pathname).toBe("/tutorial");

    stateMocks.battle = { mode: { kind: "tutorial" } };
    rerender(router());
    expect(container.querySelector("[data-tutorial-live-battle]")).not.toBeNull();

    stateMocks.frontDoor = { phase: "journey", journeyId };
    rerender(router(<main data-journey-screen />));
    expect(container.querySelector("[data-journey-screen]")).not.toBeNull();
  });

  it("passes the direct tutorial-battle route flag only to the authored tutorial adapter", () => {
    stateMocks.frontDoor = { phase: "tutorial", journeyId };
    const { container } = renderInCumulus(
      <FrontDoorRouter avatars={AVATARS} directTutorialBattle />,
    );
    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(adapterMocks.tutorialDirectLive).toBe(true);
  });

  it("starts the live tutorial handoff and previews victory for its direct route", () => {
    stateMocks.frontDoor = { phase: "tutorial", journeyId };
    const router = () => <FrontDoorRouter avatars={AVATARS} previewTutorialVictory />;
    const { rerender } = renderInCumulus(router());
    expect(adapterMocks.tutorialDirectLive).toBe(true);

    stateMocks.battle = { mode: { kind: "tutorial" } };
    rerender(router());
    expect(adapterMocks.tutorialVictoryPreview).toBe(true);
  });
});

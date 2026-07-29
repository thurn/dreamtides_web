// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoldState } from "../rules/fold-state";

const mocks = vi.hoisted(() => ({
  clientId: "viewer",
  connectedClientIds: ["controller", "viewer"] as readonly string[] | null,
  takeControl: vi.fn(() => Promise.resolve(1)),
  state: null as FoldState | null,
}));

vi.mock("./hooks", () => ({
  useActions: () => ({ takePlaytestControl: mocks.takeControl }),
  useClientId: () => mocks.clientId,
  useConnectedClientIds: () => mocks.connectedClientIds,
  useGameState: () => mocks.state,
}));

vi.mock("../cumulus/components/overlay/GlassPanel", () => ({
  GlassPanel: ({
    title,
    children,
    footer,
  }: {
    title?: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <aside>
      <h2>{title}</h2>
      {children}
      {footer}
    </aside>
  ),
}));

vi.mock("../cumulus/components/controls/GlassButton", () => ({
  GlassButton: ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => <button onClick={onPress}>{label}</button>,
}));

const { HostedPlaytestShell } = await import("./HostedPlaytestShell");

function state(controllerClientId: string | null): FoldState {
  return {
    frontDoor: {
      phase: "journey",
      journeyId: null,
      tutorial: null,
    },
    playtestControl: {
      mode: "single-controller",
      controllerClientId,
    },
    journey: {} as FoldState["journey"],
    battle: null,
  };
}

function unclaimedTutorialState(): FoldState {
  return {
    ...state(null),
    frontDoor: {
      phase: "tutorial",
      journeyId: null,
      tutorial: null,
    },
  };
}

describe("HostedPlaytestShell", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.clientId = "viewer";
    mocks.connectedClientIds = ["controller", "viewer"];
    mocks.takeControl.mockClear();
    mocks.state = state("controller");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders shared observer content inert while the controller is present", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <HostedPlaytestShell>
          <button data-player-action>Play</button>
        </HostedPlaytestShell>,
      );
    });

    expect(container.querySelector("[inert]")).not.toBeNull();
    expect(container.textContent).toContain("Watching");
    expect(container.textContent).not.toContain("Take Control");
    act(() => root.unmount());
  });

  it("offers explicit takeover only after the controller is absent", () => {
    mocks.connectedClientIds = ["viewer"];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <HostedPlaytestShell>
          <div>Shared Battle</div>
        </HostedPlaytestShell>,
      );
    });

    const takeControl = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Take Control",
    );
    expect(container.textContent).toContain("Player Disconnected");
    act(() => takeControl?.click());
    expect(mocks.takeControl).toHaveBeenCalledWith("controller");
    act(() => root.unmount());
  });

  it("keeps an unclaimed tutorial interactive without disconnected chrome", () => {
    mocks.state = unclaimedTutorialState();
    mocks.connectedClientIds = ["viewer"];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <HostedPlaytestShell>
          <button data-player-action>Play</button>
        </HostedPlaytestShell>,
      );
    });

    expect(container.querySelector("[inert]")).toBeNull();
    expect(container.textContent).toBe("Play");
    expect(mocks.takeControl).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("leaves the controller content interactive without observer chrome", () => {
    mocks.clientId = "controller";
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <HostedPlaytestShell>
          <button data-player-action>Play</button>
        </HostedPlaytestShell>,
      );
    });

    expect(container.querySelector("[inert]")).toBeNull();
    expect(container.textContent).toBe("Play");
    act(() => root.unmount());
  });
});

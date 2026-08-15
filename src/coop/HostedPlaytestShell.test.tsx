// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import type { LocalizedString } from "@trox/runtime";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoldState } from "../rules/fold-state";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { useLocalizer } from "../runtime/localization/use-localizer";
import { parseClientId } from "../types/identifiers";
import type { ClientId } from "../types/identifiers";

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
    title?: LocalizedString;
    children: ReactNode;
    footer?: ReactNode;
  }) => {
    const resolve = useLocalizer();
    return (
      <aside>
        <h2>{title === undefined ? null : resolve(title)}</h2>
        {children}
        {footer}
      </aside>
    );
  },
}));

vi.mock("../cumulus/components/controls/GlassButton", () => ({
  GlassButton: ({
    label,
    onPress,
  }: {
    label: LocalizedString;
    onPress: () => void;
  }) => {
    const resolve = useLocalizer();
    return <button onClick={onPress}>{resolve(label)}</button>;
  },
}));

const { HostedPlaytestShell: RealHostedPlaytestShell } =
  await import("./HostedPlaytestShell");

function HostedPlaytestShell(
  props: ComponentProps<typeof RealHostedPlaytestShell>,
) {
  return (
    <CumulusRoot>
      <RealHostedPlaytestShell {...props} />
    </CumulusRoot>
  );
}

function state(controllerClientId: ClientId | null): FoldState {
  return {
    frontDoor: {
      phase: "journey",
      journeyId: null,
      tutorial: null,
    },
    playtestControl: {
      mode: "single-controller",
      controllerClientId:
        controllerClientId === null ? null : parseClientId(controllerClientId),
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

function unclaimedTutorialBattleState(): FoldState {
  return {
    ...unclaimedTutorialState(),
    battle: {} as FoldState["battle"],
  };
}

function collaborativeJourneyState(): FoldState {
  return {
    ...state(null),
    playtestControl: {
      mode: "collaborative",
      controllerClientId: null,
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
    mocks.state = state(parseClientId("controller"));
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders shared observer content inert without extra chrome", () => {
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
    expect(container.textContent).toBe("Play");
    expect(container.textContent).not.toContain("Player Disconnected");
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

  it("claims an unowned direct tutorial battle for the current client", () => {
    mocks.state = unclaimedTutorialBattleState();
    mocks.connectedClientIds = ["viewer"];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <HostedPlaytestShell claimUnownedBattle>
          <button data-player-action>Play</button>
        </HostedPlaytestShell>,
      );
    });

    expect(mocks.takeControl).toHaveBeenCalledOnce();
    expect(mocks.takeControl).toHaveBeenCalledWith(null);
    expect(container.querySelector("[inert]")).toBeNull();
    expect(container.textContent).toBe("Play");
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

  it("leaves every client interactive after the tutorial journey becomes collaborative", () => {
    mocks.state = collaborativeJourneyState();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <HostedPlaytestShell>
          <button data-player-action>Control Opponent</button>
        </HostedPlaytestShell>,
      );
    });

    expect(container.querySelector("[inert]")).toBeNull();
    expect(container.textContent).toBe("Control Opponent");
    expect(container.textContent).not.toContain("Take Control");
    act(() => root.unmount());
  });
});

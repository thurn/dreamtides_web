// @vitest-environment jsdom

import {
  act,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorialAction } from "../../types/tutorial";
import { CumulusRoot } from "../CumulusRoot";
import { TutorialEditorRail } from "./TutorialEditorRail";

vi.mock("framer-motion", () => ({
  motion: {
    span: () => <span role="status" />,
  },
  Reorder: {
    Group: ({ children }: { readonly children?: ReactNode }) => <ol>{children}</ol>,
    Item: ({ children }: { readonly children?: ReactNode }) => <li>{children}</li>,
  },
  useDragControls: () => ({ start: vi.fn() }),
}));

const INITIAL_ACTIONS: readonly TutorialAction[] = [
  {
    id: "welcome",
    action: "display-speech-bubble",
    text: "Welcome, Dreamer.",
    wait: 3,
  },
];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function EditorHarness({
  onChange,
}: {
  readonly onChange: (actions: readonly TutorialAction[], persist: boolean) => void;
}): ReactElement {
  const [actions, setActions] = useState(INITIAL_ACTIONS);
  return (
    <CumulusRoot>
      <TutorialEditorRail
        actions={actions}
        saveStatus="idle"
        saveError={null}
        onActionsChange={(next, persist) => {
          onChange(next, persist);
          setActions(next);
        }}
        onReplay={vi.fn()}
        onClose={vi.fn()}
      />
    </CumulusRoot>
  );
}

describe("TutorialEditorRail", () => {
  it("adds the first action type and persists structural edits", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const addTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add an action"]',
    );
    expect(addTrigger?.textContent).toContain("Add an Action");
    act(() => addTrigger?.click());
    const addOption = document.body.querySelector<HTMLButtonElement>(
      'button[role="option"]',
    );
    expect(addOption?.textContent).toContain("Display Speech Bubble");
    act(() => addOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "display-speech-bubble",
          action: "display-speech-bubble",
          text: "New tutorial message.",
          wait: 3,
        },
      ],
      true,
    );
    expect(
      container.querySelectorAll('[data-testid^="tutorial-action-text-"]'),
    ).toHaveLength(2);

    act(() => root.unmount());
    container.remove();
  });

  it("adds the fixed Dreamcaller portrait animation without speech parameters", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const addTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add an action"]',
    );
    act(() => addTrigger?.click());
    const animationOption = [...document.body.querySelectorAll<HTMLButtonElement>(
      'button[role="option"]',
    )].find((option) =>
      option.textContent?.includes("Animate Dreamcaller Portrait"),
    );
    expect(animationOption).toBeDefined();
    act(() => animationOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "animate-dreamcaller-portrait",
          action: "animate-dreamcaller-portrait",
          owner: "player",
          pause: 1,
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelectorAll('[data-testid^="tutorial-action-text-"]'),
    ).toHaveLength(1);

    const ownerTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dreamcaller owner for action 2"]',
    );
    expect(ownerTrigger?.textContent).toContain("Player");
    act(() => ownerTrigger?.click());
    const opponentOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>('button[role="option"]'),
    ].find((option) => option.textContent?.includes("Opponent"));
    act(() => opponentOption?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "animate-dreamcaller-portrait",
          action: "animate-dreamcaller-portrait",
          owner: "enemy",
          pause: 1,
          wait: 0,
        },
      ],
      true,
    );

    const increasePause = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase large portrait pause for action 2"]',
    );
    act(() => increasePause?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "animate-dreamcaller-portrait",
          action: "animate-dreamcaller-portrait",
          owner: "enemy",
          pause: 1.5,
          wait: 0,
        },
      ],
      true,
    );

    act(() => root.unmount());
    container.remove();
  });

  it("keeps the bottom-left save icon absent while idle", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={vi.fn()} />));

    expect(container.querySelector('[role="status"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});

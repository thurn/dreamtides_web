// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode, useState } from "react";
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
    Group: ({ children }: { readonly children?: ReactNode }) => (
      <ol>{children}</ol>
    ),
    Item: ({ children }: { readonly children?: ReactNode }) => (
      <li>{children}</li>
    ),
  },
  useDragControls: () => ({ start: vi.fn() }),
}));

const INITIAL_ACTIONS: readonly TutorialAction[] = [
  {
    id: "welcome",
    action: "display-speech-bubble",
    speaker: "mira",
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
  readonly onChange: (
    actions: readonly TutorialAction[],
    persist: boolean,
  ) => void;
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
        onPlayFromAction={vi.fn()}
        onClose={vi.fn()}
      />
    </CumulusRoot>
  );
}

describe("TutorialEditorRail", () => {
  it("replays the whole sequence, its last four actions, or one selected action", () => {
    const actions: readonly TutorialAction[] = [
      INITIAL_ACTIONS[0],
      {
        id: "second",
        action: "display-speech-bubble",
        text: "Second.",
        wait: 1,
      },
      {
        id: "third",
        action: "draw-opponent-card",
        wait: 0,
      },
      {
        id: "fourth",
        action: "reveal-and-play-opponent-card",
        revealDuration: 2,
        wait: 0,
      },
    ];
    const onReplay = vi.fn();
    const onPlayFromAction = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() =>
      root.render(
        <CumulusRoot>
          <TutorialEditorRail
            actions={actions}
            saveStatus="idle"
            saveError={null}
            onActionsChange={vi.fn()}
            onReplay={onReplay}
            onPlayFromAction={onPlayFromAction}
            onClose={vi.fn()}
          />
        </CumulusRoot>,
      ),
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tutorial-editor-replay-all"]',
        )
        ?.click(),
    );
    expect(onReplay).toHaveBeenCalledOnce();

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tutorial-editor-replay-tail"]',
        )
        ?.click(),
    );
    expect(onPlayFromAction).toHaveBeenLastCalledWith("welcome");

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tutorial-action-play-fourth"]',
        )
        ?.click(),
    );
    expect(onPlayFromAction).toHaveBeenLastCalledWith("fourth");

    act(() => root.unmount());
    container.remove();
  });

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
          speaker: "mira",
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

  it("authors How to Play copy as a tutorial action", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add an action"]')
        ?.click(),
    );
    const messageOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) => option.textContent?.includes("Display How to Play"));
    act(() => messageOption?.click());

    const expectedText =
      "Play characters and challenge with them to score points (⍟) equal to their spark (✦).\n\nScore 10 ⍟ to win this dream battle.";
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "display-how-to-play",
          action: "display-how-to-play",
          trigger: "immediate",
          text: expectedText,
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelector<HTMLTextAreaElement>(
        '[data-testid="tutorial-action-text-display-how-to-play"]',
      )?.value,
    ).toBe(expectedText);

    act(() => root.unmount());
    container.remove();
  });

  it("authors speech against the opposing Dreamcaller portrait", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const speakerTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Speech bubble speaker for action 1"]',
    );
    expect(speakerTrigger?.textContent).toContain("Mira");
    act(() => speakerTrigger?.click());
    const opponentOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) => option.textContent?.includes("Opposing Dreamcaller"));
    act(() => opponentOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          ...INITIAL_ACTIONS[0],
          speaker: "enemy",
        },
      ],
      true,
    );

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
    const animationOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) =>
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
          duration: 0.6,
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
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
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
          duration: 0.6,
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
          duration: 0.6,
          wait: 0,
        },
      ],
      true,
    );

    const decreaseDuration = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Decrease scale and travel duration for action 2"]',
    );
    act(() => decreaseDuration?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "animate-dreamcaller-portrait",
          action: "animate-dreamcaller-portrait",
          owner: "enemy",
          pause: 1.5,
          duration: 0.5,
          wait: 0,
        },
      ],
      true,
    );

    act(() => root.unmount());
    container.remove();
  });

  it("adds an opponent card draw with no unrelated parameters", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const addTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add an action"]',
    );
    act(() => addTrigger?.click());
    const drawOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) => option.textContent?.includes("Draw Opponent Card"));
    expect(drawOption).toBeDefined();
    act(() => drawOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "draw-opponent-card",
          action: "draw-opponent-card",
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelectorAll('[data-testid^="tutorial-action-text-"]'),
    ).toHaveLength(1);

    act(() => root.unmount());
    container.remove();
  });

  it("adds the end-turn interaction as an authored action", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add an action"]')
        ?.click(),
    );
    const endTurnOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) => option.textContent?.trim() === "End Turn");
    expect(endTurnOption).toBeDefined();
    act(() => endTurnOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "end-turn",
          action: "end-turn",
          wait: 0,
        },
      ],
      true,
    );

    act(() => root.unmount());
    container.remove();
  });

  it("authors a UUID-backed opponent Dreamwell draw", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add an action"]')
        ?.click(),
    );
    const dreamwellOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) => option.textContent?.trim() === "Draw Dreamwell Card");
    expect(dreamwellOption).toBeDefined();
    act(() => dreamwellOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "draw-dreamwell-card",
          action: "draw-dreamwell-card",
          owner: "enemy",
          cardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="tutorial-action-card-id-draw-dreamwell-card"]',
      )?.value,
    ).toBe("02e8ea92-1218-413c-9f0b-4c865a3921d3");

    act(() => root.unmount());
    container.remove();
  });

  it("authors the face-up reading time for an opponent card play", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add an action"]')
        ?.click(),
    );
    const playOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) => option.textContent?.includes("Reveal"));
    expect(playOption).toBeDefined();
    act(() => playOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "reveal-and-play-opponent-card",
          action: "reveal-and-play-opponent-card",
          revealDuration: 2,
          wait: 0,
        },
      ],
      true,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Increase face-up reading time for action 2"]',
        )
        ?.click(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "reveal-and-play-opponent-card",
          action: "reveal-and-play-opponent-card",
          revealDuration: 2.5,
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

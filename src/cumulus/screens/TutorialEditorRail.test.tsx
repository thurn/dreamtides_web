// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TutorialAction,
  TutorialSpeechBubble,
} from "../../types/tutorial";
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

const INITIAL_SPEECH_BUBBLE: TutorialSpeechBubble = {
  speaker: "mira",
  duration: 3,
  verticalOffset: 0,
  bubbleWidth: 700,
  text: "Welcome, Dreamer.",
};

const INITIAL_ACTIONS: readonly TutorialAction[] = [
  {
    id: "welcome",
    action: "display-speech-bubble",
    speechBubble: INITIAL_SPEECH_BUBBLE,
    wait: 3,
  },
];

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  const valueSetter =
    descriptor === undefined
      ? undefined
      : (Reflect.get(descriptor, "set") as
          ((this: HTMLTextAreaElement, value: string) => void) | undefined);
  valueSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

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
        speechBubble: {
          speaker: "mira",
          duration: 1,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Second.",
        },
        wait: 1,
      },
      {
        id: "third",
        action: "draw-opponent-card",
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        wait: 0,
      },
      {
        id: "fourth",
        action: "reveal-and-play-opponent-card",
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
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
          speechBubble: {
            speaker: "mira",
            duration: 3,
            verticalOffset: 0,
            bubbleWidth: 700,
            text: "New tutorial message.",
          },
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelectorAll(
        '[data-testid^="tutorial-action-speech-bubble-text-"]',
      ),
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
      "Play characters and [yellow]challenge[/yellow] with them to score points (⍟) equal to their spark (✦).\n\nScore 10 ⍟ to win this dream battle.";
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "display-how-to-play",
          action: "display-how-to-play",
          trigger: "immediate",
          cardWidth: 500,
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

    const companionTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="How to Play companion for action 2"]',
    );
    expect(companionTrigger?.textContent).toContain("No Companion");
    act(() => companionTrigger?.click());
    const dreamwellCompanionOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find((option) => option.textContent?.includes("Current Dreamwell Card"));
    act(() => dreamwellCompanionOption?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "display-how-to-play",
          action: "display-how-to-play",
          trigger: "immediate",
          companion: "dreamwell-card",
          cardWidth: 500,
          text: expectedText,
          wait: 0,
        },
      ],
      true,
    );

    const widenCard = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Widen How to Play card for action 2"]',
    );
    expect(container.textContent).toContain("500px");
    act(() => widenCard?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "display-how-to-play",
          action: "display-how-to-play",
          trigger: "immediate",
          companion: "dreamwell-card",
          cardWidth: 550,
          text: expectedText,
          wait: 0,
        },
      ],
      true,
    );
    expect(container.textContent).toContain("550px");

    act(() => root.unmount());
    container.remove();
  });

  it("authors optional Mira dialogue on the End Turn action", () => {
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
    act(() => endTurnOption?.click());
    const addBubble = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Add Speech Bubble");
    act(() => addBubble?.click());

    const speech = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="tutorial-action-speech-bubble-text-end-turn"]',
    );
    expect(speech).not.toBeNull();
    act(() => {
      if (speech === null) return;
      setTextareaValue(
        speech,
        "Good, you have now [yellow]materialized[/yellow] this character.",
      );
    });
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "end-turn",
          action: "end-turn",
          speechBubble: {
            speaker: "mira",
            duration: 3,
            verticalOffset: 0,
            bubbleWidth: 700,
            text: "Good, you have now [yellow]materialized[/yellow] this character.",
          },
          wait: 0,
        },
      ],
      false,
    );

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
          speechBubble: {
            ...INITIAL_SPEECH_BUBBLE,
            speaker: "enemy",
          },
        },
      ],
      true,
    );

    act(() => root.unmount());
    container.remove();
  });

  it("authors a signed vertical offset for Mira speech", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const moveDown = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Move speech bubble down for action 1"]',
    );
    expect(moveDown).not.toBeNull();
    expect(container.textContent).toContain("0px");
    act(() => moveDown?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          ...INITIAL_ACTIONS[0],
          speechBubble: {
            ...INITIAL_SPEECH_BUBBLE,
            verticalOffset: 10,
          },
        },
      ],
      true,
    );
    expect(container.textContent).toContain("10px");

    act(() => root.unmount());
    container.remove();
  });

  it("authors the desktop speech bubble width", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const narrowBubble = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Narrow speech bubble for action 1"]',
    );
    expect(container.textContent).toContain("700px");
    act(() => narrowBubble?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          ...INITIAL_ACTIONS[0],
          speechBubble: {
            ...INITIAL_SPEECH_BUBBLE,
            bubbleWidth: 650,
          },
        },
      ],
      true,
    );
    expect(container.textContent).toContain("650px");

    act(() => root.unmount());
    container.remove();
  });

  it("authors speech bubble visibility duration", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const increaseDuration = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase speech bubble duration for action 1"]',
    );
    expect(container.textContent).toContain("3s");
    act(() => increaseDuration?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          ...INITIAL_ACTIONS[0],
          speechBubble: {
            ...INITIAL_SPEECH_BUBBLE,
            duration: 3.5,
          },
        },
      ],
      true,
    );
    expect(container.textContent).toContain("3.5s");

    act(() => root.unmount());
    container.remove();
  });

  it("shows the same speech bubble controls on every supporting action", () => {
    const actions: readonly TutorialAction[] = [
      INITIAL_ACTIONS[0],
      {
        id: "reveal",
        action: "reveal-and-play-opponent-card",
        cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
        revealDuration: 2,
        speechBubble: INITIAL_SPEECH_BUBBLE,
        wait: 0,
      },
      {
        id: "end-turn",
        action: "end-turn",
        speechBubble: INITIAL_SPEECH_BUBBLE,
        wait: 0,
      },
    ];
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
            onReplay={vi.fn()}
            onPlayFromAction={vi.fn()}
            onClose={vi.fn()}
          />
        </CumulusRoot>,
      ),
    );

    const editors = [
      ...container.querySelectorAll("[data-tutorial-speech-bubble-editor]"),
    ];
    expect(editors).toHaveLength(3);
    for (const editor of editors) {
      expect(editor.textContent).toContain("Speech Bubble Text");
      expect(editor.textContent).toContain("Visible Duration");
      expect(editor.textContent).toContain("Bubble Width");
      expect(editor.textContent).toContain("Vertical Offset");
    }

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
      container.querySelectorAll(
        '[data-testid^="tutorial-action-speech-bubble-text-"]',
      ),
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
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelectorAll(
        '[data-testid^="tutorial-action-speech-bubble-text-"]',
      ),
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

  it("authors a UUID-backed opponent character reposition", () => {
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
    const repositionOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find(
      (option) =>
        option.textContent?.trim() === "Reposition Opponent Character",
    );
    expect(repositionOption).toBeDefined();
    act(() => repositionOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "reposition-opponent-character",
          action: "reposition-opponent-character",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="tutorial-action-card-id-reposition-opponent-character"]',
      )?.value,
    ).toBe("229ab3a1-3720-41a2-924c-8fe112188f8e");

    act(() => root.unmount());
    container.remove();
  });

  it("authors the UUID-backed player and opponent for a guided block", () => {
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
    const repositionOption = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    ].find(
      (option) =>
        option.textContent?.trim() === "Reposition Player Character",
    );
    expect(repositionOption).toBeDefined();
    act(() => repositionOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "reposition-player-character",
          action: "reposition-player-character",
          cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
          opposingCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="tutorial-action-card-id-reposition-player-character"]',
      )?.value,
    ).toBe("e83014d3-9d35-4e80-a1b3-9b25360ad2af");
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="tutorial-action-opposing-card-id-reposition-player-character"]',
      )?.value,
    ).toBe("229ab3a1-3720-41a2-924c-8fe112188f8e");

    act(() => root.unmount());
    container.remove();
  });

  it("authors Mira reveal speech layout and face-up reading time", () => {
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
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          revealDuration: 2,
          wait: 0,
        },
      ],
      true,
    );

    const addBubble = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Add Speech Bubble");
    act(() => addBubble?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "reveal-and-play-opponent-card",
          action: "reveal-and-play-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          revealDuration: 2,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            verticalOffset: 0,
            bubbleWidth: 700,
            text: "New tutorial message.",
          },
          wait: 0,
        },
      ],
      true,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Narrow speech bubble for action 2"]',
        )
        ?.click(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "reveal-and-play-opponent-card",
          action: "reveal-and-play-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          revealDuration: 2,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            verticalOffset: 0,
            bubbleWidth: 650,
            text: "New tutorial message.",
          },
          wait: 0,
        },
      ],
      true,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Move speech bubble down for action 2"]',
        )
        ?.click(),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: "reveal-and-play-opponent-card",
          action: "reveal-and-play-opponent-card",
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          revealDuration: 2,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            verticalOffset: 10,
            bubbleWidth: 650,
            text: "New tutorial message.",
          },
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
          cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          revealDuration: 2.5,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            verticalOffset: 10,
            bubbleWidth: 650,
            text: "New tutorial message.",
          },
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

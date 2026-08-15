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
import { testTutorialActionId, testCardId, testDreamwellCardId } from "../../types/test-identities";

const NEW_ACTION_ID = "11111111-1111-4111-8111-111111111111";

const TEST_TUTORIAL_CARD_CONSTANTS = {
  tutorialPlayerCharacterCardId: testCardId(
    "11111111-1111-4111-8111-111111111111",
  ),
  tutorialOpponentCharacterCardId: testCardId(
    "22222222-2222-4222-8222-222222222222",
  ),
  loadingScreenCharacterCardId: testCardId(
    "66666666-6666-4666-8666-666666666666",
  ),
  loadingScreenEventCardId: testCardId("44444444-4444-4444-8444-444444444444"),
  handoffEnemyCharacterCardId: testCardId("33333333-3333-4333-8333-333333333333"),
  tutorialDreamwellCardId: testDreamwellCardId(
    "55555555-5555-4555-8555-555555555555",
  ),
} as const;

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
  horizontalOffset: 0,
  verticalOffset: 0,
  bubbleWidth: 700,
  text: "Welcome, Dreamer.",
};

const INITIAL_ACTIONS: readonly TutorialAction[] = [
  {
    id: testTutorialActionId("welcome"),
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
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(NEW_ACTION_ID);
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
        tutorialCardConstants={TEST_TUTORIAL_CARD_CONSTANTS}
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
        id: testTutorialActionId("second"),
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "mira",
          duration: 1,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Second.",
        },
        wait: 1,
      },
      {
        id: testTutorialActionId("third"),
        action: "draw-opponent-card",
        cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
        wait: 0,
      },
      {
        id: testTutorialActionId("fourth"),
        action: "reveal-and-play-opponent-card",
        cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
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
            tutorialCardConstants={TEST_TUTORIAL_CARD_CONSTANTS}
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
    expect(onPlayFromAction).toHaveBeenLastCalledWith(
      testTutorialActionId("welcome"),
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          `[data-testid="tutorial-action-play-${testTutorialActionId("fourth")}"]`,
        )
        ?.click(),
    );
    expect(onPlayFromAction).toHaveBeenLastCalledWith(
      testTutorialActionId("fourth"),
    );

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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "display-speech-bubble",
          speechBubble: {
            speaker: "mira",
            duration: 3,
            horizontalOffset: 0,
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
      "Play characters and [yellow]challenge[/yellow] with them to score points (⍟) equal to their spark (✦).\n\nScore 10⍟ to win this dream battle.";
    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: testTutorialActionId(NEW_ACTION_ID),
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
        `[data-testid="tutorial-action-text-${NEW_ACTION_ID}"]`,
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
          id: testTutorialActionId(NEW_ACTION_ID),
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
          id: testTutorialActionId(NEW_ACTION_ID),
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
      `[data-testid="tutorial-action-speech-bubble-text-${NEW_ACTION_ID}"]`,
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "end-turn",
          speechBubble: {
            speaker: "mira",
            duration: 3,
            horizontalOffset: 0,
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

  it("authors speech against the opposing Avatar portrait", () => {
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
    ].find((option) => option.textContent?.includes("Opposing Avatar"));
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

  it("authors a signed horizontal offset for every speech bubble", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const moveRight = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Move speech bubble right for action 1"]',
    );
    expect(moveRight).not.toBeNull();
    act(() => moveRight?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          ...INITIAL_ACTIONS[0],
          speechBubble: {
            ...INITIAL_SPEECH_BUBBLE,
            horizontalOffset: 10,
          },
        },
      ],
      true,
    );

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

  it("authors speech bubble appearance delay", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<EditorHarness onChange={onChange} />));

    const increaseDelay = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase speech bubble delay for action 1"]',
    );
    act(() => increaseDelay?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          ...INITIAL_ACTIONS[0],
          speechBubble: {
            ...INITIAL_SPEECH_BUBBLE,
            delay: 0.5,
          },
        },
      ],
      true,
    );

    act(() => root.unmount());
    container.remove();
  });

  it("shows the same speech bubble controls on every supporting action", () => {
    const actions: readonly TutorialAction[] = [
      INITIAL_ACTIONS[0],
      {
        id: testTutorialActionId("reveal"),
        action: "reveal-and-play-opponent-card",
        cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
        revealDuration: 2,
        speechBubble: INITIAL_SPEECH_BUBBLE,
        wait: 0,
      },
      {
        id: testTutorialActionId("end-turn"),
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
            tutorialCardConstants={TEST_TUTORIAL_CARD_CONSTANTS}
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

  it("adds the fixed Avatar portrait animation without speech parameters", () => {
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
    ].find((option) => option.textContent?.includes("Animate Avatar Portrait"));
    expect(animationOption).toBeDefined();
    act(() => animationOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "animate-avatar-portrait",
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
      'button[aria-label="Avatar owner for action 2"]',
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "animate-avatar-portrait",
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "animate-avatar-portrait",
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "animate-avatar-portrait",
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "draw-opponent-card",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
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
          id: testTutorialActionId(NEW_ACTION_ID),
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "draw-dreamwell-card",
          owner: "enemy",
          cardId: testCardId(
            TEST_TUTORIAL_CARD_CONSTANTS.tutorialDreamwellCardId,
          ),
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelector<HTMLInputElement>(
        `[data-testid="tutorial-action-card-id-${NEW_ACTION_ID}"]`,
      )?.value,
    ).toBe(TEST_TUTORIAL_CARD_CONSTANTS.tutorialDreamwellCardId);

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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "reposition-opponent-character",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelector<HTMLInputElement>(
        `[data-testid="tutorial-action-card-id-${NEW_ACTION_ID}"]`,
      )?.value,
    ).toBe(TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId);

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
      (option) => option.textContent?.trim() === "Reposition Player Character",
    );
    expect(repositionOption).toBeDefined();
    act(() => repositionOption?.click());

    expect(onChange).toHaveBeenLastCalledWith(
      [
        INITIAL_ACTIONS[0],
        {
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "reposition-player-character",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialPlayerCharacterCardId,
          opposingCardId:
            TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
          wait: 0,
        },
      ],
      true,
    );
    expect(
      container.querySelector<HTMLInputElement>(
        `[data-testid="tutorial-action-card-id-${NEW_ACTION_ID}"]`,
      )?.value,
    ).toBe(TEST_TUTORIAL_CARD_CONSTANTS.tutorialPlayerCharacterCardId);
    expect(
      container.querySelector<HTMLInputElement>(
        `[data-testid="tutorial-action-opposing-card-id-${NEW_ACTION_ID}"]`,
      )?.value,
    ).toBe(TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId);

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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "reveal-and-play-opponent-card",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "reveal-and-play-opponent-card",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
          revealDuration: 2,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            horizontalOffset: 0,
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "reveal-and-play-opponent-card",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
          revealDuration: 2,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            horizontalOffset: 0,
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "reveal-and-play-opponent-card",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
          revealDuration: 2,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            horizontalOffset: 0,
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
          id: testTutorialActionId(NEW_ACTION_ID),
          action: "reveal-and-play-opponent-card",
          cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialOpponentCharacterCardId,
          revealDuration: 2.5,
          speechBubble: {
            speaker: "mira",
            duration: 3,
            horizontalOffset: 0,
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

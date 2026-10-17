// @vitest-environment jsdom
// The D97 quest panels: the dialogue panel shows Continue until the last line,
// then its choices (or Close for a bark), an offered quest's reward and the
// speaker's bust, and reports the chosen index; the quest log shows the held
// quest's giver and reward in its own D97 panel and reports Abandon.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseD97CharacterId,
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97QuestId,
} from "../../../types/identifiers";
import { renderInCumulus } from "../../testing/render";
import type { DomTestId } from "../../types/dom";
import { D97DialoguePanel, type D97DialogueView } from "./D97DialoguePanel";
import { D97QuestLogPanel, type D97QuestLogQuestView, type D97QuestLogView } from "./D97QuestLogPanel";

const QUEST = parseD97QuestId("00000005-0000-4000-8000-000000000001");

const DIALOGUE: D97DialogueView = {
  dialogueId: parseD97DialogueId("00000007-0000-4000-8000-000000000001"),
  nodeId: parseD97DialogueNodeId("00000006-0000-4000-8000-000000000001"),
  speakerName: "Speaker",
  portrait: null,
  characterId: null,
  portraitAlt: "Portrait",
  line: "Line",
  lineIndex: 0,
  lineCount: 2,
  choices: [
    { index: 0, label: "A" },
    { index: 2, label: "B" },
  ],
  reward: null,
  rewardLabel: "Reward",
  continueLabel: "Continue",
  closeLabel: "Close",
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function press(container: HTMLElement, testId: DomTestId): void {
  const target = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (target === null) throw new Error(`no ${testId}`);
  act(() => target.click());
}

describe("D97DialoguePanel", () => {
  it("shows Continue before the last line, then the choices", () => {
    const onContinue = vi.fn();
    const onChoose = vi.fn();
    const first = renderInCumulus(
      <D97DialoguePanel view={DIALOGUE} onContinue={onContinue} onChoose={onChoose} onClose={() => undefined} />,
    );
    expect(first.container.querySelector('[data-testid="d97-dialogue-choice-0"]')).toBeNull();
    press(first.container, "d97-dialogue-continue");
    expect(onContinue).toHaveBeenCalledTimes(1);
    first.unmount();

    const last = renderInCumulus(
      <D97DialoguePanel view={{ ...DIALOGUE, lineIndex: 1 }} onContinue={onContinue} onChoose={onChoose} onClose={() => undefined} />,
    );
    expect(last.container.querySelector('[data-testid="d97-dialogue-continue"]')).toBeNull();
    press(last.container, "d97-dialogue-choice-2");
    expect(onChoose).toHaveBeenCalledWith(2);
  });

  it("shows an offered quest's Essence reward with the choices, outside every choice", () => {
    const early = renderInCumulus(
      <D97DialoguePanel view={{ ...DIALOGUE, reward: { kind: "essence", amount: 75 } }} onContinue={() => undefined} onChoose={() => undefined} onClose={() => undefined} />,
    );
    expect(early.container.querySelector("[data-d97-dialogue-reward]")).toBeNull();
    early.unmount();
    const { container } = renderInCumulus(
      <D97DialoguePanel view={{ ...DIALOGUE, lineIndex: 1, reward: { kind: "essence", amount: 75 } }} onContinue={() => undefined} onChoose={() => undefined} onClose={() => undefined} />,
    );
    const reward = container.querySelector("[data-d97-dialogue-reward] [data-d97-reward-essence]");
    expect(reward?.getAttribute("data-d97-reward-essence")).toBe("75");
    expect(reward?.closest("button")).toBeNull();
    expect(container.querySelector("[data-d97-dialogue-choices] [data-essence-value]")).toBeNull();
  });

  it("points a resident's speech bubble at their bust", () => {
    const character = parseD97CharacterId("00000009-0000-4000-8000-000000000001");
    const { container } = renderInCumulus(
      <D97DialoguePanel view={{ ...DIALOGUE, characterId: character }} onContinue={() => undefined} onChoose={() => undefined} onClose={() => undefined} />,
    );
    const speaker = container.querySelector("[data-d97-dialogue-speaker]");
    expect(speaker?.firstElementChild?.getAttribute("data-d97-character-portrait")).toBe(character);
    expect(speaker?.querySelector("[data-speech-bubble-pointer-placement]")?.getAttribute("data-speech-bubble-pointer-placement")).toMatch(/^left/);
  });

  it("closes a bark from its last line", () => {
    const onClose = vi.fn();
    const { container } = renderInCumulus(
      <D97DialoguePanel
        view={{ ...DIALOGUE, lineCount: 1, choices: [] }}
        onContinue={() => undefined}
        onChoose={() => undefined}
        onClose={onClose}
      />,
    );
    press(container, "d97-dialogue-close");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("D97QuestLogPanel", () => {
  const HELD: D97QuestLogQuestView = {
    questId: QUEST,
    title: "Quest",
    status: "active",
    giverLine: "Giver",
    stepLine: "Step",
    items: ["Item"],
    reward: { kind: "essence", amount: 75 },
  };
  const VIEW: D97QuestLogView = {
    title: "Quests",
    emptyLine: "None",
    itemsLabel: "Carrying",
    rewardLabel: "Reward",
    abandonLabel: "Abandon",
    quest: HELD,
  };

  it("shows the held quest's giver and reward under the panel title, in the D97 panel frame", () => {
    renderInCumulus(<D97QuestLogPanel view={VIEW} onAbandon={() => undefined} onClose={() => undefined} />);
    const panel = document.querySelector('[data-d97-panel="quest-log"]');
    expect(panel?.querySelector("[data-glass-panel-frame=floating]")).not.toBeNull();
    const log = panel?.querySelector("[data-d97-quest-log]");
    expect(log?.querySelector("[data-d97-quest-giver]")).not.toBeNull();
    expect(log?.querySelector("[data-d97-reward-essence]")?.getAttribute("data-d97-reward-essence")).toBe("75");
    // The quest's title sits below the panel's own heading level.
    expect(panel?.querySelector("h2")?.contains(log?.querySelector("[data-d97-quest-title]") ?? null)).toBe(false);
    expect(log?.querySelector("[data-d97-quest-title]")?.tagName).toBe("H3");
    document.body.innerHTML = "";
    renderInCumulus(<D97QuestLogPanel view={{ ...VIEW, quest: { ...HELD, giverLine: null } }} onAbandon={() => undefined} onClose={() => undefined} />);
    expect(document.querySelector("[data-d97-quest-giver]")).toBeNull();
  });

  it("reports Abandon for the held quest and shows nothing to abandon without one", () => {
    const onAbandon = vi.fn();
    const held = renderInCumulus(<D97QuestLogPanel view={VIEW} onAbandon={onAbandon} onClose={() => undefined} />);
    expect(held.container.ownerDocument.querySelector("[data-d97-quest-log]")?.getAttribute("data-d97-quest-status")).toBe("active");
    const abandon = held.container.ownerDocument.querySelector<HTMLElement>('[data-testid="d97-quest-abandon"]');
    act(() => abandon?.click());
    expect(onAbandon).toHaveBeenCalledWith(QUEST);
    held.unmount();
    const empty = renderInCumulus(<D97QuestLogPanel view={{ ...VIEW, quest: null }} onAbandon={onAbandon} onClose={() => undefined} />);
    expect(empty.container.ownerDocument.querySelector('[data-testid="d97-quest-abandon"]')).toBeNull();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderInCumulus(<D97QuestLogPanel view={VIEW} onAbandon={() => undefined} onClose={onClose} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

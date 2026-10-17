// @vitest-environment jsdom
// The D97 quest panels: the dialogue panel shows Continue until the last line,
// then its choices (or Close for a bark) and reports the chosen index; the
// quest log reports Abandon for the held quest.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97QuestId,
} from "../../../types/identifiers";
import { renderInCumulus } from "../../testing/render";
import type { DomTestId } from "../../types/dom";
import { D97DialoguePanel, type D97DialogueView } from "./D97DialoguePanel";
import { D97QuestLogPanel, type D97QuestLogView } from "./D97QuestLogPanel";

const QUEST = parseD97QuestId("00000005-0000-4000-8000-000000000001");

const DIALOGUE: D97DialogueView = {
  dialogueId: parseD97DialogueId("00000007-0000-4000-8000-000000000001"),
  nodeId: parseD97DialogueNodeId("00000006-0000-4000-8000-000000000001"),
  speakerName: "Speaker",
  portrait: null,
  portraitAlt: "Portrait",
  line: "Line",
  lineIndex: 0,
  lineCount: 2,
  choices: [
    { index: 0, label: "A", essenceValue: null },
    { index: 2, label: "B", essenceValue: 50 },
  ],
  rewardNote: null,
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
  const VIEW: D97QuestLogView = {
    title: "Quests",
    emptyLine: "None",
    itemsLabel: "Carrying",
    abandonLabel: "Abandon",
    quest: { questId: QUEST, title: "Quest", status: "active", stepLine: "Step", items: ["Item"] },
  };

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
});

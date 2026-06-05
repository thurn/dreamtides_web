// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BattleAiProposalBar } from "./BattleAiProposalBar";
import type { AiProposal } from "../ai/use-battle-ai";

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function actionProposal(): AiProposal {
  return {
    kind: "action",
    description: "Declare Branded Direwolf as a challenger",
    trace: {
      stage: "reposition",
      choice: "MOVE_CARD",
      battleCardId: "c-1",
      cardName: "Branded Direwolf",
      sourceHandIndex: null,
      sourceSlotId: "R0",
      targetSlotId: "D0",
      heuristicScoreBefore: 0,
      heuristicScoreAfter: 5,
      rationale: "Declare Branded Direwolf as a challenger",
      targetBattleCardId: null,
    },
    commands: [],
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleAiProposalBar", () => {
  it("renders nothing when the proposal is null", () => {
    const { container } = mount(
      <BattleAiProposalBar
        proposal={null}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEndAiTurn={vi.fn()}
      />,
    );
    expect(container.querySelector("[data-battle-ai-proposal]")).toBeNull();
  });

  it("renders the description and card name and wires the three controls", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onEndAiTurn = vi.fn();
    const { container } = mount(
      <BattleAiProposalBar
        proposal={actionProposal()}
        onApprove={onApprove}
        onReject={onReject}
        onEndAiTurn={onEndAiTurn}
      />,
    );

    const description = container.querySelector(
      "[data-battle-ai-proposal-description]",
    );
    expect(description?.textContent).toBe("Declare Branded Direwolf as a challenger");
    const card = container.querySelector("[data-battle-ai-proposal-card]");
    expect(card?.textContent).toBe("Branded Direwolf");

    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-battle-ai-proposal-approve]")
        ?.click();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-battle-ai-proposal-reject]")
        ?.click();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>("[data-battle-ai-proposal-end-turn]")
        ?.click();
    });

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onEndAiTurn).toHaveBeenCalledTimes(1);
  });
});

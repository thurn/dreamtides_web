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
    description: "Declare Marked Direwolf as a challenger",
    trace: {
      stage: "reposition",
      choice: "MOVE_CARD",
      battleCardId: "c-1",
      cardName: "Marked Direwolf",
      sourceHandIndex: null,
      sourceSlotId: "R0",
      targetSlotId: "D0",
      heuristicScoreBefore: 0,
      heuristicScoreAfter: 5,
      rationale: "Declare Marked Direwolf as a challenger",
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

  it("renders the description once and wires the three controls", () => {
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
    expect(description?.textContent).toBe("Declare Marked Direwolf as a challenger");
    // The card name is carried by the description; it must not also appear as a
    // standalone chip (that read as the name printed twice).
    expect(container.querySelector("[data-battle-ai-proposal-card]")).toBeNull();

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

  it("asks the screen to preview the proposed card on description hover", () => {
    const onCardPreviewStart = vi.fn();
    const onCardPreviewEnd = vi.fn();
    const { container } = mount(
      <BattleAiProposalBar
        proposal={actionProposal()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEndAiTurn={vi.fn()}
        onCardPreviewStart={onCardPreviewStart}
        onCardPreviewMove={vi.fn()}
        onCardPreviewEnd={onCardPreviewEnd}
      />,
    );

    const description = container.querySelector<HTMLElement>(
      "[data-battle-ai-proposal-description]",
    );
    expect(description?.classList.contains("has-preview")).toBe(true);

    act(() => {
      description?.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    act(() => {
      description?.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true }),
      );
    });

    expect(onCardPreviewStart).toHaveBeenCalledTimes(1);
    expect(onCardPreviewStart.mock.calls[0]?.[0]).toBe("c-1");
    expect(onCardPreviewEnd).toHaveBeenCalledTimes(1);
  });

  it("does not mark the description as previewable without a card id", () => {
    const proposal: AiProposal = {
      kind: "endTurn",
      description: "End turn — resolve the Challenge and pass",
      trace: null,
      commands: [],
    };
    const { container } = mount(
      <BattleAiProposalBar
        proposal={proposal}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEndAiTurn={vi.fn()}
        onCardPreviewStart={vi.fn()}
        onCardPreviewMove={vi.fn()}
        onCardPreviewEnd={vi.fn()}
      />,
    );

    const description = container.querySelector<HTMLElement>(
      "[data-battle-ai-proposal-description]",
    );
    expect(description?.classList.contains("has-preview")).toBe(false);
  });
});

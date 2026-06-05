import type { MouseEvent as ReactPointerMouseEvent } from "react";
import type { AiProposal } from "../ai/use-battle-ai";

/**
 * Presentational bar for the held AI {@link AiProposal}. It renders the
 * proposal's plain-language description (which already names the referenced
 * card) and the three approval controls. When the proposal's trace carries a
 * `battleCardId`, the description becomes a hover target that asks the screen
 * to show the full card preview — so the human can see exactly what the AI
 * wants to play, not just its name.
 *
 * It contains NO business logic — every button only invokes its callback; the
 * hook owns the safety contract (only Approve dispatches).
 *
 * Renders nothing when `proposal` is null (not the AI's turn, disabled, or the
 * battle is over).
 */
export function BattleAiProposalBar({
  proposal,
  onApprove,
  onReject,
  onEndAiTurn,
  onCardPreviewStart,
  onCardPreviewMove,
  onCardPreviewEnd,
}: {
  proposal: AiProposal | null;
  onApprove: () => void;
  onReject: () => void;
  onEndAiTurn: () => void;
  onCardPreviewStart?: (
    battleCardId: string,
    event: ReactPointerMouseEvent<HTMLElement>,
  ) => void;
  onCardPreviewMove?: (
    battleCardId: string,
    event: ReactPointerMouseEvent<HTMLElement>,
  ) => void;
  onCardPreviewEnd?: () => void;
}) {
  if (proposal === null) {
    return null;
  }

  const previewCardId = proposal.trace?.battleCardId ?? null;
  const canPreview = previewCardId !== null && onCardPreviewStart !== undefined;
  const previewHandlers = canPreview
    ? {
        onMouseEnter: (event: ReactPointerMouseEvent<HTMLElement>) => {
          onCardPreviewStart(previewCardId, event);
        },
        onMouseMove: (event: ReactPointerMouseEvent<HTMLElement>) => {
          onCardPreviewMove?.(previewCardId, event);
        },
        onMouseLeave: () => {
          onCardPreviewEnd?.();
        },
      }
    : {};

  return (
    <section
      data-battle-ai-proposal={proposal.kind}
      className="battle-ai-proposal-bar"
      aria-label="AI proposal"
    >
      <div className="battle-ai-proposal-copy">
        <span className="battle-ai-proposal-label">AI proposes</span>
        <strong
          data-battle-ai-proposal-description
          className={`battle-ai-proposal-description${canPreview ? " has-preview" : ""}`}
          {...previewHandlers}
        >
          {proposal.description}
        </strong>
      </div>
      <div className="battle-ai-proposal-actions">
        <button
          type="button"
          data-battle-ai-proposal-approve
          className="battle-ai-proposal-button approve"
          onClick={onApprove}
        >
          Approve
        </button>
        <button
          type="button"
          data-battle-ai-proposal-reject
          className="battle-ai-proposal-button reject"
          onClick={onReject}
        >
          Reject
        </button>
        <button
          type="button"
          data-battle-ai-proposal-end-turn
          className="battle-ai-proposal-button end-turn"
          onClick={onEndAiTurn}
        >
          End AI Turn
        </button>
      </div>
    </section>
  );
}

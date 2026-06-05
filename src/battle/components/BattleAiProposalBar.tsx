import type { AiProposal } from "../ai/use-battle-ai";

/**
 * Presentational bar for the held AI {@link AiProposal}. It renders the
 * proposal's plain-language description, the referenced card name (when the
 * trace carries one), and the three approval controls. It contains NO business
 * logic — every button only invokes its callback; the hook owns the safety
 * contract (only Approve dispatches).
 *
 * Renders nothing when `proposal` is null (not the AI's turn, disabled, or the
 * battle is over).
 */
export function BattleAiProposalBar({
  proposal,
  onApprove,
  onReject,
  onEndAiTurn,
}: {
  proposal: AiProposal | null;
  onApprove: () => void;
  onReject: () => void;
  onEndAiTurn: () => void;
}) {
  if (proposal === null) {
    return null;
  }

  const cardName = proposal.trace?.cardName ?? null;

  return (
    <section
      data-battle-ai-proposal={proposal.kind}
      className="battle-ai-proposal-bar"
      aria-label="AI proposal"
    >
      <div className="battle-ai-proposal-copy">
        <span className="battle-ai-proposal-label">AI proposes</span>
        <strong data-battle-ai-proposal-description className="battle-ai-proposal-description">
          {proposal.description}
        </strong>
        {cardName !== null ? (
          <span data-battle-ai-proposal-card className="battle-ai-proposal-card">
            {cardName}
          </span>
        ) : null}
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

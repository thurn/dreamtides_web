import {
  DreamwellCardView,
  type DreamwellCardViewData,
} from "../../components/DreamwellCardView";

/**
 * The Dreamwell card driving an open battle prompt, rendered inside the prompt
 * modal so the player can see *which* Dreamwell card asked them to act (e.g.
 * "Emberwake Flats" above its "Discard a card" prompt). Prompt overlays sit on
 * a full-screen backdrop that covers the on-board Dreamwell display, so the card
 * is re-rendered here, at a compact size, as the prompt's header.
 */
export function DreamwellPromptCard({
  card,
}: {
  card: DreamwellCardViewData;
}) {
  return (
    <div className="flex justify-center" data-battle-dreamwell-prompt-card={card.id}>
      <div style={{ width: "min(22rem, 74vw)" }}>
        <DreamwellCardView card={card} />
      </div>
    </div>
  );
}

// D97QuestRewardPanel — a turned-in quest's card-choice reward: the offered
// bag cards, one of which the player takes. It has no dismissal: the pick is
// the reward. PURE: it renders from a view model and reports the pressed
// offer slot.

import type { ReactElement } from "react";
import { CardChoiceGrid, type CardChoiceGridColumns } from "../../components/card/CardChoiceGrid";
import type { GameCardModel } from "../../components/card/CardView";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { D97QuestId } from "../../../types/identifiers";
import { D97Panel } from "./D97Panel";

/** One offer slot; an offer may show a card more than once. */
export type D97QuestRewardSlot = `slot-${number}`;

export interface D97QuestRewardCardView {
  readonly slot: D97QuestRewardSlot;
  readonly model: GameCardModel;
}

export interface D97QuestRewardView {
  readonly questId: D97QuestId;
  readonly title: string;
  readonly subtitle: string;
  readonly cards: readonly D97QuestRewardCardView[];
}

export interface D97QuestRewardPanelProps {
  readonly view: D97QuestRewardView;
  readonly onChoose: (slot: D97QuestRewardSlot) => void;
}

const COLUMNS: readonly CardChoiceGridColumns[] = ["one", "two", "three", "four", "five"];

function columnsFor(count: number, desktop: boolean): CardChoiceGridColumns {
  const columns = Math.min(desktop ? COLUMNS.length : 2, Math.max(1, count));
  return COLUMNS[columns - 1] ?? "one";
}

export function D97QuestRewardPanel({ view, onChoose }: D97QuestRewardPanelProps): ReactElement {
  const isDesktop = useIsDesktop();
  return (
    <D97Panel kind="quest-reward" title={view.title} subtitle={view.subtitle}>
      <div data-d97-quest-reward={view.questId} data-d97-quest-reward-count={String(view.cards.length)}>
        <CardChoiceGrid<D97QuestRewardSlot>
          cards={view.cards.map((card) => ({
            entryId: card.slot,
            model: card.model,
            testId: `d97-quest-reward-${card.slot}`,
          }))}
          columns={columnsFor(view.cards.length, isDesktop)}
          layout={{ kind: "site", viewport: isDesktop ? "desktop" : "mobile", fit: "choice" }}
          onCardPress={onChoose}
        />
      </div>
    </D97Panel>
  );
}

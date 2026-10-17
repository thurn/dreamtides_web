// D97RewardLine — what a D97 quest pays, shown the same way wherever a quest
// appears (the dialogue that offers it, the quest log that holds it): a
// label, then the Essence amount or the card-choice line. Over the world the
// line takes the on-media outline and the Essence violet; on glass the amount
// stays in glass text with the violet Essence mark. PURE.

import type { ReactElement } from "react";
import { EssenceValue } from "../../components/hud/EssenceValue";
import { token } from "../../primitives/tokens";

/** A quest's reward: Essence, or a card choice described in a line. */
export type D97RewardView =
  | { readonly kind: "essence"; readonly amount: number }
  | { readonly kind: "cards"; readonly line: string };

export interface D97RewardLineProps {
  readonly label: string;
  readonly reward: D97RewardView;
  /** What the line sits on: the world itself, or a glass panel. */
  readonly surface: "media" | "glass";
}

export function D97RewardLine({ label, reward, surface }: D97RewardLineProps): ReactElement {
  const onMedia = surface === "media";
  return (
    <p
      data-d97-reward={reward.kind}
      style={{
        margin: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: token("--space-xs"),
        font: token("--t-body"),
        color: onMedia ? token("--text-primary") : token("--text-on-glass"),
        ...(onMedia ? { textShadow: token("--text-outline-media") } : {}),
      }}
    >
      <span style={{ color: onMedia ? token("--text-primary") : token("--text-on-glass-muted") }}>{label}</span>
      {reward.kind === "essence" ? (
        <span data-d97-reward-essence={reward.amount}>
          <EssenceValue amount={reward.amount} tone={onMedia ? "value" : "mark"} />
        </span>
      ) : (
        <span>{reward.line}</span>
      )}
    </p>
  );
}

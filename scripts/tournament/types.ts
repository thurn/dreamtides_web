import type { CatalogManifest } from "../../src/engine/policy/catalog-manifest";
import type { PolicyBudget, PolicyId, PolicyTrace, PolicyDecision } from "../../src/engine/policy/types";
import type { EngineLogRecord } from "../../src/engine/log";
import type { Side } from "../../src/engine/state/ids";
import type { BattleInit, BattleResult } from "../../src/engine/state/types";
import type { RecordedAnswer } from "../../src/engine/steps/types";
import type { Action } from "../../src/engine/rules/actions";
import type { ContentHash } from "../../src/types/content-hash";
import type { AvatarId, DreamsignId, TideId, OpponentId, GameId, AffiliationId, ApollyonIncarnationId } from "../../src/types/identifiers";
import type { CardId } from "../../src/types/card-identity";
import type { JourneySeed } from "../../src/types/journey-seed";

export interface PoolDeck {
  readonly id: OpponentId;
  readonly layer: number;
  /** Present only for a curated boss; avatarId names its permanent Aspect. */
  readonly incarnationId?: ApollyonIncarnationId;
  readonly avatarId: AvatarId;
  readonly abilityActive: boolean;
  readonly dreamsigns: readonly DreamsignId[];
  readonly cards: readonly CardId[];
  readonly archetypes: readonly TideId[];
  readonly affiliationId: AffiliationId | null;
  readonly poolSeed: number;
}
export interface DeckPool {
  readonly schemaVersion: 1;
  readonly provenance: { readonly generatedAt: string; readonly reason: string; readonly seed: JourneySeed; readonly sourceHash: ContentHash; readonly apollyon: "hv-umm2.295" };
  readonly apollyonAppend?: { readonly generatedAt: string; readonly reason: string; readonly sourceHash: ContentHash; readonly basePoolHash: ContentHash };
  readonly decks: readonly PoolDeck[];
}
export interface TournamentConfig {
  readonly a: PolicyId;
  readonly b: PolicyId;
  readonly games: number;
  readonly seed: JourneySeed;
  readonly budgets: Readonly<Record<"turnPlanning" | "response", PolicyBudget>>;
  readonly poolHash: ContentHash;
  readonly sourceHash: ContentHash;
  readonly scheduleVersion: 1;
  readonly matchup?: "apollyon";
  readonly runtime: { readonly node: string; readonly platform: NodeJS.Platform; readonly architecture: string };
}
export interface MatchSpec {
  readonly ordinal: number;
  readonly gameId: GameId;
  readonly pair: number;
  readonly leg: 0 | 1;
  readonly policies: Readonly<Record<Side, PolicyId>>;
  readonly decks: Readonly<Record<Side, PoolDeck>>;
  readonly init: BattleInit;
}
export interface PlayedAction {
  readonly side: Side;
  readonly action: Action;
  readonly answers: readonly RecordedAnswer[];
}
export interface DecisionLog {
  readonly event: "ai.decision";
  readonly side: Side;
  readonly seed: BattleInit["seed"];
  readonly trace: PolicyTrace;
  readonly decision: PolicyDecision;
}
export interface PlayedGame {
  readonly startAnswers: readonly RecordedAnswer[];
  readonly actions: readonly PlayedAction[];
  readonly logs: readonly (EngineLogRecord | DecisionLog)[];
  readonly decisionCount: number;
  readonly decisionMs: number;
}
export type GameOutcome = PlayedGame & (
  | { readonly status: "completed"; readonly result: BattleResult; readonly finalStateHash: ContentHash }
  | { readonly status: "failed"; readonly failure: string }
);
export interface GameRecord {
  readonly event: "tournament.game";
  readonly timestamp: string;
  readonly ordinal: number;
  readonly spec: MatchSpec;
  readonly outcome: GameOutcome;
}
export type WorkerRequest =
  | { readonly kind: "boot"; readonly manifest: CatalogManifest }
  | { readonly kind: "game"; readonly spec: MatchSpec; readonly budgets: TournamentConfig["budgets"] };
export type WorkerReply =
  | { readonly kind: "ready" }
  | { readonly kind: "game"; readonly ordinal: number; readonly outcome: GameOutcome }
  | { readonly kind: "error"; readonly message: string };

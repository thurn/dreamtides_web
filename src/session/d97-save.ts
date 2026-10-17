// Versioned saves for D97 games (decision P5), wired into local games.
//
// Within a build a D97 game writes its snapshot after every applied event and
// opens from it. When the build changed (the reducer protocol, the content
// configuration or the build revision), the stored snapshot is migrated,
// reconciled against the current catalog, any battle in progress restarts
// from its recorded setup with the same antes, and the game is rebased: its
// genesis takes this build's protocol and content configuration and the
// snapshot becomes its fresh log base. Old events stay stored as history and
// are never folded again under new rules. D97 games never meet the
// content-configuration gate; journey games keep it.

import { D97_SAVE } from "../content/d97/save";
import { D97_SAVE_MIGRATIONS } from "../d97/save/migrations";
import { reconcileSnapshot, type D97SaveCatalog } from "../d97/save/reconcile";
import {
  decodeSnapshot,
  encodeSnapshot,
  snapshotFoldState,
  takeSnapshot,
  type D97SaveBuild,
  type D97Snapshot,
} from "../d97/save/snapshot";
import type { Genesis, PinnedContentConfig } from "../eventlog/types";
import { isFoldableGenesis } from "../eventlog/wire";
import { logEvent } from "../logging";
import { startEngineBattleWithCommits } from "../rules/battle/engine-battle";
import { getBattleInitProvider } from "../rules/battle/journey-battle";
import { d97ContentProvider } from "../rules/d97/d97-content";
import type { FoldState } from "../rules/fold-state";
import { BUILD_GIT_SHA } from "../runtime/build-info";
import type { GameId } from "../types/identifiers";
import type { GameRepository, StoredLocalGame } from "./game-repository";
import { genesisCompatibility } from "./genesis";
import type { LocalGameSnapshots } from "./local-game";
import { CURRENT_REDUCER_VERSION } from "./reducer-version";

/** This build, as recorded in every snapshot it writes. */
export const D97_SAVE_BUILD: D97SaveBuild = { reducerVersion: CURRENT_REDUCER_VERSION, gitRevision: BUILD_GIT_SHA };

/** The snapshot codec of a D97 game: written after every applied event, opened as the log base. */
export function d97SnapshotCodec(build: D97SaveBuild = D97_SAVE_BUILD): LocalGameSnapshots<FoldState> {
  return {
    encode: (state, seq, intentKeys) => {
      const snapshot = takeSnapshot(state, seq, intentKeys, build);
      return snapshot === null ? null : encodeSnapshot(snapshot);
    },
    decode: (raw, genesis) => {
      const decoded = decodeSnapshot(raw, D97_SAVE_MIGRATIONS);
      if (decoded === null) return undefined;
      const { snapshot } = decoded;
      return {
        seq: snapshot.seq,
        state: snapshotFoldState(genesis, snapshot),
        intentKeys: snapshot.intentKeys.map(([key, at]) => [key, at]),
      };
    },
  };
}

function sameBuild(left: D97SaveBuild, right: D97SaveBuild): boolean {
  return left.reducerVersion === right.reducerVersion && left.gitRevision === right.gitRevision;
}

/** Whether a stored D97 game must be rebased before it opens in this build. */
export function needsD97Rebase(
  stored: StoredLocalGame,
  contentConfig: PinnedContentConfig,
  build: D97SaveBuild = D97_SAVE_BUILD,
): boolean {
  if (genesisCompatibility(stored.genesis, contentConfig) !== "ready") return true;
  const decoded = stored.snapshot === null ? null : decodeSnapshot(stored.snapshot, D97_SAVE_MIGRATIONS);
  return decoded !== null && (decoded.migratedFrom !== null || !sameBuild(decoded.snapshot.build, build));
}

/**
 * The catalog this build reconciles saves against: the registered dreams
 * (the catalog's, and the development dream in a development build) with
 * their maps' declared anchors, so a rebase needs neither the map library
 * nor the compiled maps.
 */
function currentCatalog(): D97SaveCatalog | null {
  const content = d97ContentProvider();
  if (content === null || content.defaultDreamId === null) return null;
  return {
    hasCard: (cardId) => content.cardPriceFacts(cardId) !== null,
    dreams: [...content.dreams.values()].map((dream) => ({ id: dream.definition.id, anchors: dream.anchors })),
    defaultDreamId: content.defaultDreamId,
    questIds: new Set(content.quests.keys()),
  };
}

/** Rebase log records, logged now and kept in the game's stored log (D40). */
type SaveLog = (event: string, fields: Readonly<Record<string, unknown>>) => void;

/** A battle in progress restarted from its recorded setup, with the same antes. */
function restartBattle(snapshot: D97Snapshot, gameId: GameId, log: SaveLog): D97Snapshot {
  const battle = snapshot.battle;
  const engine = getBattleInitProvider()?.engine ?? null;
  if (battle === null || engine === null) return snapshot;
  const restarted = startEngineBattleWithCommits(battle.engine.init, engine, snapshot.seq);
  log("d97_save_battle_restarted", {
    gameId,
    battleId: battle.init.battleId,
    anchorId: battle.init.anchorId,
    playerAnteCopyId: battle.init.playerAnteCopyId,
    opponentAnteCardId: battle.init.opponentAnteCardId,
    restarted: restarted !== null,
  });
  return { ...snapshot, battle: restarted === null ? battle : { ...battle, engine: restarted.fold } };
}

/**
 * Rebase a stored D97 game onto this build: migrate and reconcile its
 * snapshot, restart a battle in progress, and write it as the game's fresh
 * log base under a genesis with this build's protocol and content
 * configuration. Every step is logged.
 */
export async function rebaseD97Game(
  repository: GameRepository,
  stored: StoredLocalGame,
  contentConfig: PinnedContentConfig,
  options: { readonly now: () => number; readonly build?: D97SaveBuild } = { now: Date.now },
): Promise<void> {
  const build = options.build ?? D97_SAVE_BUILD;
  const { gameId } = stored.summary;
  // The game's log capture attaches when it opens, after the rebase, so the
  // rebase writes its own records into the game's stored log.
  const lines: string[] = [];
  const log: SaveLog = (event, fields) => {
    logEvent(event, fields);
    lines.push(JSON.stringify({ ...fields, event, timestamp: new Date(options.now()).toISOString() }));
  };
  const genesis: Genesis = { ...stored.genesis, reducerVersion: build.reducerVersion, contentConfig };
  if (!isFoldableGenesis(genesis)) return;
  const decoded = stored.snapshot === null ? null : decodeSnapshot(stored.snapshot, D97_SAVE_MIGRATIONS);
  let snapshot = decoded?.snapshot ?? null;
  if (decoded !== null && decoded.migratedFrom !== null) {
    log("d97_save_migrated", { gameId, fromSchemaVersion: decoded.migratedFrom, toSchemaVersion: decoded.snapshot.schemaVersion });
  }
  const catalog = currentCatalog();
  if (snapshot !== null && catalog !== null) {
    const reconciled = reconcileSnapshot(snapshot, catalog, D97_SAVE);
    for (const reconciliation of reconciled.reconciliations) {
      log("d97_save_reconciled", { gameId, ...reconciliation });
    }
    snapshot = restartBattle(reconciled.snapshot, gameId, log);
  }
  const rebased = snapshot === null ? null : { ...snapshot, build, seq: stored.summary.head };
  await repository.rebaseGame(gameId, {
    summary: { ...stored.summary, updatedAt: options.now() },
    genesis,
    snapshot: rebased === null ? null : encodeSnapshot(rebased),
  });
  log("d97_save_rebased", {
    gameId,
    head: stored.summary.head,
    snapshotSeq: decoded?.snapshot.seq ?? null,
    fromReducerVersion: stored.genesis.reducerVersion,
    toReducerVersion: build.reducerVersion,
    fromGitRevision: decoded?.snapshot.build.gitRevision ?? null,
    toGitRevision: build.gitRevision,
    contentConfigChanged: genesisCompatibility(stored.genesis, contentConfig) === "configGate",
  });
  await repository.appendLogLines(gameId, lines, options.now());
}

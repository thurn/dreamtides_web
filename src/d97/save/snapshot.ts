// The durable Dreamtides 97 save (decision P5): a versioned snapshot of a D97
// game's `d97` slice and any battle in progress, with the log seq and intent
// keys it covers and the build that wrote it. A D97 game's fold state is its
// genesis state plus these two slices, so a snapshot restores it exactly.
// Older schema versions migrate forward on decode.
//
// The live state is a phase union (`D97State`); schema v4 persists it as
// `{ screen, run }` with `run` nullable on any screen. The converters below
// keep the persisted JSON exactly v4: writing is the identity, and reading
// accepts only the combinations the union names (no run on Avatar select, a
// run everywhere else), refusing any other as it refuses a malformed field.

import type { Genesis } from "../../eventlog/types";
import { d97BattleOf, type D97BattleFoldState } from "../../rules/battle/fold";
import type { D97Run, D97State } from "../../rules/d97/d97-state";
import { genesisFoldState, type FoldState } from "../../rules/fold-state";
import type { BuildGitRevision } from "../../types/build-identity";
import type { IntentKey } from "../../types/identifiers";
import { migrateSnapshot, type D97SaveMigration } from "./migrate";
import { parseSnapshotV4, type D97RunV4, type D97StateV4 } from "./schema-v4";

export const D97_SAVE_FORMAT = "dreamtides-97-save";

/**
 * The current snapshot schema version. Each version is frozen: its shape is
 * written out in its own module (`./schema-v4.ts`), type-tied to the live
 * state, and a change to the persisted shape bumps the version and adds a
 * migration (`./migrations/`).
 */
export const D97_SAVE_SCHEMA_VERSION = 4;

/** The build that wrote a snapshot: the cross-build trigger and diagnostics. */
export interface D97SaveBuild {
  readonly reducerVersion: Genesis["reducerVersion"];
  readonly gitRevision: BuildGitRevision;
}

export interface D97Snapshot {
  readonly format: typeof D97_SAVE_FORMAT;
  readonly schemaVersion: typeof D97_SAVE_SCHEMA_VERSION;
  readonly build: D97SaveBuild;
  /** The log seq of the applied event the snapshot follows. */
  readonly seq: number;
  readonly intentKeys: readonly (readonly [IntentKey, number])[];
  readonly d97: D97State;
  /** The D97 battle in progress, or null. */
  readonly battle: D97BattleFoldState | null;
}

/** True only when `A` and `B` are the same type. */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * Fails type checking when the live run stops being exactly schema v4's: a
 * persisted-shape change needs the next schema version and a migration.
 */
const LIVE_RUN_IS_V4: Exact<D97Run, D97RunV4> = true;
void LIVE_RUN_IS_V4;

/** The persisted v4 form of a live state: the same JSON, widened. */
function d97StateToV4(d97: D97State): D97StateV4 {
  return d97;
}

/** The live state a persisted v4 state names, or null when its screen and run disagree. */
function d97StateFromV4(d97: D97StateV4): D97State | null {
  const { screen, run } = d97;
  if (screen.type === "avatarSelect") return run === null ? { screen, run } : null;
  if (run === null) return null;
  return screen.type === "overworld" ? { screen, run } : { screen, run };
}

/** The snapshot of a D97 game's state after the applied event at `seq`, or null for a journey game. */
export function takeSnapshot(
  state: FoldState,
  seq: number,
  intentKeys: readonly (readonly [IntentKey, number])[],
  build: D97SaveBuild,
): D97Snapshot | null {
  if (state.d97 === undefined) return null;
  return {
    format: D97_SAVE_FORMAT,
    schemaVersion: D97_SAVE_SCHEMA_VERSION,
    build,
    seq,
    intentKeys: intentKeys.map(([key, at]) => [key, at] as const),
    d97: state.d97,
    battle: d97BattleOf(state.battle),
  };
}

export function encodeSnapshot(snapshot: D97Snapshot): string {
  return JSON.stringify({ ...snapshot, d97: d97StateToV4(snapshot.d97) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Decode a stored snapshot, migrating it to the current schema version. Null
 * when it is not a D97 save, comes from a newer schema, a migration fails, or
 * the migrated value does not match the current schema field by field.
 */
export function decodeSnapshot(
  raw: string,
  migrations: readonly D97SaveMigration[],
): { readonly snapshot: D97Snapshot; readonly migratedFrom: number | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.format !== D97_SAVE_FORMAT) return null;
  const migrated = migrateSnapshot(parsed, migrations, D97_SAVE_SCHEMA_VERSION);
  if (migrated === null) return null;
  const persisted = parseSnapshotV4(migrated.value);
  const d97 = persisted === null ? null : d97StateFromV4(persisted.d97);
  if (persisted === null || d97 === null) return null;
  const snapshot: D97Snapshot = { ...persisted, d97 };
  return { snapshot, migratedFrom: migrated.from === D97_SAVE_SCHEMA_VERSION ? null : migrated.from };
}

/** The fold state a snapshot restores under `genesis`. */
export function snapshotFoldState(genesis: Genesis, snapshot: D97Snapshot): FoldState {
  return { ...genesisFoldState(genesis), d97: snapshot.d97, battle: snapshot.battle };
}

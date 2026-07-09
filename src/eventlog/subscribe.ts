// Subscription wrapper for the event-sourcing engine: a thin `onValue` reader
// on `rooms/{roomId}/log` that decodes the RTDB-native `EncodedLogNode` into a
// ready-to-fold `LogNode` and hands it to a callback. It keeps no local state
// (the stateful fold lives in client.ts) and is game-agnostic: it never imports
// from src/rules/ or src/coop/. Firebase IS allowed here (the firebase ban
// applies only to src/rules/).
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Read path and fold" and §"Error handling and safety rails" (Malformed log
// entries).

import { type Database, onValue, ref } from "firebase/database";
import { decodeEvent } from "./append";
import { decodeAppliedIndex } from "./fold";
import type { EncodedLogNode, GameEvent, Genesis, LogNode } from "./types";

/**
 * Sentinel `basedOnSeq` stamped onto an event whose stored string failed to
 * `JSON.parse`. It is deliberately nonsensical (negative), so the pure fold's
 * malformed-basedOnSeq guard reports the entry as a bounced no-op WITHOUT ever
 * handing a broken object to the reducer. This is how decode honors the spec's
 * "malformed entry decodes to a bounce, never a throw" contract while staying
 * game-agnostic (subscribe has no reducer to consult).
 */
const MALFORMED_BASED_ON_SEQ = -1;

/** Builds the pre-bounced placeholder for an event string that failed to decode. */
function malformedEvent(raw: unknown): GameEvent {
  return {
    type: "__MALFORMED__",
    payload: { raw: typeof raw === "string" ? raw : String(raw) },
    actor: "",
    clientTimestamp: "0",
    basedOnSeq: MALFORMED_BASED_ON_SEQ,
  };
}

/**
 * Decodes an RTDB-native `EncodedLogNode` into a `LogNode`. Pure and total: it
 * NEVER throws. It returns `null` when the room is UNREADABLE — a genesis or
 * `baseSnapshot` string that fails to `JSON.parse` — because those are the
 * fold's foundation and there is no safe way to proceed without them; the
 * caller surfaces a terminal "start a new game" state. A malformed EVENT string
 * (bad JSON), by contrast, is recoverable: it becomes a pre-bounced placeholder
 * that the fold guard turns into a recorded no-op, so a single bad event never
 * strands the whole room. An event whose `basedOnSeq` is already nonsensical is
 * left as-is for the same guard to catch. The `events` field may arrive as a
 * sparse JS array (integer keys with holes) or as a plain object — both are
 * handled via `Object.entries`, which skips array holes and yields string keys
 * either way.
 *
 * `baseSnapshot` is validated here (a corrupt snapshot makes the room
 * unreadable, same as a corrupt genesis) but the RAW string — not the parsed
 * value — is what lands on the returned `LogNode`: decoding it into game
 * state is `config.decode`'s job, so every consumer (the client's confirmed
 * fold, compaction) decodes through that one path rather than this
 * game-agnostic module pre-parsing it with a bare `JSON.parse` that may not
 * even match a game's actual `decode`.
 */
export function decodeLogNode(encoded: EncodedLogNode): LogNode | null {
  let genesis: Genesis;
  let baseSnapshot: string | null;
  try {
    genesis = JSON.parse(encoded.genesis) as Genesis;
    // RTDB strips any field whose value is `null` from the stored tree, so a
    // freshly-created room's `baseSnapshot: null` reads back as `undefined`,
    // not `null` — both must decode to "no snapshot yet".
    const rawBaseSnapshot = encoded.baseSnapshot ?? null;
    if (rawBaseSnapshot !== null) {
      // Validity check only: the parsed value is discarded. See the doc
      // comment above for why the raw string is what's kept.
      JSON.parse(rawBaseSnapshot);
    }
    baseSnapshot = rawBaseSnapshot;
  } catch {
    // Corrupt genesis or snapshot — the fold has no foundation. Signal an
    // unreadable room rather than fabricate one.
    return null;
  }

  const events = new Map<number, GameEvent>();
  const rawEvents = encoded.events ?? {};
  for (const [key, value] of Object.entries(rawEvents)) {
    const seq = Number(key);
    if (!Number.isInteger(seq) || value === null || value === undefined) {
      continue;
    }
    let event: GameEvent;
    try {
      event = decodeEvent(value);
    } catch {
      event = malformedEvent(value);
    }
    events.set(seq, event);
  }

  return {
    genesis,
    baseSeq: encoded.baseSeq,
    baseSnapshot,
    head: encoded.head,
    events,
    // A pre-compaction node has no stored index; `decodeAppliedIndex` maps that
    // (and any malformed JSON keys) to an empty map without throwing.
    appliedIndex: decodeAppliedIndex(encoded.appliedIndex),
  };
}

/**
 * Subscribes to `rooms/{roomId}/log`, decoding each RTDB update into a
 * `LogNode` and invoking `onNode`. Returns an unsubscribe function. When the
 * node does not yet exist (null value) nothing is emitted — the caller waits
 * for room creation to write genesis. When the node exists but is UNREADABLE
 * (`decodeLogNode` returns null — corrupt genesis/snapshot), `onCorrupt` is
 * invoked instead of `onNode` so the caller can surface a terminal
 * unreadable-room state rather than folding on a broken foundation.
 */
export function subscribeToLog(
  db: Database,
  roomId: string,
  onNode: (node: LogNode) => void,
  onCorrupt?: () => void,
): () => void {
  const logRef = ref(db, `rooms/${roomId}/log`);
  return onValue(logRef, (snapshot) => {
    const encoded = snapshot.val() as EncodedLogNode | null;
    if (encoded === null) {
      return;
    }
    const node = decodeLogNode(encoded);
    if (node === null) {
      onCorrupt?.();
      return;
    }
    onNode(node);
  });
}

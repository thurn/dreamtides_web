// Subscription wrapper for the event-sourcing engine: a thin `onValue` reader
// on `rooms/{roomId}/log` that decodes the untrusted RTDB value into a
// ready-to-fold `LogNode` and hands it to a callback. It keeps no local state
// (the stateful fold lives in client.ts) and is game-agnostic: it never imports
// from src/rules/ or src/coop/. Firebase IS allowed here (the firebase ban
// applies only to src/rules/).
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Read path and fold" and §"Error handling and safety rails" (Malformed log
// entries).

import { type Database, onValue, ref } from "firebase/database";
import type { RoomId } from "../types/identifiers";
import { decodeEvent } from "./append";
import { decodeAppliedIndex } from "./fold";
import { parseEventActor, type GameEvent, type LogNode } from "./types";
import { decodeRtdbLogNode } from "./wire";

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
    actor: parseEventActor("malformed-event"),
    clientTimestamp: "0",
    basedOnSeq: MALFORMED_BASED_ON_SEQ,
  };
}

/**
 * Decodes an untrusted RTDB value into a `LogNode`. Pure and total: it
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
export function decodeLogNode(raw: unknown): LogNode | null {
  const encoded = decodeRtdbLogNode(raw);
  if (encoded === null) return null;

  const events = new Map<number, GameEvent>();
  for (const [key, value] of Object.entries(encoded.events)) {
    const seq = Number(key);
    if (!Number.isInteger(seq)) {
      continue;
    }
    let event: GameEvent;
    if (typeof value !== "string") {
      event = malformedEvent(value);
    } else {
      try {
        event = decodeEvent(value);
      } catch {
        event = malformedEvent(value);
      }
    }
    events.set(seq, event);
  }

  return {
    genesis: encoded.genesis,
    generation: encoded.generation,
    baseSeq: encoded.baseSeq,
    baseSnapshot: encoded.baseSnapshot,
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
 * node does not yet exist (null value) before any node has been seen, nothing
 * is emitted — the caller waits for room creation to write genesis. When a
 * previously live node becomes null, or when the node exists but is UNREADABLE
 * (`decodeLogNode` returns null — corrupt genesis/snapshot), `onCorrupt` is
 * invoked instead of `onNode` so the caller can surface a terminal
 * unreadable-room state rather than folding on a broken foundation.
 */
export function subscribeToLog(
  db: Database,
  roomId: RoomId,
  onNode: (node: LogNode) => void,
  onCorrupt?: () => void,
): () => void {
  const logRef = ref(db, `rooms/${roomId}/log`);
  let initialized = false;
  return onValue(logRef, (snapshot) => {
    const raw: unknown = snapshot.val();
    if (raw === null) {
      if (initialized) {
        onCorrupt?.();
      }
      return;
    }
    const node = decodeLogNode(raw);
    if (node === null) {
      onCorrupt?.();
      return;
    }
    initialized = true;
    onNode(node);
  });
}

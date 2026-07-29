import fc from "fast-check";
import { applyAppend, existingEventSeq } from "../eventlog/append";
import {
  createLogClient,
  type EventDraft,
  type LogClient,
  type LogClientIo,
} from "../eventlog/client";
import { foldEvents } from "../eventlog/fold";
import { decodeLogNode } from "../eventlog/subscribe";
import type {
  EncodedLogNode,
  EventOutcome,
  GameEvent,
  Genesis,
} from "../eventlog/types";
import { genesisLogNode } from "../eventlog/room";
import type { FoldState } from "../rules/fold-state";
import {
  BATTLE_SITE_ID,
  DREAM_AVATAR_ID,
  ESSENCE_SITE_ID,
} from "../rules/replay/fixture-providers";
import {
  GAME_ENGINE_CONFIG,
} from "../rules/replay/replay";

export type FuzzActor = "publisher" | "host";
export type DeliveryShape = "object" | "array" | "firebase-omissions";

export interface FuzzOperation {
  kind:
    | "deliver-publisher"
    | "deliver-host"
    | "deliver-both"
    | "remount-publisher"
    | "remount-host"
    | "submit-valid"
    | "submit-shared-key";
  actor: FuzzActor;
  value: number;
  shape: DeliveryShape;
}

const DELIVERY_SHAPES: readonly DeliveryShape[] = [
  "object",
  "array",
  "firebase-omissions",
];
const FUZZ_ACTORS: readonly FuzzActor[] = ["publisher", "host"];
const OPERATION_KINDS: readonly FuzzOperation["kind"][] = [
  "deliver-publisher",
  "deliver-host",
  "deliver-both",
  "remount-publisher",
  "remount-host",
  "submit-valid",
  "submit-shared-key",
];

export const fuzzOperationArbitrary: fc.Arbitrary<FuzzOperation> = fc.record({
  kind: fc.constantFrom(...OPERATION_KINDS),
  actor: fc.constantFrom(...FUZZ_ACTORS),
  value: fc.integer({ min: 0, max: 100 }),
  shape: fc.constantFrom(...DELIVERY_SHAPES),
});

export interface FuzzEventResult {
  actor: FuzzActor;
  event: GameEvent;
  seq: number;
  outcome: EventOutcome;
}

interface ClientObservation {
  client: LogClient;
  confirmedState: FoldState | null;
  displayedState: FoldState | null;
  confirmedHead: number | null;
  foldErrors: string[];
  divergences: string[];
  outcomes: FuzzEventResult[];
}

const CLIENT_IDS: Record<FuzzActor, string> = {
  publisher: "publisher-client",
  host: "host-client",
};

export const FUZZ_GENESIS: Genesis = {
  seed: "coop-fuzz-synthetic",
  reducerVersion: "coop-fuzz-v1",
  createdAt: 0,
  contentConfig: {
    poolVariant: "fixture",
    draftMode: "pool",
    fresh20PackSize: null,
  },
};

function rawNode(encoded: EncodedLogNode, shape: DeliveryShape): unknown {
  const raw: Record<string, unknown> = {
    ...encoded,
    events: { ...encoded.events },
  };
  if (shape === "array" && encoded.baseSeq === 0) {
    const events: unknown[] = [];
    for (const [rawSeq, value] of Object.entries(encoded.events ?? {})) {
      events[Number(rawSeq)] = value;
    }
    raw.events = events;
  }
  if (shape === "firebase-omissions") {
    if (encoded.baseSnapshot === null || encoded.baseSnapshot === undefined) {
      delete raw.baseSnapshot;
    }
    if (Object.keys(encoded.events ?? {}).length === 0) {
      delete raw.events;
    }
  }
  return raw;
}

function battleDebugDelta(value: number): EventDraft {
  return {
    type: "BATTLE_COMMAND",
    payload: {
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_SCORE",
          side: value % 2 === 0 ? "player" : "opponent",
          delta: value % 3 === 0 ? -1 : 1,
        },
      },
    },
  };
}

function stateAwareDraft(state: FoldState, value: number): EventDraft {
  if (state.journey.runId === null) {
    return {
      type: "START_JOURNEY",
      payload: { dreamAvatarId: DREAM_AVATAR_ID },
      intentKey: "fuzz:start-journey",
    };
  }
  if (state.battle !== null) {
    if (value % 5 === 0) {
      return { type: "END_BATTLE", payload: { result: "victory" } };
    }
    return battleDebugDelta(value);
  }
  if (value % 5 === 0) {
    return {
      type: "BEGIN_BATTLE",
      payload: { siteId: BATTLE_SITE_ID },
      intentKey: `fuzz:battle:${state.journey.runId}`,
    };
  }
  if (value % 3 === 0) {
    return {
      type: "OPEN_SITE",
      payload: { siteId: ESSENCE_SITE_ID },
      intentKey: `fuzz:open:${state.journey.runId}:${ESSENCE_SITE_ID}`,
    };
  }
  return {
    type: "ADJUST_ESSENCE",
    payload: { delta: value % 2 === 0 ? 1 : -1 },
  };
}

/**
 * Two real LogClients sharing an in-memory RTDB-shaped room. Delivery is
 * explicitly scheduled so clients may submit from stale confirmed heads,
 * remount, and observe Firebase's array/null-omission representations.
 */
export class CoopFuzzRoom {
  private encoded = genesisLogNode(FUZZ_GENESIS);
  private readonly expectedFoldErrorSeqs = new Set<number>();
  private readonly subscribers = new Map<
    FuzzActor,
    (node: NonNullable<ReturnType<typeof decodeLogNode>>) => void
  >();
  private readonly observations = new Map<FuzzActor, ClientObservation>();

  constructor() {
    this.mount("publisher");
    this.mount("host");
  }

  private mount(actor: FuzzActor): void {
    const previous = this.observations.get(actor);
    previous?.client.close();
    const observation: ClientObservation = {
      client: null as unknown as LogClient,
      confirmedState: null,
      displayedState: null,
      confirmedHead: null,
      foldErrors: previous?.foldErrors ?? [],
      divergences: previous?.divergences ?? [],
      outcomes: previous?.outcomes ?? [],
    };
    const io: LogClientIo = {
      subscribe: (onNode) => {
        this.subscribers.set(actor, onNode);
        return () => {
          this.subscribers.delete(actor);
        };
      },
      append: (event) => {
        const existing = existingEventSeq(
          GAME_ENGINE_CONFIG,
          this.encoded,
          event,
        );
        if (existing !== null) {
          return Promise.resolve(existing);
        }
        this.encoded = applyAppend(GAME_ENGINE_CONFIG, this.encoded, event);
        return Promise.resolve(this.encoded.head);
      },
    };
    observation.client = createLogClient(GAME_ENGINE_CONFIG, io, {
      onDisplayState: (state) => {
        observation.displayedState = state;
      },
      onConfirmedState: (state) => {
        observation.confirmedState = state;
      },
      onConfirmedHead: (head) => {
        observation.confirmedHead = head;
      },
      onEventOutcome: (event, seq, outcome) => {
        observation.outcomes.push({ actor, event, seq, outcome });
      },
      onDivergence: ({ seq, expected, actual }) => {
        observation.divergences.push(`${seq}:${expected}:${actual}`);
      },
      onFoldError: (error) => {
        observation.foldErrors.push(`${error.seq}:${error.message}`);
      },
    }, { clientId: CLIENT_IDS[actor] });
    this.observations.set(actor, observation);
  }

  deliver(actor: FuzzActor, shape: DeliveryShape): void {
    const subscriber = this.subscribers.get(actor);
    if (subscriber === undefined) {
      throw new Error(`missing ${actor} subscriber`);
    }
    const decoded = decodeLogNode(rawNode(this.encoded, shape));
    if (decoded === null) {
      throw new Error(`${shape} delivery decoded as an unreadable room`);
    }
    subscriber(decoded);
  }

  deliverBoth(shape: DeliveryShape): void {
    this.deliver("publisher", shape);
    this.deliver("host", shape);
  }

  remount(actor: FuzzActor, shape: DeliveryShape): void {
    this.mount(actor);
    this.deliver(actor, shape);
  }

  async submitStateAware(actor: FuzzActor, value: number): Promise<void> {
    const canonical = this.replay().finalState;
    await this.observations
      .get(actor)!
      .client.submit(stateAwareDraft(canonical, value));
  }

  async submitSharedKey(actor: FuzzActor, value: number): Promise<void> {
    const canonical = this.replay().finalState;
    const draft =
      canonical.journey.runId === null
        ? stateAwareDraft(canonical, value)
        : {
            type: "OPEN_SITE",
            payload: { siteId: ESSENCE_SITE_ID },
            intentKey: `fuzz:shared:${canonical.journey.runId}:${value % 3}`,
          };
    await this.observations.get(actor)!.client.submit(draft);
  }

  async execute(operation: FuzzOperation): Promise<void> {
    switch (operation.kind) {
      case "deliver-publisher":
        this.deliver("publisher", operation.shape);
        return;
      case "deliver-host":
        this.deliver("host", operation.shape);
        return;
      case "deliver-both":
        this.deliverBoth(operation.shape);
        return;
      case "remount-publisher":
        this.remount("publisher", operation.shape);
        return;
      case "remount-host":
        this.remount("host", operation.shape);
        return;
      case "submit-valid":
        await this.submitStateAware(operation.actor, operation.value);
        return;
      case "submit-shared-key":
        await this.submitSharedKey(operation.actor, operation.value);
    }
  }

  injectMalformedEvent(): number {
    const seq = this.encoded.head + 1;
    this.encoded = {
      ...this.encoded,
      head: seq,
      events: {
        ...this.encoded.events,
        [seq]: "{malformed-json",
      },
    };
    this.expectedFoldErrorSeqs.add(seq);
    return seq;
  }

  forceCompaction(eventCount = 205): void {
    for (let index = 0; index < eventCount; index += 1) {
      const basedOnSeq = this.encoded.head;
      const event: GameEvent = {
        type: "ADJUST_ESSENCE",
        payload: { delta: index % 2 === 0 ? 1 : -1 },
        actor: CLIENT_IDS.publisher,
        clientTimestamp: "1970-01-01T00:00:00.000Z",
        basedOnSeq,
        nonce: `compaction:${String(index)}`,
      };
      this.encoded = applyAppend(GAME_ENGINE_CONFIG, this.encoded, event);
    }
    if (this.encoded.baseSeq === 0 || this.encoded.baseSnapshot == null) {
      throw new Error("dedicated compaction schedule did not compact");
    }
  }

  get baseSeq(): number {
    return this.encoded.baseSeq;
  }

  replay() {
    const decoded = decodeLogNode(rawNode(this.encoded, "object"));
    if (decoded === null) {
      throw new Error("canonical room became unreadable");
    }
    const baseState =
      decoded.baseSnapshot === null
        ? GAME_ENGINE_CONFIG.genesisState(decoded.genesis)
        : GAME_ENGINE_CONFIG.decode(decoded.baseSnapshot);
    const events = [...decoded.events.entries()]
      .filter(([seq]) => seq > decoded.baseSeq)
      .sort(([left], [right]) => left - right)
      .map(([seq, event]) => ({ seq, event }));
    const folded = foldEvents(
      GAME_ENGINE_CONFIG,
      decoded.genesis,
      { seq: decoded.baseSeq, state: baseState },
      events,
      {
        appliedBySeq: decoded.appliedIndex,
        coveredFromSeq: 0,
        devMode: false,
      },
    );
    return {
      finalState: folded.state,
      finalHash: GAME_ENGINE_CONFIG.hash(folded.state),
      outcomes: folded.outcomes,
    };
  }

  assertHealthy(): void {
    this.deliverBoth("firebase-omissions");
    const canonical = this.replay();
    const hashes = new Set<string>();
    for (const actor of ["publisher", "host"] as const) {
      const observation = this.observations.get(actor)!;
      if (observation.confirmedState === null) {
        throw new Error(`${actor} has no confirmed state`);
      }
      if (observation.confirmedHead !== this.encoded.head) {
        throw new Error(
          `${actor} confirmed ${observation.confirmedHead}; room head is ${this.encoded.head}`,
        );
      }
      hashes.add(GAME_ENGINE_CONFIG.hash(observation.confirmedState));
      const observedFoldErrorSeqs = new Set(
        observation.foldErrors.map((entry) => Number(entry.split(":", 1)[0])),
      );
      const unexpectedFoldErrors = [...observedFoldErrorSeqs].filter(
        (seq) => !this.expectedFoldErrorSeqs.has(seq),
      );
      const missingFoldErrors = [...this.expectedFoldErrorSeqs].filter(
        (seq) => !observedFoldErrorSeqs.has(seq),
      );
      if (unexpectedFoldErrors.length > 0 || missingFoldErrors.length > 0) {
        throw new Error(
          `${actor} fold errors unexpected=${unexpectedFoldErrors.join(",")} missing=${missingFoldErrors.join(",")}`,
        );
      }
      if (observation.divergences.length > 0) {
        throw new Error(
          `${actor} divergences: ${observation.divergences.join(", ")}`,
        );
      }
    }
    hashes.add(canonical.finalHash);
    if (hashes.size !== 1) {
      throw new Error(`clients did not converge: ${[...hashes].join(", ")}`);
    }

    const appliedKeys = new Set<string>();
    for (const outcome of canonical.outcomes) {
      if (
        outcome.outcome === "applied" &&
        outcome.event.intentKey !== undefined
      ) {
        if (appliedKeys.has(outcome.event.intentKey)) {
          throw new Error(
            `intent key applied twice: ${outcome.event.intentKey}`,
          );
        }
        appliedKeys.add(outcome.event.intentKey);
      }
    }
  }

  close(): void {
    for (const observation of this.observations.values()) {
      observation.client.close();
    }
  }
}

export async function runCoopFuzz(options: {
  seed: number;
  runs: number;
  operations?: number;
}): Promise<void> {
  const poisonRoom = new CoopFuzzRoom();
  try {
    poisonRoom.deliverBoth("firebase-omissions");
    poisonRoom.injectMalformedEvent();
    poisonRoom.assertHealthy();
  } finally {
    poisonRoom.close();
  }

  const compactedRoom = new CoopFuzzRoom();
  try {
    compactedRoom.deliverBoth("object");
    compactedRoom.forceCompaction();
    compactedRoom.deliver("publisher", "array");
    compactedRoom.remount("host", "firebase-omissions");
    compactedRoom.assertHealthy();
  } finally {
    compactedRoom.close();
  }

  await fc.assert(
    fc.asyncProperty(
      fc.array(fuzzOperationArbitrary, {
        minLength: 1,
        maxLength: options.operations ?? 35,
      }),
      async (operations) => {
        const room = new CoopFuzzRoom();
        try {
          room.deliverBoth("firebase-omissions");
          for (const operation of operations) {
            await room.execute(operation);
          }
          room.assertHealthy();
        } finally {
          room.close();
        }
      },
    ),
    {
      seed: options.seed,
      numRuns: options.runs,
      endOnFailure: true,
      verbose: 2,
    },
  );
}

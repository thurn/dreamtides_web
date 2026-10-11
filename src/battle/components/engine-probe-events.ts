// Development-only observations. These records never drive the battle fold,
// presentation, or AI. A history belongs to one mounted battle.
import type { EngineEvent, EngineEventKind, InstanceId } from "../../engine";
import type { CommittedEvent } from "../../eventlog/local-log";

/** One genuine engine event, ordered by its applied intent's seq and batch index. */
export interface EngineProbeEvent {
  readonly seq: number;
  readonly index: number;
  readonly kind: EngineEventKind;
  readonly instance: InstanceId | null;
  readonly event: EngineEvent;
}

/** The probe's records of one published batch, including repeated sibling events. */
export function probeEvents({ events, seq }: { readonly events: readonly EngineEvent[]; readonly seq: number }): EngineProbeEvent[] {
  return events.map((event, index) => ({
    seq, index, kind: event.kind,
    instance: "instance" in event ? event.instance : null,
    event,
  }));
}

// A final loaded init owns its constructor observations weakly. The DEV
// guard also removes this initializer from production chunks.
const initial = import.meta.env.DEV ? new WeakMap<object, readonly EngineEvent[]>() : null;

/** Keeps actual lab constructor events against the final init loaded into the game. */
export function rememberInitialProbeEvents(init: object, events: readonly EngineEvent[]): void {
  initial?.set(init, [...events]);
}

/** Observations available even when the debug panel's lazy module mounts later. */
export class EngineProbeHistory {
  readonly events: EngineProbeEvent[] = [];
  private readonly sequences = new Set<number>();

  constructor(init: object, committed: readonly CommittedEvent[]) {
    const seed = initial?.get(init);
    if (seed === undefined) return;
    // LOAD_STATE owns these setup observations. They are not independently
    // committed actions and their seq is not an engine.action log sequence.
    const load = [...committed].reverse().find(({ event }) => {
      if (event.type !== "LOAD_STATE") return false;
      const battle = event.payload.battle;
      return typeof battle === "object" && battle !== null && "init" in battle && battle.init === init;
    });
    if (load !== undefined) this.append({ seq: load.seq, events: seed });
  }

  /** Retains each applied batch once, in durable seq/index order. */
  append(batch: { readonly seq: number; readonly events: readonly EngineEvent[] }): void {
    if (this.sequences.has(batch.seq)) return;
    this.sequences.add(batch.seq);
    this.events.push(...probeEvents(batch));
    this.events.sort((left, right) => left.seq - right.seq || left.index - right.index);
  }
}

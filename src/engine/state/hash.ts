import type { Variant } from "../dsl/types";
import type { BattleState, CardInstance, CardStatus, Printing } from "./types";

/** A stable hash of a complete battle state. */
export type StateHash = string & { readonly __brand: "EngineStateHash" };

/**
 * A 53-bit string hash (cyrb53) of the UTF-16 code units of `text`.
 * Deterministic across platforms.
 */
export function hashString(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  return digest(h1, h2);
}

/** cyrb53's finalizer: two 32-bit lanes to a 53-bit integer. */
function digest(lane1: number, lane2: number): number {
  let h1 = lane1;
  let h2 = lane2;
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Serializes a battle state as plain JSON. */
export function serializeState(state: BattleState): string {
  return JSON.stringify(state);
}

export function deserializeState(text: string): BattleState {
  return JSON.parse(text) as BattleState;
}

const TAG_KEY = 0x6b;
const TAG_STRING = 0x73;
const TAG_INTEGER = 0x2b1d;
const TAG_FLOAT = 0x7f4a7c15;
const TAG_ARRAY = 0x5b;
const TAG_OBJECT = 0x7b;
const TAG_INSTANCE = 0x1d;
const NULL_A = 0x1b873593;
const NULL_B = 0x2c1b3c6d;
const TRUE_A = 0x3c6ef372;
const TRUE_B = 0x5be0cd19;
const FALSE_A = 0x510e527f;
const FALSE_B = 0x1f83d9ab;

/** murmur3's 32-bit finalizer. */
function fmix(value: number): number {
  let h = value;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/*
 * Every field of `CardInstance`, `CardStatus`, and `Variant`, all of which
 * `StructuralHasher.instance` feeds: the compiler flags a field added to one
 * of these interfaces, and `instance` must feed it too.
 */
const INSTANCE_FIELDS = {
  id: true,
  printing: true,
  owner: true,
  controller: true,
  zone: true,
  variant: true,
  status: true,
  enteredZoneAt: true,
} as const satisfies Record<keyof CardInstance, true>;

const STATUS_FIELDS = {
  exhausted: true,
  gainedSpark: true,
  counters: true,
  created: true,
  reclaimed: true,
  offering: true,
  ephemeral: true,
  x: true,
} as const satisfies Record<keyof CardStatus, true>;

const VARIANT_FIELDS = { amplified: true, transfigurations: true, deckMods: true } as const satisfies Record<
  keyof Variant,
  true
>;

/** The values `StructuralHasher.instance` feeds, the variant and status expanded, mixed into its seed. */
const INSTANCE_ARITY =
  Object.keys(INSTANCE_FIELDS).length -
  2 +
  Object.keys(VARIANT_FIELDS).length +
  Object.keys(STATUS_FIELDS).length;

type RecordKind = "data" | "state" | "instances";

/**
 * Structural hashing of plain data, one hasher per hash. `node` hashes one
 * value into the two 32-bit lanes `laneA` and `laneB`: a string by its code
 * units, a number by its value, an array by its elements in order, and an
 * object by the sum of a mixed hash of each entry's key and value, so key
 * insertion order never matters and no keys are sorted. Distinct type tags
 * keep `"1"`, `1`, `[]`, and `{}` apart. It follows JSON semantics, so a
 * value and its JSON round trip hash equally: an `undefined` or function
 * object entry is skipped; an `undefined` or function array element, a
 * non-finite number, and `null` hash alike; and `-0` hashes as `0`. Leaf
 * lanes are left unmixed: the entry, element, and object steps that consume
 * them mix them.
 *
 * A card instance is hashed as one ordered sequence of its field values,
 * with no keys, since its fields are all required and fixed; `seqA` and
 * `seqB` are the running hashes of that sequence.
 */
class StructuralHasher {
  laneA = 0;
  laneB = 0;
  private seqA = 0;
  private seqB = 0;

  /** A hex digest of the lanes. */
  hex<H extends string>(): H {
    return digest(this.laneA, this.laneB).toString(16).padStart(14, "0") as H;
  }

  /** A string's lanes: cyrb53's running hashes, each with the string's length. */
  string(text: string, tag: number): void {
    let h1 = 0xdeadbeef ^ tag;
    let h2 = 0x41c6ce57 ^ tag;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    this.laneA = h1 ^ text.length;
    this.laneB = h2 ^ Math.imul(text.length, 0x9e3779b1);
  }

  node(value: unknown): void {
    switch (typeof value) {
      case "string":
        this.string(value, TAG_STRING);
        return;
      case "number":
        if (!Number.isFinite(value)) break;
        if ((value | 0) === value) {
          this.laneA = Math.imul(value ^ TAG_INTEGER, 0xcc9e2d51);
          this.laneB = Math.imul(value, 0x1b873593) ^ TAG_INTEGER;
        } else {
          // The shortest round-trip text of a double is exact and platform independent.
          this.string(String(value), TAG_FLOAT);
        }
        return;
      case "boolean":
        this.laneA = value ? TRUE_A : FALSE_A;
        this.laneB = value ? TRUE_B : FALSE_B;
        return;
      case "object":
        if (value === null) break;
        if (Array.isArray(value)) this.array(value);
        else this.record(value as Readonly<Record<string, unknown>>, "data");
        return;
      default:
        break;
    }
    this.laneA = NULL_A;
    this.laneB = NULL_B;
  }

  /** One ordered step of a running hash over the lanes (murmur3's block step, one rotation). */
  private stepA(hash: number): number {
    const h = Math.imul(hash ^ this.laneA, 0xcc9e2d51);
    return (h << 13) | (h >>> 19);
  }

  private stepB(hash: number): number {
    const h = Math.imul(hash ^ this.laneB, 0x1b873593);
    return (h << 15) | (h >>> 17);
  }

  /** A sequence's lanes from its two running hashes. */
  private closeSequence(a: number, b: number): void {
    this.laneA = fmix(a ^ b);
    this.laneB = fmix(b + Math.imul(a, 0x85ebca6b));
  }

  private array(items: readonly unknown[]): void {
    let a = TAG_ARRAY ^ items.length;
    let b = Math.imul(TAG_ARRAY, 0x9e3779b1) ^ items.length;
    for (let index = 0; index < items.length; index++) {
      this.node(items[index]);
      a = this.stepA(a);
      b = this.stepB(b);
    }
    this.closeSequence(a, b);
  }

  /**
   * An object's lanes. The values of a `"data"` object are plain data; of an
   * `"instances"` object, card instances; and of a `"state"` object, plain
   * data except for its `instances`.
   */
  record(record: Readonly<Record<string, unknown>>, kind: RecordKind): void {
    let sumA = 0;
    let sumB = 0;
    let count = 0;
    for (const key in record) {
      const value = record[key];
      if (value === undefined || typeof value === "function") continue;
      if (kind === "instances") this.instance(value as CardInstance);
      else if (kind === "state" && key === "instances")
        this.record(value as Readonly<Record<string, unknown>>, "instances");
      else this.node(value);
      const valueA = this.laneA;
      const valueB = this.laneB;
      this.string(key, TAG_KEY);
      sumA =
        (sumA + fmix(Math.imul(this.laneA ^ valueA, 0xcc9e2d51) + valueB)) | 0;
      sumB =
        (sumB + fmix(Math.imul(this.laneB ^ valueB, 0x1b873593) + valueA)) | 0;
      count += 1;
    }
    this.laneA = fmix(sumA ^ TAG_OBJECT ^ Math.imul(count, 0x9e3779b1));
    this.laneB = fmix(sumB + Math.imul(TAG_OBJECT ^ count, 0x85ebca6b));
  }

  /** Feeds a value to the running instance sequence. */
  private feed(value: unknown): void {
    this.node(value);
    this.seqA = this.stepA(this.seqA);
    this.seqB = this.stepB(this.seqB);
  }

  /** Feeds a printing's kind, then its fields for that kind. */
  private feedPrinting(printing: Printing): void {
    this.feed(printing.kind);
    switch (printing.kind) {
      case "card":
        this.feed(printing.cardId);
        break;
      case "figment":
        this.feed(printing.figment);
        this.feed(printing.spark);
        break;
      case "figmentCopy":
        this.feed(printing.cardId);
        this.feed(printing.spark);
        break;
      default:
        this.feed(printing);
    }
  }

  private instance(instance: CardInstance): void {
    const { status } = instance;
    this.seqA = TAG_INSTANCE ^ INSTANCE_ARITY;
    this.seqB = Math.imul(TAG_INSTANCE, 0x9e3779b1) ^ INSTANCE_ARITY;
    this.feed(instance.id);
    this.feedPrinting(instance.printing);
    this.feed(instance.owner);
    this.feed(instance.controller);
    this.feed(instance.zone);
    this.feed(instance.variant.amplified);
    this.feed(instance.variant.transfigurations);
    this.feed(instance.variant.deckMods);
    this.feed(status.exhausted);
    this.feed(status.gainedSpark);
    this.feed(status.counters);
    this.feed(status.created);
    this.feed(status.reclaimed);
    this.feed(status.offering);
    this.feed(status.ephemeral);
    this.feed(status.x);
    this.feed(instance.enteredZoneAt);
    this.closeSequence(this.seqA, this.seqB);
  }
}

/**
 * A stable hash of the complete state, as a 14-digit hex string: the
 * structural hash of `canonicalHash`, with each card instance hashed as the
 * sequence of its field values. States equal as data hash equally, whatever
 * their key insertion order, and a state hashes as its JSON round trip does.
 */
export function stateHash(state: BattleState): StateHash {
  const hasher = new StructuralHasher();
  hasher.record(state as unknown as Readonly<Record<string, unknown>>, "state");
  return hasher.hex<StateHash>();
}

/**
 * A 53-bit structural hash of any plain data, as a 14-digit hex string of
 * the hash type `H` the caller names: values equal as data hash equally
 * whatever their key insertion order, and a value hashes as its JSON round
 * trip does.
 */
export function canonicalHash<H extends string>(value: unknown): H {
  const hasher = new StructuralHasher();
  hasher.node(value);
  return hasher.hex<H>();
}

/**
 * Restores the shared jsdom globals at the start of every test file.
 *
 * The shared Vitest project runs test files with `isolate: false`, so one
 * jsdom window serves every file a worker runs. Test files freely replace
 * `window.matchMedia`, `requestAnimationFrame`, `ResizeObserver`,
 * `visualViewport`, and prototype methods such as `getBoundingClientRect`.
 * The setup file calls {@link restoreDomGlobals} before each file loads, which
 * puts every one of those properties back to the value the fresh window had,
 * so no file observes another file's stubs.
 */

type Snapshot = Map<string | symbol, PropertyDescriptor>;

interface DomSnapshot {
  readonly document: Document;
  readonly targets: ReadonlyArray<readonly [object, Snapshot]>;
  /** Values read through the jsdom global accessors, which store overrides. */
  readonly globalValues: ReadonlyMap<string | symbol, unknown>;
}

const SNAPSHOT_KEY = Symbol.for("dreamtides.testing.domSnapshot");

type SnapshotHolder = { [SNAPSHOT_KEY]?: DomSnapshot };

/** Own properties on these objects are the ones tests replace in practice. */
function snapshotTargets(): object[] {
  return [
    globalThis,
    document,
    navigator,
    EventTarget.prototype,
    Node.prototype,
    Element.prototype,
    HTMLElement.prototype,
    SVGElement.prototype,
    HTMLCanvasElement.prototype,
    HTMLImageElement.prototype,
    HTMLInputElement.prototype,
    Document.prototype,
  ];
}

function ownDescriptors(target: object): Snapshot {
  const snapshot: Snapshot = new Map();
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (descriptor !== undefined) snapshot.set(key, descriptor);
  }
  return snapshot;
}

function sameDescriptor(
  left: PropertyDescriptor | undefined,
  right: PropertyDescriptor,
): boolean {
  return (
    left !== undefined &&
    left.get === right.get &&
    left.set === right.set &&
    Object.is(left.value, right.value) &&
    left.writable === right.writable &&
    left.enumerable === right.enumerable &&
    left.configurable === right.configurable
  );
}

/** Test-runner and React bookkeeping that is not test-local state. */
function isRunnerGlobal(key: string | symbol): boolean {
  return (
    typeof key === "symbol" ||
    key.startsWith("__") ||
    key === "IS_REACT_ACT_ENVIRONMENT"
  );
}

function takeSnapshot(): DomSnapshot {
  const targets = snapshotTargets().map(
    (target) => [target, ownDescriptors(target)] as const,
  );
  const globalValues = new Map<string | symbol, unknown>();
  for (const [key, descriptor] of ownDescriptors(globalThis)) {
    if (descriptor.get !== undefined && descriptor.set !== undefined) {
      globalValues.set(key, Reflect.get(globalThis, key));
    }
  }
  return { document, targets, globalValues };
}

function restoreTarget(target: object, snapshot: Snapshot): void {
  const isGlobal = target === globalThis;
  for (const key of Reflect.ownKeys(target)) {
    if (snapshot.has(key) || (isGlobal && isRunnerGlobal(key))) continue;
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (descriptor?.configurable === true) Reflect.deleteProperty(target, key);
  }
  for (const [key, descriptor] of snapshot) {
    if (sameDescriptor(Reflect.getOwnPropertyDescriptor(target, key), descriptor)) {
      continue;
    }
    if (Reflect.getOwnPropertyDescriptor(target, key)?.configurable !== false) {
      Reflect.defineProperty(target, key, descriptor);
    }
  }
}

/**
 * Snapshots the jsdom globals the first time a window is seen, and restores
 * them on every later call within that window.
 */
export function restoreDomGlobals(): void {
  const holder = globalThis as typeof globalThis & SnapshotHolder;
  const snapshot = holder[SNAPSHOT_KEY];
  if (snapshot === undefined || snapshot.document !== document) {
    holder[SNAPSHOT_KEY] = takeSnapshot();
    return;
  }
  for (const [target, properties] of snapshot.targets) {
    restoreTarget(target, properties);
  }
  // jsdom's global accessors keep assigned values in a private override map,
  // so `window.matchMedia = stub` leaves the descriptor untouched. Assigning
  // the original value back clears such overrides.
  for (const [key, value] of snapshot.globalValues) {
    if (!Object.is(Reflect.get(globalThis, key), value)) {
      Reflect.set(globalThis, key, value);
    }
  }
  document.body.innerHTML = "";
}

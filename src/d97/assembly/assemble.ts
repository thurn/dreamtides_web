// Act assembly (Appendix B §B4 steps 3–6, §B7): one act of a run, drawn from
// the dream catalog by a stream keyed by the run seed, the act's number and a
// seed salt. Pure: the same seed, catalog and shape always assemble the same
// act. Each attempt:
//
// 1. draws dreams, the start dream first, then the rest of the catalog in
//    shuffled order, skipping a repeated tileset, one that would carry the
//    act past its challenger maximum, and one that would close the draw short
//    of its categories, until it holds its minimum dreams and challenger
//    anchors; the draw must span the shape's categories and guardian anchors;
// 2. chooses the incarnation's dream among the drawn dreams other than the
//    entry dream, and the incarnation's guardian anchor in it; the door that
//    anchor blocks is the act's exit door;
// 3. joins the dreams with a random spanning tree over free door anchors (a
//    dream's doors on its own map but its town door and the exit door),
//    attaching each dream, the incarnation's last, through its town door to a
//    free door of a dream already placed, preferring one of a different
//    category and then a door a guardian blocks (decision P33: the forward
//    route's first arrival in every dream is its town); then adds loop doors
//    between dreams with free doors left, preferring different categories;
// 4. seats the incarnation, then the guardians each dream module authors as
//    optional Avatar guardians, then chokepoint Avatar guardians on the route
//    passing the fewest until every route passes `g`, then optional Avatar
//    guardians up to a drawn total; the rest stay empty;
// 5. fills challenger anchors (§B7): an authored challenger stays; an empty
//    anchor takes a generic challenger with one of its dream's personas, drawn
//    without repeats until they run out, and a uniformly drawn deck source
//    Avatar; a dream without personas leaves it empty;
// 6. binds each quest of the act's dreams to its anchors (§B15);
// 7. validates the act (./validate.ts). A finding fails the attempt, and the
//    next salt tries again, up to the shape's retry limit.
//
// A start dream outside the catalog, or a catalog that cannot supply the
// act's shape at all (too few dreams, tilesets, categories, guardian or
// challenger anchors), plays as its start dream alone: the one-dream act,
// whose exit door and incarnation seat are the dream module's own exit door
// and exit guardian (`oneDreamAct`). A save from before assembly is given the
// same act on load (src/d97/save/reconcile.ts).

import { sha256 } from "js-sha256";
import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import { parseD97ActId, type D97ActId, type D97DreamId, type D97RunSeed, type DreamAnchorId } from "../../types/identifiers";
import type {
  D97Act,
  D97ActCatalog,
  D97ActCatalogDream,
  D97ActFallback,
  D97ActShape,
  D97ActStartDream,
  D97ChallengerSeat,
  D97DoorEnd,
  D97DoorLink,
  D97GuardianSeat,
  D97QuestBinding,
} from "./types";
import { actRoutes, fewestGuardiansRoute, townDoorOf, validateAct, type D97ActDreamAnchors, type D97ActFinding } from "./validate";

/** One failed attempt: its salt and why it failed. */
export interface D97ActAttemptFailure {
  readonly salt: number;
  /** Validator findings, or a single draw finding when the attempt stopped early. */
  readonly findings: readonly (D97ActFinding | D97ActDrawFinding)[];
}

/** Why an attempt stopped before it had an act to validate. */
export interface D97ActDrawFinding {
  readonly code: "draw-shape" | "no-incarnation" | "no-free-door";
  readonly dreamId: D97DreamId | null;
  readonly ref: string;
}

/**
 * An assembled act with the attempts that failed before it, and, for a
 * catalog short of the act's shape, what it lacks; or every failed attempt.
 */
export type D97ActAssembly =
  | {
      readonly ok: true;
      readonly act: D97Act;
      readonly failures: readonly D97ActAttemptFailure[];
      readonly shortfall: D97ActShortfall | null;
    }
  | { readonly ok: false; readonly failures: readonly D97ActAttemptFailure[] };

/** What a catalog short of the act's shape lacks. */
export type D97ActShortfall = "dreams" | "tilesets" | "categories" | "guardianAnchors" | "challengerAnchors";

export interface D97ActAssemblyInput {
  readonly runSeed: D97RunSeed;
  readonly number: number;
  readonly start: D97ActStartDream;
  readonly catalog: D97ActCatalog;
  readonly shape: D97ActShape;
}

/** The act's UUID, derived from the run seed and the act's number. */
export function actIdFor(runSeed: D97RunSeed, number: number): D97ActId {
  const hex = sha256(`${runSeed}|act|${String(number)}`);
  return parseD97ActId(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`);
}

/** A [0, 1) stream keyed by the run seed, the act's number and a salt. */
function saltStream(runSeed: D97RunSeed, number: number, salt: number): () => number {
  let index = 0;
  return () => Number.parseInt(sha256(`${runSeed}|act|${String(number)}|salt|${String(salt)}|${String(index++)}`).slice(0, 13), 16) / 0x10000000000000;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const held = out[i];
    out[i] = out[j];
    out[j] = held;
  }
  return out;
}

function pickOne<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function between(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1));
}

const challengerCount = (entry: { readonly anchors: D97ActStartDream["anchors"] }) => entry.anchors.filter((anchor) => anchor.kind === "challenger").length;
const guardianCount = (entry: { readonly anchors: D97ActStartDream["anchors"] }) => entry.anchors.filter((anchor) => anchor.kind === "guardian").length;

/** Whether `dream` authors a resident at `anchorId`. */
function authored(dream: D97DreamDefinition, anchorId: DreamAnchorId): boolean {
  return dream.residents.some((resident) => resident.anchorId === anchorId);
}

/** Challenger seats of one dream (§B7). */
function fillChallengers(start: D97ActStartDream, catalog: D97ActCatalog, random: () => number): D97ChallengerSeat[] {
  const { dream } = start;
  let personas = shuffled(start.personas, random);
  const seats: D97ChallengerSeat[] = [];
  for (const anchor of start.anchors) {
    if (anchor.kind !== "challenger") continue;
    if (authored(dream, anchor.id)) {
      seats.push({ dreamId: dream.id, anchorId: anchor.id, occupant: { kind: "resident" } });
      continue;
    }
    if (personas.length === 0) personas = shuffled(start.personas, random);
    const persona = personas.shift();
    const deckSourceAvatarId = pickOne(catalog.deckSourceAvatarIds, random);
    if (persona === undefined || deckSourceAvatarId === undefined) continue;
    seats.push({
      dreamId: dream.id,
      anchorId: anchor.id,
      occupant: { kind: "generic", characterId: persona.characterId, dialogueId: persona.dialogueId ?? null, deckSourceAvatarId },
    });
  }
  return seats;
}

/** Quest bindings of one dream: every role in its own dream (§B15). */
function bindQuests(start: D97ActStartDream): D97QuestBinding[] {
  return start.quests.map((quest) => ({
    questId: quest.questId,
    roles: quest.roles.map((role) => ({
      role: role.role,
      stepId: role.role === "step" ? role.stepId : null,
      dreamId: start.dream.id,
      anchorId: role.anchorId,
    })),
  }));
}

function startOf(entry: D97ActCatalogDream): D97ActStartDream {
  return { dream: entry.dream, anchors: entry.anchors, personas: entry.dream.personas, quests: entry.dream.quests };
}

/**
 * The one-dream act of `start`: no doors, the dream module's exit door and
 * exit guardian as the exit door and the incarnation seat, every other
 * authored guardian an optional Avatar guardian, the rest empty, and its
 * challenger anchors and quests filled and bound as in an assembled act.
 */
export function oneDreamAct(input: {
  readonly runSeed: D97RunSeed;
  readonly number: number;
  readonly start: D97ActStartDream;
  readonly deckSourceAvatarIds: D97ActCatalog["deckSourceAvatarIds"];
  readonly fallback: D97ActFallback;
}): D97Act {
  const { start } = input;
  const { dream } = start;
  const random = saltStream(input.runSeed, input.number, 0);
  const guardianIds = [...new Set([dream.topology.exitGuardianAnchorId, ...start.anchors.filter((anchor) => anchor.kind === "guardian").map((anchor) => anchor.id)])];
  const guardians: D97GuardianSeat[] = guardianIds.map((anchorId) => {
    const isAuthored = authored(dream, anchorId);
    const seat = anchorId === dream.topology.exitGuardianAnchorId ? "incarnation" : isAuthored ? "optional" : "empty";
    return { dreamId: dream.id, anchorId, seat, authored: isAuthored };
  });
  return {
    actId: actIdFor(input.runSeed, input.number),
    number: input.number,
    salt: 0,
    fallback: input.fallback,
    entryDreamId: dream.id,
    incarnationDreamId: dream.id,
    dreamIds: [dream.id],
    doors: [],
    exitDoor: { dreamId: dream.id, anchorId: dream.topology.exitDoorAnchorId },
    guardians,
    challengers: fillChallengers(start, { dreams: [], deckSourceAvatarIds: input.deckSourceAvatarIds }, random),
    quests: bindQuests(start),
  };
}

/** Why `catalog` cannot supply `shape` at all, or null when an attempt may succeed. */
function shortfall(catalog: D97ActCatalog, shape: D97ActShape): D97ActShortfall | null {
  const { dreams } = catalog;
  if (dreams.length < shape.dreams.min) return "dreams";
  if (new Set(dreams.map((entry) => entry.dream.tilesetId)).size < shape.dreams.min) return "tilesets";
  if (new Set(dreams.map((entry) => entry.category)).size < shape.minCategories) return "categories";
  if (dreams.reduce((sum, entry) => sum + guardianCount(entry), 0) < shape.minGuardianAnchors) return "guardianAnchors";
  if (dreams.reduce((sum, entry) => sum + challengerCount(entry), 0) < shape.challengerAnchors.min) return "challengerAnchors";
  return null;
}

/** Step 1: the drawn dreams, the start dream first, or a draw finding. */
function drawDreams(start: D97ActCatalogDream, catalog: D97ActCatalog, shape: D97ActShape, random: () => number): D97ActCatalogDream[] | D97ActDrawFinding {
  const drawn = [start];
  const tilesets = new Set([start.dream.tilesetId]);
  let challengers = challengerCount(start);
  const done = (count: number, total: number) => count >= shape.dreams.min && total >= shape.challengerAnchors.min;
  for (const entry of shuffled(catalog.dreams.filter((candidate) => candidate.dream.id !== start.dream.id), random)) {
    if (done(drawn.length, challengers) || drawn.length >= shape.dreams.max) break;
    if (tilesets.has(entry.dream.tilesetId) || challengers + challengerCount(entry) > shape.challengerAnchors.max) continue;
    // A dream that would close the draw short of the act's categories waits for one that does not.
    const categories = new Set([...drawn, entry].map((candidate) => candidate.category)).size;
    if (done(drawn.length + 1, challengers + challengerCount(entry)) && categories < shape.minCategories) continue;
    drawn.push(entry);
    tilesets.add(entry.dream.tilesetId);
    challengers += challengerCount(entry);
  }
  const short = (ref: string): D97ActDrawFinding => ({ code: "draw-shape", dreamId: null, ref });
  if (drawn.length < shape.dreams.min) return short("dreams");
  if (challengers < shape.challengerAnchors.min) return short("challengerAnchors");
  if (new Set(drawn.map((entry) => entry.category)).size < shape.minCategories) return short("categories");
  if (drawn.reduce((sum, entry) => sum + guardianCount(entry), 0) < shape.minGuardianAnchors) return short("guardianAnchors");
  return drawn;
}

/** The door anchors on `entry`'s own map. */
function doorAnchors(entry: D97ActCatalogDream): DreamAnchorId[] {
  return entry.anchors.filter((anchor) => anchor.kind === "door" && anchor.roomId === null).map((anchor) => anchor.id);
}

/** Pick among `items`, preferring those `preferred` accepts. */
function pickPreferring<T>(items: readonly T[], preferred: (item: T) => boolean, random: () => number): T | undefined {
  const better = items.filter(preferred);
  return pickOne(better.length > 0 ? better : items, random);
}

function attempt(input: D97ActAssemblyInput, start: D97ActCatalogDream, salt: number): D97Act | D97ActAttemptFailure {
  const { shape, catalog } = input;
  const random = saltStream(input.runSeed, input.number, salt);
  const fail = (finding: D97ActDrawFinding): D97ActAttemptFailure => ({ salt, findings: [finding] });

  const drawn = drawDreams(start, catalog, shape, random);
  if (!Array.isArray(drawn)) return fail(drawn);
  const entryId = start.dream.id;

  // Step 2: the incarnation's dream and guardian anchor, and the exit door.
  const seats = drawn.flatMap((entry) =>
    entry.dream.id === entryId
      ? []
      : entry.anchors.flatMap((anchor) => {
          const door = anchor.blocksDoor;
          return anchor.kind === "guardian" && door !== undefined && doorAnchors(entry).includes(door) && door !== townDoorOf(entry.dream)
            ? [{ entry, anchorId: anchor.id, door }]
            : [];
        }),
  );
  const incarnation = pickOne(seats, random);
  if (incarnation === undefined) return fail({ code: "no-incarnation", dreamId: null, ref: "guardianAnchors" });
  const exitDoor: D97DoorEnd = { dreamId: incarnation.entry.dream.id, anchorId: incarnation.door };

  // Step 3: the spanning tree through town doors, then loop doors.
  const free = new Map<D97DreamId, DreamAnchorId[]>(
    drawn.map((entry) => [
      entry.dream.id,
      doorAnchors(entry).filter((anchorId) => anchorId !== townDoorOf(entry.dream) && !(entry.dream.id === exitDoor.dreamId && anchorId === exitDoor.anchorId)),
    ]),
  );
  const takeFree = (dreamId: D97DreamId): DreamAnchorId | undefined => {
    const doors = free.get(dreamId) ?? [];
    const anchorId = pickOne(doors, random);
    if (anchorId !== undefined) free.set(dreamId, doors.filter((candidate) => candidate !== anchorId));
    return anchorId;
  };
  const category = new Map(drawn.map((entry) => [entry.dream.id, entry.category]));
  const others = shuffled(drawn.filter((entry) => entry.dream.id !== entryId && entry !== incarnation.entry), random);
  const placed: D97DreamId[] = [entryId];
  const doors: D97DoorLink[] = [];
  const guarded = new Set(
    drawn.flatMap((entry) => entry.anchors.flatMap((anchor) => (anchor.kind === "guardian" && anchor.blocksDoor !== undefined ? [`${entry.dream.id}/${anchor.blocksDoor}`] : []))),
  );
  for (const entry of [...others, incarnation.entry]) {
    const dreamId = entry.dream.id;
    const town = townDoorOf(entry.dream);
    // A free door of a placed dream, preferring another category, then a door
    // a guardian blocks, so the tree's routes run through chokepoints.
    const options = placed.flatMap((parent) => (free.get(parent) ?? []).map((anchorId) => ({ parent, anchorId })));
    const across = options.filter(({ parent }) => category.get(parent) !== entry.category);
    const choice = pickPreferring(across.length > 0 ? across : options, ({ parent, anchorId }) => guarded.has(`${parent}/${anchorId}`), random);
    if (choice === undefined || !doorAnchors(entry).includes(town)) return fail({ code: "no-free-door", dreamId, ref: dreamId });
    free.set(choice.parent, (free.get(choice.parent) ?? []).filter((anchorId) => anchorId !== choice.anchorId));
    doors.push({ kind: "tree", from: { dreamId: choice.parent, anchorId: choice.anchorId }, to: { dreamId, anchorId: town } });
    placed.push(dreamId);
  }
  const linked = (a: D97DreamId, b: D97DreamId) =>
    doors.some((door) => (door.from.dreamId === a && door.to.dreamId === b) || (door.from.dreamId === b && door.to.dreamId === a));
  const loops = between(shape.loopDoors.min, shape.loopDoors.max, random);
  for (let index = 0; index < loops; index += 1) {
    const open = placed.filter((dreamId) => (free.get(dreamId)?.length ?? 0) > 0);
    const pairs = open.flatMap((a, i) => open.slice(i + 1).flatMap((b) => (linked(a, b) ? [] : [[a, b] as const])));
    const pair = pickPreferring(pairs, ([a, b]) => category.get(a) !== category.get(b), random);
    if (pair === undefined) break;
    const fromAnchor = takeFree(pair[0]);
    const toAnchor = takeFree(pair[1]);
    if (fromAnchor === undefined || toAnchor === undefined) break;
    doors.push({ kind: "loop", from: { dreamId: pair[0], anchorId: fromAnchor }, to: { dreamId: pair[1], anchorId: toAnchor } });
  }

  // Step 4: guardian seats.
  const order = drawn.map((entry) => entry.dream.id);
  const guardians = new Map<string, D97GuardianSeat>();
  const key = (dreamId: D97DreamId, anchorId: DreamAnchorId) => `${dreamId}/${anchorId}`;
  for (const entry of drawn) {
    for (const anchor of entry.anchors) {
      if (anchor.kind !== "guardian") continue;
      const isAuthored = authored(entry.dream, anchor.id);
      const isIncarnation = entry === incarnation.entry && anchor.id === incarnation.anchorId;
      guardians.set(key(entry.dream.id, anchor.id), {
        dreamId: entry.dream.id,
        anchorId: anchor.id,
        seat: isIncarnation ? "incarnation" : isAuthored ? "optional" : "empty",
        authored: isAuthored,
      });
    }
  }
  const dreamsById = new Map<D97DreamId, D97ActDreamAnchors>(drawn.map((entry) => [entry.dream.id, entry]));
  const avatarCount = () => [...guardians.values()].filter((seat) => seat.seat === "chokepoint" || seat.seat === "optional").length;
  const routesOf = () => actRoutes({ entryDreamId: entryId, dreamIds: order, doors, guardians: [...guardians.values()] }, dreamsById);
  for (;;) {
    const routes = routesOf();
    const route = fewestGuardiansRoute(routes, incarnation.entry.dream.id);
    if (route === null || route.count >= shape.chokepointGuardians || avatarCount() >= shape.avatarGuardians.max) break;
    const open = route.doors.flatMap((door) =>
      [door.from, door.to].flatMap((end) => {
        const guard = routes.guardOf(end);
        const seat = guard === null ? undefined : guardians.get(key(end.dreamId, guard));
        return seat?.seat === "empty" ? [seat] : [];
      }),
    );
    const chosen = pickOne(open, random);
    if (chosen === undefined) break;
    guardians.set(key(chosen.dreamId, chosen.anchorId), { ...chosen, seat: "chokepoint" });
  }
  const target = between(Math.min(Math.max(shape.avatarGuardians.min, avatarCount()), shape.avatarGuardians.max), shape.avatarGuardians.max, random);
  for (const seat of shuffled([...guardians.values()].filter((candidate) => candidate.seat === "empty"), random)) {
    if (avatarCount() >= target) break;
    guardians.set(key(seat.dreamId, seat.anchorId), { ...seat, seat: "optional" });
  }

  // Steps 5 and 6: challengers and quests.
  const act: D97Act = {
    actId: actIdFor(input.runSeed, input.number),
    number: input.number,
    salt,
    fallback: null,
    entryDreamId: entryId,
    incarnationDreamId: incarnation.entry.dream.id,
    dreamIds: order,
    doors,
    exitDoor,
    guardians: [...guardians.values()],
    challengers: drawn.flatMap((entry) => fillChallengers(startOf(entry), catalog, random)),
    quests: drawn.flatMap((entry) => bindQuests(startOf(entry))),
  };

  // Step 7: validation.
  const findings = validateAct(act, dreamsById, shape);
  return findings.length === 0 ? act : { salt, findings };
}

/**
 * Assemble act `number` of a run from its seed: the one-dream act of a start
 * dream outside the catalog or of a catalog short of the act's shape, or the
 * first attempt whose act validates, salts 0 up to the retry limit, with the
 * attempts that failed before it. When every salt fails, the result is not
 * ok and lists each failure.
 */
export function assembleAct(input: D97ActAssemblyInput): D97ActAssembly {
  const { catalog, shape } = input;
  const one = (fallback: D97ActFallback) => oneDreamAct({ ...input, deckSourceAvatarIds: catalog.deckSourceAvatarIds, fallback });
  const start = catalog.dreams.find((entry) => entry.dream.id === input.start.dream.id);
  if (start === undefined) return { ok: true, act: one("startOutsideCatalog"), failures: [], shortfall: null };
  const short = shortfall(catalog, shape);
  if (short !== null) return { ok: true, act: one("shortCatalog"), failures: [], shortfall: short };
  const failures: D97ActAttemptFailure[] = [];
  for (let salt = 0; salt < shape.retryLimit; salt += 1) {
    const result = attempt(input, start, salt);
    if ("actId" in result) return { ok: true, act: result, failures, shortfall: null };
    failures.push(result);
  }
  return { ok: false, failures };
}

/**
 * Structural copies of plain JSON data, equal as data to a JSON round trip
 * (`JSON.parse(JSON.stringify(value))`) and sharing nothing with the source.
 *
 * `cloneState` copies the parts of a battle state that dominate its size
 * (instances, zones, the Dreamwell) with typed object literals and every
 * other part with `copyJson`. Typed copies cover only interfaces whose
 * fields are all required, so the compiler flags a field added to one; an
 * interface with optional fields or union members goes through `copyJson`.
 */
import type {
  AvatarEmblem,
  BattleState,
  CardInstance,
  CardStatus,
  DreamwellState,
  Printing,
  SideState,
  TurnState,
} from "./types";
import type { Variant } from "../dsl/types";

/**
 * A deep copy of plain data with JSON semantics: an `undefined` or function
 * object entry is left out, an `undefined` or function array element and a
 * non-finite number become `null`, and `-0` becomes `0`.
 */
export function copyJson<T>(value: T): T {
  return copyValue(value) as T;
}

function copyValue(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    if (typeof value === "number")
      return Number.isFinite(value) ? value + 0 : null;
    return typeof value === "function" ? undefined : value;
  }
  if (Array.isArray(value)) {
    const length = value.length;
    const result: unknown[] = new Array<unknown>(length);
    for (let index = 0; index < length; index++) {
      const element: unknown = value[index];
      result[index] =
        element === undefined || typeof element === "function"
          ? null
          : copyValue(element);
    }
    return result;
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key in record) {
    const entry = record[key];
    if (entry === undefined || typeof entry === "function") continue;
    result[key] = copyValue(entry);
  }
  return result;
}

function copyStatus(status: CardStatus): CardStatus {
  return {
    exhausted: status.exhausted,
    gainedSpark: status.gainedSpark,
    counters: status.counters,
    created: status.created,
    reclaimed: status.reclaimed,
    offering: status.offering,
    ephemeral: status.ephemeral,
    x: status.x,
  };
}

function copyPrinting(printing: Printing): Printing {
  switch (printing.kind) {
    case "card":
      return { kind: printing.kind, cardId: printing.cardId };
    case "figment":
      return {
        kind: printing.kind,
        figment: printing.figment,
        spark: printing.spark,
      };
    case "figmentCopy":
      return {
        kind: printing.kind,
        cardId: printing.cardId,
        spark: printing.spark,
      };
    default:
      return copyJson(printing);
  }
}

/** A variant: the plain `{ amplified }` shape typed, a modified one (optional fields) by `copyJson`. */
function copyVariant(variant: Variant): Variant {
  return variant.transfigurations === undefined && variant.deckMods === undefined
    ? { amplified: variant.amplified }
    : copyJson(variant);
}

function copyInstance(instance: CardInstance): CardInstance {
  return {
    id: instance.id,
    printing: copyPrinting(instance.printing),
    owner: instance.owner,
    controller: instance.controller,
    zone: instance.zone,
    variant: copyVariant(instance.variant),
    status: copyStatus(instance.status),
    enteredZoneAt: instance.enteredZoneAt,
  };
}

function copyInstances(
  instances: BattleState["instances"],
): BattleState["instances"] {
  const result: BattleState["instances"] = {};
  for (const id in instances) {
    const key = id as keyof typeof instances;
    result[key] = copyInstance(instances[key]);
  }
  return result;
}

function copyAvatar(avatar: AvatarEmblem | null): AvatarEmblem | null {
  return avatar === null
    ? null
    : { id: avatar.id, exhausted: avatar.exhausted };
}

function copySide(side: SideState): SideState {
  return {
    score: side.score,
    currentEnergy: side.currentEnergy,
    maxEnergy: side.maxEnergy,
    fatigueCount: side.fatigueCount,
    deck: side.deck.slice(),
    hand: side.hand.slice(),
    void: side.void.slice(),
    banished: side.banished.slice(),
    backRank: side.backRank.slice(),
    frontRank: side.frontRank.slice(),
    avatar: copyAvatar(side.avatar),
    dreamsigns: side.dreamsigns.map((dreamsign) => ({ id: dreamsign.id })),
  };
}

function copyTurn(turn: TurnState): TurnState {
  return {
    round: turn.round,
    turnNumber: turn.turnNumber,
    active: turn.active,
    phase: turn.phase,
    sideTurns: copyJson(turn.sideTurns),
    extra: turn.extra,
    lastNormal: turn.lastNormal,
    extraTurns: turn.extraTurns.slice(),
    challengeLane: turn.challengeLane,
    beginning: turn.beginning,
  };
}

function copyDreamwell(dreamwell: DreamwellState): DreamwellState {
  return {
    deck: dreamwell.deck.slice(),
    next: dreamwell.next,
    catalog: dreamwell.catalog.slice(),
  };
}

/** A deep copy that shares nothing with `state`, equal as data to its JSON round trip. */
export function cloneState(state: BattleState): BattleState {
  return {
    version: state.version,
    seed: state.seed,
    rng: copyJson(state.rng),
    nextInstance: state.nextInstance,
    clock: state.clock,
    config: copyJson(state.config),
    turn: copyTurn(state.turn),
    sides: {
      player: copySide(state.sides.player),
      enemy: copySide(state.sides.enemy),
    },
    instances: copyInstances(state.instances),
    knownTo: {
      player: state.knownTo.player.slice(),
      enemy: state.knownTo.enemy.slice(),
    },
    stack: copyJson(state.stack),
    priority: state.priority,
    payable: copyJson(state.payable),
    triggerQueue: copyJson(state.triggerQueue),
    floating: copyJson(state.floating),
    turnLog: copyJson(state.turnLog),
    nextEffect: state.nextEffect,
    oncePerTurn: state.oncePerTurn.slice(),
    dreamwell: copyDreamwell(state.dreamwell),
    challenge: copyJson(state.challenge),
    automaticSteps: state.automaticSteps,
    automaticChoices: state.automaticChoices,
    loops: copyJson(state.loops),
    result: copyJson(state.result),
  };
}

import { useEffect, useRef, useState } from "react";
import type { BattleDebugEdit, BattleDebugZoneDestination } from "../debug/commands";
import type { BattleMutableState, BattleSide, FrontRankSlotId, BackRankSlotId } from "../types";
import {
  backRankSlotId,
  backRankSlotIds,
  frontRankSlotId,
  frontRankSlotIds,
  isBackRankSlotId,
  isFrontRankSlotId,
  rankSlotIds,
} from "../types";
import { selectPlayAreaSize } from "../state/selectors";
import {
  FIGMENT_CATALOG_ENTRIES,
  figmentCatalogEntries,
  lookupFigmentCatalogEntry,
  type FigmentCatalogEntry,
  type FigmentKeyword,
} from "../state/figment-catalog";

type FigmentZone = "hand" | "backRank" | "frontRank" | "void" | "banished" | "deck";
type FigmentDeckPosition = "top" | "bottom";
type FigmentBattlefieldSlotId = BackRankSlotId | FrontRankSlotId;
const DEFAULT_FIGMENT_SUBTYPE = "Shadow";

function figmentTypeName(subtype: string): string {
  return `${subtype} Figment`;
}

/**
 * The default name for a figment of the given type: the catalog's authored name
 * from `figments.toml` when hydrated, otherwise the `"<Type> Figment"`
 * derivation. The figment editor's name edits flow through here.
 */
function defaultFigmentName(subtype: string): string {
  const authored = lookupFigmentCatalogEntry(subtype)?.name;
  return authored !== undefined && authored.trim() !== ""
    ? authored
    : figmentTypeName(subtype);
}

const FIGMENT_KEYWORD_LABELS: Readonly<Record<FigmentKeyword, string>> = {
  unstoppable: "Unstoppable",
  vengeful: "Vengeful",
  awakened: "Awakened",
};

export function BattleFigmentCreator({
  initialSide,
  onClose,
  onSubmit,
  state,
}: {
  initialSide: BattleSide;
  onClose: () => void;
  onSubmit: (edit: BattleDebugEdit) => void;
  state: BattleMutableState;
}) {
  const defaultEntry =
    lookupFigmentCatalogEntry(DEFAULT_FIGMENT_SUBTYPE) ?? FIGMENT_CATALOG_ENTRIES[0];
  const [subtype, setSubtype] = useState<string>(defaultEntry.subtype);
  const [name, setName] = useState(defaultFigmentName(defaultEntry.subtype));
  const [sparkText, setSparkText] = useState(String(defaultEntry.baseSpark));
  const [side, setSide] = useState<BattleSide>(initialSide);
  const [zone, setZone] = useState<FigmentZone>("backRank");
  const [position, setPosition] = useState<FigmentDeckPosition>("top");
  const [slot, setSlot] = useState<FigmentBattlefieldSlotId>(
    () => findFirstOpenReserveSlot(state, initialSide) ?? "B0",
  );
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // bug-099: focus management — move focus into the dialog on mount and
    // restore on unmount.
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    nameInputRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    // bug-110: reset slot when side changes so the previously highlighted
    // slot on the other side doesn't carry forward as a stale selection.
    if (zone === "backRank") {
      setSlot(findFirstOpenReserveSlot(state, side) ?? "B0");
    } else if (zone === "frontRank") {
      setSlot(findFirstOpenDeploySlot(state, side) ?? "F0");
    }
  }, [side, state, zone]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const selectedEntry = lookupFigmentCatalogEntry(subtype);
  const selectedKeyword = selectedEntry?.keyword;

  function handleSelectType(nextSubtype: string): void {
    // Selecting a catalog type pre-fills the figment's base spark and derives a
    // default name from the type. The spark stays editable for off-base
    // figments (rules §Figments). The name follows the type only while it still
    // matches the auto-derived pattern, so a hand-edited name is preserved.
    const entry = lookupFigmentCatalogEntry(nextSubtype);
    setSubtype(nextSubtype);
    if (entry !== undefined) {
      setSparkText(String(entry.baseSpark));
    }
    setName((current) =>
      current.trim() === "" || isAutoDerivedFigmentName(current)
        ? defaultFigmentName(nextSubtype)
        : current,
    );
  }

  const spark = Number.parseInt(sparkText, 10);
  const sparkIsValid = !Number.isNaN(spark) && spark >= 0;
  const subtypeIsValid = subtype.trim().length > 0;
  const nameIsValid = name.trim().length > 0;
  // bug-114: pre-validate that the chosen battlefield slot is empty so Create
  // Figment does not silently close when the apply-debug-edit reducer would
  // refuse the mint. Non-battlefield zones (hand/void/deck/banished) have no
  // slot constraint.
  const slotIsOccupied = isBattlefieldSlotOccupied(state, side, zone, slot);
  const slotCanStack = canStackIntoBattlefieldSlot(state, side, zone, slot, subtype);
  const slotIsValid = !slotIsOccupied || slotCanStack;
  const canSubmit = nameIsValid && subtypeIsValid && sparkIsValid && slotIsValid;
  const disabledReason = !nameIsValid || !subtypeIsValid || !sparkIsValid
    ? "Name, subtype, and non-negative spark are required."
    : !slotIsValid
      ? `${slot} is occupied — pick another slot or change zone.`
      : null;

  function handleSubmit(): void {
    if (!canSubmit) {
      return;
    }

    const destination = buildDestination({
      position,
      side,
      slot,
      zone,
    });

    onSubmit({
      kind: "CREATE_FIGMENT",
      side,
      chosenSubtype: subtype.trim(),
      chosenSpark: spark,
      name: name.trim(),
      destination,
      createdAtMs: Date.now(),
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 p-3 backdrop-blur"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        // bug-099: dialog semantics + labelled heading.
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-figment-creator-title"
        tabIndex={-1}
        data-battle-figment-creator=""
        className="pointer-events-auto mx-auto flex w-full max-w-lg flex-col gap-4 rounded-[2rem] border border-violet-300/25 bg-[linear-gradient(180deg,_rgba(7,10,18,0.98)_0%,_rgba(11,17,30,0.96)_100%)] p-5 shadow-2xl shadow-slate-950/70"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
            Create Figment
          </p>
          <h3
            id="battle-figment-creator-title"
            className="mt-2 text-lg font-semibold text-white"
          >
            Synthesize a figment token
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Pick one of the 14 figment types. Each type seeds its base spark and
            carries its implicit keyword; spark stays editable for off-base
            figments. The payload never touches the quest deck.
          </p>
        </header>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Name
          </span>
          <input
            ref={nameInputRef}
            data-battle-figment-field="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-300/60 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Figment Type
          </span>
          <select
            data-battle-figment-field="subtype"
            value={subtype}
            onChange={(event) => handleSelectType(event.target.value)}
            className="rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-violet-300/60 focus:outline-none"
          >
            {figmentCatalogEntries().map((entry) => (
              <option key={entry.key} value={entry.subtype}>
                {formatCatalogOptionLabel(entry)}
              </option>
            ))}
          </select>
          <span
            data-battle-figment-keyword=""
            className="text-[11px] text-slate-400"
          >
            {selectedKeyword === undefined
              ? "No keyword."
              : `Keyword: ${FIGMENT_KEYWORD_LABELS[selectedKeyword]}.`}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Spark
          </span>
          <input
            data-battle-figment-field="spark"
            type="number"
            min={0}
            value={sparkText}
            onChange={(event) => setSparkText(event.target.value)}
            className="w-28 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-violet-300/60 focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">
            {selectedEntry === undefined
              ? "Custom spark."
              : `Base spark ${String(selectedEntry.baseSpark)} — editable.`}
          </span>
        </label>
        <fieldset
          data-battle-figment-field="side"
          className="flex flex-col gap-2"
        >
          <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Side
          </legend>
          <div className="flex flex-wrap gap-3 text-sm text-slate-200">
            {(["player", "enemy"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="battle-figment-side"
                  value={option}
                  checked={side === option}
                  onChange={() => setSide(option)}
                />
                {option === "player" ? "Player" : "Enemy"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset
          data-battle-figment-field="zone"
          className="flex flex-col gap-2"
        >
          <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Zone
          </legend>
          <div className="flex flex-wrap gap-3 text-sm text-slate-200">
            {(
              ["hand", "backRank", "frontRank", "void", "banished", "deck"] as const
            ).map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="battle-figment-zone"
                  value={option}
                  checked={zone === option}
                  onChange={() => {
                    setZone(option);
                    if (option === "backRank" && !isReserveSlot(slot)) {
                      setSlot("B0");
                    } else if (option === "frontRank" && !isDeploySlot(slot)) {
                      setSlot("F0");
                    }
                  }}
                />
                {formatZoneLabel(option)}
              </label>
            ))}
          </div>
        </fieldset>
        {zone === "deck" ? (
          <fieldset
            data-battle-figment-field="position"
            className="flex flex-col gap-2"
          >
            <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Deck Position
            </legend>
            <div className="flex flex-wrap gap-3 text-sm text-slate-200">
              {(["top", "bottom"] as const).map((option) => (
                <label key={option} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="battle-figment-position"
                    value={option}
                    checked={position === option}
                    onChange={() => setPosition(option)}
                  />
                  {option === "top" ? "Top" : "Bottom"}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {zone === "backRank" || zone === "frontRank" ? (
          <fieldset
            data-battle-figment-field="slot"
            className="flex flex-col gap-2"
          >
            <legend className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Slot
            </legend>
            <div className="flex flex-wrap gap-3 text-sm text-slate-200">
              {(zone === "backRank"
                ? backRankSlotIds(selectPlayAreaSize(state).backSize + 1)
                : frontRankSlotIds(selectPlayAreaSize(state).frontSize + 1)
              ).map(
                (option) => (
                  <label key={option} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="battle-figment-slot"
                      value={option}
                      checked={slot === option}
                      onChange={() => setSlot(option)}
                    />
                    {option}
                  </label>
                ),
              )}
            </div>
          </fieldset>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            data-battle-figment-action="cancel"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-violet-300/45 hover:text-white"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            data-battle-figment-action="submit"
            disabled={!canSubmit}
            aria-describedby={canSubmit ? undefined : "battle-figment-submit-hint"}
            className={[
              "rounded-full border px-4 py-2 text-sm font-semibold transition",
              canSubmit
                ? "border-violet-300/60 bg-violet-400/15 text-violet-50 hover:bg-violet-400/25"
                : "cursor-not-allowed border-slate-800 bg-slate-900/70 text-slate-600",
            ].join(" ")}
            onClick={handleSubmit}
          >
            Create Figment
          </button>
          {canSubmit || disabledReason === null ? null : (
            <p
              id="battle-figment-submit-hint"
              data-battle-figment-submit-hint=""
              className="w-full text-right text-[11px] text-slate-400"
            >
              {/* bug-099 / bug-114: expose the disabled-gate rationale for
                  screen readers, including the occupied-slot case. */}
              {disabledReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function buildDestination({
  position,
  side,
  slot,
  zone,
}: {
  position: FigmentDeckPosition;
  side: BattleSide;
  slot: FigmentBattlefieldSlotId;
  zone: FigmentZone;
}): BattleDebugZoneDestination {
  if (zone === "backRank" || zone === "frontRank") {
    return {
      side,
      zone,
      slotId: slot,
    };
  }

  if (zone === "deck") {
    return {
      side,
      zone: "deck",
      position,
    };
  }

  return {
    side,
    zone,
  };
}

function formatCatalogOptionLabel(entry: FigmentCatalogEntry): string {
  const keywordSuffix =
    entry.keyword === undefined
      ? ""
      : ` · ${FIGMENT_KEYWORD_LABELS[entry.keyword]}`;
  return `${entry.subtype} (✦${String(entry.baseSpark)})${keywordSuffix}`;
}

/**
 * Whether `name` matches the auto-derived `"<Type> Figment"` pattern for any of
 * the 14 catalog types, so type-switching can keep the name in sync until the
 * user hand-edits it.
 */
function isAutoDerivedFigmentName(name: string): boolean {
  const trimmed = name.trim();
  return figmentCatalogEntries().some(
    (entry) =>
      figmentTypeName(entry.subtype) === trimmed ||
      (entry.name !== undefined && entry.name === trimmed),
  );
}

function formatZoneLabel(zone: FigmentZone): string {
  switch (zone) {
    case "hand":
      return "Hand";
    case "backRank":
      return "Back Rank";
    case "frontRank":
      return "Front Rank";
    case "void":
      return "Void";
    case "banished":
      return "Banished";
    case "deck":
      return "Deck";
  }
}

function isReserveSlot(value: FigmentBattlefieldSlotId): value is BackRankSlotId {
  return isBackRankSlotId(value);
}

function isDeploySlot(value: FigmentBattlefieldSlotId): value is FrontRankSlotId {
  return isFrontRankSlotId(value);
}

function isBattlefieldSlotOccupied(
  state: BattleMutableState,
  side: BattleSide,
  zone: FigmentZone,
  slot: FigmentBattlefieldSlotId,
): boolean {
  // bug-114: peek into the live battlefield to gate the submit button against
  // occupied target slots. Non-battlefield zones are never occupied. A slot id
  // past the materialized range (a freshly grown slot) reads `undefined`, which
  // is empty — coerce so growth targets are not mistaken for occupied.
  if (zone === "backRank" && isReserveSlot(slot)) {
    return (state.sides[side].backRank[slot] ?? null) !== null;
  }
  if (zone === "frontRank" && isDeploySlot(slot)) {
    return (state.sides[side].frontRank[slot] ?? null) !== null;
  }
  return false;
}

function findFirstOpenReserveSlot(
  state: BattleMutableState,
  side: BattleSide,
): BackRankSlotId | null {
  const backRank = state.sides[side].backRank;
  const open = rankSlotIds(backRank).find((slotId) => backRank[slotId] === null);
  return open ?? backRankSlotId(rankSlotIds(backRank).length);
}

function findFirstOpenDeploySlot(
  state: BattleMutableState,
  side: BattleSide,
): FrontRankSlotId | null {
  const frontRank = state.sides[side].frontRank;
  const open = rankSlotIds(frontRank).find((slotId) => frontRank[slotId] === null);
  return open ?? frontRankSlotId(rankSlotIds(frontRank).length);
}

function canStackIntoBattlefieldSlot(
  state: BattleMutableState,
  side: BattleSide,
  zone: FigmentZone,
  slot: FigmentBattlefieldSlotId,
  subtype: string,
): boolean {
  const occupantId = selectBattlefieldSlotOccupant(state, side, zone, slot);
  if (occupantId === null) {
    return false;
  }

  const occupant = state.cardInstances[occupantId];
  return occupant?.provenance.kind === "generated-figment" &&
    occupant.definition.subtype.trim().toLowerCase() === subtype.trim().toLowerCase();
}

function selectBattlefieldSlotOccupant(
  state: BattleMutableState,
  side: BattleSide,
  zone: FigmentZone,
  slot: FigmentBattlefieldSlotId,
): string | null {
  if (zone === "backRank" && isReserveSlot(slot)) {
    return state.sides[side].backRank[slot] ?? null;
  }
  if (zone === "frontRank" && isDeploySlot(slot)) {
    return state.sides[side].frontRank[slot] ?? null;
  }
  return null;
}

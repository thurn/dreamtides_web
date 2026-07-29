import { useEffect, useRef, useState } from "react";
import {
  BattleFigmentCreatorOverlay,
  type BattleFigmentDeckPosition,
  type BattleFigmentZone,
} from "../../cumulus/screens/battle-overlays/BattleFigmentCreatorOverlay";
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
  lookupFigmentCatalogEntryById,
  type FigmentCatalogEntry,
  type FigmentKeyword,
} from "../state/figment-catalog";

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
function defaultFigmentName(entry: FigmentCatalogEntry): string {
  const authored = entry.name;
  return authored !== undefined && authored.trim() !== ""
    ? authored
    : figmentTypeName(entry.subtype);
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
  const [figmentTypeId, setFigmentTypeId] = useState<string>(defaultEntry.id);
  const [name, setName] = useState(defaultFigmentName(defaultEntry));
  const [sparkText, setSparkText] = useState(String(defaultEntry.baseSpark));
  const [side, setSide] = useState<BattleSide>(initialSide);
  const [zone, setZone] = useState<BattleFigmentZone>("backRank");
  const [position, setPosition] = useState<BattleFigmentDeckPosition>("top");
  const [slot, setSlot] = useState<FigmentBattlefieldSlotId>(
    () => findFirstOpenReserveSlot(state, initialSide) ?? "B0",
  );
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // bug-110: reset slot when side changes so the previously highlighted
    // slot on the other side doesn't carry forward as a stale selection.
    if (zone === "backRank") {
      setSlot(findFirstOpenReserveSlot(state, side) ?? "B0");
    } else if (zone === "frontRank") {
      setSlot(findFirstOpenDeploySlot(state, side) ?? "F0");
    }
  }, [side, state, zone]);

  const selectedEntry = lookupFigmentCatalogEntryById(figmentTypeId) ?? defaultEntry;
  const subtype = selectedEntry.subtype;
  const selectedKeyword = selectedEntry?.keyword;

  function handleSelectType(nextFigmentTypeId: string): void {
    // Selecting a catalog type pre-fills the figment's base spark and derives a
    // default name from the type. The spark stays editable for off-base
    // figments (rules §Figments). The name follows the type only while it still
    // matches the auto-derived pattern, so a hand-edited name is preserved.
    const entry = lookupFigmentCatalogEntryById(nextFigmentTypeId);
    if (entry === undefined) return;
    setFigmentTypeId(nextFigmentTypeId);
    setSparkText(String(entry.baseSpark));
    setName((current) =>
      current.trim() === "" || isAutoDerivedFigmentName(current)
        ? defaultFigmentName(entry)
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
  const slotIsValid = !slotIsOccupied;
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
      chosenFigmentId: selectedEntry.id,
      chosenSubtype: subtype.trim(),
      chosenSpark: spark,
      name: name.trim(),
      destination,
      createdAtMs: Date.now(),
    });
    onClose();
  }

  const slotOptions = zone === "backRank"
    ? backRankSlotIds(selectPlayAreaSize(state).backSize + 1)
    : frontRankSlotIds(selectPlayAreaSize(state).frontSize + 1);

  return (
    <BattleFigmentCreatorOverlay
      name={name}
      nameInputRef={nameInputRef}
      typeId={figmentTypeId}
      typeOptions={figmentCatalogEntries().map((entry) => ({
        value: entry.id,
        label: formatCatalogOptionLabel(entry),
      }))}
      keywordText={selectedKeyword === undefined
        ? "No keyword."
        : `Keyword: ${FIGMENT_KEYWORD_LABELS[selectedKeyword]}.`}
      sparkText={sparkText}
      sparkError={sparkIsValid
        ? undefined
        : "Spark must be a non-negative whole number."}
      baseSpark={selectedEntry.baseSpark}
      side={side}
      zone={zone}
      position={position}
      slot={slot}
      slotOptions={slotOptions}
      canSubmit={canSubmit}
      disabledReason={disabledReason}
      onNameChange={setName}
      onTypeChange={handleSelectType}
      onSparkChange={setSparkText}
      onSideChange={setSide}
      onZoneChange={(nextZone) => {
        setZone(nextZone);
        if (nextZone === "backRank" && !isReserveSlot(slot)) setSlot("B0");
        if (nextZone === "frontRank" && !isDeploySlot(slot)) setSlot("F0");
      }}
      onPositionChange={setPosition}
      onSlotChange={(value) => setSlot(value as FigmentBattlefieldSlotId)}
      onCancel={onClose}
      onSubmit={handleSubmit}
    />
  );
}

function buildDestination({
  position,
  side,
  slot,
  zone,
}: {
  position: BattleFigmentDeckPosition;
  side: BattleSide;
  slot: FigmentBattlefieldSlotId;
  zone: BattleFigmentZone;
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

function isReserveSlot(value: FigmentBattlefieldSlotId): value is BackRankSlotId {
  return isBackRankSlotId(value);
}

function isDeploySlot(value: FigmentBattlefieldSlotId): value is FrontRankSlotId {
  return isFrontRankSlotId(value);
}

function isBattlefieldSlotOccupied(
  state: BattleMutableState,
  side: BattleSide,
  zone: BattleFigmentZone,
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

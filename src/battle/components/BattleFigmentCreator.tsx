import { useEffect, useRef, useState } from "react";
import { GlassButton } from "../../cumulus/components/controls/GlassButton";
import { SegmentedControl } from "../../cumulus/components/controls/SegmentedControl";
import { Select } from "../../cumulus/components/controls/Select";
import { TextField } from "../../cumulus/components/controls/TextField";
import { GlassDialog } from "../../cumulus/components/overlay/GlassDialog";
import { GLYPHS } from "../../cumulus/primitives/glyph";
import { token } from "../../cumulus/primitives/tokens";
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
  const [zone, setZone] = useState<FigmentZone>("backRank");
  const [position, setPosition] = useState<FigmentDeckPosition>("top");
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

  const slotOptions = zone === "backRank"
    ? backRankSlotIds(selectPlayAreaSize(state).backSize + 1)
    : frontRankSlotIds(selectPlayAreaSize(state).frontSize + 1);

  return (
    <GlassDialog
      title="Synthesize a Figment"
      subtitle="Choose a figment type and a valid destination."
      closeLabel="Cancel figment creation"
      onClose={onClose}
      desktopCenterTarget="battlefield"
    >
      <div
        className="cumulus"
        data-battle-figment-creator=""
        style={{ display: "grid", gap: token("--space-5") }}
      >
        <div data-battle-figment-field="name">
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            inputRef={nameInputRef}
            supportingText="The displayed name for this created figment."
          />
        </div>
        <div data-battle-figment-field="subtype" style={{ display: "grid", gap: token("--space-2") }}>
          <Select
            ariaLabel="Figment type"
            leadingGlyph={GLYPHS.spark}
            full
            options={figmentCatalogEntries().map((entry) => ({
              value: entry.id,
              label: formatCatalogOptionLabel(entry),
            }))}
            value={figmentTypeId}
            onChange={handleSelectType}
          />
          <span data-battle-figment-keyword="" style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>
            {selectedKeyword === undefined ? "No keyword." : `Keyword: ${FIGMENT_KEYWORD_LABELS[selectedKeyword]}.`}
          </span>
        </div>
        <div data-battle-figment-field="spark">
          <TextField
            label="Spark"
            value={sparkText}
            onChange={setSparkText}
            error={sparkIsValid ? undefined : "Spark must be a non-negative whole number."}
            supportingText={`Base spark ${String(selectedEntry.baseSpark)} — editable.`}
          />
        </div>
        <div data-battle-figment-field="side" style={{ display: "grid", gap: token("--space-2") }}>
          <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>Side</span>
          <SegmentedControl options={[{ value: "player", label: "Player" }, { value: "enemy", label: "Enemy" }]} value={side} onChange={(value) => setSide(value as BattleSide)} full />
        </div>
        <div data-battle-figment-field="zone" style={{ display: "grid", gap: token("--space-2") }}>
          <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>Destination</span>
          <Select
            ariaLabel="Figment destination"
            leadingGlyph={GLYPHS.grid}
            full
            options={(["hand", "backRank", "frontRank", "void", "banished", "deck"] as const).map((option) => ({ value: option, label: formatZoneLabel(option) }))}
            value={zone}
            onChange={(value) => {
              const nextZone = value as FigmentZone;
              setZone(nextZone);
              if (nextZone === "backRank" && !isReserveSlot(slot)) setSlot("B0");
              if (nextZone === "frontRank" && !isDeploySlot(slot)) setSlot("F0");
            }}
          />
        </div>
        {zone === "deck" ? (
          <div data-battle-figment-field="position" style={{ display: "grid", gap: token("--space-2") }}>
            <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>Deck Position</span>
            <SegmentedControl options={[{ value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }]} value={position} onChange={(value) => setPosition(value as FigmentDeckPosition)} full />
          </div>
        ) : null}
        {zone === "backRank" || zone === "frontRank" ? (
          <div data-battle-figment-field="slot" style={{ display: "grid", gap: token("--space-2") }}>
            <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>Slot</span>
            <Select
              ariaLabel="Figment battlefield slot"
              leadingGlyph={GLYPHS.grid}
              full
              options={slotOptions.map((option) => ({ value: option, label: option }))}
              value={slot}
              onChange={(value) => setSlot(value as FigmentBattlefieldSlotId)}
            />
          </div>
        ) : null}
        {canSubmit || disabledReason === null ? null : (
          <p data-battle-figment-submit-hint="" style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>{disabledReason}</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: token("--space-3") }}>
          <GlassButton label="Cancel" placement="onGlass" testId="battle-figment-cancel" onPress={onClose} />
          <GlassButton label="Create Figment" placement="onGlass" variant="accent" disabled={!canSubmit} testId="battle-figment-submit" onPress={handleSubmit} />
        </div>
      </div>
    </GlassDialog>
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

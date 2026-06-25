import { useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type { CardType } from "../types/cards";
import type { TransfigurationType } from "../types/quest";
import { resolveDeckEntryCard } from "../card-type-change";
import { useQuest } from "../state/quest-context";

const SOURCE = "quest_debug_editor";

/** The exhaustive list of transfiguration types, used to build the dropdown. */
const TRANSFIGURATION_TYPES: readonly TransfigurationType[] = [
  "Empowered",
  "Amplified",
  "Kindled",
  "Inspired",
  "Enduring",
  "Hastened",
  "Resonant",
  "Attuned",
  "Perfected",
];

const CARD_TYPES: readonly CardType[] = ["Character", "Event"];

const FIELD_LABEL_STYLE = {
  display: "block",
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "rgba(247, 241, 223, 0.6)",
  marginBottom: 4,
} as const;

const TEXT_INPUT_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(247, 241, 223, 0.2)",
  background: "#0e1215",
  color: "#f7f1df",
  fontSize: "0.9rem",
} as const;

const MAX_CARD_RESULTS = 50;

function SmallButton({
  label,
  onClick,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger" | "primary";
}) {
  const palette =
    tone === "danger"
      ? {
          background: "rgba(127, 29, 29, 0.4)",
          color: "#fecaca",
          border: "1px solid rgba(239, 68, 68, 0.4)",
        }
      : tone === "primary"
        ? {
            background: "rgba(124, 58, 237, 0.3)",
            color: "#e9d5ff",
            border: "1px solid rgba(168, 85, 247, 0.4)",
          }
        : {
            background: "rgba(255, 255, 255, 0.08)",
            color: "#e2e8f0",
            border: "1px solid rgba(255, 255, 255, 0.15)",
          };
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={palette}
    >
      {label}
    </button>
  );
}

/** Add-card search picker over the full card database. */
function AddCardPicker({
  cardDatabase,
  onAdd,
  onAddBane,
}: {
  cardDatabase: Map<number, CardData>;
  onAdd: (cardNumber: number) => void;
  onAddBane: (cardNumber: number) => void;
}) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => Array.from(cardDatabase.values()), [cardDatabase]);

  const matches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return [];
    return all.filter(
      (card) =>
        String(card.name).toLowerCase().includes(trimmed) ||
        String(card.id).toLowerCase().includes(trimmed),
    );
  }, [all, query]);

  const shown = matches.slice(0, MAX_CARD_RESULTS);
  const overflow = matches.length - shown.length;

  return (
    <div>
      <label style={FIELD_LABEL_STYLE}>Add card</label>
      <input
        type="text"
        value={query}
        placeholder="Search by name or id"
        onChange={(event) => setQuery(event.target.value)}
        style={TEXT_INPUT_STYLE}
      />
      {shown.length > 0 && (
        <div className="mt-2 space-y-1">
          {shown.map((card) => (
            <div
              key={String(card.id)}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1"
              style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.18)",
              }}
            >
              <span
                className="min-w-0 flex-1 truncate text-sm"
                style={{ color: "#e2e8f0" }}
              >
                {String(card.name)}
                <span className="ml-2 text-[10px] opacity-50">
                  #{String(card.cardNumber)}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <SmallButton
                  label="Add"
                  tone="primary"
                  onClick={() => onAdd(card.cardNumber)}
                />
                <SmallButton
                  label="Add as bane"
                  tone="danger"
                  onClick={() => onAddBane(card.cardNumber)}
                />
              </div>
            </div>
          ))}
          {overflow > 0 && (
            <p className="text-[11px] opacity-50">
              {overflow} more — refine your search
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The expandable per-entry editor for a single deck entry. */
function DeckEntryEditor({
  entryId,
  eff,
  seedTransfiguration,
  seedEnergy,
  seedSpark,
  seedCardType,
  seedSubtype,
  seedFast,
  seedReclaim,
}: {
  entryId: string;
  eff: CardData | undefined;
  seedTransfiguration: TransfigurationType | null;
  seedEnergy: number | null | undefined;
  seedSpark: number | null | undefined;
  seedCardType: CardType | undefined;
  seedSubtype: string | undefined;
  seedFast: boolean;
  seedReclaim: number | undefined;
}) {
  const { mutations } = useQuest();

  // Stat-override draft inputs. We pass both fields on commit so that editing
  // one stat does not silently clear the other.
  const [energyText, setEnergyText] = useState<string>(
    seedEnergy === null || seedEnergy === undefined ? "" : String(seedEnergy),
  );
  const [sparkText, setSparkText] = useState<string>(
    seedSpark === null || seedSpark === undefined ? "" : String(seedSpark),
  );

  function commitStats() {
    const override: { energyCost?: number; spark?: number } = {};
    const energy = Number(energyText);
    if (energyText.trim() !== "" && !Number.isNaN(energy)) {
      override.energyCost = energy;
    }
    const spark = Number(sparkText);
    if (sparkText.trim() !== "" && !Number.isNaN(spark)) {
      override.spark = spark;
    }
    if (override.energyCost === undefined && override.spark === undefined) {
      return;
    }
    mutations.setDeckEntryStatOverride?.(entryId, override, SOURCE);
  }

  // Type/subtype draft inputs.
  const [cardType, setCardType] = useState<CardType>(
    seedCardType ?? "Character",
  );
  const [subtype, setSubtype] = useState<string>(seedSubtype ?? "");

  function commitTypeChange() {
    mutations.setDeckEntryTypeChange?.(
      entryId,
      { predicateId: "debug", cardType, subtype, label: "Debug edit" },
      SOURCE,
    );
  }

  // Keyword draft inputs.
  const [fast, setFast] = useState<boolean>(seedFast);
  const [reclaimText, setReclaimText] = useState<string>(
    seedReclaim === undefined ? "" : String(seedReclaim),
  );

  function commitKeywords() {
    const reclaim = Number(reclaimText);
    const hasReclaim = reclaimText.trim() !== "" && !Number.isNaN(reclaim);
    mutations.setDeckEntryKeywords?.(
      entryId,
      hasReclaim ? { fast, setReclaim: reclaim } : { fast },
      SOURCE,
    );
  }

  return (
    <div
      className="mt-2 space-y-3 rounded-md p-3"
      style={{
        background: "rgba(0, 0, 0, 0.35)",
        border: "1px solid rgba(124, 58, 237, 0.15)",
      }}
    >
      {/* Energy / Spark */}
      <div>
        <p
          className="mb-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "#a855f7" }}
        >
          Stats
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div style={{ minWidth: 90 }}>
            <label style={FIELD_LABEL_STYLE}>Energy</label>
            <input
              type="number"
              value={energyText}
              placeholder={
                eff?.energyCost === null || eff?.energyCost === undefined
                  ? "—"
                  : String(eff.energyCost)
              }
              onChange={(event) => setEnergyText(event.target.value)}
              onBlur={commitStats}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              style={TEXT_INPUT_STYLE}
            />
          </div>
          <div style={{ minWidth: 90 }}>
            <label style={FIELD_LABEL_STYLE}>Spark</label>
            <input
              type="number"
              value={sparkText}
              placeholder={
                eff?.spark === null || eff?.spark === undefined
                  ? "—"
                  : String(eff.spark)
              }
              onChange={(event) => setSparkText(event.target.value)}
              onBlur={commitStats}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              style={TEXT_INPUT_STYLE}
            />
          </div>
          <SmallButton
            label="Reset stats"
            onClick={() => {
              setEnergyText("");
              setSparkText("");
              mutations.setDeckEntryStatOverride?.(entryId, null, SOURCE);
            }}
          />
        </div>
      </div>

      {/* Transfiguration */}
      <div>
        <label style={FIELD_LABEL_STYLE}>Transfiguration</label>
        <select
          defaultValue={seedTransfiguration ?? "none"}
          onChange={(event) => {
            const value = event.target.value;
            // transfigureCard's `effectDescription` argument doubles as the log
            // source, so we pass an explicit descriptive string here.
            mutations.transfigureCard(
              entryId,
              value === "none" ? null : (value as TransfigurationType),
              "quest_debug_editor:transfigure",
              {},
            );
          }}
          style={TEXT_INPUT_STYLE}
        >
          <option value="none">none</option>
          {TRANSFIGURATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* Type / subtype */}
      <div>
        <p
          className="mb-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "#a855f7" }}
        >
          Type
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div style={{ minWidth: 120 }}>
            <label style={FIELD_LABEL_STYLE}>Card type</label>
            <select
              value={cardType}
              onChange={(event) => {
                setCardType(event.target.value as CardType);
              }}
              onBlur={commitTypeChange}
              style={TEXT_INPUT_STYLE}
            >
              {CARD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 120, flex: "1 1 160px" }}>
            <label style={FIELD_LABEL_STYLE}>Subtype</label>
            <input
              type="text"
              value={subtype}
              onChange={(event) => setSubtype(event.target.value)}
              onBlur={commitTypeChange}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              style={TEXT_INPUT_STYLE}
            />
          </div>
          <SmallButton
            label="Reset type"
            onClick={() => {
              setCardType(seedCardType ?? "Character");
              setSubtype(seedSubtype ?? "");
              mutations.setDeckEntryTypeChange?.(entryId, null, SOURCE);
            }}
          />
        </div>
      </div>

      {/* Keywords */}
      <div>
        <p
          className="mb-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "#a855f7" }}
        >
          Keywords
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label
            className="flex items-center gap-2 text-sm"
            style={{ color: "#e2e8f0" }}
          >
            <input
              type="checkbox"
              checked={fast}
              onChange={(event) => {
                setFast(event.target.checked);
                const reclaim = Number(reclaimText);
                const hasReclaim =
                  reclaimText.trim() !== "" && !Number.isNaN(reclaim);
                mutations.setDeckEntryKeywords?.(
                  entryId,
                  hasReclaim
                    ? { fast: event.target.checked, setReclaim: reclaim }
                    : { fast: event.target.checked },
                  SOURCE,
                );
              }}
            />
            Fast
          </label>
          <div style={{ minWidth: 90 }}>
            <label style={FIELD_LABEL_STYLE}>Reclaim</label>
            <input
              type="number"
              value={reclaimText}
              placeholder="none"
              onChange={(event) => setReclaimText(event.target.value)}
              onBlur={commitKeywords}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              style={TEXT_INPUT_STYLE}
            />
          </div>
          <SmallButton
            label="Clear keywords"
            onClick={() => {
              setFast(false);
              setReclaimText("");
              mutations.setDeckEntryKeywords?.(entryId, null, SOURCE);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Deck management section of the quest debug editor. */
export default function QuestDebugDeckSection() {
  const { state, mutations, cardDatabase } = useQuest();
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <AddCardPicker
        cardDatabase={cardDatabase}
        onAdd={(cardNumber) => mutations.addCard(cardNumber, SOURCE)}
        onAddBane={(cardNumber) => mutations.addBaneCard(cardNumber, SOURCE)}
      />

      {state.deck.length === 0 ? (
        <p className="text-sm opacity-50">The deck is empty.</p>
      ) : (
        <div className="space-y-1">
          {state.deck.map((entry) => {
            const base = cardDatabase.get(entry.cardNumber);
            const eff = base ? resolveDeckEntryCard(base, entry) : undefined;
            const expanded = expandedEntryId === entry.entryId;
            return (
              <div
                key={entry.entryId}
                className="rounded-md px-2 py-1.5"
                style={{
                  background: "rgba(168, 85, 247, 0.08)",
                  border: "1px solid rgba(168, 85, 247, 0.18)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedEntryId(expanded ? null : entry.entryId)
                    }
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  >
                    <span className="text-xs opacity-50">
                      {expanded ? "▾" : "▸"}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-medium"
                      style={{ color: "#e2e8f0" }}
                    >
                      {eff?.name ?? `#${String(entry.cardNumber)} (unknown)`}
                    </span>
                    {entry.isBane && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                        style={{
                          background: "rgba(127, 29, 29, 0.4)",
                          color: "#fecaca",
                        }}
                      >
                        bane
                      </span>
                    )}
                    {entry.transfiguration !== null && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                        style={{
                          background: "rgba(168, 85, 247, 0.2)",
                          color: "#c084fc",
                        }}
                      >
                        {entry.transfiguration}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] opacity-50">
                      {eff
                        ? `${eff.cardType}${eff.subtype ? ` · ${eff.subtype}` : ""}` +
                          ` · E ${eff.energyCost === null ? "—" : String(eff.energyCost)}` +
                          ` · S ${eff.spark === null ? "—" : String(eff.spark)}`
                        : ""}
                    </span>
                  </button>
                  <SmallButton
                    label="Remove"
                    tone="danger"
                    onClick={() => mutations.removeCard(entry.entryId, SOURCE)}
                  />
                </div>
                {expanded && (
                  <DeckEntryEditor
                    // Re-mount (and therefore re-seed the draft inputs) whenever
                    // a committed mutation changes this entry's resolved data, so
                    // the displayed Spark/type/subtype/keyword draft values never
                    // drift from the live entry. The expand/collapse state is held
                    // by the parent keyed by entryId, so this remount keeps the
                    // row expanded.
                    key={`${entry.entryId}:${JSON.stringify({
                      t: entry.transfiguration,
                      s: entry.statOverride ?? null,
                      tc: entry.typeChange ?? null,
                      k: entry.keywordModification ?? null,
                    })}`}
                    entryId={entry.entryId}
                    eff={eff}
                    seedTransfiguration={entry.transfiguration}
                    seedEnergy={
                      entry.statOverride?.energyCost ?? eff?.energyCost
                    }
                    seedSpark={entry.statOverride?.spark ?? eff?.spark}
                    seedCardType={entry.typeChange?.cardType ?? eff?.cardType}
                    seedSubtype={entry.typeChange?.subtype ?? eff?.subtype}
                    seedFast={entry.keywordModification?.fast === true}
                    seedReclaim={
                      entry.keywordModification?.setReclaim ??
                      entry.keywordModification?.reclaim
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

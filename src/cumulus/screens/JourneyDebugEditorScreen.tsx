import { assertLocalized, type LocalizedString } from "@trox/runtime";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { GlassButton } from "../components/controls/GlassButton";
import { NumberStepper } from "../components/controls/NumberStepper";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { Select } from "../components/controls/Select";
import { TextField } from "../components/controls/TextField";
import { GlassDialog } from "../components/overlay/GlassDialog";
import type {
  CardKeywordModification,
  CardTypeChange,
  TransfigurationType,
} from "../../types/journey";
import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import type { CardId } from "../../types/card-identity";
import type { DeckEntryId } from "../../types/identifiers";
import { asCardTypeChangePredicateId } from "../../types/identifiers";

export type JourneyDebugResourceId =
  "essence" | "maxDreamsigns" | "completionLevel";
export interface JourneyDebugDreamsignView {
  actionId: string;
  templateId: string;
  name: LocalizedString;
}
export interface JourneyDebugCardSearchView {
  cardId: CardId;
  title: LocalizedString;
  model: GameCardModel;
}
export interface JourneyDebugDeckEntryView {
  entryId: DeckEntryId;
  cardId: CardId;
  name: LocalizedString;
  detail: LocalizedString;
  isBane: boolean;
  transfiguration: TransfigurationType | null;
  typeChange: CardTypeChange | null;
  keywordModification: CardKeywordModification | null;
  statOverride: { energyCost?: number; spark?: number } | null;
  model: GameCardModel | null;
}
export interface JourneyDebugEditorView {
  essence: number;
  maxDreamsigns: number;
  completionLevel: number;
  dreamsigns: readonly JourneyDebugDreamsignView[];
  dreamsignOptions: readonly { id: string; name: LocalizedString }[];
  cards: readonly JourneyDebugCardSearchView[];
  deck: readonly JourneyDebugDeckEntryView[];
  transfigurationOptions: readonly { value: string; label: LocalizedString }[];
}
export interface JourneyDebugEditorScreenProps {
  isOpen: boolean;
  view: JourneyDebugEditorView;
  onClose: () => void;
  onResourceChange: (id: JourneyDebugResourceId, delta: number) => void;
  onAddDreamsign: (id: string) => void;
  onRemoveDreamsign: (actionId: string) => void;
  onAddCard: (id: string) => void;
  onRemoveCard: (entryId: DeckEntryId) => void;
  onSetStatOverride: (
    entryId: DeckEntryId,
    statOverride: { energyCost?: number; spark?: number } | null,
  ) => void;
  onSetTransfiguration: (
    entryId: DeckEntryId,
    type: TransfigurationType | null,
  ) => void;
  onSetTypeChange: (
    entryId: DeckEntryId,
    typeChange: CardTypeChange | null,
  ) => void;
  onSetKeywords: (
    entryId: DeckEntryId,
    keywords: CardKeywordModification | null,
  ) => void;
}

const stackStyle: CSSProperties = { display: "grid", gap: token("--space-m") };
const sectionStyle: CSSProperties = {
  display: "grid",
  gap: token("--space-s"),
};
const textStyle: CSSProperties = {
  margin: 0,
  font: token("--t-body-sm"),
  color: token("--text-on-glass-muted"),
};
const headingStyle: CSSProperties = {
  margin: 0,
  font: token("--t-title-sm"),
  color: token("--text-on-glass"),
};
const CARD_TYPES: { value: string; label: string }[] = [
  { value: "Character", label: "Character" },
  { value: "Event", label: "Event" },
];

/** Pure Cumulus diagnostic editor. Effects and journey mutations live in its controller. */
export function JourneyDebugEditorScreen(
  props: JourneyDebugEditorScreenProps,
): ReactElement | null {
  const [query, setQuery] = useState("");
  const [dreamsignQuery, setDreamsignQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const resolve = useLocalizer();
  useEffect(() => {
    if (!props.isOpen) return undefined;
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props.isOpen, props.onClose]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === ""
      ? []
      : props.view.cards
          .filter(
            (card) =>
              resolve(card.title).toLowerCase().includes(needle) ||
              card.cardId.toLowerCase().includes(needle),
          )
          .slice(0, 50);
  }, [props.view.cards, query, resolve]);
  const dreamsignMatches = useMemo(() => {
    const needle = dreamsignQuery.trim().toLowerCase();
    return needle === ""
      ? []
      : props.view.dreamsignOptions
          .filter(
            (option) =>
              resolve(option.name).toLowerCase().includes(needle) ||
              option.id.toLowerCase().includes(needle),
          )
          .slice(0, 50);
  }, [dreamsignQuery, props.view.dreamsignOptions, resolve]);
  if (!props.isOpen) return null;
  const canAddDreamsign =
    props.view.dreamsigns.length < props.view.maxDreamsigns;
  return (
    <div
      className="cumulus"
      data-journey-debug-editor=""
      style={{ minHeight: "100vh" }}
    >
      <GlassDialog
        title={assertLocalized("Edit Journey State")}
        subtitle={assertLocalized(
          "Make explicit diagnostic changes to the active run.",
        )}
        onClose={props.onClose}
        fullScreen
      >
        <div style={stackStyle}>
          <section style={sectionStyle} data-journey-debug-resources="">
            <h3 style={headingStyle}>Resources</h3>
            <ResourceSteppers
              view={props.view}
              onChange={props.onResourceChange}
            />
          </section>
          <DisclosureSection
            title={assertLocalized("Dreamsigns")}
            summary={assertLocalized(
              `${String(props.view.dreamsigns.length)} / ${String(props.view.maxDreamsigns)}`,
            )}
            expanded={expanded.dreamsigns ?? true}
            onExpandedChange={(value) =>
              setExpanded((current) => ({ ...current, dreamsigns: value }))
            }
            placement="onGlass"
            testId="journey-debug-dreamsigns"
          >
            <div style={sectionStyle}>
              {props.view.dreamsigns.length === 0 ? (
                <p style={textStyle}>No dreamsigns yet.</p>
              ) : (
                props.view.dreamsigns.map((dreamsign) => (
                  <div
                    key={dreamsign.actionId}
                    data-journey-debug-dreamsign={dreamsign.actionId}
                    style={sectionStyle}
                  >
                    <p style={textStyle}>{resolve(dreamsign.name)}</p>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: token("--space-xs"),
                      }}
                    >
                      <GlassButton
                        label={assertLocalized("Remove")}
                        onPress={() =>
                          props.onRemoveDreamsign(dreamsign.actionId)
                        }
                        placement="onGlass"
                        variant="danger"
                        testId={`journey-debug-remove-dreamsign-${dreamsign.actionId}`}
                      />
                    </div>
                  </div>
                ))
              )}
              <TextField
                label={assertLocalized("Add dreamsign")}
                value={dreamsignQuery}
                onChange={setDreamsignQuery}
                kind="search"
                disabled={!canAddDreamsign}
                placeholder={assertLocalized(
                  canAddDreamsign
                    ? "Search by name or ID"
                    : "Dreamsign cap reached",
                )}
                supportingText={assertLocalized(
                  canAddDreamsign
                    ? "Choose a matching Dreamsign below."
                    : "Remove one before adding another.",
                )}
                testId="journey-debug-dreamsign-search"
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: token("--space-xs"),
                }}
              >
                {dreamsignMatches.map((option) => (
                  <GlassButton
                    key={option.id}
                    label={assertLocalized(`Add ${resolve(option.name)}`)}
                    onPress={() => props.onAddDreamsign(option.id)}
                    disabled={!canAddDreamsign}
                    placement="onGlass"
                    testId={`journey-debug-add-dreamsign-${option.id}`}
                  />
                ))}
              </div>
            </div>
          </DisclosureSection>
          <DisclosureSection
            title={assertLocalized("Deck")}
            summary={assertLocalized(
              `${String(props.view.deck.length)} entries`,
            )}
            expanded={expanded.deck ?? true}
            onExpandedChange={(value) =>
              setExpanded((current) => ({ ...current, deck: value }))
            }
            placement="onGlass"
            testId="journey-debug-deck"
          >
            <div style={stackStyle}>
              <TextField
                label={assertLocalized("Add card")}
                value={query}
                onChange={setQuery}
                kind="search"
                placeholder={assertLocalized("Search by name or UUID")}
                testId="journey-debug-card-search"
              />
              {matches.map((card) => (
                <div
                  key={card.cardId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr)",
                    alignItems: "center",
                    gap: token("--space-s"),
                  }}
                  data-journey-debug-card={card.cardId}
                >
                  <div style={{ width: "100%" }}>
                    <GameCard
                      model={card.model}
                      hideRulesText
                      testId={`journey-debug-card-${card.cardId}`}
                    />
                  </div>
                  <div style={sectionStyle}>
                    <p style={textStyle}>
                      {resolve(card.title)}
                      <br />
                      {card.cardId}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: token("--space-xs"),
                      }}
                    >
                      <GlassButton
                        label={assertLocalized("Add")}
                        onPress={() => props.onAddCard(card.cardId)}
                        placement="onGlass"
                        testId={`journey-debug-add-card-${card.cardId}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {props.view.deck.length === 0 ? (
                <p style={textStyle}>The deck is empty.</p>
              ) : (
                props.view.deck.map((entry) => (
                  <DeckEntryEditor
                    key={entry.entryId}
                    entry={entry}
                    transfigurationOptions={props.view.transfigurationOptions}
                    onRemove={props.onRemoveCard}
                    onSetStatOverride={props.onSetStatOverride}
                    onSetTransfiguration={props.onSetTransfiguration}
                    onSetTypeChange={props.onSetTypeChange}
                    onSetKeywords={props.onSetKeywords}
                  />
                ))
              )}
            </div>
          </DisclosureSection>
        </div>
      </GlassDialog>
    </div>
  );
}

function ResourceSteppers({
  view,
  onChange,
}: {
  view: JourneyDebugEditorView;
  onChange: JourneyDebugEditorScreenProps["onResourceChange"];
}): ReactElement {
  const resources: readonly [JourneyDebugResourceId, string, number][] = [
    ["essence", "Essence", view.essence],
    ["maxDreamsigns", "Max dreamsigns", view.maxDreamsigns],
    ["completionLevel", "Completion level", view.completionLevel],
  ];
  return (
    <div style={sectionStyle}>
      {resources.map(([id, label, value]) => (
        <NumberStepper
          key={id}
          label={assertLocalized(label)}
          value={value}
          decrementLabel={assertLocalized(`Decrease ${label}`)}
          incrementLabel={assertLocalized(`Increase ${label}`)}
          onDecrement={() => onChange(id, -1)}
          onIncrement={() => onChange(id, 1)}
          testId={`journey-debug-${id}`}
        />
      ))}
    </div>
  );
}

function DeckEntryEditor({
  entry,
  transfigurationOptions,
  onRemove,
  onSetStatOverride,
  onSetTransfiguration,
  onSetTypeChange,
  onSetKeywords,
}: {
  entry: JourneyDebugDeckEntryView;
  transfigurationOptions: JourneyDebugEditorView["transfigurationOptions"];
  onRemove: (entryId: DeckEntryId) => void;
  onSetStatOverride: JourneyDebugEditorScreenProps["onSetStatOverride"];
  onSetTransfiguration: JourneyDebugEditorScreenProps["onSetTransfiguration"];
  onSetTypeChange: JourneyDebugEditorScreenProps["onSetTypeChange"];
  onSetKeywords: JourneyDebugEditorScreenProps["onSetKeywords"];
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const resolve = useLocalizer();
  return (
    <DisclosureSection
      title={entry.name}
      summary={assertLocalized(
        `${resolve(entry.detail)}${entry.isBane ? " · Nightmare" : ""}`,
      )}
      expanded={expanded}
      onExpandedChange={setExpanded}
      placement="onGlass"
      testId={`journey-debug-entry-${entry.entryId}`}
    >
      <div style={stackStyle} data-journey-debug-entry={entry.entryId}>
        {entry.model === null ? (
          <p style={textStyle}>
            This deck entry cannot resolve its canonical card.
          </p>
        ) : (
          <div style={{ width: 180 }}>
            <GameCard
              model={entry.model}
              hideRulesText
              testId={`journey-debug-entry-card-${entry.entryId}`}
            />
          </div>
        )}
        <DeckEditControls
          entry={entry}
          transfigurationOptions={transfigurationOptions}
          onSetStatOverride={onSetStatOverride}
          onSetTransfiguration={onSetTransfiguration}
          onSetTypeChange={onSetTypeChange}
          onSetKeywords={onSetKeywords}
        />
        <GlassButton
          label={assertLocalized("Remove")}
          onPress={() => onRemove(entry.entryId)}
          placement="onGlass"
          variant="danger"
          testId={`journey-debug-remove-card-${entry.entryId}`}
        />
      </div>
    </DisclosureSection>
  );
}

function DeckEditControls({
  entry,
  transfigurationOptions,
  onSetStatOverride,
  onSetTransfiguration,
  onSetTypeChange,
  onSetKeywords,
}: {
  entry: JourneyDebugDeckEntryView;
  transfigurationOptions: JourneyDebugEditorView["transfigurationOptions"];
  onSetStatOverride: JourneyDebugEditorScreenProps["onSetStatOverride"];
  onSetTransfiguration: JourneyDebugEditorScreenProps["onSetTransfiguration"];
  onSetTypeChange: JourneyDebugEditorScreenProps["onSetTypeChange"];
  onSetKeywords: JourneyDebugEditorScreenProps["onSetKeywords"];
}): ReactElement {
  const [energy, setEnergy] = useState(
    entry.statOverride?.energyCost === undefined
      ? ""
      : String(entry.statOverride.energyCost),
  );
  const [spark, setSpark] = useState(
    entry.statOverride?.spark === undefined
      ? ""
      : String(entry.statOverride.spark),
  );
  const [transfiguration, setTransfiguration] = useState<string>(
    entry.transfiguration ?? "none",
  );
  const [cardType, setCardType] = useState<string>(
    entry.typeChange?.cardType ?? "Character",
  );
  const [subtype, setSubtype] = useState(entry.typeChange?.subtype ?? "");
  const [fast, setFast] = useState(
    entry.keywordModification?.fast === true ? "fast" : "normal",
  );
  const [reclaim, setReclaim] = useState(
    entry.keywordModification?.setReclaim === undefined
      ? ""
      : String(entry.keywordModification.setReclaim),
  );
  useEffect(() => {
    setEnergy(
      entry.statOverride?.energyCost === undefined
        ? ""
        : String(entry.statOverride.energyCost),
    );
    setSpark(
      entry.statOverride?.spark === undefined
        ? ""
        : String(entry.statOverride.spark),
    );
    setTransfiguration(entry.transfiguration ?? "none");
    setCardType(entry.typeChange?.cardType ?? "Character");
    setSubtype(entry.typeChange?.subtype ?? "");
    setFast(entry.keywordModification?.fast === true ? "fast" : "normal");
    setReclaim(
      entry.keywordModification?.setReclaim === undefined
        ? ""
        : String(entry.keywordModification.setReclaim),
    );
  }, [entry]);
  const commitStats = (): void => {
    const next: { energyCost?: number; spark?: number } = {};
    const parsedEnergy = Number(energy);
    const parsedSpark = Number(spark);
    if (energy.trim() !== "" && Number.isFinite(parsedEnergy))
      next.energyCost = parsedEnergy;
    if (spark.trim() !== "" && Number.isFinite(parsedSpark))
      next.spark = parsedSpark;
    onSetStatOverride(
      entry.entryId,
      Object.keys(next).length === 0 ? null : next,
    );
  };
  const commitKeywords = (): void => {
    const parsed = Number(reclaim);
    onSetKeywords(entry.entryId, {
      fast: fast === "fast",
      ...(reclaim.trim() !== "" && Number.isFinite(parsed)
        ? { setReclaim: parsed }
        : {}),
    });
  };
  return (
    <div style={stackStyle}>
      <TextField
        label={assertLocalized("Energy override")}
        value={energy}
        onChange={setEnergy}
        placeholder={assertLocalized("Use printed energy")}
        testId={`journey-debug-energy-${entry.entryId}`}
      />
      <TextField
        label={assertLocalized("Spark override")}
        value={spark}
        onChange={setSpark}
        placeholder={assertLocalized("Use printed spark")}
        testId={`journey-debug-spark-${entry.entryId}`}
      />
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}
      >
        <GlassButton
          label={assertLocalized("Commit stats")}
          onPress={commitStats}
          placement="onGlass"
          testId={`journey-debug-commit-stats-${entry.entryId}`}
        />
        <GlassButton
          label={assertLocalized("Reset stats")}
          onPress={() => onSetStatOverride(entry.entryId, null)}
          placement="onGlass"
          testId={`journey-debug-reset-stats-${entry.entryId}`}
        />
      </div>
      <Select
        options={[...transfigurationOptions]}
        value={transfiguration}
        onChange={setTransfiguration}
        ariaLabel={assertLocalized("Transfiguration")}
      />
      <GlassButton
        label={assertLocalized("Commit transfiguration")}
        onPress={() =>
          onSetTransfiguration(
            entry.entryId,
            transfiguration === "none"
              ? null
              : (transfiguration as TransfigurationType),
          )
        }
        placement="onGlass"
        testId={`journey-debug-commit-transfiguration-${entry.entryId}`}
      />
      <Select
        options={CARD_TYPES.map((option) => ({
          ...option,
          label: assertLocalized(option.label),
          ...("triggerLabel" in option &&
          typeof option.triggerLabel === "string"
            ? { triggerLabel: assertLocalized(option.triggerLabel) }
            : {}),
        }))}
        value={cardType}
        onChange={setCardType}
        ariaLabel={assertLocalized("Card type")}
      />
      <TextField
        label={assertLocalized("Subtype")}
        value={subtype}
        onChange={setSubtype}
        testId={`journey-debug-subtype-${entry.entryId}`}
      />
      <GlassButton
        label={assertLocalized("Commit type")}
        onPress={() =>
          onSetTypeChange(entry.entryId, {
            predicateId: asCardTypeChangePredicateId("debug"),
            cardType: cardType as CardTypeChange["cardType"],
            subtype,
            label: "Debug edit",
          })
        }
        placement="onGlass"
        testId={`journey-debug-commit-type-${entry.entryId}`}
      />
      <SegmentedControl
        options={[
          { value: "normal", label: assertLocalized("Normal") },
          { value: "fast", label: assertLocalized("Fast") },
        ]}
        value={fast}
        onChange={setFast}
        full
      />
      <TextField
        label={assertLocalized("Reclaim")}
        value={reclaim}
        onChange={setReclaim}
        placeholder={assertLocalized("None")}
        testId={`journey-debug-reclaim-${entry.entryId}`}
      />
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}
      >
        <GlassButton
          label={assertLocalized("Commit keywords")}
          onPress={commitKeywords}
          placement="onGlass"
          testId={`journey-debug-commit-keywords-${entry.entryId}`}
        />
        <GlassButton
          label={assertLocalized("Clear keywords")}
          onPress={() => onSetKeywords(entry.entryId, null)}
          placement="onGlass"
          testId={`journey-debug-clear-keywords-${entry.entryId}`}
        />
        <GlassButton
          label={assertLocalized("Reset type")}
          onPress={() => onSetTypeChange(entry.entryId, null)}
          placement="onGlass"
          testId={`journey-debug-reset-type-${entry.entryId}`}
        />
      </div>
    </div>
  );
}

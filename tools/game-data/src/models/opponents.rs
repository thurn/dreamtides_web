use std::collections::BTreeSet;
use std::fmt;
use std::str::FromStr;

use anyhow::{Result, bail};
use indexmap::IndexMap;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::dreamwell::{self, DreamwellRules};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OpponentsCatalog {
    pub progression: ProgressionRules,
    pub corpus_selection: CorpusSelectionRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InternalAiCatalog {
    pub journey_ai_deck: Vec<DeckEntry>,
    pub ai: AiRules,
}

struct CombinedCatalog {
    battle: BattleRules,
    dreamwell: DreamwellRules,
    progression: ProgressionRules,
    corpus_selection: CorpusSelectionRules,
    journey_ai_deck: Vec<DeckEntry>,
    ai: AiRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BattleRules {
    pub minimum_deck_size: u32,
    pub player_opening_hand_size: u32,
    pub enemy_opening_hand_size: u32,
    pub score_targets: Vec<u32>,
    pub turn_limit: u32,
    pub energy_cap: u32,
    pub hand_limit: u32,
    pub starting_side: StartingSide,
    pub skip_player_opening_draw: bool,
    pub opponent_signature_card_count: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum StartingSide {
    Player,
    Enemy,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ProgressionRules {
    pub ability_active_from_layer: u32,
    pub dreamsigns_from_layer: u32,
    pub legendaries_from_layer: u32,
    pub starter_dilution: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CorpusSelectionRules {
    pub affiliation_weight: f64,
    pub top_ranked_sampling_window: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DeckEntry {
    pub card_id: CardId,
    pub count: u32,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CardId(Uuid);

impl CardId {
    pub fn as_hyphenated(self) -> String {
        self.0.hyphenated().to_string()
    }

    fn parse(value: &str) -> Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("card identity must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("card identity must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl FromStr for CardId {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::parse(value)
    }
}

impl fmt::Display for CardId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for CardId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for CardId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AiRules {
    pub journey_default_preset: AiPresetId,
    pub tutorial_default_preset: AiPresetId,
    pub evaluation: EvaluationWeights,
    pub opponent_model: OpponentModelRules,
    pub presets: IndexMap<AiPresetId, AiPreset>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum AiPresetId {
    Standard,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EvaluationWeights {
    pub score_difference: f64,
    pub front_rank_spark: f64,
    pub back_rank_spark: f64,
    pub hand_card: f64,
    pub value_hint: f64,
    pub energy_waste: f64,
    pub expected_points: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OpponentModelRules {
    pub removal_prior: f64,
    pub sample_safety_cap: u32,
    pub response_archetype_priors: ResponseArchetypePriors,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ResponseArchetypePriors {
    pub no_blocks: f64,
    pub block_biggest: f64,
    pub trade_evenly: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AiPreset {
    pub beam_width: u32,
    pub opponent_mode: OpponentMode,
    pub sample_count: u32,
    pub search_depth: u32,
    pub journey_planning_budget_ms: u32,
    pub tutorial_expansion_budget: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum OpponentMode {
    Expectiminimax,
    WorstCase,
}

impl StartingSide {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Player => "player",
            Self::Enemy => "enemy",
        }
    }
}

impl AiPresetId {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Standard => "standard",
        }
    }
}

impl OpponentMode {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Expectiminimax => "expectiminimax",
            Self::WorstCase => "worstCase",
        }
    }
}

#[derive(Serialize)]
struct CompatibilityCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    battle: CompatibilityBattleRules,
    dreamwell: CompatibilityDreamwellRules,
    progression: CompatibilityProgressionRules,
    #[serde(rename = "corpus-selection")]
    corpus_selection: CompatibilityCorpusSelectionRules,
    #[serde(rename = "journey-ai-deck")]
    journey_ai_deck: Vec<CompatibilityDeckEntry>,
    ai: CompatibilityAiRules,
}

#[derive(Serialize)]
struct CompatibilityBattleCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    battle: CompatibilityBattleRules,
}

#[derive(Serialize)]
struct CompatibilityInternalAiCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    #[serde(rename = "journey-ai-deck")]
    journey_ai_deck: Vec<CompatibilityDeckEntry>,
    ai: CompatibilityAiRules,
}

#[derive(Serialize)]
struct CompatibilityBattleRules {
    #[serde(rename = "minimum-deck-size")]
    minimum_deck_size: u32,
    #[serde(rename = "player-opening-hand-size")]
    player_opening_hand_size: u32,
    #[serde(rename = "enemy-opening-hand-size")]
    enemy_opening_hand_size: u32,
    #[serde(rename = "score-targets")]
    score_targets: Vec<u32>,
    #[serde(rename = "turn-limit")]
    turn_limit: u32,
    #[serde(rename = "energy-cap")]
    energy_cap: u32,
    #[serde(rename = "hand-limit")]
    hand_limit: u32,
    #[serde(rename = "starting-side")]
    starting_side: &'static str,
    #[serde(rename = "skip-player-opening-draw")]
    skip_player_opening_draw: bool,
    #[serde(rename = "opponent-signature-card-count")]
    opponent_signature_card_count: u32,
}

#[derive(Serialize)]
struct CompatibilityDreamwellRules {
    #[serde(rename = "opening-orders")]
    opening_orders: Vec<u32>,
    #[serde(rename = "recurring-orders")]
    recurring_orders: Vec<u32>,
    #[serde(rename = "cards-per-recurring-order")]
    cards_per_recurring_order: u32,
    #[serde(rename = "minimum-constructed-length")]
    minimum_constructed_length: u32,
}

#[derive(Serialize)]
struct CompatibilityProgressionRules {
    #[serde(rename = "ability-active-from-layer")]
    ability_active_from_layer: u32,
    #[serde(rename = "dreamsigns-from-layer")]
    dreamsigns_from_layer: u32,
    #[serde(rename = "legendaries-from-layer")]
    legendaries_from_layer: u32,
    #[serde(rename = "starter-dilution")]
    starter_dilution: Vec<u32>,
}

#[derive(Serialize)]
struct CompatibilityCorpusSelectionRules {
    #[serde(rename = "affiliation-weight")]
    affiliation_weight: toml::Value,
    #[serde(rename = "top-ranked-sampling-window")]
    top_ranked_sampling_window: u32,
}

#[derive(Serialize)]
struct CompatibilityDeckEntry {
    #[serde(rename = "card-id")]
    card_id: String,
    count: u32,
}

#[derive(Serialize)]
struct CompatibilityAiRules {
    #[serde(rename = "journey-default-preset")]
    journey_default_preset: &'static str,
    #[serde(rename = "tutorial-default-preset")]
    tutorial_default_preset: &'static str,
    evaluation: CompatibilityEvaluationWeights,
    #[serde(rename = "opponent-model")]
    opponent_model: CompatibilityOpponentModelRules,
    presets: Vec<CompatibilityAiPreset>,
}

#[derive(Serialize)]
struct CompatibilityEvaluationWeights {
    #[serde(rename = "score-difference-weight")]
    score_difference_weight: toml::Value,
    #[serde(rename = "front-rank-spark-weight")]
    front_rank_spark_weight: toml::Value,
    #[serde(rename = "back-rank-spark-weight")]
    back_rank_spark_weight: toml::Value,
    #[serde(rename = "hand-card-weight")]
    hand_card_weight: toml::Value,
    #[serde(rename = "value-hint-weight")]
    value_hint_weight: toml::Value,
    #[serde(rename = "energy-waste-weight")]
    energy_waste_weight: toml::Value,
    #[serde(rename = "expected-points-weight")]
    expected_points_weight: toml::Value,
}

#[derive(Serialize)]
struct CompatibilityOpponentModelRules {
    #[serde(rename = "removal-prior")]
    removal_prior: toml::Value,
    #[serde(rename = "sample-safety-cap")]
    sample_safety_cap: u32,
    #[serde(rename = "response-archetype-priors")]
    response_archetype_priors: CompatibilityResponseArchetypePriors,
}

#[derive(Serialize)]
struct CompatibilityResponseArchetypePriors {
    #[serde(rename = "no-blocks")]
    no_blocks: toml::Value,
    #[serde(rename = "block-biggest")]
    block_biggest: toml::Value,
    #[serde(rename = "trade-evenly")]
    trade_evenly: toml::Value,
}

#[derive(Serialize)]
struct CompatibilityAiPreset {
    id: &'static str,
    #[serde(rename = "beam-width")]
    beam_width: u32,
    #[serde(rename = "opponent-mode")]
    opponent_mode: &'static str,
    #[serde(rename = "sample-count")]
    sample_count: u32,
    #[serde(rename = "search-depth")]
    search_depth: u32,
    #[serde(rename = "journey-planning-budget-ms")]
    journey_planning_budget_ms: u32,
    #[serde(rename = "tutorial-expansion-budget")]
    tutorial_expansion_budget: u32,
}

pub fn lower(
    opponents: OpponentsCatalog,
    battle: BattleRules,
    dreamwell: DreamwellRules,
    internal_ai: InternalAiCatalog,
) -> Result<toml::Value> {
    let source = CombinedCatalog {
        battle,
        dreamwell,
        progression: opponents.progression,
        corpus_selection: opponents.corpus_selection,
        journey_ai_deck: internal_ai.journey_ai_deck,
        ai: internal_ai.ai,
    };
    validate(&source)?;

    let compatibility = CompatibilityCatalog {
        schema_version: 1,
        battle: compatibility_battle(&source.battle),
        dreamwell: CompatibilityDreamwellRules {
            opening_orders: source.dreamwell.opening_orders,
            recurring_orders: source.dreamwell.recurring_orders,
            cards_per_recurring_order: source.dreamwell.cards_per_recurring_order,
            minimum_constructed_length: source.dreamwell.minimum_constructed_length,
        },
        progression: CompatibilityProgressionRules {
            ability_active_from_layer: source.progression.ability_active_from_layer,
            dreamsigns_from_layer: source.progression.dreamsigns_from_layer,
            legendaries_from_layer: source.progression.legendaries_from_layer,
            starter_dilution: source.progression.starter_dilution,
        },
        corpus_selection: CompatibilityCorpusSelectionRules {
            affiliation_weight: compatibility_number(source.corpus_selection.affiliation_weight),
            top_ranked_sampling_window: source.corpus_selection.top_ranked_sampling_window,
        },
        journey_ai_deck: compatibility_deck(&source.journey_ai_deck),
        ai: compatibility_ai(&source.ai),
    };

    Ok(toml::Value::try_from(compatibility)?)
}

pub fn lower_battle(source: BattleRules) -> Result<toml::Value> {
    validate_battle_rules(&source)?;
    let compatibility = CompatibilityBattleCatalog {
        schema_version: 1,
        battle: compatibility_battle(&source),
    };
    Ok(toml::Value::try_from(compatibility)?)
}

pub fn lower_internal_ai(source: InternalAiCatalog) -> Result<toml::Value> {
    validate_internal_ai(&source)?;
    let compatibility = CompatibilityInternalAiCatalog {
        schema_version: 1,
        journey_ai_deck: compatibility_deck(&source.journey_ai_deck),
        ai: compatibility_ai(&source.ai),
    };
    Ok(toml::Value::try_from(compatibility)?)
}

fn compatibility_battle(source: &BattleRules) -> CompatibilityBattleRules {
    CompatibilityBattleRules {
        minimum_deck_size: source.minimum_deck_size,
        player_opening_hand_size: source.player_opening_hand_size,
        enemy_opening_hand_size: source.enemy_opening_hand_size,
        score_targets: source.score_targets.clone(),
        turn_limit: source.turn_limit,
        energy_cap: source.energy_cap,
        hand_limit: source.hand_limit,
        starting_side: source.starting_side.as_compat(),
        skip_player_opening_draw: source.skip_player_opening_draw,
        opponent_signature_card_count: source.opponent_signature_card_count,
    }
}

fn compatibility_deck(source: &[DeckEntry]) -> Vec<CompatibilityDeckEntry> {
    source
        .iter()
        .map(|entry| CompatibilityDeckEntry {
            card_id: entry.card_id.as_hyphenated(),
            count: entry.count,
        })
        .collect()
}

fn compatibility_ai(source: &AiRules) -> CompatibilityAiRules {
    CompatibilityAiRules {
        journey_default_preset: source.journey_default_preset.as_compat(),
        tutorial_default_preset: source.tutorial_default_preset.as_compat(),
        evaluation: CompatibilityEvaluationWeights {
            score_difference_weight: compatibility_number(source.evaluation.score_difference),
            front_rank_spark_weight: compatibility_number(source.evaluation.front_rank_spark),
            back_rank_spark_weight: compatibility_number(source.evaluation.back_rank_spark),
            hand_card_weight: compatibility_number(source.evaluation.hand_card),
            value_hint_weight: compatibility_number(source.evaluation.value_hint),
            energy_waste_weight: compatibility_number(source.evaluation.energy_waste),
            expected_points_weight: compatibility_number(source.evaluation.expected_points),
        },
        opponent_model: CompatibilityOpponentModelRules {
            removal_prior: compatibility_number(source.opponent_model.removal_prior),
            sample_safety_cap: source.opponent_model.sample_safety_cap,
            response_archetype_priors: CompatibilityResponseArchetypePriors {
                no_blocks: compatibility_number(
                    source.opponent_model.response_archetype_priors.no_blocks,
                ),
                block_biggest: compatibility_number(
                    source
                        .opponent_model
                        .response_archetype_priors
                        .block_biggest,
                ),
                trade_evenly: compatibility_number(
                    source.opponent_model.response_archetype_priors.trade_evenly,
                ),
            },
        },
        presets: source
            .presets
            .iter()
            .map(|(id, preset)| CompatibilityAiPreset {
                id: id.as_compat(),
                beam_width: preset.beam_width,
                opponent_mode: preset.opponent_mode.as_compat(),
                sample_count: preset.sample_count,
                search_depth: preset.search_depth,
                journey_planning_budget_ms: preset.journey_planning_budget_ms,
                tutorial_expansion_budget: preset.tutorial_expansion_budget,
            })
            .collect(),
    }
}

fn compatibility_number(value: f64) -> toml::Value {
    if value.fract() == 0.0 {
        toml::Value::Integer(value as i64)
    } else {
        toml::Value::Float(value)
    }
}

pub fn validate_card_references(
    source: &InternalAiCatalog,
    known_card_ids: &BTreeSet<CardId>,
) -> Result<()> {
    for entry in &source.journey_ai_deck {
        if !known_card_ids.contains(&entry.card_id) {
            bail!(
                "journey_ai_deck card {} does not reference the card catalog",
                entry.card_id
            );
        }
    }
    Ok(())
}

fn validate(source: &CombinedCatalog) -> Result<()> {
    validate_battle_rules(&source.battle)?;

    dreamwell::validate_rules(&source.dreamwell)?;
    require_nonempty(
        "progression.starter_dilution",
        &source.progression.starter_dilution,
    )?;

    require_unit_interval(
        "corpus_selection.affiliation_weight",
        source.corpus_selection.affiliation_weight,
    )?;
    require_positive(
        "corpus_selection.top_ranked_sampling_window",
        source.corpus_selection.top_ranked_sampling_window,
    )?;
    validate_deck(&source.journey_ai_deck)?;
    validate_ai(&source.ai)?;
    Ok(())
}

fn validate_battle_rules(source: &BattleRules) -> Result<()> {
    require_positive("battle.minimum_deck_size", source.minimum_deck_size)?;
    require_nonempty_positive("battle.score_targets", &source.score_targets)?;
    require_positive("battle.turn_limit", source.turn_limit)?;
    require_positive("battle.energy_cap", source.energy_cap)?;
    require_positive("battle.hand_limit", source.hand_limit)?;
    Ok(())
}

fn validate_internal_ai(source: &InternalAiCatalog) -> Result<()> {
    validate_deck(&source.journey_ai_deck)?;
    validate_ai(&source.ai)
}

fn validate_deck(entries: &[DeckEntry]) -> Result<()> {
    require_nonempty("journey_ai_deck", entries)?;
    let mut ids = BTreeSet::new();
    for entry in entries {
        if !ids.insert(entry.card_id) {
            bail!("journey_ai_deck contains duplicate card {}", entry.card_id);
        }
        require_positive("journey_ai_deck.count", entry.count)?;
    }
    Ok(())
}

fn validate_ai(source: &AiRules) -> Result<()> {
    for (path, value) in [
        (
            "ai.evaluation.score_difference",
            source.evaluation.score_difference,
        ),
        (
            "ai.evaluation.front_rank_spark",
            source.evaluation.front_rank_spark,
        ),
        (
            "ai.evaluation.back_rank_spark",
            source.evaluation.back_rank_spark,
        ),
        ("ai.evaluation.hand_card", source.evaluation.hand_card),
        ("ai.evaluation.value_hint", source.evaluation.value_hint),
        ("ai.evaluation.energy_waste", source.evaluation.energy_waste),
        (
            "ai.evaluation.expected_points",
            source.evaluation.expected_points,
        ),
    ] {
        require_nonnegative_finite(path, value)?;
    }

    require_unit_interval(
        "ai.opponent_model.removal_prior",
        source.opponent_model.removal_prior,
    )?;
    if !(1..=64).contains(&source.opponent_model.sample_safety_cap) {
        bail!("ai.opponent_model.sample_safety_cap must be from 1 to 64");
    }
    for (path, value) in [
        (
            "ai.opponent_model.response_archetype_priors.no_blocks",
            source.opponent_model.response_archetype_priors.no_blocks,
        ),
        (
            "ai.opponent_model.response_archetype_priors.block_biggest",
            source
                .opponent_model
                .response_archetype_priors
                .block_biggest,
        ),
        (
            "ai.opponent_model.response_archetype_priors.trade_evenly",
            source.opponent_model.response_archetype_priors.trade_evenly,
        ),
    ] {
        require_positive_finite(path, value)?;
    }

    if source.presets.is_empty() {
        bail!("ai.presets must not be empty");
    }
    if !source.presets.contains_key(&source.journey_default_preset) {
        bail!("ai.journey_default_preset has no matching preset");
    }
    if !source.presets.contains_key(&source.tutorial_default_preset) {
        bail!("ai.tutorial_default_preset has no matching preset");
    }
    for (id, preset) in &source.presets {
        if !(1..=128).contains(&preset.beam_width) {
            bail!(
                "ai preset {} beam_width must be from 1 to 128",
                id.as_compat()
            );
        }
        require_positive("ai.presets.sample_count", preset.sample_count)?;
        if preset.sample_count > source.opponent_model.sample_safety_cap {
            bail!(
                "ai preset {} sample_count must not exceed sample_safety_cap",
                id.as_compat()
            );
        }
        if !(1..=128).contains(&preset.search_depth) {
            bail!(
                "ai preset {} search_depth must be from 1 to 128",
                id.as_compat()
            );
        }
        require_positive(
            "ai.presets.journey_planning_budget_ms",
            preset.journey_planning_budget_ms,
        )?;
        require_positive(
            "ai.presets.tutorial_expansion_budget",
            preset.tutorial_expansion_budget,
        )?;
    }
    Ok(())
}

fn require_nonempty<T>(path: &str, values: &[T]) -> Result<()> {
    if values.is_empty() {
        bail!("{path} must not be empty");
    }
    Ok(())
}

fn require_nonempty_positive(path: &str, values: &[u32]) -> Result<()> {
    require_nonempty(path, values)?;
    if values.contains(&0) {
        bail!("{path} values must be positive");
    }
    Ok(())
}

fn require_positive(path: &str, value: u32) -> Result<()> {
    if value == 0 {
        bail!("{path} must be positive");
    }
    Ok(())
}

fn require_nonnegative_finite(path: &str, value: f64) -> Result<()> {
    if !value.is_finite() || value < 0.0 {
        bail!("{path} must be a finite non-negative number");
    }
    Ok(())
}

fn require_positive_finite(path: &str, value: f64) -> Result<()> {
    if !value.is_finite() || value <= 0.0 {
        bail!("{path} must be a finite positive number");
    }
    Ok(())
}

fn require_unit_interval(path: &str, value: f64) -> Result<()> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        bail!("{path} must be a finite number from 0 to 1");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    const CARD_ONE: &str = "00000000-0000-4000-8000-000000000001";
    const CARD_TWO: &str = "00000000-0000-4000-8000-000000000002";

    fn catalog() -> OpponentsCatalog {
        OpponentsCatalog {
            progression: ProgressionRules {
                ability_active_from_layer: 0,
                dreamsigns_from_layer: 2,
                legendaries_from_layer: 4,
                starter_dilution: vec![6, 3],
            },
            corpus_selection: CorpusSelectionRules {
                affiliation_weight: 0.75,
                top_ranked_sampling_window: 5,
            },
        }
    }

    fn dreamwell_rules() -> DreamwellRules {
        DreamwellRules {
            opening_orders: vec![8],
            recurring_orders: vec![9, 10],
            cards_per_recurring_order: 2,
            minimum_constructed_length: 14,
        }
    }

    fn battle() -> BattleRules {
        BattleRules {
            minimum_deck_size: 7,
            player_opening_hand_size: 2,
            enemy_opening_hand_size: 3,
            score_targets: vec![4, 9],
            turn_limit: 11,
            energy_cap: 12,
            hand_limit: 13,
            starting_side: StartingSide::Enemy,
            skip_player_opening_draw: false,
            opponent_signature_card_count: 2,
        }
    }

    fn internal_ai() -> InternalAiCatalog {
        InternalAiCatalog {
            journey_ai_deck: vec![
                DeckEntry {
                    card_id: CARD_ONE.parse().unwrap(),
                    count: 2,
                },
                DeckEntry {
                    card_id: CARD_TWO.parse().unwrap(),
                    count: 1,
                },
            ],
            ai: AiRules {
                journey_default_preset: AiPresetId::Standard,
                tutorial_default_preset: AiPresetId::Standard,
                evaluation: EvaluationWeights {
                    score_difference: 9.0,
                    front_rank_spark: 1.1,
                    back_rank_spark: 1.2,
                    hand_card: 1.3,
                    value_hint: 1.4,
                    energy_waste: 1.5,
                    expected_points: 1.6,
                },
                opponent_model: OpponentModelRules {
                    removal_prior: 0.4,
                    sample_safety_cap: 7,
                    response_archetype_priors: ResponseArchetypePriors {
                        no_blocks: 1.0,
                        block_biggest: 2.0,
                        trade_evenly: 4.0,
                    },
                },
                presets: IndexMap::from([(
                    AiPresetId::Standard,
                    AiPreset {
                        beam_width: 6,
                        opponent_mode: OpponentMode::WorstCase,
                        sample_count: 5,
                        search_depth: 7,
                        journey_planning_budget_ms: 123,
                        tutorial_expansion_budget: 456,
                    },
                )]),
            },
        }
    }

    #[test]
    fn lowers_every_compatibility_key_and_enum_variant() {
        let lowered = lower(catalog(), battle(), dreamwell_rules(), internal_ai()).unwrap();
        assert_eq!(lowered["schema-version"].as_integer(), Some(1));
        assert_eq!(lowered["battle"]["starting-side"].as_str(), Some("enemy"));
        assert_eq!(
            lowered["dreamwell"]["opening-orders"][0].as_integer(),
            Some(8)
        );
        assert_eq!(
            lowered["journey-ai-deck"][0]["card-id"].as_str(),
            Some(CARD_ONE)
        );
        assert_eq!(
            lowered["ai"]["journey-default-preset"].as_str(),
            Some("standard")
        );
        assert_eq!(
            lowered["ai"]["presets"][0]["opponent-mode"].as_str(),
            Some("worstCase")
        );

        let mut player_battle = battle();
        player_battle.starting_side = StartingSide::Player;
        let mut expectiminimax_ai = internal_ai();
        expectiminimax_ai.ai.presets[&AiPresetId::Standard].opponent_mode =
            OpponentMode::Expectiminimax;
        let lowered = lower(
            catalog(),
            player_battle,
            dreamwell_rules(),
            expectiminimax_ai,
        )
        .unwrap();
        assert_eq!(lowered["battle"]["starting-side"].as_str(), Some("player"));
        assert_eq!(
            lowered["ai"]["presets"][0]["opponent-mode"].as_str(),
            Some("expectiminimax")
        );

        let standalone_battle = lower_battle(battle()).unwrap();
        let standalone_ai = lower_internal_ai(internal_ai()).unwrap();
        let composed = lower(catalog(), battle(), dreamwell_rules(), internal_ai()).unwrap();
        assert_eq!(composed["battle"], standalone_battle["battle"]);
        assert_eq!(
            composed["journey-ai-deck"],
            standalone_ai["journey-ai-deck"]
        );
        assert_eq!(composed["ai"], standalone_ai["ai"]);
    }

    #[test]
    fn rejects_unknown_fields_and_non_uuidv4_card_identities() {
        let source = ron::ser::to_string(&battle()).unwrap();
        let unknown_battle = source.replacen(
            "minimum_deck_size:7",
            "minimum_deck_size:7,surprise:true",
            1,
        );
        assert!(ron::from_str::<BattleRules>(&unknown_battle).is_err());
        let source = ron::ser::to_string(&catalog()).unwrap();
        let unknown_opponents = source.replacen(
            "ability_active_from_layer:0",
            "ability_active_from_layer:0,surprise:true",
            1,
        );
        assert!(ron::from_str::<OpponentsCatalog>(&unknown_opponents).is_err());
        let source = ron::ser::to_string(&internal_ai()).unwrap();
        let unknown_ai = source.replacen("count:2", "count:2,surprise:true", 1);
        assert!(ron::from_str::<InternalAiCatalog>(&unknown_ai).is_err());
        for invalid in [
            "legacy-card",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
        ] {
            assert!(invalid.parse::<CardId>().is_err(), "accepted {invalid}");
        }
    }

    #[test]
    fn rejects_invalid_collections_and_preset_references() {
        let mut source = dreamwell_rules();
        source.recurring_orders.push(8);
        assert!(
            dreamwell::validate_rules(&source)
                .unwrap_err()
                .to_string()
                .contains("appears in opening and recurring")
        );

        let mut source = internal_ai();
        source.journey_ai_deck[1].card_id = source.journey_ai_deck[0].card_id;
        assert_internal_ai_error_contains(source, "duplicate card");

        let mut source = internal_ai();
        source.ai.presets.clear();
        assert_internal_ai_error_contains(source, "presets must not be empty");

        let mut source = internal_ai();
        source.ai.presets[&AiPresetId::Standard].sample_count = 8;
        assert_internal_ai_error_contains(source, "sample_count must not exceed");
    }

    #[test]
    fn validates_foreign_card_references() {
        let source = internal_ai();
        let known = BTreeSet::from([CARD_ONE.parse().unwrap(), CARD_TWO.parse().unwrap()]);
        validate_card_references(&source, &known).unwrap();

        let incomplete = BTreeSet::from([CARD_ONE.parse().unwrap()]);
        assert!(
            validate_card_references(&source, &incomplete)
                .unwrap_err()
                .to_string()
                .contains(CARD_TWO)
        );
    }

    fn assert_internal_ai_error_contains(source: InternalAiCatalog, expected: &str) {
        let error = lower_internal_ai(source).unwrap_err().to_string();
        assert!(
            error.contains(expected),
            "{error:?} did not contain {expected:?}"
        );
    }
}

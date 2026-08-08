use std::collections::HashSet;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EconomyCatalog {
    pub journey: JourneyRules,
    pub shop: ShopRules,
    pub site_rewards: SiteRewardRules,
    pub purge: PurgeRules,
    pub transfiguration: TransfigurationRules,
    pub battle_reward: BattleRewardRules,
    pub gamble: GambleRules,
    pub exploration: ExplorationRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct JourneyRules {
    pub default_starting_essence: u32,
    pub dreamsign_cap: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShopRules {
    pub prices: ShopPrices,
    pub stock: Vec<ShopStock>,
    pub discounts: DiscountRules,
    pub reroll: RerollRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShopPrices {
    pub standard_card: u32,
    pub specialty_card: u32,
    pub dreamsign: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShopStock {
    pub shop: ShopKind,
    pub card_slots: u32,
    pub dreamsign_slots: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum ShopKind {
    CardShop,
    SpecialtyShop,
    DreamsignMarket,
}

impl ShopKind {
    const ALL: [Self; 3] = [Self::CardShop, Self::SpecialtyShop, Self::DreamsignMarket];
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DiscountRules {
    pub slot_counts: Vec<WeightedValue>,
    pub percentages: Vec<WeightedValue>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct WeightedValue {
    pub value: u32,
    pub weight: RelativeWeight,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum RelativeWeight {
    Integer(u32),
    Float(f64),
}

impl RelativeWeight {
    fn is_positive_finite(self) -> bool {
        match self {
            Self::Integer(value) => value > 0,
            Self::Float(value) => value.is_finite() && value > 0.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RerollRules {
    pub standard_price: u32,
    pub enhanced_price: u32,
    pub max_per_visit: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SiteRewardRules {
    pub essence: SiteEssenceRewards,
    pub reward_fallback_essence: IntegerRange,
    pub dreamsign_revelation: DreamsignRevelationRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SiteEssenceRewards {
    pub standard: IntegerRange,
    pub enhanced: IntegerRange,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct IntegerRange {
    pub min: u32,
    pub max: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignRevelationRules {
    pub standard_offer_count: u32,
    pub enhanced_offer_count: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PurgeRules {
    pub marginal_costs: Vec<u32>,
    pub enhanced_discount_percent: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationRules {
    pub minimum_cost: u32,
    pub maximum_cost: u32,
    pub step: u32,
    pub form_bands: Vec<FormCostBand>,
    pub stat_delta_bands: Vec<StatDeltaCostBand>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CostBand {
    pub base: u32,
    pub jitter: u32,
    pub floor: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FormCostBand {
    pub form: TransfigurationForm,
    pub cost: CostBand,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum TransfigurationForm {
    Amplified,
    Attuned,
    Inspired,
    Enduring,
    Resonant,
    Perfected,
}

impl TransfigurationForm {
    const ALL: [Self; 6] = [
        Self::Amplified,
        Self::Attuned,
        Self::Inspired,
        Self::Enduring,
        Self::Resonant,
        Self::Perfected,
    ];

    fn as_compat(self) -> &'static str {
        match self {
            Self::Amplified => "Amplified",
            Self::Attuned => "Attuned",
            Self::Inspired => "Inspired",
            Self::Enduring => "Enduring",
            Self::Resonant => "Resonant",
            Self::Perfected => "Perfected",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StatDeltaCostBand {
    pub magnitude: StatDeltaMagnitude,
    pub cost: CostBand,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum StatDeltaMagnitude {
    One,
    Two,
    Three,
    FourOrMore,
}

impl StatDeltaMagnitude {
    const ALL: [Self; 4] = [Self::One, Self::Two, Self::Three, Self::FourOrMore];

    fn bounds(self) -> (u32, Option<u32>) {
        match self {
            Self::One => (1, Some(1)),
            Self::Two => (2, Some(2)),
            Self::Three => (3, Some(3)),
            Self::FourOrMore => (4, None),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BattleRewardRules {
    pub base_essence: u32,
    pub essence_per_completion_level: u32,
    pub minimum_essence: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GambleRules {
    pub three_gate: ThreeGateRules,
    pub ladder_climb: LadderClimbRules,
    pub starway_stairs: StarwayStairsRules,
    pub four_suit_reprise: FourSuitRepriseRules,
    pub blackjack: BlackjackRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ThreeGateRules {
    pub standard_wager: u32,
    pub enhanced_wager: u32,
    pub rewards: Vec<GateReward>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GateReward {
    pub gate: Gate,
    pub essence: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum Gate {
    Six,
    Nine,
    Jack,
}

impl Gate {
    const ALL: [Self; 3] = [Self::Six, Self::Nine, Self::Jack];
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LadderClimbRules {
    pub win_essence: u32,
    pub attempts: Vec<LadderAttempt>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LadderAttempt {
    pub attempt: AttemptNumber,
    pub standard_cost: u32,
    pub enhanced_cost: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum AttemptNumber {
    One,
    Two,
    Three,
    Four,
}

impl AttemptNumber {
    const ALL: [Self; 4] = [Self::One, Self::Two, Self::Three, Self::Four];

    fn value(self) -> u32 {
        match self {
            Self::One => 1,
            Self::Two => 2,
            Self::Three => 3,
            Self::Four => 4,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StarwayStairsRules {
    pub standard_wager: u32,
    pub enhanced_wager: u32,
    pub tiers: Vec<StarwayTier>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StarwayTier {
    pub tier: TierNumber,
    pub essence_reward: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum TierNumber {
    One,
    Two,
    Three,
}

impl TierNumber {
    const ALL: [Self; 3] = [Self::One, Self::Two, Self::Three];

    fn value(self) -> u32 {
        match self {
            Self::One => 1,
            Self::Two => 2,
            Self::Three => 3,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FourSuitRepriseRules {
    pub standard_draw_price: u32,
    pub enhanced_draw_price: u32,
    pub essence_reward: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BlackjackRules {
    pub standard_wager: u32,
    pub enhanced_wager: u32,
    pub prize_essence: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ExplorationRules {
    pub default_essence_per_spark: u32,
}

pub fn lower(source: EconomyCatalog) -> Result<toml::Value> {
    validate(&source)?;

    let [card_shop, specialty_shop, dreamsign_market] = source.shop.stock.as_slice() else {
        unreachable!("validated shop stock cardinality");
    };
    let [six, nine, jack] = source.gamble.three_gate.rewards.as_slice() else {
        unreachable!("validated gate reward cardinality");
    };

    let compatibility = CompatibilityEconomy {
        schema_version: 1,
        journey: source.journey.into(),
        shop: CompatibilityShop {
            prices: source.shop.prices.into(),
            stock: CompatibilityStockCatalog {
                card_shop: CompatibilityStock::from(card_shop),
                specialty_shop: CompatibilityStock::from(specialty_shop),
                dreamsign_market: CompatibilityStock::from(dreamsign_market),
            },
            discounts: source.shop.discounts.into(),
            reroll: source.shop.reroll.into(),
        },
        site_rewards: CompatibilitySiteRewards {
            essence: source.site_rewards.essence,
            reward: CompatibilityReward {
                fallback_essence: source.site_rewards.reward_fallback_essence,
            },
            dreamsign_revelation: source.site_rewards.dreamsign_revelation.into(),
        },
        purge: source.purge.into(),
        transfiguration: CompatibilityTransfiguration {
            minimum_cost: source.transfiguration.minimum_cost,
            maximum_cost: source.transfiguration.maximum_cost,
            step: source.transfiguration.step,
            free_band: CostBand {
                base: 0,
                jitter: 0,
                floor: 0,
            },
            form_bands: source
                .transfiguration
                .form_bands
                .into_iter()
                .map(|entry| CompatibilityFormCostBand {
                    form: entry.form.as_compat(),
                    cost: entry.cost,
                })
                .collect(),
            stat_delta_bands: source
                .transfiguration
                .stat_delta_bands
                .into_iter()
                .map(|entry| {
                    let (minimum_delta, maximum_delta) = entry.magnitude.bounds();
                    CompatibilityStatDeltaCostBand {
                        minimum_delta,
                        maximum_delta,
                        cost: entry.cost,
                    }
                })
                .collect(),
        },
        battle_reward: source.battle_reward.into(),
        gamble: CompatibilityGamble {
            three_gate: CompatibilityThreeGate {
                standard_wager: source.gamble.three_gate.standard_wager,
                enhanced_wager: source.gamble.three_gate.enhanced_wager,
                rewards: CompatibilityGateRewards {
                    six: six.essence,
                    nine: nine.essence,
                    jack: jack.essence,
                },
            },
            ladder_climb: CompatibilityLadderClimb {
                win_essence: source.gamble.ladder_climb.win_essence,
                attempts: source
                    .gamble
                    .ladder_climb
                    .attempts
                    .into_iter()
                    .map(|entry| CompatibilityLadderAttempt {
                        attempt: entry.attempt.value(),
                        standard_cost: entry.standard_cost,
                        enhanced_cost: entry.enhanced_cost,
                    })
                    .collect(),
            },
            starway_stairs: CompatibilityStarwayStairs {
                standard_wager: source.gamble.starway_stairs.standard_wager,
                enhanced_wager: source.gamble.starway_stairs.enhanced_wager,
                tiers: source
                    .gamble
                    .starway_stairs
                    .tiers
                    .into_iter()
                    .map(|entry| CompatibilityStarwayTier {
                        tier: entry.tier.value(),
                        essence_reward: entry.essence_reward,
                    })
                    .collect(),
            },
            four_suit_reprise: source.gamble.four_suit_reprise.into(),
            blackjack: source.gamble.blackjack.into(),
        },
        exploration: source.exploration.into(),
    };

    Ok(toml::Value::try_from(compatibility)?)
}

fn validate(source: &EconomyCatalog) -> Result<()> {
    validate_identity_order("shop stock", &source.shop.stock, &ShopKind::ALL, |entry| {
        entry.shop
    })?;
    validate_weighted(
        "discount slot counts",
        &source.shop.discounts.slot_counts,
        false,
    )?;
    validate_weighted(
        "discount percentages",
        &source.shop.discounts.percentages,
        true,
    )?;
    validate_range(
        "standard Essence reward",
        source.site_rewards.essence.standard,
    )?;
    validate_range(
        "enhanced Essence reward",
        source.site_rewards.essence.enhanced,
    )?;
    validate_range(
        "Reward fallback Essence",
        source.site_rewards.reward_fallback_essence,
    )?;
    ensure!(
        !source.purge.marginal_costs.is_empty(),
        "purge marginal costs must not be empty"
    );
    validate_percent(
        "enhanced purge discount",
        source.purge.enhanced_discount_percent,
    )?;

    let transfiguration = &source.transfiguration;
    ensure!(
        transfiguration.minimum_cost <= transfiguration.maximum_cost,
        "transfiguration minimum cost must not exceed maximum cost"
    );
    ensure!(
        transfiguration.step > 0,
        "transfiguration step must be positive"
    );
    validate_identity_order(
        "transfiguration form bands",
        &transfiguration.form_bands,
        &TransfigurationForm::ALL,
        |entry| entry.form,
    )?;
    validate_identity_order(
        "transfiguration stat delta bands",
        &transfiguration.stat_delta_bands,
        &StatDeltaMagnitude::ALL,
        |entry| entry.magnitude,
    )?;
    for entry in &transfiguration.form_bands {
        validate_cost_band(transfiguration, entry.cost)?;
    }
    for entry in &transfiguration.stat_delta_bands {
        validate_cost_band(transfiguration, entry.cost)?;
    }

    validate_identity_order(
        "Three-Gate rewards",
        &source.gamble.three_gate.rewards,
        &Gate::ALL,
        |entry| entry.gate,
    )?;
    validate_identity_order(
        "Ladder Climb attempts",
        &source.gamble.ladder_climb.attempts,
        &AttemptNumber::ALL,
        |entry| entry.attempt,
    )?;
    validate_identity_order(
        "Starway Stairs tiers",
        &source.gamble.starway_stairs.tiers,
        &TierNumber::ALL,
        |entry| entry.tier,
    )?;
    Ok(())
}

fn validate_weighted(label: &str, entries: &[WeightedValue], percentage: bool) -> Result<()> {
    ensure!(!entries.is_empty(), "{label} must not be empty");
    let mut values = HashSet::new();
    for entry in entries {
        ensure!(
            values.insert(entry.value),
            "{label} repeats value {}",
            entry.value
        );
        ensure!(
            entry.weight.is_positive_finite(),
            "{label} weights must be positive finite numbers"
        );
        if percentage {
            validate_percent(label, entry.value)?;
        }
    }
    Ok(())
}

fn validate_percent(label: &str, value: u32) -> Result<()> {
    ensure!(value <= 100, "{label} must be from 0 through 100");
    Ok(())
}

fn validate_range(label: &str, range: IntegerRange) -> Result<()> {
    ensure!(
        range.min <= range.max,
        "{label} minimum must not exceed maximum"
    );
    Ok(())
}

fn validate_cost_band(rules: &TransfigurationRules, band: CostBand) -> Result<()> {
    for (field, value) in [
        ("base", band.base),
        ("jitter", band.jitter),
        ("floor", band.floor),
    ] {
        ensure!(
            value % rules.step == 0,
            "transfiguration band {field} must be a multiple of step"
        );
    }
    ensure!(
        (rules.minimum_cost..=rules.maximum_cost).contains(&band.base)
            && (rules.minimum_cost..=rules.maximum_cost).contains(&band.floor),
        "transfiguration band base and floor must be within global bounds"
    );
    Ok(())
}

fn validate_identity_order<T, I>(
    label: &str,
    entries: &[T],
    expected: &[I],
    identity: impl Fn(&T) -> I,
) -> Result<()>
where
    I: Copy + Eq,
{
    ensure!(
        entries.len() == expected.len()
            && entries
                .iter()
                .zip(expected)
                .all(|(entry, expected)| identity(entry) == *expected),
        "{label} must define every identity exactly once in canonical order"
    );
    Ok(())
}

#[derive(Serialize)]
struct CompatibilityEconomy {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    journey: CompatibilityJourney,
    shop: CompatibilityShop,
    #[serde(rename = "site-rewards")]
    site_rewards: CompatibilitySiteRewards,
    purge: CompatibilityPurge,
    transfiguration: CompatibilityTransfiguration,
    #[serde(rename = "battle-reward")]
    battle_reward: CompatibilityBattleReward,
    gamble: CompatibilityGamble,
    exploration: CompatibilityExploration,
}

#[derive(Serialize)]
struct CompatibilityJourney {
    #[serde(rename = "default-starting-essence")]
    default_starting_essence: u32,
    #[serde(rename = "dreamsign-cap")]
    dreamsign_cap: u32,
}

impl From<JourneyRules> for CompatibilityJourney {
    fn from(value: JourneyRules) -> Self {
        Self {
            default_starting_essence: value.default_starting_essence,
            dreamsign_cap: value.dreamsign_cap,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityShop {
    prices: CompatibilityShopPrices,
    stock: CompatibilityStockCatalog,
    discounts: CompatibilityDiscountRules,
    reroll: CompatibilityRerollRules,
}

#[derive(Serialize)]
struct CompatibilityShopPrices {
    #[serde(rename = "standard-card")]
    standard_card: u32,
    #[serde(rename = "specialty-card")]
    specialty_card: u32,
    dreamsign: u32,
}

impl From<ShopPrices> for CompatibilityShopPrices {
    fn from(value: ShopPrices) -> Self {
        Self {
            standard_card: value.standard_card,
            specialty_card: value.specialty_card,
            dreamsign: value.dreamsign,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityStockCatalog {
    #[serde(rename = "card-shop")]
    card_shop: CompatibilityStock,
    #[serde(rename = "specialty-shop")]
    specialty_shop: CompatibilityStock,
    #[serde(rename = "dreamsign-market")]
    dreamsign_market: CompatibilityStock,
}

#[derive(Serialize)]
struct CompatibilityStock {
    #[serde(rename = "card-slots")]
    card_slots: u32,
    #[serde(rename = "dreamsign-slots")]
    dreamsign_slots: u32,
}

impl From<&ShopStock> for CompatibilityStock {
    fn from(value: &ShopStock) -> Self {
        Self {
            card_slots: value.card_slots,
            dreamsign_slots: value.dreamsign_slots,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityDiscountRules {
    #[serde(rename = "slot-counts")]
    slot_counts: Vec<WeightedValue>,
    percentages: Vec<WeightedValue>,
}

impl From<DiscountRules> for CompatibilityDiscountRules {
    fn from(value: DiscountRules) -> Self {
        Self {
            slot_counts: value.slot_counts,
            percentages: value.percentages,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityRerollRules {
    #[serde(rename = "standard-price")]
    standard_price: u32,
    #[serde(rename = "enhanced-price")]
    enhanced_price: u32,
    #[serde(rename = "max-per-visit")]
    max_per_visit: u32,
}

impl From<RerollRules> for CompatibilityRerollRules {
    fn from(value: RerollRules) -> Self {
        Self {
            standard_price: value.standard_price,
            enhanced_price: value.enhanced_price,
            max_per_visit: value.max_per_visit,
        }
    }
}

#[derive(Serialize)]
struct CompatibilitySiteRewards {
    essence: SiteEssenceRewards,
    reward: CompatibilityReward,
    #[serde(rename = "dreamsign-revelation")]
    dreamsign_revelation: CompatibilityDreamsignRevelation,
}

#[derive(Serialize)]
struct CompatibilityReward {
    #[serde(rename = "fallback-essence")]
    fallback_essence: IntegerRange,
}

#[derive(Serialize)]
struct CompatibilityDreamsignRevelation {
    #[serde(rename = "standard-offer-count")]
    standard_offer_count: u32,
    #[serde(rename = "enhanced-offer-count")]
    enhanced_offer_count: u32,
}

impl From<DreamsignRevelationRules> for CompatibilityDreamsignRevelation {
    fn from(value: DreamsignRevelationRules) -> Self {
        Self {
            standard_offer_count: value.standard_offer_count,
            enhanced_offer_count: value.enhanced_offer_count,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityTransfiguration {
    #[serde(rename = "minimum-cost")]
    minimum_cost: u32,
    #[serde(rename = "maximum-cost")]
    maximum_cost: u32,
    step: u32,
    #[serde(rename = "free-band")]
    free_band: CostBand,
    #[serde(rename = "form-bands")]
    form_bands: Vec<CompatibilityFormCostBand>,
    #[serde(rename = "stat-delta-bands")]
    stat_delta_bands: Vec<CompatibilityStatDeltaCostBand>,
}

#[derive(Serialize)]
struct CompatibilityPurge {
    #[serde(rename = "marginal-costs")]
    marginal_costs: Vec<u32>,
    #[serde(rename = "enhanced-discount-percent")]
    enhanced_discount_percent: u32,
}

impl From<PurgeRules> for CompatibilityPurge {
    fn from(value: PurgeRules) -> Self {
        Self {
            marginal_costs: value.marginal_costs,
            enhanced_discount_percent: value.enhanced_discount_percent,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityFormCostBand {
    form: &'static str,
    #[serde(flatten)]
    cost: CostBand,
}

#[derive(Serialize)]
struct CompatibilityStatDeltaCostBand {
    #[serde(rename = "minimum-delta")]
    minimum_delta: u32,
    #[serde(rename = "maximum-delta", skip_serializing_if = "Option::is_none")]
    maximum_delta: Option<u32>,
    #[serde(flatten)]
    cost: CostBand,
}

#[derive(Serialize)]
struct CompatibilityGamble {
    #[serde(rename = "three-gate")]
    three_gate: CompatibilityThreeGate,
    #[serde(rename = "ladder-climb")]
    ladder_climb: CompatibilityLadderClimb,
    #[serde(rename = "starway-stairs")]
    starway_stairs: CompatibilityStarwayStairs,
    #[serde(rename = "four-suit-reprise")]
    four_suit_reprise: CompatibilityFourSuitReprise,
    blackjack: CompatibilityBlackjack,
}

#[derive(Serialize)]
struct CompatibilityThreeGate {
    #[serde(rename = "standard-wager")]
    standard_wager: u32,
    #[serde(rename = "enhanced-wager")]
    enhanced_wager: u32,
    rewards: CompatibilityGateRewards,
}

#[derive(Serialize)]
struct CompatibilityGateRewards {
    six: u32,
    nine: u32,
    jack: u32,
}

#[derive(Serialize)]
struct CompatibilityLadderClimb {
    #[serde(rename = "win-essence")]
    win_essence: u32,
    attempts: Vec<CompatibilityLadderAttempt>,
}

#[derive(Serialize)]
struct CompatibilityLadderAttempt {
    attempt: u32,
    #[serde(rename = "standard-cost")]
    standard_cost: u32,
    #[serde(rename = "enhanced-cost")]
    enhanced_cost: u32,
}

#[derive(Serialize)]
struct CompatibilityStarwayStairs {
    #[serde(rename = "standard-wager")]
    standard_wager: u32,
    #[serde(rename = "enhanced-wager")]
    enhanced_wager: u32,
    tiers: Vec<CompatibilityStarwayTier>,
}

#[derive(Serialize)]
struct CompatibilityStarwayTier {
    tier: u32,
    #[serde(rename = "essence-reward")]
    essence_reward: u32,
}

#[derive(Serialize)]
struct CompatibilityBattleReward {
    #[serde(rename = "base-essence")]
    base_essence: u32,
    #[serde(rename = "essence-per-completion-level")]
    essence_per_completion_level: u32,
    #[serde(rename = "minimum-essence")]
    minimum_essence: u32,
}

impl From<BattleRewardRules> for CompatibilityBattleReward {
    fn from(value: BattleRewardRules) -> Self {
        Self {
            base_essence: value.base_essence,
            essence_per_completion_level: value.essence_per_completion_level,
            minimum_essence: value.minimum_essence,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityFourSuitReprise {
    #[serde(rename = "standard-draw-price")]
    standard_draw_price: u32,
    #[serde(rename = "enhanced-draw-price")]
    enhanced_draw_price: u32,
    #[serde(rename = "essence-reward")]
    essence_reward: u32,
}

impl From<FourSuitRepriseRules> for CompatibilityFourSuitReprise {
    fn from(value: FourSuitRepriseRules) -> Self {
        Self {
            standard_draw_price: value.standard_draw_price,
            enhanced_draw_price: value.enhanced_draw_price,
            essence_reward: value.essence_reward,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityBlackjack {
    #[serde(rename = "standard-wager")]
    standard_wager: u32,
    #[serde(rename = "enhanced-wager")]
    enhanced_wager: u32,
    #[serde(rename = "prize-essence")]
    prize_essence: u32,
}

impl From<BlackjackRules> for CompatibilityBlackjack {
    fn from(value: BlackjackRules) -> Self {
        Self {
            standard_wager: value.standard_wager,
            enhanced_wager: value.enhanced_wager,
            prize_essence: value.prize_essence,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityExploration {
    #[serde(rename = "default-essence-per-spark")]
    default_essence_per_spark: u32,
}

impl From<ExplorationRules> for CompatibilityExploration {
    fn from(value: ExplorationRules) -> Self {
        Self {
            default_essence_per_spark: value.default_essence_per_spark,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use pretty_assertions::assert_eq;

    use super::*;
    use crate::models::compat::CompatDocument;

    fn catalog() -> EconomyCatalog {
        EconomyCatalog {
            journey: JourneyRules {
                default_starting_essence: 17,
                dreamsign_cap: 9,
            },
            shop: ShopRules {
                prices: ShopPrices {
                    standard_card: 11,
                    specialty_card: 22,
                    dreamsign: 7,
                },
                stock: vec![
                    ShopStock {
                        shop: ShopKind::CardShop,
                        card_slots: 1,
                        dreamsign_slots: 2,
                    },
                    ShopStock {
                        shop: ShopKind::SpecialtyShop,
                        card_slots: 3,
                        dreamsign_slots: 4,
                    },
                    ShopStock {
                        shop: ShopKind::DreamsignMarket,
                        card_slots: 5,
                        dreamsign_slots: 6,
                    },
                ],
                discounts: DiscountRules {
                    slot_counts: vec![
                        WeightedValue {
                            value: 1,
                            weight: RelativeWeight::Integer(2),
                        },
                        WeightedValue {
                            value: 3,
                            weight: RelativeWeight::Float(2.5),
                        },
                    ],
                    percentages: vec![WeightedValue {
                        value: 35,
                        weight: RelativeWeight::Float(3.75),
                    }],
                },
                reroll: RerollRules {
                    standard_price: 13,
                    enhanced_price: 2,
                    max_per_visit: 4,
                },
            },
            site_rewards: SiteRewardRules {
                essence: SiteEssenceRewards {
                    standard: IntegerRange { min: 10, max: 20 },
                    enhanced: IntegerRange { min: 30, max: 50 },
                },
                reward_fallback_essence: IntegerRange { min: 12, max: 48 },
                dreamsign_revelation: DreamsignRevelationRules {
                    standard_offer_count: 2,
                    enhanced_offer_count: 5,
                },
            },
            purge: PurgeRules {
                marginal_costs: vec![8, 21],
                enhanced_discount_percent: 15,
            },
            transfiguration: TransfigurationRules {
                minimum_cost: 0,
                maximum_cost: 120,
                step: 5,
                form_bands: TransfigurationForm::ALL
                    .into_iter()
                    .enumerate()
                    .map(|(index, form)| FormCostBand {
                        form,
                        cost: CostBand {
                            base: 10 + index as u32 * 5,
                            jitter: 5,
                            floor: 5,
                        },
                    })
                    .collect(),
                stat_delta_bands: StatDeltaMagnitude::ALL
                    .into_iter()
                    .enumerate()
                    .map(|(index, magnitude)| StatDeltaCostBand {
                        magnitude,
                        cost: CostBand {
                            base: 40 + index as u32 * 5,
                            jitter: 10,
                            floor: 15,
                        },
                    })
                    .collect(),
            },
            battle_reward: BattleRewardRules {
                base_essence: 31,
                essence_per_completion_level: 9,
                minimum_essence: 3,
            },
            gamble: GambleRules {
                three_gate: ThreeGateRules {
                    standard_wager: 14,
                    enhanced_wager: 6,
                    rewards: vec![
                        GateReward {
                            gate: Gate::Six,
                            essence: 41,
                        },
                        GateReward {
                            gate: Gate::Nine,
                            essence: 42,
                        },
                        GateReward {
                            gate: Gate::Jack,
                            essence: 43,
                        },
                    ],
                },
                ladder_climb: LadderClimbRules {
                    win_essence: 16,
                    attempts: AttemptNumber::ALL
                        .into_iter()
                        .enumerate()
                        .map(|(index, attempt)| LadderAttempt {
                            attempt,
                            standard_cost: index as u32 + 1,
                            enhanced_cost: index as u32 + 6,
                        })
                        .collect(),
                },
                starway_stairs: StarwayStairsRules {
                    standard_wager: 18,
                    enhanced_wager: 12,
                    tiers: TierNumber::ALL
                        .into_iter()
                        .enumerate()
                        .map(|(index, tier)| StarwayTier {
                            tier,
                            essence_reward: 70 + index as u32,
                        })
                        .collect(),
                },
                four_suit_reprise: FourSuitRepriseRules {
                    standard_draw_price: 19,
                    enhanced_draw_price: 10,
                    essence_reward: 81,
                },
                blackjack: BlackjackRules {
                    standard_wager: 23,
                    enhanced_wager: 12,
                    prize_essence: 91,
                },
            },
            exploration: ExplorationRules {
                default_essence_per_spark: 27,
            },
        }
    }

    #[test]
    fn lowers_every_typed_identity_and_compatibility_sentinel() {
        let lowered = lower(catalog()).unwrap();
        let root = lowered.as_table().unwrap();
        assert_eq!(
            root.keys().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "schema-version",
                "journey",
                "shop",
                "site-rewards",
                "purge",
                "transfiguration",
                "battle-reward",
                "gamble",
                "exploration",
            ]
        );
        assert_eq!(lowered["schema-version"].as_integer(), Some(1));
        assert_eq!(
            lowered["journey"]["default-starting-essence"].as_integer(),
            Some(17)
        );
        assert_eq!(
            lowered["shop"]["stock"]
                .as_table()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["card-shop", "specialty-shop", "dreamsign-market"]
        );
        assert_eq!(
            lowered["shop"]["discounts"]["slot-counts"][0]["weight"].as_integer(),
            Some(2)
        );
        assert_eq!(
            lowered["shop"]["discounts"]["slot-counts"][1]["weight"].as_float(),
            Some(2.5)
        );
        assert_eq!(
            lowered["site-rewards"]["reward"]["fallback-essence"]["max"].as_integer(),
            Some(48)
        );

        let transfiguration = &lowered["transfiguration"];
        assert_eq!(
            transfiguration["free-band"],
            toml::Value::try_from(CostBand {
                base: 0,
                jitter: 0,
                floor: 0,
            })
            .unwrap()
        );
        assert_eq!(
            transfiguration["form-bands"]
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| entry["form"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec![
                "Amplified",
                "Attuned",
                "Inspired",
                "Enduring",
                "Resonant",
                "Perfected"
            ]
        );
        let delta_bands = transfiguration["stat-delta-bands"].as_array().unwrap();
        assert_eq!(delta_bands[0]["minimum-delta"].as_integer(), Some(1));
        assert_eq!(delta_bands[0]["maximum-delta"].as_integer(), Some(1));
        assert!(
            !delta_bands[3]
                .as_table()
                .unwrap()
                .contains_key("maximum-delta")
        );

        assert_eq!(
            lowered["gamble"]["three-gate"]["rewards"]["jack"].as_integer(),
            Some(43)
        );
        assert_eq!(
            lowered["gamble"]["ladder-climb"]["attempts"][3]["attempt"].as_integer(),
            Some(4)
        );
        assert_eq!(
            lowered["gamble"]["starway-stairs"]["tiers"][2]["tier"].as_integer(),
            Some(3)
        );
        assert_eq!(
            lowered["exploration"]["default-essence-per-spark"].as_integer(),
            Some(27)
        );
    }

    #[test]
    fn strictly_deserializes_the_canonical_shape() {
        let serialized = ron::ser::to_string(&catalog()).unwrap();
        assert_eq!(
            ron::from_str::<EconomyCatalog>(&serialized).unwrap(),
            catalog()
        );

        let unknown = serialized.replacen('(', "(surprise:true,", 1);
        assert!(ron::from_str::<EconomyCatalog>(&unknown).is_err());

        let negative = serialized.replacen(
            "default_starting_essence:17",
            "default_starting_essence:-1",
            1,
        );
        assert!(ron::from_str::<EconomyCatalog>(&negative).is_err());
    }

    #[test]
    fn rejects_invalid_ranges_distributions_percentages_and_bands() {
        let mut source = catalog();
        source.site_rewards.essence.standard = IntegerRange { min: 2, max: 1 };
        assert_error_contains(source, "minimum must not exceed maximum");

        let mut source = catalog();
        source.shop.discounts.slot_counts.clear();
        assert_error_contains(source, "must not be empty");

        let mut source = catalog();
        source.shop.discounts.slot_counts[1].value = source.shop.discounts.slot_counts[0].value;
        assert_error_contains(source, "repeats value");

        let mut source = catalog();
        source.shop.discounts.slot_counts[0].weight = RelativeWeight::Float(f64::NAN);
        assert_error_contains(source, "positive finite");

        let mut source = catalog();
        source.shop.discounts.percentages[0].value = 101;
        assert_error_contains(source, "from 0 through 100");

        let mut source = catalog();
        source.purge.marginal_costs.clear();
        assert_error_contains(source, "purge marginal costs must not be empty");

        let mut source = catalog();
        source.transfiguration.step = 0;
        assert_error_contains(source, "step must be positive");

        let mut source = catalog();
        source.transfiguration.form_bands[0].cost.base = 11;
        assert_error_contains(source, "multiple of step");

        let mut source = catalog();
        source.transfiguration.form_bands[0].cost.floor = 125;
        assert_error_contains(source, "within global bounds");
    }

    #[test]
    fn rejects_missing_duplicate_and_out_of_order_closed_identities() {
        let mut source = catalog();
        source.shop.stock.swap(0, 1);
        assert_error_contains(source, "shop stock");

        let mut source = catalog();
        source.transfiguration.form_bands.pop();
        assert_error_contains(source, "form bands");

        let mut source = catalog();
        source.transfiguration.stat_delta_bands[1].magnitude = StatDeltaMagnitude::One;
        assert_error_contains(source, "stat delta bands");

        let mut source = catalog();
        source.gamble.three_gate.rewards.swap(1, 2);
        assert_error_contains(source, "Three-Gate rewards");

        let mut source = catalog();
        source.gamble.ladder_climb.attempts.pop();
        assert_error_contains(source, "Ladder Climb attempts");

        let mut source = catalog();
        source.gamble.starway_stairs.tiers[2].tier = TierNumber::Two;
        assert_error_contains(source, "Starway Stairs tiers");
    }

    fn assert_error_contains(source: EconomyCatalog, expected: &str) {
        let error = lower(source).unwrap_err().to_string();
        assert!(
            error.contains(expected),
            "{error:?} did not contain {expected:?}"
        );
    }

    #[test]
    #[ignore = "real-catalog parity probe retained for canonical economy review"]
    fn canonical_candidate_matches_current_compatibility_sources() {
        const SHOP_MAP: [(&str, ShopKind); 3] = [
            ("card-shop", ShopKind::CardShop),
            ("specialty-shop", ShopKind::SpecialtyShop),
            ("dreamsign-market", ShopKind::DreamsignMarket),
        ];
        const FORM_MAP: [(&str, TransfigurationForm); 6] = [
            ("Amplified", TransfigurationForm::Amplified),
            ("Attuned", TransfigurationForm::Attuned),
            ("Inspired", TransfigurationForm::Inspired),
            ("Enduring", TransfigurationForm::Enduring),
            ("Resonant", TransfigurationForm::Resonant),
            ("Perfected", TransfigurationForm::Perfected),
        ];
        const DELTA_MAP: [((i64, Option<i64>), StatDeltaMagnitude); 4] = [
            ((1, Some(1)), StatDeltaMagnitude::One),
            ((2, Some(2)), StatDeltaMagnitude::Two),
            ((3, Some(3)), StatDeltaMagnitude::Three),
            ((4, None), StatDeltaMagnitude::FourOrMore),
        ];
        const GATE_MAP: [(&str, Gate); 3] = [
            ("six", Gate::Six),
            ("nine", Gate::Nine),
            ("jack", Gate::Jack),
        ];
        const ATTEMPT_MAP: [(i64, AttemptNumber); 4] = [
            (1, AttemptNumber::One),
            (2, AttemptNumber::Two),
            (3, AttemptNumber::Three),
            (4, AttemptNumber::Four),
        ];
        const TIER_MAP: [(i64, TierNumber); 3] = [
            (1, TierNumber::One),
            (2, TierNumber::Two),
            (3, TierNumber::Three),
        ];

        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let current: CompatDocument =
            ron::from_str(&fs::read_to_string(root.join("data/economy.ron")).unwrap()).unwrap();
        let generated: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/economy.toml")).unwrap()).unwrap();
        assert_eq!(current.data, generated);

        let candidate: EconomyCatalog =
            ron::from_str(&fs::read_to_string(root.join("data/economy_canonical.ron")).unwrap())
                .unwrap();
        assert_eq!(lower(candidate.clone()).unwrap(), current.data);

        assert_eq!(
            current.data["shop"]["stock"]
                .as_table()
                .unwrap()
                .keys()
                .map(String::as_str)
                .zip(candidate.shop.stock.iter().map(|entry| entry.shop))
                .collect::<Vec<_>>(),
            SHOP_MAP
        );
        assert_eq!(
            current.data["transfiguration"]["form-bands"]
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| entry["form"].as_str().unwrap())
                .zip(
                    candidate
                        .transfiguration
                        .form_bands
                        .iter()
                        .map(|entry| entry.form)
                )
                .collect::<Vec<_>>(),
            FORM_MAP
        );
        assert_eq!(
            current.data["transfiguration"]["stat-delta-bands"]
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| {
                    (
                        entry["minimum-delta"].as_integer().unwrap(),
                        entry.get("maximum-delta").and_then(toml::Value::as_integer),
                    )
                })
                .zip(
                    candidate
                        .transfiguration
                        .stat_delta_bands
                        .iter()
                        .map(|entry| entry.magnitude),
                )
                .collect::<Vec<_>>(),
            DELTA_MAP
        );
        assert_eq!(
            current.data["gamble"]["three-gate"]["rewards"]
                .as_table()
                .unwrap()
                .keys()
                .map(String::as_str)
                .zip(
                    candidate
                        .gamble
                        .three_gate
                        .rewards
                        .iter()
                        .map(|entry| entry.gate)
                )
                .collect::<Vec<_>>(),
            GATE_MAP
        );
        assert_eq!(
            current.data["gamble"]["ladder-climb"]["attempts"]
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| entry["attempt"].as_integer().unwrap())
                .zip(
                    candidate
                        .gamble
                        .ladder_climb
                        .attempts
                        .iter()
                        .map(|entry| entry.attempt)
                )
                .collect::<Vec<_>>(),
            ATTEMPT_MAP
        );
        assert_eq!(
            current.data["gamble"]["starway-stairs"]["tiers"]
                .as_array()
                .unwrap()
                .iter()
                .map(|entry| entry["tier"].as_integer().unwrap())
                .zip(
                    candidate
                        .gamble
                        .starway_stairs
                        .tiers
                        .iter()
                        .map(|entry| entry.tier)
                )
                .collect::<Vec<_>>(),
            TIER_MAP
        );
    }
}

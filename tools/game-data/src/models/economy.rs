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
    pub battle_reward: BattleRewardRules,
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
pub struct BattleRewardRules {
    pub base_essence: u32,
    pub essence_per_completion_level: u32,
    pub minimum_essence: u32,
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
        battle_reward: source.battle_reward.into(),
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
    #[serde(rename = "battle-reward")]
    battle_reward: CompatibilityBattleReward,
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
    use pretty_assertions::assert_eq;

    use super::*;

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
            battle_reward: BattleRewardRules {
                base_essence: 31,
                essence_per_completion_level: 9,
                minimum_essence: 3,
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
                "battle-reward",
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
        let obsolete_gamble = serialized.replacen('(', "(gamble:(),", 1);
        assert!(ron::from_str::<EconomyCatalog>(&obsolete_gamble).is_err());

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

    }

    #[test]
    fn rejects_missing_duplicate_and_out_of_order_closed_identities() {
        let mut source = catalog();
        source.shop.stock.swap(0, 1);
        assert_error_contains(source, "shop stock");

    }

    fn assert_error_contains(source: EconomyCatalog, expected: &str) {
        let error = lower(source).unwrap_err().to_string();
        assert!(
            error.contains(expected),
            "{error:?} did not contain {expected:?}"
        );
    }
}

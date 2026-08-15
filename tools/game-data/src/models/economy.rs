use std::collections::HashSet;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct JourneyCatalog {
    pub default_starting_essence: u32,
    pub dreamsign_cap: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShopSiteCatalog {
    pub prices: ShopPrices,
    pub stock: ShopStockCatalog,
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
    pub card_slots: u32,
    pub dreamsign_slots: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ShopStockCatalog {
    pub card_shop: ShopStock,
    pub specialty_shop: ShopStock,
    pub dreamsign_bazaar: ShopStock,
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

pub fn lower_journey(source: JourneyCatalog) -> Result<toml::Value> {
    let compatibility = CompatibilityJourneyCatalog {
        schema_version: 1,
        default_starting_essence: source.default_starting_essence,
        dreamsign_cap: source.dreamsign_cap,
    };
    Ok(toml::Value::try_from(compatibility)?)
}

pub fn lower_shop_site(source: ShopSiteCatalog) -> Result<toml::Value> {
    validate_shop(&source)?;
    let compatibility = CompatibilityShopSiteCatalog {
        schema_version: 1,
        prices: source.prices.into(),
        stock: CompatibilityStockCatalog {
            card_shop: CompatibilityStock::from(&source.stock.card_shop),
            specialty_shop: CompatibilityStock::from(&source.stock.specialty_shop),
            dreamsign_bazaar: CompatibilityStock::from(&source.stock.dreamsign_bazaar),
        },
        discounts: source.discounts.into(),
        reroll: source.reroll.into(),
    };
    Ok(toml::Value::try_from(compatibility)?)
}

fn validate_shop(source: &ShopSiteCatalog) -> Result<()> {
    validate_weighted("discount slot counts", &source.discounts.slot_counts, false)?;
    validate_weighted("discount percentages", &source.discounts.percentages, true)?;
    Ok(())
}

pub(crate) fn validate_site_configuration(
    rewards: &SiteRewardRules,
    purge: &PurgeRules,
) -> Result<()> {
    validate_range("standard Essence reward", rewards.essence.standard)?;
    validate_range("enhanced Essence reward", rewards.essence.enhanced)?;
    validate_range("Reward fallback Essence", rewards.reward_fallback_essence)?;
    ensure!(
        !purge.marginal_costs.is_empty(),
        "purge marginal costs must not be empty"
    );
    validate_percent("enhanced purge discount", purge.enhanced_discount_percent)?;

    Ok(())
}

pub(crate) fn lower_site_rewards(source: &SiteRewardRules) -> Result<toml::Value> {
    Ok(toml::Value::try_from(CompatibilitySiteRewards {
        essence: source.essence.clone(),
        reward: CompatibilityReward {
            fallback_essence: source.reward_fallback_essence,
        },
        dreamsign_revelation: source.dreamsign_revelation.clone().into(),
    })?)
}

pub(crate) fn lower_purge(source: &PurgeRules) -> Result<toml::Value> {
    Ok(toml::Value::try_from(CompatibilityPurge::from(
        source.clone(),
    ))?)
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

#[derive(Serialize)]
struct CompatibilityJourneyCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    #[serde(rename = "default-starting-essence")]
    default_starting_essence: u32,
    #[serde(rename = "dreamsign-cap")]
    dreamsign_cap: u32,
}

#[derive(Serialize)]
struct CompatibilityShopSiteCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
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
    #[serde(rename = "dreamsign-bazaar")]
    dreamsign_bazaar: CompatibilityStock,
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

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    fn shop() -> ShopSiteCatalog {
        ShopSiteCatalog {
            prices: ShopPrices {
                standard_card: 11,
                specialty_card: 22,
                dreamsign: 7,
            },
            stock: ShopStockCatalog {
                card_shop: ShopStock {
                    card_slots: 1,
                    dreamsign_slots: 2,
                },
                specialty_shop: ShopStock {
                    card_slots: 3,
                    dreamsign_slots: 4,
                },
                dreamsign_bazaar: ShopStock {
                    card_slots: 5,
                    dreamsign_slots: 6,
                },
            },
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
        }
    }

    #[test]
    fn lowers_journey_and_shop_catalogs() {
        let journey = lower_journey(JourneyCatalog {
            default_starting_essence: 17,
            dreamsign_cap: 9,
        })
        .unwrap();
        assert_eq!(journey["default-starting-essence"].as_integer(), Some(17));
        assert_eq!(journey["dreamsign-cap"].as_integer(), Some(9));

        let lowered = lower_shop_site(shop()).unwrap();
        assert_eq!(
            lowered["stock"]
                .as_table()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["card-shop", "specialty-shop", "dreamsign-bazaar"]
        );
        assert_eq!(
            lowered["discounts"]["slot-counts"][0]["weight"].as_integer(),
            Some(2)
        );
        assert_eq!(
            lowered["discounts"]["slot-counts"][1]["weight"].as_float(),
            Some(2.5)
        );
    }

    #[test]
    fn strictly_deserializes_each_canonical_shape() {
        let serialized = ron::ser::to_string(&shop()).unwrap();
        assert_eq!(
            ron::from_str::<ShopSiteCatalog>(&serialized).unwrap(),
            shop()
        );

        let unknown = serialized.replacen('(', "(surprise:true,", 1);
        assert!(ron::from_str::<ShopSiteCatalog>(&unknown).is_err());

        let journey = "(default_starting_essence:17,dreamsign_cap:9)";
        assert!(ron::from_str::<JourneyCatalog>(journey).is_ok());
        assert!(
            ron::from_str::<JourneyCatalog>("(default_starting_essence:-1,dreamsign_cap:9)")
                .is_err()
        );
    }

    #[test]
    fn rejects_invalid_shop_distributions_and_percentages() {
        let mut source = shop();
        source.discounts.slot_counts.clear();
        assert_shop_error_contains(source, "must not be empty");

        let mut source = shop();
        source.discounts.slot_counts[1].value = source.discounts.slot_counts[0].value;
        assert_shop_error_contains(source, "repeats value");

        let mut source = shop();
        source.discounts.slot_counts[0].weight = RelativeWeight::Float(f64::NAN);
        assert_shop_error_contains(source, "positive finite");

        let mut source = shop();
        source.discounts.percentages[0].value = 101;
        assert_shop_error_contains(source, "from 0 through 100");
    }

    #[test]
    fn validates_site_owned_ranges_and_purge_configuration() {
        let rewards = SiteRewardRules {
            essence: SiteEssenceRewards {
                standard: IntegerRange { min: 2, max: 1 },
                enhanced: IntegerRange { min: 3, max: 5 },
            },
            reward_fallback_essence: IntegerRange { min: 1, max: 2 },
            dreamsign_revelation: DreamsignRevelationRules {
                standard_offer_count: 2,
                enhanced_offer_count: 3,
            },
        };
        let purge = PurgeRules {
            marginal_costs: vec![1],
            enhanced_discount_percent: 10,
        };
        assert!(
            validate_site_configuration(&rewards, &purge)
                .unwrap_err()
                .to_string()
                .contains("minimum must not exceed maximum")
        );
    }

    fn assert_shop_error_contains(source: ShopSiteCatalog, expected: &str) {
        let error = lower_shop_site(source).unwrap_err().to_string();
        assert!(
            error.contains(expected),
            "{error:?} did not contain {expected:?}"
        );
    }
}

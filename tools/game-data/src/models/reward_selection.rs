use std::collections::BTreeSet;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RewardSelectionCatalog {
    pub rules_version: RulesVersion,
    pub bands: SelectionBands,
    pub eligibility: EligibilityRules,
    pub bundle: BundleRules,
    pub blends: SelectionBlends,
    pub categories: CategoryRules,
    pub centrality: CentralityRules,
    pub dreamsign: DreamsignRules,
    pub cost_bands: CostBandRules,
    pub site: SiteRules,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum RulesVersion {
    V1,
}

impl RulesVersion {
    fn as_compat(self) -> &'static str {
        match self {
            Self::V1 => "1",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SelectionBands {
    pub default: SelectionBand,
    pub strong_card: SelectionBand,
    pub dreamsign: SelectionBand,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SelectionBand {
    pub fraction: f64,
    pub minimum: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EligibilityRules {
    pub min_deck_for_fit: u32,
    pub min_deck_for_purge: u32,
    pub purge_misfit_fraction: f64,
    pub starter_purge_bonus: f64,
    pub subtype_min_pool_cards: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BundleRules {
    pub growth_band_size: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SelectionBlends {
    pub strong_card: FitQualityBlend,
    pub copies_draft: FitQualityBlend,
    pub duplicate: DuplicateBlend,
    pub transfiguration: TransfigurationBlend,
    pub bundle: BundleBlend,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FitQualityBlend {
    pub fit: f64,
    pub quality: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DuplicateBlend {
    pub quality: f64,
    pub fit_leave_one_out: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationBlend {
    pub benefit: f64,
    pub centrality: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BundleBlend {
    pub seed: f64,
    pub bundle: f64,
    pub fit: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CategoryRules {
    pub affine_weight: f64,
    pub deck_affine_minimum: u32,
    pub cluster_affine_minimum: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CentralityRules {
    pub prior_weight: f64,
    pub cooccurrence_weight: f64,
    pub fallback: f64,
    pub spark_threshold: u32,
    pub spark_bonus: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignRules {
    pub full_coverage_count: u32,
    pub featureless_coverage: f64,
    pub quality_weights: Vec<DreamsignQualityWeight>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignQualityWeight {
    pub quality: DreamsignQuality,
    pub weight: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
pub enum DreamsignQuality {
    One,
    Two,
    Three,
}

impl DreamsignQuality {
    const ALL: [Self; 3] = [Self::One, Self::Two, Self::Three];

    fn as_compat(self) -> &'static str {
        match self {
            Self::One => "1",
            Self::Two => "2",
            Self::Three => "3",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CostBandRules {
    pub cheap_maximum: u32,
    pub mid_minimum: u32,
    pub mid_maximum: u32,
    pub big_minimum: u32,
    pub cheap_character_maximum: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SiteRules {
    pub placeable_types: Vec<PlaceableSiteType>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
pub enum PlaceableSiteType {
    Shop,
    Purge,
    Transfiguration,
    Duplication,
}

impl PlaceableSiteType {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Shop => "Shop",
            Self::Purge => "Purge",
            Self::Transfiguration => "Transfiguration",
            Self::Duplication => "Duplication",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityCatalog {
    schema_version: u32,
    rules_version: String,
    bands: CompatibilityBands,
    eligibility: CompatibilityEligibility,
    bundle: CompatibilityBundle,
    blends: CompatibilityBlends,
    categories: CompatibilityCategories,
    centrality: CompatibilityCentrality,
    dreamsign: CompatibilityDreamsign,
    cost_bands: CompatibilityCostBands,
    site: CompatibilitySite,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityBands {
    default: SelectionBand,
    strong_card: SelectionBand,
    dreamsign: SelectionBand,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityEligibility {
    min_deck_for_fit: u32,
    min_deck_for_purge: u32,
    purge_misfit_fraction: f64,
    starter_purge_bonus: f64,
    subtype_min_pool_cards: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityBundle {
    growth_band_size: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityBlends {
    strong_card: FitQualityBlend,
    copies_draft: FitQualityBlend,
    duplicate: CompatibilityDuplicateBlend,
    transfiguration: TransfigurationBlend,
    bundle: BundleBlend,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityDuplicateBlend {
    quality: f64,
    fit_loo: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityCategories {
    affine_weight: f64,
    deck_affine_minimum: u32,
    cluster_affine_minimum: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityCentrality {
    prior_weight: f64,
    cooccurrence_weight: f64,
    fallback: f64,
    spark_threshold: u32,
    spark_bonus: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityDreamsign {
    full_coverage_count: u32,
    featureless_coverage: f64,
    quality_weight: toml::map::Map<String, toml::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityCostBands {
    cheap_maximum: u32,
    mid_minimum: u32,
    mid_maximum: u32,
    big_minimum: u32,
    cheap_character_maximum: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilitySite {
    placeable_types: Vec<String>,
}

pub fn lower(source: RewardSelectionCatalog) -> Result<toml::Value> {
    validate(&source)?;

    let quality_weight = source
        .dreamsign
        .quality_weights
        .iter()
        .map(|entry| {
            (
                entry.quality.as_compat().to_owned(),
                toml::Value::Float(entry.weight),
            )
        })
        .collect();
    Ok(toml::Value::try_from(CompatibilityCatalog {
        schema_version: 1,
        rules_version: source.rules_version.as_compat().to_owned(),
        bands: CompatibilityBands {
            default: source.bands.default,
            strong_card: source.bands.strong_card,
            dreamsign: source.bands.dreamsign,
        },
        eligibility: CompatibilityEligibility {
            min_deck_for_fit: source.eligibility.min_deck_for_fit,
            min_deck_for_purge: source.eligibility.min_deck_for_purge,
            purge_misfit_fraction: source.eligibility.purge_misfit_fraction,
            starter_purge_bonus: source.eligibility.starter_purge_bonus,
            subtype_min_pool_cards: source.eligibility.subtype_min_pool_cards,
        },
        bundle: CompatibilityBundle {
            growth_band_size: source.bundle.growth_band_size,
        },
        blends: CompatibilityBlends {
            strong_card: source.blends.strong_card,
            copies_draft: source.blends.copies_draft,
            duplicate: CompatibilityDuplicateBlend {
                quality: source.blends.duplicate.quality,
                fit_loo: source.blends.duplicate.fit_leave_one_out,
            },
            transfiguration: source.blends.transfiguration,
            bundle: source.blends.bundle,
        },
        categories: CompatibilityCategories {
            affine_weight: source.categories.affine_weight,
            deck_affine_minimum: source.categories.deck_affine_minimum,
            cluster_affine_minimum: source.categories.cluster_affine_minimum,
        },
        centrality: CompatibilityCentrality {
            prior_weight: source.centrality.prior_weight,
            cooccurrence_weight: source.centrality.cooccurrence_weight,
            fallback: source.centrality.fallback,
            spark_threshold: source.centrality.spark_threshold,
            spark_bonus: source.centrality.spark_bonus,
        },
        dreamsign: CompatibilityDreamsign {
            full_coverage_count: source.dreamsign.full_coverage_count,
            featureless_coverage: source.dreamsign.featureless_coverage,
            quality_weight,
        },
        cost_bands: CompatibilityCostBands {
            cheap_maximum: source.cost_bands.cheap_maximum,
            mid_minimum: source.cost_bands.mid_minimum,
            mid_maximum: source.cost_bands.mid_maximum,
            big_minimum: source.cost_bands.big_minimum,
            cheap_character_maximum: source.cost_bands.cheap_character_maximum,
        },
        site: CompatibilitySite {
            placeable_types: source
                .site
                .placeable_types
                .into_iter()
                .map(|site| site.as_compat().to_owned())
                .collect(),
        },
    })?)
}

fn validate(source: &RewardSelectionCatalog) -> Result<()> {
    validate_band("bands.default", source.bands.default)?;
    validate_band("bands.strong_card", source.bands.strong_card)?;
    validate_band("bands.dreamsign", source.bands.dreamsign)?;

    positive(
        "eligibility.min_deck_for_fit",
        source.eligibility.min_deck_for_fit,
    )?;
    positive(
        "eligibility.min_deck_for_purge",
        source.eligibility.min_deck_for_purge,
    )?;
    unit_interval(
        "eligibility.purge_misfit_fraction",
        source.eligibility.purge_misfit_fraction,
    )?;
    nonnegative(
        "eligibility.starter_purge_bonus",
        source.eligibility.starter_purge_bonus,
    )?;
    positive(
        "eligibility.subtype_min_pool_cards",
        source.eligibility.subtype_min_pool_cards,
    )?;
    positive("bundle.growth_band_size", source.bundle.growth_band_size)?;

    blend(
        "blends.strong_card",
        [
            source.blends.strong_card.fit,
            source.blends.strong_card.quality,
        ],
    )?;
    blend(
        "blends.copies_draft",
        [
            source.blends.copies_draft.fit,
            source.blends.copies_draft.quality,
        ],
    )?;
    blend(
        "blends.duplicate",
        [
            source.blends.duplicate.quality,
            source.blends.duplicate.fit_leave_one_out,
        ],
    )?;
    blend(
        "blends.transfiguration",
        [
            source.blends.transfiguration.benefit,
            source.blends.transfiguration.centrality,
        ],
    )?;
    blend(
        "blends.bundle",
        [
            source.blends.bundle.seed,
            source.blends.bundle.bundle,
            source.blends.bundle.fit,
        ],
    )?;

    unit_interval("categories.affine_weight", source.categories.affine_weight)?;
    positive(
        "categories.deck_affine_minimum",
        source.categories.deck_affine_minimum,
    )?;
    positive(
        "categories.cluster_affine_minimum",
        source.categories.cluster_affine_minimum,
    )?;
    blend(
        "centrality weights",
        [
            source.centrality.prior_weight,
            source.centrality.cooccurrence_weight,
        ],
    )?;
    unit_interval("centrality.fallback", source.centrality.fallback)?;
    unit_interval("centrality.spark_bonus", source.centrality.spark_bonus)?;

    positive(
        "dreamsign.full_coverage_count",
        source.dreamsign.full_coverage_count,
    )?;
    unit_interval(
        "dreamsign.featureless_coverage",
        source.dreamsign.featureless_coverage,
    )?;
    validate_complete_set(
        "dreamsign.quality_weights",
        source
            .dreamsign
            .quality_weights
            .iter()
            .map(|entry| entry.quality),
        DreamsignQuality::ALL,
    )?;
    for entry in &source.dreamsign.quality_weights {
        nonnegative("dreamsign quality weight", entry.weight)?;
    }

    if source.cost_bands.cheap_maximum.checked_add(1) != Some(source.cost_bands.mid_minimum)
        || source.cost_bands.mid_minimum > source.cost_bands.mid_maximum
        || source.cost_bands.mid_maximum.checked_add(1) != Some(source.cost_bands.big_minimum)
    {
        bail!("cost bands must be ordered, non-overlapping, and contiguous");
    }

    validate_nonempty_unique(
        "site.placeable_types",
        source.site.placeable_types.iter().copied(),
    )?;
    Ok(())
}

fn validate_band(path: &str, band: SelectionBand) -> Result<()> {
    unit_interval(&format!("{path}.fraction"), band.fraction)?;
    positive(&format!("{path}.minimum"), band.minimum)
}

fn positive(path: &str, value: u32) -> Result<()> {
    if value == 0 {
        bail!("{path} must be positive");
    }
    Ok(())
}

fn unit_interval(path: &str, value: f64) -> Result<()> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        bail!("{path} must be a finite number between 0 and 1");
    }
    Ok(())
}

fn nonnegative(path: &str, value: f64) -> Result<()> {
    if !value.is_finite() || value < 0.0 {
        bail!("{path} must be a finite nonnegative number");
    }
    Ok(())
}

fn blend<const N: usize>(path: &str, weights: [f64; N]) -> Result<()> {
    for weight in weights {
        unit_interval(path, weight)?;
    }
    if (weights.into_iter().sum::<f64>() - 1.0).abs() > 1e-9 {
        bail!("{path} weights must sum to 1");
    }
    Ok(())
}

fn validate_nonempty_unique<T>(path: &str, values: impl IntoIterator<Item = T>) -> Result<()>
where
    T: Copy + Ord + std::fmt::Debug,
{
    let mut seen = BTreeSet::new();
    for value in values {
        if !seen.insert(value) {
            bail!("{path} contains duplicate value {value:?}");
        }
    }
    if seen.is_empty() {
        bail!("{path} must not be empty");
    }
    Ok(())
}

fn validate_complete_set<T, const N: usize>(
    path: &str,
    values: impl IntoIterator<Item = T>,
    expected: [T; N],
) -> Result<()>
where
    T: Copy + Ord + std::fmt::Debug,
{
    let values: Vec<_> = values.into_iter().collect();
    validate_nonempty_unique(path, values.iter().copied())?;
    let actual: BTreeSet<_> = values.into_iter().collect();
    let expected: BTreeSet<_> = expected.into_iter().collect();
    if actual != expected {
        bail!("{path} must define exactly {expected:?}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
RewardSelectionCatalog(
  rules_version: V1,
  bands: SelectionBands(
    default: (fraction: 0.2, minimum: 2),
    strong_card: (fraction: 0.3, minimum: 3),
    dreamsign: (fraction: 0.4, minimum: 4),
  ),
  eligibility: EligibilityRules(
    min_deck_for_fit: 5,
    min_deck_for_purge: 6,
    purge_misfit_fraction: 0.35,
    starter_purge_bonus: 1.25,
    subtype_min_pool_cards: 7,
  ),
  bundle: BundleRules(growth_band_size: 8),
  blends: SelectionBlends(
    strong_card: (fit: 0.2, quality: 0.8),
    copies_draft: (fit: 0.3, quality: 0.7),
    duplicate: (quality: 0.4, fit_leave_one_out: 0.6),
    transfiguration: (benefit: 0.45, centrality: 0.55),
    bundle: (seed: 0.1, bundle: 0.2, fit: 0.7),
  ),
  categories: CategoryRules(
    affine_weight: 0.65,
    deck_affine_minimum: 9,
    cluster_affine_minimum: 10,
  ),
  centrality: CentralityRules(
    prior_weight: 0.75,
    cooccurrence_weight: 0.25,
    fallback: 0.15,
    spark_threshold: 11,
    spark_bonus: 0.05,
  ),
  dreamsign: DreamsignRules(
    full_coverage_count: 12,
    featureless_coverage: 0.45,
    quality_weights: [
      (quality: Three, weight: 0.6),
      (quality: One, weight: 1.4),
      (quality: Two, weight: 1.1),
    ],
  ),
  cost_bands: CostBandRules(
    cheap_maximum: 2,
    mid_minimum: 3,
    mid_maximum: 5,
    big_minimum: 6,
    cheap_character_maximum: 4,
  ),
  site: SiteRules(
    placeable_types: [Duplication, Transfiguration, Purge, Shop],
  ),
)
"##
    }

    fn parse(source: &str) -> RewardSelectionCatalog {
        ron::from_str(source).unwrap()
    }

    #[test]
    fn lowers_every_typed_vocabulary_to_exact_compatibility_keys_and_order() {
        let lowered = lower(parse(synthetic_source())).unwrap();
        assert_eq!(lowered["schema-version"].as_integer(), Some(1));
        assert_eq!(lowered["rules-version"].as_str(), Some("1"));
        assert_eq!(
            lowered["bands"]["default"]["fraction"].as_float(),
            Some(0.2)
        );
        assert_eq!(
            lowered["blends"]["duplicate"]["fit-loo"].as_float(),
            Some(0.6)
        );

        let quality_keys: Vec<_> = lowered["dreamsign"]["quality-weight"]
            .as_table()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(quality_keys, ["3", "1", "2"]);

        let site_types: Vec<_> = lowered["site"]["placeable-types"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap())
            .collect();
        assert_eq!(
            site_types,
            ["Duplication", "Transfiguration", "Purge", "Shop"]
        );
    }

    #[test]
    fn rejects_unknown_fields_and_invalid_closed_collections() {
        let unknown =
            synthetic_source().replace("rules_version: V1,", "rules_version: V1, surprise: true,");
        assert!(ron::from_str::<RewardSelectionCatalog>(&unknown).is_err());

        assert_lower_error(
            &synthetic_source().replace("      (quality: Two, weight: 1.1),\n", ""),
            "dreamsign.quality_weights must define exactly",
        );
        assert_lower_error(
            &synthetic_source().replace(
                "      (quality: Two, weight: 1.1),",
                "      (quality: One, weight: 1.1),",
            ),
            "dreamsign.quality_weights contains duplicate",
        );
        assert_lower_error(
            &synthetic_source().replace(
                "placeable_types: [Duplication, Transfiguration, Purge, Shop]",
                "placeable_types: []",
            ),
            "site.placeable_types must not be empty",
        );
    }

    #[test]
    fn rejects_invalid_numeric_and_cross_field_invariants() {
        for (from, to, expected) in [
            ("fraction: 0.2", "fraction: 1.2", "between 0 and 1"),
            ("minimum: 2", "minimum: 0", "must be positive"),
            (
                "min_deck_for_fit: 5",
                "min_deck_for_fit: 0",
                "must be positive",
            ),
            (
                "purge_misfit_fraction: 0.35",
                "purge_misfit_fraction: -0.1",
                "between 0 and 1",
            ),
            (
                "starter_purge_bonus: 1.25",
                "starter_purge_bonus: -0.1",
                "finite nonnegative",
            ),
            (
                "growth_band_size: 8",
                "growth_band_size: 0",
                "must be positive",
            ),
            (
                "strong_card: (fit: 0.2, quality: 0.8)",
                "strong_card: (fit: 0.2, quality: 0.7)",
                "weights must sum to 1",
            ),
            (
                "affine_weight: 0.65",
                "affine_weight: 1.5",
                "between 0 and 1",
            ),
            (
                "cooccurrence_weight: 0.25",
                "cooccurrence_weight: 0.2",
                "weights must sum to 1",
            ),
            (
                "featureless_coverage: 0.45",
                "featureless_coverage: -0.2",
                "between 0 and 1",
            ),
            (
                "(quality: One, weight: 1.4)",
                "(quality: One, weight: -0.1)",
                "finite nonnegative",
            ),
            (
                "mid_minimum: 3",
                "mid_minimum: 4",
                "cost bands must be ordered",
            ),
        ] {
            assert_lower_error(&synthetic_source().replacen(from, to, 1), expected);
        }
    }

    fn assert_lower_error(source: &str, expected: &str) {
        let error = lower(parse(source)).unwrap_err().to_string();
        assert!(
            error.contains(expected),
            "expected {error:?} to contain {expected:?}"
        );
    }
}

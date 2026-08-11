use std::collections::BTreeSet;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationCatalog {
    pub site: TransfigurationSite,
    pub forms: Vec<TransfigurationFormDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationSite {
    pub standard_choice_limit: TransfigurationChoiceLimit,
    pub enhanced_choice_limit: TransfigurationChoiceLimit,
    pub pricing: TransfigurationPricing,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TransfigurationChoiceLimit {
    Count(u32),
    All,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationPricing {
    pub minimum_cost: u32,
    pub maximum_cost: u32,
    pub step: u32,
    pub stat_delta_bands: Vec<TransfigurationStatDeltaBand>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationStatDeltaBand {
    pub minimum_delta: u32,
    pub maximum_delta: Option<u32>,
    pub band: TransfigurationCostBand,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationCostBand {
    pub base: u32,
    pub jitter: u32,
    pub floor: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationFormDefinition {
    pub id: TransfigurationFormId,
    pub glossary_uuid: String,
    pub name: String,
    pub description: String,
    pub glyph: TransfigurationGlyph,
    pub accent_color: String,
    pub tint_color: String,
    pub pricing: TransfigurationFormPricing,
    pub reward_score: TransfigurationRewardScore,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
pub enum TransfigurationFormId {
    Empowered,
    Amplified,
    Kindled,
    Inspired,
    Enduring,
    Hastened,
    Resonant,
    Attuned,
    Perfected,
}

#[cfg(test)]
impl TransfigurationFormId {
    const ALL: [Self; 9] = [
        Self::Empowered,
        Self::Amplified,
        Self::Kindled,
        Self::Inspired,
        Self::Enduring,
        Self::Hastened,
        Self::Resonant,
        Self::Attuned,
        Self::Perfected,
    ];
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TransfigurationGlyph {
    Empowered,
    Amplified,
    Kindled,
    Inspired,
    Enduring,
    Hastened,
    Resonant,
    Attuned,
    Perfected,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum TransfigurationFormPricing {
    Free,
    StatDelta,
    Band(TransfigurationCostBand),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum TransfigurationRewardScore {
    StatDelta { divisor: f64 },
    Flat { value: f64 },
}

pub fn lower(source: TransfigurationCatalog) -> Result<toml::Value> {
    validate(&source)?;
    Ok(toml::Value::try_from(source)?)
}

#[cfg(test)]
fn fixture_glyph(id: TransfigurationFormId) -> TransfigurationGlyph {
    match id {
        TransfigurationFormId::Empowered => TransfigurationGlyph::Empowered,
        TransfigurationFormId::Amplified => TransfigurationGlyph::Amplified,
        TransfigurationFormId::Kindled => TransfigurationGlyph::Kindled,
        TransfigurationFormId::Inspired => TransfigurationGlyph::Inspired,
        TransfigurationFormId::Enduring => TransfigurationGlyph::Enduring,
        TransfigurationFormId::Hastened => TransfigurationGlyph::Hastened,
        TransfigurationFormId::Resonant => TransfigurationGlyph::Resonant,
        TransfigurationFormId::Attuned => TransfigurationGlyph::Attuned,
        TransfigurationFormId::Perfected => TransfigurationGlyph::Perfected,
    }
}

pub(crate) fn validate(source: &TransfigurationCatalog) -> Result<()> {
    validate_choice_limit(
        "transfiguration.site.standard_choice_limit",
        source.site.standard_choice_limit,
    )?;
    validate_choice_limit(
        "transfiguration.site.enhanced_choice_limit",
        source.site.enhanced_choice_limit,
    )?;
    validate_pricing(&source.site.pricing)?;
    ensure!(
        !source.forms.is_empty(),
        "transfiguration.forms must contain at least one form"
    );
    let form_ids = source
        .forms
        .iter()
        .map(|form| form.id)
        .collect::<BTreeSet<_>>();
    ensure!(
        form_ids.len() == source.forms.len(),
        "transfiguration.forms must not repeat a stable form id"
    );
    let mut glossary_ids = BTreeSet::new();
    for (index, form) in source.forms.iter().enumerate() {
        let path = format!("forms[{index}]");
        validate_uuid(&path, &form.glossary_uuid)?;
        ensure!(
            glossary_ids.insert(&form.glossary_uuid),
            "{path}.glossary_uuid duplicates another form"
        );
        for (field, value) in [("name", &form.name), ("description", &form.description)] {
            ensure!(!value.trim().is_empty(), "{path}.{field} must not be blank");
        }
        validate_color(&path, "accent_color", &form.accent_color)?;
        validate_color(&path, "tint_color", &form.tint_color)?;
        validate_form_contract(&path, form)?;
        match form.reward_score {
            TransfigurationRewardScore::StatDelta { divisor } => ensure!(
                divisor.is_finite() && divisor > 0.0,
                "{path}.reward_score divisor must be positive and finite"
            ),
            TransfigurationRewardScore::Flat { value } => ensure!(
                value.is_finite() && (0.0..=1.0).contains(&value),
                "{path}.reward_score value must be within [0, 1]"
            ),
        }
    }
    Ok(())
}

fn validate_choice_limit(path: &str, limit: TransfigurationChoiceLimit) -> Result<()> {
    if let TransfigurationChoiceLimit::Count(value) = limit {
        ensure!(value > 0, "{path} Count must be positive");
    }
    Ok(())
}

fn validate_pricing(pricing: &TransfigurationPricing) -> Result<()> {
    ensure!(
        pricing.minimum_cost <= pricing.maximum_cost,
        "transfiguration.site.pricing minimum_cost must not exceed maximum_cost"
    );
    ensure!(
        pricing.step > 0,
        "transfiguration.site.pricing.step must be positive"
    );
    ensure!(
        !pricing.stat_delta_bands.is_empty(),
        "transfiguration.site.pricing.stat_delta_bands must not be empty"
    );
    for (index, band) in pricing.stat_delta_bands.iter().enumerate() {
        ensure!(
            band.minimum_delta > 0,
            "transfiguration.site.pricing.stat_delta_bands[{index}].minimum_delta must be positive"
        );
        if let Some(maximum) = band.maximum_delta {
            ensure!(
                maximum >= band.minimum_delta,
                "transfiguration.site.pricing.stat_delta_bands[{index}] has an inverted range"
            );
        }
        validate_band(
            &format!("transfiguration.site.pricing.stat_delta_bands[{index}].band"),
            &band.band,
            pricing,
        )?;
        if let Some(previous) = index.checked_sub(1).map(|i| &pricing.stat_delta_bands[i]) {
            ensure!(
                previous.maximum_delta == Some(band.minimum_delta - 1),
                "transfiguration.site.pricing.stat_delta_bands must be contiguous and non-overlapping"
            );
        }
    }
    ensure!(
        pricing
            .stat_delta_bands
            .last()
            .and_then(|band| band.maximum_delta)
            .is_none(),
        "transfiguration.site.pricing.stat_delta_bands must end with an open range"
    );
    Ok(())
}

fn validate_form_contract(path: &str, form: &TransfigurationFormDefinition) -> Result<()> {
    let valid = matches!(
        (&form.id, &form.pricing, &form.reward_score),
        (
            TransfigurationFormId::Empowered | TransfigurationFormId::Kindled,
            TransfigurationFormPricing::StatDelta,
            TransfigurationRewardScore::StatDelta { .. }
        ) | (
            TransfigurationFormId::Hastened,
            TransfigurationFormPricing::Free,
            TransfigurationRewardScore::Flat { .. }
        ) | (
            _,
            TransfigurationFormPricing::Band(_),
            TransfigurationRewardScore::Flat { .. }
        )
    );
    ensure!(
        valid,
        "{path} has pricing or reward scoring incompatible with its form id"
    );
    if let TransfigurationFormPricing::Band(band) = &form.pricing {
        validate_band(
            &format!("{path}.pricing"),
            band,
            &TransfigurationPricing {
                minimum_cost: 0,
                maximum_cost: u32::MAX,
                step: 10,
                stat_delta_bands: vec![],
            },
        )?;
    }
    Ok(())
}

fn validate_band(
    path: &str,
    band: &TransfigurationCostBand,
    pricing: &TransfigurationPricing,
) -> Result<()> {
    ensure!(band.floor <= band.base, "{path}.floor must not exceed base");
    ensure!(
        band.jitter % pricing.step == 0,
        "{path}.jitter must be divisible by the pricing step"
    );
    ensure!(
        band.base <= pricing.maximum_cost,
        "{path}.base exceeds maximum_cost"
    );
    Ok(())
}

fn validate_uuid(path: &str, value: &str) -> Result<()> {
    let uuid = Uuid::parse_str(value)
        .map_err(|error| anyhow::anyhow!("{path}.glossary_uuid is invalid: {error}"))?;
    ensure!(
        uuid.get_version() == Some(Version::Random)
            && uuid.get_variant() == Variant::RFC4122
            && uuid.hyphenated().to_string() == value,
        "{path}.glossary_uuid must be a lowercase RFC 4122 UUIDv4"
    );
    Ok(())
}

fn validate_color(path: &str, field: &str, color: &str) -> Result<()> {
    let bytes = color.as_bytes();
    ensure!(
        bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit),
        "{path}.{field} must be a #RRGGBB CSS color"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const IDS: [&str; 9] = [
        "a66c513e-500b-4891-8c09-9641ae300ba4",
        "a2c070ca-eacd-4cca-b69d-3d48f0787a16",
        "f40df441-0e44-4122-b4d4-cdc4085a9ffb",
        "f0ff63b4-424b-4ae9-81d5-a4f6546afa3f",
        "eb4cfc5f-237a-47cd-9215-7cce3f15583f",
        "19f6c2c9-dd6b-4d65-9f95-f6a3486772cc",
        "c3fa83af-ee3b-47cd-8112-5e5cc38821de",
        "980d283a-9558-4b66-84a0-fcb91fdf4ceb",
        "22adf539-d2c9-4f33-9416-159d03a220ad",
    ];
    fn band() -> TransfigurationCostBand {
        TransfigurationCostBand {
            base: 10,
            jitter: 0,
            floor: 10,
        }
    }
    fn form(id: TransfigurationFormId, index: usize) -> TransfigurationFormDefinition {
        let (pricing, reward_score) = match id {
            TransfigurationFormId::Empowered | TransfigurationFormId::Kindled => (
                TransfigurationFormPricing::StatDelta,
                TransfigurationRewardScore::StatDelta { divisor: 2.0 },
            ),
            TransfigurationFormId::Hastened => (
                TransfigurationFormPricing::Free,
                TransfigurationRewardScore::Flat { value: 0.5 },
            ),
            TransfigurationFormId::Perfected => (
                TransfigurationFormPricing::Band(TransfigurationCostBand {
                    base: 100,
                    jitter: 0,
                    floor: 100,
                }),
                TransfigurationRewardScore::Flat { value: 0.65 },
            ),
            _ => (
                TransfigurationFormPricing::Band(band()),
                TransfigurationRewardScore::Flat { value: 0.5 },
            ),
        };
        TransfigurationFormDefinition {
            id,
            glossary_uuid: IDS[index].into(),
            name: format!("{id:?}"),
            description: "Effect".into(),
            glyph: fixture_glyph(id),
            accent_color: "#123456".into(),
            tint_color: "#abcdef".into(),
            pricing,
            reward_score,
        }
    }
    fn catalog() -> TransfigurationCatalog {
        TransfigurationCatalog {
            site: TransfigurationSite {
                standard_choice_limit: TransfigurationChoiceLimit::Count(3),
                enhanced_choice_limit: TransfigurationChoiceLimit::All,
                pricing: TransfigurationPricing {
                    minimum_cost: 0,
                    maximum_cost: 100,
                    step: 10,
                    stat_delta_bands: vec![TransfigurationStatDeltaBand {
                        minimum_delta: 1,
                        maximum_delta: None,
                        band: band(),
                    }],
                },
            },
            forms: TransfigurationFormId::ALL
                .into_iter()
                .enumerate()
                .map(|(index, id)| form(id, index))
                .collect(),
        }
    }

    #[test]
    fn lowers_presentation_and_tuning_deterministically() {
        assert_eq!(lower(catalog()).unwrap(), lower(catalog()).unwrap());
    }
    #[test]
    fn rejects_missing_duplicate_invalid_tokens_and_illegal_tuning() {
        let mut subset = catalog();
        subset.forms.remove(7);
        subset.forms.pop();
        assert!(validate(&subset).is_ok());
        let mut empty = catalog();
        empty.forms.clear();
        assert!(
            validate(&empty)
                .unwrap_err()
                .to_string()
                .contains("at least one form")
        );
        let mut duplicate = catalog();
        duplicate.forms[1].glossary_uuid = duplicate.forms[0].glossary_uuid.clone();
        assert!(
            validate(&duplicate)
                .unwrap_err()
                .to_string()
                .contains("glossary_uuid duplicates")
        );
        let mut color = catalog();
        color.forms[0].accent_color = "green".into();
        assert!(
            validate(&color)
                .unwrap_err()
                .to_string()
                .contains("accent_color")
        );
        let mut illegal = catalog();
        illegal.forms[0].pricing = TransfigurationFormPricing::Free;
        assert!(
            validate(&illegal)
                .unwrap_err()
                .to_string()
                .contains("incompatible")
        );
    }

    #[test]
    fn accepts_reassigned_supported_glyphs() {
        let mut source = catalog();
        source.forms[0].glyph = TransfigurationGlyph::Kindled;
        validate(&source).unwrap();
    }

    #[test]
    fn accepts_all_or_positive_count_choice_limits() {
        let mut source = catalog();
        source.site.standard_choice_limit = TransfigurationChoiceLimit::All;
        source.site.enhanced_choice_limit = TransfigurationChoiceLimit::Count(2);
        validate(&source).unwrap();

        source.site.enhanced_choice_limit = TransfigurationChoiceLimit::Count(0);
        assert!(
            validate(&source)
                .unwrap_err()
                .to_string()
                .contains("positive")
        );
    }
}

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
    pub rules_version: String,
    pub standard_choice_limit: ChoiceLimit,
    pub enhanced_choice_limit: ChoiceLimit,
    pub pricing: TransfigurationPricing,
    pub form_order: Vec<TransfigurationFormId>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum ChoiceLimit {
    Count(u32),
    All,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TransfigurationPricing {
    pub minimum_cost: u32,
    pub maximum_cost: u32,
    pub step: u32,
    pub stat_delta_bands: Vec<StatDeltaBand>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StatDeltaBand {
    pub minimum_delta: u32,
    pub maximum_delta: Option<u32>,
    pub band: CostBand,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CostBand {
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
    pub effect_disclosure: String,
    pub selected_card_description: String,
    pub accessibility_description: String,
    pub glyph: TransfigurationGlyph,
    pub accent_color: String,
    pub tint_color: String,
    pub display_order: u32,
    pub merchant_allowed: bool,
    pub eligibility: EligibilityPredicate,
    pub operation: EffectOperation,
    pub pricing: FormPricing,
    pub benefit: BenefitScoring,
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
    TransfigurationEmpowered,
    TransfigurationAmplified,
    TransfigurationKindled,
    TransfigurationInspired,
    TransfigurationEnduring,
    TransfigurationHastened,
    TransfigurationResonant,
    TransfigurationAttuned,
    TransfigurationPerfected,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum EligibilityPredicate {
    PositiveEnergyCost,
    DistinctAuthoredAmplifiedText,
    CardType { card_type: CardType },
    EventWithoutFast,
    NamedTrigger,
    ActivatedEnergyCost,
    AtLeastEligibleForms { count: u32 },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum CardType {
    Character,
    Event,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum EffectOperation {
    HalveEnergyCost {
        rounding: Rounding,
        minimum: u32,
    },
    UseAuthoredAmplifiedText,
    DoubleSpark {
        zero_result: u32,
    },
    AppendRulesClause {
        clause: RulesClause,
    },
    SetFast,
    WidenNamedTrigger,
    ReduceActivatedEnergyCost {
        amount: u32,
        minimum: u32,
    },
    ApplyEligibleForms {
        form_order: Vec<TransfigurationFormId>,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Rounding {
    Down,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum RulesClause {
    DrawCard,
    Reclaim,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum FormPricing {
    Free,
    StatDelta,
    Band(CostBand),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum BenefitScoring {
    Ratio { divisor: f64 },
    Flat { value: f64 },
}

pub fn lower(source: TransfigurationCatalog) -> Result<toml::Value> {
    validate(&source)?;
    Ok(toml::Value::try_from(source)?)
}

pub(crate) fn validate(source: &TransfigurationCatalog) -> Result<()> {
    ensure!(
        !source.site.rules_version.trim().is_empty(),
        "transfiguration.site.rules_version must not be blank"
    );
    ensure!(
        matches!(source.site.standard_choice_limit, ChoiceLimit::Count(value) if value > 0),
        "transfiguration.site.standard_choice_limit must be a positive Count"
    );
    ensure!(
        source.site.enhanced_choice_limit == ChoiceLimit::All,
        "transfiguration.site.enhanced_choice_limit must be All"
    );
    ensure!(
        source.site.form_order == TransfigurationFormId::ALL,
        "transfiguration.site.form_order must contain every stable form exactly once in deterministic order"
    );
    validate_pricing(&source.site.pricing)?;
    let ids = source.forms.iter().map(|form| form.id).collect::<Vec<_>>();
    ensure!(
        ids == TransfigurationFormId::ALL,
        "transfiguration.forms must contain every stable form exactly once in deterministic order"
    );
    let mut glossary_ids = BTreeSet::new();
    for (index, form) in source.forms.iter().enumerate() {
        let path = format!("forms[{index}]");
        validate_uuid(&path, &form.glossary_uuid)?;
        ensure!(
            glossary_ids.insert(&form.glossary_uuid),
            "{path}.glossary_uuid duplicates another form"
        );
        for (field, value) in [
            ("name", &form.name),
            ("effect_disclosure", &form.effect_disclosure),
            ("selected_card_description", &form.selected_card_description),
            ("accessibility_description", &form.accessibility_description),
        ] {
            ensure!(!value.trim().is_empty(), "{path}.{field} must not be blank");
        }
        validate_color(&path, "accent_color", &form.accent_color)?;
        validate_color(&path, "tint_color", &form.tint_color)?;
        ensure!(
            form.display_order == index as u32,
            "{path}.display_order must match deterministic form order"
        );
        validate_form_contract(&path, form)?;
        match form.benefit {
            BenefitScoring::Ratio { divisor } => ensure!(
                divisor.is_finite() && divisor > 0.0,
                "{path}.benefit divisor must be positive and finite"
            ),
            BenefitScoring::Flat { value } => ensure!(
                value.is_finite() && (0.0..=1.0).contains(&value),
                "{path}.benefit value must be within [0, 1]"
            ),
        }
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
        (
            &form.eligibility,
            &form.operation,
            &form.pricing,
            &form.benefit
        ),
        (
            EligibilityPredicate::PositiveEnergyCost,
            EffectOperation::HalveEnergyCost {
                rounding: Rounding::Down,
                ..
            },
            FormPricing::StatDelta,
            BenefitScoring::Ratio { .. }
        ) | (
            EligibilityPredicate::DistinctAuthoredAmplifiedText,
            EffectOperation::UseAuthoredAmplifiedText,
            FormPricing::Band(_),
            BenefitScoring::Flat { .. }
        ) | (
            EligibilityPredicate::CardType {
                card_type: CardType::Character
            },
            EffectOperation::DoubleSpark { .. },
            FormPricing::StatDelta,
            BenefitScoring::Ratio { .. }
        ) | (
            EligibilityPredicate::CardType {
                card_type: CardType::Event
            },
            EffectOperation::AppendRulesClause { .. },
            FormPricing::Band(_),
            BenefitScoring::Flat { .. }
        ) | (
            EligibilityPredicate::EventWithoutFast,
            EffectOperation::SetFast,
            FormPricing::Free,
            BenefitScoring::Flat { .. }
        ) | (
            EligibilityPredicate::NamedTrigger,
            EffectOperation::WidenNamedTrigger,
            FormPricing::Band(_),
            BenefitScoring::Flat { .. }
        ) | (
            EligibilityPredicate::ActivatedEnergyCost,
            EffectOperation::ReduceActivatedEnergyCost { .. },
            FormPricing::Band(_),
            BenefitScoring::Flat { .. }
        ) | (
            EligibilityPredicate::AtLeastEligibleForms { .. },
            EffectOperation::ApplyEligibleForms { .. },
            FormPricing::Band(_),
            BenefitScoring::Flat { .. }
        )
    );
    ensure!(
        valid,
        "{path} has an illegal predicate/operation/pricing/benefit pairing"
    );
    let expected_glyph = match form.id {
        TransfigurationFormId::Empowered => TransfigurationGlyph::TransfigurationEmpowered,
        TransfigurationFormId::Amplified => TransfigurationGlyph::TransfigurationAmplified,
        TransfigurationFormId::Kindled => TransfigurationGlyph::TransfigurationKindled,
        TransfigurationFormId::Inspired => TransfigurationGlyph::TransfigurationInspired,
        TransfigurationFormId::Enduring => TransfigurationGlyph::TransfigurationEnduring,
        TransfigurationFormId::Hastened => TransfigurationGlyph::TransfigurationHastened,
        TransfigurationFormId::Resonant => TransfigurationGlyph::TransfigurationResonant,
        TransfigurationFormId::Attuned => TransfigurationGlyph::TransfigurationAttuned,
        TransfigurationFormId::Perfected => TransfigurationGlyph::TransfigurationPerfected,
    };
    ensure!(
        form.glyph == expected_glyph,
        "{path}.glyph does not match its stable form id"
    );
    if let FormPricing::Band(band) = &form.pricing {
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
    match (&form.id, &form.operation) {
        (
            TransfigurationFormId::Inspired,
            EffectOperation::AppendRulesClause {
                clause: RulesClause::DrawCard,
            },
        )
        | (
            TransfigurationFormId::Enduring,
            EffectOperation::AppendRulesClause {
                clause: RulesClause::Reclaim,
            },
        ) => {}
        (TransfigurationFormId::Perfected, EffectOperation::ApplyEligibleForms { form_order }) => {
            ensure!(
                form_order == &TransfigurationFormId::ALL[..8],
                "{path}.operation.form_order must contain every non-Perfected form exactly once and cannot recurse"
            );
        }
        (_, EffectOperation::ApplyEligibleForms { .. }) => ensure!(
            false,
            "{path}.operation ApplyEligibleForms would create a recursive application cycle"
        ),
        _ => {}
    }
    Ok(())
}

fn validate_band(path: &str, band: &CostBand, pricing: &TransfigurationPricing) -> Result<()> {
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
    fn band() -> CostBand {
        CostBand {
            base: 10,
            jitter: 0,
            floor: 10,
        }
    }
    fn form(id: TransfigurationFormId, index: usize) -> TransfigurationFormDefinition {
        let (eligibility, operation, pricing, benefit) = match id {
            TransfigurationFormId::Empowered => (
                EligibilityPredicate::PositiveEnergyCost,
                EffectOperation::HalveEnergyCost {
                    rounding: Rounding::Down,
                    minimum: 0,
                },
                FormPricing::StatDelta,
                BenefitScoring::Ratio { divisor: 2.0 },
            ),
            TransfigurationFormId::Amplified => (
                EligibilityPredicate::DistinctAuthoredAmplifiedText,
                EffectOperation::UseAuthoredAmplifiedText,
                FormPricing::Band(band()),
                BenefitScoring::Flat { value: 0.4 },
            ),
            TransfigurationFormId::Kindled => (
                EligibilityPredicate::CardType {
                    card_type: CardType::Character,
                },
                EffectOperation::DoubleSpark { zero_result: 1 },
                FormPricing::StatDelta,
                BenefitScoring::Ratio { divisor: 4.0 },
            ),
            TransfigurationFormId::Inspired => (
                EligibilityPredicate::CardType {
                    card_type: CardType::Event,
                },
                EffectOperation::AppendRulesClause {
                    clause: RulesClause::DrawCard,
                },
                FormPricing::Band(band()),
                BenefitScoring::Flat { value: 0.55 },
            ),
            TransfigurationFormId::Enduring => (
                EligibilityPredicate::CardType {
                    card_type: CardType::Event,
                },
                EffectOperation::AppendRulesClause {
                    clause: RulesClause::Reclaim,
                },
                FormPricing::Band(band()),
                BenefitScoring::Flat { value: 0.55 },
            ),
            TransfigurationFormId::Hastened => (
                EligibilityPredicate::EventWithoutFast,
                EffectOperation::SetFast,
                FormPricing::Free,
                BenefitScoring::Flat { value: 0.5 },
            ),
            TransfigurationFormId::Resonant => (
                EligibilityPredicate::NamedTrigger,
                EffectOperation::WidenNamedTrigger,
                FormPricing::Band(band()),
                BenefitScoring::Flat { value: 0.5 },
            ),
            TransfigurationFormId::Attuned => (
                EligibilityPredicate::ActivatedEnergyCost,
                EffectOperation::ReduceActivatedEnergyCost {
                    amount: 1,
                    minimum: 0,
                },
                FormPricing::Band(band()),
                BenefitScoring::Flat { value: 0.5 },
            ),
            TransfigurationFormId::Perfected => (
                EligibilityPredicate::AtLeastEligibleForms { count: 2 },
                EffectOperation::ApplyEligibleForms {
                    form_order: TransfigurationFormId::ALL[..8].to_vec(),
                },
                FormPricing::Band(CostBand {
                    base: 100,
                    jitter: 0,
                    floor: 100,
                }),
                BenefitScoring::Flat { value: 0.65 },
            ),
        };
        let glyph = [
            TransfigurationGlyph::TransfigurationEmpowered,
            TransfigurationGlyph::TransfigurationAmplified,
            TransfigurationGlyph::TransfigurationKindled,
            TransfigurationGlyph::TransfigurationInspired,
            TransfigurationGlyph::TransfigurationEnduring,
            TransfigurationGlyph::TransfigurationHastened,
            TransfigurationGlyph::TransfigurationResonant,
            TransfigurationGlyph::TransfigurationAttuned,
            TransfigurationGlyph::TransfigurationPerfected,
        ][index];
        TransfigurationFormDefinition {
            id,
            glossary_uuid: IDS[index].into(),
            name: format!("{id:?}"),
            effect_disclosure: "Effect".into(),
            selected_card_description: "Selected".into(),
            accessibility_description: "Accessible".into(),
            glyph,
            accent_color: "#123456".into(),
            tint_color: "#abcdef".into(),
            display_order: index as u32,
            merchant_allowed: id != TransfigurationFormId::Perfected,
            eligibility,
            operation,
            pricing,
            benefit,
        }
    }
    fn catalog() -> TransfigurationCatalog {
        TransfigurationCatalog {
            site: TransfigurationSite {
                rules_version: "v1".into(),
                standard_choice_limit: ChoiceLimit::Count(3),
                enhanced_choice_limit: ChoiceLimit::All,
                pricing: TransfigurationPricing {
                    minimum_cost: 0,
                    maximum_cost: 100,
                    step: 10,
                    stat_delta_bands: vec![StatDeltaBand {
                        minimum_delta: 1,
                        maximum_delta: None,
                        band: band(),
                    }],
                },
                form_order: TransfigurationFormId::ALL.to_vec(),
            },
            forms: TransfigurationFormId::ALL
                .into_iter()
                .enumerate()
                .map(|(index, id)| form(id, index))
                .collect(),
        }
    }

    #[test]
    fn lowers_all_predicates_and_operations_deterministically() {
        assert_eq!(lower(catalog()).unwrap(), lower(catalog()).unwrap());
    }
    #[test]
    fn rejects_missing_duplicate_invalid_tokens_illegal_pairs_and_cycles() {
        let mut missing = catalog();
        missing.forms.pop();
        assert!(
            validate(&missing)
                .unwrap_err()
                .to_string()
                .contains("every stable form")
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
        illegal.forms[0].operation = EffectOperation::SetFast;
        assert!(
            validate(&illegal)
                .unwrap_err()
                .to_string()
                .contains("illegal predicate")
        );
        let mut cycle = catalog();
        cycle.forms[8].operation = EffectOperation::ApplyEligibleForms {
            form_order: TransfigurationFormId::ALL.to_vec(),
        };
        assert!(
            validate(&cycle)
                .unwrap_err()
                .to_string()
                .contains("cannot recurse")
        );
    }
}

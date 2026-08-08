use std::collections::BTreeSet;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AuguryCatalog {
    pub encounter: EncounterRules,
    pub dialogue: Dialogue,
    pub archetypes: Vec<ArchetypeDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncounterRules {
    pub offer_count: u32,
    pub distinct_families: bool,
    pub allow_decline: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Dialogue {
    pub fallback_line: String,
    pub accept_reactions: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ArchetypeDefinition {
    pub behavior: ArchetypeBehavior,
    pub enabled: bool,
    pub weight: u32,
    pub dialogue_lines: Vec<String>,
    pub copy: CopyTemplates,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum ArchetypeBehavior {
    FitCardGrant {
        selection_policy: CardSelectionPolicy,
        granted_copies: u32,
    },
    FitCardDraft {
        selection_policy: CardSelectionPolicy,
        chooser_size: u32,
        granted_copies: u32,
    },
    CopiesDraft {
        selection_policy: CardSelectionPolicy,
        chooser_size: u32,
        granted_copies: u32,
    },
    StrongCard {
        selection_policy: CardSelectionPolicy,
        granted_copies: u32,
    },
    CategoryDraftKnown {
        selection_policy: CardSelectionPolicy,
        chooser_size: u32,
        granted_copies: u32,
    },
    CardBundle {
        bundle_size: u32,
        minimum_bundle_size: u32,
    },
    TransfiguredDraft {
        selection_policy: CardSelectionPolicy,
        chooser_size: u32,
        granted_copies: u32,
    },
    Transfigure {
        selection_policy: TransfigurationSelectionPolicy,
    },
    StarterTransfigure {
        selection_policy: TransfigurationSelectionPolicy,
        maximum_targets: u32,
    },
    KeywordMod {
        selection_policy: CentralitySelectionPolicy,
    },
    TribalChange {
        selection_policy: CentralitySelectionPolicy,
    },
    Purge {
        selection_policy: PurgeSelectionPolicy,
    },
    PurgeReplace {
        selection_policy: ReplacementSelectionPolicy,
        chooser_size: u32,
    },
    Duplicate {
        selection_policy: DuplicateSelectionPolicy,
        chooser_size: u32,
        granted_copies: u32,
    },
    Dreamsign {
        selection_policy: DreamsignSelectionPolicy,
    },
    DreamsignDraft {
        selection_policy: DreamsignSelectionPolicy,
        minimum_chooser_size: u32,
        maximum_chooser_size: u32,
    },
    AddSite,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum CardSelectionPolicy {
    Uniform,
    CardFit,
    CardFitQuality,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TransfigurationSelectionPolicy {
    Uniform,
    TransfigurationValue,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum CentralitySelectionPolicy {
    Uniform,
    DeckEntryCentrality,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum PurgeSelectionPolicy {
    Uniform,
    PurgeMisfit,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum ReplacementSelectionPolicy {
    Uniform,
    CardFitQuality,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum DuplicateSelectionPolicy {
    Uniform,
    DuplicateValue,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum DreamsignSelectionPolicy {
    Uniform,
    DreamsignMatch,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CopyTemplates {
    pub title: String,
    pub summary: String,
    pub prompt: String,
    pub candidate_title: String,
    pub candidate_summary: String,
    pub detail_headline: String,
    pub detail_subtitle: String,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
enum ArchetypeKind {
    FitCardGrant,
    FitCardDraft,
    CopiesDraft,
    StrongCard,
    CategoryDraftKnown,
    CardBundle,
    TransfiguredDraft,
    Transfigure,
    StarterTransfigure,
    KeywordMod,
    TribalChange,
    Purge,
    PurgeReplace,
    Duplicate,
    Dreamsign,
    DreamsignDraft,
    AddSite,
}

impl ArchetypeKind {
    const ALL: [Self; 17] = [
        Self::FitCardGrant,
        Self::FitCardDraft,
        Self::CopiesDraft,
        Self::StrongCard,
        Self::CategoryDraftKnown,
        Self::CardBundle,
        Self::TransfiguredDraft,
        Self::Transfigure,
        Self::StarterTransfigure,
        Self::KeywordMod,
        Self::TribalChange,
        Self::Purge,
        Self::PurgeReplace,
        Self::Duplicate,
        Self::Dreamsign,
        Self::DreamsignDraft,
        Self::AddSite,
    ];

    fn as_compat(self) -> &'static str {
        match self {
            Self::FitCardGrant => "fit_card_grant",
            Self::FitCardDraft => "fit_card_draft",
            Self::CopiesDraft => "copies_draft",
            Self::StrongCard => "strong_card",
            Self::CategoryDraftKnown => "category_draft_known",
            Self::CardBundle => "card_bundle",
            Self::TransfiguredDraft => "transfigured_draft",
            Self::Transfigure => "transfigure",
            Self::StarterTransfigure => "starter_transfigure",
            Self::KeywordMod => "keyword_mod",
            Self::TribalChange => "tribal_change",
            Self::Purge => "purge",
            Self::PurgeReplace => "purge_replace",
            Self::Duplicate => "duplicate",
            Self::Dreamsign => "dreamsign",
            Self::DreamsignDraft => "dreamsign_draft",
            Self::AddSite => "add_site",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
enum OfferFamily {
    Grant,
    Improve,
    Remove,
    Duplicate,
    Dreamsign,
    Site,
}

impl OfferFamily {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Grant => "grant",
            Self::Improve => "improve",
            Self::Remove => "remove",
            Self::Duplicate => "duplicate",
            Self::Dreamsign => "dreamsign",
            Self::Site => "site",
        }
    }
}

impl CardSelectionPolicy {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Uniform => "uniform",
            Self::CardFit => "card-fit",
            Self::CardFitQuality => "card-fit-quality",
        }
    }
}

macro_rules! policy_compat {
    ($name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        impl $name {
            fn as_compat(self) -> &'static str {
                match self {
                    $(Self::$variant => $value,)+
                }
            }
        }
    };
}

policy_compat!(TransfigurationSelectionPolicy {
    Uniform => "uniform",
    TransfigurationValue => "transfiguration-value",
});
policy_compat!(CentralitySelectionPolicy {
    Uniform => "uniform",
    DeckEntryCentrality => "deck-entry-centrality",
});
policy_compat!(PurgeSelectionPolicy {
    Uniform => "uniform",
    PurgeMisfit => "purge-misfit",
});
policy_compat!(ReplacementSelectionPolicy {
    Uniform => "uniform",
    CardFitQuality => "card-fit-quality",
});
policy_compat!(DuplicateSelectionPolicy {
    Uniform => "uniform",
    DuplicateValue => "duplicate-value",
});
policy_compat!(DreamsignSelectionPolicy {
    Uniform => "uniform",
    DreamsignMatch => "dreamsign-match",
});

impl ArchetypeBehavior {
    fn kind(&self) -> ArchetypeKind {
        match self {
            Self::FitCardGrant { .. } => ArchetypeKind::FitCardGrant,
            Self::FitCardDraft { .. } => ArchetypeKind::FitCardDraft,
            Self::CopiesDraft { .. } => ArchetypeKind::CopiesDraft,
            Self::StrongCard { .. } => ArchetypeKind::StrongCard,
            Self::CategoryDraftKnown { .. } => ArchetypeKind::CategoryDraftKnown,
            Self::CardBundle { .. } => ArchetypeKind::CardBundle,
            Self::TransfiguredDraft { .. } => ArchetypeKind::TransfiguredDraft,
            Self::Transfigure { .. } => ArchetypeKind::Transfigure,
            Self::StarterTransfigure { .. } => ArchetypeKind::StarterTransfigure,
            Self::KeywordMod { .. } => ArchetypeKind::KeywordMod,
            Self::TribalChange { .. } => ArchetypeKind::TribalChange,
            Self::Purge { .. } => ArchetypeKind::Purge,
            Self::PurgeReplace { .. } => ArchetypeKind::PurgeReplace,
            Self::Duplicate { .. } => ArchetypeKind::Duplicate,
            Self::Dreamsign { .. } => ArchetypeKind::Dreamsign,
            Self::DreamsignDraft { .. } => ArchetypeKind::DreamsignDraft,
            Self::AddSite => ArchetypeKind::AddSite,
        }
    }

    fn family(&self) -> OfferFamily {
        match self.kind() {
            ArchetypeKind::FitCardGrant
            | ArchetypeKind::FitCardDraft
            | ArchetypeKind::CopiesDraft
            | ArchetypeKind::StrongCard
            | ArchetypeKind::CategoryDraftKnown
            | ArchetypeKind::CardBundle
            | ArchetypeKind::TransfiguredDraft => OfferFamily::Grant,
            ArchetypeKind::Transfigure
            | ArchetypeKind::StarterTransfigure
            | ArchetypeKind::KeywordMod
            | ArchetypeKind::TribalChange => OfferFamily::Improve,
            ArchetypeKind::Purge | ArchetypeKind::PurgeReplace => OfferFamily::Remove,
            ArchetypeKind::Duplicate => OfferFamily::Duplicate,
            ArchetypeKind::Dreamsign | ArchetypeKind::DreamsignDraft => OfferFamily::Dreamsign,
            ArchetypeKind::AddSite => OfferFamily::Site,
        }
    }

    fn selection_policy_compat(&self) -> &'static str {
        match self {
            Self::FitCardGrant {
                selection_policy, ..
            }
            | Self::FitCardDraft {
                selection_policy, ..
            }
            | Self::CopiesDraft {
                selection_policy, ..
            }
            | Self::StrongCard {
                selection_policy, ..
            }
            | Self::CategoryDraftKnown {
                selection_policy, ..
            }
            | Self::TransfiguredDraft {
                selection_policy, ..
            } => selection_policy.as_compat(),
            Self::CardBundle { .. } => "card-bundle",
            Self::Transfigure { selection_policy }
            | Self::StarterTransfigure {
                selection_policy, ..
            } => selection_policy.as_compat(),
            Self::KeywordMod { selection_policy } | Self::TribalChange { selection_policy } => {
                selection_policy.as_compat()
            }
            Self::Purge { selection_policy } => selection_policy.as_compat(),
            Self::PurgeReplace {
                selection_policy, ..
            } => selection_policy.as_compat(),
            Self::Duplicate {
                selection_policy, ..
            } => selection_policy.as_compat(),
            Self::Dreamsign { selection_policy }
            | Self::DreamsignDraft {
                selection_policy, ..
            } => selection_policy.as_compat(),
            Self::AddSite => "site-uniform",
        }
    }

    fn quantities(&self) -> toml::map::Map<String, toml::Value> {
        let mut output = toml::map::Map::new();
        let mut insert = |key: &str, value: u32| {
            output.insert(key.into(), i64::from(value).into());
        };
        match self {
            Self::FitCardGrant { granted_copies, .. } | Self::StrongCard { granted_copies, .. } => {
                insert("granted-copies", *granted_copies);
            }
            Self::FitCardDraft {
                chooser_size,
                granted_copies,
                ..
            }
            | Self::CopiesDraft {
                chooser_size,
                granted_copies,
                ..
            }
            | Self::CategoryDraftKnown {
                chooser_size,
                granted_copies,
                ..
            }
            | Self::TransfiguredDraft {
                chooser_size,
                granted_copies,
                ..
            }
            | Self::Duplicate {
                chooser_size,
                granted_copies,
                ..
            } => {
                insert("chooser-size", *chooser_size);
                insert("granted-copies", *granted_copies);
            }
            Self::CardBundle {
                bundle_size,
                minimum_bundle_size,
            } => {
                insert("bundle-size", *bundle_size);
                insert("minimum-bundle-size", *minimum_bundle_size);
            }
            Self::StarterTransfigure {
                maximum_targets, ..
            } => insert("maximum-targets", *maximum_targets),
            Self::PurgeReplace { chooser_size, .. } => insert("chooser-size", *chooser_size),
            Self::DreamsignDraft {
                minimum_chooser_size,
                maximum_chooser_size,
                ..
            } => {
                insert("minimum-chooser-size", *minimum_chooser_size);
                insert("maximum-chooser-size", *maximum_chooser_size);
            }
            Self::Transfigure { .. }
            | Self::KeywordMod { .. }
            | Self::TribalChange { .. }
            | Self::Purge { .. }
            | Self::Dreamsign { .. }
            | Self::AddSite => {}
        }
        output
    }
}

pub fn lower(source: AuguryCatalog) -> Result<toml::Value> {
    validate(&source)?;

    let mut root = toml::map::Map::new();
    root.insert("schema-version".into(), 1_i64.into());
    let encounter = source.encounter;
    root.insert(
        "encounter".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            (
                "offer-count".into(),
                i64::from(encounter.offer_count).into(),
            ),
            (
                "distinct-families".into(),
                encounter.distinct_families.into(),
            ),
            ("allow-decline".into(), encounter.allow_decline.into()),
        ])),
    );
    root.insert(
        "dialogue".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            ("fallback-line".into(), source.dialogue.fallback_line.into()),
            (
                "accept-reactions".into(),
                toml::Value::Array(
                    source
                        .dialogue
                        .accept_reactions
                        .into_iter()
                        .map(Into::into)
                        .collect(),
                ),
            ),
        ])),
    );
    root.insert(
        "archetype".into(),
        toml::Value::Array(source.archetypes.into_iter().map(lower_archetype).collect()),
    );
    Ok(toml::Value::Table(root))
}

fn lower_archetype(source: ArchetypeDefinition) -> toml::Value {
    let kind = source.behavior.kind();
    let mut output = toml::map::Map::new();
    output.insert("id".into(), kind.as_compat().into());
    output.insert("enabled".into(), source.enabled.into());
    output.insert("family".into(), source.behavior.family().as_compat().into());
    output.insert("weight".into(), i64::from(source.weight).into());
    output.insert(
        "selection-policy-id".into(),
        source.behavior.selection_policy_compat().into(),
    );
    output.insert(
        "dialogue-lines".into(),
        toml::Value::Array(source.dialogue_lines.into_iter().map(Into::into).collect()),
    );
    output.insert(
        "quantities".into(),
        toml::Value::Table(source.behavior.quantities()),
    );
    output.insert(
        "copy".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            ("title".into(), source.copy.title.into()),
            ("summary".into(), source.copy.summary.into()),
            ("prompt".into(), source.copy.prompt.into()),
            ("candidate-title".into(), source.copy.candidate_title.into()),
            (
                "candidate-summary".into(),
                source.copy.candidate_summary.into(),
            ),
            ("detail-headline".into(), source.copy.detail_headline.into()),
            ("detail-subtitle".into(), source.copy.detail_subtitle.into()),
        ])),
    );
    toml::Value::Table(output)
}

fn validate(source: &AuguryCatalog) -> Result<()> {
    if source.encounter.offer_count != 2 {
        bail!("encounter.offer_count must be 2");
    }
    if !source.encounter.distinct_families {
        bail!("encounter.distinct_families must be true");
    }
    require_nonempty("dialogue.fallback_line", &source.dialogue.fallback_line)?;
    require_nonempty_list(
        "dialogue.accept_reactions",
        &source.dialogue.accept_reactions,
    )?;

    let mut kinds = BTreeSet::new();
    let mut enabled_families = BTreeSet::new();
    let mut enabled_count = 0;
    for (index, archetype) in source.archetypes.iter().enumerate() {
        let path = format!("archetypes[{index}]");
        let kind = archetype.behavior.kind();
        if !kinds.insert(kind) {
            bail!("{path}.behavior duplicates {}", kind.as_compat());
        }
        if archetype.weight == 0 {
            bail!("{path}.weight must be positive");
        }
        require_nonempty_list(&format!("{path}.dialogue_lines"), &archetype.dialogue_lines)?;
        validate_behavior(&path, &archetype.behavior)?;
        validate_copy(&path, &archetype.copy)?;
        if archetype.enabled {
            enabled_count += 1;
            enabled_families.insert(archetype.behavior.family());
        }
    }
    for kind in ArchetypeKind::ALL {
        if !kinds.contains(&kind) {
            bail!("archetypes is missing {}", kind.as_compat());
        }
    }
    if enabled_count < 2 {
        bail!("at least two archetypes must be enabled");
    }
    if enabled_families.len() < 2 {
        bail!("enabled archetypes must span at least two families");
    }
    Ok(())
}

fn validate_behavior(path: &str, behavior: &ArchetypeBehavior) -> Result<()> {
    let bounded = |name: &str, value: u32, minimum: u32, maximum: u32| -> Result<()> {
        if !(minimum..=maximum).contains(&value) {
            bail!("{path}.behavior.{name} must be in [{minimum}, {maximum}]");
        }
        Ok(())
    };
    match behavior {
        ArchetypeBehavior::FitCardGrant { granted_copies, .. }
        | ArchetypeBehavior::StrongCard { granted_copies, .. } => {
            bounded("granted_copies", *granted_copies, 1, 4)?;
        }
        ArchetypeBehavior::FitCardDraft {
            chooser_size,
            granted_copies,
            ..
        }
        | ArchetypeBehavior::CopiesDraft {
            chooser_size,
            granted_copies,
            ..
        }
        | ArchetypeBehavior::CategoryDraftKnown {
            chooser_size,
            granted_copies,
            ..
        }
        | ArchetypeBehavior::TransfiguredDraft {
            chooser_size,
            granted_copies,
            ..
        } => {
            bounded("chooser_size", *chooser_size, 2, 4)?;
            bounded("granted_copies", *granted_copies, 1, 4)?;
        }
        ArchetypeBehavior::CardBundle {
            bundle_size,
            minimum_bundle_size,
        } => {
            bounded("bundle_size", *bundle_size, 2, 3)?;
            bounded("minimum_bundle_size", *minimum_bundle_size, 2, 3)?;
            if minimum_bundle_size > bundle_size {
                bail!("{path}.behavior.minimum_bundle_size must not exceed bundle_size");
            }
        }
        ArchetypeBehavior::StarterTransfigure {
            maximum_targets, ..
        } => bounded("maximum_targets", *maximum_targets, 1, 2)?,
        ArchetypeBehavior::PurgeReplace { chooser_size, .. } => {
            bounded("chooser_size", *chooser_size, 2, 4)?;
        }
        ArchetypeBehavior::Duplicate {
            chooser_size,
            granted_copies,
            ..
        } => {
            bounded("chooser_size", *chooser_size, 1, 3)?;
            bounded("granted_copies", *granted_copies, 1, 4)?;
        }
        ArchetypeBehavior::DreamsignDraft {
            minimum_chooser_size,
            maximum_chooser_size,
            ..
        } => {
            bounded("minimum_chooser_size", *minimum_chooser_size, 2, 4)?;
            bounded("maximum_chooser_size", *maximum_chooser_size, 2, 4)?;
            if minimum_chooser_size > maximum_chooser_size {
                bail!("{path}.behavior.minimum_chooser_size must not exceed maximum_chooser_size");
            }
        }
        ArchetypeBehavior::Transfigure { .. }
        | ArchetypeBehavior::KeywordMod { .. }
        | ArchetypeBehavior::TribalChange { .. }
        | ArchetypeBehavior::Purge { .. }
        | ArchetypeBehavior::Dreamsign { .. }
        | ArchetypeBehavior::AddSite => {}
    }
    Ok(())
}

fn validate_copy(path: &str, copy: &CopyTemplates) -> Result<()> {
    for (field, value) in [
        ("title", copy.title.as_str()),
        ("summary", copy.summary.as_str()),
        ("prompt", copy.prompt.as_str()),
        ("candidate_title", copy.candidate_title.as_str()),
        ("candidate_summary", copy.candidate_summary.as_str()),
        ("detail_headline", copy.detail_headline.as_str()),
        ("detail_subtitle", copy.detail_subtitle.as_str()),
    ] {
        validate_template(&format!("{path}.copy.{field}"), value)?;
    }
    Ok(())
}

fn validate_template(path: &str, value: &str) -> Result<()> {
    const SLOTS: [&str; 11] = [
        "card",
        "cards",
        "count",
        "count-word",
        "category",
        "site",
        "subtype",
        "transfiguration",
        "copies",
        "copies-word",
        "copies-label",
    ];
    let mut remainder = value;
    while let Some(open) = remainder.find('{') {
        let after_open = &remainder[open + 1..];
        let Some(close) = after_open.find('}') else {
            break;
        };
        let slot = &after_open[..close];
        if !SLOTS.contains(&slot) {
            bail!("{path} contains unknown copy slot {{{slot}}}");
        }
        remainder = &after_open[close + 1..];
    }
    Ok(())
}

fn require_nonempty(path: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        bail!("{path} must be a non-empty string");
    }
    Ok(())
}

fn require_nonempty_list(path: &str, values: &[String]) -> Result<()> {
    if values.is_empty() {
        bail!("{path} must contain at least one string");
    }
    for (index, value) in values.iter().enumerate() {
        require_nonempty(&format!("{path}[{index}]"), value)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use pretty_assertions::assert_eq;

    use super::*;
    use crate::models::compat::CompatDocument;

    fn copy() -> CopyTemplates {
        CopyTemplates {
            title: "Límbø {card}".into(),
            summary: "First line\nSecond line {copies-word}".into(),
            prompt: String::new(),
            candidate_title: "{card}".into(),
            candidate_summary: "{count-word} choices".into(),
            detail_headline: "Detail".into(),
            detail_subtitle: "Visit {site}".into(),
        }
    }

    fn definition(behavior: ArchetypeBehavior) -> ArchetypeDefinition {
        ArchetypeDefinition {
            behavior,
            enabled: true,
            weight: 3,
            dialogue_lines: vec!["A line".into()],
            copy: copy(),
        }
    }

    fn catalog() -> AuguryCatalog {
        use ArchetypeBehavior::*;
        AuguryCatalog {
            encounter: EncounterRules {
                offer_count: 2,
                distinct_families: true,
                allow_decline: false,
            },
            dialogue: Dialogue {
                fallback_line: "Fallback".into(),
                accept_reactions: vec!["Accepted".into()],
            },
            archetypes: vec![
                definition(FitCardGrant {
                    selection_policy: CardSelectionPolicy::Uniform,
                    granted_copies: 1,
                }),
                definition(FitCardDraft {
                    selection_policy: CardSelectionPolicy::CardFit,
                    chooser_size: 2,
                    granted_copies: 2,
                }),
                definition(CopiesDraft {
                    selection_policy: CardSelectionPolicy::CardFitQuality,
                    chooser_size: 3,
                    granted_copies: 3,
                }),
                definition(StrongCard {
                    selection_policy: CardSelectionPolicy::Uniform,
                    granted_copies: 4,
                }),
                definition(CategoryDraftKnown {
                    selection_policy: CardSelectionPolicy::CardFit,
                    chooser_size: 4,
                    granted_copies: 1,
                }),
                definition(CardBundle {
                    bundle_size: 3,
                    minimum_bundle_size: 2,
                }),
                definition(TransfiguredDraft {
                    selection_policy: CardSelectionPolicy::CardFitQuality,
                    chooser_size: 2,
                    granted_copies: 1,
                }),
                definition(Transfigure {
                    selection_policy: TransfigurationSelectionPolicy::Uniform,
                }),
                definition(StarterTransfigure {
                    selection_policy: TransfigurationSelectionPolicy::TransfigurationValue,
                    maximum_targets: 2,
                }),
                definition(KeywordMod {
                    selection_policy: CentralitySelectionPolicy::Uniform,
                }),
                definition(TribalChange {
                    selection_policy: CentralitySelectionPolicy::DeckEntryCentrality,
                }),
                definition(Purge {
                    selection_policy: PurgeSelectionPolicy::PurgeMisfit,
                }),
                definition(PurgeReplace {
                    selection_policy: ReplacementSelectionPolicy::Uniform,
                    chooser_size: 4,
                }),
                definition(Duplicate {
                    selection_policy: DuplicateSelectionPolicy::DuplicateValue,
                    chooser_size: 1,
                    granted_copies: 1,
                }),
                definition(Dreamsign {
                    selection_policy: DreamsignSelectionPolicy::Uniform,
                }),
                definition(DreamsignDraft {
                    selection_policy: DreamsignSelectionPolicy::DreamsignMatch,
                    minimum_chooser_size: 2,
                    maximum_chooser_size: 4,
                }),
                definition(AddSite),
            ],
        }
    }

    #[test]
    fn lowers_every_behavior_policy_quantity_shape_and_encounter_rule() {
        let output = lower(catalog()).unwrap();
        assert_eq!(output["schema-version"].as_integer(), Some(1));
        assert_eq!(output["encounter"]["offer-count"].as_integer(), Some(2));
        assert_eq!(
            output["encounter"]["distinct-families"].as_bool(),
            Some(true)
        );
        assert_eq!(output["encounter"]["allow-decline"].as_bool(), Some(false));
        let archetypes = output["archetype"].as_array().unwrap();
        assert_eq!(archetypes.len(), 17);
        assert_eq!(archetypes[0]["id"].as_str(), Some("fit_card_grant"));
        assert_eq!(
            archetypes[0]["selection-policy-id"].as_str(),
            Some("uniform")
        );
        assert_eq!(
            archetypes[5]["quantities"]["minimum-bundle-size"].as_integer(),
            Some(2)
        );
        assert!(archetypes[7]["quantities"].as_table().unwrap().is_empty());
        assert_eq!(archetypes[16]["family"].as_str(), Some("site"));
        assert_eq!(
            archetypes[0]["copy"]["title"].as_str(),
            Some("Límbø {card}")
        );
        assert_eq!(
            archetypes[0]["copy"]["summary"].as_str(),
            Some("First line\nSecond line {copies-word}")
        );
    }

    #[test]
    fn rejects_unknown_fields_and_unknown_enum_variants() {
        let source = r#"AuguryCatalog(
          encounter: (offer_count: 2, distinct_families: true, allow_decline: true, surprise: true),
          dialogue: (fallback_line: "x", accept_reactions: ["y"]),
          archetypes: [],
        )"#;
        assert!(ron::from_str::<AuguryCatalog>(source).is_err());
        assert!(ron::from_str::<CardSelectionPolicy>("Unknown").is_err());
        assert!(
            ron::from_str::<ArchetypeBehavior>(
                "FitCardGrant(selection_policy: CardFit, granted_copies: 1, surprise: true)",
            )
            .is_err()
        );
    }

    #[test]
    fn exhaustively_maps_every_selection_policy_variant() {
        assert_eq!(
            [
                CardSelectionPolicy::Uniform.as_compat(),
                CardSelectionPolicy::CardFit.as_compat(),
                CardSelectionPolicy::CardFitQuality.as_compat(),
            ],
            ["uniform", "card-fit", "card-fit-quality"]
        );
        assert_eq!(
            [
                TransfigurationSelectionPolicy::Uniform.as_compat(),
                TransfigurationSelectionPolicy::TransfigurationValue.as_compat(),
                CentralitySelectionPolicy::Uniform.as_compat(),
                CentralitySelectionPolicy::DeckEntryCentrality.as_compat(),
                PurgeSelectionPolicy::Uniform.as_compat(),
                PurgeSelectionPolicy::PurgeMisfit.as_compat(),
                ReplacementSelectionPolicy::Uniform.as_compat(),
                ReplacementSelectionPolicy::CardFitQuality.as_compat(),
                DuplicateSelectionPolicy::Uniform.as_compat(),
                DuplicateSelectionPolicy::DuplicateValue.as_compat(),
                DreamsignSelectionPolicy::Uniform.as_compat(),
                DreamsignSelectionPolicy::DreamsignMatch.as_compat(),
            ],
            [
                "uniform",
                "transfiguration-value",
                "uniform",
                "deck-entry-centrality",
                "uniform",
                "purge-misfit",
                "uniform",
                "card-fit-quality",
                "uniform",
                "duplicate-value",
                "uniform",
                "dreamsign-match",
            ]
        );
    }

    #[test]
    fn rejects_missing_duplicate_and_invalid_archetypes() {
        let mut missing = catalog();
        missing.archetypes.pop();
        assert!(lower(missing).unwrap_err().to_string().contains("add_site"));

        let mut duplicate = catalog();
        duplicate.archetypes[1].behavior = duplicate.archetypes[0].behavior.clone();
        assert!(
            lower(duplicate)
                .unwrap_err()
                .to_string()
                .contains("duplicates")
        );

        let mut bad_range = catalog();
        bad_range.archetypes[5].behavior = ArchetypeBehavior::CardBundle {
            bundle_size: 2,
            minimum_bundle_size: 3,
        };
        assert!(
            lower(bad_range)
                .unwrap_err()
                .to_string()
                .contains("must not exceed")
        );

        let mut zero_weight = catalog();
        zero_weight.archetypes[0].weight = 0;
        assert!(
            lower(zero_weight)
                .unwrap_err()
                .to_string()
                .contains("weight must be positive")
        );

        let mut out_of_range = catalog();
        out_of_range.archetypes[0].behavior = ArchetypeBehavior::FitCardGrant {
            selection_policy: CardSelectionPolicy::CardFit,
            granted_copies: 5,
        };
        assert!(
            lower(out_of_range)
                .unwrap_err()
                .to_string()
                .contains("granted_copies must be in [1, 4]")
        );
    }

    #[test]
    fn rejects_unsupported_encounter_rules() {
        let mut offer_count = catalog();
        offer_count.encounter.offer_count = 3;
        assert!(
            lower(offer_count)
                .unwrap_err()
                .to_string()
                .contains("offer_count must be 2")
        );

        let mut repeated_families = catalog();
        repeated_families.encounter.distinct_families = false;
        assert!(
            lower(repeated_families)
                .unwrap_err()
                .to_string()
                .contains("distinct_families must be true")
        );
    }

    #[test]
    fn rejects_invalid_dialogue_templates_and_enabled_family_coverage() {
        let mut empty_dialogue = catalog();
        empty_dialogue.archetypes[0].dialogue_lines.clear();
        assert!(
            lower(empty_dialogue)
                .unwrap_err()
                .to_string()
                .contains("at least one")
        );

        let mut bad_template = catalog();
        bad_template.archetypes[0].copy.title = "Unknown {mystery}".into();
        assert!(
            lower(bad_template)
                .unwrap_err()
                .to_string()
                .contains("unknown copy slot")
        );

        let mut one_family = catalog();
        for archetype in &mut one_family.archetypes {
            archetype.enabled = archetype.behavior.family() == OfferFamily::Grant;
        }
        assert!(
            lower(one_family)
                .unwrap_err()
                .to_string()
                .contains("at least two families")
        );
    }

    #[test]
    #[ignore = "real-catalog parity probe retained for canonical Augury review"]
    fn canonical_candidate_matches_current_compatibility_sources() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let current_ron: CompatDocument =
            ron::from_str(&fs::read_to_string(root.join("data/augury.ron")).unwrap()).unwrap();
        let current_toml: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/augury.toml")).unwrap()).unwrap();
        assert_eq!(current_ron.data, current_toml);

        let canonical: AuguryCatalog =
            ron::from_str(&fs::read_to_string(root.join("data/augury_canonical.ron")).unwrap())
                .unwrap();
        assert_eq!(canonical.archetypes.len(), 17);

        const LEGACY_BEHAVIORS: [(&str, ArchetypeKind); 17] = [
            ("fit_card_grant", ArchetypeKind::FitCardGrant),
            ("fit_card_draft", ArchetypeKind::FitCardDraft),
            ("copies_draft", ArchetypeKind::CopiesDraft),
            ("strong_card", ArchetypeKind::StrongCard),
            ("category_draft_known", ArchetypeKind::CategoryDraftKnown),
            ("card_bundle", ArchetypeKind::CardBundle),
            ("transfigured_draft", ArchetypeKind::TransfiguredDraft),
            ("transfigure", ArchetypeKind::Transfigure),
            ("starter_transfigure", ArchetypeKind::StarterTransfigure),
            ("keyword_mod", ArchetypeKind::KeywordMod),
            ("tribal_change", ArchetypeKind::TribalChange),
            ("purge", ArchetypeKind::Purge),
            ("purge_replace", ArchetypeKind::PurgeReplace),
            ("duplicate", ArchetypeKind::Duplicate),
            ("dreamsign", ArchetypeKind::Dreamsign),
            ("dreamsign_draft", ArchetypeKind::DreamsignDraft),
            ("add_site", ArchetypeKind::AddSite),
        ];
        let legacy = current_ron.data["archetype"].as_array().unwrap();
        for ((entry, definition), (legacy_id, kind)) in legacy
            .iter()
            .zip(&canonical.archetypes)
            .zip(LEGACY_BEHAVIORS)
        {
            assert_eq!(entry["id"].as_str(), Some(legacy_id));
            assert_eq!(definition.behavior.kind(), kind);
            assert_eq!(kind.as_compat(), legacy_id);
            assert_eq!(
                entry["selection-policy-id"].as_str(),
                Some(definition.behavior.selection_policy_compat())
            );
        }
        assert_eq!(lower(canonical).unwrap(), current_ron.data);
    }
}

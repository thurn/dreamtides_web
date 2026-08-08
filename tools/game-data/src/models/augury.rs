use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AuguryCatalog {
    pub encounter: EncounterRules,
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
pub struct ArchetypeDefinition {
    pub id: AuguryId,
    pub ability: ArchetypeAbility,
    pub weight: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum ArchetypeAbility {
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

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct AuguryId(Uuid);

impl AuguryId {
    pub fn as_hyphenated(self) -> String {
        self.0.hyphenated().to_string()
    }

    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Augury identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("Augury identifier must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for AuguryId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for AuguryId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for AuguryId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
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

    fn canonical_id(self) -> &'static str {
        match self {
            Self::FitCardGrant => "77ad1a09-aba0-4875-b462-e6efe94bdc3d",
            Self::FitCardDraft => "8f8db592-b62c-414e-9195-68641722cf50",
            Self::CopiesDraft => "b4ccca83-2a1d-4474-ba6d-4b95aefeed9b",
            Self::StrongCard => "c4ac3d68-e814-43ea-9be3-ced3fd1bbe89",
            Self::CategoryDraftKnown => "beecc1d9-9546-4ca2-858c-214527c7e530",
            Self::CardBundle => "dfd3976a-b1dc-44fe-9aab-c13bd2c195e4",
            Self::TransfiguredDraft => "a5ac636d-9269-4379-9c61-567583fe9926",
            Self::Transfigure => "ec872e81-b7b4-4d81-9c69-1ca5317f6144",
            Self::StarterTransfigure => "65a59007-6618-4f82-82ae-7da3bc6a205a",
            Self::KeywordMod => "bd973dd3-e993-42b6-95bb-d24ac1062442",
            Self::TribalChange => "a177d574-d4bd-4c49-aaa4-52d5db74c6cb",
            Self::Purge => "df34c427-5e27-42d1-b903-c1d6d6dddd78",
            Self::PurgeReplace => "5bff7fe7-e69c-4f8a-84ae-edd37a68e60b",
            Self::Duplicate => "521bd487-0b3e-429e-a2f6-56010dd029c4",
            Self::Dreamsign => "432102c0-91c0-4954-acd0-3404d2148a25",
            Self::DreamsignDraft => "71ec2bb5-b0d7-481f-9233-6b3e4052bade",
            Self::AddSite => "1003a54d-1659-490b-aa48-b88b9da5df68",
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

impl ArchetypeAbility {
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
        "archetype".into(),
        toml::Value::Array(source.archetypes.into_iter().map(lower_archetype).collect()),
    );
    Ok(toml::Value::Table(root))
}

fn lower_archetype(source: ArchetypeDefinition) -> toml::Value {
    let kind = source.ability.kind();
    let mut output = toml::map::Map::new();
    output.insert("id".into(), kind.as_compat().into());
    output.insert("enabled".into(), true.into());
    output.insert("family".into(), source.ability.family().as_compat().into());
    output.insert("weight".into(), i64::from(source.weight).into());
    output.insert(
        "selection-policy-id".into(),
        source.ability.selection_policy_compat().into(),
    );
    output.insert(
        "quantities".into(),
        toml::Value::Table(source.ability.quantities()),
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
    let mut kinds = BTreeSet::new();
    let mut ids = BTreeSet::new();
    let mut families = BTreeSet::new();
    for (index, archetype) in source.archetypes.iter().enumerate() {
        let path = format!("archetypes[{index}]");
        let kind = archetype.ability.kind();
        if !ids.insert(archetype.id) {
            bail!("{path}.id duplicates {}", archetype.id);
        }
        if !kinds.insert(kind) {
            bail!("{path}.ability duplicates {}", kind.as_compat());
        }
        if archetype.id.as_hyphenated() != kind.canonical_id() {
            bail!(
                "{path}.id must be {} for ability {}",
                kind.canonical_id(),
                kind.as_compat()
            );
        }
        if archetype.weight == 0 {
            bail!("{path}.weight must be positive");
        }
        validate_ability(&path, &archetype.ability)?;
        families.insert(archetype.ability.family());
    }
    if source.archetypes.len() < 2 {
        bail!("at least two archetypes must be present");
    }
    if families.len() < 2 {
        bail!("archetypes must span at least two families");
    }
    Ok(())
}

fn validate_ability(path: &str, ability: &ArchetypeAbility) -> Result<()> {
    let bounded = |name: &str, value: u32, minimum: u32, maximum: u32| -> Result<()> {
        if !(minimum..=maximum).contains(&value) {
            bail!("{path}.ability.{name} must be in [{minimum}, {maximum}]");
        }
        Ok(())
    };
    match ability {
        ArchetypeAbility::FitCardGrant { granted_copies, .. }
        | ArchetypeAbility::StrongCard { granted_copies, .. } => {
            bounded("granted_copies", *granted_copies, 1, 4)?;
        }
        ArchetypeAbility::FitCardDraft {
            chooser_size,
            granted_copies,
            ..
        }
        | ArchetypeAbility::CopiesDraft {
            chooser_size,
            granted_copies,
            ..
        }
        | ArchetypeAbility::CategoryDraftKnown {
            chooser_size,
            granted_copies,
            ..
        }
        | ArchetypeAbility::TransfiguredDraft {
            chooser_size,
            granted_copies,
            ..
        } => {
            bounded("chooser_size", *chooser_size, 2, 4)?;
            bounded("granted_copies", *granted_copies, 1, 4)?;
        }
        ArchetypeAbility::CardBundle {
            bundle_size,
            minimum_bundle_size,
        } => {
            bounded("bundle_size", *bundle_size, 2, 3)?;
            bounded("minimum_bundle_size", *minimum_bundle_size, 2, 3)?;
            if minimum_bundle_size > bundle_size {
                bail!("{path}.ability.minimum_bundle_size must not exceed bundle_size");
            }
        }
        ArchetypeAbility::StarterTransfigure {
            maximum_targets, ..
        } => bounded("maximum_targets", *maximum_targets, 1, 2)?,
        ArchetypeAbility::PurgeReplace { chooser_size, .. } => {
            bounded("chooser_size", *chooser_size, 2, 4)?;
        }
        ArchetypeAbility::Duplicate {
            chooser_size,
            granted_copies,
            ..
        } => {
            bounded("chooser_size", *chooser_size, 1, 3)?;
            bounded("granted_copies", *granted_copies, 1, 4)?;
        }
        ArchetypeAbility::DreamsignDraft {
            minimum_chooser_size,
            maximum_chooser_size,
            ..
        } => {
            bounded("minimum_chooser_size", *minimum_chooser_size, 2, 4)?;
            bounded("maximum_chooser_size", *maximum_chooser_size, 2, 4)?;
            if minimum_chooser_size > maximum_chooser_size {
                bail!("{path}.ability.minimum_chooser_size must not exceed maximum_chooser_size");
            }
        }
        ArchetypeAbility::Transfigure { .. }
        | ArchetypeAbility::KeywordMod { .. }
        | ArchetypeAbility::TribalChange { .. }
        | ArchetypeAbility::Purge { .. }
        | ArchetypeAbility::Dreamsign { .. }
        | ArchetypeAbility::AddSite => {}
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

    fn definition(ability: ArchetypeAbility) -> ArchetypeDefinition {
        let id = AuguryId::parse(ability.kind().canonical_id()).unwrap();
        ArchetypeDefinition {
            id,
            ability,
            weight: 3,
        }
    }

    fn catalog() -> AuguryCatalog {
        use ArchetypeAbility::*;
        AuguryCatalog {
            encounter: EncounterRules {
                offer_count: 2,
                distinct_families: true,
                allow_decline: false,
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
    fn lowers_every_ability_policy_quantity_shape_and_encounter_rule() {
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
    }

    #[test]
    fn rejects_unknown_fields_and_unknown_enum_variants() {
        let source = r#"AuguryCatalog(
          encounter: (offer_count: 2, distinct_families: true, allow_decline: true, surprise: true),
          archetypes: [],
        )"#;
        assert!(ron::from_str::<AuguryCatalog>(source).is_err());
        assert!(ron::from_str::<CardSelectionPolicy>("Unknown").is_err());
        assert!(
            ron::from_str::<ArchetypeAbility>(
                "FitCardGrant(selection_policy: CardFit, granted_copies: 1, surprise: true)",
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_non_uuidv4_duplicate_and_ability_mismatched_ids() {
        for invalid in [
            "fit_card_grant",
            "77AD1A09-ABA0-4875-B462-E6EFE94BDC3D",
            "77ad1a09-aba0-3875-b462-e6efe94bdc3d",
            "77ad1a09aba04875b462e6efe94bdc3d",
        ] {
            assert!(ron::from_str::<AuguryId>(&format!("\"{invalid}\"")).is_err());
        }

        let mut duplicate = catalog();
        duplicate.archetypes[1].id = duplicate.archetypes[0].id;
        assert!(
            lower(duplicate)
                .unwrap_err()
                .to_string()
                .contains("id duplicates")
        );

        let mut mismatched = catalog();
        mismatched.archetypes[0].id =
            AuguryId::parse(ArchetypeKind::FitCardDraft.canonical_id()).unwrap();
        assert!(
            lower(mismatched)
                .unwrap_err()
                .to_string()
                .contains("for ability fit_card_grant")
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
    fn permits_omitted_archetypes_and_rejects_duplicate_and_invalid_archetypes() {
        let mut omitted = catalog();
        omitted.archetypes.pop();
        let lowered = lower(omitted).unwrap();
        assert_eq!(lowered["archetype"].as_array().unwrap().len(), 16);
        assert!(
            lowered["archetype"]
                .as_array()
                .unwrap()
                .iter()
                .all(|entry| entry["enabled"].as_bool() == Some(true))
        );

        let mut duplicate = catalog();
        duplicate.archetypes[1].ability = duplicate.archetypes[0].ability.clone();
        assert!(
            lower(duplicate)
                .unwrap_err()
                .to_string()
                .contains("duplicates")
        );

        let mut bad_range = catalog();
        bad_range.archetypes[5].ability = ArchetypeAbility::CardBundle {
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
        out_of_range.archetypes[0].ability = ArchetypeAbility::FitCardGrant {
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
    fn rejects_insufficient_family_coverage() {
        let mut one_family = catalog();
        one_family
            .archetypes
            .retain(|archetype| archetype.ability.family() == OfferFamily::Grant);
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
        assert_eq!(canonical.archetypes.len(), 13);

        const LEGACY_ABILITIES: [(&str, &str, ArchetypeKind); 13] = [
            (
                "fit_card_grant",
                "77ad1a09-aba0-4875-b462-e6efe94bdc3d",
                ArchetypeKind::FitCardGrant,
            ),
            (
                "fit_card_draft",
                "8f8db592-b62c-414e-9195-68641722cf50",
                ArchetypeKind::FitCardDraft,
            ),
            (
                "copies_draft",
                "b4ccca83-2a1d-4474-ba6d-4b95aefeed9b",
                ArchetypeKind::CopiesDraft,
            ),
            (
                "strong_card",
                "c4ac3d68-e814-43ea-9be3-ced3fd1bbe89",
                ArchetypeKind::StrongCard,
            ),
            (
                "category_draft_known",
                "beecc1d9-9546-4ca2-858c-214527c7e530",
                ArchetypeKind::CategoryDraftKnown,
            ),
            (
                "card_bundle",
                "dfd3976a-b1dc-44fe-9aab-c13bd2c195e4",
                ArchetypeKind::CardBundle,
            ),
            (
                "transfigured_draft",
                "a5ac636d-9269-4379-9c61-567583fe9926",
                ArchetypeKind::TransfiguredDraft,
            ),
            (
                "transfigure",
                "ec872e81-b7b4-4d81-9c69-1ca5317f6144",
                ArchetypeKind::Transfigure,
            ),
            (
                "starter_transfigure",
                "65a59007-6618-4f82-82ae-7da3bc6a205a",
                ArchetypeKind::StarterTransfigure,
            ),
            (
                "purge",
                "df34c427-5e27-42d1-b903-c1d6d6dddd78",
                ArchetypeKind::Purge,
            ),
            (
                "duplicate",
                "521bd487-0b3e-429e-a2f6-56010dd029c4",
                ArchetypeKind::Duplicate,
            ),
            (
                "dreamsign",
                "432102c0-91c0-4954-acd0-3404d2148a25",
                ArchetypeKind::Dreamsign,
            ),
            (
                "add_site",
                "1003a54d-1659-490b-aa48-b88b9da5df68",
                ArchetypeKind::AddSite,
            ),
        ];
        let mut enabled_compatibility = current_ron.data.clone();
        enabled_compatibility["archetype"]
            .as_array_mut()
            .unwrap()
            .retain(|entry| entry["enabled"].as_bool() == Some(true));
        let legacy = enabled_compatibility["archetype"].as_array().unwrap();
        for ((entry, definition), (legacy_id, canonical_id, kind)) in legacy
            .iter()
            .zip(&canonical.archetypes)
            .zip(LEGACY_ABILITIES)
        {
            assert_eq!(entry["id"].as_str(), Some(legacy_id));
            assert_eq!(definition.ability.kind(), kind);
            assert_eq!(kind.as_compat(), legacy_id);
            assert_eq!(definition.id.as_hyphenated(), canonical_id);
            let parsed = Uuid::parse_str(canonical_id).unwrap();
            assert_eq!(parsed.get_version(), Some(Version::Random));
            assert_eq!(parsed.get_variant(), Variant::RFC4122);
            assert_eq!(parsed.hyphenated().to_string(), canonical_id);
            assert_eq!(
                entry["selection-policy-id"].as_str(),
                Some(definition.ability.selection_policy_compat())
            );
        }
        assert_eq!(lower(canonical).unwrap(), enabled_compatibility);
    }
}

use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

const PRESENTATION_SLOTS: [&str; 8] = [
    "cardName",
    "categoryName",
    "count",
    "dreamsignName",
    "firstCardName",
    "secondCardName",
    "siteName",
    "subtypeName",
];

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
    pub name: String,
    pub presentation: ArchetypePresentation,
    pub ability: ArchetypeAbility,
    pub weight: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ArchetypePresentation {
    pub headline: PresentationText,
    pub subtitle: PresentationText,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum PresentationText {
    Text(String),
    Count {
        one: String,
        other: String,
    },
    Category {
        character: String,
        event: String,
        cheap: String,
        mid_cost: String,
        expensive: String,
        fast: String,
        subtype: String,
        package: String,
    },
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
    Purge {
        selection_policy: PurgeSelectionPolicy,
    },
    Duplicate {
        selection_policy: DuplicateSelectionPolicy,
        chooser_size: u32,
        granted_copies: u32,
    },
    Dreamsign {
        selection_policy: DreamsignSelectionPolicy,
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
pub enum PurgeSelectionPolicy {
    Uniform,
    PurgeMisfit,
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
    Purge,
    Duplicate,
    Dreamsign,
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
            Self::Purge => "purge",
            Self::Duplicate => "duplicate",
            Self::Dreamsign => "dreamsign",
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
            Self::Purge => "df34c427-5e27-42d1-b903-c1d6d6dddd78",
            Self::Duplicate => "521bd487-0b3e-429e-a2f6-56010dd029c4",
            Self::Dreamsign => "432102c0-91c0-4954-acd0-3404d2148a25",
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
policy_compat!(PurgeSelectionPolicy {
    Uniform => "uniform",
    PurgeMisfit => "purge-misfit",
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
            Self::Purge { .. } => ArchetypeKind::Purge,
            Self::Duplicate { .. } => ArchetypeKind::Duplicate,
            Self::Dreamsign { .. } => ArchetypeKind::Dreamsign,
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
            ArchetypeKind::Transfigure | ArchetypeKind::StarterTransfigure => OfferFamily::Improve,
            ArchetypeKind::Purge => OfferFamily::Remove,
            ArchetypeKind::Duplicate => OfferFamily::Duplicate,
            ArchetypeKind::Dreamsign => OfferFamily::Dreamsign,
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
            Self::Purge { selection_policy } => selection_policy.as_compat(),
            Self::Duplicate {
                selection_policy, ..
            } => selection_policy.as_compat(),
            Self::Dreamsign { selection_policy } => selection_policy.as_compat(),
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
            Self::Transfigure { .. }
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
    output.insert("name".into(), source.name.into());
    output.insert(
        "presentation".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            (
                "headline".into(),
                lower_presentation_text(source.presentation.headline),
            ),
            (
                "subtitle".into(),
                lower_presentation_text(source.presentation.subtitle),
            ),
        ])),
    );
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

fn lower_presentation_text(source: PresentationText) -> toml::Value {
    let mut output = toml::map::Map::new();
    match source {
        PresentationText::Text(text) => {
            output.insert("kind".into(), "text".into());
            output.insert("text".into(), text.into());
        }
        PresentationText::Count { one, other } => {
            output.insert("kind".into(), "count".into());
            output.insert("one".into(), one.into());
            output.insert("other".into(), other.into());
        }
        PresentationText::Category {
            character,
            event,
            cheap,
            mid_cost,
            expensive,
            fast,
            subtype,
            package,
        } => {
            output.insert("kind".into(), "category".into());
            output.insert("character".into(), character.into());
            output.insert("event".into(), event.into());
            output.insert("cheap".into(), cheap.into());
            output.insert("mid-cost".into(), mid_cost.into());
            output.insert("expensive".into(), expensive.into());
            output.insert("fast".into(), fast.into());
            output.insert("subtype".into(), subtype.into());
            output.insert("package".into(), package.into());
        }
    }
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
        if archetype.name.trim().is_empty() {
            bail!("{path}.name must be non-empty");
        }
        validate_presentation(&path, &archetype.presentation)?;
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

fn validate_presentation(path: &str, presentation: &ArchetypePresentation) -> Result<()> {
    validate_presentation_text(
        &format!("{path}.presentation.headline"),
        &presentation.headline,
    )?;
    validate_presentation_text(
        &format!("{path}.presentation.subtitle"),
        &presentation.subtitle,
    )
}

fn validate_presentation_text(path: &str, text: &PresentationText) -> Result<()> {
    let values: Vec<&str> = match text {
        PresentationText::Text(value) => vec![value],
        PresentationText::Count { one, other } => vec![one, other],
        PresentationText::Category {
            character,
            event,
            cheap,
            mid_cost,
            expensive,
            fast,
            subtype,
            package,
        } => vec![
            character, event, cheap, mid_cost, expensive, fast, subtype, package,
        ],
    };
    for value in values {
        if value.trim().is_empty() {
            bail!("{path} strings must be non-empty");
        }
        validate_template_slots(path, value)?;
    }
    Ok(())
}

fn validate_template_slots(path: &str, value: &str) -> Result<()> {
    let mut remaining = value;
    while let Some(start) = remaining.find('{') {
        let after_open = &remaining[start + 1..];
        let Some(end) = after_open.find('}') else {
            bail!("{path} has an unterminated presentation slot");
        };
        let slot = &after_open[..end];
        if !PRESENTATION_SLOTS.contains(&slot) {
            bail!("{path} uses unknown presentation slot {{{slot}}}");
        }
        remaining = &after_open[end + 1..];
    }
    if remaining.contains('}') {
        bail!("{path} has an unmatched closing brace");
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
        ArchetypeAbility::Duplicate {
            chooser_size,
            granted_copies,
            ..
        } => {
            bounded("chooser_size", *chooser_size, 1, 3)?;
            bounded("granted_copies", *granted_copies, 1, 4)?;
        }
        ArchetypeAbility::Transfigure { .. }
        | ArchetypeAbility::Purge { .. }
        | ArchetypeAbility::Dreamsign { .. }
        | ArchetypeAbility::AddSite => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    fn definition(ability: ArchetypeAbility) -> ArchetypeDefinition {
        let id = AuguryId::parse(ability.kind().canonical_id()).unwrap();
        ArchetypeDefinition {
            id,
            name: format!("Synthetic {}", ability.kind().as_compat()),
            presentation: ArchetypePresentation {
                headline: PresentationText::Text("Synthetic headline".into()),
                subtitle: PresentationText::Text("Synthetic subtitle".into()),
            },
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
                definition(Purge {
                    selection_policy: PurgeSelectionPolicy::PurgeMisfit,
                }),
                definition(Duplicate {
                    selection_policy: DuplicateSelectionPolicy::DuplicateValue,
                    chooser_size: 1,
                    granted_copies: 1,
                }),
                definition(Dreamsign {
                    selection_policy: DreamsignSelectionPolicy::Uniform,
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
        assert_eq!(archetypes.len(), 13);
        assert_eq!(archetypes[0]["id"].as_str(), Some("fit_card_grant"));
        assert!(
            archetypes[0]["name"]
                .as_str()
                .unwrap()
                .starts_with("Synthetic ")
        );
        assert_eq!(
            archetypes[0]["presentation"]["headline"]["kind"].as_str(),
            Some("text")
        );
        assert_eq!(
            archetypes[0]["selection-policy-id"].as_str(),
            Some("uniform")
        );
        assert_eq!(
            archetypes[5]["quantities"]["minimum-bundle-size"].as_integer(),
            Some(2)
        );
        assert!(archetypes[7]["quantities"].as_table().unwrap().is_empty());
        assert_eq!(archetypes[12]["family"].as_str(), Some("site"));
    }

    #[test]
    fn lowers_every_presentation_variant() {
        let count = lower_presentation_text(PresentationText::Count {
            one: "One {count}".into(),
            other: "Other {count}".into(),
        });
        assert_eq!(count["kind"].as_str(), Some("count"));
        assert_eq!(count["one"].as_str(), Some("One {count}"));

        let category = lower_presentation_text(PresentationText::Category {
            character: "Character".into(),
            event: "Event".into(),
            cheap: "Cheap".into(),
            mid_cost: "Mid-cost".into(),
            expensive: "Expensive".into(),
            fast: "Fast".into(),
            subtype: "Subtype {categoryName}".into(),
            package: "Package {categoryName}".into(),
        });
        assert_eq!(category["kind"].as_str(), Some("category"));
        assert_eq!(category["mid-cost"].as_str(), Some("Mid-cost"));
        assert_eq!(category["package"].as_str(), Some("Package {categoryName}"));
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
                PurgeSelectionPolicy::Uniform.as_compat(),
                PurgeSelectionPolicy::PurgeMisfit.as_compat(),
                DuplicateSelectionPolicy::Uniform.as_compat(),
                DuplicateSelectionPolicy::DuplicateValue.as_compat(),
                DreamsignSelectionPolicy::Uniform.as_compat(),
                DreamsignSelectionPolicy::DreamsignMatch.as_compat(),
            ],
            [
                "uniform",
                "transfiguration-value",
                "uniform",
                "purge-misfit",
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
        assert_eq!(lowered["archetype"].as_array().unwrap().len(), 12);
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

        let mut empty_name = catalog();
        empty_name.archetypes[0].name = "  ".into();
        assert!(
            lower(empty_name)
                .unwrap_err()
                .to_string()
                .contains("name must be non-empty")
        );

        let mut empty_subtitle = catalog();
        empty_subtitle.archetypes[0].presentation.subtitle = PresentationText::Text(String::new());
        assert!(
            lower(empty_subtitle)
                .unwrap_err()
                .to_string()
                .contains("presentation.subtitle strings must be non-empty")
        );

        let mut unknown_slot = catalog();
        unknown_slot.archetypes[0].presentation.subtitle =
            PresentationText::Text("Unknown {mystery}".into());
        assert!(
            lower(unknown_slot)
                .unwrap_err()
                .to_string()
                .contains("unknown presentation slot {mystery}")
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
}

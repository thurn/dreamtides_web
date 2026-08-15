use std::collections::BTreeSet;
use std::fmt;
use trox::LocalizedString;

use anyhow::{Context, Result, ensure};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::{source_text, source_transport_value};

use super::atlas::SiteType;
use super::economy::{self, PurgeRules, SiteRewardRules};
#[cfg(test)]
use super::economy::{DreamsignRevelationRules, IntegerRange, SiteEssenceRewards};

const SITE_TYPES: [SiteType; 14] = [
    SiteType::Battle,
    SiteType::Draft,
    SiteType::Shop,
    SiteType::Purge,
    SiteType::Essence,
    SiteType::Transfiguration,
    SiteType::Duplication,
    SiteType::Reward,
    SiteType::Augury,
    SiteType::DreamsignBazaar,
    SiteType::DreamsignRevelation,
    SiteType::RandomSite,
    SiteType::Gamble,
    SiteType::Exploration,
];

const GLOSSARY_ID_MAP: [(&str, &str); 14] = [
    (
        "85ffab8d-f972-4340-9b45-99f6aff6ccec",
        "85ffab8d-f972-4340-9b45-99f6aff6ccec",
    ),
    (
        "1ee13681-1ff5-431c-94a1-3390d45e1717",
        "1ee13681-1ff5-431c-94a1-3390d45e1717",
    ),
    (
        "25f28ed1-5729-4240-a352-80f92fce530c",
        "25f28ed1-5729-4240-a352-80f92fce530c",
    ),
    (
        "4873bddf-7bf5-41e8-979e-36eb193db5a6",
        "4873bddf-7bf5-41e8-979e-36eb193db5a6",
    ),
    (
        "ba8ea132-f636-4fed-be27-e8eff0c9cb07",
        "ba8ea132-f636-4fed-be27-e8eff0c9cb07",
    ),
    (
        "7ae25c1a-76c5-4aed-9e1c-a2d5ec160bd7",
        "7ae25c1a-76c5-4aed-9e1c-a2d5ec160bd7",
    ),
    (
        "8222c5e2-a3ce-4caf-bd13-5c77ff15d7cf",
        "8222c5e2-a3ce-4caf-bd13-5c77ff15d7cf",
    ),
    (
        "28925242-3799-4faa-b4bd-b8aac52ca442",
        "28925242-3799-4faa-b4bd-b8aac52ca442",
    ),
    (
        "ffd3977a-a463-4326-bdf2-5b1b8c3d9160",
        "ffd3977a-a463-4326-bdf2-5b1b8c3d9160",
    ),
    (
        "5b5b47d6-c858-4b42-af96-a520c84666eb",
        "5b5b47d6-c858-4b42-af96-a520c84666eb",
    ),
    (
        "ac70fd6b-a91a-407f-b7b7-255668cd6bec",
        "ac70fd6b-a91a-407f-b7b7-255668cd6bec",
    ),
    (
        "1aeb05bc-53e1-4ea4-9e73-9239160799dc",
        "1aeb05bc-53e1-4ea4-9e73-9239160799dc",
    ),
    (
        "f1ff2fb5-3d77-4eb8-b492-78cbe11fd265",
        "f1ff2fb5-3d77-4eb8-b492-78cbe11fd265",
    ),
    (
        "46059d35-cb9e-4c4b-8635-087b6239f308",
        "46059d35-cb9e-4c4b-8635-087b6239f308",
    ),
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SitesCatalog {
    pub encounter_sites: EncounterSiteRules,
    pub rewards: SiteRewardRules,
    pub purge: PurgeRules,
    pub site_types: Vec<SiteMetadata>,
    pub random_site: RandomSiteRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncounterSiteRules {
    pub min_deck_for_purge: u32,
    pub placeable_sites: Vec<SiteType>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SiteMetadata {
    pub site: SiteType,
    pub icon: String,
    pub glossary_id: GlossaryId,
    pub presentation: Option<SitePresentation>,
    pub rules: Option<SiteRules>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum SitePresentation {
    Battle {
        label: LocalizedString,
        final_boss_label: LocalizedString,
    },
    Draft {
        label: LocalizedString,
    },
    Shop {
        title: LocalizedString,
    },
    Purge {
        title: LocalizedString,
    },
    DreamsignBazaar {
        title: LocalizedString,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum SiteRules {
    Duplication { card_choices: CardChoiceLimits },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RandomSiteRules {
    pub destinations: Vec<SiteType>,
    pub home_choice_count: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardChoiceLimits {
    pub standard: ChoiceLimit,
    pub enhanced: ChoiceLimit,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum ChoiceLimit {
    Count(u32),
    All,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct GlossaryId(Uuid);

impl GlossaryId {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("glossary identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("glossary identifier must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for GlossaryId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for GlossaryId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for GlossaryId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

#[derive(Serialize)]
struct CompatibilityCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    #[serde(rename = "encounter-sites")]
    encounter_sites: CompatibilityEncounterSiteRules,
    rewards: toml::Value,
    purge: toml::Value,
    #[serde(rename = "site-types")]
    site_types: Vec<CompatibilitySiteMetadata>,
    #[serde(rename = "random-site")]
    random_site: CompatibilityRandomSiteRules,
}

#[derive(Serialize)]
struct CompatibilityEncounterSiteRules {
    #[serde(rename = "min-deck-for-purge")]
    min_deck_for_purge: u32,
    #[serde(rename = "placeable-sites")]
    placeable_sites: Vec<&'static str>,
}

#[derive(Serialize)]
struct CompatibilitySiteMetadata {
    #[serde(rename = "type")]
    site_type: &'static str,
    icon: String,
    #[serde(rename = "glossary-id")]
    glossary_id: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    presentation: Option<toml::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rules: Option<toml::Value>,
}

#[derive(Serialize)]
struct CompatibilityRandomSiteRules {
    destinations: Vec<&'static str>,
    #[serde(rename = "home-choice-count")]
    home_choice_count: u32,
    #[serde(rename = "insufficient-destinations")]
    insufficient_destinations: &'static str,
}

#[derive(Serialize)]
struct CompatibilityCardChoiceLimits {
    #[serde(rename = "standard-limit")]
    standard_limit: CompatibilityChoiceLimit,
    #[serde(rename = "enhanced-limit")]
    enhanced_limit: CompatibilityChoiceLimit,
}

#[derive(Serialize)]
#[serde(untagged)]
enum CompatibilityChoiceLimit {
    Count(u32),
    All(&'static str),
}

pub fn lower(source: SitesCatalog) -> Result<toml::Value> {
    lower_with_glossary_map(source, &GLOSSARY_ID_MAP)
}

fn lower_with_glossary_map(
    source: SitesCatalog,
    glossary_ids: &[(&'static str, &'static str)],
) -> Result<toml::Value> {
    validate(&source)?;
    let rewards = economy::lower_site_rewards(&source.rewards)?;
    let purge = economy::lower_purge(&source.purge)?;
    let encounter_sites = CompatibilityEncounterSiteRules {
        min_deck_for_purge: source.encounter_sites.min_deck_for_purge,
        placeable_sites: source
            .encounter_sites
            .placeable_sites
            .into_iter()
            .map(SiteType::as_compat)
            .collect(),
    };
    let site_types = source
        .site_types
        .into_iter()
        .map(|metadata| {
            Ok(CompatibilitySiteMetadata {
                site_type: metadata.site.as_compat(),
                icon: metadata.icon,
                glossary_id: compatibility_glossary_id(glossary_ids, metadata.glossary_id)?,
                presentation: metadata.presentation.map(lower_presentation).transpose()?,
                rules: metadata.rules.map(lower_rules).transpose()?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let random_site = CompatibilityRandomSiteRules {
        destinations: source
            .random_site
            .destinations
            .into_iter()
            .map(SiteType::as_compat)
            .collect(),
        home_choice_count: source.random_site.home_choice_count,
        insufficient_destinations: "fail",
    };
    Ok(toml::Value::try_from(CompatibilityCatalog {
        schema_version: 1,
        encounter_sites,
        rewards,
        purge,
        site_types,
        random_site,
    })?)
}

fn lower_rules(source: SiteRules) -> Result<toml::Value> {
    match source {
        SiteRules::Duplication { card_choices } => {
            let mut table = toml::map::Map::new();
            table.insert("kind".into(), "duplication".into());
            table.insert(
                "card-choices".into(),
                toml::Value::try_from(lower_choice_limits(card_choices))?,
            );
            Ok(toml::Value::Table(table))
        }
    }
}

fn lower_presentation(source: SitePresentation) -> Result<toml::Value> {
    let mut table = toml::map::Map::new();
    let mut put = |key: &str, value: toml::Value| {
        table.insert(key.into(), value);
    };
    match source {
        SitePresentation::Battle {
            label,
            final_boss_label,
        } => {
            put("kind", "battle".into());
            put("label", source_transport_value(&label)?);
            put(
                "final-boss-label",
                source_transport_value(&final_boss_label)?,
            );
        }
        SitePresentation::Draft { label } => {
            put("kind", "draft".into());
            put("label", source_transport_value(&label)?);
        }
        SitePresentation::Shop { title } => {
            put("kind", "shop".into());
            put("title", source_transport_value(&title)?);
        }
        SitePresentation::Purge { title } => {
            put("kind", "purge".into());
            put("title", source_transport_value(&title)?);
        }
        SitePresentation::DreamsignBazaar { title } => {
            put("kind", "dreamsign-bazaar".into());
            put("title", source_transport_value(&title)?);
        }
    }
    Ok(toml::Value::Table(table))
}

fn lower_choice_limits(source: CardChoiceLimits) -> CompatibilityCardChoiceLimits {
    CompatibilityCardChoiceLimits {
        standard_limit: lower_choice_limit(source.standard),
        enhanced_limit: lower_choice_limit(source.enhanced),
    }
}

fn lower_choice_limit(source: ChoiceLimit) -> CompatibilityChoiceLimit {
    match source {
        ChoiceLimit::Count(value) => CompatibilityChoiceLimit::Count(value),
        ChoiceLimit::All => CompatibilityChoiceLimit::All("all"),
    }
}

fn compatibility_glossary_id(
    mapping: &[(&'static str, &'static str)],
    id: GlossaryId,
) -> Result<&'static str> {
    let canonical = id.to_string();
    mapping
        .iter()
        .find_map(|(legacy, mapped)| (*mapped == canonical).then_some(*legacy))
        .with_context(|| format!("unmapped canonical glossary identifier {id}"))
}

fn validate(source: &SitesCatalog) -> Result<()> {
    economy::validate_site_configuration(&source.rewards, &source.purge)?;
    ensure!(
        source.encounter_sites.min_deck_for_purge > 0,
        "encounter_sites min_deck_for_purge must be positive"
    );
    let allowed_placeable = BTreeSet::from(["Shop", "Purge", "Transfiguration", "Duplication"]);
    let placeable = source
        .encounter_sites
        .placeable_sites
        .iter()
        .map(|site| site.as_compat())
        .collect::<BTreeSet<_>>();
    ensure!(
        !placeable.is_empty() && placeable.len() == source.encounter_sites.placeable_sites.len(),
        "encounter_sites placeable_sites must be non-empty and unique"
    );
    ensure!(
        placeable.is_subset(&allowed_placeable),
        "encounter_sites placeable_sites contains an unsupported site"
    );
    let mut sites = BTreeSet::new();
    let mut glossary_ids = BTreeSet::new();
    for metadata in &source.site_types {
        ensure!(
            sites.insert(metadata.site.as_compat()),
            "duplicate site metadata for {}",
            metadata.site.as_compat()
        );
        ensure!(
            glossary_ids.insert(metadata.glossary_id),
            "site metadata repeats glossary identifier {}",
            metadata.glossary_id
        );
        validate_text("site metadata icon", &metadata.icon)?;
        validate_presentation(metadata)?;
        validate_rules(metadata)?;
    }
    ensure!(
        sites == SITE_TYPES.map(SiteType::as_compat).into_iter().collect(),
        "site metadata must cover every site type exactly once"
    );
    let allowed_destinations = BTreeSet::from([
        "Shop",
        "Purge",
        "Transfiguration",
        "Duplication",
        "Augury",
        "DreamsignBazaar",
        "DreamsignRevelation",
        "Gamble",
        "Exploration",
    ]);
    let mut destinations = BTreeSet::new();
    for destination in &source.random_site.destinations {
        let name = destination.as_compat();
        ensure!(
            allowed_destinations.contains(name),
            "Random Site destination {name} cannot be materialized"
        );
        ensure!(
            destinations.insert(name),
            "duplicate Random Site destination {name}"
        );
    }
    ensure!(
        (2..=3).contains(&source.random_site.home_choice_count),
        "Random Site home choice count must be between two and three"
    );
    ensure!(
        source.random_site.home_choice_count as usize <= destinations.len(),
        "Random Site home choice count exceeds its destinations"
    );
    Ok(())
}

fn validate_rules(metadata: &SiteMetadata) -> Result<()> {
    let expected = match metadata.site {
        SiteType::Duplication => Some("duplication"),
        _ => None,
    };
    let actual = metadata.rules.as_ref().map(|value| match value {
        SiteRules::Duplication { .. } => "duplication",
    });
    ensure!(
        actual == expected,
        "{} rules must match its site type",
        metadata.site.as_compat()
    );
    if let Some(SiteRules::Duplication { card_choices }) = &metadata.rules {
        validate_choice_limits(card_choices)?;
    }
    Ok(())
}

fn validate_presentation(metadata: &SiteMetadata) -> Result<()> {
    let expected = match metadata.site {
        SiteType::Battle => Some("battle"),
        SiteType::Draft => Some("draft"),
        SiteType::Shop => Some("shop"),
        SiteType::Purge => Some("purge"),
        SiteType::DreamsignBazaar => Some("dreamsign-bazaar"),
        _ => None,
    };
    let actual = metadata.presentation.as_ref().map(|value| match value {
        SitePresentation::Battle { .. } => "battle",
        SitePresentation::Draft { .. } => "draft",
        SitePresentation::Shop { .. } => "shop",
        SitePresentation::Purge { .. } => "purge",
        SitePresentation::DreamsignBazaar { .. } => "dreamsign-bazaar",
    });
    ensure!(
        actual == expected,
        "{} presentation must match its site type",
        metadata.site.as_compat()
    );
    if let Some(presentation) = &metadata.presentation {
        let values = match presentation {
            SitePresentation::Battle {
                label,
                final_boss_label,
            } => vec![source_text(label)?, source_text(final_boss_label)?],
            SitePresentation::Draft { label } => {
                let label = source_text(label)?;
                validate_slots("Draft label", &label, &["pick_count"])?;
                vec![label]
            }
            SitePresentation::Shop { title }
            | SitePresentation::Purge { title }
            | SitePresentation::DreamsignBazaar { title } => vec![source_text(title)?],
        };
        for value in values {
            validate_text("site presentation text", &value)?;
        }
    }
    Ok(())
}

fn validate_slots(label: &str, template: &str, required: &[&str]) -> Result<()> {
    for slot in required {
        ensure!(
            template.matches(&format!("{{{slot}}}")).count() == 1,
            "{label} must contain {{{slot}}} exactly once"
        );
    }
    let stripped = required.iter().fold(template.to_owned(), |value, slot| {
        value.replace(&format!("{{{slot}}}"), "")
    });
    ensure!(
        !stripped.contains('{') && !stripped.contains('}'),
        "{label} contains an unsupported placeholder"
    );
    Ok(())
}

fn validate_choice_limits(limits: &CardChoiceLimits) -> Result<()> {
    for limit in [limits.standard, limits.enhanced] {
        if let ChoiceLimit::Count(value) = limit {
            ensure!(value > 0, "card choice count must be positive");
        }
    }
    Ok(())
}

fn validate_text(label: &str, value: &str) -> Result<()> {
    ensure!(!value.trim().is_empty(), "{label} must be non-empty");
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    fn ls(text: impl Into<String>) -> LocalizedString {
        super::super::localization::localized_source(text.into()).unwrap()
    }

    const SYNTHETIC_GLOSSARY_ID_MAP: [(&str, &str); 14] = [
        ("glossary-battle", "00000000-0000-4000-8000-000000000001"),
        ("glossary-draft", "00000000-0000-4000-8000-000000000002"),
        ("glossary-shop", "00000000-0000-4000-8000-000000000003"),
        ("glossary-purge", "00000000-0000-4000-8000-000000000004"),
        ("glossary-essence", "00000000-0000-4000-8000-000000000005"),
        (
            "glossary-transfiguration",
            "00000000-0000-4000-8000-000000000006",
        ),
        (
            "glossary-duplication",
            "00000000-0000-4000-8000-000000000007",
        ),
        ("glossary-reward", "00000000-0000-4000-8000-000000000008"),
        ("glossary-augury", "00000000-0000-4000-8000-000000000009"),
        (
            "glossary-dreamsign-bazaar",
            "00000000-0000-4000-8000-000000000010",
        ),
        (
            "glossary-dreamsign-revelation",
            "00000000-0000-4000-8000-000000000011",
        ),
        (
            "glossary-random-site",
            "00000000-0000-4000-8000-000000000012",
        ),
        ("glossary-gamble", "00000000-0000-4000-8000-000000000013"),
        (
            "glossary-exploration",
            "00000000-0000-4000-8000-000000000014",
        ),
    ];

    fn synthetic_catalog() -> SitesCatalog {
        let site_types = SITE_TYPES
            .into_iter()
            .zip(SYNTHETIC_GLOSSARY_ID_MAP)
            .map(|(site, (_legacy, canonical))| SiteMetadata {
                site,
                icon: format!("icon-{}", site.as_compat()),
                glossary_id: GlossaryId::parse(canonical).unwrap(),
                presentation: synthetic_presentation(site),
                rules: synthetic_rules(site),
            })
            .collect();
        SitesCatalog {
            encounter_sites: EncounterSiteRules {
                min_deck_for_purge: 8,
                placeable_sites: vec![
                    SiteType::Shop,
                    SiteType::Purge,
                    SiteType::Transfiguration,
                    SiteType::Duplication,
                ],
            },
            rewards: SiteRewardRules {
                essence: SiteEssenceRewards {
                    standard: IntegerRange { min: 10, max: 20 },
                    enhanced: IntegerRange { min: 30, max: 40 },
                },
                reward_fallback_essence: IntegerRange { min: 15, max: 25 },
                dreamsign_revelation: DreamsignRevelationRules {
                    standard_offer_count: 3,
                    enhanced_offer_count: 4,
                },
            },
            purge: PurgeRules {
                marginal_costs: vec![40, 60],
                enhanced_discount_percent: 30,
            },
            site_types,
            random_site: RandomSiteRules {
                destinations: vec![
                    SiteType::Shop,
                    SiteType::Purge,
                    SiteType::Transfiguration,
                    SiteType::Duplication,
                    SiteType::Augury,
                    SiteType::DreamsignBazaar,
                    SiteType::DreamsignRevelation,
                    SiteType::Gamble,
                    SiteType::Exploration,
                ],
                home_choice_count: 3,
            },
        }
    }

    fn synthetic_rules(site: SiteType) -> Option<SiteRules> {
        match site {
            SiteType::Duplication => Some(SiteRules::Duplication {
                card_choices: CardChoiceLimits {
                    standard: ChoiceLimit::Count(4),
                    enhanced: ChoiceLimit::Count(7),
                },
            }),
            _ => None,
        }
    }

    fn synthetic_presentation(site: SiteType) -> Option<SitePresentation> {
        match site {
            SiteType::Battle => Some(SitePresentation::Battle {
                label: ls("Battle"),
                final_boss_label: ls("Boss"),
            }),
            SiteType::Draft => Some(SitePresentation::Draft {
                label: ls("Draft {pick_count}x"),
            }),
            SiteType::Shop => Some(SitePresentation::Shop { title: ls("Shop") }),
            SiteType::Purge => Some(SitePresentation::Purge { title: ls("Purge") }),
            SiteType::DreamsignBazaar => Some(SitePresentation::DreamsignBazaar {
                title: ls("Bazaar"),
            }),
            _ => None,
        }
    }

    #[test]
    fn lowers_every_structural_variant_ordered_keys_and_compatibility_sentinel() {
        let lowered =
            lower_with_glossary_map(synthetic_catalog(), &SYNTHETIC_GLOSSARY_ID_MAP).unwrap();

        assert_eq!(lowered["schema-version"].as_integer(), Some(1));
        assert_eq!(
            lowered["encounter-sites"]["min-deck-for-purge"].as_integer(),
            Some(8)
        );
        assert_eq!(
            lowered["encounter-sites"]["placeable-sites"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert_eq!(
            lowered["rewards"]["reward"]["fallback-essence"]["max"].as_integer(),
            Some(25)
        );
        assert_eq!(lowered["purge"]["marginal-costs"][1].as_integer(), Some(60));
        let site_types = lowered["site-types"].as_array().unwrap();
        assert_eq!(site_types.len(), 14);
        assert_eq!(site_types[0]["type"].as_str(), Some("Battle"));
        assert_eq!(site_types[13]["type"].as_str(), Some("Exploration"));
        assert_eq!(
            site_types[0]["glossary-id"].as_str(),
            Some("glossary-battle")
        );
        let duplication = site_types
            .iter()
            .find(|metadata| metadata["type"].as_str() == Some("Duplication"))
            .unwrap();
        assert_eq!(
            duplication["rules"]["card-choices"]["enhanced-limit"].as_integer(),
            Some(7)
        );
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_glossary_identifiers() {
        let serialized = ron::to_string(&synthetic_catalog()).unwrap();
        let unknown =
            serialized.replacen("(encounter_sites:", "(surprise:true,encounter_sites:", 1);
        assert!(ron::from_str::<SitesCatalog>(&unknown).is_err());
        let nested_unknown = serialized.replacen("(site:", "(surprise:true,site:", 1);
        assert!(ron::from_str::<SitesCatalog>(&nested_unknown).is_err());
        let obsolete_gamble =
            serialized.replacen("(encounter_sites:", "(gamble:(),encounter_sites:", 1);
        assert!(ron::from_str::<SitesCatalog>(&obsolete_gamble).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-c000-000000000001",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        ] {
            assert!(ron::from_str::<GlossaryId>(&format!("\"{invalid}\"")).is_err());
        }
    }

    #[test]
    fn rejects_identity_reference_and_cross_field_invariant_violations() {
        let mut two_choices = synthetic_catalog();
        two_choices.random_site.home_choice_count = 2;
        lower_with_glossary_map(two_choices, &SYNTHETIC_GLOSSARY_ID_MAP).unwrap();

        let mut one_choice = synthetic_catalog();
        one_choice.random_site.home_choice_count = 1;
        assert_error_contains(one_choice, "between two and three");

        let mut four_choices = synthetic_catalog();
        four_choices.random_site.home_choice_count = 4;
        assert_error_contains(four_choices, "between two and three");

        let mut duplicate_site = synthetic_catalog();
        duplicate_site.site_types[1].site = duplicate_site.site_types[0].site;
        assert_error_contains(duplicate_site, "duplicate site metadata");

        let mut duplicate_glossary = synthetic_catalog();
        duplicate_glossary.site_types[1].glossary_id = duplicate_glossary.site_types[0].glossary_id;
        assert_error_contains(duplicate_glossary, "repeats glossary identifier");

        let mut duplicate_destination = synthetic_catalog();
        duplicate_destination.random_site.destinations[1] = SiteType::Shop;
        assert_error_contains(duplicate_destination, "duplicate Random Site destination");

        let mut missing_duplication_rules = synthetic_catalog();
        missing_duplication_rules
            .site_types
            .iter_mut()
            .find(|metadata| metadata.site == SiteType::Duplication)
            .unwrap()
            .rules = None;
        assert_error_contains(missing_duplication_rules, "Duplication rules must match");

        let mut misplaced_duplication_rules = synthetic_catalog();
        let duplication_rules = misplaced_duplication_rules
            .site_types
            .iter()
            .find(|metadata| metadata.site == SiteType::Duplication)
            .unwrap()
            .rules
            .clone();
        misplaced_duplication_rules
            .site_types
            .iter_mut()
            .find(|metadata| metadata.site == SiteType::Shop)
            .unwrap()
            .rules = duplication_rules;
        assert_error_contains(misplaced_duplication_rules, "Shop rules must match");

        let mut invalid_choice_count = synthetic_catalog();
        let duplication = invalid_choice_count
            .site_types
            .iter_mut()
            .find(|metadata| metadata.site == SiteType::Duplication)
            .unwrap();
        let Some(SiteRules::Duplication { card_choices }) = &mut duplication.rules else {
            panic!("synthetic Duplication rules missing");
        };
        card_choices.standard = ChoiceLimit::Count(0);
        assert_error_contains(invalid_choice_count, "card choice count must be positive");

        let mut unmapped = synthetic_catalog();
        unmapped.site_types[0].glossary_id =
            GlossaryId::parse("00000000-0000-4000-8000-000000000099").unwrap();
        assert!(
            lower_with_glossary_map(unmapped, &SYNTHETIC_GLOSSARY_ID_MAP)
                .unwrap_err()
                .to_string()
                .contains("unmapped canonical glossary identifier")
        );
    }

    fn assert_error_contains(source: SitesCatalog, expected: &str) {
        assert!(
            lower_with_glossary_map(source, &SYNTHETIC_GLOSSARY_ID_MAP)
                .unwrap_err()
                .to_string()
                .contains(expected),
            "error did not contain {expected}"
        );
    }
}

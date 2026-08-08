use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Context, Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

const LEGACY_GUIDE_ID_MAP: [(&str, &str); 10] = [
    ("tobias_tanglefur", "4e5067ec-265d-4dba-8fa8-2afbd4fde9ab"),
    (
        "amunet_the_tomb_keeper",
        "113cb023-12df-4b9c-982c-f0c8bba30377",
    ),
    ("sigrun", "706a4443-2826-4459-8127-040632cb93fd"),
    ("durgan_forgehammer", "9890b3c2-74f7-4b4a-bb39-61c2c6d53cbb"),
    ("deacon_holt", "e0aaa9a6-9038-48b9-8847-63681426190e"),
    ("master_takeshi", "87e9ae46-57c6-407a-af96-bd5f5323dabc"),
    ("aldric_the_seer", "232e7de1-b7b9-4631-b6a3-1ab178c7ff9a"),
    ("maddox", "869a07ae-5532-4a65-abfa-26a89713a82b"),
    ("gravok", "579eaf53-0643-4cba-9c0c-da04b9c52822"),
    ("layaway", "078e102a-f235-4794-9bb5-a5c42262782a"),
];

const LEGACY_DREAMSCAPE_ID_MAP: [(&str, &str); 10] = [
    ("tumbleleaf_village", "08e11635-9f04-48fd-a9c8-5a9f68c80958"),
    ("pharaohs_gate", "b25b9906-8380-45bf-9435-678ce18316ea"),
    ("winterwake_fjords", "7d793d30-8a0f-4f84-a446-cdde502710e8"),
    ("frostforge", "8e7d0818-ba6a-4dc9-8b3d-a12c62aefa44"),
    ("hopes_end", "562f9d1f-5bbf-4dc5-9edd-7e8d538a1651"),
    ("tsukiren", "823dc726-db0f-4367-8442-70600a20ad2e"),
    ("wilderveil", "f52bdeb1-0db6-44ee-80ea-b99bd18dff7d"),
    ("rust_expanse", "6f16a1c9-c2fa-494d-9d9d-4da00e011491"),
    ("farpoint_station", "138eff95-3301-4f76-aeb1-31bf0dc8963d"),
    ("grid_city", "6c03e9d1-21fe-4c13-b940-2325d308cb14"),
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GuideDefinition {
    pub id: GuideId,
    pub name: String,
    pub home_dreamscape_id: DreamscapeId,
    pub portrait_source: String,
    pub site_dialogue: Vec<String>,
    pub specialty: GuideSpecialty,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum GuideSpecialty {
    Shop {
        description: String,
    },
    DreamsignMarket {
        description: String,
    },
    DreamsignRevelation {
        description: String,
    },
    Transfiguration {
        description: String,
    },
    Duplication {
        description: String,
    },
    Purge {
        description: String,
    },
    Augury {
        description: String,
    },
    RandomSite {
        description: String,
        dialogue: Vec<String>,
    },
    Gamble {
        description: String,
        dialogue: GambleDialogue,
    },
    Exploration {
        description: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GambleDialogue {
    pub three_gate: Vec<String>,
    pub ladder_climb: Vec<String>,
    pub starway_stairs: Vec<String>,
    pub four_suit_reprise: Vec<String>,
    pub blackjack: Vec<String>,
}

macro_rules! canonical_uuid {
    ($name:ident, $label:literal) => {
        #[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(Uuid);

        impl $name {
            fn parse(value: &str) -> std::result::Result<Self, String> {
                let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
                if uuid.get_version() != Some(Version::Random)
                    || uuid.get_variant() != Variant::RFC4122
                {
                    return Err(concat!($label, " must be an RFC 4122 UUIDv4").into());
                }
                if uuid.hyphenated().to_string() != value {
                    return Err(
                        concat!($label, " must use lowercase hyphenated UUID formatting").into(),
                    );
                }
                Ok(Self(uuid))
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.hyphenated().fmt(formatter)
            }
        }

        impl Serialize for $name {
            fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                serializer.serialize_str(&self.to_string())
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
            where
                D: Deserializer<'de>,
            {
                let value = String::deserialize(deserializer)?;
                Self::parse(&value).map_err(D::Error::custom)
            }
        }
    };
}

canonical_uuid!(GuideId, "Dream guide identifier");
canonical_uuid!(DreamscapeId, "home Dreamscape identifier");

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum SpecialtyKind {
    Shop,
    DreamsignMarket,
    DreamsignRevelation,
    Transfiguration,
    Duplication,
    Purge,
    Augury,
    RandomSite,
    Gamble,
    Exploration,
}

impl SpecialtyKind {
    const ALL: [Self; 10] = [
        Self::Shop,
        Self::DreamsignMarket,
        Self::DreamsignRevelation,
        Self::Transfiguration,
        Self::Duplication,
        Self::Purge,
        Self::Augury,
        Self::RandomSite,
        Self::Gamble,
        Self::Exploration,
    ];

    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Shop => "Shop",
            Self::DreamsignMarket => "DreamsignMarket",
            Self::DreamsignRevelation => "DreamsignRevelation",
            Self::Transfiguration => "Transfiguration",
            Self::Duplication => "Duplication",
            Self::Purge => "Purge",
            Self::Augury => "Augury",
            Self::RandomSite => "RandomSite",
            Self::Gamble => "Gamble",
            Self::Exploration => "Exploration",
        }
    }
}

impl GuideSpecialty {
    fn kind(&self) -> SpecialtyKind {
        match self {
            Self::Shop { .. } => SpecialtyKind::Shop,
            Self::DreamsignMarket { .. } => SpecialtyKind::DreamsignMarket,
            Self::DreamsignRevelation { .. } => SpecialtyKind::DreamsignRevelation,
            Self::Transfiguration { .. } => SpecialtyKind::Transfiguration,
            Self::Duplication { .. } => SpecialtyKind::Duplication,
            Self::Purge { .. } => SpecialtyKind::Purge,
            Self::Augury { .. } => SpecialtyKind::Augury,
            Self::RandomSite { .. } => SpecialtyKind::RandomSite,
            Self::Gamble { .. } => SpecialtyKind::Gamble,
            Self::Exploration { .. } => SpecialtyKind::Exploration,
        }
    }

    fn description(&self) -> &str {
        match self {
            Self::Shop { description }
            | Self::DreamsignMarket { description }
            | Self::DreamsignRevelation { description }
            | Self::Transfiguration { description }
            | Self::Duplication { description }
            | Self::Purge { description }
            | Self::Augury { description }
            | Self::RandomSite { description, .. }
            | Self::Gamble { description, .. }
            | Self::Exploration { description } => description,
        }
    }
}

#[derive(Serialize)]
struct CompatibilityCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    guides: Vec<CompatibilityGuide>,
}

#[derive(Serialize)]
struct CompatibilityGuide {
    id: String,
    name: String,
    #[serde(rename = "home-dreamscape-id")]
    home_dreamscape_id: String,
    #[serde(rename = "site-type")]
    site_type: &'static str,
    #[serde(rename = "portrait-source")]
    portrait_source: String,
    #[serde(rename = "home-specialty")]
    home_specialty: String,
    dialogue: CompatibilityDialogue,
}

#[derive(Default, Serialize)]
struct CompatibilityDialogue {
    site: Vec<String>,
    #[serde(rename = "random-site", skip_serializing_if = "Option::is_none")]
    random_site: Option<Vec<String>>,
    #[serde(rename = "gamble-three-gate", skip_serializing_if = "Option::is_none")]
    gamble_three_gate: Option<Vec<String>>,
    #[serde(
        rename = "gamble-ladder-climb",
        skip_serializing_if = "Option::is_none"
    )]
    gamble_ladder_climb: Option<Vec<String>>,
    #[serde(
        rename = "gamble-starway-stairs",
        skip_serializing_if = "Option::is_none"
    )]
    gamble_starway_stairs: Option<Vec<String>>,
    #[serde(
        rename = "gamble-four-suit-reprise",
        skip_serializing_if = "Option::is_none"
    )]
    gamble_four_suit_reprise: Option<Vec<String>>,
    #[serde(rename = "gamble-blackjack", skip_serializing_if = "Option::is_none")]
    gamble_blackjack: Option<Vec<String>>,
}

pub fn lower(source: Vec<GuideDefinition>) -> Result<toml::Value> {
    lower_with_maps(source, &LEGACY_GUIDE_ID_MAP, &LEGACY_DREAMSCAPE_ID_MAP)
}

fn lower_with_maps(
    source: Vec<GuideDefinition>,
    guide_ids: &[(&str, &str)],
    dreamscape_ids: &[(&str, &str)],
) -> Result<toml::Value> {
    validate(&source)?;
    let guides = source
        .into_iter()
        .map(|guide| lower_guide(guide, guide_ids, dreamscape_ids))
        .collect::<Result<Vec<_>>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog {
        schema_version: 1,
        guides,
    })?)
}

fn lower_guide(
    source: GuideDefinition,
    guide_ids: &[(&str, &str)],
    dreamscape_ids: &[(&str, &str)],
) -> Result<CompatibilityGuide> {
    let kind = source.specialty.kind();
    let description = source.specialty.description().to_owned();
    let mut dialogue = CompatibilityDialogue {
        site: source.site_dialogue,
        ..CompatibilityDialogue::default()
    };
    match source.specialty {
        GuideSpecialty::RandomSite {
            dialogue: random_site,
            ..
        } => dialogue.random_site = Some(random_site),
        GuideSpecialty::Gamble {
            dialogue: gamble, ..
        } => {
            dialogue.gamble_three_gate = Some(gamble.three_gate);
            dialogue.gamble_ladder_climb = Some(gamble.ladder_climb);
            dialogue.gamble_starway_stairs = Some(gamble.starway_stairs);
            dialogue.gamble_four_suit_reprise = Some(gamble.four_suit_reprise);
            dialogue.gamble_blackjack = Some(gamble.blackjack);
        }
        GuideSpecialty::Shop { .. }
        | GuideSpecialty::DreamsignMarket { .. }
        | GuideSpecialty::DreamsignRevelation { .. }
        | GuideSpecialty::Transfiguration { .. }
        | GuideSpecialty::Duplication { .. }
        | GuideSpecialty::Purge { .. }
        | GuideSpecialty::Augury { .. }
        | GuideSpecialty::Exploration { .. } => {}
    }
    Ok(CompatibilityGuide {
        id: compatibility_id(guide_ids, &source.id.to_string(), "Dream guide")?.to_owned(),
        name: source.name,
        home_dreamscape_id: compatibility_id(
            dreamscape_ids,
            &source.home_dreamscape_id.to_string(),
            "Dreamscape",
        )?
        .to_owned(),
        site_type: kind.compatibility_name(),
        portrait_source: source.portrait_source,
        home_specialty: description,
        dialogue,
    })
}

pub fn canonical_guide_id(compatibility_id: &str) -> Result<GuideId> {
    let canonical = LEGACY_GUIDE_ID_MAP
        .iter()
        .find_map(|(legacy, canonical)| (*legacy == compatibility_id).then_some(*canonical))
        .with_context(|| {
            format!("unknown Dream guide compatibility identifier {compatibility_id}")
        })?;
    GuideId::parse(canonical).map_err(anyhow::Error::msg)
}

fn compatibility_id<'a>(
    mapping: &'a [(&str, &str)],
    canonical: &str,
    label: &str,
) -> Result<&'a str> {
    mapping
        .iter()
        .find_map(|(legacy, mapped)| (*mapped == canonical).then_some(*legacy))
        .with_context(|| format!("unmapped canonical {label} identifier {canonical}"))
}

pub(crate) fn validate(source: &[GuideDefinition]) -> Result<()> {
    let mut guide_ids = BTreeSet::new();
    let mut home_ids = BTreeSet::new();
    let mut specialties = BTreeSet::new();
    for (index, guide) in source.iter().enumerate() {
        let path = format!("guides[{index}]");
        if !guide_ids.insert(guide.id) {
            bail!("{path}.id duplicates {}", guide.id);
        }
        if !home_ids.insert(guide.home_dreamscape_id) {
            bail!(
                "{path}.home_dreamscape_id duplicates {}",
                guide.home_dreamscape_id
            );
        }
        if !specialties.insert(guide.specialty.kind()) {
            bail!(
                "{path}.specialty duplicates {}",
                guide.specialty.kind().compatibility_name()
            );
        }
        validate_text(&format!("{path}.name"), &guide.name)?;
        validate_text(&format!("{path}.portrait_source"), &guide.portrait_source)?;
        validate_text(
            &format!("{path}.specialty.description"),
            guide.specialty.description(),
        )?;
        validate_dialogue(
            &format!("{path}.site_dialogue"),
            &guide.site_dialogue,
            &[],
            &[],
        )?;
        match &guide.specialty {
            GuideSpecialty::RandomSite { dialogue, .. } => {
                validate_dialogue(&format!("{path}.specialty.dialogue"), dialogue, &[], &[])?;
            }
            GuideSpecialty::Gamble { dialogue, .. } => {
                validate_dialogue(
                    &format!("{path}.specialty.dialogue.three_gate"),
                    &dialogue.three_gate,
                    &[],
                    &[],
                )?;
                validate_dialogue(
                    &format!("{path}.specialty.dialogue.ladder_climb"),
                    &dialogue.ladder_climb,
                    &["win-essence"],
                    &["win-essence"],
                )?;
                validate_dialogue(
                    &format!("{path}.specialty.dialogue.starway_stairs"),
                    &dialogue.starway_stairs,
                    &[],
                    &[],
                )?;
                validate_dialogue(
                    &format!("{path}.specialty.dialogue.four_suit_reprise"),
                    &dialogue.four_suit_reprise,
                    &[],
                    &[],
                )?;
                validate_dialogue(
                    &format!("{path}.specialty.dialogue.blackjack"),
                    &dialogue.blackjack,
                    &[],
                    &[],
                )?;
            }
            GuideSpecialty::Shop { .. }
            | GuideSpecialty::DreamsignMarket { .. }
            | GuideSpecialty::DreamsignRevelation { .. }
            | GuideSpecialty::Transfiguration { .. }
            | GuideSpecialty::Duplication { .. }
            | GuideSpecialty::Purge { .. }
            | GuideSpecialty::Augury { .. }
            | GuideSpecialty::Exploration { .. } => {}
        }
    }
    let expected: BTreeSet<_> = SpecialtyKind::ALL.into_iter().collect();
    if specialties != expected {
        let missing = expected
            .difference(&specialties)
            .map(|kind| kind.compatibility_name())
            .collect::<Vec<_>>();
        bail!(
            "guides must cover each guide specialty exactly once; missing {}",
            missing.join(", ")
        );
    }
    Ok(())
}

fn validate_text(path: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        bail!("{path} must be non-empty");
    }
    Ok(())
}

fn validate_dialogue(
    path: &str,
    lines: &[String],
    allowed_placeholders: &[&str],
    required_placeholders: &[&str],
) -> Result<()> {
    if lines.is_empty() {
        bail!("{path} must not be empty");
    }
    let mut found = BTreeSet::new();
    for (index, line) in lines.iter().enumerate() {
        validate_text(&format!("{path}[{index}]"), line)?;
        for placeholder in placeholders(line) {
            if !allowed_placeholders.contains(&placeholder) {
                bail!("{path}[{index}] contains unsupported placeholder {{{placeholder}}}");
            }
            found.insert(placeholder);
        }
    }
    for required in required_placeholders {
        if !found.contains(required) {
            bail!("{path} is missing placeholder {{{required}}}");
        }
    }
    Ok(())
}

fn placeholders(value: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let mut remaining = value;
    while let Some(open) = remaining.find('{') {
        let after_open = &remaining[open + 1..];
        let Some(close) = after_open.find('}') else {
            break;
        };
        result.push(&after_open[..close]);
        remaining = &after_open[close + 1..];
    }
    result
}

#[cfg(test)]
pub(crate) mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    const SYNTHETIC_GUIDE_ID_MAP: [(&str, &str); 10] = [
        ("guide_1", "00000000-0000-4000-8000-000000000001"),
        ("guide_2", "00000000-0000-4000-8000-000000000002"),
        ("guide_3", "00000000-0000-4000-8000-000000000003"),
        ("guide_4", "00000000-0000-4000-8000-000000000004"),
        ("guide_5", "00000000-0000-4000-8000-000000000005"),
        ("guide_6", "00000000-0000-4000-8000-000000000006"),
        ("guide_7", "00000000-0000-4000-8000-000000000007"),
        ("guide_8", "00000000-0000-4000-8000-000000000008"),
        ("guide_9", "00000000-0000-4000-8000-000000000009"),
        ("guide_10", "00000000-0000-4000-8000-000000000010"),
    ];
    const SYNTHETIC_DREAMSCAPE_ID_MAP: [(&str, &str); 10] = [
        ("dreamscape_1", "00000000-0000-4000-8000-000000000101"),
        ("dreamscape_2", "00000000-0000-4000-8000-000000000102"),
        ("dreamscape_3", "00000000-0000-4000-8000-000000000103"),
        ("dreamscape_4", "00000000-0000-4000-8000-000000000104"),
        ("dreamscape_5", "00000000-0000-4000-8000-000000000105"),
        ("dreamscape_6", "00000000-0000-4000-8000-000000000106"),
        ("dreamscape_7", "00000000-0000-4000-8000-000000000107"),
        ("dreamscape_8", "00000000-0000-4000-8000-000000000108"),
        ("dreamscape_9", "00000000-0000-4000-8000-000000000109"),
        ("dreamscape_10", "00000000-0000-4000-8000-000000000110"),
    ];

    pub(crate) fn synthetic_source() -> &'static str {
        r##"// Synthetic Dream guide definitions.

#![enable(implicit_some)]
[
  GuideDefinition(id: "00000000-0000-4000-8000-000000000001", name: "Guide 1", home_dreamscape_id: "00000000-0000-4000-8000-000000000101", portrait_source: "one.png", site_dialogue: [r#"Site 1"#], specialty: Shop(description: "Shop copy")),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000002", name: "Guide 2", home_dreamscape_id: "00000000-0000-4000-8000-000000000102", portrait_source: "two.png", site_dialogue: ["Site 2"], specialty: DreamsignMarket(description: "Market copy")),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000003", name: "Guide 3", home_dreamscape_id: "00000000-0000-4000-8000-000000000103", portrait_source: "three.png", site_dialogue: ["Site 3"], specialty: DreamsignRevelation(description: "Revelation copy")),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000004", name: "Guide 4", home_dreamscape_id: "00000000-0000-4000-8000-000000000104", portrait_source: "four.png", site_dialogue: ["Site 4"], specialty: Transfiguration(description: "Transfiguration copy")),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000005", name: "Guide 5", home_dreamscape_id: "00000000-0000-4000-8000-000000000105", portrait_source: "five.png", site_dialogue: ["Site 5"], specialty: Duplication(description: "Duplication copy")),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000006", name: "Guide 6", home_dreamscape_id: "00000000-0000-4000-8000-000000000106", portrait_source: "six.png", site_dialogue: ["Site 6"], specialty: Purge(description: "Purge copy")),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000007", name: "Guide 7", home_dreamscape_id: "00000000-0000-4000-8000-000000000107", portrait_source: "seven.png", site_dialogue: ["Site 7"], specialty: Augury(description: "Augury copy")),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000008", name: "Guide 8", home_dreamscape_id: "00000000-0000-4000-8000-000000000108", portrait_source: "eight.png", site_dialogue: ["Site 8"], specialty: RandomSite(description: "Random copy", dialogue: ["Random line"])),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000009", name: "Guide 9", home_dreamscape_id: "00000000-0000-4000-8000-000000000109", portrait_source: "nine.png", site_dialogue: ["Site 9"], specialty: Gamble(description: "Gamble copy", dialogue: GambleDialogue(three_gate: ["Three Gate"], ladder_climb: ["Win {win-essence}"], starway_stairs: ["Stairs"], four_suit_reprise: ["Reprise"], blackjack: ["Blackjack"]))),
  GuideDefinition(id: "00000000-0000-4000-8000-000000000010", name: "Guïde 10", home_dreamscape_id: "00000000-0000-4000-8000-000000000110", portrait_source: "ten.png", site_dialogue: ["Site 10\ncontinues"], specialty: Exploration(description: "Exploration copy")),
]
"##
    }

    fn catalog() -> Vec<GuideDefinition> {
        ron::from_str(synthetic_source()).unwrap()
    }

    #[test]
    fn lowers_all_specialties_ordered_dialogue_unicode_and_multiline_copy() {
        let output = lower_with_maps(
            catalog(),
            &SYNTHETIC_GUIDE_ID_MAP,
            &SYNTHETIC_DREAMSCAPE_ID_MAP,
        )
        .unwrap();
        assert_eq!(output["schema-version"].as_integer(), Some(1));
        let guides = output["guides"].as_array().unwrap();
        assert_eq!(guides.len(), 10);
        assert_eq!(guides[0]["id"].as_str(), Some("guide_1"));
        assert_eq!(
            guides[0]["home-dreamscape-id"].as_str(),
            Some("dreamscape_1")
        );
        assert_eq!(guides[9]["name"].as_str(), Some("Guïde 10"));
        assert_eq!(
            guides[9]["dialogue"]["site"][0].as_str(),
            Some("Site 10\ncontinues")
        );

        let site_types = guides
            .iter()
            .map(|guide| guide["site-type"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            site_types,
            vec![
                "Shop",
                "DreamsignMarket",
                "DreamsignRevelation",
                "Transfiguration",
                "Duplication",
                "Purge",
                "Augury",
                "RandomSite",
                "Gamble",
                "Exploration",
            ]
        );
        assert_eq!(
            guides[7]["dialogue"]["random-site"][0].as_str(),
            Some("Random line")
        );
        assert_eq!(
            guides[8]["dialogue"]["gamble-ladder-climb"][0].as_str(),
            Some("Win {win-essence}")
        );
        assert!(guides[0]["dialogue"].get("random-site").is_none());
        assert!(guides[7]["dialogue"].get("gamble-blackjack").is_none());
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_uuid_identities() {
        let unknown =
            synthetic_source().replace("name: \"Guide 1\",", "name: \"Guide 1\", surprise: true,");
        assert!(ron::from_str::<Vec<GuideDefinition>>(&unknown).is_err());
        let unknown_dialogue = synthetic_source().replace(
            "three_gate: [\"Three Gate\"],",
            "three_gate: [\"Three Gate\"], surprise: [\"No\"],",
        );
        assert!(ron::from_str::<Vec<GuideDefinition>>(&unknown_dialogue).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-c000-000000000001",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        ] {
            assert!(ron::from_str::<GuideId>(&format!("\"{invalid}\"")).is_err());
            assert!(ron::from_str::<DreamscapeId>(&format!("\"{invalid}\"")).is_err());
        }
    }

    #[test]
    fn rejects_duplicate_identity_home_specialty_and_empty_copy() {
        let source = catalog();

        let mut duplicate_id = source.clone();
        duplicate_id[1].id = duplicate_id[0].id;
        assert!(
            lower(duplicate_id)
                .unwrap_err()
                .to_string()
                .contains(".id duplicates")
        );

        let mut duplicate_home = source.clone();
        duplicate_home[1].home_dreamscape_id = duplicate_home[0].home_dreamscape_id;
        assert!(
            lower(duplicate_home)
                .unwrap_err()
                .to_string()
                .contains("home_dreamscape_id duplicates")
        );

        let mut duplicate_specialty = source.clone();
        duplicate_specialty[1].specialty = duplicate_specialty[0].specialty.clone();
        assert!(
            lower(duplicate_specialty)
                .unwrap_err()
                .to_string()
                .contains("specialty duplicates")
        );

        let mut empty_name = source.clone();
        empty_name[0].name = "  ".into();
        assert!(
            lower(empty_name)
                .unwrap_err()
                .to_string()
                .contains("name must be non-empty")
        );

        let mut empty_dialogue = source;
        empty_dialogue[0].site_dialogue.clear();
        assert!(
            lower(empty_dialogue)
                .unwrap_err()
                .to_string()
                .contains("site_dialogue must not be empty")
        );

        assert!(
            lower_with_maps(
                catalog(),
                &SYNTHETIC_GUIDE_ID_MAP[..9],
                &SYNTHETIC_DREAMSCAPE_ID_MAP,
            )
            .unwrap_err()
            .to_string()
            .contains("unmapped canonical Dream guide identifier")
        );
    }

    #[test]
    fn rejects_unsupported_and_missing_dialogue_placeholders() {
        let mut unsupported = catalog();
        unsupported[0].site_dialogue[0] = "Unexpected {slot}".into();
        assert!(
            lower(unsupported)
                .unwrap_err()
                .to_string()
                .contains("unsupported placeholder {slot}")
        );

        let mut missing = catalog();
        let GuideSpecialty::Gamble { dialogue, .. } = &mut missing[8].specialty else {
            panic!("synthetic Gamble guide")
        };
        dialogue.ladder_climb[0] = "No reward slot".into();
        assert!(
            lower(missing)
                .unwrap_err()
                .to_string()
                .contains("missing placeholder {win-essence}")
        );
    }
}

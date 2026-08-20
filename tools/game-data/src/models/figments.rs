use std::collections::BTreeSet;
use std::fmt;
use trox::LocalizedString;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::source_text;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FigmentDefinition {
    pub id: FigmentId,
    pub name: LocalizedString,
    pub character_type: CharacterType,
    pub base_spark: u32,
    pub behavior: FigmentBehavior,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub image_number: u32,
    #[serde(default, skip_serializing_if = "is_false")]
    pub art_owned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub art: Option<ArtCrop>,
}

fn is_false(value: &bool) -> bool {
    !value
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum CharacterType {
    Warrior,
    Shadow,
    SpiritAnimal,
    Monstrosity,
    Survivor,
    Wraith,
    Ethereal,
    Ember,
    Outsider,
}

impl CharacterType {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Warrior => "Warrior",
            Self::Shadow => "Shadow",
            Self::SpiritAnimal => "Spirit Animal",
            Self::Monstrosity => "Monstrosity",
            Self::Survivor => "Survivor",
            Self::Wraith => "Wraith",
            Self::Ethereal => "Ethereal",
            Self::Ember => "Ember",
            Self::Outsider => "Outsider",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum FigmentBehavior {
    Vanilla,
    Vengeful,
    Awakened,
    Legionnaire,
}

impl FigmentBehavior {
    fn compatibility_keyword(self) -> &'static str {
        match self {
            Self::Vanilla | Self::Legionnaire => "",
            Self::Vengeful => "vengeful",
            Self::Awakened => "awakened",
        }
    }

    fn compatibility_rules_text(self) -> &'static str {
        match self {
            Self::Vanilla => "",
            Self::Vengeful => "Vengeful",
            Self::Awakened => "Awakened",
            Self::Legionnaire => "This character has +1✦ for each other warrior you control.",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ArtCrop {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct FigmentId(Uuid);

impl FigmentId {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Figment identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("Figment identifier must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for FigmentId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for FigmentId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for FigmentId {
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
    figments: Vec<CompatibilityFigment>,
}

#[derive(Serialize)]
struct CompatibilityFigment {
    name: String,
    id: String,
    subtype: &'static str,
    spark: u32,
    keyword: &'static str,
    #[serde(rename = "rendered-text")]
    rendered_text: &'static str,
    tags: Vec<String>,
    #[serde(rename = "image-number")]
    image_number: u32,
    #[serde(rename = "art-owned")]
    art_owned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    art: Option<CompatibilityArtCrop>,
}

#[derive(Serialize)]
struct CompatibilityArtCrop {
    x: toml::Value,
    y: toml::Value,
    scale: toml::Value,
}

pub fn lower(source: Vec<FigmentDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let figments = source
        .into_iter()
        .map(|figment| {
            Ok(CompatibilityFigment {
                name: source_text(&figment.name)?,
                id: figment.id.to_string(),
                subtype: figment.character_type.compatibility_name(),
                spark: figment.base_spark,
                keyword: figment.behavior.compatibility_keyword(),
                rendered_text: figment.behavior.compatibility_rules_text(),
                tags: figment.tags,
                image_number: figment.image_number,
                art_owned: figment.art_owned,
                art: figment.art.map(|crop| CompatibilityArtCrop {
                    x: compatibility_number(crop.x),
                    y: compatibility_number(crop.y),
                    scale: compatibility_number(crop.scale),
                }),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog { figments })?)
}

fn compatibility_number(value: f64) -> toml::Value {
    if value.fract() == 0.0 && value >= i64::MIN as f64 && value <= i64::MAX as f64 {
        toml::Value::Integer(value as i64)
    } else {
        toml::Value::Float(value)
    }
}

fn validate(source: &[FigmentDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    for figment in source {
        if !ids.insert(figment.id) {
            bail!("duplicate Figment id: {}", figment.id);
        }
        if source_text(&figment.name)?.trim().is_empty() {
            bail!("Figment {} has an empty name", figment.id);
        }
        let mut tags = BTreeSet::new();
        for tag in &figment.tags {
            if tag.trim().is_empty() {
                bail!("Figment {} has a blank tag", figment.id);
            }
            if !tags.insert(tag) {
                bail!("Figment {} repeats tag {tag:?}", figment.id);
            }
        }
        if let Some(art) = figment.art {
            if !art.x.is_finite() || !art.y.is_finite() || !art.scale.is_finite() {
                bail!("Figment {} has a non-finite art crop", figment.id);
            }
            if art.scale <= 0.0 {
                bail!("Figment {} has a non-positive art scale", figment.id);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";
    const THIRD_ID: &str = "00000000-0000-4000-8000-000000000003";
    const FOURTH_ID: &str = "00000000-0000-4000-8000-000000000004";

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
[
  FigmentDefinition(
    id: "00000000-0000-4000-8000-000000000001",
    name: Tx("Plain"),
    character_type: Warrior,
    base_spark: 1,
    behavior: Vanilla,
    image_number: 11,
  ),
  FigmentDefinition(
    id: "00000000-0000-4000-8000-000000000002",
    name: Tx("Vengeful"),
    character_type: Wraith,
    base_spark: 0,
    behavior: Vengeful,
    image_number: 22,
    art_owned: true,
    art: (x: 0.25, y: -1.0, scale: 2.5),
  ),
  FigmentDefinition(
    id: "00000000-0000-4000-8000-000000000003",
    name: Tx("Awakened ✦"),
    character_type: Ember,
    base_spark: 2,
    behavior: Awakened,
    image_number: 33,
  ),
  FigmentDefinition(
    id: "00000000-0000-4000-8000-000000000004",
    name: Tx("Legionnaire"),
    character_type: Warrior,
    base_spark: 1,
    behavior: Legionnaire,
    image_number: 44,
  ),
]
"##
    }

    #[test]
    fn lowers_every_behavior_and_compatibility_sentinel_in_order() {
        let source: Vec<FigmentDefinition> = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let figments = lowered["figments"].as_array().unwrap();

        assert_eq!(figments.len(), 4);
        assert_eq!(figments[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(figments[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(figments[2]["id"].as_str(), Some(THIRD_ID));
        assert_eq!(figments[3]["id"].as_str(), Some(FOURTH_ID));
        assert_eq!(figments[0]["keyword"].as_str(), Some(""));
        assert_eq!(figments[0]["rendered-text"].as_str(), Some(""));
        assert_eq!(figments[1]["keyword"].as_str(), Some("vengeful"));
        assert_eq!(figments[1]["rendered-text"].as_str(), Some("Vengeful"));
        assert_eq!(figments[2]["keyword"].as_str(), Some("awakened"));
        assert_eq!(figments[2]["rendered-text"].as_str(), Some("Awakened"));
        assert_eq!(
            figments[3]["rendered-text"].as_str(),
            Some("This character has +1✦ for each other warrior you control.")
        );
    }

    #[test]
    fn lowers_defaults_optional_art_and_numeric_scalar_forms() {
        let source: Vec<FigmentDefinition> = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let figments = lowered["figments"].as_array().unwrap();

        assert_eq!(figments[0]["art-owned"].as_bool(), Some(false));
        assert!(figments[0].get("art").is_none());
        assert_eq!(figments[1]["art-owned"].as_bool(), Some(true));
        assert_eq!(figments[1]["art"]["x"].as_float(), Some(0.25));
        assert_eq!(figments[1]["art"]["y"].as_integer(), Some(-1));
        assert_eq!(figments[1]["art"]["scale"].as_float(), Some(2.5));
    }

    #[test]
    fn lowers_every_character_type_to_the_exact_compatibility_name() {
        let observed = [
            CharacterType::Warrior,
            CharacterType::Shadow,
            CharacterType::SpiritAnimal,
            CharacterType::Monstrosity,
            CharacterType::Survivor,
            CharacterType::Wraith,
            CharacterType::Ethereal,
            CharacterType::Ember,
            CharacterType::Outsider,
        ]
        .map(CharacterType::compatibility_name);

        assert_eq!(
            observed,
            [
                "Warrior",
                "Shadow",
                "Spirit Animal",
                "Monstrosity",
                "Survivor",
                "Wraith",
                "Ethereal",
                "Ember",
                "Outsider",
            ]
        );
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown = synthetic_source().replace(
            "name: Tx(\"Plain\"),",
            "name: Tx(\"Plain\"), surprise: true,",
        );
        assert!(ron::from_str::<Vec<FigmentDefinition>>(&unknown).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            let source = synthetic_source().replacen(FIRST_ID, invalid, 1);
            assert!(
                ron::from_str::<Vec<FigmentDefinition>>(&source).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[test]
    fn rejects_duplicate_ids_empty_names_and_invalid_art() {
        assert_error_contains(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            "duplicate Figment id",
        );
        assert_error_contains(
            &synthetic_source().replace("name: Tx(\"Plain\")", "name: Tx(\"  \")"),
            "empty name",
        );
        assert_error_contains(
            &synthetic_source().replace("scale: 2.5", "scale: 0.0"),
            "non-positive art scale",
        );
        assert_error_contains(
            &synthetic_source().replace("x: 0.25", "x: NaN"),
            "non-finite art crop",
        );
    }

    fn assert_error_contains(source: &str, expected: &str) {
        let parsed: Vec<FigmentDefinition> = ron::from_str(source).unwrap();
        assert!(
            lower(parsed).unwrap_err().to_string().contains(expected),
            "error did not contain {expected}"
        );
    }
}

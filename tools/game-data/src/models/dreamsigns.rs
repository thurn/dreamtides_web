use std::collections::BTreeSet;
use std::fmt;
use trox::LocalizedString;

use anyhow::{Context, Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::cards::Rarity;
use super::localization::{joined_source_text, source_text};
use super::tides::TideId;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignDefinition {
    pub name: LocalizedString,
    pub id: DreamsignId,
    pub ability_text: Vec<LocalizedString>,
    pub rarity: Rarity,
    pub tide_ids: Vec<TideId>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub art: DreamsignArt,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignArt {
    pub image: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignTagCatalog {
    pub tags: Vec<DreamsignTag>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignTag {
    pub name: String,
    pub color: String,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DreamsignId(Uuid);

impl DreamsignId {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Dreamsign identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err(
                "Dreamsign identifier must use lowercase hyphenated UUID formatting".into(),
            );
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for DreamsignId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for DreamsignId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for DreamsignId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

pub fn lower(definitions: Vec<DreamsignDefinition>) -> Result<toml::Value> {
    validate_definitions(&definitions)?;

    let mut output = Vec::with_capacity(definitions.len());
    for definition in definitions {
        let mut record = toml::map::Map::new();
        record.insert("id".into(), definition.id.to_string().into());
        record.insert("name".into(), source_text(&definition.name)?.into());
        record.insert("image_name".into(), definition.art.image.into());
        record.insert("rarity".into(), definition.rarity.as_compat().into());
        record.insert(
            "tide-ids".into(),
            toml::Value::Array(
                definition
                    .tide_ids
                    .into_iter()
                    .map(|id| id.to_string().into())
                    .collect(),
            ),
        );
        record.insert(
            "rendered-text".into(),
            joined_source_text(definition.ability_text, "\n\n")?.into(),
        );
        record.insert(
            "tags".into(),
            toml::Value::Array(definition.tags.into_iter().map(Into::into).collect()),
        );
        output.push(toml::Value::Table(record));
    }

    Ok(toml::Value::Table(toml::map::Map::from_iter([(
        "dreamsign".into(),
        toml::Value::Array(output),
    )])))
}

pub fn lower_tags(catalog: DreamsignTagCatalog) -> Result<toml::Value> {
    validate_tags(&catalog)?;
    toml::Value::try_from(catalog).context("serialize Dreamsign tag registry")
}

pub fn validate_definitions(definitions: &[DreamsignDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    for definition in definitions {
        if !ids.insert(definition.id) {
            bail!("duplicate Dreamsign id: {}", definition.id);
        }
        if source_text(&definition.name)?.trim().is_empty() {
            bail!("Dreamsign {} has an empty name", definition.id);
        }
        if definition.art.image.trim().is_empty() {
            bail!("Dreamsign {} has an empty art.image", definition.id);
        }
        if !matches!(
            definition.rarity,
            Rarity::Common | Rarity::Uncommon | Rarity::Rare | Rarity::Legendary
        ) {
            bail!("Dreamsign {} has a non-pool rarity", definition.id);
        }
        if definition.tide_ids.is_empty() || definition.tide_ids.len() > 3 {
            bail!(
                "Dreamsign {} must declare between one and three tides",
                definition.id
            );
        }
        let mut tide_ids = BTreeSet::new();
        for tide_id in &definition.tide_ids {
            if !tide_ids.insert(*tide_id) {
                bail!("Dreamsign {} repeats Tide UUID {tide_id}", definition.id);
            }
        }
        validate_labels(definition.id, "tags", &definition.tags)?;
        for (index, ability) in definition.ability_text.iter().enumerate() {
            if source_text(ability)?.trim().is_empty() {
                bail!(
                    "Dreamsign {} ability_text[{index}] must be non-empty",
                    definition.id
                );
            }
        }
    }
    Ok(())
}

pub fn validate_tide_references(
    definitions: &[DreamsignDefinition],
    known_tide_ids: &BTreeSet<String>,
) -> Result<()> {
    validate_definitions(definitions)?;
    for definition in definitions {
        for tide_id in &definition.tide_ids {
            if !known_tide_ids.contains(&tide_id.to_string()) {
                bail!(
                    "Dreamsign {} references unknown Tide UUID {tide_id}",
                    definition.id
                );
            }
        }
    }
    Ok(())
}

pub fn validate_tags(catalog: &DreamsignTagCatalog) -> Result<()> {
    let mut names = BTreeSet::new();
    for tag in &catalog.tags {
        if tag.name.trim().is_empty() {
            bail!("Dreamsign tag name must not be empty");
        }
        if !names.insert(tag.name.as_str()) {
            bail!("duplicate Dreamsign tag name: {}", tag.name);
        }
        let bytes = tag.color.as_bytes();
        if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
            bail!("Dreamsign tag {} has invalid color {}", tag.name, tag.color);
        }
    }
    Ok(())
}

fn validate_labels(id: DreamsignId, field: &str, values: &[String]) -> Result<()> {
    let mut unique = BTreeSet::new();
    for value in values {
        if value.trim().is_empty() {
            bail!("internal metadata for Dreamsign {id} has an empty {field} value");
        }
        if !unique.insert(value) {
            bail!("internal metadata for Dreamsign {id} repeats {field} value {value:?}");
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
    const TIDE_ONE: &str = "00000000-0000-4000-8000-000000000101";
    const TIDE_TWO: &str = "00000000-0000-4000-8000-000000000102";

    fn synthetic_definitions() -> &'static str {
        r##"#![enable(implicit_some)]
[
  DreamsignDefinition(
    name: Tx("Límbø Sign"),
    id: "00000000-0000-4000-8000-000000000001",
    ability_text: [Tx("First paragraph with ✦."), Tx("Second paragraph.")],
    rarity: Rare,
    tide_ids: [
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ],
    tags: ["first", "second"],
    art: (image: "first.png"),
  ),
  DreamsignDefinition(
    name: Tx("Blank Sign"),
    id: "00000000-0000-4000-8000-000000000002",
    ability_text: [],
    rarity: Common,
    tide_ids: ["00000000-0000-4000-8000-000000000102"],
    art: (image: "blank.png"),
  ),
]
"##
    }

    fn fixture() -> Vec<DreamsignDefinition> {
        ron::from_str(synthetic_definitions()).unwrap()
    }

    #[test]
    fn lowers_ordered_definitions_abilities_rarities_tides_and_tags() {
        let output = lower(fixture()).unwrap();
        let records = output["dreamsign"].as_array().unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(records[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            records[0]["rendered-text"].as_str(),
            Some("First paragraph with ✦.\n\nSecond paragraph.")
        );
        assert_eq!(records[1]["rendered-text"].as_str(), Some(""));
        assert_eq!(records[0]["rarity"].as_str(), Some("Rare"));
        assert_eq!(records[0]["tide-ids"][1].as_str(), Some(TIDE_TWO));
        assert_eq!(records[1]["tide-ids"][0].as_str(), Some(TIDE_TWO));
        assert_eq!(records[1]["tags"].as_array().unwrap().len(), 0);
        assert_eq!(
            records[0].as_table().unwrap().keys().collect::<Vec<_>>(),
            vec![
                "id",
                "name",
                "image_name",
                "rarity",
                "tide-ids",
                "rendered-text",
                "tags"
            ]
        );
    }

    #[test]
    fn lowers_and_validates_tag_registry() {
        let catalog = DreamsignTagCatalog {
            tags: vec![DreamsignTag {
                name: "tempo".into(),
                color: "#aabbcc".into(),
            }],
        };
        assert_eq!(
            lower_tags(catalog).unwrap()["tags"][0]["name"].as_str(),
            Some("tempo")
        );
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_ids() {
        let unknown = synthetic_definitions().replace(
            "name: Tx(\"Límbø Sign\"),",
            "name: Tx(\"Límbø Sign\"), surprise: true,",
        );
        assert!(ron::from_str::<Vec<DreamsignDefinition>>(&unknown).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        ] {
            assert!(ron::from_str::<DreamsignId>(&format!("\"{invalid}\"")).is_err());
        }
    }

    #[test]
    fn rejects_duplicate_ids_invalid_rarity_tides_and_labels() {
        let mut definitions = fixture();
        definitions[1].id = definitions[0].id;
        assert!(
            lower(definitions)
                .unwrap_err()
                .to_string()
                .contains("duplicate Dreamsign id")
        );

        let mut definitions = fixture();
        definitions[0].rarity = Rarity::Special;
        assert!(
            lower(definitions)
                .unwrap_err()
                .to_string()
                .contains("non-pool rarity")
        );

        let mut definitions = fixture();
        definitions[0].tide_ids.clear();
        assert!(
            lower(definitions)
                .unwrap_err()
                .to_string()
                .contains("between one and three tides")
        );

        let mut definitions = fixture();
        definitions[0].tide_ids = vec![
            TideId::parse(TIDE_ONE).unwrap(),
            TideId::parse(TIDE_ONE).unwrap(),
        ];
        assert!(
            lower(definitions)
                .unwrap_err()
                .to_string()
                .contains("repeats Tide UUID")
        );

        let mut definitions = fixture();
        definitions[0].tags = vec!["duplicate".into(), "duplicate".into()];
        assert!(
            lower(definitions)
                .unwrap_err()
                .to_string()
                .contains("repeats tags value")
        );

        let known = BTreeSet::from([TIDE_ONE.to_owned()]);
        assert!(
            validate_tide_references(&fixture(), &known)
                .unwrap_err()
                .to_string()
                .contains("unknown Tide UUID")
        );
    }
}

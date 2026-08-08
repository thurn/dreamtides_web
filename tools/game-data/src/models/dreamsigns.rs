use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Context, Result, bail};
use indexmap::IndexMap;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignDefinition {
    pub name: String,
    pub id: DreamsignId,
    pub ability_text: Vec<String>,
    pub art: DreamsignArt,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignArt {
    pub image: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignMetadataCatalog {
    pub dreamsigns: IndexMap<DreamsignId, DreamsignMetadata>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignMetadata {
    /// `None` preserves a missing compatibility field; an empty list preserves an explicit empty field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tides: Option<Vec<String>>,
    pub tags: Vec<String>,
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

pub fn lower(
    definitions: Vec<DreamsignDefinition>,
    mut metadata: DreamsignMetadataCatalog,
) -> Result<toml::Value> {
    validate_definitions(&definitions)?;
    validate_metadata(&metadata)?;

    let mut output = Vec::with_capacity(definitions.len());
    for definition in definitions {
        let internal = metadata
            .dreamsigns
            .shift_remove(&definition.id)
            .with_context(|| {
                format!("missing internal metadata for Dreamsign {}", definition.id)
            })?;

        let mut record = toml::map::Map::new();
        record.insert("id".into(), definition.id.to_string().into());
        record.insert("name".into(), definition.name.into());
        record.insert("image_name".into(), definition.art.image.into());
        if let Some(tides) = internal.tides {
            record.insert(
                "tides".into(),
                toml::Value::Array(tides.into_iter().map(Into::into).collect()),
            );
        }
        record.insert(
            "rendered-text".into(),
            definition.ability_text.join("\n\n").into(),
        );
        record.insert(
            "tags".into(),
            toml::Value::Array(internal.tags.into_iter().map(Into::into).collect()),
        );
        output.push(toml::Value::Table(record));
    }

    if let Some(id) = metadata.dreamsigns.keys().next() {
        bail!("internal metadata references unknown Dreamsign {id}");
    }

    Ok(toml::Value::Table(toml::map::Map::from_iter([(
        "dreamsign".into(),
        toml::Value::Array(output),
    )])))
}

pub fn lower_metadata(metadata: DreamsignMetadataCatalog) -> Result<toml::Value> {
    validate_metadata(&metadata)?;
    toml::Value::try_from(metadata).context("serialize internal Dreamsign metadata")
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
        for (field, value) in [
            ("name", &definition.name),
            ("art.image", &definition.art.image),
        ] {
            if value.trim().is_empty() {
                bail!("Dreamsign {} has an empty {field}", definition.id);
            }
        }
        for (index, ability) in definition.ability_text.iter().enumerate() {
            if ability.trim().is_empty() {
                bail!(
                    "Dreamsign {} ability_text[{index}] must be non-empty",
                    definition.id
                );
            }
        }
    }
    Ok(())
}

pub fn validate_metadata(metadata: &DreamsignMetadataCatalog) -> Result<()> {
    for (id, entry) in &metadata.dreamsigns {
        if let Some(tides) = &entry.tides {
            validate_labels(*id, "tides", tides)?;
        }
        validate_labels(*id, "tags", &entry.tags)?;
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

    fn synthetic_definitions() -> &'static str {
        r##"#![enable(implicit_some)]
[
  DreamsignDefinition(
    name: "Límbø Sign",
    id: "00000000-0000-4000-8000-000000000001",
    ability_text: ["First paragraph with ✦.", "Second paragraph."],
    art: (image: "first.png"),
  ),
  DreamsignDefinition(
    name: "Blank Sign",
    id: "00000000-0000-4000-8000-000000000002",
    ability_text: [],
    art: (image: "blank.png"),
  ),
]
"##
    }

    fn synthetic_metadata() -> &'static str {
        r##"#![enable(implicit_some)]
(
  dreamsigns: {
    "00000000-0000-4000-8000-000000000001": (
      tides: ["first_tide", "second_tide"],
      tags: ["first", "second"],
    ),
    "00000000-0000-4000-8000-000000000002": (tags: []),
  },
)
"##
    }

    fn fixture() -> (Vec<DreamsignDefinition>, DreamsignMetadataCatalog) {
        (
            ron::from_str(synthetic_definitions()).unwrap(),
            ron::from_str(synthetic_metadata()).unwrap(),
        )
    }

    #[test]
    fn lowers_ordered_definitions_abilities_and_internal_metadata() {
        let (definitions, metadata) = fixture();
        let output = lower(definitions, metadata).unwrap();
        let records = output["dreamsign"].as_array().unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(records[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            records[0]["rendered-text"].as_str(),
            Some("First paragraph with ✦.\n\nSecond paragraph.")
        );
        assert_eq!(records[1]["rendered-text"].as_str(), Some(""));
        assert_eq!(records[0]["tides"][1].as_str(), Some("second_tide"));
        assert!(records[1].get("tides").is_none());
        assert_eq!(records[1]["tags"].as_array().unwrap().len(), 0);
        assert_eq!(
            records[0].as_table().unwrap().keys().collect::<Vec<_>>(),
            vec!["id", "name", "image_name", "tides", "rendered-text", "tags"]
        );
    }

    #[test]
    fn preserves_an_explicit_empty_tides_field() {
        let (definitions, mut metadata) = fixture();
        metadata
            .dreamsigns
            .get_mut(&definitions[1].id)
            .unwrap()
            .tides = Some(vec![]);
        let output = lower(definitions, metadata).unwrap();
        assert_eq!(output["dreamsign"][1]["tides"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_ids() {
        let unknown = synthetic_definitions().replace(
            "name: \"Límbø Sign\",",
            "name: \"Límbø Sign\", surprise: true,",
        );
        assert!(ron::from_str::<Vec<DreamsignDefinition>>(&unknown).is_err());
        let unknown_metadata = synthetic_metadata().replace(
            "tags: [\"first\", \"second\"],",
            "tags: [\"first\", \"second\"], surprise: true,",
        );
        assert!(ron::from_str::<DreamsignMetadataCatalog>(&unknown_metadata).is_err());

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
    fn rejects_duplicate_ids_missing_or_unknown_metadata_and_invalid_labels() {
        let (mut definitions, metadata) = fixture();
        definitions[1].id = definitions[0].id;
        assert!(
            lower(definitions, metadata.clone())
                .unwrap_err()
                .to_string()
                .contains("duplicate Dreamsign id")
        );

        let (definitions, mut missing) = fixture();
        missing.dreamsigns.shift_remove(&definitions[0].id);
        assert!(
            lower(definitions, missing)
                .unwrap_err()
                .to_string()
                .contains("missing internal metadata")
        );

        let (mut definitions, metadata) = fixture();
        definitions.truncate(1);
        assert!(
            lower(definitions, metadata)
                .unwrap_err()
                .to_string()
                .contains("references unknown Dreamsign")
        );

        let (definitions, mut metadata) = fixture();
        metadata
            .dreamsigns
            .get_mut(&definitions[0].id)
            .unwrap()
            .tags = vec!["duplicate".into(), "duplicate".into()];
        assert!(
            lower(definitions, metadata)
                .unwrap_err()
                .to_string()
                .contains("repeats tags value")
        );
    }
}

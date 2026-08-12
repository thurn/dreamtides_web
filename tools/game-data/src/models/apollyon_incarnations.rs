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
pub struct ApollyonIncarnation {
    pub id: IncarnationId,
    pub title: LocalizedString,
    pub description: LocalizedString,
    pub deck_archetype: LocalizedString,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct IncarnationId(Uuid);

impl IncarnationId {
    fn parse(value: &str) -> Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("identifier must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for IncarnationId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for IncarnationId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for IncarnationId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

#[derive(Serialize)]
struct CompatibilityCatalog {
    incarnations: Vec<CompatibilityIncarnation>,
}

#[derive(Serialize)]
struct CompatibilityIncarnation {
    id: String,
    title: String,
    description: String,
    #[serde(rename = "deck-type")]
    deck_type: String,
}

pub fn lower(source: Vec<ApollyonIncarnation>) -> Result<toml::Value> {
    validate(&source)?;
    let incarnations = source
        .into_iter()
        .map(|incarnation| {
            Ok(CompatibilityIncarnation {
                id: incarnation.id.to_string(),
                title: source_text(&incarnation.title)?,
                description: source_text(&incarnation.description)?,
                deck_type: source_text(&incarnation.deck_archetype)?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog {
        incarnations,
    })?)
}

fn validate(source: &[ApollyonIncarnation]) -> Result<()> {
    let mut ids = BTreeSet::new();
    for incarnation in source {
        if !ids.insert(incarnation.id) {
            bail!("duplicate Apollyon incarnation id: {}", incarnation.id);
        }
        for (field, value) in [
            ("title", &incarnation.title),
            ("description", &incarnation.description),
            ("deck_archetype", &incarnation.deck_archetype),
        ] {
            if source_text(value)?.trim().is_empty() {
                bail!(
                    "Apollyon incarnation {} has an empty {field}",
                    incarnation.id
                );
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

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
[
  ApollyonIncarnation(
    id: "00000000-0000-4000-8000-000000000001",
    title: Tx("First title"),
    description: Tx("First description"),
    deck_archetype: Tx("First archetype"),
  ),
  ApollyonIncarnation(
    id: "00000000-0000-4000-8000-000000000002",
    title: Tx("Second title"),
    description: Tx("Second description"),
    deck_archetype: Tx("Second archetype"),
  ),
]
"##
    }

    #[test]
    fn lowers_ordered_records_to_the_compatibility_contract() {
        let source: Vec<ApollyonIncarnation> = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let incarnations = lowered["incarnations"].as_array().unwrap();

        assert_eq!(incarnations.len(), 2);
        assert_eq!(incarnations[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(incarnations[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            incarnations[0]["deck-type"].as_str(),
            Some("First archetype")
        );
        assert!(incarnations[0].get("deck_archetype").is_none());
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown = synthetic_source().replace(
            "title: Tx(\"First title\"),",
            "title: Tx(\"First title\"), surprise: true,",
        );
        assert!(ron::from_str::<Vec<ApollyonIncarnation>>(&unknown).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            let source = synthetic_source().replacen(FIRST_ID, invalid, 1);
            assert!(
                ron::from_str::<Vec<ApollyonIncarnation>>(&source).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[test]
    fn rejects_duplicate_ids_and_empty_fields() {
        let duplicate = synthetic_source().replace(SECOND_ID, FIRST_ID);
        assert!(
            lower(ron::from_str(&duplicate).unwrap())
                .unwrap_err()
                .to_string()
                .contains("duplicate Apollyon incarnation id")
        );

        for (source, field) in [
            (synthetic_source().replace("First title", "   "), "title"),
            (
                synthetic_source().replace("First description", ""),
                "description",
            ),
            (
                synthetic_source().replace("First archetype", "\n"),
                "deck_archetype",
            ),
        ] {
            assert!(
                lower(ron::from_str(&source).unwrap())
                    .unwrap_err()
                    .to_string()
                    .contains(field)
            );
        }
    }
}

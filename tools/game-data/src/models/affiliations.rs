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
pub struct AffiliationCatalog {
    pub affiliations: Vec<AffiliationDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AffiliationDefinition {
    pub id: CanonicalUuid,
    pub name: LocalizedString,
    pub atlas_card_theme: LocalizedString,
    pub tide_ids: Vec<CanonicalUuid>,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CanonicalUuid(Uuid);

impl CanonicalUuid {
    pub fn as_hyphenated(self) -> String {
        self.0.hyphenated().to_string()
    }

    pub fn parse(value: &str) -> Result<Self, String> {
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

impl fmt::Display for CanonicalUuid {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for CanonicalUuid {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for CanonicalUuid {
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
    affiliations: Vec<CompatibilityAffiliation>,
}

#[derive(Serialize)]
struct CompatibilityAffiliation {
    id: String,
    name: String,
    #[serde(rename = "atlas-card-theme")]
    atlas_card_theme: String,
    #[serde(rename = "tide-ids")]
    tide_ids: Vec<String>,
}

pub fn lower(source: AffiliationCatalog) -> Result<toml::Value> {
    validate(&source)?;
    let affiliations = source
        .affiliations
        .into_iter()
        .map(|affiliation| {
            Ok(CompatibilityAffiliation {
                id: affiliation.id.as_hyphenated(),
                name: source_text(&affiliation.name)?,
                atlas_card_theme: source_text(&affiliation.atlas_card_theme)?,
                tide_ids: affiliation
                    .tide_ids
                    .into_iter()
                    .map(CanonicalUuid::as_hyphenated)
                    .collect(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog {
        affiliations,
    })?)
}

pub fn validate(source: &AffiliationCatalog) -> Result<()> {
    let mut ids = BTreeSet::new();
    for affiliation in &source.affiliations {
        if !ids.insert(affiliation.id) {
            bail!("duplicate affiliation id: {}", affiliation.id);
        }
        if source_text(&affiliation.name)?.trim().is_empty() {
            bail!("affiliation {} has an empty name", affiliation.id);
        }
        if source_text(&affiliation.atlas_card_theme)?
            .trim()
            .is_empty()
        {
            bail!(
                "affiliation {} has an empty atlas card theme",
                affiliation.id
            );
        }
        if affiliation.tide_ids.len() != 3 {
            bail!("affiliation {} must declare exactly three tides", affiliation.id);
        }
        let mut tide_ids = BTreeSet::new();
        for tide_id in &affiliation.tide_ids {
            if !tide_ids.insert(*tide_id) {
                bail!(
                    "affiliation {} repeats tide id {}",
                    affiliation.id,
                    tide_id
                );
            }
        }
    }
    Ok(())
}

pub fn validate_tide_references(
    source: &AffiliationCatalog,
    known_tide_ids: &BTreeSet<String>,
) -> Result<()> {
    validate(source)?;
    for affiliation in &source.affiliations {
        for tide_id in &affiliation.tide_ids {
            if !known_tide_ids.contains(&tide_id.to_string()) {
                bail!("affiliation {} references unknown Tide UUID {tide_id}", affiliation.id);
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
    const TIDE_ONE: &str = "00000000-0000-4000-8000-000000000101";
    const TIDE_TWO: &str = "00000000-0000-4000-8000-000000000102";
    const TIDE_THREE: &str = "00000000-0000-4000-8000-000000000103";
    const TIDE_FOUR: &str = "00000000-0000-4000-8000-000000000104";

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
AffiliationCatalog(
  affiliations: [
    AffiliationDefinition(
      id: "00000000-0000-4000-8000-000000000001",
      name: Tx("First"),
      atlas_card_theme: Tx("One"),
      tide_ids: [
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000102",
        "00000000-0000-4000-8000-000000000103",
      ],
    ),
    AffiliationDefinition(
      id: "00000000-0000-4000-8000-000000000002",
      name: Tx("Second"),
      atlas_card_theme: Tx("Two"),
      tide_ids: [
        "00000000-0000-4000-8000-000000000102",
        "00000000-0000-4000-8000-000000000103",
        "00000000-0000-4000-8000-000000000104",
      ],
    ),
  ],
)
"##
    }

    #[test]
    fn lowers_ordered_records_and_tide_ids() {
        let source: AffiliationCatalog = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let affiliations = lowered["affiliations"].as_array().unwrap();
        assert_eq!(affiliations.len(), 2);
        assert_eq!(affiliations[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(affiliations[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            affiliations[0]["tide-ids"].as_array().unwrap(),
            &vec![
                toml::Value::String(TIDE_ONE.into()),
                toml::Value::String(TIDE_TWO.into()),
                toml::Value::String(TIDE_THREE.into())
            ]
        );
        assert_eq!(affiliations[1]["tide-ids"][2].as_str(), Some(TIDE_FOUR));
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown = synthetic_source().replace(
            "name: Tx(\"First\"),",
            "name: Tx(\"First\"), surprise: true,",
        );
        assert!(ron::from_str::<AffiliationCatalog>(&unknown).is_err());
        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            let source = synthetic_source().replacen(FIRST_ID, invalid, 1);
            assert!(
                ron::from_str::<AffiliationCatalog>(&source).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[test]
    fn rejects_duplicate_ids_and_invalid_records() {
        let duplicate_id = synthetic_source().replace(SECOND_ID, FIRST_ID);
        assert!(
            lower(ron::from_str(&duplicate_id).unwrap())
                .unwrap_err()
                .to_string()
                .contains("duplicate affiliation id")
        );

        let duplicate_tide = synthetic_source().replacen(TIDE_TWO, TIDE_ONE, 1);
        assert!(
            lower(ron::from_str(&duplicate_tide).unwrap())
                .unwrap_err()
                .to_string()
                .contains("repeats tide id")
        );

        let too_few = synthetic_source().replacen(
            "        \"00000000-0000-4000-8000-000000000103\",\n",
            "",
            1,
        );
        assert!(
            lower(ron::from_str(&too_few).unwrap())
                .unwrap_err()
                .to_string()
                .contains("exactly three tides")
        );

        let empty_name = synthetic_source().replace("name: Tx(\"First\")", "name: Tx(\"  \")");
        assert!(
            lower(ron::from_str(&empty_name).unwrap())
                .unwrap_err()
                .to_string()
                .contains("empty name")
        );
    }
}

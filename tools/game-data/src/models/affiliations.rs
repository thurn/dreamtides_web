use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AffiliationCatalog {
    pub default_random_draw_max_multiplier: f64,
    pub default_opponent_deck_max_multiplier: f64,
    pub affiliations: Vec<AffiliationDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AffiliationDefinition {
    pub id: CanonicalUuid,
    pub name: String,
    pub atlas_card_theme: String,
    pub signature_card_ids: Vec<CanonicalUuid>,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CanonicalUuid(Uuid);

impl CanonicalUuid {
    pub fn as_hyphenated(self) -> String {
        self.0.hyphenated().to_string()
    }

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
    #[serde(rename = "signature-cards")]
    signature_cards: Vec<String>,
    #[serde(rename = "weight-strength")]
    weight_strength: f64,
    #[serde(rename = "opponent-bias-strength")]
    opponent_bias_strength: f64,
}

pub fn lower(source: AffiliationCatalog) -> Result<toml::Value> {
    validate(&source)?;
    let affiliations = source
        .affiliations
        .into_iter()
        .map(|affiliation| CompatibilityAffiliation {
            id: affiliation.id.as_hyphenated(),
            name: affiliation.name,
            atlas_card_theme: affiliation.atlas_card_theme,
            signature_cards: affiliation
                .signature_card_ids
                .into_iter()
                .map(CanonicalUuid::as_hyphenated)
                .collect(),
            weight_strength: source.default_random_draw_max_multiplier,
            opponent_bias_strength: source.default_opponent_deck_max_multiplier,
        })
        .collect();
    Ok(toml::Value::try_from(CompatibilityCatalog {
        affiliations,
    })?)
}

fn validate(source: &AffiliationCatalog) -> Result<()> {
    validate_multiplier(
        "default_random_draw_max_multiplier",
        source.default_random_draw_max_multiplier,
    )?;
    validate_multiplier(
        "default_opponent_deck_max_multiplier",
        source.default_opponent_deck_max_multiplier,
    )?;

    let mut ids = BTreeSet::new();
    for affiliation in &source.affiliations {
        if !ids.insert(affiliation.id) {
            bail!("duplicate affiliation id: {}", affiliation.id);
        }
        if affiliation.name.trim().is_empty() {
            bail!("affiliation {} has an empty name", affiliation.id);
        }
        if affiliation.atlas_card_theme.trim().is_empty() {
            bail!(
                "affiliation {} has an empty atlas card theme",
                affiliation.id
            );
        }
        if affiliation.signature_card_ids.is_empty() {
            bail!("affiliation {} has no signature cards", affiliation.id);
        }
        let mut signature_ids = BTreeSet::new();
        for signature_id in &affiliation.signature_card_ids {
            if !signature_ids.insert(*signature_id) {
                bail!(
                    "affiliation {} repeats signature card id {}",
                    affiliation.id,
                    signature_id
                );
            }
        }
    }
    Ok(())
}

fn validate_multiplier(field: &str, value: f64) -> Result<()> {
    if !value.is_finite() || value < 1.0 {
        bail!("{field} must be a finite number greater than or equal to 1.0");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";
    const CARD_ONE: &str = "00000000-0000-4000-8000-000000000101";
    const CARD_TWO: &str = "00000000-0000-4000-8000-000000000102";

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
AffiliationCatalog(
  default_random_draw_max_multiplier: 1.25,
  default_opponent_deck_max_multiplier: 3.5,
  affiliations: [
    AffiliationDefinition(
      id: "00000000-0000-4000-8000-000000000001",
      name: "First",
      atlas_card_theme: "One",
      signature_card_ids: [
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000102",
      ],
    ),
    AffiliationDefinition(
      id: "00000000-0000-4000-8000-000000000002",
      name: "Second",
      atlas_card_theme: "Two",
      signature_card_ids: ["00000000-0000-4000-8000-000000000102"],
    ),
  ],
)
"##
    }

    #[test]
    fn lowers_ordered_records_and_expands_catalog_defaults() {
        let source: AffiliationCatalog = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let affiliations = lowered["affiliations"].as_array().unwrap();
        assert_eq!(affiliations.len(), 2);
        assert_eq!(affiliations[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(affiliations[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            affiliations[0]["signature-cards"].as_array().unwrap(),
            &vec![
                toml::Value::String(CARD_ONE.into()),
                toml::Value::String(CARD_TWO.into())
            ]
        );
        for affiliation in affiliations {
            assert_eq!(affiliation["weight-strength"].as_float(), Some(1.25));
            assert_eq!(affiliation["opponent-bias-strength"].as_float(), Some(3.5));
        }
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown =
            synthetic_source().replace("name: \"First\",", "name: \"First\", surprise: true,");
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
    fn rejects_duplicate_ids_invalid_defaults_and_invalid_records() {
        let duplicate_id = synthetic_source().replace(SECOND_ID, FIRST_ID);
        assert!(
            lower(ron::from_str(&duplicate_id).unwrap())
                .unwrap_err()
                .to_string()
                .contains("duplicate affiliation id")
        );

        let duplicate_signature = synthetic_source().replacen(CARD_TWO, CARD_ONE, 1);
        assert!(
            lower(ron::from_str(&duplicate_signature).unwrap())
                .unwrap_err()
                .to_string()
                .contains("repeats signature card id")
        );

        let invalid_multiplier = synthetic_source().replace("1.25", "0.75");
        assert!(
            lower(ron::from_str(&invalid_multiplier).unwrap())
                .unwrap_err()
                .to_string()
                .contains("greater than or equal to 1.0")
        );

        let empty_name = synthetic_source().replace("name: \"First\"", "name: \"  \"");
        assert!(
            lower(ron::from_str(&empty_name).unwrap())
                .unwrap_err()
                .to_string()
                .contains("empty name")
        );
    }
}

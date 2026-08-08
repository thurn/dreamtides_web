use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Result, bail, ensure};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamwellCardDefinition {
    pub id: DreamwellCardId,
    pub catalog_number: u32,
    pub name: String,
    pub rules_text: String,
    pub deck_tier: DeckTier,
    pub energy_added: u32,
    pub artwork: Artwork,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum DeckTier {
    Starting,
    One,
    Two,
    Three,
    Four,
}

impl DeckTier {
    fn compatibility_order(self) -> u8 {
        match self {
            Self::Starting => 0,
            Self::One => 1,
            Self::Two => 2,
            Self::Three => 3,
            Self::Four => 4,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Artwork {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<u32>,
    pub is_owned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop: Option<ArtCrop>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ArtCrop {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DreamwellCardId(Uuid);

impl DreamwellCardId {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Dreamwell card identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err(
                "Dreamwell card identifier must use lowercase hyphenated UUID formatting".into(),
            );
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for DreamwellCardId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for DreamwellCardId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for DreamwellCardId {
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
    dreamwell: Vec<CompatibilityCard>,
}

#[derive(Serialize)]
struct CompatibilityCard {
    name: String,
    id: String,
    #[serde(rename = "rendered-text")]
    rendered_text: String,
    order: u8,
    #[serde(rename = "energy-added")]
    energy_added: u32,
    #[serde(rename = "card-type")]
    card_type: &'static str,
    #[serde(rename = "image-number", skip_serializing_if = "Option::is_none")]
    image_number: Option<u32>,
    #[serde(rename = "art-owned")]
    art_owned: bool,
    #[serde(rename = "card-number")]
    card_number: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    art: Option<CompatibilityArtCrop>,
}

#[derive(Serialize)]
struct CompatibilityArtCrop {
    x: toml::Value,
    y: toml::Value,
    scale: toml::Value,
}

pub fn lower(source: Vec<DreamwellCardDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let dreamwell = source
        .into_iter()
        .map(|card| CompatibilityCard {
            name: card.name,
            id: card.id.to_string(),
            rendered_text: card.rules_text,
            order: card.deck_tier.compatibility_order(),
            energy_added: card.energy_added,
            card_type: "Dreamwell",
            image_number: card.artwork.image,
            art_owned: card.artwork.is_owned,
            card_number: card.catalog_number,
            art: card.artwork.crop.map(|crop| CompatibilityArtCrop {
                x: compatibility_number(crop.x),
                y: compatibility_number(crop.y),
                scale: compatibility_number(crop.scale),
            }),
        })
        .collect();
    Ok(toml::Value::try_from(CompatibilityCatalog { dreamwell })?)
}

fn compatibility_number(value: f64) -> toml::Value {
    if value.fract() == 0.0 && value >= i64::MIN as f64 && value <= i64::MAX as f64 {
        toml::Value::Integer(value as i64)
    } else {
        toml::Value::Float(value)
    }
}

fn validate(source: &[DreamwellCardDefinition]) -> Result<()> {
    ensure!(!source.is_empty(), "Dreamwell catalog must not be empty");
    let mut ids = BTreeSet::new();
    let mut catalog_numbers = BTreeSet::new();

    for card in source {
        ensure!(
            ids.insert(card.id),
            "duplicate Dreamwell card id: {}",
            card.id
        );
        ensure!(
            card.catalog_number > 0,
            "Dreamwell card {} catalog number must be greater than zero",
            card.id
        );
        ensure!(
            catalog_numbers.insert(card.catalog_number),
            "duplicate Dreamwell catalog number: {}",
            card.catalog_number
        );
        ensure!(
            !card.name.trim().is_empty(),
            "Dreamwell card {} has an empty name",
            card.id
        );
        if let Some(crop) = &card.artwork.crop {
            if card.artwork.image.is_none() {
                bail!(
                    "Dreamwell card {} has an art crop without an image",
                    card.id
                );
            }
            ensure!(
                crop.x.is_finite() && crop.y.is_finite(),
                "Dreamwell card {} art crop offsets must be finite",
                card.id
            );
            ensure!(
                crop.scale.is_finite() && crop.scale > 0.0,
                "Dreamwell card {} art crop scale must be finite and positive",
                card.id
            );
        }
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

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
[
  DreamwellCardDefinition(
    id: "00000000-0000-4000-8000-000000000001",
    catalog_number: 7,
    name: "Première lumière",
    rules_text: "Draw a card.\nThen gain 1●.",
    deck_tier: Starting,
    energy_added: 2,
    artwork: (
      image: 42,
      is_owned: true,
      crop: (x: -0.25, y: 0.5, scale: 1.2),
    ),
  ),

  DreamwellCardDefinition(
    id: "00000000-0000-4000-8000-000000000002",
    catalog_number: 11,
    name: "Second",
    rules_text: "",
    deck_tier: Four,
    energy_added: 0,
    artwork: (is_owned: false),
  ),
]
"##
    }

    #[test]
    fn lowers_ordered_cards_and_compatibility_fields() {
        let source: Vec<DreamwellCardDefinition> = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let cards = lowered["dreamwell"].as_array().unwrap();

        assert_eq!(cards.len(), 2);
        assert_eq!(cards[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(cards[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(cards[0]["name"].as_str(), Some("Première lumière"));
        assert_eq!(
            cards[0]["rendered-text"].as_str(),
            Some("Draw a card.\nThen gain 1●.")
        );
        assert_eq!(cards[0]["order"].as_integer(), Some(0));
        assert_eq!(cards[1]["order"].as_integer(), Some(4));
        assert_eq!(cards[0]["energy-added"].as_integer(), Some(2));
        assert_eq!(cards[0]["card-type"].as_str(), Some("Dreamwell"));
        assert_eq!(cards[0]["image-number"].as_integer(), Some(42));
        assert_eq!(cards[0]["art-owned"].as_bool(), Some(true));
        assert_eq!(cards[0]["card-number"].as_integer(), Some(7));
        assert_eq!(cards[0]["art"]["x"].as_float(), Some(-0.25));
        assert_eq!(cards[0]["art"]["y"].as_float(), Some(0.5));
        assert_eq!(cards[0]["art"]["scale"].as_float(), Some(1.2));
        assert!(cards[1].get("image-number").is_none());
        assert!(cards[1].get("art").is_none());
        assert!(cards[0].get("catalog_number").is_none());
        assert!(cards[0].get("deck_tier").is_none());
        assert!(cards[0].get("artwork").is_none());
    }

    #[test]
    fn deck_tiers_exhaustively_preserve_compatibility_orders() {
        let cases = [
            (DeckTier::Starting, 0),
            (DeckTier::One, 1),
            (DeckTier::Two, 2),
            (DeckTier::Three, 3),
            (DeckTier::Four, 4),
        ];
        for (tier, order) in cases {
            assert_eq!(tier.compatibility_order(), order);
        }
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown =
            synthetic_source().replace("catalog_number: 7,", "catalog_number: 7, surprise: true,");
        assert!(ron::from_str::<Vec<DreamwellCardDefinition>>(&unknown).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-8000-00000000000A",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            let source = synthetic_source().replacen(FIRST_ID, invalid, 1);
            assert!(
                ron::from_str::<Vec<DreamwellCardDefinition>>(&source).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[test]
    fn rejects_duplicate_and_invalid_catalog_values() {
        assert_lower_error(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            "duplicate Dreamwell card id",
        );
        assert_lower_error(
            &synthetic_source().replace("catalog_number: 11", "catalog_number: 7"),
            "duplicate Dreamwell catalog number",
        );
        assert_lower_error(
            &synthetic_source().replace("catalog_number: 7", "catalog_number: 0"),
            "catalog number must be greater than zero",
        );
        assert_lower_error(
            &synthetic_source().replace("name: \"Première lumière\"", "name: \"   \""),
            "empty name",
        );
        assert_lower_error(
            &synthetic_source().replace("image: 42,", "image: None,"),
            "art crop without an image",
        );
        assert_lower_error(
            &synthetic_source().replace("scale: 1.2", "scale: 0.0"),
            "scale must be finite and positive",
        );
    }

    fn assert_lower_error(source: &str, expected: &str) {
        let parsed: Vec<DreamwellCardDefinition> = ron::from_str(source).unwrap();
        assert!(
            lower(parsed).unwrap_err().to_string().contains(expected),
            "error did not contain {expected}"
        );
    }

    #[test]
    #[ignore = "real-catalog parity probe retained for canonical Dreamwell review"]
    fn canonical_candidate_matches_current_compatibility_sources() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let current_ron: CompatDocument =
            ron::from_str(&fs::read_to_string(root.join("data/dreamwell.ron")).unwrap()).unwrap();
        let current_toml: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/dreamwell.toml")).unwrap()).unwrap();
        assert_eq!(current_ron.data, current_toml);

        let canonical: Vec<DreamwellCardDefinition> =
            ron::from_str(&fs::read_to_string(root.join("data/dreamwell_canonical.ron")).unwrap())
                .unwrap();
        let lowered = lower(canonical.clone()).unwrap();
        assert_eq!(
            normalize_table_order(lowered),
            normalize_table_order(current_ron.data.clone())
        );

        let compatibility_cards = current_ron.data["dreamwell"].as_array().unwrap();
        assert_eq!(canonical.len(), compatibility_cards.len());
        let compatibility_ids: BTreeSet<_> = compatibility_cards
            .iter()
            .map(|card| card["id"].as_str().unwrap().to_owned())
            .collect();
        let canonical_ids: BTreeSet<_> = canonical.iter().map(|card| card.id.to_string()).collect();
        assert_eq!(canonical_ids, compatibility_ids);

        let compatibility_numbers: BTreeSet<_> = compatibility_cards
            .iter()
            .map(|card| card["card-number"].as_integer().unwrap())
            .collect();
        let canonical_numbers: BTreeSet<_> = canonical
            .iter()
            .map(|card| i64::from(card.catalog_number))
            .collect();
        assert_eq!(canonical_numbers, compatibility_numbers);

        let compatibility_images: BTreeSet<_> = compatibility_cards
            .iter()
            .map(|card| card["image-number"].as_integer().unwrap())
            .collect();
        assert_eq!(compatibility_images.len(), compatibility_cards.len());
        assert_eq!(
            canonical
                .iter()
                .filter(|card| card.artwork.crop.is_some())
                .count(),
            compatibility_cards
                .iter()
                .filter(|card| card.get("art").is_some())
                .count()
        );

        for card in canonical {
            let value = card.id.to_string();
            let parsed = Uuid::parse_str(&value).unwrap();
            assert_eq!(parsed.get_version(), Some(Version::Random));
            assert_eq!(parsed.get_variant(), Variant::RFC4122);
            assert_eq!(parsed.hyphenated().to_string(), value);
        }
    }

    fn normalize_table_order(value: toml::Value) -> toml::Value {
        match value {
            toml::Value::Array(values) => {
                toml::Value::Array(values.into_iter().map(normalize_table_order).collect())
            }
            toml::Value::Table(table) => {
                let mut entries: Vec<_> = table.into_iter().collect();
                entries.sort_by(|left, right| left.0.cmp(&right.0));
                toml::Value::Table(
                    entries
                        .into_iter()
                        .map(|(key, value)| (key, normalize_table_order(value)))
                        .collect(),
                )
            }
            scalar => scalar,
        }
    }
}

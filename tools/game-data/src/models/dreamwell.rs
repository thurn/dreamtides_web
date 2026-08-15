use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use trox::LocalizedString;

use anyhow::{Result, bail, ensure};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::{joined_source_text, source_text};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamwellCatalog {
    pub rules: DreamwellRules,
    pub cards: Vec<DreamwellCardDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamwellRules {
    pub opening_orders: Vec<u32>,
    pub recurring_orders: Vec<u32>,
    pub cards_per_recurring_order: u32,
    pub minimum_constructed_length: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamwellCardDefinition {
    pub name: LocalizedString,
    pub id: DreamwellCardId,
    pub ability_text: Vec<LocalizedString>,
    pub energy_added: u32,
    pub deck_tier: DeckTier,
    pub art: Art,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamwellCardMetadata {
    pub id: DreamwellCardId,
    pub number: u32,
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
pub struct Art {
    pub image: u32,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub owned: bool,
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
struct CompatibilityMetadataCatalog {
    #[serde(rename = "dreamwellMetadata")]
    entries: Vec<DreamwellCardMetadata>,
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

pub fn lower(
    source: DreamwellCatalog,
    metadata: Vec<DreamwellCardMetadata>,
) -> Result<toml::Value> {
    validate(&source)?;
    let mut metadata_by_id = BTreeMap::new();
    let mut numbers = BTreeSet::new();
    for record in metadata {
        ensure!(
            record.number > 0,
            "Dreamwell card {} compatibility number must be greater than zero",
            record.id
        );
        ensure!(
            numbers.insert(record.number),
            "duplicate Dreamwell compatibility number: {}",
            record.number
        );
        ensure!(
            metadata_by_id.insert(record.id, record).is_none(),
            "duplicate Dreamwell metadata id"
        );
    }
    let dreamwell = source
        .cards
        .into_iter()
        .map(|card| {
            let metadata = metadata_by_id.remove(&card.id).ok_or_else(|| {
                anyhow::anyhow!("missing metadata for Dreamwell card {}", card.id)
            })?;
            Ok(CompatibilityCard {
                name: source_text(&card.name)?,
                id: card.id.to_string(),
                rendered_text: joined_source_text(card.ability_text, "\n\n")?,
                order: card.deck_tier.compatibility_order(),
                energy_added: card.energy_added,
                card_type: "Dreamwell",
                image_number: Some(card.art.image),
                art_owned: card.art.owned,
                card_number: metadata.number,
                art: card.art.crop.map(|crop| CompatibilityArtCrop {
                    x: number(crop.x),
                    y: number(crop.y),
                    scale: number(crop.scale),
                }),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    if let Some(id) = metadata_by_id.keys().next() {
        bail!("metadata references unknown Dreamwell card {id}");
    }
    Ok(toml::Value::try_from(CompatibilityCatalog { dreamwell })?)
}

pub fn lower_metadata(metadata: Vec<DreamwellCardMetadata>) -> Result<toml::Value> {
    Ok(toml::Value::try_from(CompatibilityMetadataCatalog {
        entries: metadata,
    })?)
}

fn number(value: f64) -> toml::Value {
    if value.fract() == 0.0 && value >= i64::MIN as f64 && value <= i64::MAX as f64 {
        toml::Value::Integer(value as i64)
    } else {
        toml::Value::Float(value)
    }
}

pub(crate) fn validate(source: &DreamwellCatalog) -> Result<()> {
    validate_rules(&source.rules)?;
    validate_cards(&source.cards)
}

pub(crate) fn validate_rules(source: &DreamwellRules) -> Result<()> {
    ensure!(
        !source.opening_orders.is_empty(),
        "dreamwell.opening_orders must not be empty"
    );
    ensure!(
        !source.recurring_orders.is_empty(),
        "dreamwell.recurring_orders must not be empty"
    );
    let opening = source
        .opening_orders
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    ensure!(
        opening.len() == source.opening_orders.len(),
        "dreamwell.opening_orders contains a duplicate order"
    );
    let recurring = source
        .recurring_orders
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    ensure!(
        recurring.len() == source.recurring_orders.len(),
        "dreamwell.recurring_orders contains a duplicate order"
    );
    if let Some(overlap) = opening.intersection(&recurring).next() {
        bail!("dreamwell order {overlap} appears in opening and recurring orders");
    }
    ensure!(
        source.cards_per_recurring_order > 0,
        "dreamwell.cards_per_recurring_order must be greater than zero"
    );
    ensure!(
        source.minimum_constructed_length > 0,
        "dreamwell.minimum_constructed_length must be greater than zero"
    );
    Ok(())
}

fn validate_cards(source: &[DreamwellCardDefinition]) -> Result<()> {
    ensure!(!source.is_empty(), "Dreamwell catalog must not be empty");
    let mut ids = BTreeSet::new();
    for card in source {
        ensure!(
            ids.insert(card.id),
            "duplicate Dreamwell card id: {}",
            card.id
        );
        ensure!(
            !source_text(&card.name)?.trim().is_empty(),
            "Dreamwell card {} has an empty name",
            card.id
        );
        if let Some(crop) = &card.art.crop {
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
    use pretty_assertions::assert_eq;

    use super::*;

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
DreamwellCatalog(
  rules: DreamwellRules(
    opening_orders: [0],
    recurring_orders: [1, 2, 3, 4],
    cards_per_recurring_order: 2,
    minimum_constructed_length: 8,
  ),
  cards: [
    DreamwellCardDefinition(
    name: Tx("Première lumière"),
    id: "00000000-0000-4000-8000-000000000001",
    ability_text: [Tx("Draw a card."), Tx("Then gain 1●.")],
    energy_added: 2,
    deck_tier: Starting,
    art: (
      image: 42,
      owned: true,
      crop: (x: -0.25, y: 0.5, scale: 1.2),
    ),
  ),

    DreamwellCardDefinition(
    name: Tx("Second"),
    id: "00000000-0000-4000-8000-000000000002",
    ability_text: [],
    energy_added: 0,
    deck_tier: Four,
    art: (image: 43),
  ),
  ],
)
"##
    }

    fn synthetic_metadata() -> &'static str {
        r##"[
  DreamwellCardMetadata(
    id: "00000000-0000-4000-8000-000000000001",
    number: 7,
  ),
  DreamwellCardMetadata(
    id: "00000000-0000-4000-8000-000000000002",
    number: 11,
  ),
]
"##
    }

    fn parse_source(source: &str) -> DreamwellCatalog {
        ron::from_str(source).unwrap()
    }

    fn parse_metadata(source: &str) -> Vec<DreamwellCardMetadata> {
        ron::from_str(source).unwrap()
    }

    #[test]
    fn lowers_ordered_cards_and_compatibility_fields() {
        let lowered = lower(
            parse_source(synthetic_source()),
            parse_metadata(synthetic_metadata()),
        )
        .unwrap();
        let cards = lowered["dreamwell"].as_array().unwrap();

        assert_eq!(cards.len(), 2);
        assert_eq!(cards[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(cards[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(cards[0]["name"].as_str(), Some("Première lumière"));
        assert_eq!(
            cards[0]["rendered-text"].as_str(),
            Some("Draw a card.\n\nThen gain 1●.")
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
        assert_eq!(cards[1]["image-number"].as_integer(), Some(43));
        assert_eq!(cards[1]["art-owned"].as_bool(), Some(false));
        assert_eq!(cards[1]["rendered-text"].as_str(), Some(""));
        assert!(cards[1].get("art").is_none());
        assert!(cards[0].get("catalog_number").is_none());
        assert!(cards[0].get("number").is_none());
        assert!(cards[0].get("ability_text").is_none());
        assert!(cards[0].get("deck_tier").is_none());
        assert!(cards[0].get("owned").is_none());
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
        let unknown = synthetic_source().replace(
            "ability_text: [Tx(\"Draw a card.\"), Tx(\"Then gain 1●.\")],",
            "ability_text: [Tx(\"Draw a card.\"), Tx(\"Then gain 1●.\")], surprise: true,",
        );
        assert!(ron::from_str::<DreamwellCatalog>(&unknown).is_err());
        let unknown_metadata =
            synthetic_metadata().replace("number: 7,", "number: 7, surprise: true,");
        assert!(ron::from_str::<Vec<DreamwellCardMetadata>>(&unknown_metadata).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-8000-00000000000A",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            let source = synthetic_source().replacen(FIRST_ID, invalid, 1);
            assert!(
                ron::from_str::<DreamwellCatalog>(&source).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[test]
    fn rejects_duplicate_and_invalid_catalog_values() {
        assert_lower_error(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            synthetic_metadata(),
            "duplicate Dreamwell card id",
        );
        assert_lower_error(
            synthetic_source(),
            &synthetic_metadata().replace("number: 11", "number: 7"),
            "duplicate Dreamwell compatibility number",
        );
        assert_lower_error(
            synthetic_source(),
            &synthetic_metadata().replace("number: 7", "number: 0"),
            "compatibility number must be greater than zero",
        );
        assert_lower_error(
            &synthetic_source().replace("name: Tx(\"Première lumière\")", "name: Tx(\"   \")"),
            synthetic_metadata(),
            "empty name",
        );
        assert_lower_error(
            &synthetic_source().replace("scale: 1.2", "scale: 0.0"),
            synthetic_metadata(),
            "scale must be finite and positive",
        );

        let mut missing_metadata = parse_metadata(synthetic_metadata());
        missing_metadata.pop();
        assert!(
            lower(parse_source(synthetic_source()), missing_metadata)
                .unwrap_err()
                .to_string()
                .contains("missing metadata")
        );

        let mut extra_metadata = parse_metadata(synthetic_metadata());
        extra_metadata.push(
            parse_metadata(
                r#"[DreamwellCardMetadata(
                  id: "00000000-0000-4000-8000-000000000003",
                  number: 12,
                )]"#,
            )
            .pop()
            .unwrap(),
        );
        assert!(
            lower(parse_source(synthetic_source()), extra_metadata)
                .unwrap_err()
                .to_string()
                .contains("metadata references unknown Dreamwell card")
        );
    }

    fn assert_lower_error(source: &str, metadata: &str, expected: &str) {
        assert!(
            lower(parse_source(source), parse_metadata(metadata))
                .unwrap_err()
                .to_string()
                .contains(expected),
            "error did not contain {expected}"
        );
    }
}

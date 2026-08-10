use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use anyhow::{Result, bail};
use indexmap::IndexMap;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

pub type TidesCatalog = Vec<TideDefinition>;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TideDefinition {
    pub id: TideId,
    pub display_name: String,
    pub display_description: String,
    pub color: TideColor,
    pub kind: TideKind,
    #[serde(deserialize_with = "super::card_counts::deserialize")]
    pub cards: IndexMap<CardId, u32>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TideColor {
    Purple,
    Green,
    Yellow,
    Blue,
    Orange,
}

impl TideColor {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Purple => "purple",
            Self::Green => "green",
            Self::Yellow => "yellow",
            Self::Blue => "blue",
            Self::Orange => "orange",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TideKind {
    Signature,
    Facet,
    Neutral,
}

impl TideKind {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Signature => "signature",
            Self::Facet => "facet",
            Self::Neutral => "neutral",
        }
    }
}

macro_rules! canonical_uuid {
    ($name:ident, $label:literal) => {
        #[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(Uuid);

        impl $name {
            pub fn parse(value: &str) -> std::result::Result<Self, String> {
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

canonical_uuid!(TideId, "Tide identifier");
canonical_uuid!(CardId, "Tide card identifier");

pub fn validate(catalog: &TidesCatalog) -> Result<()> {
    if catalog.is_empty() {
        bail!("Tides catalog must contain at least one tide");
    }

    let mut tide_ids = BTreeSet::new();
    for tide in catalog {
        if !tide_ids.insert(tide.id) {
            bail!("duplicate Tide UUID {}", tide.id);
        }
        if tide.cards.is_empty() {
            bail!("Tide {} must contain at least one card", tide.id);
        }
        for (card_id, copies) in &tide.cards {
            if *copies == 0 {
                bail!(
                    "Tide {} card {} must have at least one copy",
                    tide.id,
                    card_id
                );
            }
        }
    }
    Ok(())
}

pub fn tide_kinds(catalog: &TidesCatalog) -> Result<BTreeMap<TideId, TideKind>> {
    validate(catalog)?;
    Ok(catalog.iter().map(|tide| (tide.id, tide.kind)).collect())
}

pub fn validate_references(
    catalog: &TidesCatalog,
    known_card_ids: &BTreeSet<String>,
) -> Result<()> {
    validate(catalog)?;
    for tide in catalog {
        for card_id in tide.cards.keys() {
            if !known_card_ids.contains(&card_id.to_string()) {
                bail!("Tide {} references unknown card UUID {}", tide.id, card_id);
            }
        }
    }
    Ok(())
}

pub fn lower(catalog: TidesCatalog) -> Result<toml::Value> {
    validate(&catalog)?;
    let mut root = toml::map::Map::new();
    root.insert("schema-version".into(), 1_i64.into());
    root.insert(
        "tide".into(),
        toml::Value::Array(
            catalog
                .into_iter()
                .map(|tide| {
                    let mut table = toml::map::Map::new();
                    table.insert("id".into(), tide.id.to_string().into());
                    table.insert("display-name".into(), tide.display_name.into());
                    table.insert(
                        "display-description".into(),
                        tide.display_description.into(),
                    );
                    table.insert("color".into(), tide.color.as_compat().into());
                    table.insert("role".into(), tide.kind.as_compat().into());
                    table.insert(
                        "card".into(),
                        toml::Value::Array(
                            tide.cards
                                .into_iter()
                                .map(|(card_id, copies)| {
                                    toml::Value::Table(toml::map::Map::from_iter([
                                        ("id".into(), card_id.to_string().into()),
                                        ("copies".into(), i64::from(copies).into()),
                                    ]))
                                })
                                .collect(),
                        ),
                    );
                    toml::Value::Table(table)
                })
                .collect(),
        ),
    );
    Ok(toml::Value::Table(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIDE_IDS: [&str; 3] = [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
    ];
    const CARD_IDS: [&str; 3] = [
        "00000000-0000-4000-8000-000000000011",
        "00000000-0000-4000-8000-000000000012",
        "00000000-0000-4000-8000-000000000013",
    ];

    fn catalog() -> TidesCatalog {
        let kinds = [TideKind::Signature, TideKind::Facet, TideKind::Neutral];
        let colors = [TideColor::Purple, TideColor::Blue, TideColor::Orange];
        TIDE_IDS
            .into_iter()
            .zip(CARD_IDS)
            .zip(kinds)
            .zip(colors)
            .map(|(((tide_id, card_id), kind), color)| TideDefinition {
                id: TideId::parse(tide_id).unwrap(),
                display_name: format!("Display {tide_id}"),
                display_description: "Unicode tide — exact copy".into(),
                color,
                kind,
                cards: IndexMap::from_iter([(CardId::parse(card_id).unwrap(), 2)]),
            })
            .collect()
    }

    #[test]
    fn lowers_a_flat_top_level_list_with_exact_compatibility_keys_and_order() {
        let lowered = lower(catalog()).unwrap();
        assert_eq!(lowered["schema-version"].as_integer(), Some(1));
        assert_eq!(lowered["tide"][0]["role"].as_str(), Some("signature"));
        assert_eq!(lowered["tide"][1]["role"].as_str(), Some("facet"));
        assert_eq!(lowered["tide"][2]["role"].as_str(), Some("neutral"));
        assert_eq!(lowered["tide"][1]["color"].as_str(), Some("blue"));
        assert_eq!(
            lowered["tide"][0]["card"][0]["id"].as_str(),
            Some(CARD_IDS[0])
        );
    }

    #[test]
    fn rejects_duplicate_ids_and_invalid_card_references() {
        let mut duplicate = catalog();
        duplicate[1].id = duplicate[0].id;
        assert!(
            validate(&duplicate)
                .unwrap_err()
                .to_string()
                .contains("duplicate Tide")
        );

        let known_cards = BTreeSet::from([CARD_IDS[0].to_owned()]);
        assert!(
            validate_references(&catalog(), &known_cards)
                .unwrap_err()
                .to_string()
                .contains("unknown card UUID")
        );
    }

    #[test]
    fn enforces_lowercase_rfc_4122_uuid_v4_at_deserialization() {
        let source = ron::to_string(&catalog()).unwrap();
        let invalid = source.replacen(TIDE_IDS[0], "00000000-0000-1000-8000-000000000001", 1);
        assert!(
            ron::from_str::<TidesCatalog>(&invalid)
                .unwrap_err()
                .to_string()
                .contains("UUIDv4")
        );
    }
}

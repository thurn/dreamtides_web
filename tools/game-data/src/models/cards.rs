use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardDefinition {
    pub name: String,
    pub id: String,
    pub ability_text: Vec<String>,
    pub energy_cost: OrbValue,
    pub kind: CardKind,
    #[serde(default, skip_serializing_if = "speed_is_normal")]
    pub speed: Speed,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rarity: Option<Rarity>,
    pub art: Art,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardMetadata {
    pub number: i64,
    pub mtg_origin: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum OrbValue {
    Fixed(i64),
    Variable,
    FixedAndVariable(i64),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum CardKind {
    Character {
        subtype: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        spark: Option<OrbValue>,
    },
    Event,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum Speed {
    #[default]
    Normal,
    Fast,
    Interrupt,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
    Legendary,
    Materialized,
    Starter,
    Tutorial,
    Special,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Art {
    pub image: i64,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub owned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop: Option<Crop>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Crop {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

impl OrbValue {
    fn compatibility_value(&self) -> toml::Value {
        match self {
            Self::Fixed(value) => (*value).into(),
            Self::Variable => "X".into(),
            Self::FixedAndVariable(value) => format!("{value},X").into(),
        }
    }
}

fn speed_is_normal(speed: &Speed) -> bool {
    *speed == Speed::Normal
}

impl Rarity {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Common => "Common",
            Self::Uncommon => "Uncommon",
            Self::Rare => "Rare",
            Self::Legendary => "Legendary",
            Self::Materialized => "Materialized",
            Self::Starter => "Starter",
            Self::Tutorial => "Tutorial",
            Self::Special => "Special",
        }
    }
}

pub fn metadata_by_id(value: &toml::Value) -> Result<BTreeMap<String, CardMetadata>> {
    let cards = value
        .get("cards")
        .and_then(toml::Value::as_table)
        .context("internal card metadata must contain a cards table keyed by card UUID")?;
    cards
        .iter()
        .map(|(id, value)| {
            let metadata = value
                .clone()
                .try_into()
                .with_context(|| format!("invalid internal metadata for card UUID {id}"))?;
            Ok((id.clone(), metadata))
        })
        .collect()
}

pub fn lower(
    cards: Vec<CardDefinition>,
    mut metadata_by_id: BTreeMap<String, CardMetadata>,
) -> Result<toml::Value> {
    let mut ids = BTreeSet::new();
    let mut numbers = BTreeSet::new();
    let mut output = Vec::with_capacity(cards.len());
    for card in cards {
        if !ids.insert(card.id.clone()) {
            bail!("duplicate card UUID in cards source: {}", card.id);
        }
        let metadata = metadata_by_id
            .remove(&card.id)
            .with_context(|| format!("missing internal metadata for card UUID {}", card.id))?;
        if !numbers.insert(metadata.number) {
            bail!(
                "duplicate card number in internal card metadata: {}",
                metadata.number
            );
        }
        let (card_type, subtype, spark) = match card.kind {
            CardKind::Character { subtype, spark } => {
                let spark = spark
                    .map(|value| value.compatibility_value())
                    .unwrap_or_else(|| "".into());
                ("Character", subtype, spark)
            }
            CardKind::Event => ("Event", String::new(), "".into()),
        };
        let (is_fast, is_interrupt) = match card.speed {
            Speed::Normal => (false, false),
            Speed::Fast => (true, false),
            Speed::Interrupt => (true, true),
        };
        let mut record = toml::map::Map::new();
        record.insert("name".into(), card.name.into());
        record.insert("mtg-name".into(), metadata.mtg_origin.into());
        record.insert("id".into(), card.id.into());
        record.insert(
            "rendered-text".into(),
            card.ability_text.join("\n\n").into(),
        );
        record.insert("energy-cost".into(), card.energy_cost.compatibility_value());
        record.insert("card-type".into(), card_type.into());
        record.insert("subtype".into(), subtype.into());
        record.insert(
            "rarity".into(),
            card.rarity.map(Rarity::as_compat).unwrap_or("").into(),
        );
        record.insert("is-fast".into(), is_fast.into());
        record.insert("is-interrupt".into(), is_interrupt.into());
        record.insert("spark".into(), spark);
        record.insert(
            "tags".into(),
            toml::Value::Array(metadata.tags.into_iter().map(Into::into).collect()),
        );
        record.insert("image-number".into(), card.art.image.into());
        record.insert("art-owned".into(), card.art.owned.into());
        record.insert("card-number".into(), metadata.number.into());
        if let Some(crop) = card.art.crop {
            record.insert(
                "art".into(),
                toml::Value::Table(toml::map::Map::from_iter([
                    ("x".into(), toml::Value::Float(crop.x)),
                    ("y".into(), toml::Value::Float(crop.y)),
                    ("scale".into(), toml::Value::Float(crop.scale)),
                ])),
            );
        }
        output.push(toml::Value::Table(record));
    }
    if let Some(id) = metadata_by_id.keys().next() {
        bail!("internal metadata references unknown card UUID {id}");
    }
    Ok(toml::Value::Table(toml::map::Map::from_iter([(
        "cards".into(),
        toml::Value::Array(output),
    )])))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn card(energy_cost: OrbValue, kind: CardKind) -> CardDefinition {
        CardDefinition {
            name: "Unicode ✦ card".into(),
            id: "00000000-0000-4000-8000-000000000001".into(),
            ability_text: vec!["quoted \"text\"".into(), "multiline {value}".into()],
            energy_cost,
            kind,
            speed: Speed::Interrupt,
            rarity: Some(Rarity::Legendary),
            art: Art {
                image: 7,
                owned: true,
                crop: Some(Crop {
                    x: -0.25,
                    y: 1.0,
                    scale: 1.5,
                }),
            },
        }
    }

    fn metadata(number: i64) -> BTreeMap<String, CardMetadata> {
        BTreeMap::from([(
            "00000000-0000-4000-8000-000000000001".into(),
            CardMetadata {
                number,
                mtg_origin: "Synthetic".into(),
                tags: vec!["first".into(), "second".into()],
            },
        )])
    }

    #[test]
    fn lowers_every_card_kind_and_optional_shape() {
        let output = lower(
            vec![card(
                OrbValue::FixedAndVariable(2),
                CardKind::Character {
                    subtype: "Guide".into(),
                    spark: None,
                },
            )],
            metadata(1),
        )
        .unwrap();
        let record = output["cards"][0].as_table().unwrap();
        assert_eq!(record["energy-cost"].as_str(), Some("2,X"));
        assert_eq!(record["spark"].as_str(), Some(""));
        assert_eq!(record["is-interrupt"].as_bool(), Some(true));
        assert_eq!(record["tags"][0].as_str(), Some("first"));
        assert_eq!(
            record["rendered-text"].as_str(),
            Some("quoted \"text\"\n\nmultiline {value}")
        );

        let event = lower(vec![card(OrbValue::Variable, CardKind::Event)], metadata(1)).unwrap();
        assert_eq!(event["cards"][0]["card-type"].as_str(), Some("Event"));
        assert_eq!(event["cards"][0]["subtype"].as_str(), Some(""));
    }

    #[test]
    fn rejects_identity_collisions() {
        let first = card(OrbValue::Fixed(1), CardKind::Event);
        let mut second = first.clone();
        second.id = "00000000-0000-4000-8000-000000000002".into();
        let duplicate_metadata = BTreeMap::from([
            (
                first.id.clone(),
                CardMetadata {
                    number: 1,
                    mtg_origin: "First".into(),
                    tags: vec![],
                },
            ),
            (
                second.id.clone(),
                CardMetadata {
                    number: 1,
                    mtg_origin: "Second".into(),
                    tags: vec![],
                },
            ),
        ]);
        assert!(
            lower(vec![first, second], duplicate_metadata)
                .unwrap_err()
                .to_string()
                .contains("duplicate card number")
        );
    }

    #[test]
    fn requires_an_exact_metadata_record_for_every_card_uuid() {
        let fixture = card(OrbValue::Fixed(1), CardKind::Event);
        assert!(
            lower(vec![fixture.clone()], BTreeMap::new())
                .unwrap_err()
                .to_string()
                .contains("missing internal metadata")
        );

        let mut extra_metadata = metadata(1);
        extra_metadata.insert(
            "00000000-0000-4000-8000-000000000002".into(),
            CardMetadata {
                number: 2,
                mtg_origin: "Extra".into(),
                tags: vec![],
            },
        );
        assert!(
            lower(vec![fixture.clone()], extra_metadata)
                .unwrap_err()
                .to_string()
                .contains("unknown card UUID")
        );

        assert!(
            lower(vec![fixture.clone(), fixture], metadata(1))
                .unwrap_err()
                .to_string()
                .contains("duplicate card UUID")
        );
    }

    proptest! {
        #[test]
        fn fixed_orb_values_lower_without_reordering(value in 0_i64..10_000) {
            let output = lower(
                vec![card(OrbValue::Fixed(value), CardKind::Event)],
                metadata(1),
            ).unwrap();
            prop_assert_eq!(output["cards"][0]["energy-cost"].as_integer(), Some(value));
        }
    }
}

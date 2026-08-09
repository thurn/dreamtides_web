use std::collections::BTreeSet;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

use super::cards::CardId;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardMetadataCatalog {
    pub cards: Vec<CardMetadataDefinition>,
    pub tag_facets: Vec<FacetDefinition>,
    pub tide_facets: Vec<FacetDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardMetadataDefinition {
    pub id: CardId,
    pub number: u32,
    pub mtg_origin: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FacetDefinition {
    pub name: String,
    pub color: String,
}

pub fn lower(source: CardMetadataCatalog) -> Result<toml::Value> {
    validate(&source)?;

    let mut cards = toml::map::Map::new();
    for card in source.cards {
        let mut record = toml::map::Map::new();
        record.insert("number".into(), i64::from(card.number).into());
        record.insert("mtg_origin".into(), card.mtg_origin.into());
        if !card.tags.is_empty() {
            record.insert(
                "tags".into(),
                toml::Value::Array(card.tags.into_iter().map(Into::into).collect()),
            );
        }
        cards.insert(card.id.to_string(), toml::Value::Table(record));
    }

    let mut root = toml::map::Map::new();
    root.insert("cards".into(), toml::Value::Table(cards));
    root.insert("tags".into(), lower_facets(source.tag_facets));
    root.insert("tides".into(), lower_facets(source.tide_facets));
    Ok(toml::Value::Table(root))
}

fn lower_facets(facets: Vec<FacetDefinition>) -> toml::Value {
    let values = facets
        .into_iter()
        .map(|facet| {
            let mut record = toml::map::Map::new();
            record.insert("name".into(), facet.name.into());
            record.insert("color".into(), facet.color.into());
            toml::Value::Table(record)
        })
        .collect();
    toml::Value::Array(values)
}

pub fn validate(source: &CardMetadataCatalog) -> Result<()> {
    validate_facets("tag", &source.tag_facets)?;
    validate_facets("tide", &source.tide_facets)?;
    let mut ids = BTreeSet::new();
    let mut numbers = BTreeSet::new();
    for card in &source.cards {
        if !ids.insert(card.id) {
            bail!("duplicate internal card metadata id: {}", card.id);
        }
        if card.number == 0 {
            bail!(
                "internal card metadata {} number must be greater than zero",
                card.id
            );
        }
        if !numbers.insert(card.number) {
            bail!("duplicate internal card metadata number: {}", card.number);
        }
        validate_labels(card.id, "tags", &card.tags)?;
    }
    Ok(())
}

fn validate_labels(id: CardId, field: &str, values: &[String]) -> Result<()> {
    let mut unique = BTreeSet::new();
    for value in values {
        if value.trim().is_empty() {
            bail!("internal card metadata {id} has a blank {field} value");
        }
        if !unique.insert(value) {
            bail!("internal card metadata {id} repeats {field} value {value:?}");
        }
    }
    Ok(())
}

fn validate_facets(kind: &str, facets: &[FacetDefinition]) -> Result<()> {
    let mut names = BTreeSet::new();
    for facet in facets {
        if facet.name.trim().is_empty() {
            bail!("{kind} facet name must not be blank");
        }
        if !names.insert(facet.name.as_str()) {
            bail!("duplicate {kind} facet name: {}", facet.name);
        }
        let bytes = facet.color.as_bytes();
        if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
            bail!(
                "{kind} facet {} has invalid color {}",
                facet.name,
                facet.color
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
CardMetadataCatalog(
  cards: [
    CardMetadataDefinition(
      id: "00000000-0000-4000-8000-000000000001",
      number: 17,
      mtg_origin: "Éclair, the First",
      tags: ["combo", "二"],
    ),
    CardMetadataDefinition(
      id: "00000000-0000-4000-8000-000000000002",
      number: 29,
      mtg_origin: "",
    ),
  ],
  tag_facets: [
    FacetDefinition(name: "combo", color: "#a1B2c3"),
    FacetDefinition(name: "二", color: "#000000"),
  ],
  tide_facets: [FacetDefinition(name: "Storm", color: "#ffffff")],
)
"##
    }

    fn parse_source(source: &str) -> CardMetadataCatalog {
        ron::from_str(source).unwrap()
    }

    #[test]
    fn lowers_ordered_cards_optional_tags_unicode_facets_and_exact_keys() {
        let lowered = lower(parse_source(synthetic_source())).unwrap();
        let cards = lowered["cards"].as_table().unwrap();
        assert_eq!(cards.keys().collect::<Vec<_>>(), vec![FIRST_ID, SECOND_ID]);
        assert_eq!(cards[FIRST_ID]["number"].as_integer(), Some(17));
        assert_eq!(
            cards[FIRST_ID]["mtg_origin"].as_str(),
            Some("Éclair, the First")
        );
        assert_eq!(cards[FIRST_ID]["tags"][1].as_str(), Some("二"));
        assert!(cards[SECOND_ID].get("tags").is_none());
        assert_eq!(lowered["tags"][0]["name"].as_str(), Some("combo"));
        assert_eq!(lowered["tides"][0]["name"].as_str(), Some("Storm"));
        assert_eq!(
            lowered.as_table().unwrap().keys().collect::<Vec<_>>(),
            vec!["cards", "tags", "tides"]
        );
        assert_eq!(
            cards[FIRST_ID]
                .as_table()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            vec!["number", "mtg_origin", "tags"]
        );
    }

    #[test]
    fn rejects_unknown_fields_noncanonical_ids_and_invalid_catalog_values() {
        let unknown = synthetic_source().replace("number: 17,", "number: 17, surprise: true,");
        assert!(ron::from_str::<CardMetadataCatalog>(&unknown).is_err());
        let unknown_facet = synthetic_source().replace(
            "name: \"combo\", color: \"#a1B2c3\"",
            "name: \"combo\", color: \"#a1B2c3\", surprise: true",
        );
        assert!(ron::from_str::<CardMetadataCatalog>(&unknown_facet).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            assert!(
                ron::from_str::<CardMetadataCatalog>(
                    &synthetic_source().replacen(FIRST_ID, invalid, 1)
                )
                .is_err(),
                "accepted {invalid}"
            );
        }

        assert_lower_error(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            "duplicate internal card metadata id",
        );
        assert_lower_error(
            &synthetic_source().replace("number: 29", "number: 17"),
            "duplicate internal card metadata number",
        );
        assert_lower_error(
            &synthetic_source().replace("number: 17", "number: 0"),
            "number must be greater than zero",
        );
        assert_lower_error(
            &synthetic_source().replace("[\"combo\", \"二\"]", "[\"combo\", \"combo\"]"),
            "repeats tags value",
        );
        assert_lower_error(
            &synthetic_source().replace("name: \"二\"", "name: \"combo\""),
            "duplicate tag facet name",
        );
        assert_lower_error(
            &synthetic_source().replace("#ffffff", "white"),
            "invalid color",
        );
    }

    fn assert_lower_error(source: &str, expected: &str) {
        assert!(
            lower(parse_source(source))
                .unwrap_err()
                .to_string()
                .contains(expected),
            "error did not contain {expected}"
        );
    }
}

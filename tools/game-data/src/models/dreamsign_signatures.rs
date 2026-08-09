use std::collections::BTreeSet;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

use super::cards::CardId;
use super::dreamsigns::DreamsignId;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignSignatureDefinition {
    pub id: DreamsignId,
    pub classification: SignatureClassification,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum SignatureClassification {
    Neutral,
    Tailored { card_ids: Vec<CardId> },
}

pub fn lower(source: Vec<DreamsignSignatureDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let dreamsigns = source
        .into_iter()
        .map(|definition| {
            let (category, card_ids) = match definition.classification {
                SignatureClassification::Neutral => ("neutral", Vec::new()),
                SignatureClassification::Tailored { card_ids } => ("tailored", card_ids),
            };
            let mut record = toml::map::Map::new();
            record.insert("id".into(), definition.id.to_string().into());
            record.insert("category".into(), category.into());
            record.insert(
                "signature-card-ids".into(),
                toml::Value::Array(
                    card_ids
                        .into_iter()
                        .map(|id| id.to_string().into())
                        .collect(),
                ),
            );
            toml::Value::Table(record)
        })
        .collect();
    Ok(toml::Value::Table(toml::map::Map::from_iter([(
        "dreamsigns".into(),
        toml::Value::Array(dreamsigns),
    )])))
}

pub fn validate(source: &[DreamsignSignatureDefinition]) -> Result<()> {
    let mut dreamsign_ids = BTreeSet::new();
    for definition in source {
        if !dreamsign_ids.insert(definition.id) {
            bail!("duplicate Dreamsign signature id: {}", definition.id);
        }
        if let SignatureClassification::Tailored { card_ids } = &definition.classification {
            if card_ids.is_empty() {
                bail!(
                    "tailored Dreamsign signature {} must contain at least one card id",
                    definition.id
                );
            }
            let mut unique = BTreeSet::new();
            for card_id in card_ids {
                if !unique.insert(*card_id) {
                    bail!(
                        "Dreamsign signature {} repeats card id {card_id}",
                        definition.id
                    );
                }
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
    const FIRST_CARD_ID: &str = "00000000-0000-4000-8000-000000000011";
    const SECOND_CARD_ID: &str = "00000000-0000-4000-8000-000000000012";

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
[
  DreamsignSignatureDefinition(
    id: "00000000-0000-4000-8000-000000000001",
    classification: Neutral,
  ),
  DreamsignSignatureDefinition(
    id: "00000000-0000-4000-8000-000000000002",
    classification: Tailored(
      card_ids: [
        "00000000-0000-4000-8000-000000000011",
        "00000000-0000-4000-8000-000000000012",
      ],
    ),
  ),
]
"##
    }

    fn parse_source(source: &str) -> Vec<DreamsignSignatureDefinition> {
        ron::from_str(source).unwrap()
    }

    #[test]
    fn lowers_both_classifications_ordered_card_ids_and_exact_keys() {
        let lowered = lower(parse_source(synthetic_source())).unwrap();
        let definitions = lowered["dreamsigns"].as_array().unwrap();
        assert_eq!(definitions.len(), 2);
        assert_eq!(definitions[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(definitions[0]["category"].as_str(), Some("neutral"));
        assert_eq!(
            definitions[0]["signature-card-ids"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
        assert_eq!(definitions[1]["category"].as_str(), Some("tailored"));
        assert_eq!(
            definitions[1]["signature-card-ids"][0].as_str(),
            Some(FIRST_CARD_ID)
        );
        assert_eq!(
            definitions[1]["signature-card-ids"][1].as_str(),
            Some(SECOND_CARD_ID)
        );
        assert_eq!(
            definitions[0]
                .as_table()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            vec!["id", "category", "signature-card-ids"]
        );
    }

    #[test]
    fn rejects_unknown_fields_noncanonical_ids_and_invalid_tailored_sets() {
        let unknown = synthetic_source().replace(
            "classification: Neutral,",
            "classification: Neutral, surprise: true,",
        );
        assert!(ron::from_str::<Vec<DreamsignSignatureDefinition>>(&unknown).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            assert!(
                ron::from_str::<Vec<DreamsignSignatureDefinition>>(
                    &synthetic_source().replacen(FIRST_ID, invalid, 1)
                )
                .is_err(),
                "accepted Dreamsign id {invalid}"
            );
            assert!(
                ron::from_str::<Vec<DreamsignSignatureDefinition>>(&synthetic_source().replacen(
                    FIRST_CARD_ID,
                    invalid,
                    1
                ))
                .is_err(),
                "accepted card id {invalid}"
            );
        }

        assert_lower_error(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            "duplicate Dreamsign signature id",
        );
        assert_lower_error(
            &synthetic_source().replace(
                "card_ids: [\n        \"00000000-0000-4000-8000-000000000011\",\n        \"00000000-0000-4000-8000-000000000012\",\n      ]",
                "card_ids: []",
            ),
            "must contain at least one card id",
        );
        assert_lower_error(
            &synthetic_source().replace(SECOND_CARD_ID, FIRST_CARD_ID),
            "repeats card id",
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

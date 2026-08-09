use std::collections::BTreeSet;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

use super::dreamsigns::DreamsignId;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignProfileDefinition {
    pub id: DreamsignId,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub subtypes: Vec<ProfileSubtype>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_types: Vec<ProfileCardType>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cost_bands: Vec<ProfileCostBand>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keywords: Vec<ProfileKeyword>,
    pub quality: u8,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, Ord, PartialEq, PartialOrd)]
pub enum ProfileSubtype {
    SpiritAnimal,
    Survivor,
    Warrior,
}

impl ProfileSubtype {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::SpiritAnimal => "Spirit Animal",
            Self::Survivor => "Survivor",
            Self::Warrior => "Warrior",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, Ord, PartialEq, PartialOrd)]
pub enum ProfileCardType {
    Character,
    Event,
}

impl ProfileCardType {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Character => "Character",
            Self::Event => "Event",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, Ord, PartialEq, PartialOrd)]
pub enum ProfileCostBand {
    Cheap,
    Mid,
    Big,
}

impl ProfileCostBand {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Cheap => "cheap",
            Self::Mid => "mid",
            Self::Big => "big",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, Ord, PartialEq, PartialOrd)]
pub enum ProfileKeyword {
    Fast,
    Reclaim,
}

impl ProfileKeyword {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Fast => "fast",
            Self::Reclaim => "reclaim",
        }
    }
}

pub fn lower(source: Vec<DreamsignProfileDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let dreamsigns = source
        .into_iter()
        .map(|profile| {
            let mut record = toml::map::Map::new();
            record.insert("id".into(), profile.id.to_string().into());
            record.insert(
                "subtypes".into(),
                strings(profile.subtypes, ProfileSubtype::compatibility_name),
            );
            record.insert(
                "card-types".into(),
                strings(profile.card_types, ProfileCardType::compatibility_name),
            );
            record.insert(
                "cost-bands".into(),
                strings(profile.cost_bands, ProfileCostBand::compatibility_name),
            );
            record.insert(
                "keywords".into(),
                strings(profile.keywords, ProfileKeyword::compatibility_name),
            );
            record.insert("quality".into(), i64::from(profile.quality).into());
            toml::Value::Table(record)
        })
        .collect();
    Ok(toml::Value::Table(toml::map::Map::from_iter([(
        "dreamsigns".into(),
        toml::Value::Array(dreamsigns),
    )])))
}

fn strings<T>(values: Vec<T>, name: fn(T) -> &'static str) -> toml::Value {
    toml::Value::Array(values.into_iter().map(|value| name(value).into()).collect())
}

pub fn validate(source: &[DreamsignProfileDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    for profile in source {
        if !ids.insert(profile.id) {
            bail!("duplicate Dreamsign profile id: {}", profile.id);
        }
        if !(1..=3).contains(&profile.quality) {
            bail!(
                "Dreamsign profile {} quality must be between 1 and 3",
                profile.id
            );
        }
        reject_duplicates(profile.id, "subtypes", &profile.subtypes)?;
        reject_duplicates(profile.id, "card_types", &profile.card_types)?;
        reject_duplicates(profile.id, "cost_bands", &profile.cost_bands)?;
        reject_duplicates(profile.id, "keywords", &profile.keywords)?;
    }
    Ok(())
}

fn reject_duplicates<T: Copy + Ord>(id: DreamsignId, field: &str, values: &[T]) -> Result<()> {
    let mut unique = BTreeSet::new();
    for value in values {
        if !unique.insert(*value) {
            bail!("Dreamsign profile {id} repeats {field} value");
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
  DreamsignProfileDefinition(
    id: "00000000-0000-4000-8000-000000000001",
    subtypes: [SpiritAnimal, Survivor, Warrior],
    card_types: [Character, Event],
    cost_bands: [Cheap, Mid, Big],
    keywords: [Fast, Reclaim],
    quality: 1,
  ),
  DreamsignProfileDefinition(
    id: "00000000-0000-4000-8000-000000000002",
    quality: 3,
  ),
]
"##
    }

    fn parse_source(source: &str) -> Vec<DreamsignProfileDefinition> {
        ron::from_str(source).unwrap()
    }

    #[test]
    fn lowers_every_feature_variant_defaults_and_exact_keys() {
        let lowered = lower(parse_source(synthetic_source())).unwrap();
        let profiles = lowered["dreamsigns"].as_array().unwrap();
        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(profiles[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            profiles[0]["subtypes"]
                .as_array()
                .unwrap()
                .iter()
                .map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![Some("Spirit Animal"), Some("Survivor"), Some("Warrior")]
        );
        assert_eq!(profiles[0]["card-types"][1].as_str(), Some("Event"));
        assert_eq!(profiles[0]["cost-bands"][2].as_str(), Some("big"));
        assert_eq!(profiles[0]["keywords"][1].as_str(), Some("reclaim"));
        assert_eq!(profiles[1]["subtypes"].as_array().unwrap().len(), 0);
        assert_eq!(profiles[1]["quality"].as_integer(), Some(3));
        assert_eq!(
            profiles[0].as_table().unwrap().keys().collect::<Vec<_>>(),
            vec![
                "id",
                "subtypes",
                "card-types",
                "cost-bands",
                "keywords",
                "quality"
            ]
        );
    }

    #[test]
    fn rejects_unknown_fields_invalid_ids_quality_and_duplicate_values() {
        let unknown = synthetic_source().replace("quality: 1,", "quality: 1, surprise: true,");
        assert!(ron::from_str::<Vec<DreamsignProfileDefinition>>(&unknown).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            assert!(
                ron::from_str::<Vec<DreamsignProfileDefinition>>(
                    &synthetic_source().replacen(FIRST_ID, invalid, 1)
                )
                .is_err(),
                "accepted {invalid}"
            );
        }

        assert_lower_error(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            "duplicate Dreamsign profile id",
        );
        assert_lower_error(
            &synthetic_source().replace("quality: 1", "quality: 0"),
            "quality must be between 1 and 3",
        );
        assert_lower_error(
            &synthetic_source().replace("[Fast, Reclaim]", "[Fast, Fast]"),
            "repeats keywords value",
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

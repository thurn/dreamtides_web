use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use trox::LocalizedString;

use anyhow::{Context, Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::{joined_source_text, source_text};

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CardId(Uuid);

impl CardId {
    pub(crate) fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Card identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("Card identifier must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for CardId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for CardId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for CardId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardDefinition {
    pub name: LocalizedString,
    pub id: String,
    pub ability_text: Vec<LocalizedString>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amplified_text: Option<LocalizedString>,
    pub energy_cost: OrbValue,
    pub kind: CardKind,
    #[serde(default, skip_serializing_if = "speed_is_normal")]
    pub speed: Speed,
    pub rarity: Rarity,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub roles: Vec<CardRole>,
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
    Starter,
    Tutorial,
    Special,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub enum CardRole {
    StarterDeck,
    Nightmare,
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
    pub(crate) fn as_compat(self) -> &'static str {
        match self {
            Self::Common => "Common",
            Self::Uncommon => "Uncommon",
            Self::Rare => "Rare",
            Self::Legendary => "Legendary",
            Self::Starter => "Starter",
            Self::Tutorial => "Tutorial",
            Self::Special => "Special",
        }
    }
}

impl CardRole {
    fn as_compat(self) -> &'static str {
        match self {
            Self::StarterDeck => "starter-deck",
            Self::Nightmare => "nightmare",
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
        record.insert("name".into(), source_text(&card.name)?.into());
        record.insert("mtg-name".into(), metadata.mtg_origin.into());
        record.insert("id".into(), card.id.clone().into());
        let rendered_text = joined_source_text(card.ability_text, "\n\n")?;
        record.insert("rendered-text".into(), rendered_text.clone().into());
        if let Some(amplified_text) = card.amplified_text {
            let replacement = source_text(&amplified_text)?;
            let expanded = fuzzy_replace(&rendered_text, &replacement).with_context(|| {
                format!(
                    "card {} amplified_text cannot be applied unambiguously",
                    card.id
                )
            })?;
            if expanded == rendered_text {
                bail!(
                    "card {} amplified_text replacement does not change ability_text",
                    card.id
                );
            }
            record.insert("amplified-text".into(), expanded.into());
            // The compatibility catalog carries the compact authoring value for
            // the card editor. Runtime JSON deliberately drops this field and
            // continues to expose only the fully expanded Amplified rules text.
            record.insert("amplified-replacement".into(), replacement.into());
        }
        record.insert("energy-cost".into(), card.energy_cost.compatibility_value());
        record.insert("card-type".into(), card_type.into());
        record.insert("subtype".into(), subtype.into());
        record.insert("rarity".into(), card.rarity.as_compat().into());
        if !card.roles.is_empty() {
            let unique_roles = card.roles.iter().copied().collect::<BTreeSet<_>>();
            if unique_roles.len() != card.roles.len() {
                bail!("card {} contains a duplicate gameplay role", card.id);
            }
            record.insert(
                "roles".into(),
                toml::Value::Array(
                    card.roles
                        .into_iter()
                        .map(|role| role.as_compat().into())
                        .collect(),
                ),
            );
        }
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

#[derive(Clone, Debug, Eq, PartialEq)]
struct ReplacementCandidate {
    start: usize,
    end: usize,
    distance: usize,
}

/// Replace the unique ability-text span most similar to the authored Amplified
/// replacement. Candidate spans begin and end at whitespace boundaries, which
/// lets authors name a word, phrase, sentence, or paragraph without allowing a
/// match to split a Unicode scalar or the middle of a word.
pub fn fuzzy_replace(base: &str, replacement: &str) -> Result<String> {
    if replacement.trim().is_empty() {
        bail!("amplified replacement must not be blank");
    }
    if base.trim().is_empty() {
        bail!("amplified replacement requires nonempty ability text");
    }

    let starts = candidate_starts(base);
    let ends = candidate_ends(base);
    let replacement_chars = replacement.chars().collect::<Vec<_>>();
    let mut candidates = Vec::new();
    for start in starts {
        for &end in &ends {
            if end <= start {
                continue;
            }
            let candidate = &base[start..end];
            if !compatible_match_boundaries(candidate, replacement) {
                continue;
            }
            let distance =
                levenshtein_chars(&candidate.chars().collect::<Vec<_>>(), &replacement_chars);
            candidates.push(ReplacementCandidate {
                start,
                end,
                distance,
            });
        }
    }

    let best_distance = candidates
        .iter()
        .map(|candidate| candidate.distance)
        .min()
        .context("amplified replacement found no candidate spans")?;
    let best = candidates
        .iter()
        .filter(|candidate| candidate.distance == best_distance)
        .collect::<Vec<_>>();
    if best.len() != 1 {
        let matches = best
            .iter()
            .map(|candidate| {
                format!(
                    "{}..{} {:?}",
                    candidate.start,
                    candidate.end,
                    &base[candidate.start..candidate.end]
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        bail!(
            "ambiguous amplified replacement {:?}: {} spans tie at edit distance {} ({})",
            replacement,
            best.len(),
            best_distance,
            matches
        );
    }

    let selected = best[0];
    let candidate_length = base[selected.start..selected.end].chars().count();
    let comparison_length = candidate_length.max(replacement_chars.len());
    let similarity = comparison_length
        .checked_sub(best_distance)
        .map(|overlap| overlap as f64 / comparison_length as f64)
        .unwrap_or_default();
    if similarity < 0.30 {
        bail!(
            "amplified replacement {:?} has no sufficiently similar ability-text span; closest was {:?} ({:.0}% similarity)",
            replacement,
            &base[selected.start..selected.end],
            similarity * 100.0
        );
    }

    Ok(format!(
        "{}{}{}",
        &base[..selected.start],
        replacement,
        &base[selected.end..]
    ))
}

fn compatible_match_boundaries(candidate: &str, replacement: &str) -> bool {
    let replacement_terminal = replacement.chars().next_back();
    let candidate_terminal = candidate.trim_end().chars().next_back();
    let terminal_is_sentence_punctuation = |character: Option<char>| {
        character.is_some_and(|character| matches!(character, '.' | '!' | '?'))
    };
    if terminal_is_sentence_punctuation(replacement_terminal)
        && !terminal_is_sentence_punctuation(candidate_terminal)
    {
        return false;
    }
    if replacement.starts_with('▸') && !candidate.starts_with('▸') {
        return false;
    }
    true
}

fn candidate_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0];
    let mut in_whitespace = false;
    for (index, character) in text.char_indices() {
        if character.is_whitespace() {
            in_whitespace = true;
        } else if in_whitespace {
            starts.push(index);
            in_whitespace = false;
        }
    }
    starts
}

fn candidate_ends(text: &str) -> Vec<usize> {
    let mut ends = Vec::new();
    let mut in_whitespace = false;
    for (index, character) in text.char_indices() {
        if character.is_whitespace() {
            if !in_whitespace {
                ends.push(index);
            }
            in_whitespace = true;
        } else {
            in_whitespace = false;
        }
    }
    if text.chars().next_back().is_some_and(char::is_whitespace) {
        ends.pop();
    }
    ends.push(text.len());
    ends
}

fn levenshtein_chars(left: &[char], right: &[char]) -> usize {
    let mut previous = (0..=right.len()).collect::<Vec<_>>();
    let mut current = vec![0; right.len() + 1];
    for (left_index, left_character) in left.iter().enumerate() {
        current[0] = left_index + 1;
        for (right_index, right_character) in right.iter().enumerate() {
            let substitution =
                previous[right_index] + usize::from(left_character != right_character);
            current[right_index + 1] = (current[right_index] + 1)
                .min(previous[right_index + 1] + 1)
                .min(substitution);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[right.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ls(text: impl Into<String>) -> LocalizedString {
        super::super::localization::localized_source(text.into()).unwrap()
    }
    use proptest::prelude::*;

    fn card(energy_cost: OrbValue, kind: CardKind) -> CardDefinition {
        CardDefinition {
            name: ls("Unicode ✦ card"),
            id: "00000000-0000-4000-8000-000000000001".into(),
            ability_text: vec![ls("quoted \"text\""), ls("multiline {value}")],
            amplified_text: Some(ls("stronger quoted \"text\"")),
            energy_cost,
            kind,
            speed: Speed::Interrupt,
            rarity: Rarity::Legendary,
            roles: Vec::new(),
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
        let mut fixture = card(
            OrbValue::FixedAndVariable(2),
            CardKind::Character {
                subtype: "Guide".into(),
                spark: None,
            },
        );
        fixture.ability_text = vec![ls("quoted \"text\"")];
        let output = lower(vec![fixture], metadata(1)).unwrap();
        let record = output["cards"][0].as_table().unwrap();
        assert_eq!(record["energy-cost"].as_str(), Some("2,X"));
        assert_eq!(record["spark"].as_str(), Some(""));
        assert_eq!(record["is-interrupt"].as_bool(), Some(true));
        assert_eq!(record["tags"][0].as_str(), Some("first"));
        assert_eq!(record["rendered-text"].as_str(), Some("quoted \"text\""));
        assert_eq!(
            record["amplified-text"].as_str(),
            Some("stronger quoted \"text\"")
        );
        assert_eq!(
            record["amplified-replacement"].as_str(),
            Some("stronger quoted \"text\"")
        );

        let mut event_card = card(OrbValue::Variable, CardKind::Event);
        event_card.amplified_text = None;
        event_card.roles = vec![CardRole::Nightmare];
        let event = lower(vec![event_card], metadata(1)).unwrap();
        assert_eq!(event["cards"][0]["card-type"].as_str(), Some("Event"));
        assert_eq!(event["cards"][0]["subtype"].as_str(), Some(""));
        assert!(event["cards"][0].get("amplified-text").is_none());
        assert_eq!(event["cards"][0]["roles"][0].as_str(), Some("nightmare"));
    }

    #[test]
    fn fuzzy_replacement_expands_short_and_contextual_amplified_text() {
        assert_eq!(
            fuzzy_replace(
                "When you discard this card, materialize it.",
                "materialize it with awakened.",
            )
            .unwrap(),
            "When you discard this card, materialize it with awakened."
        );
        assert_eq!(
            fuzzy_replace(
                "Spirit animals you control have +1✦.\n\nWhen you play a spirit animal, you may pay 1● to draw a card.",
                "+2✦.",
            )
            .unwrap(),
            "Spirit animals you control have +2✦.\n\nWhen you play a spirit animal, you may pay 1● to draw a card."
        );
    }

    #[test]
    fn fuzzy_replacement_rejects_ambiguous_and_unrelated_text() {
        let ambiguous = fuzzy_replace("Gain 1●.\n\nGain 1●.", "Gain 2●.")
            .unwrap_err()
            .to_string();
        assert!(ambiguous.contains("ambiguous amplified replacement"));

        let unrelated = fuzzy_replace("Gain 1●.", "Banish every enemy forever.")
            .unwrap_err()
            .to_string();
        assert!(unrelated.contains("no sufficiently similar ability-text span"));
    }

    #[test]
    fn card_lowering_rejects_ambiguous_amplified_replacements() {
        let mut fixture = card(OrbValue::Fixed(1), CardKind::Event);
        fixture.ability_text = vec![ls("Gain 1●."), ls("Gain 1●.")];
        fixture.amplified_text = Some(ls("Gain 2●."));
        let error = lower(vec![fixture], metadata(1)).unwrap_err();
        let diagnostic = format!("{error:#}");
        assert!(diagnostic.contains("card 00000000-0000-4000-8000-000000000001"));
        assert!(diagnostic.contains("ambiguous amplified replacement"));
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

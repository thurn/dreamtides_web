use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use trox::LocalizedString;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::{joined_source_text, source_text};
use super::tides::{TideId, TideKind};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AvatarDefinition {
    pub name: LocalizedString,
    pub id: DreamAvatarId,
    pub ability_text: Vec<LocalizedString>,
    pub title: LocalizedString,
    pub portrait: Portrait,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starting_essence: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub signature_card_ids: Vec<CardId>,
    pub tide_pool: TidePool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TidePool {
    pub starter: Option<TideId>,
    pub facets: Vec<TideId>,
    pub neutral: Vec<TideId>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Portrait {
    pub image: u32,
    pub focus: PortraitFocus,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PortraitFocus {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AvatarMetadata {
    pub avatar_id: DreamAvatarId,
    pub mtg_archetype: String,
}

macro_rules! canonical_uuid {
    ($name:ident, $label:literal) => {
        #[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(Uuid);

        impl $name {
            fn parse(value: &str) -> std::result::Result<Self, String> {
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

canonical_uuid!(DreamAvatarId, "DreamAvatar identifier");
canonical_uuid!(CardId, "signature card identifier");

#[derive(Serialize)]
struct CompatibilityCatalog {
    #[serde(rename = "dreamAvatar")]
    dream_avatars: Vec<CompatibilityDreamAvatar>,
    metadata: CompatibilityMetadata,
}

#[derive(Serialize)]
struct CompatibilityMetadataCatalog {
    #[serde(rename = "avatarMetadata")]
    entries: Vec<AvatarMetadata>,
}

#[derive(Serialize)]
struct CompatibilityDreamAvatar {
    name: String,
    title: String,
    id: String,
    #[serde(rename = "image-number")]
    image_number: String,
    #[serde(rename = "portrait-focus")]
    portrait_focus: CompatibilityPortraitFocus,
    #[serde(rename = "rendered-text")]
    rendered_text: String,
    #[serde(rename = "starting-essence", skip_serializing_if = "Option::is_none")]
    starting_essence: Option<u32>,
    #[serde(rename = "signature-cards", skip_serializing_if = "Option::is_none")]
    signature_cards: Option<Vec<String>>,
    #[serde(rename = "tide-pool")]
    tide_pool: CompatibilityTidePool,
}

#[derive(Serialize)]
struct CompatibilityTidePool {
    starter: Option<String>,
    facets: Vec<String>,
    neutral: Vec<String>,
}

#[derive(Serialize)]
struct CompatibilityPortraitFocus {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct CompatibilityMetadata {
    schema_version: u32,
    rows: CompatibilityRows,
    columns: Vec<CompatibilityColumn>,
}

#[derive(Serialize)]
struct CompatibilityRows {
    default_height: u32,
    frozen_rows: u32,
}

#[derive(Serialize)]
struct CompatibilityColumn {
    key: &'static str,
    width: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    bold: Option<bool>,
}

pub fn lower(source: Vec<AvatarDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let dream_avatars = source
        .into_iter()
        .map(|avatar| {
            let signature_cards = (!avatar.signature_card_ids.is_empty()).then(|| {
                avatar
                    .signature_card_ids
                    .into_iter()
                    .map(|id| id.to_string())
                    .collect()
            });
            Ok(CompatibilityDreamAvatar {
                name: source_text(&avatar.name)?,
                title: source_text(&avatar.title)?,
                id: avatar.id.to_string(),
                image_number: format!("{:04}", avatar.portrait.image),
                portrait_focus: CompatibilityPortraitFocus {
                    x: avatar.portrait.focus.x,
                    y: avatar.portrait.focus.y,
                },
                rendered_text: joined_source_text(avatar.ability_text, "\n\n")?,
                starting_essence: avatar.starting_essence,
                signature_cards,
                tide_pool: CompatibilityTidePool {
                    starter: avatar.tide_pool.starter.map(|id| id.to_string()),
                    facets: avatar
                        .tide_pool
                        .facets
                        .into_iter()
                        .map(|id| id.to_string())
                        .collect(),
                    neutral: avatar
                        .tide_pool
                        .neutral
                        .into_iter()
                        .map(|id| id.to_string())
                        .collect(),
                },
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog {
        dream_avatars,
        metadata: compatibility_metadata(),
    })?)
}

pub fn lower_metadata(source: Vec<AvatarMetadata>) -> Result<toml::Value> {
    validate_metadata_shape(&source)?;
    Ok(toml::Value::try_from(CompatibilityMetadataCatalog {
        entries: source,
    })?)
}

fn compatibility_metadata() -> CompatibilityMetadata {
    CompatibilityMetadata {
        schema_version: 1,
        rows: CompatibilityRows {
            default_height: 100,
            frozen_rows: 1,
        },
        columns: vec![
            CompatibilityColumn {
                key: "name",
                width: 220,
                bold: Some(true),
            },
            CompatibilityColumn {
                key: "title",
                width: 220,
                bold: None,
            },
            CompatibilityColumn {
                key: "id",
                width: 140,
                bold: None,
            },
            CompatibilityColumn {
                key: "image-number",
                width: 110,
                bold: None,
            },
            CompatibilityColumn {
                key: "rendered-text",
                width: 420,
                bold: None,
            },
            CompatibilityColumn {
                key: "signature-cards[0]",
                width: 220,
                bold: None,
            },
        ],
    }
}

pub(crate) fn validate(source: &[AvatarDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    let mut images = BTreeSet::new();
    for avatar in source {
        if !ids.insert(avatar.id) {
            bail!("duplicate DreamAvatar id: {}", avatar.id);
        }
        if !images.insert(avatar.portrait.image) {
            bail!(
                "duplicate DreamAvatar portrait image: {}",
                avatar.portrait.image
            );
        }
        if avatar.tide_pool.facets.is_empty() {
            bail!("DreamAvatar {} must contain at least one facet tide", avatar.id);
        }
        if avatar.portrait.image == 0 || avatar.portrait.image > 9_999 {
            bail!(
                "DreamAvatar {} portrait image must be in [1, 9999]",
                avatar.id
            );
        }
        for (field, value) in [("name", &avatar.name), ("title", &avatar.title)] {
            if source_text(value)?.trim().is_empty() {
                bail!("DreamAvatar {} has an empty {field}", avatar.id);
            }
        }
        if avatar.ability_text.is_empty() {
            bail!("DreamAvatar {} has no ability text", avatar.id);
        }
        for (index, paragraph) in avatar.ability_text.iter().enumerate() {
            if source_text(paragraph)?.trim().is_empty() {
                bail!(
                    "DreamAvatar {} ability_text[{index}] must be non-empty",
                    avatar.id
                );
            }
        }
        validate_focus(avatar)?;
        validate_signature_ids(avatar.id, &avatar.signature_card_ids)?;
    }
    Ok(())
}

pub fn validate_tide_references(
    source: &[AvatarDefinition],
    tide_kinds: &BTreeMap<TideId, TideKind>,
) -> Result<()> {
    validate(source)?;
    for avatar in source {
        let mut referenced = BTreeSet::new();
        if let Some(starter) = avatar.tide_pool.starter {
            require_tide_kind(tide_kinds, starter, TideKind::Signature, "starter")?;
            referenced.insert(starter);
        }
        for (ids, expected, label) in [
            (&avatar.tide_pool.facets, TideKind::Facet, "facet"),
            (&avatar.tide_pool.neutral, TideKind::Neutral, "neutral"),
        ] {
            for id in ids {
                require_tide_kind(tide_kinds, *id, expected, label)?;
                if !referenced.insert(*id) {
                    bail!("DreamAvatar {} repeats Tide UUID {id}", avatar.id);
                }
            }
        }
    }
    Ok(())
}

fn require_tide_kind(
    tide_kinds: &BTreeMap<TideId, TideKind>,
    id: TideId,
    expected: TideKind,
    label: &str,
) -> Result<()> {
    let Some(actual) = tide_kinds.get(&id) else {
        bail!("{label} reference names unknown Tide UUID {id}");
    };
    if *actual != expected {
        bail!("{label} reference {id} names a {actual:?} tide");
    }
    Ok(())
}

fn validate_focus(avatar: &AvatarDefinition) -> Result<()> {
    for (axis, value) in [
        ("x", avatar.portrait.focus.x),
        ("y", avatar.portrait.focus.y),
    ] {
        if !value.is_finite() || !(0.0..=1.0).contains(&value) {
            bail!(
                "DreamAvatar {} portrait focus {axis} must be finite and in [0, 1]",
                avatar.id
            );
        }
    }
    Ok(())
}

fn validate_signature_ids(avatar_id: DreamAvatarId, card_ids: &[CardId]) -> Result<()> {
    let mut unique = BTreeSet::new();
    for card_id in card_ids {
        if !unique.insert(*card_id) {
            bail!("DreamAvatar {avatar_id} repeats signature card id {card_id}");
        }
    }
    Ok(())
}

pub fn validate_internal_metadata(
    avatars: &[AvatarDefinition],
    metadata: &[AvatarMetadata],
) -> Result<()> {
    validate_metadata_shape(metadata)?;
    let avatar_ids: BTreeSet<_> = avatars.iter().map(|avatar| avatar.id).collect();
    for entry in metadata {
        if !avatar_ids.contains(&entry.avatar_id) {
            bail!(
                "internal avatar metadata references unknown DreamAvatar {}",
                entry.avatar_id
            );
        }
        let avatar = avatars
            .iter()
            .find(|avatar| avatar.id == entry.avatar_id)
            .expect("validated metadata reference");
        if avatar.signature_card_ids.is_empty() {
            bail!(
                "internal avatar metadata for {} requires signature cards",
                entry.avatar_id
            );
        }
    }
    Ok(())
}

fn validate_metadata_shape(metadata: &[AvatarMetadata]) -> Result<()> {
    let mut metadata_ids = BTreeSet::new();
    for entry in metadata {
        if !metadata_ids.insert(entry.avatar_id) {
            bail!(
                "duplicate internal avatar metadata for DreamAvatar {}",
                entry.avatar_id
            );
        }
        if entry.mtg_archetype.trim().is_empty() {
            bail!(
                "internal avatar metadata for {} has an empty MTG archetype",
                entry.avatar_id
            );
        }
    }
    Ok(())
}

pub fn validate_signature_card_references(
    avatars: &[AvatarDefinition],
    known_card_ids: &BTreeSet<String>,
) -> Result<()> {
    for avatar in avatars {
        for card_id in &avatar.signature_card_ids {
            if !known_card_ids.contains(&card_id.to_string()) {
                bail!(
                    "DreamAvatar {} references unknown signature card {}",
                    avatar.id,
                    card_id
                );
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    fn ls(text: impl Into<String>) -> LocalizedString {
        super::super::localization::localized_source(text.into()).unwrap()
    }

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";
    const CARD_ONE: &str = "00000000-0000-4000-8000-000000000101";
    const CARD_TWO: &str = "00000000-0000-4000-8000-000000000102";

    fn synthetic_source() -> &'static str {
        r##"// Synthetic DreamAvatar definitions.

#![enable(implicit_some)]
[
  AvatarDefinition(
    name: Tx("Límbø"),
    id: "00000000-0000-4000-8000-000000000001",
    ability_text: [Tx("First line"), Tx("Second line")],
    title: Tx("First"),
    portrait: (image: 7, focus: (x: 0.25, y: 0.75)),
    starting_essence: 137,
    signature_card_ids: [
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ],
    tide_pool: (
      starter: Some("00000000-0000-4000-8000-000000000201"),
      facets: ["00000000-0000-4000-8000-000000000202"],
      neutral: ["00000000-0000-4000-8000-000000000203"],
    ),
  ),
  AvatarDefinition(
    name: Tx("Second"),
    id: "00000000-0000-4000-8000-000000000002",
    ability_text: [Tx("Ability")],
    title: Tx("Without signatures"),
    portrait: (image: 42, focus: (x: 0.5, y: 0.4)),
    tide_pool: (
      starter: None,
      facets: ["00000000-0000-4000-8000-000000000204"],
      neutral: [],
    ),
  ),
]
"##
    }

    fn synthetic_metadata() -> &'static str {
        r##"// Synthetic internal avatar metadata.

#![enable(implicit_some)]
[
  AvatarMetadata(
    avatar_id: "00000000-0000-4000-8000-000000000001",
    mtg_archetype: "An Archetype",
  ),
]
"##
    }

    #[test]
    fn lowers_ordered_records_ability_paragraphs_signatures_and_optional_tuning() {
        let source: Vec<AvatarDefinition> = ron::from_str(synthetic_source()).unwrap();
        let output = lower(source).unwrap();
        let avatars = output["dreamAvatar"].as_array().unwrap();
        assert_eq!(avatars.len(), 2);
        assert_eq!(avatars[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(avatars[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(avatars[0]["image-number"].as_str(), Some("0007"));
        assert_eq!(
            avatars[0]["rendered-text"].as_str(),
            Some("First line\n\nSecond line")
        );
        assert_eq!(avatars[0]["starting-essence"].as_integer(), Some(137));
        assert!(avatars[0].get("mtg-name").is_none());
        assert_eq!(
            avatars[0]["signature-cards"].as_array().unwrap(),
            &vec![CARD_ONE.into(), CARD_TWO.into()]
        );
        assert!(avatars[1].get("starting-essence").is_none());
        assert!(avatars[1].get("mtg-name").is_none());
        assert!(avatars[1].get("signature-cards").is_none());
        assert_eq!(
            avatars[0]["tide-pool"]["starter"].as_str(),
            Some("00000000-0000-4000-8000-000000000201")
        );
        assert_eq!(
            avatars[1]["tide-pool"]["facets"][0].as_str(),
            Some("00000000-0000-4000-8000-000000000204")
        );
        assert_eq!(output["metadata"]["schema_version"].as_integer(), Some(1));
        assert_eq!(
            output["metadata"]["columns"][5]["key"].as_str(),
            Some("signature-cards[0]")
        );
    }

    #[test]
    fn omits_signature_cards_when_absent() {
        let mut source: Vec<AvatarDefinition> = ron::from_str(synthetic_source()).unwrap();
        source.truncate(1);
        source[0].signature_card_ids.clear();
        let output = lower(source).unwrap();
        let avatar = &output["dreamAvatar"][0];
        assert!(avatar.get("signature-cards").is_none());
    }

    #[test]
    fn lowers_internal_metadata_and_rejects_invalid_records() {
        let metadata: Vec<AvatarMetadata> = ron::from_str(synthetic_metadata()).unwrap();
        let output = lower_metadata(metadata.clone()).unwrap();
        assert_eq!(
            output["avatarMetadata"][0]["avatar_id"].as_str(),
            Some(FIRST_ID)
        );
        assert_eq!(
            output["avatarMetadata"][0]["mtg_archetype"].as_str(),
            Some("An Archetype")
        );

        let mut duplicate = metadata.clone();
        duplicate.push(metadata[0].clone());
        assert!(
            lower_metadata(duplicate)
                .unwrap_err()
                .to_string()
                .contains("duplicate internal avatar metadata")
        );

        let mut empty = metadata;
        empty[0].mtg_archetype.clear();
        assert!(
            lower_metadata(empty)
                .unwrap_err()
                .to_string()
                .contains("empty MTG archetype")
        );
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_ids() {
        let unknown = synthetic_source().replace(
            "name: Tx(\"Límbø\"),",
            "name: Tx(\"Límbø\"), surprise: true,",
        );
        assert!(ron::from_str::<Vec<AvatarDefinition>>(&unknown).is_err());
        let unknown_metadata = synthetic_metadata().replace(
            "mtg_archetype: \"An Archetype\",",
            "mtg_archetype: \"An Archetype\", surprise: true,",
        );
        assert!(ron::from_str::<Vec<AvatarMetadata>>(&unknown_metadata).is_err());
        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        ] {
            assert!(ron::from_str::<DreamAvatarId>(&format!("\"{invalid}\"")).is_err());
        }
        let invalid_card =
            synthetic_source().replacen(CARD_ONE, "00000000-0000-3000-8000-000000000101", 1);
        assert!(ron::from_str::<Vec<AvatarDefinition>>(&invalid_card).is_err());
    }

    #[test]
    fn rejects_duplicate_identity_art_invalid_focus_text_signatures_and_metadata() {
        let source: Vec<AvatarDefinition> = ron::from_str(synthetic_source()).unwrap();

        let mut duplicate_id = source.clone();
        duplicate_id[1].id = duplicate_id[0].id;
        assert!(
            lower(duplicate_id)
                .unwrap_err()
                .to_string()
                .contains("duplicate DreamAvatar id")
        );

        let mut duplicate_art = source.clone();
        duplicate_art[1].portrait.image = duplicate_art[0].portrait.image;
        assert!(
            lower(duplicate_art)
                .unwrap_err()
                .to_string()
                .contains("duplicate DreamAvatar portrait")
        );

        let mut invalid_focus = source.clone();
        invalid_focus[0].portrait.focus.y = f64::NAN;
        assert!(
            lower(invalid_focus)
                .unwrap_err()
                .to_string()
                .contains("focus y")
        );

        let mut empty_name = source.clone();
        empty_name[0].name = ls("  ");
        assert!(
            lower(empty_name)
                .unwrap_err()
                .to_string()
                .contains("empty name")
        );

        let mut empty_text = source.clone();
        empty_text[0].ability_text.clear();
        assert!(
            lower(empty_text)
                .unwrap_err()
                .to_string()
                .contains("no ability text")
        );

        let mut empty_paragraph = source.clone();
        empty_paragraph[0].ability_text[0] = ls("  ");
        assert!(
            lower(empty_paragraph)
                .unwrap_err()
                .to_string()
                .contains("ability_text[0]")
        );

        let mut duplicate_card = source.clone();
        duplicate_card[0].signature_card_ids[1] = duplicate_card[0].signature_card_ids[0];
        assert!(
            lower(duplicate_card)
                .unwrap_err()
                .to_string()
                .contains("repeats signature card")
        );

        let metadata: Vec<AvatarMetadata> = ron::from_str(synthetic_metadata()).unwrap();
        let mut duplicate_metadata = metadata.clone();
        duplicate_metadata.push(metadata[0].clone());
        assert!(
            validate_internal_metadata(&source, &duplicate_metadata)
                .unwrap_err()
                .to_string()
                .contains("duplicate internal avatar metadata")
        );

        let mut unknown_metadata = metadata.clone();
        unknown_metadata[0].avatar_id = source[1].id;
        assert!(
            validate_internal_metadata(&source[..1], &unknown_metadata)
                .unwrap_err()
                .to_string()
                .contains("unknown DreamAvatar")
        );

        assert!(
            validate_internal_metadata(&source, &unknown_metadata)
                .unwrap_err()
                .to_string()
                .contains("requires signature cards")
        );

        let mut empty_archetype = metadata;
        empty_archetype[0].mtg_archetype.clear();
        assert!(
            validate_internal_metadata(&source, &empty_archetype)
                .unwrap_err()
                .to_string()
                .contains("empty MTG archetype")
        );
    }
}

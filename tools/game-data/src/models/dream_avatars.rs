use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AvatarDefinition {
    pub name: String,
    pub id: DreamAvatarId,
    pub ability_text: Vec<String>,
    pub title: String,
    pub portrait: Portrait,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starting_essence: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub signature_card_ids: Vec<CardId>,
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
            CompatibilityDreamAvatar {
                name: avatar.name,
                title: avatar.title,
                id: avatar.id.to_string(),
                image_number: format!("{:04}", avatar.portrait.image),
                portrait_focus: CompatibilityPortraitFocus {
                    x: avatar.portrait.focus.x,
                    y: avatar.portrait.focus.y,
                },
                rendered_text: avatar.ability_text.join("\n\n"),
                starting_essence: avatar.starting_essence,
                signature_cards,
            }
        })
        .collect();
    Ok(toml::Value::try_from(CompatibilityCatalog {
        dream_avatars,
        metadata: compatibility_metadata(),
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

fn validate(source: &[AvatarDefinition]) -> Result<()> {
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
        if avatar.portrait.image == 0 || avatar.portrait.image > 9_999 {
            bail!(
                "DreamAvatar {} portrait image must be in [1, 9999]",
                avatar.id
            );
        }
        for (field, value) in [("name", &avatar.name), ("title", &avatar.title)] {
            if value.trim().is_empty() {
                bail!("DreamAvatar {} has an empty {field}", avatar.id);
            }
        }
        if avatar.ability_text.is_empty() {
            bail!("DreamAvatar {} has no ability text", avatar.id);
        }
        for (index, paragraph) in avatar.ability_text.iter().enumerate() {
            if paragraph.trim().is_empty() {
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
    let avatar_ids: BTreeSet<_> = avatars.iter().map(|avatar| avatar.id).collect();
    let mut metadata_ids = BTreeSet::new();
    for entry in metadata {
        if !avatar_ids.contains(&entry.avatar_id) {
            bail!(
                "internal avatar metadata references unknown DreamAvatar {}",
                entry.avatar_id
            );
        }
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

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};
    use std::fs;
    use std::path::Path;

    use pretty_assertions::assert_eq;

    use super::*;
    use crate::models::compat::CompatDocument;

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";
    const CARD_ONE: &str = "00000000-0000-4000-8000-000000000101";
    const CARD_TWO: &str = "00000000-0000-4000-8000-000000000102";

    fn synthetic_source() -> &'static str {
        r##"// Synthetic DreamAvatar definitions.

#![enable(implicit_some)]
[
  AvatarDefinition(
    name: "Límbø",
    id: "00000000-0000-4000-8000-000000000001",
    ability_text: ["First line", "Second line"],
    title: "First",
    portrait: (image: 7, focus: (x: 0.25, y: 0.75)),
    starting_essence: 137,
    signature_card_ids: [
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ],
  ),
  AvatarDefinition(
    name: "Second",
    id: "00000000-0000-4000-8000-000000000002",
    ability_text: ["Ability"],
    title: "Without signatures",
    portrait: (image: 42, focus: (x: 0.5, y: 0.4)),
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
    fn rejects_unknown_fields_and_noncanonical_ids() {
        let unknown =
            synthetic_source().replace("name: \"Límbø\",", "name: \"Límbø\", surprise: true,");
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
        empty_name[0].name = "  ".into();
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
        empty_paragraph[0].ability_text[0] = "  ".into();
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

    #[test]
    #[ignore = "real-catalog parity probe retained for canonical DreamAvatar review"]
    fn canonical_candidate_matches_current_compatibility_sources() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let current_ron: CompatDocument =
            ron::from_str(&fs::read_to_string(root.join("data/dream_avatars.ron")).unwrap())
                .unwrap();
        let current_toml: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/dream_avatars.toml")).unwrap())
                .unwrap();
        assert_eq!(current_ron.data, current_toml);

        let canonical: Vec<AvatarDefinition> = ron::from_str(
            &fs::read_to_string(root.join("data/dream_avatars_canonical.ron")).unwrap(),
        )
        .unwrap();
        assert_eq!(canonical.len(), 32);
        let internal_metadata: Vec<AvatarMetadata> = ron::from_str(
            &fs::read_to_string(root.join("data/internal/internal_avatar_metadata.ron")).unwrap(),
        )
        .unwrap();
        validate_internal_metadata(&canonical, &internal_metadata).unwrap();

        let id_map = legacy_id_map();
        assert_eq!(id_map.len(), canonical.len());
        let canonical_ids: BTreeSet<_> = canonical
            .iter()
            .map(|avatar| avatar.id.to_string())
            .collect();
        assert_eq!(
            canonical_ids,
            id_map.values().map(|value| (*value).to_owned()).collect()
        );

        let mut normalized = current_ron.data.clone();
        let legacy_avatars = normalized["dreamAvatar"].as_array_mut().unwrap();
        for avatar in legacy_avatars {
            let legacy_id = avatar["id"].as_str().unwrap();
            avatar["id"] = id_map
                .get(legacy_id)
                .unwrap_or_else(|| panic!("unmapped legacy DreamAvatar id {legacy_id}"))
                .to_string()
                .into();
            avatar.as_table_mut().unwrap().remove("mtg-name");
        }
        assert_eq!(lower(canonical.clone()).unwrap(), normalized);

        let expected_metadata: BTreeMap<_, _> = current_ron.data["dreamAvatar"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|avatar| {
                let mtg_archetype = avatar.get("mtg-name")?.as_str().unwrap();
                let legacy_id = avatar["id"].as_str().unwrap();
                Some((id_map[legacy_id].to_owned(), mtg_archetype.to_owned()))
            })
            .collect();
        let actual_metadata: BTreeMap<_, _> = internal_metadata
            .iter()
            .map(|entry| (entry.avatar_id.to_string(), entry.mtg_archetype.clone()))
            .collect();
        assert_eq!(actual_metadata, expected_metadata);

        let cards: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/cards.toml")).unwrap()).unwrap();
        let card_ids: BTreeSet<_> = cards["cards"]
            .as_array()
            .unwrap()
            .iter()
            .map(|card| card["id"].as_str().unwrap())
            .collect();
        for avatar in &canonical {
            let parsed = Uuid::parse_str(&avatar.id.to_string()).unwrap();
            assert_eq!(parsed.get_version(), Some(Version::Random));
            assert_eq!(parsed.get_variant(), Variant::RFC4122);
            assert_eq!(parsed.hyphenated().to_string(), avatar.id.to_string());
            for card_id in &avatar.signature_card_ids {
                assert!(card_ids.contains(card_id.to_string().as_str()));
            }
        }

        verify_foreign_keys(&root, &id_map);
    }

    fn verify_foreign_keys(root: &Path, id_map: &BTreeMap<&'static str, &'static str>) {
        let dreamscapes: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/dreamscapes.toml")).unwrap())
                .unwrap();
        let referenced: BTreeSet<_> = dreamscapes["dreamscapes"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|dreamscape| {
                dreamscape
                    .get("dream-avatar-ids")
                    .and_then(toml::Value::as_array)
                    .into_iter()
                    .flatten()
                    .map(|id| id.as_str().unwrap())
            })
            .collect();
        assert_eq!(referenced, id_map.keys().copied().collect());

        let tutorial: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/tutorial.toml")).unwrap()).unwrap();
        let tutorial_text = tutorial.to_string();
        for legacy_id in tutorial_text
            .split(|character: char| !(character.is_ascii_hexdigit() || character == '-'))
            .filter(|value| value.len() == 36 && id_map.contains_key(value))
        {
            assert!(id_map.contains_key(legacy_id));
        }

        let tides = fs::read_to_string(root.join("data/tides4.jsonc")).unwrap();
        for legacy_id in id_map.keys() {
            assert!(
                tides.contains(legacy_id),
                "tides4 is missing DreamAvatar foreign key {legacy_id}"
            );
        }
    }

    fn legacy_id_map() -> BTreeMap<&'static str, &'static str> {
        BTreeMap::from([
            (
                "BDD3A3A7-242C-4D2B-8071-EBE56891A340",
                "bdd3a3a7-242c-4d2b-8071-ebe56891a340",
            ),
            (
                "B99936CA-97F9-4930-AF5A-FA9EF92557EF",
                "b99936ca-97f9-4930-af5a-fa9ef92557ef",
            ),
            (
                "F0F5449E-01C2-4635-BCE1-76B179FC2108",
                "f0f5449e-01c2-4635-bce1-76b179fc2108",
            ),
            (
                "C72CFD7B-408B-47F6-ADF1-1E486A7E20D3",
                "c72cfd7b-408b-47f6-adf1-1e486a7e20d3",
            ),
            (
                "B9BF6D4B-907C-4750-B51C-811AFF29DE59",
                "b9bf6d4b-907c-4750-b51c-811aff29de59",
            ),
            (
                "3C4773E4-F8E1-4686-86CB-B407A42489D4",
                "3c4773e4-f8e1-4686-86cb-b407a42489d4",
            ),
            (
                "8A2FCD65-BBA7-459C-A6B0-F0391B9293FD",
                "8a2fcd65-bba7-459c-a6b0-f0391b9293fd",
            ),
            (
                "1CC5A88A-134F-42F7-A0AE-95ACE44B3745",
                "1cc5a88a-134f-42f7-a0ae-95ace44b3745",
            ),
            (
                "9E4862FD-E18C-463E-9D5F-E5D73C29A66F",
                "9e4862fd-e18c-463e-9d5f-e5d73c29a66f",
            ),
            (
                "BA973428-6D90-4847-B779-CB7E25A5AC84",
                "ba973428-6d90-4847-b779-cb7e25a5ac84",
            ),
            (
                "9E19B3D1-12F2-43C1-9CB1-08DE7CD32E32",
                "9e19b3d1-12f2-43c1-9cb1-08de7cd32e32",
            ),
            (
                "6029BE40-75B9-4C07-912F-9718B6C5C747",
                "6029be40-75b9-4c07-912f-9718b6c5c747",
            ),
            (
                "133E22DD-F81B-406D-B4E3-98C346D7FD4E",
                "133e22dd-f81b-406d-b4e3-98c346d7fd4e",
            ),
            (
                "9D64A4A2-3DC7-456E-9EB2-5FE3A48883C4",
                "9d64a4a2-3dc7-456e-9eb2-5fe3a48883c4",
            ),
            (
                "16B579FE-C15B-4DF6-8262-D45CE44732AE",
                "16b579fe-c15b-4df6-8262-d45ce44732ae",
            ),
            (
                "86026206-1B11-4F38-A24E-FD3C697F5353",
                "86026206-1b11-4f38-a24e-fd3c697f5353",
            ),
            (
                "6488452D-4E9E-466C-96DF-716D4EC646B1",
                "6488452d-4e9e-466c-96df-716d4ec646b1",
            ),
            (
                "B8C1B0AB-0FE6-47D6-B576-0C2231AEB81E",
                "b8c1b0ab-0fe6-47d6-b576-0c2231aeb81e",
            ),
            (
                "81954CA0-DA36-49DD-915C-1CCB1B2D7B05",
                "81954ca0-da36-49dd-915c-1ccb1b2d7b05",
            ),
            (
                "60BD584B-5BC8-4EE7-8A98-CBB304EB71AB",
                "60bd584b-5bc8-4ee7-8a98-cbb304eb71ab",
            ),
            (
                "5E28154D-770A-4B84-8AAC-9DE44F5D7D02",
                "5e28154d-770a-4b84-8aac-9de44f5d7d02",
            ),
            (
                "4D5E3933-7DD6-406B-922D-DD78ACFA044A",
                "4d5e3933-7dd6-406b-922d-dd78acfa044a",
            ),
            (
                "2B7E921D-0CD7-4C20-A415-9E7EEDE7B477",
                "2b7e921d-0cd7-4c20-a415-9e7eede7b477",
            ),
            (
                "84E7020C-7384-4CC3-A20F-AB05F03CC375",
                "84e7020c-7384-4cc3-a20f-ab05f03cc375",
            ),
            (
                "F6208407-C4E9-42AC-B533-346704F5E39E",
                "f6208407-c4e9-42ac-b533-346704f5e39e",
            ),
            (
                "FE2510D9-BFEE-4C35-97F9-30E0CD2E2851",
                "fe2510d9-bfee-4c35-97f9-30e0cd2e2851",
            ),
            (
                "94E7C651-25E9-4A62-9DE4-EAF5BA20542C",
                "94e7c651-25e9-4a62-9de4-eaf5ba20542c",
            ),
            (
                "3EBABA62-9000-429D-B203-2A5A9724389A",
                "3ebaba62-9000-429d-b203-2a5a9724389a",
            ),
            (
                "2C53B1B9-9291-4BBA-8D3A-F40B545C8F3C",
                "2c53b1b9-9291-4bba-8d3a-f40b545c8f3c",
            ),
            (
                "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
                "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
            ),
            (
                "BF72ADFF-7D74-4BE8-9B93-1DB7BA13A1DB",
                "bf72adff-7d74-4be8-9b93-1db7ba13a1db",
            ),
            (
                "91D4C3B5-FD63-480B-9ED5-979109A227BB",
                "91d4c3b5-fd63-480b-9ed5-979109a227bb",
            ),
        ])
    }
}

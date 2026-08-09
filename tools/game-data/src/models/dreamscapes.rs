use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Context, Result, ensure};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::atlas::SiteType;

const LEGACY_ID_MAP: [(&str, &str); 12] = [
    ("firstlight_meadow", "0217b10e-bf48-4e27-95f0-846fd802b730"),
    ("tumbleleaf_village", "08e11635-9f04-48fd-a9c8-5a9f68c80958"),
    ("pharaohs_gate", "b25b9906-8380-45bf-9435-678ce18316ea"),
    ("winterwake_fjords", "7d793d30-8a0f-4f84-a446-cdde502710e8"),
    ("frostforge", "8e7d0818-ba6a-4dc9-8b3d-a12c62aefa44"),
    ("hopes_end", "562f9d1f-5bbf-4dc5-9edd-7e8d538a1651"),
    ("tsukiren", "823dc726-db0f-4367-8442-70600a20ad2e"),
    ("wilderveil", "f52bdeb1-0db6-44ee-80ea-b99bd18dff7d"),
    ("rust_expanse", "6f16a1c9-c2fa-494d-9d9d-4da00e011491"),
    ("farpoint_station", "138eff95-3301-4f76-aeb1-31bf0dc8963d"),
    ("grid_city", "6c03e9d1-21fe-4c13-b940-2325d308cb14"),
    ("limbo", "f31e1199-70bc-4110-85f9-505afebb02c4"),
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamscapeDefinition {
    pub id: DreamscapeId,
    pub name: String,
    pub art: DreamscapeArt,
    pub kind: DreamscapeKind,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamscapeArt {
    pub scene: AssetReference,
    pub atlas_node: AssetReference,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AssetReference {
    pub key: String,
    pub source: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum DreamscapeKind {
    Starter {
        signature_site: SiteType,
        fixed_sites: Vec<SiteType>,
    },
    Standard {
        affiliation_id: AffiliationId,
        opponent_dream_avatar_ids: Vec<DreamAvatarId>,
    },
    Boss,
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

canonical_uuid!(DreamscapeId, "Dreamscape identifier");
canonical_uuid!(AffiliationId, "affiliation identifier");
canonical_uuid!(DreamAvatarId, "DreamAvatar identifier");

#[derive(Serialize)]
struct CompatibilityCatalog {
    dreamscapes: Vec<CompatibilityDreamscape>,
}

#[derive(Serialize)]
struct CompatibilityDreamscape {
    id: &'static str,
    name: String,
    #[serde(rename = "signature-site", skip_serializing_if = "Option::is_none")]
    signature_site: Option<&'static str>,
    #[serde(rename = "is-starter", skip_serializing_if = "Option::is_none")]
    is_starter: Option<bool>,
    #[serde(rename = "fixed-sites", skip_serializing_if = "Option::is_none")]
    fixed_sites: Option<Vec<&'static str>>,
    #[serde(rename = "affiliation-id", skip_serializing_if = "Option::is_none")]
    affiliation_id: Option<String>,
    #[serde(rename = "dream-avatar-ids", skip_serializing_if = "Option::is_none")]
    dream_avatar_ids: Option<Vec<String>>,
}

pub fn lower(source: Vec<DreamscapeDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let dreamscapes = source
        .into_iter()
        .map(|dreamscape| {
            let id = compatibility_key(dreamscape.id)?;
            let (signature_site, is_starter, fixed_sites, affiliation_id, dream_avatar_ids) =
                match dreamscape.kind {
                    DreamscapeKind::Starter {
                        signature_site,
                        fixed_sites,
                    } => (
                        Some(signature_site.as_compat()),
                        Some(true),
                        Some(fixed_sites.into_iter().map(SiteType::as_compat).collect()),
                        None,
                        None,
                    ),
                    DreamscapeKind::Standard {
                        affiliation_id,
                        opponent_dream_avatar_ids,
                    } => (
                        None,
                        None,
                        None,
                        Some(affiliation_id.to_string()),
                        Some(
                            opponent_dream_avatar_ids
                                .into_iter()
                                .map(|avatar_id| avatar_id.to_string())
                                .collect(),
                        ),
                    ),
                    DreamscapeKind::Boss => return Ok(None),
                };
            Ok(Some(CompatibilityDreamscape {
                id,
                name: dreamscape.name,
                signature_site,
                is_starter,
                fixed_sites,
                affiliation_id,
                dream_avatar_ids,
            }))
        })
        .collect::<Result<Vec<_>>>()?
        .into_iter()
        .flatten()
        .collect();
    Ok(toml::Value::try_from(CompatibilityCatalog { dreamscapes })?)
}

pub(crate) fn validate(source: &[DreamscapeDefinition]) -> Result<()> {
    ensure!(!source.is_empty(), "Dreamscape catalog must not be empty");
    let mut dreamscape_ids = BTreeSet::new();
    let mut affiliation_ids = BTreeSet::new();
    let mut dream_avatar_ids = BTreeSet::new();
    let mut scene_keys = BTreeSet::new();
    let mut scene_sources = BTreeSet::new();
    let mut atlas_node_keys = BTreeSet::new();
    let mut atlas_node_sources = BTreeSet::new();
    let mut starter_count = 0;
    let mut boss_count = 0;

    for dreamscape in source {
        ensure!(
            dreamscape_ids.insert(dreamscape.id),
            "duplicate Dreamscape id: {}",
            dreamscape.id
        );
        ensure!(
            !dreamscape.name.trim().is_empty(),
            "Dreamscape {} has an empty name",
            dreamscape.id
        );
        let legacy_id = compatibility_key(dreamscape.id)?;
        validate_asset_reference(
            dreamscape,
            "scene",
            &dreamscape.art.scene,
            legacy_id,
            &mut scene_keys,
            &mut scene_sources,
        )?;
        validate_asset_reference(
            dreamscape,
            "atlas node",
            &dreamscape.art.atlas_node,
            legacy_id,
            &mut atlas_node_keys,
            &mut atlas_node_sources,
        )?;

        match &dreamscape.kind {
            DreamscapeKind::Starter {
                signature_site,
                fixed_sites,
            } => {
                starter_count += 1;
                ensure!(
                    !fixed_sites.is_empty(),
                    "starter Dreamscape {} has no fixed sites",
                    dreamscape.id
                );
                ensure!(
                    fixed_sites.contains(signature_site),
                    "starter Dreamscape {} fixed sites omit its signature site",
                    dreamscape.id
                );
            }
            DreamscapeKind::Standard {
                affiliation_id,
                opponent_dream_avatar_ids,
            } => {
                ensure!(
                    legacy_id != "limbo",
                    "Limbo must use the Boss Dreamscape kind"
                );
                ensure!(
                    affiliation_ids.insert(*affiliation_id),
                    "Dreamscapes repeat affiliation id {affiliation_id}"
                );
                ensure!(
                    (3..=4).contains(&opponent_dream_avatar_ids.len()),
                    "Dreamscape {} must have three or four opponent DreamAvatars",
                    dreamscape.id
                );
                let mut local_opponents = BTreeSet::new();
                for opponent_id in opponent_dream_avatar_ids {
                    ensure!(
                        local_opponents.insert(*opponent_id),
                        "Dreamscape {} repeats opponent DreamAvatar {opponent_id}",
                        dreamscape.id
                    );
                    ensure!(
                        dream_avatar_ids.insert(*opponent_id),
                        "opponent DreamAvatar {opponent_id} belongs to more than one Dreamscape"
                    );
                }
            }
            DreamscapeKind::Boss => {
                boss_count += 1;
                ensure!(legacy_id == "limbo", "Boss Dreamscape must be Limbo");
            }
        }
    }

    ensure!(
        starter_count == 1,
        "Dreamscape catalog must contain exactly one starter; found {starter_count}"
    );
    ensure!(
        boss_count == 1,
        "Dreamscape catalog must contain exactly one boss; found {boss_count}"
    );
    Ok(())
}

fn validate_asset_reference(
    dreamscape: &DreamscapeDefinition,
    role: &str,
    asset: &AssetReference,
    compatibility_key: &str,
    keys: &mut BTreeSet<String>,
    sources: &mut BTreeSet<String>,
) -> Result<()> {
    ensure!(
        !asset.key.trim().is_empty(),
        "Dreamscape {} has an empty {role} art key",
        dreamscape.id
    );
    ensure!(
        !asset.source.trim().is_empty(),
        "Dreamscape {} has an empty {role} art source",
        dreamscape.id
    );
    ensure!(
        asset.key == compatibility_key,
        "Dreamscape {} {role} art key must match its legacy compatibility key",
        dreamscape.id
    );
    ensure!(
        keys.insert(asset.key.clone()),
        "Dreamscapes repeat {role} art key {}",
        asset.key
    );
    ensure!(
        sources.insert(asset.source.clone()),
        "Dreamscapes repeat {role} art source {}",
        asset.source
    );
    Ok(())
}

fn compatibility_key(id: DreamscapeId) -> Result<&'static str> {
    let canonical = id.to_string();
    LEGACY_ID_MAP
        .iter()
        .find_map(|(legacy, mapped)| (*mapped == canonical).then_some(*legacy))
        .ok_or_else(|| anyhow::anyhow!("Dreamscape {id} has no legacy compatibility mapping"))
}

pub(crate) fn canonical_id(compatibility_id: &str) -> Result<DreamscapeId> {
    LEGACY_ID_MAP
        .iter()
        .find_map(|(legacy, canonical)| (*legacy == compatibility_id).then_some(*canonical))
        .with_context(|| format!("Dreamscape compatibility identity {compatibility_id} is unknown"))
        .and_then(|canonical| DreamscapeId::parse(canonical).map_err(anyhow::Error::msg))
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    const STARTER_ID: &str = "0217b10e-bf48-4e27-95f0-846fd802b730";
    const REGION_ID: &str = "08e11635-9f04-48fd-a9c8-5a9f68c80958";
    const BOSS_ID: &str = "f31e1199-70bc-4110-85f9-505afebb02c4";
    const AFFILIATION_ID: &str = "4b715cd0-8b41-4b82-9cef-c47b15e8992b";
    const AVATAR_ONE: &str = "94e7c651-25e9-4a62-9de4-eaf5ba20542c";
    const AVATAR_TWO: &str = "3ebaba62-9000-429d-b203-2a5a9724389a";
    const AVATAR_THREE: &str = "2c53b1b9-9291-4bba-8d3a-f40b545c8f3c";

    fn synthetic_source() -> String {
        format!(
            r##"#![enable(implicit_some)]
[
  DreamscapeDefinition(
    id: "{STARTER_ID}",
    name: "Opening",
    art: (
      scene: (key: "firstlight_meadow", source: "opening.png"),
      atlas_node: (key: "firstlight_meadow", source: "opening_icon.png"),
    ),
    kind: Starter(
      signature_site: Draft,
      fixed_sites: [Draft, Draft, DreamsignRevelation, Battle],
    ),
  ),
  DreamscapeDefinition(
    id: "{REGION_ID}",
    name: "Région",
    art: (
      scene: (key: "tumbleleaf_village", source: "region.png"),
      atlas_node: (key: "tumbleleaf_village", source: "region_icon.png"),
    ),
    kind: Standard(
      affiliation_id: "{AFFILIATION_ID}",
      opponent_dream_avatar_ids: ["{AVATAR_ONE}", "{AVATAR_TWO}", "{AVATAR_THREE}"],
    ),
  ),
  DreamscapeDefinition(
    id: "{BOSS_ID}",
    name: "Final Dream",
    art: (
      scene: (key: "limbo", source: "final.png"),
      atlas_node: (key: "limbo", source: "final_icon.png"),
    ),
    kind: Boss,
  ),
]
"##
        )
    }

    #[test]
    fn lowers_roles_ordered_site_enums_and_compatibility_identifiers() {
        let source: Vec<DreamscapeDefinition> = ron::from_str(&synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let dreamscapes = lowered["dreamscapes"].as_array().unwrap();

        assert_eq!(dreamscapes.len(), 2);
        assert_eq!(dreamscapes[0]["id"].as_str(), Some("firstlight_meadow"));
        assert_eq!(dreamscapes[0]["name"].as_str(), Some("Opening"));
        assert_eq!(dreamscapes[0]["is-starter"].as_bool(), Some(true));
        assert_eq!(
            dreamscapes[0]["fixed-sites"].as_array().unwrap(),
            &vec![
                toml::Value::String("Draft".into()),
                toml::Value::String("Draft".into()),
                toml::Value::String("DreamsignRevelation".into()),
                toml::Value::String("Battle".into()),
            ]
        );
        assert_eq!(dreamscapes[1]["id"].as_str(), Some("tumbleleaf_village"));
        assert_eq!(dreamscapes[1]["name"].as_str(), Some("Région"));
        assert_eq!(
            dreamscapes[1]["dream-avatar-ids"].as_array().unwrap()[0].as_str(),
            Some("94e7c651-25e9-4a62-9de4-eaf5ba20542c")
        );
        assert!(
            !dreamscapes[1]
                .as_table()
                .unwrap()
                .contains_key("signature-site")
        );
        assert!(
            dreamscapes
                .iter()
                .all(|dreamscape| dreamscape["id"].as_str() != Some("limbo"))
        );
        assert!(
            dreamscapes
                .iter()
                .all(|dreamscape| !dreamscape.as_table().unwrap().contains_key("art"))
        );
    }

    #[test]
    fn site_enum_exhaustively_preserves_compatibility_names() {
        let cases = [
            (SiteType::Battle, "Battle"),
            (SiteType::Draft, "Draft"),
            (SiteType::Shop, "Shop"),
            (SiteType::Purge, "Purge"),
            (SiteType::Essence, "Essence"),
            (SiteType::Transfiguration, "Transfiguration"),
            (SiteType::Duplication, "Duplication"),
            (SiteType::Reward, "Reward"),
            (SiteType::Augury, "Augury"),
            (SiteType::DreamsignBazaar, "DreamsignBazaar"),
            (SiteType::DreamsignRevelation, "DreamsignRevelation"),
            (SiteType::RandomSite, "RandomSite"),
            (SiteType::Gamble, "Gamble"),
            (SiteType::Exploration, "Exploration"),
        ];
        for (site_type, expected) in cases {
            assert_eq!(site_type.as_compat(), expected);
        }
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown =
            synthetic_source().replace("name: \"Opening\",", "name: \"Opening\", extra: 1,");
        assert!(ron::from_str::<Vec<DreamscapeDefinition>>(&unknown).is_err());

        for invalid in [
            "legacy_slug",
            "0217b10e-bf48-3e27-95f0-846fd802b730",
            "0217B10E-BF48-4E27-95F0-846FD802B730",
        ] {
            let source = synthetic_source().replacen(STARTER_ID, invalid, 1);
            assert!(
                ron::from_str::<Vec<DreamscapeDefinition>>(&source).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[test]
    fn rejects_invalid_catalog_relationships() {
        let duplicate_id = synthetic_source().replace(REGION_ID, STARTER_ID);
        assert_error_contains(&duplicate_id, "duplicate Dreamscape id");

        let multiple_starters = synthetic_source().replace(
            &format!(
                "kind: Standard(\n      affiliation_id: \"{AFFILIATION_ID}\",\n      opponent_dream_avatar_ids: [\"{AVATAR_ONE}\", \"{AVATAR_TWO}\", \"{AVATAR_THREE}\"],\n    )"
            ),
            "kind: Starter(signature_site: Battle, fixed_sites: [Battle])",
        );
        assert_error_contains(&multiple_starters, "exactly one starter");

        let no_boss = synthetic_source().replace(
            &format!(
                "  DreamscapeDefinition(\n    id: \"{BOSS_ID}\",\n    name: \"Final Dream\",\n    art: (\n      scene: (key: \"limbo\", source: \"final.png\"),\n      atlas_node: (key: \"limbo\", source: \"final_icon.png\"),\n    ),\n    kind: Boss,\n  ),\n"
            ),
            "",
        );
        assert_error_contains(&no_boss, "exactly one boss");

        let missing_signature = synthetic_source().replace(
            "fixed_sites: [Draft, Draft, DreamsignRevelation, Battle]",
            "fixed_sites: [Battle]",
        );
        assert_error_contains(&missing_signature, "omit its signature site");

        let too_few_residents = synthetic_source().replace(
            &format!("[\"{AVATAR_ONE}\", \"{AVATAR_TWO}\", \"{AVATAR_THREE}\"]"),
            &format!("[\"{AVATAR_ONE}\", \"{AVATAR_TWO}\"]"),
        );
        assert_error_contains(&too_few_residents, "three or four opponent");

        let duplicate_opponent = synthetic_source().replace(AVATAR_THREE, AVATAR_ONE);
        assert_error_contains(&duplicate_opponent, "repeats opponent DreamAvatar");

        let empty_name = synthetic_source().replace("name: \"Opening\"", "name: \"  \"");
        assert_error_contains(&empty_name, "empty name");

        let wrong_art_key = synthetic_source().replace(
            "scene: (key: \"tumbleleaf_village\", source: \"region.png\")",
            "scene: (key: \"wrong\", source: \"region.png\")",
        );
        assert_error_contains(&wrong_art_key, "must match its legacy compatibility key");

        let duplicate_art_source = synthetic_source().replace("region.png", "opening.png");
        assert_error_contains(&duplicate_art_source, "repeat scene art source");
    }

    fn assert_error_contains(source: &str, expected: &str) {
        let parsed: Vec<DreamscapeDefinition> = ron::from_str(source).unwrap();
        assert!(
            lower(parsed).unwrap_err().to_string().contains(expected),
            "error did not contain {expected}"
        );
    }
}

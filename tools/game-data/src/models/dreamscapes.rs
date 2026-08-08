use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Result, ensure};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::atlas::SiteType;

const LEGACY_ID_MAP: [(&str, &str); 11] = [
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
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamscapeDefinition {
    pub id: DreamscapeId,
    pub name: String,
    pub art_direction: String,
    pub kind: DreamscapeKind,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum DreamscapeKind {
    Starter {
        signature_site: SiteType,
        fixed_sites: Vec<SiteType>,
    },
    Affiliated {
        affiliation_id: AffiliationId,
        dream_avatar_ids: Vec<DreamAvatarId>,
    },
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
    aesthetic: String,
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
                        Some(site_type_compatibility_name(signature_site)),
                        Some(true),
                        Some(
                            fixed_sites
                                .into_iter()
                                .map(site_type_compatibility_name)
                                .collect(),
                        ),
                        None,
                        None,
                    ),
                    DreamscapeKind::Affiliated {
                        affiliation_id,
                        dream_avatar_ids,
                    } => (
                        None,
                        None,
                        None,
                        Some(affiliation_id.to_string()),
                        Some(
                            dream_avatar_ids
                                .into_iter()
                                .map(|avatar_id| avatar_id.to_string().to_ascii_uppercase())
                                .collect(),
                        ),
                    ),
                };
            Ok(CompatibilityDreamscape {
                id,
                name: dreamscape.name,
                aesthetic: dreamscape.art_direction,
                signature_site,
                is_starter,
                fixed_sites,
                affiliation_id,
                dream_avatar_ids,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog { dreamscapes })?)
}

fn validate(source: &[DreamscapeDefinition]) -> Result<()> {
    ensure!(!source.is_empty(), "Dreamscape catalog must not be empty");
    let mut dreamscape_ids = BTreeSet::new();
    let mut affiliation_ids = BTreeSet::new();
    let mut dream_avatar_ids = BTreeSet::new();
    let mut starter_count = 0;

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
        ensure!(
            !dreamscape.art_direction.trim().is_empty(),
            "Dreamscape {} has empty art direction",
            dreamscape.id
        );
        compatibility_key(dreamscape.id)?;

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
            DreamscapeKind::Affiliated {
                affiliation_id,
                dream_avatar_ids: residents,
            } => {
                ensure!(
                    affiliation_ids.insert(*affiliation_id),
                    "Dreamscapes repeat affiliation id {affiliation_id}"
                );
                ensure!(
                    (3..=4).contains(&residents.len()),
                    "Dreamscape {} must have three or four resident DreamAvatars",
                    dreamscape.id
                );
                let mut local_residents = BTreeSet::new();
                for resident_id in residents {
                    ensure!(
                        local_residents.insert(*resident_id),
                        "Dreamscape {} repeats resident DreamAvatar {resident_id}",
                        dreamscape.id
                    );
                    ensure!(
                        dream_avatar_ids.insert(*resident_id),
                        "DreamAvatar {resident_id} belongs to more than one Dreamscape"
                    );
                }
            }
        }
    }

    ensure!(
        starter_count == 1,
        "Dreamscape catalog must contain exactly one starter; found {starter_count}"
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

fn site_type_compatibility_name(site_type: SiteType) -> &'static str {
    match site_type {
        SiteType::Battle => "Battle",
        SiteType::Draft => "Draft",
        SiteType::Shop => "Shop",
        SiteType::Purge => "Purge",
        SiteType::Essence => "Essence",
        SiteType::Transfiguration => "Transfiguration",
        SiteType::Duplication => "Duplication",
        SiteType::Reward => "Reward",
        SiteType::Augury => "Augury",
        SiteType::DreamsignMarket => "DreamsignMarket",
        SiteType::DreamsignRevelation => "DreamsignRevelation",
        SiteType::RandomSite => "RandomSite",
        SiteType::Gamble => "Gamble",
        SiteType::Exploration => "Exploration",
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};
    use std::fs;
    use std::path::Path;

    use pretty_assertions::assert_eq;

    use super::super::compat::CompatDocument;
    use super::*;

    const STARTER_ID: &str = "0217b10e-bf48-4e27-95f0-846fd802b730";
    const REGION_ID: &str = "08e11635-9f04-48fd-a9c8-5a9f68c80958";
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
    art_direction: "Morning mist over a quiet field.",
    kind: Starter(
      signature_site: Draft,
      fixed_sites: [Draft, Draft, DreamsignRevelation, Battle],
    ),
  ),
  DreamscapeDefinition(
    id: "{REGION_ID}",
    name: "Région",
    art_direction: "Moonlight across old stone.",
    kind: Affiliated(
      affiliation_id: "{AFFILIATION_ID}",
      dream_avatar_ids: ["{AVATAR_ONE}", "{AVATAR_TWO}", "{AVATAR_THREE}"],
    ),
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
        assert_eq!(
            dreamscapes[0]["aesthetic"].as_str(),
            Some("Morning mist over a quiet field.")
        );
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
            Some("94E7C651-25E9-4A62-9DE4-EAF5BA20542C")
        );
        assert!(
            !dreamscapes[1]
                .as_table()
                .unwrap()
                .contains_key("signature-site")
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
            (SiteType::DreamsignMarket, "DreamsignMarket"),
            (SiteType::DreamsignRevelation, "DreamsignRevelation"),
            (SiteType::RandomSite, "RandomSite"),
            (SiteType::Gamble, "Gamble"),
            (SiteType::Exploration, "Exploration"),
        ];
        for (site_type, expected) in cases {
            assert_eq!(site_type_compatibility_name(site_type), expected);
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
                "kind: Affiliated(\n      affiliation_id: \"{AFFILIATION_ID}\",\n      dream_avatar_ids: [\"{AVATAR_ONE}\", \"{AVATAR_TWO}\", \"{AVATAR_THREE}\"],\n    )"
            ),
            "kind: Starter(signature_site: Battle, fixed_sites: [Battle])",
        );
        assert_error_contains(&multiple_starters, "exactly one starter");

        let missing_signature = synthetic_source().replace(
            "fixed_sites: [Draft, Draft, DreamsignRevelation, Battle]",
            "fixed_sites: [Battle]",
        );
        assert_error_contains(&missing_signature, "omit its signature site");

        let too_few_residents = synthetic_source().replace(
            &format!("[\"{AVATAR_ONE}\", \"{AVATAR_TWO}\", \"{AVATAR_THREE}\"]"),
            &format!("[\"{AVATAR_ONE}\", \"{AVATAR_TWO}\"]"),
        );
        assert_error_contains(&too_few_residents, "three or four resident");

        let duplicate_resident = synthetic_source().replace(AVATAR_THREE, AVATAR_ONE);
        assert_error_contains(&duplicate_resident, "repeats resident DreamAvatar");

        let empty_name = synthetic_source().replace("name: \"Opening\"", "name: \"  \"");
        assert_error_contains(&empty_name, "empty name");

        let empty_art_direction = synthetic_source().replace(
            "art_direction: \"Morning mist over a quiet field.\"",
            "art_direction: \"  \"",
        );
        assert_error_contains(&empty_art_direction, "empty art direction");
    }

    fn assert_error_contains(source: &str, expected: &str) {
        let parsed: Vec<DreamscapeDefinition> = ron::from_str(source).unwrap();
        assert!(
            lower(parsed).unwrap_err().to_string().contains(expected),
            "error did not contain {expected}"
        );
    }

    #[test]
    #[ignore = "real-catalog parity probe retained for canonical Dreamscape review"]
    fn canonical_candidate_matches_current_compatibility_sources() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let current_ron: CompatDocument =
            ron::from_str(&fs::read_to_string(root.join("data/dreamscapes.ron")).unwrap()).unwrap();
        let current_toml: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/dreamscapes.toml")).unwrap())
                .unwrap();
        assert_eq!(current_ron.data, current_toml);

        let canonical: Vec<DreamscapeDefinition> = ron::from_str(
            &fs::read_to_string(root.join("data/dreamscapes_canonical.ron")).unwrap(),
        )
        .unwrap();
        assert_eq!(lower(canonical.clone()).unwrap(), current_ron.data);

        let legacy_to_canonical: BTreeMap<_, _> = LEGACY_ID_MAP.into_iter().collect();
        assert_eq!(legacy_to_canonical.len(), canonical.len());
        let canonical_ids: BTreeSet<_> = canonical
            .iter()
            .map(|dreamscape| dreamscape.id.to_string())
            .collect();
        assert_eq!(
            canonical_ids,
            legacy_to_canonical
                .values()
                .copied()
                .map(str::to_owned)
                .collect()
        );

        let compatibility_ids: BTreeSet<_> = current_ron.data["dreamscapes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|dreamscape| dreamscape["id"].as_str().unwrap())
            .collect();
        assert_eq!(
            compatibility_ids,
            legacy_to_canonical.keys().copied().collect()
        );

        verify_canonical_uuids(&canonical);
        verify_foreign_keys(&root, &canonical, &compatibility_ids);
    }

    fn verify_canonical_uuids(canonical: &[DreamscapeDefinition]) {
        for dreamscape in canonical {
            assert_canonical_uuid(&dreamscape.id.to_string());
            if let DreamscapeKind::Affiliated {
                affiliation_id,
                dream_avatar_ids,
            } = &dreamscape.kind
            {
                assert_canonical_uuid(&affiliation_id.to_string());
                for avatar_id in dream_avatar_ids {
                    assert_canonical_uuid(&avatar_id.to_string());
                }
            }
        }
    }

    fn assert_canonical_uuid(value: &str) {
        let parsed = Uuid::parse_str(value).unwrap();
        assert_eq!(parsed.get_version(), Some(Version::Random));
        assert_eq!(parsed.get_variant(), Variant::RFC4122);
        assert_eq!(parsed.hyphenated().to_string(), value);
    }

    fn verify_foreign_keys(
        root: &Path,
        canonical: &[DreamscapeDefinition],
        compatibility_ids: &BTreeSet<&str>,
    ) {
        let affiliations: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/affiliations.toml")).unwrap())
                .unwrap();
        let known_affiliations: BTreeSet<_> = affiliations["affiliations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["id"].as_str().unwrap())
            .collect();

        let avatars: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/dream_avatars.toml")).unwrap())
                .unwrap();
        let known_avatars: BTreeSet<_> = avatars["dreamAvatar"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["id"].as_str().unwrap().to_ascii_lowercase())
            .collect();

        let mut referenced_avatars = BTreeSet::new();
        for dreamscape in canonical {
            if let DreamscapeKind::Affiliated {
                affiliation_id,
                dream_avatar_ids,
            } = &dreamscape.kind
            {
                assert!(known_affiliations.contains(affiliation_id.to_string().as_str()));
                referenced_avatars.extend(dream_avatar_ids.iter().map(ToString::to_string));
            }
        }
        assert_eq!(referenced_avatars, known_avatars);

        let guides: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/dream_guides.toml")).unwrap())
                .unwrap();
        let guide_homes: BTreeSet<_> = guides["guides"]
            .as_array()
            .unwrap()
            .iter()
            .map(|guide| guide["home-dreamscape-id"].as_str().unwrap())
            .collect();
        let starter_key = compatibility_key(
            canonical
                .iter()
                .find(|dreamscape| matches!(dreamscape.kind, DreamscapeKind::Starter { .. }))
                .unwrap()
                .id,
        )
        .unwrap();
        assert_eq!(
            guide_homes,
            compatibility_ids
                .iter()
                .copied()
                .filter(|id| *id != starter_key)
                .collect()
        );
    }
}

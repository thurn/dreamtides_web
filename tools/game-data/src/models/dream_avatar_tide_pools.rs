use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::tides::{TideId, TideKind};

pub type DreamAvatarTidePoolsCatalog = Vec<DreamAvatarPool>;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamAvatarPool {
    pub dream_avatar_id: DreamAvatarId,
    pub starter: Option<TideId>,
    pub facets: Vec<TideId>,
    pub neutral: Vec<TideId>,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DreamAvatarId(Uuid);

impl DreamAvatarId {
    pub fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Tide-pool Dream Avatar identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err(
                "Tide-pool Dream Avatar identifier must use lowercase hyphenated UUID formatting"
                    .into(),
            );
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for DreamAvatarId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for DreamAvatarId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for DreamAvatarId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

pub fn validate(
    catalog: &DreamAvatarTidePoolsCatalog,
    tide_kinds: &BTreeMap<TideId, TideKind>,
) -> Result<()> {
    if catalog.is_empty() {
        bail!("Dream Avatar tide-pool catalog must contain at least one pool");
    }

    let mut dream_avatar_ids = BTreeSet::new();
    for pool in catalog {
        if !dream_avatar_ids.insert(pool.dream_avatar_id) {
            bail!("duplicate Dream Avatar pool UUID {}", pool.dream_avatar_id);
        }
        if pool.facets.is_empty() {
            bail!(
                "Dream Avatar pool {} must contain at least one facet tide",
                pool.dream_avatar_id
            );
        }
        let mut referenced = BTreeSet::new();
        if let Some(starter) = pool.starter {
            require_tide_kind(tide_kinds, starter, TideKind::Signature, "starter")?;
            referenced.insert(starter);
        }
        for (ids, expected, label) in [
            (&pool.facets, TideKind::Facet, "facet"),
            (&pool.neutral, TideKind::Neutral, "neutral"),
        ] {
            for id in ids {
                require_tide_kind(tide_kinds, *id, expected, label)?;
                if !referenced.insert(*id) {
                    bail!(
                        "Dream Avatar pool {} repeats Tide UUID {id}",
                        pool.dream_avatar_id
                    );
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

pub fn validate_references(
    catalog: &DreamAvatarTidePoolsCatalog,
    tide_kinds: &BTreeMap<TideId, TideKind>,
    known_dream_avatar_ids: &BTreeSet<String>,
) -> Result<()> {
    validate(catalog, tide_kinds)?;
    let pool_ids = catalog
        .iter()
        .map(|pool| pool.dream_avatar_id.to_string())
        .collect::<BTreeSet<_>>();
    if pool_ids != *known_dream_avatar_ids {
        let missing = known_dream_avatar_ids
            .difference(&pool_ids)
            .cloned()
            .collect::<Vec<_>>();
        let unknown = pool_ids
            .difference(known_dream_avatar_ids)
            .cloned()
            .collect::<Vec<_>>();
        bail!(
            "Tide-pool Dream Avatar coverage differs from the catalog (missing: {missing:?}; unknown: {unknown:?})"
        );
    }
    Ok(())
}

pub fn lower(catalog: DreamAvatarTidePoolsCatalog) -> Result<toml::Value> {
    let mut root = toml::map::Map::new();
    root.insert("schema-version".into(), 1_i64.into());
    root.insert(
        "dream-avatar-pool".into(),
        toml::Value::Array(
            catalog
                .into_iter()
                .map(|pool| {
                    let mut table = toml::map::Map::new();
                    table.insert(
                        "dream-avatar-id".into(),
                        pool.dream_avatar_id.to_string().into(),
                    );
                    if let Some(starter) = pool.starter {
                        table.insert("starter".into(), starter.to_string().into());
                    }
                    table.insert(
                        "facets".into(),
                        toml::Value::Array(
                            pool.facets
                                .into_iter()
                                .map(|id| id.to_string().into())
                                .collect(),
                        ),
                    );
                    table.insert(
                        "neutral".into(),
                        toml::Value::Array(
                            pool.neutral
                                .into_iter()
                                .map(|id| id.to_string().into())
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
    use crate::models::tides::{TideId, TideKind};

    const AVATAR_ID: &str = "00000000-0000-4000-8000-000000000021";
    const TIDE_IDS: [&str; 3] = [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
    ];

    fn kinds() -> BTreeMap<TideId, TideKind> {
        BTreeMap::from([
            (TideId::parse(TIDE_IDS[0]).unwrap(), TideKind::Signature),
            (TideId::parse(TIDE_IDS[1]).unwrap(), TideKind::Facet),
            (TideId::parse(TIDE_IDS[2]).unwrap(), TideKind::Neutral),
        ])
    }

    fn catalog() -> DreamAvatarTidePoolsCatalog {
        vec![DreamAvatarPool {
            dream_avatar_id: DreamAvatarId::parse(AVATAR_ID).unwrap(),
            starter: Some(TideId::parse(TIDE_IDS[0]).unwrap()),
            facets: vec![TideId::parse(TIDE_IDS[1]).unwrap()],
            neutral: vec![TideId::parse(TIDE_IDS[2]).unwrap()],
        }]
    }

    #[test]
    fn lowers_pool_order_and_omits_an_absent_starter() {
        let mut source = catalog();
        source[0].starter = None;
        validate(&source, &kinds()).unwrap();
        let lowered = lower(source).unwrap();
        assert_eq!(lowered["schema-version"].as_integer(), Some(1));
        assert_eq!(
            lowered["dream-avatar-pool"][0]["facets"][0].as_str(),
            Some(TIDE_IDS[1])
        );
        assert!(
            lowered["dream-avatar-pool"][0]
                .as_table()
                .unwrap()
                .get("starter")
                .is_none()
        );
    }

    #[test]
    fn rejects_wrong_roles_unknown_tides_and_incomplete_avatar_coverage() {
        let mut wrong_role = catalog();
        wrong_role[0].facets[0] = TideId::parse(TIDE_IDS[2]).unwrap();
        assert!(
            validate(&wrong_role, &kinds())
                .unwrap_err()
                .to_string()
                .contains("facet reference")
        );

        let known_avatars = BTreeSet::from([AVATAR_ID.to_owned(), TIDE_IDS[0].to_owned()]);
        assert!(
            validate_references(&catalog(), &kinds(), &known_avatars)
                .unwrap_err()
                .to_string()
                .contains("coverage differs")
        );
    }

    #[test]
    fn enforces_uuid_v4_at_deserialization() {
        let source = ron::to_string(&catalog()).unwrap();
        let invalid = source.replacen(AVATAR_ID, "00000000-0000-1000-8000-000000000021", 1);
        assert!(
            ron::from_str::<DreamAvatarTidePoolsCatalog>(&invalid)
                .unwrap_err()
                .to_string()
                .contains("UUIDv4")
        );
    }
}

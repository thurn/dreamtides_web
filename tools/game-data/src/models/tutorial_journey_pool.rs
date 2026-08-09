use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use anyhow::{Result, ensure};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

const LEGACY_TIDE_ID_MAP: [(&str, &str); 3] = [
    (
        "tutorial-bannerwake",
        "1f70bdd6-31c1-4997-b6c4-c2574f84a1b9",
    ),
    ("tutorial-sunwall", "9566e984-618c-41dd-8148-94af1f0e30cd"),
    (
        "tutorial-unfallen-host",
        "52a1732b-9a6d-473a-9ce4-a842b5f16c3b",
    ),
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialJourneyPoolCatalog {
    pub dream_avatar_id: DreamAvatarId,
    pub pool_size: u32,
    pub opening: OpeningSetup,
    pub tides: Vec<TideDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OpeningSetup {
    pub dreamsign_ids: Vec<DreamsignId>,
    pub offers: Vec<OpeningOffer>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OpeningOffer {
    pub card_ids: Vec<CardId>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TideDefinition {
    pub id: TideId,
    pub name: String,
    pub description: String,
    pub cards: Vec<CardPoolEntry>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CardPoolEntry {
    pub card_id: CardId,
    pub copies: u32,
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

canonical_uuid!(TideId, "Tide identifier");
canonical_uuid!(CardId, "card identifier");
canonical_uuid!(DreamAvatarId, "DreamAvatar identifier");
canonical_uuid!(DreamsignId, "Dreamsign identifier");

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
struct CompatibilityCatalog {
    dream_avatar_id: String,
    pool_size: u32,
    opening_dreamsigns: Vec<String>,
    opening_offers: Vec<Vec<String>>,
    tides: Vec<CompatibilityTide>,
}

#[derive(Serialize)]
struct CompatibilityTide {
    id: String,
    name: String,
    description: String,
    #[serde(rename = "type")]
    kind: &'static str,
    cards: Vec<CompatibilityCard>,
}

#[derive(Serialize)]
struct CompatibilityCard {
    id: String,
    copies: u32,
}

pub fn lower(source: TutorialJourneyPoolCatalog) -> Result<toml::Value> {
    lower_with_tide_map(source, &LEGACY_TIDE_ID_MAP)
}

fn lower_with_tide_map(
    source: TutorialJourneyPoolCatalog,
    tide_id_map: &[(&str, &str)],
) -> Result<toml::Value> {
    validate(&source)?;
    let compatibility_ids = compatibility_tide_ids(tide_id_map)?;
    let tides = source
        .tides
        .into_iter()
        .map(|tide| {
            let id = compatibility_ids
                .get(&tide.id)
                .cloned()
                .unwrap_or_else(|| tide.id.to_string());
            Ok(CompatibilityTide {
                id,
                name: tide.name,
                description: tide.description,
                kind: "valor",
                cards: tide
                    .cards
                    .into_iter()
                    .map(|card| CompatibilityCard {
                        id: card.card_id.to_string(),
                        copies: card.copies,
                    })
                    .collect(),
            })
        })
        .collect::<Result<_>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog {
        dream_avatar_id: source.dream_avatar_id.to_string(),
        pool_size: source.pool_size,
        opening_dreamsigns: source
            .opening
            .dreamsign_ids
            .into_iter()
            .map(|id| id.to_string())
            .collect(),
        opening_offers: source
            .opening
            .offers
            .into_iter()
            .map(|offer| {
                offer
                    .card_ids
                    .into_iter()
                    .map(|id| id.to_string())
                    .collect()
            })
            .collect(),
        tides,
    })?)
}

fn compatibility_tide_ids(tide_id_map: &[(&str, &str)]) -> Result<BTreeMap<TideId, String>> {
    let mut result = BTreeMap::new();
    let mut legacy_ids = BTreeSet::new();
    for (legacy_id, canonical_id) in tide_id_map {
        ensure!(
            !legacy_id.trim().is_empty(),
            "legacy Tide identifier is empty"
        );
        ensure!(
            legacy_ids.insert(*legacy_id),
            "duplicate legacy Tide identifier: {legacy_id}"
        );
        let canonical_id = TideId::parse(canonical_id).map_err(anyhow::Error::msg)?;
        ensure!(
            result
                .insert(canonical_id, (*legacy_id).to_owned())
                .is_none(),
            "duplicate canonical Tide identifier: {canonical_id}"
        );
    }
    Ok(result)
}

pub(crate) fn validate(source: &TutorialJourneyPoolCatalog) -> Result<()> {
    ensure!(
        source.pool_size > 0,
        "tutorial journey pool size must be positive"
    );
    ensure!(
        (1..=3).contains(&source.opening.dreamsign_ids.len()),
        "opening must contain between one and three Dreamsigns"
    );
    ensure!(
        !source.opening.offers.is_empty(),
        "opening must contain at least one offer"
    );
    ensure!(
        !source.tides.is_empty(),
        "tutorial journey pool must contain at least one Tide"
    );

    let dreamsign_ids: BTreeSet<_> = source.opening.dreamsign_ids.iter().copied().collect();
    ensure!(
        dreamsign_ids.len() == source.opening.dreamsign_ids.len(),
        "opening Dreamsign identifiers must be unique"
    );

    let mut opening_card_ids = BTreeSet::new();
    for (offer_index, offer) in source.opening.offers.iter().enumerate() {
        ensure!(
            (1..=4).contains(&offer.card_ids.len()),
            "opening offer {offer_index} must contain between one and four cards"
        );
        for card_id in &offer.card_ids {
            ensure!(
                opening_card_ids.insert(*card_id),
                "opening offers repeat card {card_id}"
            );
        }
    }

    let mut tide_ids = BTreeSet::new();
    let mut tide_names = BTreeSet::new();
    let mut card_ids = BTreeSet::new();
    let mut authored_copy_count = 0_u32;
    for tide in &source.tides {
        ensure!(
            tide_ids.insert(tide.id),
            "duplicate Tide identifier: {}",
            tide.id
        );
        ensure!(
            !tide.name.trim().is_empty(),
            "Tide {} has an empty name",
            tide.id
        );
        ensure!(
            tide_names.insert(tide.name.to_lowercase()),
            "Tide names must be unique: {}",
            tide.name
        );
        ensure!(
            !tide.description.trim().is_empty(),
            "Tide {} has an empty description",
            tide.id
        );
        ensure!(!tide.cards.is_empty(), "Tide {} has no cards", tide.id);
        for card in &tide.cards {
            ensure!(
                card_ids.insert(card.card_id),
                "Tides repeat card {}",
                card.card_id
            );
            ensure!(
                (1..=2).contains(&card.copies),
                "card {} copies must be one or two",
                card.card_id
            );
            authored_copy_count = authored_copy_count
                .checked_add(card.copies)
                .ok_or_else(|| anyhow::anyhow!("tutorial journey pool copy count overflow"))?;
        }
    }
    ensure!(
        authored_copy_count == source.pool_size,
        "Tide cards contain {authored_copy_count} copies, expected {}",
        source.pool_size
    );
    for card_id in opening_card_ids {
        ensure!(
            card_ids.contains(&card_id),
            "opening card {card_id} is absent from the tutorial Tides"
        );
    }
    Ok(())
}

pub fn validate_references(
    source: &TutorialJourneyPoolCatalog,
    known_card_ids: &BTreeSet<String>,
    known_dream_avatar_ids: &BTreeSet<String>,
    known_dreamsign_ids: &BTreeSet<String>,
) -> Result<()> {
    ensure!(
        known_dream_avatar_ids.contains(&source.dream_avatar_id.to_string()),
        "tutorial journey pool references unknown DreamAvatar {}",
        source.dream_avatar_id
    );
    for dreamsign_id in &source.opening.dreamsign_ids {
        ensure!(
            known_dreamsign_ids.contains(&dreamsign_id.to_string()),
            "tutorial journey pool references unknown Dreamsign {dreamsign_id}"
        );
    }
    for tide in &source.tides {
        for card in &tide.cards {
            ensure!(
                known_card_ids.contains(&card.card_id.to_string()),
                "tutorial journey pool references unknown card {}",
                card.card_id
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    const SYNTHETIC_TIDE_ID_MAP: [(&str, &str); 3] = [
        ("first", "10000000-0000-4000-8000-000000000001"),
        ("second", "10000000-0000-4000-8000-000000000002"),
        ("third", "10000000-0000-4000-8000-000000000003"),
    ];

    fn parse(source: &str) -> TutorialJourneyPoolCatalog {
        ron::from_str(source).unwrap()
    }

    fn synthetic_source() -> String {
        let cards = (1..=8)
            .map(|value| format!("20000000-0000-4000-8000-{value:012}"))
            .collect::<Vec<_>>();
        format!(
            r#"(
                dream_avatar_id: "30000000-0000-4000-8000-000000000001",
                pool_size: 9,
                opening: (
                    dreamsign_ids: [
                        "40000000-0000-4000-8000-000000000001",
                        "40000000-0000-4000-8000-000000000002",
                    ],
                    offers: [
                        (card_ids: ["{}", "{}", "{}", "{}"]),
                        (card_ids: ["{}", "{}", "{}", "{}"]),
                    ],
                ),
                tides: [
                    (
                        id: "10000000-0000-4000-8000-000000000001",
                        name: "First Tide",
                        description: "First description.",
                        cards: [
                            (card_id: "{}", copies: 2),
                            (card_id: "{}", copies: 1),
                            (card_id: "{}", copies: 1),
                        ],
                    ),
                    (
                        id: "10000000-0000-4000-8000-000000000002",
                        name: "Second Tide",
                        description: "A Unicode wave: 海.",
                        cards: [
                            (card_id: "{}", copies: 1),
                            (card_id: "{}", copies: 1),
                            (card_id: "{}", copies: 1),
                        ],
                    ),
                    (
                        id: "10000000-0000-4000-8000-000000000003",
                        name: "Third Tide",
                        description: "Third description.",
                        cards: [
                            (card_id: "{}", copies: 1),
                            (card_id: "{}", copies: 1),
                        ],
                    ),
                ],
            )"#,
            cards[0],
            cards[1],
            cards[2],
            cards[3],
            cards[4],
            cards[5],
            cards[6],
            cards[7],
            cards[0],
            cards[1],
            cards[2],
            cards[3],
            cards[4],
            cards[5],
            cards[6],
            cards[7],
        )
    }

    #[test]
    fn lowers_the_typed_shape_to_exact_compatibility_keys_and_order() {
        let lowered =
            lower_with_tide_map(parse(&synthetic_source()), &SYNTHETIC_TIDE_ID_MAP).unwrap();
        let root = lowered.as_table().unwrap();
        assert_eq!(
            root.keys().map(String::as_str).collect::<Vec<_>>(),
            [
                "dream-avatar-id",
                "pool-size",
                "opening-dreamsigns",
                "opening-offers",
                "tides",
            ]
        );
        assert_eq!(
            root["dream-avatar-id"].as_str().unwrap(),
            "30000000-0000-4000-8000-000000000001"
        );
        assert_eq!(root["pool-size"].as_integer(), Some(9));
        assert_eq!(root["opening-dreamsigns"].as_array().unwrap().len(), 2);
        assert_eq!(root["opening-offers"].as_array().unwrap().len(), 2);

        let tides = root["tides"].as_array().unwrap();
        assert_eq!(tides.len(), 3);
        assert_eq!(tides[0]["id"].as_str(), Some("first"));
        assert_eq!(tides[0]["type"].as_str(), Some("valor"));
        assert_eq!(
            tides[1]["description"].as_str(),
            Some("A Unicode wave: 海.")
        );
        assert_eq!(tides[0]["cards"][0]["copies"].as_integer(), Some(2));
    }

    #[test]
    fn rejects_unknown_fields_and_non_uuidv4_identities() {
        let unknown =
            synthetic_source().replacen("pool_size: 9,", "pool_size: 9, surprise: true,", 1);
        assert!(ron::from_str::<TutorialJourneyPoolCatalog>(&unknown).is_err());

        for invalid in [
            "10000000-0000-1000-8000-000000000001".to_owned(),
            "ABCDEF00-0000-4000-8000-000000000001".to_owned(),
        ] {
            let source =
                synthetic_source().replacen("10000000-0000-4000-8000-000000000001", &invalid, 1);
            assert!(ron::from_str::<TutorialJourneyPoolCatalog>(&source).is_err());
        }
    }

    #[test]
    fn rejects_duplicate_ids_invalid_references_and_cross_field_invariants() {
        for (from, to, expected) in [
            (
                "40000000-0000-4000-8000-000000000002",
                "40000000-0000-4000-8000-000000000001",
                "Dreamsign identifiers must be unique",
            ),
            (
                "10000000-0000-4000-8000-000000000002",
                "10000000-0000-4000-8000-000000000001",
                "duplicate Tide identifier",
            ),
            (
                "20000000-0000-4000-8000-000000000008",
                "20000000-0000-4000-8000-000000000001",
                "opening offers repeat card",
            ),
            (
                "20000000-0000-4000-8000-000000000006\", copies: 1",
                "20000000-0000-4000-8000-000000000001\", copies: 1",
                "Tides repeat card",
            ),
            (
                "pool_size: 9",
                "pool_size: 10",
                "contain 9 copies, expected 10",
            ),
            ("copies: 2", "copies: 3", "copies must be one or two"),
            (
                "name: \"Second Tide\"",
                "name: \"First Tide\"",
                "Tide names must be unique",
            ),
        ] {
            let source = synthetic_source().replacen(from, to, 1);
            let error = lower_with_tide_map(parse(&source), &SYNTHETIC_TIDE_ID_MAP)
                .unwrap_err()
                .to_string();
            assert!(
                error.contains(expected),
                "expected {error:?} to contain {expected:?}"
            );
        }

        let mut empty = parse(&synthetic_source());
        empty.opening.dreamsign_ids.clear();
        assert!(
            lower_with_tide_map(empty, &SYNTHETIC_TIDE_ID_MAP)
                .unwrap_err()
                .to_string()
                .contains("between one and three Dreamsigns")
        );

        let absent = synthetic_source().replacen(
            "20000000-0000-4000-8000-000000000008\"]),",
            "20000000-0000-4000-8000-000000000099\"]),",
            1,
        );
        assert!(
            lower_with_tide_map(parse(&absent), &SYNTHETIC_TIDE_ID_MAP)
                .unwrap_err()
                .to_string()
                .contains("absent from the tutorial Tides")
        );
    }

    #[test]
    fn falls_back_to_canonical_tide_ids_and_rejects_ambiguous_aliases() {
        let catalog = parse(&synthetic_source());
        let incomplete = &SYNTHETIC_TIDE_ID_MAP[..2];
        let lowered = lower_with_tide_map(catalog.clone(), incomplete).unwrap();
        assert_eq!(
            lowered["tides"][2]["id"].as_str(),
            Some("10000000-0000-4000-8000-000000000003")
        );

        let duplicate_legacy = [
            SYNTHETIC_TIDE_ID_MAP[0],
            ("first", SYNTHETIC_TIDE_ID_MAP[1].1),
            SYNTHETIC_TIDE_ID_MAP[2],
        ];
        assert!(
            lower_with_tide_map(catalog.clone(), &duplicate_legacy)
                .unwrap_err()
                .to_string()
                .contains("duplicate legacy Tide identifier")
        );

        let duplicate_canonical = [
            SYNTHETIC_TIDE_ID_MAP[0],
            ("second", SYNTHETIC_TIDE_ID_MAP[0].1),
            SYNTHETIC_TIDE_ID_MAP[2],
        ];
        assert!(
            lower_with_tide_map(catalog, &duplicate_canonical)
                .unwrap_err()
                .to_string()
                .contains("duplicate canonical Tide identifier")
        );
    }

    #[test]
    fn validates_foreign_catalog_references() {
        let catalog = parse(&synthetic_source());
        let card_ids = catalog
            .tides
            .iter()
            .flat_map(|tide| &tide.cards)
            .map(|card| card.card_id.to_string())
            .collect::<BTreeSet<_>>();
        let dream_avatar_ids = BTreeSet::from([catalog.dream_avatar_id.to_string()]);
        let dreamsign_ids = catalog
            .opening
            .dreamsign_ids
            .iter()
            .map(ToString::to_string)
            .collect::<BTreeSet<_>>();
        validate_references(&catalog, &card_ids, &dream_avatar_ids, &dreamsign_ids).unwrap();

        let mut missing_cards = card_ids.clone();
        missing_cards.pop_first();
        assert!(
            validate_references(&catalog, &missing_cards, &dream_avatar_ids, &dreamsign_ids,)
                .unwrap_err()
                .to_string()
                .contains("unknown card")
        );
        assert!(
            validate_references(&catalog, &card_ids, &BTreeSet::new(), &dreamsign_ids)
                .unwrap_err()
                .to_string()
                .contains("unknown DreamAvatar")
        );
        assert!(
            validate_references(&catalog, &card_ids, &dream_avatar_ids, &BTreeSet::new())
                .unwrap_err()
                .to_string()
                .contains("unknown Dreamsign")
        );
    }
}

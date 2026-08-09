use std::collections::HashSet;

use anyhow::{Result, bail, ensure};
use indexmap::IndexMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error as _};
use uuid::{Uuid, Variant, Version};

macro_rules! uuid_id {
    ($name:ident) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
        pub struct $name(Uuid);

        impl $name {
            fn parse(raw: &str) -> Result<Self> {
                let value = Uuid::parse_str(raw)?;
                ensure!(
                    value.get_version() == Some(Version::Random)
                        && value.get_variant() == Variant::RFC4122,
                    "{raw} is not an RFC 4122 UUIDv4"
                );
                ensure!(
                    value.hyphenated().to_string() == raw,
                    "{raw} is not lowercase hyphenated UUID text"
                );
                Ok(Self(value))
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
            where
                D: Deserializer<'de>,
            {
                let raw = String::deserialize(deserializer)?;
                Self::parse(&raw).map_err(D::Error::custom)
            }
        }

        impl Serialize for $name {
            fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                serializer.serialize_str(&self.0.hyphenated().to_string())
            }
        }
    };
}

uuid_id!(DreamscapeId);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AtlasCatalog {
    pub layer_defaults: LayerDefaults,
    pub layers: Vec<LayerDefinition>,
    pub graph: GraphRules,
    pub dreamscape_selection: DreamscapeSelectionRules,
    pub site_composition: SiteCompositionRules,
    pub fill_profiles: IndexMap<String, FillProfile>,
    pub known_dreamsign: KnownDreamsignRules,
    pub boss: BossDefinition,
    pub presentation: Presentation,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LayerDefaults {
    pub starter_node_count: IntegerRange,
    pub boss_node_count: IntegerRange,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LayerDefinition {
    pub position: LayerPosition,
    pub rules: LayerRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum LayerRules {
    Starter,
    Standard {
        node_count: IntegerRange,
        site_count: IntegerRange,
        fill_profile: String,
        #[serde(default, skip_serializing_if = "IndexMap::is_empty")]
        mandatory_sites: IndexMap<SiteType, u32>,
    },
    Boss {
        site_count: IntegerRange,
        fill_profile: String,
        #[serde(default, skip_serializing_if = "IndexMap::is_empty")]
        mandatory_sites: IndexMap<SiteType, u32>,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum LayerPosition {
    One,
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
}

impl LayerPosition {
    const ALL: [Self; 7] = [
        Self::One,
        Self::Two,
        Self::Three,
        Self::Four,
        Self::Five,
        Self::Six,
        Self::Seven,
    ];

    fn as_compat(self) -> &'static str {
        match self {
            Self::One => "one",
            Self::Two => "two",
            Self::Three => "three",
            Self::Four => "four",
            Self::Five => "five",
            Self::Six => "six",
            Self::Seven => "seven",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct IntegerRange {
    pub min: u32,
    pub max: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GraphRules {
    pub connection_average: f64,
    pub reveal_lookahead_layers: u32,
    pub bonus_reveal: BonusRevealRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BonusRevealRules {
    pub count: IntegerRange,
    pub mode: u32,
    pub eligible_layers: Vec<LayerPosition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamscapeSelectionRules {
    pub base_weight: f64,
    pub repeat_discourage_strength: f64,
    pub exclude_connected_repeats: bool,
    pub exclude_same_layer_repeats: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SiteCompositionRules {
    pub known_dreamsign_site: SiteType,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FillProfile {
    pub signature_site_weight: f64,
    pub site_weights: IndexMap<SiteType, f64>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum SiteType {
    Battle,
    Draft,
    Shop,
    Purge,
    Essence,
    Transfiguration,
    Duplication,
    Reward,
    Augury,
    DreamsignMarket,
    DreamsignRevelation,
    RandomSite,
    Gamble,
    Exploration,
}

impl SiteType {
    pub(crate) fn as_compat(self) -> &'static str {
        match self {
            Self::Battle => "Battle",
            Self::Draft => "Draft",
            Self::Shop => "Shop",
            Self::Purge => "Purge",
            Self::Essence => "Essence",
            Self::Transfiguration => "Transfiguration",
            Self::Duplication => "Duplication",
            Self::Reward => "Reward",
            Self::Augury => "Augury",
            Self::DreamsignMarket => "DreamsignMarket",
            Self::DreamsignRevelation => "DreamsignRevelation",
            Self::RandomSite => "RandomSite",
            Self::Gamble => "Gamble",
            Self::Exploration => "Exploration",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct KnownDreamsignRules {
    pub max_per_atlas: u32,
    pub eligible_layers: Vec<LayerPosition>,
    pub placement_probability: f64,
    pub early_reveal_bias: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BossDefinition {
    pub dreamscape_id: DreamscapeId,
    pub compatibility_dreamscape_id: String,
    pub place: String,
    pub name: String,
    pub fallback_title: String,
    pub fallback_introduction: String,
    pub art: BossArt,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BossArt {
    pub scene: AssetReference,
    pub icon: AssetReference,
    pub figure: AssetReference,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AssetReference {
    pub key: String,
    pub source: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Presentation {
    pub unrevealed: UnrevealedPresentation,
    pub starter_body: String,
    pub affiliation: AffiliationPresentation,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct UnrevealedPresentation {
    pub title: String,
    pub body: String,
    pub frame: AssetReference,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AffiliationPresentation {
    pub title_template: String,
    pub body_template: String,
}

pub fn lower(source: AtlasCatalog) -> Result<toml::Value> {
    validate(&source)?;

    let mut root = toml::map::Map::new();
    root.insert("schema-version".into(), 1_i64.into());
    let layer_defaults = source.layer_defaults;
    root.insert(
        "layers".into(),
        toml::Value::Array(
            source
                .layers
                .into_iter()
                .map(|layer| lower_layer(layer, &layer_defaults))
                .collect(),
        ),
    );
    root.insert(
        "graph".into(),
        toml::Value::Table(lower_graph(source.graph)),
    );
    root.insert(
        "dreamscape-selection".into(),
        toml::Value::Table(lower_dreamscape_selection(source.dreamscape_selection)),
    );
    root.insert(
        "site-composition".into(),
        toml::Value::Table(lower_site_composition(source.site_composition)),
    );
    root.insert(
        "fill-profiles".into(),
        toml::Value::Array(
            source
                .fill_profiles
                .into_iter()
                .map(|(timing, profile)| lower_fill_profile(timing, profile))
                .collect(),
        ),
    );
    root.insert(
        "known-dreamsign".into(),
        toml::Value::Table(lower_known_dreamsign(source.known_dreamsign)),
    );
    let assets = lower_assets(&source.presentation, &source.boss.art);
    root.insert("boss".into(), toml::Value::Table(lower_boss(source.boss)));
    root.insert(
        "presentation".into(),
        toml::Value::Table(lower_presentation(&source.presentation)),
    );
    root.insert("assets".into(), toml::Value::Table(assets));
    Ok(toml::Value::Table(root))
}

fn validate(source: &AtlasCatalog) -> Result<()> {
    validate_range(
        "starter_node_count",
        source.layer_defaults.starter_node_count,
    )?;
    validate_range("boss_node_count", source.layer_defaults.boss_node_count)?;
    ensure!(
        source.layers.len() == LayerPosition::ALL.len(),
        "Atlas must define exactly seven layers"
    );
    for (index, layer) in source.layers.iter().enumerate() {
        ensure!(
            layer.position == LayerPosition::ALL[index],
            "Atlas layers must be ordered One through Seven"
        );
        match (&layer.position, &layer.rules) {
            (LayerPosition::One, LayerRules::Starter)
            | (LayerPosition::Seven, LayerRules::Boss { .. }) => {}
            (
                LayerPosition::Two
                | LayerPosition::Three
                | LayerPosition::Four
                | LayerPosition::Five
                | LayerPosition::Six,
                LayerRules::Standard { .. },
            ) => {}
            _ => bail!("Atlas layer role does not match its position"),
        }
        match &layer.rules {
            LayerRules::Starter => {}
            LayerRules::Standard {
                node_count,
                site_count,
                mandatory_sites,
                ..
            } => {
                validate_range("node_count", *node_count)?;
                validate_range("site_count", *site_count)?;
                validate_site_counts(mandatory_sites)?;
            }
            LayerRules::Boss {
                site_count,
                mandatory_sites,
                ..
            } => {
                validate_range("site_count", *site_count)?;
                validate_site_counts(mandatory_sites)?;
            }
        }
    }

    ensure!(
        !source.fill_profiles.is_empty(),
        "fill profiles must contain at least one profile"
    );
    for (id, profile) in &source.fill_profiles {
        ensure!(!id.trim().is_empty(), "fill profile id must not be blank");
        validate_positive_finite("signature_site_weight", profile.signature_site_weight)?;
        for weight in profile.site_weights.values() {
            validate_positive_finite("site weight", *weight)?;
        }
    }
    for layer in &source.layers {
        let profile = match &layer.rules {
            LayerRules::Starter => None,
            LayerRules::Standard { fill_profile, .. } | LayerRules::Boss { fill_profile, .. } => {
                Some(fill_profile)
            }
        };
        if let Some(timing) = profile {
            ensure!(
                source.fill_profiles.contains_key(timing),
                "Atlas layer references an undefined fill profile"
            );
        }
    }

    validate_range("bonus reveal count", source.graph.bonus_reveal.count)?;
    ensure!(
        source.graph.bonus_reveal.mode >= source.graph.bonus_reveal.count.min
            && source.graph.bonus_reveal.mode <= source.graph.bonus_reveal.count.max,
        "bonus reveal mode must lie within its count range"
    );
    validate_positive_finite("connection_average", source.graph.connection_average)?;
    validate_layer_references("bonus reveal", &source.graph.bonus_reveal.eligible_layers)?;
    validate_layer_references("known dreamsign", &source.known_dreamsign.eligible_layers)?;
    validate_positive_finite("base_weight", source.dreamscape_selection.base_weight)?;
    validate_positive_finite(
        "repeat_discourage_strength",
        source.dreamscape_selection.repeat_discourage_strength,
    )?;
    ensure!(
        (0.0..=1.0).contains(&source.known_dreamsign.placement_probability),
        "placement_probability must be between zero and one"
    );
    ensure!(
        source.known_dreamsign.early_reveal_bias.is_finite()
            && source.known_dreamsign.early_reveal_bias >= 0.0,
        "early_reveal_bias must be finite and nonnegative"
    );
    ensure!(
        source
            .presentation
            .affiliation
            .title_template
            .contains("{name}"),
        "affiliation title template must contain {{name}}"
    );
    ensure!(
        source
            .presentation
            .affiliation
            .body_template
            .contains("{card-theme}"),
        "affiliation body template must contain {{card-theme}}"
    );
    ensure!(
        !source.boss.compatibility_dreamscape_id.trim().is_empty(),
        "boss compatibility dreamscape id must be non-empty"
    );
    Ok(())
}

fn validate_range(label: &str, range: IntegerRange) -> Result<()> {
    ensure!(range.min <= range.max, "{label} minimum exceeds maximum");
    Ok(())
}

fn validate_positive_finite(label: &str, value: f64) -> Result<()> {
    ensure!(
        value.is_finite() && value > 0.0,
        "{label} must be finite and positive"
    );
    Ok(())
}

fn validate_site_counts(values: &IndexMap<SiteType, u32>) -> Result<()> {
    ensure!(
        values.values().all(|count| *count > 0),
        "mandatory site counts must be positive"
    );
    Ok(())
}

fn validate_layer_references(label: &str, layers: &[LayerPosition]) -> Result<()> {
    let mut unique = HashSet::new();
    for layer in layers {
        ensure!(unique.insert(*layer), "{label} repeats a layer");
    }
    Ok(())
}

fn lower_layer(layer: LayerDefinition, defaults: &LayerDefaults) -> toml::Value {
    let mut table = toml::map::Map::new();
    table.insert("name".into(), layer.position.as_compat().into());
    match layer.rules {
        LayerRules::Starter => {
            table.insert("role".into(), "starter".into());
            table.insert(
                "node-count".into(),
                range_table(defaults.starter_node_count),
            );
            table.insert(
                "mandatory-sites".into(),
                toml::Value::Table(toml::map::Map::new()),
            );
        }
        LayerRules::Standard {
            node_count,
            site_count,
            fill_profile,
            mandatory_sites,
        } => {
            table.insert("role".into(), "standard".into());
            table.insert("node-count".into(), range_table(node_count));
            table.insert("site-count".into(), range_table(site_count));
            table.insert("fill-profile".into(), fill_profile.into());
            table.insert("mandatory-sites".into(), site_count_table(mandatory_sites));
        }
        LayerRules::Boss {
            site_count,
            fill_profile,
            mandatory_sites,
        } => {
            table.insert("role".into(), "boss".into());
            table.insert("node-count".into(), range_table(defaults.boss_node_count));
            table.insert("site-count".into(), range_table(site_count));
            table.insert("fill-profile".into(), fill_profile.into());
            table.insert("mandatory-sites".into(), site_count_table(mandatory_sites));
        }
    }
    toml::Value::Table(table)
}

fn range_table(range: IntegerRange) -> toml::Value {
    toml::Value::Table(toml::map::Map::from_iter([
        ("min".into(), i64::from(range.min).into()),
        ("max".into(), i64::from(range.max).into()),
    ]))
}

fn site_count_table(values: IndexMap<SiteType, u32>) -> toml::Value {
    toml::Value::Table(
        values
            .into_iter()
            .map(|(site, count)| (site.as_compat().into(), i64::from(count).into()))
            .collect(),
    )
}

fn lower_graph(graph: GraphRules) -> toml::map::Map<String, toml::Value> {
    let bonus = graph.bonus_reveal;
    toml::map::Map::from_iter([
        ("connection-average".into(), graph.connection_average.into()),
        (
            "reveal-lookahead-layers".into(),
            i64::from(graph.reveal_lookahead_layers).into(),
        ),
        (
            "bonus-reveal".into(),
            toml::Value::Table(toml::map::Map::from_iter([
                ("min".into(), i64::from(bonus.count.min).into()),
                ("max".into(), i64::from(bonus.count.max).into()),
                ("mode".into(), i64::from(bonus.mode).into()),
                (
                    "eligible-layers".into(),
                    layer_name_array(bonus.eligible_layers),
                ),
            ])),
        ),
    ])
}

fn layer_name_array(layers: Vec<LayerPosition>) -> toml::Value {
    toml::Value::Array(
        layers
            .into_iter()
            .map(|layer| layer.as_compat().into())
            .collect(),
    )
}

fn lower_dreamscape_selection(
    value: DreamscapeSelectionRules,
) -> toml::map::Map<String, toml::Value> {
    toml::map::Map::from_iter([
        ("base-weight".into(), value.base_weight.into()),
        (
            "repeat-discourage-strength".into(),
            value.repeat_discourage_strength.into(),
        ),
        (
            "exclude-connected-repeats".into(),
            value.exclude_connected_repeats.into(),
        ),
        (
            "exclude-same-layer-repeats".into(),
            value.exclude_same_layer_repeats.into(),
        ),
        ("exhaustion-fallback".into(), "allow-repeats".into()),
    ])
}

fn lower_site_composition(value: SiteCompositionRules) -> toml::map::Map<String, toml::Value> {
    toml::map::Map::from_iter([
        ("unique-non-draft-sites".into(), true.into()),
        (
            "known-dreamsign-site".into(),
            value.known_dreamsign_site.as_compat().into(),
        ),
        ("mandatory-capacity-behavior".into(), "omit-fill".into()),
    ])
}

fn lower_fill_profile(id: String, profile: FillProfile) -> toml::Value {
    toml::Value::Table(toml::map::Map::from_iter([
        ("id".into(), id.into()),
        (
            "signature-site-weight".into(),
            profile.signature_site_weight.into(),
        ),
        (
            "site-weights".into(),
            toml::Value::Table(
                profile
                    .site_weights
                    .into_iter()
                    .map(|(site, weight)| (site.as_compat().into(), weight.into()))
                    .collect(),
            ),
        ),
    ]))
}

fn lower_known_dreamsign(value: KnownDreamsignRules) -> toml::map::Map<String, toml::Value> {
    toml::map::Map::from_iter([
        (
            "max-per-atlas".into(),
            i64::from(value.max_per_atlas).into(),
        ),
        (
            "eligible-layers".into(),
            layer_name_array(value.eligible_layers),
        ),
        (
            "placement-probability".into(),
            value.placement_probability.into(),
        ),
        ("early-reveal-bias".into(), value.early_reveal_bias.into()),
    ])
}

fn lower_boss(value: BossDefinition) -> toml::map::Map<String, toml::Value> {
    toml::map::Map::from_iter([
        (
            "dreamscape-id".into(),
            value.compatibility_dreamscape_id.into(),
        ),
        ("place".into(), value.place.into()),
        ("name".into(), value.name.into()),
        ("fallback-title".into(), value.fallback_title.into()),
        (
            "fallback-introduction".into(),
            value.fallback_introduction.into(),
        ),
        ("scene-art-id".into(), value.art.scene.key.into()),
        ("icon-art-id".into(), value.art.icon.key.into()),
        ("figure-art-id".into(), value.art.figure.key.into()),
    ])
}

fn lower_presentation(value: &Presentation) -> toml::map::Map<String, toml::Value> {
    toml::map::Map::from_iter([
        ("unseen-title".into(), value.unrevealed.title.clone().into()),
        ("unseen-body".into(), value.unrevealed.body.clone().into()),
        ("starter-body".into(), value.starter_body.clone().into()),
        (
            "affiliation-title-template".into(),
            value.affiliation.title_template.clone().into(),
        ),
        (
            "affiliation-body-template".into(),
            value.affiliation.body_template.clone().into(),
        ),
    ])
}

fn lower_assets(
    presentation: &Presentation,
    boss: &BossArt,
) -> toml::map::Map<String, toml::Value> {
    toml::map::Map::from_iter([
        (
            "unrevealed-frame-source".into(),
            presentation.unrevealed.frame.source.clone().into(),
        ),
        (
            "unrevealed-frame-key".into(),
            presentation.unrevealed.frame.key.clone().into(),
        ),
        ("boss-scene-source".into(), boss.scene.source.clone().into()),
        ("boss-icon-source".into(), boss.icon.source.clone().into()),
        (
            "boss-figure-source".into(),
            boss.figure.source.clone().into(),
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog() -> AtlasCatalog {
        let layers = LayerPosition::ALL
            .into_iter()
            .enumerate()
            .map(|(index, position)| {
                let rules = match position {
                    LayerPosition::One => LayerRules::Starter,
                    LayerPosition::Seven => LayerRules::Boss {
                        site_count: IntegerRange { min: 4, max: 8 },
                        fill_profile: "late".into(),
                        mandatory_sites: IndexMap::new(),
                    },
                    _ => LayerRules::Standard {
                        node_count: IntegerRange { min: 2, max: 4 },
                        site_count: IntegerRange { min: 4, max: 8 },
                        fill_profile: if index < 4 { "early" } else { "late" }.into(),
                        mandatory_sites: if index == 1 {
                            IndexMap::from([(SiteType::Draft, 2), (SiteType::Augury, 1)])
                        } else {
                            IndexMap::new()
                        },
                    },
                };
                LayerDefinition { position, rules }
            })
            .collect();
        AtlasCatalog {
            layer_defaults: LayerDefaults {
                starter_node_count: IntegerRange { min: 1, max: 2 },
                boss_node_count: IntegerRange { min: 2, max: 3 },
            },
            layers,
            graph: GraphRules {
                connection_average: 2.5,
                reveal_lookahead_layers: 3,
                bonus_reveal: BonusRevealRules {
                    count: IntegerRange { min: 0, max: 4 },
                    mode: 2,
                    eligible_layers: vec![LayerPosition::Five, LayerPosition::Six],
                },
            },
            dreamscape_selection: DreamscapeSelectionRules {
                base_weight: 1.5,
                repeat_discourage_strength: 3.0,
                exclude_connected_repeats: true,
                exclude_same_layer_repeats: false,
            },
            site_composition: SiteCompositionRules {
                known_dreamsign_site: SiteType::Reward,
            },
            fill_profiles: IndexMap::from([
                (
                    "early".into(),
                    FillProfile {
                        signature_site_weight: 4.0,
                        site_weights: IndexMap::from([
                            (SiteType::Essence, 2.0),
                            (SiteType::Transfiguration, 1.0),
                        ]),
                    },
                ),
                (
                    "late".into(),
                    FillProfile {
                        signature_site_weight: 6.0,
                        site_weights: IndexMap::from([
                            (SiteType::Essence, 1.0),
                            (SiteType::Duplication, 7.0),
                        ]),
                    },
                ),
            ]),
            known_dreamsign: KnownDreamsignRules {
                max_per_atlas: 3,
                eligible_layers: vec![LayerPosition::Three, LayerPosition::Four],
                placement_probability: 0.25,
                early_reveal_bias: 1.5,
            },
            boss: BossDefinition {
                dreamscape_id: DreamscapeId::parse("00000000-0000-4000-8000-000000000001").unwrap(),
                compatibility_dreamscape_id: "boss-dreamscape".into(),
                place: "Límbø".into(),
                name: "Apollyon".into(),
                fallback_title: "Doom".into(),
                fallback_introduction: "First line\nSecond line".into(),
                art: BossArt {
                    scene: AssetReference {
                        key: "scene".into(),
                        source: "scene.png".into(),
                    },
                    icon: AssetReference {
                        key: "icon".into(),
                        source: "icon.png".into(),
                    },
                    figure: AssetReference {
                        key: "figure".into(),
                        source: "figure.png".into(),
                    },
                },
            },
            presentation: Presentation {
                unrevealed: UnrevealedPresentation {
                    title: "Unknown".into(),
                    body: "Hidden".into(),
                    frame: AssetReference {
                        key: "frame-key".into(),
                        source: "frame.png".into(),
                    },
                },
                starter_body: "Start".into(),
                affiliation: AffiliationPresentation {
                    title_template: "Affiliation: {name}".into(),
                    body_template: "{card-theme} affinity".into(),
                },
            },
        }
    }

    #[test]
    fn lowers_all_layer_variants_defaults_enums_and_ordered_maps() {
        let output = lower(catalog()).unwrap();
        assert_eq!(output["layers"][0]["role"].as_str(), Some("starter"));
        assert!(output["layers"][0].get("site-count").is_none());
        assert_eq!(
            output["layers"][1]["mandatory-sites"]
                .as_table()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["Draft", "Augury"]
        );
        assert_eq!(output["layers"][6]["role"].as_str(), Some("boss"));
        assert_eq!(
            output["layers"][0]["node-count"]["max"].as_integer(),
            Some(2)
        );
        assert_eq!(
            output["layers"][6]["node-count"]["min"].as_integer(),
            Some(2)
        );
        assert_eq!(output["fill-profiles"][0]["id"].as_str(), Some("early"));
        assert_eq!(
            output["dreamscape-selection"]["exhaustion-fallback"].as_str(),
            Some("allow-repeats")
        );
        assert_eq!(
            output["site-composition"]["mandatory-capacity-behavior"].as_str(),
            Some("omit-fill")
        );
        assert_eq!(output["boss"]["place"].as_str(), Some("Límbø"));
        assert_eq!(
            output["boss"]["dreamscape-id"].as_str(),
            Some("boss-dreamscape")
        );
        assert_eq!(
            output["boss"]["fallback-introduction"].as_str(),
            Some("First line\nSecond line")
        );
        assert_eq!(
            output["assets"]["boss-icon-source"].as_str(),
            Some("icon.png")
        );
    }

    #[test]
    fn rejects_invalid_uuid_text_at_deserialization() {
        for invalid in [
            "limbo",
            "F31E1199-70BC-4110-85F9-505AFEBB02C4",
            "f31e1199-70bc-3110-85f9-505afebb02c4",
        ] {
            assert!(ron::from_str::<DreamscapeId>(&format!("\"{invalid}\"")).is_err());
        }
    }

    #[test]
    fn rejects_missing_referenced_profiles_invalid_order_and_ranges() {
        let mut custom_profile = catalog();
        let profile = custom_profile.fill_profiles["early"].clone();
        custom_profile.fill_profiles.insert("middle".into(), profile);
        if let LayerRules::Standard { fill_profile, .. } =
            &mut custom_profile.layers[2].rules
        {
            *fill_profile = "middle".into();
        }
        lower(custom_profile).unwrap();

        let mut missing_profile = catalog();
        missing_profile.fill_profiles.shift_remove("early");
        assert!(
            lower(missing_profile)
                .unwrap_err()
                .to_string()
                .contains("undefined fill profile")
        );

        let mut invalid_order = catalog();
        invalid_order.layers.swap(1, 2);
        assert!(
            lower(invalid_order)
                .unwrap_err()
                .to_string()
                .contains("ordered")
        );

        let mut bad_range = catalog();
        bad_range.graph.bonus_reveal.count = IntegerRange { min: 3, max: 2 };
        assert!(
            lower(bad_range)
                .unwrap_err()
                .to_string()
                .contains("minimum exceeds maximum")
        );

        let mut bad_default = catalog();
        bad_default.layer_defaults.starter_node_count = IntegerRange { min: 2, max: 1 };
        assert!(
            lower(bad_default)
                .unwrap_err()
                .to_string()
                .contains("minimum exceeds maximum")
        );
    }

    #[test]
    fn rejects_a_blank_boss_compatibility_id() {
        let mut source = catalog();
        source.boss.compatibility_dreamscape_id = "  ".into();
        assert!(
            lower(source)
                .unwrap_err()
                .to_string()
                .contains("compatibility dreamscape id must be non-empty")
        );
    }

    #[test]
    fn rejects_repeated_layer_references() {
        let mut repeated = catalog();
        repeated.graph.bonus_reveal.eligible_layers =
            vec![LayerPosition::Five, LayerPosition::Five];
        assert!(
            lower(repeated)
                .unwrap_err()
                .to_string()
                .contains("repeats a layer")
        );
    }
}

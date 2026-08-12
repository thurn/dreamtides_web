use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use trox::LocalizedString;

use super::localization::source_text;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DraftDocument {
    pub presentation: DraftPresentation,
    pub offers: Offers,
    pub rarity_caps: IndexMap<Rarity, RarityCap>,
    pub pool: Pool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DraftPresentation {
    pub progress: LocalizedString,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Offers {
    pub cards_per_offer: u32,
    pub picks_per_site: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RarityCap {
    pub pool_copy_cap: u32,
    pub max_picks_per_run: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Pool {
    pub tides4: StrategyDefinition,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StrategyDefinition {
    pub deal_size: u32,
    pub copy_cap: u32,
    pub max_facets: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
    Legendary,
}

impl Rarity {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Common => "Common",
            Self::Uncommon => "Uncommon",
            Self::Rare => "Rare",
            Self::Legendary => "Legendary",
        }
    }
}

pub fn lower(source: DraftDocument) -> anyhow::Result<toml::Value> {
    let progress = source_text(&source.presentation.progress)?;
    anyhow::ensure!(
        progress.matches("{pickNumber}").count() == 1
            && progress.matches("{pickTotal}").count() == 1,
        "draft progress must contain {{pickNumber}} and {{pickTotal}} exactly once"
    );
    let mut root = toml::map::Map::new();
    root.insert("schema-version".into(), 1_i64.into());
    root.insert(
        "presentation".into(),
        toml::Value::Table(toml::map::Map::from_iter([(
            "progress".into(),
            progress.into(),
        )])),
    );
    root.insert(
        "offers".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            (
                "cards-per-offer".into(),
                i64::from(source.offers.cards_per_offer).into(),
            ),
            (
                "picks-per-site".into(),
                i64::from(source.offers.picks_per_site).into(),
            ),
        ])),
    );
    root.insert(
        "rarity-caps".into(),
        toml::Value::Array(
            source
                .rarity_caps
                .into_iter()
                .map(|(rarity, cap)| {
                    toml::Value::Table(toml::map::Map::from_iter([
                        ("rarity".into(), rarity.as_compat().into()),
                        ("pool-copy-cap".into(), i64::from(cap.pool_copy_cap).into()),
                        (
                            "max-picks-per-run".into(),
                            i64::from(cap.max_picks_per_run).into(),
                        ),
                    ]))
                })
                .collect(),
        ),
    );
    let mut pool = toml::map::Map::new();
    pool.insert("default-strategy".into(), "tides4".into());
    let definition = source.pool.tides4;
    pool.insert(
        "tides4".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            ("deal-size".into(), i64::from(definition.deal_size).into()),
            ("copy-cap".into(), i64::from(definition.copy_cap).into()),
            ("max-facets".into(), i64::from(definition.max_facets).into()),
        ])),
    );
    root.insert("pool".into(), toml::Value::Table(pool));
    Ok(toml::Value::Table(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ls(text: impl Into<String>) -> LocalizedString {
        super::super::localization::localized_source(text.into()).unwrap()
    }

    fn document() -> DraftDocument {
        DraftDocument {
            presentation: DraftPresentation {
                progress: ls("Draft ({pickNumber}/{pickTotal})"),
            },
            offers: Offers {
                cards_per_offer: 4,
                picks_per_site: 5,
            },
            rarity_caps: IndexMap::from([(
                Rarity::Legendary,
                RarityCap {
                    pool_copy_cap: 1,
                    max_picks_per_run: 1,
                },
            )]),
            pool: Pool {
                tides4: StrategyDefinition {
                    deal_size: 150,
                    copy_cap: 2,
                    max_facets: 3,
                },
            },
        }
    }

    #[test]
    fn preserves_declared_map_order_and_compatibility_keys() {
        let output = lower(document()).unwrap();
        assert_eq!(output["schema-version"].as_integer(), Some(1));
        assert_eq!(output["pool"]["default-strategy"].as_str(), Some("tides4"));
        assert_eq!(
            output["rarity-caps"][0]["rarity"].as_str(),
            Some("Legendary")
        );
    }

    #[test]
    fn rejects_invalid_progress_placeholders() {
        let mut source = document();
        source.presentation.progress = ls("Draft ({pickNumber})");
        assert!(lower(source).unwrap_err().to_string().contains("pickTotal"));
    }
}

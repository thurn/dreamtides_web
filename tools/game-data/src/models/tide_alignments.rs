use std::collections::BTreeSet;

use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TideAlignmentCatalog {
    pub alignments: Vec<TideAlignmentDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TideAlignmentDefinition {
    pub id: TideAlignmentId,
    pub deck_color: TideDeckColor,
    pub display_name: String,
    pub glyph: TideGlyph,
    pub accent_color: String,
    pub chip_background: String,
    pub chip_border: String,
    pub accessibility_name: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum TideDeckColor {
    Orange,
    Yellow,
    Blue,
    Green,
    Purple,
}

impl TideDeckColor {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Orange => "orange",
            Self::Yellow => "yellow",
            Self::Blue => "blue",
            Self::Green => "green",
            Self::Purple => "purple",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum TideAlignmentId {
    Ember,
    Valor,
    Vision,
    Wild,
    Shadow,
}

impl TideAlignmentId {
    const ALL: [Self; 5] = [
        Self::Ember,
        Self::Valor,
        Self::Vision,
        Self::Wild,
        Self::Shadow,
    ];

    fn as_compat(self) -> &'static str {
        match self {
            Self::Ember => "ember",
            Self::Valor => "valor",
            Self::Vision => "vision",
            Self::Wild => "wild",
            Self::Shadow => "shadow",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TideGlyph {
    TideEmber,
    TideValor,
    TideVision,
    TideWild,
    TideShadow,
}

impl TideGlyph {
    fn as_compat(self) -> &'static str {
        match self {
            Self::TideEmber => "tideEmber",
            Self::TideValor => "tideValor",
            Self::TideVision => "tideVision",
            Self::TideWild => "tideWild",
            Self::TideShadow => "tideShadow",
        }
    }
}

#[derive(Serialize)]
struct CompatibilityCatalog {
    #[serde(rename = "tide-alignments")]
    alignments: Vec<CompatibilityAlignment>,
}

#[derive(Serialize)]
struct CompatibilityAlignment {
    id: &'static str,
    #[serde(rename = "deck-color")]
    deck_color: &'static str,
    #[serde(rename = "display-name")]
    display_name: String,
    glyph: &'static str,
    #[serde(rename = "accent-color")]
    accent_color: String,
    #[serde(rename = "chip-background")]
    chip_background: String,
    #[serde(rename = "chip-border")]
    chip_border: String,
    #[serde(rename = "accessibility-name")]
    accessibility_name: String,
}

pub fn lower(source: TideAlignmentCatalog) -> Result<toml::Value> {
    validate(&source)?;
    Ok(toml::Value::try_from(CompatibilityCatalog {
        alignments: source
            .alignments
            .into_iter()
            .map(|alignment| CompatibilityAlignment {
                id: alignment.id.as_compat(),
                deck_color: alignment.deck_color.as_compat(),
                display_name: alignment.display_name,
                glyph: alignment.glyph.as_compat(),
                accent_color: alignment.accent_color,
                chip_background: alignment.chip_background,
                chip_border: alignment.chip_border,
                accessibility_name: alignment.accessibility_name,
            })
            .collect(),
    })?)
}

pub(crate) fn validate(source: &TideAlignmentCatalog) -> Result<()> {
    let ids = source
        .alignments
        .iter()
        .map(|entry| entry.id)
        .collect::<Vec<_>>();
    ensure!(
        ids == TideAlignmentId::ALL,
        "tide alignments must contain every stable id exactly once in canonical order"
    );
    let mut names = BTreeSet::new();
    let mut deck_colors = BTreeSet::new();
    for (index, alignment) in source.alignments.iter().enumerate() {
        let path = format!("alignments[{index}]");
        ensure!(
            !alignment.display_name.trim().is_empty(),
            "{path}.display_name must not be blank"
        );
        ensure!(
            !alignment.accessibility_name.trim().is_empty(),
            "{path}.accessibility_name must not be blank"
        );
        ensure!(
            names.insert(alignment.display_name.to_lowercase()),
            "{path}.display_name duplicates another alignment"
        );
        ensure!(
            deck_colors.insert(alignment.deck_color),
            "{path}.deck_color duplicates another alignment"
        );
        validate_color(&path, &alignment.accent_color)?;
        validate_color(&path, &alignment.chip_background)?;
        ensure!(
            alignment.chip_border.starts_with("rgba(") && alignment.chip_border.ends_with(')'),
            "{path}.chip_border must be an rgba() CSS color"
        );
        let expected_glyph = match alignment.id {
            TideAlignmentId::Ember => TideGlyph::TideEmber,
            TideAlignmentId::Valor => TideGlyph::TideValor,
            TideAlignmentId::Vision => TideGlyph::TideVision,
            TideAlignmentId::Wild => TideGlyph::TideWild,
            TideAlignmentId::Shadow => TideGlyph::TideShadow,
        };
        let expected_deck_color = match alignment.id {
            TideAlignmentId::Ember => TideDeckColor::Orange,
            TideAlignmentId::Valor => TideDeckColor::Yellow,
            TideAlignmentId::Vision => TideDeckColor::Blue,
            TideAlignmentId::Wild => TideDeckColor::Green,
            TideAlignmentId::Shadow => TideDeckColor::Purple,
        };
        if alignment.glyph != expected_glyph {
            bail!("{path}.glyph does not match the stable tide id");
        }
        if alignment.deck_color != expected_deck_color {
            bail!("{path}.deck_color does not match the stable tide id");
        }
    }
    Ok(())
}

fn validate_color(path: &str, color: &str) -> Result<()> {
    let bytes = color.as_bytes();
    ensure!(
        bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit),
        "{path}.accent_color must be a #RRGGBB CSS color"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog() -> TideAlignmentCatalog {
        let records = [
            (
                TideAlignmentId::Ember,
                TideDeckColor::Orange,
                TideGlyph::TideEmber,
                "#fb923c",
            ),
            (
                TideAlignmentId::Valor,
                TideDeckColor::Yellow,
                TideGlyph::TideValor,
                "#facc15",
            ),
            (
                TideAlignmentId::Vision,
                TideDeckColor::Blue,
                TideGlyph::TideVision,
                "#60a5fa",
            ),
            (
                TideAlignmentId::Wild,
                TideDeckColor::Green,
                TideGlyph::TideWild,
                "#4ade80",
            ),
            (
                TideAlignmentId::Shadow,
                TideDeckColor::Purple,
                TideGlyph::TideShadow,
                "#c084fc",
            ),
        ];
        TideAlignmentCatalog {
            alignments: records
                .into_iter()
                .map(|(id, deck_color, glyph, color)| TideAlignmentDefinition {
                    id,
                    deck_color,
                    display_name: format!("{id:?}"),
                    glyph,
                    accent_color: color.into(),
                    chip_background: "#111111".into(),
                    chip_border: "rgba(1, 2, 3, 0.5)".into(),
                    accessibility_name: format!("{id:?} alignment"),
                })
                .collect(),
        }
    }

    #[test]
    fn lowers_valid_catalog_deterministically() {
        assert_eq!(lower(catalog()).unwrap(), lower(catalog()).unwrap());
    }

    #[test]
    fn rejects_missing_duplicate_reordered_and_invalid_presentation() {
        let mut missing = catalog();
        missing.alignments.pop();
        assert!(
            validate(&missing)
                .unwrap_err()
                .to_string()
                .contains("every stable id")
        );

        let mut duplicate = catalog();
        duplicate.alignments[1].id = TideAlignmentId::Ember;
        assert!(
            validate(&duplicate)
                .unwrap_err()
                .to_string()
                .contains("every stable id")
        );

        let mut invalid = catalog();
        invalid.alignments[0].accent_color = "orange".into();
        assert!(
            validate(&invalid)
                .unwrap_err()
                .to_string()
                .contains("accent_color")
        );

        let mut glyph = catalog();
        glyph.alignments[0].glyph = TideGlyph::TideValor;
        assert!(validate(&glyph).unwrap_err().to_string().contains("glyph"));
    }
}

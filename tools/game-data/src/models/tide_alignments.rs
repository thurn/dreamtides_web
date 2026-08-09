use std::collections::BTreeSet;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TideAlignmentCatalog {
    pub ember: TideAlignmentPresentation,
    pub valor: TideAlignmentPresentation,
    pub vision: TideAlignmentPresentation,
    pub wild: TideAlignmentPresentation,
    pub shadow: TideAlignmentPresentation,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TideAlignmentPresentation {
    pub display_name: String,
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
    let alignments = [
        (
            TideAlignmentId::Ember,
            TideDeckColor::Orange,
            TideGlyph::TideEmber,
            source.ember,
        ),
        (
            TideAlignmentId::Valor,
            TideDeckColor::Yellow,
            TideGlyph::TideValor,
            source.valor,
        ),
        (
            TideAlignmentId::Vision,
            TideDeckColor::Blue,
            TideGlyph::TideVision,
            source.vision,
        ),
        (
            TideAlignmentId::Wild,
            TideDeckColor::Green,
            TideGlyph::TideWild,
            source.wild,
        ),
        (
            TideAlignmentId::Shadow,
            TideDeckColor::Purple,
            TideGlyph::TideShadow,
            source.shadow,
        ),
    ];
    Ok(toml::Value::try_from(CompatibilityCatalog {
        alignments: alignments
            .into_iter()
            .map(
                |(id, deck_color, glyph, presentation)| CompatibilityAlignment {
                    id: id.as_compat(),
                    deck_color: deck_color.as_compat(),
                    display_name: presentation.display_name,
                    glyph: glyph.as_compat(),
                    accent_color: presentation.accent_color,
                    chip_background: presentation.chip_background,
                    chip_border: presentation.chip_border,
                    accessibility_name: presentation.accessibility_name,
                },
            )
            .collect(),
    })?)
}

pub(crate) fn validate(source: &TideAlignmentCatalog) -> Result<()> {
    let mut names = BTreeSet::new();
    for (id, alignment) in [
        ("ember", &source.ember),
        ("valor", &source.valor),
        ("vision", &source.vision),
        ("wild", &source.wild),
        ("shadow", &source.shadow),
    ] {
        let path = format!("{id}");
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
        validate_color(&path, &alignment.accent_color)?;
        validate_color(&path, &alignment.chip_background)?;
        ensure!(
            alignment.chip_border.starts_with("rgba(") && alignment.chip_border.ends_with(')'),
            "{path}.chip_border must be an rgba() CSS color"
        );
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

    fn presentation(name: &str, color: &str) -> TideAlignmentPresentation {
        TideAlignmentPresentation {
            display_name: name.into(),
            accent_color: color.into(),
            chip_background: "#111111".into(),
            chip_border: "rgba(1, 2, 3, 0.5)".into(),
            accessibility_name: format!("{name} alignment"),
        }
    }

    fn catalog() -> TideAlignmentCatalog {
        TideAlignmentCatalog {
            ember: presentation("Ember", "#fb923c"),
            valor: presentation("Valor", "#facc15"),
            vision: presentation("Vision", "#60a5fa"),
            wild: presentation("Wild", "#4ade80"),
            shadow: presentation("Shadow", "#c084fc"),
        }
    }

    #[test]
    fn lowers_valid_catalog_deterministically() {
        assert_eq!(lower(catalog()).unwrap(), lower(catalog()).unwrap());
    }

    #[test]
    fn rejects_duplicate_and_invalid_presentation() {
        let mut duplicate = catalog();
        duplicate.valor.display_name = duplicate.ember.display_name.clone();
        assert!(
            validate(&duplicate)
                .unwrap_err()
                .to_string()
                .contains("display_name duplicates")
        );

        let mut invalid = catalog();
        invalid.ember.accent_color = "orange".into();
        assert!(
            validate(&invalid)
                .unwrap_err()
                .to_string()
                .contains("accent_color")
        );
    }
}

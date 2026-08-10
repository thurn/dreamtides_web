use std::collections::BTreeSet;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ResonanceCatalog {
    pub ember: ResonancePresentation,
    pub valor: ResonancePresentation,
    pub vision: ResonancePresentation,
    pub wild: ResonancePresentation,
    pub shadow: ResonancePresentation,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ResonancePresentation {
    pub display_name: String,
    pub accent_color: String,
    pub chip_background: String,
    pub chip_border: String,
    pub accessibility_name: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
pub enum Resonance {
    Ember,
    Valor,
    Vision,
    Wild,
    Shadow,
}

impl Resonance {
    pub(crate) fn as_compat(self) -> &'static str {
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
    resonances: Vec<CompatibilityResonance>,
}

#[derive(Serialize)]
struct CompatibilityResonance {
    id: &'static str,
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

pub fn lower(source: ResonanceCatalog) -> Result<toml::Value> {
    validate(&source)?;
    let resonances = [
        (Resonance::Ember, TideGlyph::TideEmber, source.ember),
        (Resonance::Valor, TideGlyph::TideValor, source.valor),
        (Resonance::Vision, TideGlyph::TideVision, source.vision),
        (Resonance::Wild, TideGlyph::TideWild, source.wild),
        (Resonance::Shadow, TideGlyph::TideShadow, source.shadow),
    ];
    Ok(toml::Value::try_from(CompatibilityCatalog {
        resonances: resonances
            .into_iter()
            .map(|(id, glyph, presentation)| CompatibilityResonance {
                id: id.as_compat(),
                display_name: presentation.display_name,
                glyph: glyph.as_compat(),
                accent_color: presentation.accent_color,
                chip_background: presentation.chip_background,
                chip_border: presentation.chip_border,
                accessibility_name: presentation.accessibility_name,
            })
            .collect(),
    })?)
}

pub(crate) fn validate(source: &ResonanceCatalog) -> Result<()> {
    let mut names = BTreeSet::new();
    for (id, resonance) in [
        ("ember", &source.ember),
        ("valor", &source.valor),
        ("vision", &source.vision),
        ("wild", &source.wild),
        ("shadow", &source.shadow),
    ] {
        let path = format!("{id}");
        ensure!(
            !resonance.display_name.trim().is_empty(),
            "{path}.display_name must not be blank"
        );
        ensure!(
            !resonance.accessibility_name.trim().is_empty(),
            "{path}.accessibility_name must not be blank"
        );
        ensure!(
            names.insert(resonance.display_name.to_lowercase()),
            "{path}.display_name duplicates another resonance"
        );
        validate_color(&path, &resonance.accent_color)?;
        validate_color(&path, &resonance.chip_background)?;
        ensure!(
            resonance.chip_border.starts_with("rgba(") && resonance.chip_border.ends_with(')'),
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

    fn presentation(name: &str, color: &str) -> ResonancePresentation {
        ResonancePresentation {
            display_name: name.into(),
            accent_color: color.into(),
            chip_background: "#111111".into(),
            chip_border: "rgba(1, 2, 3, 0.5)".into(),
            accessibility_name: format!("{name} resonance"),
        }
    }

    fn catalog() -> ResonanceCatalog {
        ResonanceCatalog {
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

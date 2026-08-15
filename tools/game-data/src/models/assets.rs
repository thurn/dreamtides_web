use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub enum AssetKey {
    FirstlightMeadow,
    TumbleleafVillage,
    PharaohsGate,
    WinterwakeFjords,
    Frostforge,
    HopesEnd,
    Tsukiren,
    Wilderveil,
    RustExpanse,
    FarpointStation,
    GridCity,
    Limbo,
    Apollyon,
    RoundFrameMain,
}

impl AssetKey {
    pub(crate) const fn as_compat(self) -> &'static str {
        match self {
            Self::FirstlightMeadow => "firstlight_meadow",
            Self::TumbleleafVillage => "tumbleleaf_village",
            Self::PharaohsGate => "pharaohs_gate",
            Self::WinterwakeFjords => "winterwake_fjords",
            Self::Frostforge => "frostforge",
            Self::HopesEnd => "hopes_end",
            Self::Tsukiren => "tsukiren",
            Self::Wilderveil => "wilderveil",
            Self::RustExpanse => "rust_expanse",
            Self::FarpointStation => "farpoint_station",
            Self::GridCity => "grid_city",
            Self::Limbo => "limbo",
            Self::Apollyon => "apollyon",
            Self::RoundFrameMain => "Round_frame_main.png",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_keys_use_ron_enum_variants() {
        assert_eq!(
            ron::from_str::<AssetKey>("FirstlightMeadow").unwrap(),
            AssetKey::FirstlightMeadow
        );
        assert!(ron::from_str::<AssetKey>(r#""firstlight_meadow""#).is_err());
        assert!(ron::from_str::<AssetKey>("UnknownAsset").is_err());
    }

    #[test]
    fn asset_keys_exhaustively_preserve_compatibility_names() {
        let cases = [
            (AssetKey::FirstlightMeadow, "firstlight_meadow"),
            (AssetKey::TumbleleafVillage, "tumbleleaf_village"),
            (AssetKey::PharaohsGate, "pharaohs_gate"),
            (AssetKey::WinterwakeFjords, "winterwake_fjords"),
            (AssetKey::Frostforge, "frostforge"),
            (AssetKey::HopesEnd, "hopes_end"),
            (AssetKey::Tsukiren, "tsukiren"),
            (AssetKey::Wilderveil, "wilderveil"),
            (AssetKey::RustExpanse, "rust_expanse"),
            (AssetKey::FarpointStation, "farpoint_station"),
            (AssetKey::GridCity, "grid_city"),
            (AssetKey::Limbo, "limbo"),
            (AssetKey::Apollyon, "apollyon"),
            (AssetKey::RoundFrameMain, "Round_frame_main.png"),
        ];

        for (key, expected) in cases {
            assert_eq!(key.as_compat(), expected);
        }
    }
}

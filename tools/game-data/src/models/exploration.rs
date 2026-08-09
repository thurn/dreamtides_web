use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

macro_rules! string_enum {
    ($name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        #[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
        pub enum $name { $($variant),+ }
        impl $name {
            pub(crate) fn as_compat(self) -> &'static str {
                match self { $(Self::$variant => $value),+ }
            }
            #[allow(dead_code)]
            pub(crate) fn from_compat(value: &str) -> Option<Self> {
                match value { $($value => Some(Self::$variant)),+, _ => None }
            }
        }
    };
}

string_enum!(EffectKind {
    PurgeAndCopy => "purge-and-copy", GainDreamsign => "gain-dreamsign",
    GainCard => "gain-card", TransfigureSelected => "transfigure-selected",
    PurgeSelected => "purge-selected", ChoosePack => "choose-pack",
    DraftCard => "draft-card", PurgeForEssence => "purge-for-essence",
    ChangeSubtypeSelected => "change-subtype-selected", ChangeSubtypeAll => "change-subtype-all",
    TakeCards => "take-cards", ReplaceSelectedWithCard => "replace-selected-with-card",
    ReplaceSelected => "replace-selected", GainNightmareAndCard => "gain-nightmare-and-card",
    GainRandomCards => "gain-random-cards", TransfigureFixedSelected => "transfigure-fixed-selected",
    GainOfferedCard => "gain-offered-card", TransfigureNextDraftOrShop => "transfigure-next-draft-or-shop",
    GainEssencePerCard => "gain-essence-per-card", IncreaseSparkAll => "increase-spark-all",
    GainRandomDreamsign => "gain-random-dreamsign", PurgeDreamsignForEssence => "purge-dreamsign-for-essence",
    MakeFastAll => "make-fast-all", ReduceCostAllAndGainNightmares => "reduce-cost-all-and-gain-nightmares",
    CopySelectedCard => "copy-selected-card", CopySelectedCards => "copy-selected-cards",
    CopyOfferedDeckCard => "copy-offered-deck-card", NextBattleOpeningHand => "next-battle-opening-hand",
    NextBattleStartingEnergy => "next-battle-starting-energy",
    NextBattleSmallerHandAndCostDiscount => "next-battle-smaller-hand-and-cost-discount",
    ChooseDreamAvatar => "choose-dream-avatar",
    PurgeDuplicatesAndGrantReclaim => "purge-duplicates-and-grant-reclaim",
    TransfiguredCardDraft => "transfigured-card-draft", AddSite => "add-site"
});

string_enum!(Mechanic {
    PurgeAndDuplicate => "purge-and-duplicate", GainDreamsign => "gain-dreamsign",
    GainCard => "gain-card", TransfigureDeckEntry => "transfigure-deck-entry",
    PurgeDeckEntry => "purge-deck-entry", PackChooser => "pack-chooser",
    CatalogCardChooser => "catalog-card-chooser", PurgeForEssence => "purge-for-essence",
    ChangeEntrySubtype => "change-entry-subtype", ChangeDeckSubtype => "change-deck-subtype",
    ReplaceDeckEntry => "replace-deck-entry", GainNightmareAndCard => "gain-nightmare-and-card",
    NextSiteTransfiguration => "next-site-transfiguration",
    GainEssenceByDeckPredicate => "gain-essence-by-deck-predicate",
    IncreaseDeckSpark => "increase-deck-spark", PurgeDreamsignForEssence => "purge-dreamsign-for-essence",
    MakeDeckFast => "make-deck-fast", ReduceDeckCostAndAddNightmares => "reduce-deck-cost-and-add-nightmares",
    DuplicateDeckEntry => "duplicate-deck-entry", NextBattleModifier => "next-battle-modifier",
    ChooseDreamAvatar => "choose-dream-avatar",
    PurgeDuplicatesAndGrantReclaim => "purge-duplicates-and-grant-reclaim",
    TransfiguredCardChooser => "transfigured-card-chooser", AddSite => "add-site"
});

string_enum!(SelectionPolicy {
    Fixed => "fixed", TransfigurationValue => "transfiguration-value",
    PurgeMisfit => "purge-misfit", CardBundle => "card-bundle", CardFit => "card-fit",
    DeckEntryCentrality => "deck-entry-centrality", CardFitQuality => "card-fit-quality",
    DreamsignMatch => "dreamsign-match", DuplicateValue => "duplicate-value",
    Uniform => "uniform", SiteUniform => "site-uniform"
});

string_enum!(Predicate {
    CheapCharacter => "cheap-character", Survivor => "survivor", SpiritAnimal => "spirit-animal",
    Character => "character", Warrior => "warrior", Event => "event"
});

string_enum!(DeckTarget { Chosen => "chosen", Offered => "offered" });

impl EffectKind {
    pub(crate) const ALL: [Self; 34] = [
        Self::PurgeAndCopy,
        Self::GainDreamsign,
        Self::GainCard,
        Self::TransfigureSelected,
        Self::PurgeSelected,
        Self::ChoosePack,
        Self::DraftCard,
        Self::PurgeForEssence,
        Self::ChangeSubtypeSelected,
        Self::ChangeSubtypeAll,
        Self::TakeCards,
        Self::ReplaceSelectedWithCard,
        Self::ReplaceSelected,
        Self::GainNightmareAndCard,
        Self::GainRandomCards,
        Self::TransfigureFixedSelected,
        Self::GainOfferedCard,
        Self::TransfigureNextDraftOrShop,
        Self::GainEssencePerCard,
        Self::IncreaseSparkAll,
        Self::GainRandomDreamsign,
        Self::PurgeDreamsignForEssence,
        Self::MakeFastAll,
        Self::ReduceCostAllAndGainNightmares,
        Self::CopySelectedCard,
        Self::CopySelectedCards,
        Self::CopyOfferedDeckCard,
        Self::NextBattleOpeningHand,
        Self::NextBattleStartingEnergy,
        Self::NextBattleSmallerHandAndCostDiscount,
        Self::ChooseDreamAvatar,
        Self::PurgeDuplicatesAndGrantReclaim,
        Self::TransfiguredCardDraft,
        Self::AddSite,
    ];

    pub(crate) fn mechanic(self) -> Mechanic {
        match self {
            Self::PurgeAndCopy => Mechanic::PurgeAndDuplicate,
            Self::GainDreamsign | Self::GainRandomDreamsign => Mechanic::GainDreamsign,
            Self::GainCard | Self::GainOfferedCard | Self::GainRandomCards => Mechanic::GainCard,
            Self::TransfigureSelected | Self::TransfigureFixedSelected => {
                Mechanic::TransfigureDeckEntry
            }
            Self::PurgeSelected => Mechanic::PurgeDeckEntry,
            Self::ChoosePack => Mechanic::PackChooser,
            Self::DraftCard | Self::TakeCards => Mechanic::CatalogCardChooser,
            Self::PurgeForEssence => Mechanic::PurgeForEssence,
            Self::ChangeSubtypeSelected => Mechanic::ChangeEntrySubtype,
            Self::ChangeSubtypeAll => Mechanic::ChangeDeckSubtype,
            Self::ReplaceSelectedWithCard | Self::ReplaceSelected => Mechanic::ReplaceDeckEntry,
            Self::GainNightmareAndCard => Mechanic::GainNightmareAndCard,
            Self::TransfigureNextDraftOrShop => Mechanic::NextSiteTransfiguration,
            Self::GainEssencePerCard => Mechanic::GainEssenceByDeckPredicate,
            Self::IncreaseSparkAll => Mechanic::IncreaseDeckSpark,
            Self::PurgeDreamsignForEssence => Mechanic::PurgeDreamsignForEssence,
            Self::MakeFastAll => Mechanic::MakeDeckFast,
            Self::ReduceCostAllAndGainNightmares => Mechanic::ReduceDeckCostAndAddNightmares,
            Self::CopySelectedCard | Self::CopySelectedCards | Self::CopyOfferedDeckCard => {
                Mechanic::DuplicateDeckEntry
            }
            Self::NextBattleOpeningHand
            | Self::NextBattleStartingEnergy
            | Self::NextBattleSmallerHandAndCostDiscount => Mechanic::NextBattleModifier,
            Self::ChooseDreamAvatar => Mechanic::ChooseDreamAvatar,
            Self::PurgeDuplicatesAndGrantReclaim => Mechanic::PurgeDuplicatesAndGrantReclaim,
            Self::TransfiguredCardDraft => Mechanic::TransfiguredCardChooser,
            Self::AddSite => Mechanic::AddSite,
        }
    }

    pub(crate) fn default_selection_policy(self) -> Option<SelectionPolicy> {
        match self {
            Self::GainDreamsign
            | Self::GainCard
            | Self::ReplaceSelectedWithCard
            | Self::GainNightmareAndCard => Some(SelectionPolicy::Fixed),
            Self::TransfigureSelected | Self::TransfigureFixedSelected => {
                Some(SelectionPolicy::TransfigurationValue)
            }
            Self::PurgeSelected | Self::PurgeForEssence => Some(SelectionPolicy::PurgeMisfit),
            Self::ChoosePack | Self::GainRandomCards => Some(SelectionPolicy::CardBundle),
            Self::DraftCard | Self::TakeCards | Self::TransfiguredCardDraft => {
                Some(SelectionPolicy::CardFit)
            }
            Self::ChangeSubtypeSelected => Some(SelectionPolicy::DeckEntryCentrality),
            Self::ReplaceSelected | Self::GainOfferedCard => Some(SelectionPolicy::CardFitQuality),
            Self::GainRandomDreamsign => Some(SelectionPolicy::DreamsignMatch),
            Self::CopySelectedCard | Self::CopySelectedCards | Self::CopyOfferedDeckCard => {
                Some(SelectionPolicy::DuplicateValue)
            }
            Self::ChooseDreamAvatar => Some(SelectionPolicy::Uniform),
            Self::AddSite => Some(SelectionPolicy::SiteUniform),
            _ => None,
        }
    }
}

impl ActionEffect {
    pub(crate) fn kind(&self) -> EffectKind {
        match self {
            Self::GainGeneratedCard { .. } => EffectKind::GainOfferedCard,
            Self::TransfigureSelected { .. } => EffectKind::TransfigureSelected,
            Self::PurgeSelected { .. } => EffectKind::PurgeSelected,
            Self::GainRandomCards { .. } => EffectKind::GainRandomCards,
            Self::DraftCard { .. } => EffectKind::DraftCard,
            Self::ChangeSubtypeSelected { .. } => EffectKind::ChangeSubtypeSelected,
            Self::ChangeSubtypeAll { .. } => EffectKind::ChangeSubtypeAll,
            Self::GainNamedCard { .. } => EffectKind::GainCard,
            Self::GainDreamsign { .. } => EffectKind::GainDreamsign,
            Self::GainEssencePerCard { .. } => EffectKind::GainEssencePerCard,
            Self::ChoosePack { .. } => EffectKind::ChoosePack,
            Self::IncreaseSparkAll { .. } => EffectKind::IncreaseSparkAll,
            Self::MakeFastAll => EffectKind::MakeFastAll,
            Self::ReduceCostAllAndGainNightmares { .. } => {
                EffectKind::ReduceCostAllAndGainNightmares
            }
            Self::PurgeAndCopy => EffectKind::PurgeAndCopy,
            Self::TransfigureFixedSelected { .. } => EffectKind::TransfigureFixedSelected,
            Self::GainRandomDreamsign => EffectKind::GainRandomDreamsign,
            Self::PurgeDreamsignForEssence { .. } => EffectKind::PurgeDreamsignForEssence,
            Self::CopySelectedCard { .. } => EffectKind::CopySelectedCard,
            Self::CopySelectedCards { .. } => EffectKind::CopySelectedCards,
            Self::CopyOfferedDeckCard { .. } => EffectKind::CopyOfferedDeckCard,
            Self::NextBattleOpeningHand { .. } => EffectKind::NextBattleOpeningHand,
            Self::NextBattleStartingEnergy { .. } => EffectKind::NextBattleStartingEnergy,
            Self::NextBattleSmallerHandAndCostDiscount => {
                EffectKind::NextBattleSmallerHandAndCostDiscount
            }
            Self::ChooseDreamAvatar { .. } => EffectKind::ChooseDreamAvatar,
            Self::PurgeDuplicatesAndGrantReclaim => EffectKind::PurgeDuplicatesAndGrantReclaim,
            Self::TakeCards { .. } => EffectKind::TakeCards,
            Self::ReplaceSelectedWithCard { .. } => EffectKind::ReplaceSelectedWithCard,
            Self::ReplaceSelected { .. } => EffectKind::ReplaceSelected,
            Self::GainNightmareAndCard { .. } => EffectKind::GainNightmareAndCard,
            Self::TransfigureNextDraftOrShop => EffectKind::TransfigureNextDraftOrShop,
            Self::TransfiguredCardDraft { .. } => EffectKind::TransfiguredCardDraft,
            Self::PurgeForEssence { .. } => EffectKind::PurgeForEssence,
            Self::AddSite => EffectKind::AddSite,
        }
    }
}

pub type ExplorationCatalog = Vec<EncounterDefinition>;

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct ActionId(Uuid);

impl ActionId {
    pub(crate) fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value)
            .map_err(|_| "Exploration action identifier must be an RFC 4122 UUIDv4".to_owned())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Exploration action identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err(
                "Exploration action identifier must use lowercase hyphenated UUID formatting"
                    .into(),
            );
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for ActionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for ActionId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for ActionId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Followup {
    pub title: String,
    pub subtitle: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ActionPresentation {
    pub effect_text: String,
    #[serde(default)]
    pub followup: Option<Followup>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncounterDefinition {
    pub card_id: String,
    pub prose: String,
    pub actions: Vec<ActionDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ActionDefinition {
    pub label: String,
    pub id: ActionId,
    pub presentation: ActionPresentation,
    pub effect: ActionEffect,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum ActionEffect {
    GainGeneratedCard {
        predicate: Predicate,
        count: Option<i64>,
    },
    TransfigureSelected {
        count: i64,
    },
    PurgeSelected {
        predicate: Option<Predicate>,
        count: Option<i64>,
    },
    GainRandomCards {
        predicate: Predicate,
        count: i64,
    },
    DraftCard {
        predicate: Predicate,
        count: i64,
        offer_count: i64,
    },
    ChangeSubtypeSelected {
        predicate: Option<Predicate>,
        subtype: String,
        target: DeckTarget,
    },
    ChangeSubtypeAll {
        subtype_options: Vec<String>,
    },
    GainNamedCard {
        card_id: String,
    },
    GainDreamsign {
        dreamsign_id: String,
    },
    GainEssencePerCard {
        predicate: Predicate,
        essence_per_card: i64,
    },
    ChoosePack {
        predicate: Predicate,
        pack_count: i64,
        pack_size: i64,
    },
    IncreaseSparkAll {
        spark_bonus: i64,
    },
    MakeFastAll,
    ReduceCostAllAndGainNightmares {
        energy_cost_reduction: i64,
        nightmare_count: i64,
    },
    PurgeAndCopy,
    TransfigureFixedSelected {
        predicate: Option<Predicate>,
        transfiguration: String,
        target: DeckTarget,
    },
    GainRandomDreamsign,
    PurgeDreamsignForEssence {
        essence: i64,
    },
    CopySelectedCard {
        predicate: Option<Predicate>,
        count: i64,
        target: DeckTarget,
    },
    CopySelectedCards {
        count: i64,
    },
    CopyOfferedDeckCard {
        offer_count: i64,
    },
    NextBattleOpeningHand {
        count: i64,
    },
    NextBattleStartingEnergy {
        count: i64,
    },
    NextBattleSmallerHandAndCostDiscount,
    ChooseDreamAvatar {
        offer_count: i64,
    },
    PurgeDuplicatesAndGrantReclaim,
    TakeCards {
        predicate: Predicate,
        offer_count: i64,
    },
    ReplaceSelectedWithCard {
        card_id: String,
    },
    ReplaceSelected {
        predicate: Predicate,
    },
    GainNightmareAndCard {
        card_id: String,
        nightmare_count: i64,
    },
    TransfigureNextDraftOrShop,
    TransfiguredCardDraft {
        predicate: Predicate,
        offer_count: i64,
    },
    PurgeForEssence {
        essence_per_spark: i64,
    },
    AddSite,
}

pub fn lower(catalog: ExplorationCatalog) -> Result<toml::Value> {
    let mut encounter_ids = BTreeSet::new();
    let mut action_ids = BTreeSet::new();
    let encounters = catalog
        .into_iter()
        .map(|encounter| {
            if !(1..=4).contains(&encounter.actions.len()) {
                bail!(
                    "Exploration encounter {} must contain between one and four actions",
                    encounter.card_id
                );
            }
            if !encounter_ids.insert(encounter.card_id.clone()) {
                bail!(
                    "duplicate Exploration encounter card UUID: {}",
                    encounter.card_id
                );
            }
            let actions = encounter
                .actions
                .into_iter()
                .map(|action| {
                    if !action_ids.insert(action.id.clone()) {
                        bail!("duplicate Exploration action id: {}", action.id);
                    }
                    Ok(toml::Value::Table(lower_action(action)))
                })
                .collect::<Result<Vec<_>>>()?;
            Ok(toml::Value::Table(toml::map::Map::from_iter([
                ("card-id".into(), encounter.card_id.into()),
                ("prose".into(), encounter.prose.into()),
                ("action".into(), toml::Value::Array(actions)),
            ])))
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(toml::Value::Table(toml::map::Map::from_iter([
        ("schema-version".into(), 2_i64.into()),
        (
            "effect-kinds".into(),
            toml::Value::Array(
                EffectKind::ALL
                    .into_iter()
                    .map(|kind| kind.as_compat().into())
                    .collect(),
            ),
        ),
        ("encounter".into(), toml::Value::Array(encounters)),
    ])))
}

fn lower_action(action: ActionDefinition) -> toml::map::Map<String, toml::Value> {
    let mut output = toml::map::Map::new();
    output.insert("id".into(), action.id.to_string().into());
    output.insert("label".into(), action.label.into());
    output.insert("effect-text".into(), action.presentation.effect_text.into());
    if let Some(followup) = action.presentation.followup {
        output.insert("followup-title".into(), followup.title.into());
        output.insert("followup-subtitle".into(), followup.subtitle.into());
    }
    let kind = action.effect.kind();
    output.insert(
        "canonical-mechanic-id".into(),
        kind.mechanic().as_compat().into(),
    );
    if let Some(policy) = kind.default_selection_policy() {
        output.insert("selection-policy-id".into(), policy.as_compat().into());
    }
    lower_action_effect(action.effect, &mut output);
    output
}

fn lower_action_effect(effect: ActionEffect, output: &mut toml::map::Map<String, toml::Value>) {
    macro_rules! kind {
        ($kind:ident) => {
            output.insert("effect-kind".into(), EffectKind::$kind.as_compat().into());
        };
    }
    macro_rules! int {
        ($key:literal, $value:expr) => {
            output.insert($key.into(), toml::Value::Integer($value));
        };
    }
    macro_rules! text {
        ($key:literal, $value:expr) => {
            output.insert($key.into(), toml::Value::String($value.into()));
        };
    }
    macro_rules! predicate {
        ($value:expr) => {
            output.insert("predicate".into(), $value.as_compat().into());
        };
    }
    match effect {
        ActionEffect::GainGeneratedCard {
            predicate: value,
            count,
        } => {
            kind!(GainOfferedCard);
            predicate!(value);
            if let Some(value) = count {
                int!("count", value);
            }
        }
        ActionEffect::TransfigureSelected { count } => {
            kind!(TransfigureSelected);
            int!("count", count);
        }
        ActionEffect::PurgeSelected {
            predicate: value,
            count,
        } => {
            kind!(PurgeSelected);
            if let Some(value) = value {
                predicate!(value);
            }
            if let Some(value) = count {
                int!("count", value);
            }
        }
        ActionEffect::GainRandomCards {
            predicate: value,
            count,
        } => {
            kind!(GainRandomCards);
            predicate!(value);
            int!("count", count);
        }
        ActionEffect::DraftCard {
            predicate: value,
            count,
            offer_count,
        } => {
            kind!(DraftCard);
            predicate!(value);
            int!("count", count);
            int!("offer-count", offer_count);
        }
        ActionEffect::ChangeSubtypeSelected {
            predicate: value,
            subtype,
            target,
        } => {
            kind!(ChangeSubtypeSelected);
            if let Some(value) = value {
                predicate!(value);
            }
            text!("subtype", subtype);
            text!("deck-target", target.as_compat());
        }
        ActionEffect::ChangeSubtypeAll { subtype_options } => {
            kind!(ChangeSubtypeAll);
            output.insert(
                "subtype-options".into(),
                toml::Value::Array(subtype_options.into_iter().map(Into::into).collect()),
            );
        }
        ActionEffect::GainNamedCard { card_id } => {
            kind!(GainCard);
            text!("card-id", card_id);
        }
        ActionEffect::GainDreamsign { dreamsign_id } => {
            kind!(GainDreamsign);
            text!("dreamsign-id", dreamsign_id);
        }
        ActionEffect::GainEssencePerCard {
            predicate: value,
            essence_per_card,
        } => {
            kind!(GainEssencePerCard);
            predicate!(value);
            int!("essence-per-card", essence_per_card);
        }
        ActionEffect::ChoosePack {
            predicate: value,
            pack_count,
            pack_size,
        } => {
            kind!(ChoosePack);
            predicate!(value);
            int!("pack-count", pack_count);
            int!("pack-size", pack_size);
        }
        ActionEffect::IncreaseSparkAll { spark_bonus } => {
            kind!(IncreaseSparkAll);
            int!("spark-bonus", spark_bonus);
        }
        ActionEffect::MakeFastAll => {
            kind!(MakeFastAll);
        }
        ActionEffect::ReduceCostAllAndGainNightmares {
            energy_cost_reduction,
            nightmare_count,
        } => {
            kind!(ReduceCostAllAndGainNightmares);
            int!("energy-cost-reduction", energy_cost_reduction);
            int!("nightmare-count", nightmare_count);
        }
        ActionEffect::PurgeAndCopy => {
            kind!(PurgeAndCopy);
        }
        ActionEffect::TransfigureFixedSelected {
            predicate: value,
            transfiguration,
            target,
        } => {
            kind!(TransfigureFixedSelected);
            if let Some(value) = value {
                predicate!(value);
            }
            text!("transfiguration", transfiguration);
            text!("deck-target", target.as_compat());
        }
        ActionEffect::GainRandomDreamsign => {
            kind!(GainRandomDreamsign);
        }
        ActionEffect::PurgeDreamsignForEssence { essence } => {
            kind!(PurgeDreamsignForEssence);
            int!("essence", essence);
        }
        ActionEffect::CopySelectedCard {
            predicate: value,
            count,
            target,
        } => {
            kind!(CopySelectedCard);
            if let Some(value) = value {
                predicate!(value);
            }
            int!("count", count);
            text!("deck-target", target.as_compat());
        }
        ActionEffect::CopySelectedCards { count } => {
            kind!(CopySelectedCards);
            int!("count", count);
        }
        ActionEffect::CopyOfferedDeckCard { offer_count } => {
            kind!(CopyOfferedDeckCard);
            int!("offer-count", offer_count);
        }
        ActionEffect::NextBattleOpeningHand { count } => {
            kind!(NextBattleOpeningHand);
            int!("count", count);
        }
        ActionEffect::NextBattleStartingEnergy { count } => {
            kind!(NextBattleStartingEnergy);
            int!("count", count);
        }
        ActionEffect::NextBattleSmallerHandAndCostDiscount => {
            kind!(NextBattleSmallerHandAndCostDiscount);
        }
        ActionEffect::ChooseDreamAvatar { offer_count } => {
            kind!(ChooseDreamAvatar);
            int!("offer-count", offer_count);
        }
        ActionEffect::PurgeDuplicatesAndGrantReclaim => {
            kind!(PurgeDuplicatesAndGrantReclaim);
        }
        ActionEffect::TakeCards {
            predicate: value,
            offer_count,
        } => {
            kind!(TakeCards);
            predicate!(value);
            int!("offer-count", offer_count);
        }
        ActionEffect::ReplaceSelectedWithCard { card_id } => {
            kind!(ReplaceSelectedWithCard);
            text!("card-id", card_id);
        }
        ActionEffect::ReplaceSelected { predicate: value } => {
            kind!(ReplaceSelected);
            predicate!(value);
        }
        ActionEffect::GainNightmareAndCard {
            card_id,
            nightmare_count,
        } => {
            kind!(GainNightmareAndCard);
            text!("card-id", card_id);
            int!("nightmare-count", nightmare_count);
        }
        ActionEffect::TransfigureNextDraftOrShop => {
            kind!(TransfigureNextDraftOrShop);
        }
        ActionEffect::TransfiguredCardDraft {
            predicate: value,
            offer_count,
        } => {
            kind!(TransfiguredCardDraft);
            predicate!(value);
            int!("offer-count", offer_count);
        }
        ActionEffect::PurgeForEssence { essence_per_spark } => {
            kind!(PurgeForEssence);
            int!("essence-per-spark", essence_per_spark);
        }
        ActionEffect::AddSite => {
            kind!(AddSite);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FLAT_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: "A synthetic encounter.",
    actions: [
      ActionDefinition(
        label: "Take the named card",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation: ActionPresentation(effect_text: "Gain {fixed_card}", followup: None),
        effect: GainNamedCard(card_id: "22222222-2222-4222-8222-222222222222"),
      ),
      ActionDefinition(
        label: "Take the generated card",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation: ActionPresentation(effect_text: "Gain {offered_card}", followup: None),
        effect: GainGeneratedCard(predicate: Character, count: None),
      ),
    ],
  ),
]
"###;

    #[test]
    fn parses_a_flat_encounter_list_with_uuid_action_ids() {
        let catalog: ExplorationCatalog = ron::from_str(FLAT_SOURCE).unwrap();

        assert_eq!(catalog.len(), 1);
        assert!(matches!(
            catalog[0].actions[0].effect,
            ActionEffect::GainNamedCard { .. }
        ));
        assert!(matches!(
            catalog[0].actions[1].effect,
            ActionEffect::GainGeneratedCard { .. }
        ));
    }

    #[test]
    fn rejects_wrapped_catalogs_and_non_uuid_action_ids() {
        assert!(ron::from_str::<ExplorationCatalog>("ExplorationCatalog(encounters: [])").is_err());

        let malformed = FLAT_SOURCE.replace(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "source-card:pair-1:template-1",
        );
        let error = ron::from_str::<ExplorationCatalog>(&malformed)
            .unwrap_err()
            .to_string();
        assert!(error.contains("UUID"), "unexpected error: {error}");
    }

    #[test]
    fn lowers_named_and_generated_cards_to_the_runtime_contract() {
        let catalog: ExplorationCatalog = ron::from_str(FLAT_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(actions[0]["effect-kind"].as_str(), Some("gain-card"));
        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("gain-offered-card")
        );
    }
}

use std::collections::BTreeSet;
use std::fmt;
use trox::LocalizedString;

use anyhow::{Result, bail};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::source_value;
use super::transfiguration::TransfigurationFormId;

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
    GainNightmareAndDreamsign => "gain-nightmare-and-dreamsign",
    GainNightmareAndOfferedDreamsign => "gain-nightmare-and-offered-dreamsign",
    GainCard => "gain-card", TransfigureSelected => "transfigure-selected",
    TransfigureRandomCards => "transfigure-random-cards",
    TransfigureFixedRandomCards => "transfigure-fixed-random-cards",
    PurgeSelected => "purge-selected",
    PurgeStarterCard => "purge-starter-card",
    PurgeRandomStarterCard => "purge-random-starter-card",
    PurgeRandomStarterAndGainCard => "purge-random-starter-and-gain-card",
    ReplaceAllStarterCards => "replace-all-starter-cards",
    TransfigureRandomStarterCards => "transfigure-random-starter-cards",
    TransfigureAllStarterCards => "transfigure-all-starter-cards",
    TransfigureAllCards => "transfigure-all-cards",
    ChoosePack => "choose-pack",
    DraftCard => "draft-card", PurgeForEssence => "purge-for-essence",
    ChangeSubtypeSelected => "change-subtype-selected",
    ChangeCardTypeSelected => "change-card-type-selected",
    ChangeRandomCardType => "change-random-card-type", ChangeSubtypeAll => "change-subtype-all",
    TakeCards => "take-cards", ReplaceSelectedWithCard => "replace-selected-with-card",
    ReplaceRandomWithCard => "replace-random-with-card",
    ReplaceSelected => "replace-selected", GainNightmareAndCard => "gain-nightmare-and-card",
    GainRandomCards => "gain-random-cards", TransfigureFixedSelected => "transfigure-fixed-selected",
    TransfigureAllForEssence => "transfigure-all-for-essence",
    PurgeDisclosedAndTransfigureSameType => "purge-disclosed-and-transfigure-same-type",
    GainOfferedCard => "gain-offered-card", TransfigureNextDraftOrShop => "transfigure-next-draft-or-shop",
    GainEssencePerCard => "gain-essence-per-card", IncreaseSparkAll => "increase-spark-all",
    GainEssence => "gain-essence", GainRandomEssence => "gain-random-essence",
    DoubleEssence => "double-essence",
    PurgeRandomSubtypeAndIncreaseSpark => "purge-random-subtype-and-increase-spark",
    GainRandomDreamsign => "gain-random-dreamsign", PurgeDreamsignForEssence => "purge-dreamsign-for-essence",
    GainOfferedDreamsign => "gain-offered-dreamsign",
    ReplaceSelectedDreamsignWithOffered => "replace-selected-dreamsign-with-offered",
    ReplaceAllDreamsignsRandom => "replace-all-dreamsigns-random",
    PurgeSelectedDreamsignAndGainRandom => "purge-selected-dreamsign-and-gain-random",
    MakeFastAll => "make-fast-all",
    MakePredicateFastAndGainNightmares => "make-predicate-fast-and-gain-nightmares",
    ReduceCostAllAndGainNightmares => "reduce-cost-all-and-gain-nightmares",
    PurgeOneTransfigureAndCopyOthers => "purge-one-transfigure-and-copy-others",
    CopySelectedCard => "copy-selected-card", CopySelectedCards => "copy-selected-cards",
    CopyRandomCards => "copy-random-cards",
    CopyOfferedDeckCard => "copy-offered-deck-card", NextBattleOpeningHand => "next-battle-opening-hand",
    NextBattleStartingEnergy => "next-battle-starting-energy",
    NextBattleSmallerHandAndCostDiscount => "next-battle-smaller-hand-and-cost-discount",
    ChooseAvatar => "choose-avatar",
    PurgeDuplicatesAndGrantReclaim => "purge-duplicates-and-grant-reclaim",
    TakeTransfiguredCardsAndGainNightmares => "take-transfigured-cards-and-gain-nightmares",
    TransfiguredCardDraft => "transfigured-card-draft", AddFixedSite => "add-fixed-site",
    ChooseSiteType => "choose-site-type", AddSite => "add-site",
    FreeNextShop => "free-next-shop",
    LoseHalfEssenceAndFreePurchases => "lose-half-essence-and-free-purchases"
});

string_enum!(Mechanic {
    PurgeAndDuplicate => "purge-and-duplicate", GainDreamsign => "gain-dreamsign",
    GainCard => "gain-card", TransfigureDeckEntry => "transfigure-deck-entry",
    TransfigureDeckForEssence => "transfigure-deck-for-essence",
    PurgeDeckEntry => "purge-deck-entry", PackChooser => "pack-chooser",
    CatalogCardChooser => "catalog-card-chooser", PurgeForEssence => "purge-for-essence",
    ChangeEntrySubtype => "change-entry-subtype", ChangeEntryCardType => "change-entry-card-type",
    ChangeDeckSubtype => "change-deck-subtype",
    ReplaceDeckEntry => "replace-deck-entry", GainNightmareAndCard => "gain-nightmare-and-card",
    NextSiteTransfiguration => "next-site-transfiguration",
    GainEssenceByDeckPredicate => "gain-essence-by-deck-predicate",
    EssenceMutation => "essence-mutation",
    IncreaseDeckSpark => "increase-deck-spark", PurgeDreamsignForEssence => "purge-dreamsign-for-essence",
    MakeDeckFast => "make-deck-fast", ReduceDeckCostAndAddNightmares => "reduce-deck-cost-and-add-nightmares",
    DuplicateDeckEntry => "duplicate-deck-entry", NextBattleModifier => "next-battle-modifier",
    ChooseAvatar => "choose-avatar",
    PurgeDuplicatesAndGrantReclaim => "purge-duplicates-and-grant-reclaim",
    TransfiguredCardChooser => "transfigured-card-chooser", AddSite => "add-site",
    ShopPurchaseModifier => "shop-purchase-modifier"
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
    Character => "character", Warrior => "warrior", Event => "event", Legendary => "legendary"
});

string_enum!(DeckTarget { Chosen => "chosen", Offered => "offered" });

string_enum!(CardTypeTarget { Character => "Character", Event => "Event" });

string_enum!(FixedSiteType {
    Duplication => "Duplication", Shop => "Shop", DreamsignBazaar => "DreamsignBazaar",
    Transfiguration => "Transfiguration", Purge => "Purge"
});

impl EffectKind {
    pub(crate) const ALL: [Self; 66] = [
        Self::PurgeAndCopy,
        Self::PurgeOneTransfigureAndCopyOthers,
        Self::GainDreamsign,
        Self::GainNightmareAndDreamsign,
        Self::GainNightmareAndOfferedDreamsign,
        Self::GainCard,
        Self::TransfigureSelected,
        Self::TransfigureRandomCards,
        Self::TransfigureFixedRandomCards,
        Self::PurgeSelected,
        Self::PurgeStarterCard,
        Self::PurgeRandomStarterCard,
        Self::PurgeRandomStarterAndGainCard,
        Self::ReplaceAllStarterCards,
        Self::TransfigureRandomStarterCards,
        Self::TransfigureAllStarterCards,
        Self::TransfigureAllCards,
        Self::ChoosePack,
        Self::DraftCard,
        Self::PurgeForEssence,
        Self::ChangeSubtypeSelected,
        Self::ChangeCardTypeSelected,
        Self::ChangeRandomCardType,
        Self::ChangeSubtypeAll,
        Self::TakeCards,
        Self::TakeTransfiguredCardsAndGainNightmares,
        Self::ReplaceSelectedWithCard,
        Self::ReplaceRandomWithCard,
        Self::ReplaceSelected,
        Self::GainNightmareAndCard,
        Self::GainRandomCards,
        Self::TransfigureFixedSelected,
        Self::GainOfferedCard,
        Self::TransfigureAllForEssence,
        Self::PurgeDisclosedAndTransfigureSameType,
        Self::TransfigureNextDraftOrShop,
        Self::GainEssencePerCard,
        Self::IncreaseSparkAll,
        Self::GainEssence,
        Self::GainRandomEssence,
        Self::DoubleEssence,
        Self::PurgeRandomSubtypeAndIncreaseSpark,
        Self::GainRandomDreamsign,
        Self::PurgeDreamsignForEssence,
        Self::GainOfferedDreamsign,
        Self::ReplaceSelectedDreamsignWithOffered,
        Self::ReplaceAllDreamsignsRandom,
        Self::PurgeSelectedDreamsignAndGainRandom,
        Self::MakeFastAll,
        Self::MakePredicateFastAndGainNightmares,
        Self::ReduceCostAllAndGainNightmares,
        Self::CopySelectedCard,
        Self::CopySelectedCards,
        Self::CopyRandomCards,
        Self::CopyOfferedDeckCard,
        Self::NextBattleOpeningHand,
        Self::NextBattleStartingEnergy,
        Self::NextBattleSmallerHandAndCostDiscount,
        Self::ChooseAvatar,
        Self::PurgeDuplicatesAndGrantReclaim,
        Self::TransfiguredCardDraft,
        Self::AddFixedSite,
        Self::ChooseSiteType,
        Self::AddSite,
        Self::FreeNextShop,
        Self::LoseHalfEssenceAndFreePurchases,
    ];

    pub(crate) fn mechanic(self) -> Mechanic {
        match self {
            Self::PurgeAndCopy => Mechanic::PurgeAndDuplicate,
            Self::GainDreamsign
            | Self::GainNightmareAndDreamsign
            | Self::GainNightmareAndOfferedDreamsign
            | Self::GainRandomDreamsign
            | Self::GainOfferedDreamsign
            | Self::ReplaceSelectedDreamsignWithOffered
            | Self::ReplaceAllDreamsignsRandom
            | Self::PurgeSelectedDreamsignAndGainRandom => Mechanic::GainDreamsign,
            Self::GainCard | Self::GainOfferedCard | Self::GainRandomCards => Mechanic::GainCard,
            Self::TransfigureSelected
            | Self::TransfigureFixedSelected
            | Self::TransfigureRandomCards
            | Self::TransfigureFixedRandomCards
            | Self::TransfigureRandomStarterCards
            | Self::TransfigureAllStarterCards
            | Self::TransfigureAllCards
            | Self::PurgeOneTransfigureAndCopyOthers => Mechanic::TransfigureDeckEntry,
            Self::TransfigureAllForEssence => Mechanic::TransfigureDeckForEssence,
            Self::PurgeSelected
            | Self::PurgeStarterCard
            | Self::PurgeRandomStarterCard
            | Self::PurgeDisclosedAndTransfigureSameType
            | Self::PurgeRandomSubtypeAndIncreaseSpark => Mechanic::PurgeDeckEntry,
            Self::ChoosePack => Mechanic::PackChooser,
            Self::DraftCard | Self::TakeCards => Mechanic::CatalogCardChooser,
            Self::PurgeForEssence => Mechanic::PurgeForEssence,
            Self::ChangeSubtypeSelected => Mechanic::ChangeEntrySubtype,
            Self::ChangeCardTypeSelected | Self::ChangeRandomCardType => {
                Mechanic::ChangeEntryCardType
            }
            Self::ChangeSubtypeAll => Mechanic::ChangeDeckSubtype,
            Self::ReplaceSelectedWithCard
            | Self::ReplaceRandomWithCard
            | Self::ReplaceSelected
            | Self::PurgeRandomStarterAndGainCard
            | Self::ReplaceAllStarterCards => Mechanic::ReplaceDeckEntry,
            Self::GainNightmareAndCard => Mechanic::GainNightmareAndCard,
            Self::TransfigureNextDraftOrShop => Mechanic::NextSiteTransfiguration,
            Self::GainEssencePerCard => Mechanic::GainEssenceByDeckPredicate,
            Self::GainEssence | Self::GainRandomEssence | Self::DoubleEssence => {
                Mechanic::EssenceMutation
            }
            Self::IncreaseSparkAll => Mechanic::IncreaseDeckSpark,
            Self::PurgeDreamsignForEssence => Mechanic::PurgeDreamsignForEssence,
            Self::MakeFastAll | Self::MakePredicateFastAndGainNightmares => Mechanic::MakeDeckFast,
            Self::ReduceCostAllAndGainNightmares => Mechanic::ReduceDeckCostAndAddNightmares,
            Self::CopySelectedCard
            | Self::CopySelectedCards
            | Self::CopyRandomCards
            | Self::CopyOfferedDeckCard => Mechanic::DuplicateDeckEntry,
            Self::NextBattleOpeningHand
            | Self::NextBattleStartingEnergy
            | Self::NextBattleSmallerHandAndCostDiscount => Mechanic::NextBattleModifier,
            Self::ChooseAvatar => Mechanic::ChooseAvatar,
            Self::PurgeDuplicatesAndGrantReclaim => Mechanic::PurgeDuplicatesAndGrantReclaim,
            Self::TransfiguredCardDraft | Self::TakeTransfiguredCardsAndGainNightmares => {
                Mechanic::TransfiguredCardChooser
            }
            Self::AddFixedSite | Self::ChooseSiteType | Self::AddSite => Mechanic::AddSite,
            Self::FreeNextShop | Self::LoseHalfEssenceAndFreePurchases => {
                Mechanic::ShopPurchaseModifier
            }
        }
    }

    pub(crate) fn default_selection_policy(self) -> Option<SelectionPolicy> {
        match self {
            Self::GainDreamsign
            | Self::GainNightmareAndDreamsign
            | Self::GainCard
            | Self::ReplaceSelectedWithCard
            | Self::GainNightmareAndCard
            | Self::AddFixedSite => Some(SelectionPolicy::Fixed),
            Self::TransfigureSelected | Self::TransfigureFixedSelected => {
                Some(SelectionPolicy::TransfigurationValue)
            }
            Self::TransfigureRandomCards | Self::TransfigureFixedRandomCards => {
                Some(SelectionPolicy::Uniform)
            }
            Self::PurgeSelected
            | Self::PurgeForEssence
            | Self::PurgeDisclosedAndTransfigureSameType => Some(SelectionPolicy::PurgeMisfit),
            Self::PurgeStarterCard
            | Self::PurgeRandomStarterCard
            | Self::TransfigureRandomStarterCards
            | Self::TransfigureAllStarterCards
            | Self::TransfigureAllCards
            | Self::PurgeOneTransfigureAndCopyOthers
            | Self::PurgeRandomSubtypeAndIncreaseSpark => Some(SelectionPolicy::Uniform),
            Self::ChoosePack | Self::GainRandomCards => Some(SelectionPolicy::CardBundle),
            Self::DraftCard
            | Self::TakeCards
            | Self::TransfiguredCardDraft
            | Self::TakeTransfiguredCardsAndGainNightmares => Some(SelectionPolicy::CardFit),
            Self::ChangeSubtypeSelected => Some(SelectionPolicy::DeckEntryCentrality),
            Self::ChangeCardTypeSelected => Some(SelectionPolicy::DeckEntryCentrality),
            Self::ChangeRandomCardType => Some(SelectionPolicy::Uniform),
            Self::ReplaceRandomWithCard => Some(SelectionPolicy::Uniform),
            Self::ReplaceSelected | Self::GainOfferedCard => Some(SelectionPolicy::CardFitQuality),
            Self::GainRandomDreamsign
            | Self::GainNightmareAndOfferedDreamsign
            | Self::GainOfferedDreamsign
            | Self::ReplaceSelectedDreamsignWithOffered => Some(SelectionPolicy::DreamsignMatch),
            Self::ReplaceAllDreamsignsRandom | Self::PurgeSelectedDreamsignAndGainRandom => {
                Some(SelectionPolicy::Uniform)
            }
            Self::CopySelectedCard | Self::CopySelectedCards | Self::CopyOfferedDeckCard => {
                Some(SelectionPolicy::DuplicateValue)
            }
            Self::CopyRandomCards => Some(SelectionPolicy::Uniform),
            Self::ChooseAvatar => Some(SelectionPolicy::Uniform),
            Self::GainRandomEssence => Some(SelectionPolicy::Uniform),
            Self::ChooseSiteType | Self::AddSite => Some(SelectionPolicy::SiteUniform),
            _ => None,
        }
    }
}

impl ActionEffect {
    pub(crate) fn kind(&self) -> EffectKind {
        match self {
            Self::GainGeneratedCard { .. } => EffectKind::GainOfferedCard,
            Self::TransfigureSelected { .. } => EffectKind::TransfigureSelected,
            Self::TransfigureRandomCards { .. } => EffectKind::TransfigureRandomCards,
            Self::TransfigureFixedRandomCards { .. } => EffectKind::TransfigureFixedRandomCards,
            Self::PurgeSelected { .. } => EffectKind::PurgeSelected,
            Self::PurgeStarterCard => EffectKind::PurgeStarterCard,
            Self::PurgeRandomStarterCard => EffectKind::PurgeRandomStarterCard,
            Self::PurgeRandomStarterAndGainCard { .. } => EffectKind::PurgeRandomStarterAndGainCard,
            Self::ReplaceAllStarterCards { .. } => EffectKind::ReplaceAllStarterCards,
            Self::TransfigureRandomStarterCards { .. } => EffectKind::TransfigureRandomStarterCards,
            Self::TransfigureAllStarterCards => EffectKind::TransfigureAllStarterCards,
            Self::TransfigureAllCards => EffectKind::TransfigureAllCards,
            Self::GainRandomCards { .. } => EffectKind::GainRandomCards,
            Self::DraftCard { .. } => EffectKind::DraftCard,
            Self::ChangeSubtypeSelected { .. } => EffectKind::ChangeSubtypeSelected,
            Self::ChangeCardTypeSelected { .. } => EffectKind::ChangeCardTypeSelected,
            Self::ChangeRandomCardType { .. } => EffectKind::ChangeRandomCardType,
            Self::ChangeSubtypeAll { .. } => EffectKind::ChangeSubtypeAll,
            Self::GainNamedCard { .. } => EffectKind::GainCard,
            Self::GainDreamsign { .. } => EffectKind::GainDreamsign,
            Self::GainNightmareAndDreamsign { .. } => EffectKind::GainNightmareAndDreamsign,
            Self::GainNightmareAndOfferedDreamsign { .. } => {
                EffectKind::GainNightmareAndOfferedDreamsign
            }
            Self::GainEssencePerCard { .. } => EffectKind::GainEssencePerCard,
            Self::GainEssence { .. } => EffectKind::GainEssence,
            Self::GainRandomEssence { .. } => EffectKind::GainRandomEssence,
            Self::DoubleEssence => EffectKind::DoubleEssence,
            Self::ChoosePack { .. } => EffectKind::ChoosePack,
            Self::IncreaseSparkAll { .. } => EffectKind::IncreaseSparkAll,
            Self::PurgeRandomSubtypeAndIncreaseSpark { .. } => {
                EffectKind::PurgeRandomSubtypeAndIncreaseSpark
            }
            Self::MakeFastAll => EffectKind::MakeFastAll,
            Self::MakePredicateFastAndGainNightmares { .. } => {
                EffectKind::MakePredicateFastAndGainNightmares
            }
            Self::ReduceCostAllAndGainNightmares { .. } => {
                EffectKind::ReduceCostAllAndGainNightmares
            }
            Self::PurgeAndCopy => EffectKind::PurgeAndCopy,
            Self::PurgeOneTransfigureAndCopyOthers { .. } => {
                EffectKind::PurgeOneTransfigureAndCopyOthers
            }
            Self::TransfigureFixedSelected { .. } => EffectKind::TransfigureFixedSelected,
            Self::TransfigureAllForEssence { .. } => EffectKind::TransfigureAllForEssence,
            Self::PurgeDisclosedAndTransfigureSameType { .. } => {
                EffectKind::PurgeDisclosedAndTransfigureSameType
            }
            Self::GainRandomDreamsign => EffectKind::GainRandomDreamsign,
            Self::PurgeDreamsignForEssence { .. } => EffectKind::PurgeDreamsignForEssence,
            Self::GainOfferedDreamsign { .. } => EffectKind::GainOfferedDreamsign,
            Self::ReplaceSelectedDreamsignWithOffered { .. } => {
                EffectKind::ReplaceSelectedDreamsignWithOffered
            }
            Self::ReplaceAllDreamsignsRandom => EffectKind::ReplaceAllDreamsignsRandom,
            Self::PurgeSelectedDreamsignAndGainRandom { .. } => {
                EffectKind::PurgeSelectedDreamsignAndGainRandom
            }
            Self::CopySelectedCard { .. } => EffectKind::CopySelectedCard,
            Self::CopySelectedCards { .. } => EffectKind::CopySelectedCards,
            Self::CopyRandomCards { .. } => EffectKind::CopyRandomCards,
            Self::CopyOfferedDeckCard { .. } => EffectKind::CopyOfferedDeckCard,
            Self::NextBattleOpeningHand { .. } => EffectKind::NextBattleOpeningHand,
            Self::NextBattleStartingEnergy { .. } => EffectKind::NextBattleStartingEnergy,
            Self::NextBattleSmallerHandAndCostDiscount => {
                EffectKind::NextBattleSmallerHandAndCostDiscount
            }
            Self::ChooseAvatar { .. } => EffectKind::ChooseAvatar,
            Self::PurgeDuplicatesAndGrantReclaim => EffectKind::PurgeDuplicatesAndGrantReclaim,
            Self::TakeCards { .. } => EffectKind::TakeCards,
            Self::TakeTransfiguredCardsAndGainNightmares { .. } => {
                EffectKind::TakeTransfiguredCardsAndGainNightmares
            }
            Self::ReplaceSelectedWithCard { .. } => EffectKind::ReplaceSelectedWithCard,
            Self::ReplaceRandomWithCard { .. } => EffectKind::ReplaceRandomWithCard,
            Self::ReplaceSelected { .. } => EffectKind::ReplaceSelected,
            Self::GainNightmareAndCard { .. } => EffectKind::GainNightmareAndCard,
            Self::TransfigureNextDraftOrShop => EffectKind::TransfigureNextDraftOrShop,
            Self::TransfiguredCardDraft { .. } => EffectKind::TransfiguredCardDraft,
            Self::PurgeForEssence { .. } => EffectKind::PurgeForEssence,
            Self::AddFixedSite { .. } => EffectKind::AddFixedSite,
            Self::ChooseSiteType { .. } => EffectKind::ChooseSiteType,
            Self::AddSite => EffectKind::AddSite,
            Self::FreeNextShop => EffectKind::FreeNextShop,
            Self::LoseHalfEssenceAndFreePurchases { .. } => {
                EffectKind::LoseHalfEssenceAndFreePurchases
            }
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
pub struct FollowupOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<LocalizedString>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<LocalizedString>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ActionPresentationOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect_text: Option<LocalizedString>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub followup: Option<FollowupOverride>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EncounterDefinition {
    pub card_id: String,
    pub prose: LocalizedString,
    pub actions: Vec<ActionDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ActionDefinition {
    pub label: LocalizedString,
    pub id: ActionId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub presentation_override: Option<ActionPresentationOverride>,
    pub effect: ActionEffect,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum ActionEffect {
    GainGeneratedCard {
        predicate: Predicate,
        count: Option<i64>,
    },
    TransfigureSelected {
        predicate: Option<Predicate>,
        count: i64,
    },
    TransfigureRandomCards {
        predicate: Predicate,
        count: i64,
    },
    TransfigureFixedRandomCards {
        predicate: Predicate,
        count: i64,
        transfiguration: TransfigurationFormId,
    },
    PurgeSelected {
        predicate: Option<Predicate>,
        count: Option<i64>,
    },
    PurgeStarterCard,
    PurgeRandomStarterCard,
    PurgeRandomStarterAndGainCard {
        predicate: Predicate,
    },
    ReplaceAllStarterCards {
        predicate: Predicate,
    },
    TransfigureRandomStarterCards {
        count: i64,
    },
    TransfigureAllStarterCards,
    TransfigureAllCards,
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
    ChangeCardTypeSelected {
        card_type: CardTypeTarget,
        target: DeckTarget,
    },
    ChangeRandomCardType {
        count: i64,
        card_type: CardTypeTarget,
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
    GainNightmareAndDreamsign {
        dreamsign_id: String,
        nightmare_count: i64,
    },
    GainNightmareAndOfferedDreamsign {
        offer_count: i64,
        nightmare_count: i64,
    },
    GainEssencePerCard {
        predicate: Predicate,
        essence_per_card: i64,
    },
    GainEssence {
        essence: i64,
    },
    GainRandomEssence {
        minimum_essence: i64,
        maximum_essence: i64,
    },
    DoubleEssence,
    ChoosePack {
        predicate: Predicate,
        pack_count: i64,
        pack_size: i64,
    },
    IncreaseSparkAll {
        spark_bonus: i64,
    },
    PurgeRandomSubtypeAndIncreaseSpark {
        subtype: String,
        spark_bonus: i64,
    },
    MakeFastAll,
    MakePredicateFastAndGainNightmares {
        predicate: Predicate,
        nightmare_count: i64,
    },
    ReduceCostAllAndGainNightmares {
        energy_cost_reduction: i64,
        nightmare_count: i64,
    },
    PurgeAndCopy,
    PurgeOneTransfigureAndCopyOthers {
        offer_count: i64,
        transfiguration: TransfigurationFormId,
    },
    TransfigureFixedSelected {
        predicate: Option<Predicate>,
        transfiguration: TransfigurationFormId,
        target: DeckTarget,
        count: Option<i64>,
    },
    TransfigureAllForEssence {
        essence: i64,
        predicate: Predicate,
        transfiguration: TransfigurationFormId,
    },
    PurgeDisclosedAndTransfigureSameType {
        transfiguration: TransfigurationFormId,
    },
    GainRandomDreamsign,
    PurgeDreamsignForEssence {
        essence: i64,
    },
    GainOfferedDreamsign {
        offer_count: i64,
    },
    ReplaceSelectedDreamsignWithOffered {
        offer_count: i64,
    },
    ReplaceAllDreamsignsRandom,
    PurgeSelectedDreamsignAndGainRandom {
        count: i64,
    },
    CopySelectedCard {
        predicate: Option<Predicate>,
        count: i64,
        target: DeckTarget,
    },
    CopySelectedCards {
        count: i64,
    },
    CopyRandomCards {
        predicate: Predicate,
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
    ChooseAvatar {
        offer_count: i64,
    },
    PurgeDuplicatesAndGrantReclaim,
    TakeCards {
        predicate: Predicate,
        offer_count: i64,
    },
    TakeTransfiguredCardsAndGainNightmares {
        predicate: Predicate,
        offer_count: i64,
        transfiguration: TransfigurationFormId,
        nightmare_count: i64,
    },
    ReplaceSelectedWithCard {
        card_id: String,
    },
    ReplaceRandomWithCard {
        predicate: Predicate,
        card_id: String,
    },
    ReplaceSelected {
        predicate: Predicate,
        count: Option<i64>,
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
    AddFixedSite {
        site_type: FixedSiteType,
    },
    ChooseSiteType {
        offer_count: i64,
    },
    AddSite,
    FreeNextShop,
    LoseHalfEssenceAndFreePurchases {
        count: i64,
    },
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
                    match &action.effect {
                        ActionEffect::PurgeSelected {
                            count: Some(count), ..
                        } if *count <= 0 => {
                            bail!(
                                "Exploration purge-selected action {} must have a positive count",
                                action.id
                            );
                        }
                        ActionEffect::TransfigureSelected { count, .. }
                        | ActionEffect::TransfigureRandomCards { count, .. }
                        | ActionEffect::TransfigureFixedRandomCards { count, .. }
                        | ActionEffect::CopyRandomCards { count, .. }
                        | ActionEffect::ChangeRandomCardType { count, .. }
                            if *count <= 0 =>
                        {
                            bail!(
                                "Exploration {} action {} must have a positive count",
                                action.effect.kind().as_compat(),
                                action.id
                            );
                        }
                        ActionEffect::TransfigureSelected {
                            predicate: None,
                            count,
                        } if *count > 1 => {
                            bail!(
                                "Exploration transfigure-selected action {} requires a predicate when count exceeds one",
                                action.id
                            );
                        }
                        ActionEffect::ReplaceSelected {
                            count: Some(count),
                            ..
                        } if *count <= 0 => {
                            bail!(
                                "Exploration replace-selected action {} must have a positive count",
                                action.id
                            );
                        }
                        ActionEffect::TransfigureFixedSelected {
                            count: Some(count),
                            ..
                        } if *count <= 0 => {
                            bail!(
                                "Exploration transfigure-fixed-selected action {} must have a positive count",
                                action.id
                            );
                        }
                        ActionEffect::TransfigureFixedSelected {
                            predicate,
                            target,
                            count: Some(count),
                            ..
                        } if *count > 1
                            && (predicate.is_none() || *target != DeckTarget::Chosen) =>
                        {
                            bail!(
                                "Exploration transfigure-fixed-selected action {} with count greater than one requires a chosen target and predicate",
                                action.id
                            );
                        }
                        ActionEffect::GainEssence { essence } if *essence <= 0 => {
                            bail!(
                                "Exploration gain-essence action {} must have positive essence",
                                action.id
                            );
                        }
                        ActionEffect::GainRandomEssence {
                            minimum_essence,
                            maximum_essence,
                        } if *minimum_essence <= 0 || *maximum_essence <= 0 => {
                            bail!(
                                "Exploration gain-random-essence action {} must have positive bounds",
                                action.id
                            );
                        }
                        ActionEffect::GainRandomEssence {
                            minimum_essence,
                            maximum_essence,
                        } if minimum_essence > maximum_essence => {
                            bail!(
                                "Exploration gain-random-essence action {} minimum must not exceed maximum",
                                action.id
                            );
                        }
                        ActionEffect::GainOfferedDreamsign { offer_count }
                        | ActionEffect::ReplaceSelectedDreamsignWithOffered { offer_count }
                            if *offer_count <= 0 =>
                        {
                            bail!(
                                "Exploration {} action {} must have a positive offer count",
                                action.effect.kind().as_compat(),
                                action.id
                            );
                        }
                        ActionEffect::GainNightmareAndDreamsign {
                            nightmare_count, ..
                        } if *nightmare_count <= 0 => {
                            bail!(
                                "Exploration gain-nightmare-and-dreamsign action {} must have a positive nightmare count",
                                action.id
                            );
                        }
                        ActionEffect::GainNightmareAndOfferedDreamsign {
                            offer_count,
                            nightmare_count,
                        } if *offer_count <= 0 || *nightmare_count <= 0 => {
                            bail!(
                                "Exploration gain-nightmare-and-offered-dreamsign action {} must have positive offer and nightmare counts",
                                action.id
                            );
                        }
                        ActionEffect::PurgeSelectedDreamsignAndGainRandom { count }
                            if *count <= 0 =>
                        {
                            bail!(
                                "Exploration purge-selected-dreamsign-and-gain-random action {} must have a positive count",
                                action.id
                            );
                        }
                        ActionEffect::TransfigureRandomStarterCards { count } if *count <= 0 => {
                            bail!(
                                "Exploration transfigure-random-starter-cards action {} must have a positive count",
                                action.id
                            );
                        }
                        ActionEffect::MakePredicateFastAndGainNightmares {
                            nightmare_count, ..
                        } if *nightmare_count <= 0 => {
                            bail!(
                                "Exploration make-predicate-fast-and-gain-nightmares action {} must have a positive nightmare count",
                                action.id
                            );
                        }
                        ActionEffect::TakeTransfiguredCardsAndGainNightmares {
                            offer_count, ..
                        }
                        | ActionEffect::PurgeOneTransfigureAndCopyOthers {
                            offer_count, ..
                        } if *offer_count != 4 => {
                            bail!(
                                "Exploration {} action {} must have an offer count of exactly 4",
                                action.effect.kind().as_compat(),
                                action.id
                            );
                        }
                        ActionEffect::TakeTransfiguredCardsAndGainNightmares {
                            nightmare_count, ..
                        } if *nightmare_count <= 0 => {
                            bail!(
                                "Exploration take-transfigured-cards-and-gain-nightmares action {} must have a positive nightmare count",
                                action.id
                            );
                        }
                        ActionEffect::ChooseSiteType { offer_count } if *offer_count <= 0 => {
                            bail!(
                                "Exploration choose-site-type action {} must have a positive offer count",
                                action.id
                            );
                        }
                        ActionEffect::LoseHalfEssenceAndFreePurchases { count }
                            if *count <= 0 =>
                        {
                            bail!(
                                "Exploration lose-half-essence-and-free-purchases action {} must have a positive count",
                                action.id
                            );
                        }
                        _ => {}
                    }
                    Ok(toml::Value::Table(lower_action(action)?))
                })
                .collect::<Result<Vec<_>>>()?;
            Ok(toml::Value::Table(toml::map::Map::from_iter([
                ("card-id".into(), encounter.card_id.into()),
                ("prose".into(), source_value(&encounter.prose)?),
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

fn lower_action(action: ActionDefinition) -> Result<toml::map::Map<String, toml::Value>> {
    let mut output = toml::map::Map::new();
    let label = source_value(&action.label)?;
    output.insert("id".into(), action.id.to_string().into());
    output.insert("label".into(), label.clone());
    if let Some(presentation) = action.presentation_override {
        if let Some(effect_text) = presentation.effect_text {
            output.insert("effect-text".into(), source_value(&effect_text)?);
        }
        if let Some(followup) = presentation.followup {
            if let Some(title) = followup.title {
                output.insert("followup-title".into(), source_value(&title)?);
            }
            if let Some(subtitle) = followup.subtitle {
                output.insert("followup-subtitle".into(), source_value(&subtitle)?);
            }
        }
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
    Ok(output)
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
        ActionEffect::TransfigureSelected {
            predicate: value,
            count,
        } => {
            kind!(TransfigureSelected);
            if let Some(value) = value {
                predicate!(value);
            }
            int!("count", count);
        }
        ActionEffect::TransfigureRandomCards {
            predicate: value,
            count,
        } => {
            kind!(TransfigureRandomCards);
            predicate!(value);
            int!("count", count);
        }
        ActionEffect::TransfigureFixedRandomCards {
            predicate: value,
            count,
            transfiguration,
        } => {
            kind!(TransfigureFixedRandomCards);
            predicate!(value);
            int!("count", count);
            text!("transfiguration", transfiguration.as_compat());
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
        ActionEffect::PurgeStarterCard => {
            kind!(PurgeStarterCard);
        }
        ActionEffect::PurgeRandomStarterCard => {
            kind!(PurgeRandomStarterCard);
        }
        ActionEffect::PurgeRandomStarterAndGainCard { predicate: value } => {
            kind!(PurgeRandomStarterAndGainCard);
            predicate!(value);
        }
        ActionEffect::ReplaceAllStarterCards { predicate: value } => {
            kind!(ReplaceAllStarterCards);
            predicate!(value);
        }
        ActionEffect::TransfigureRandomStarterCards { count } => {
            kind!(TransfigureRandomStarterCards);
            int!("count", count);
        }
        ActionEffect::TransfigureAllStarterCards => {
            kind!(TransfigureAllStarterCards);
        }
        ActionEffect::TransfigureAllCards => {
            kind!(TransfigureAllCards);
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
        ActionEffect::ChangeCardTypeSelected { card_type, target } => {
            kind!(ChangeCardTypeSelected);
            text!("card-type", card_type.as_compat());
            text!("deck-target", target.as_compat());
        }
        ActionEffect::ChangeRandomCardType { count, card_type } => {
            kind!(ChangeRandomCardType);
            int!("count", count);
            text!("card-type", card_type.as_compat());
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
        ActionEffect::GainNightmareAndDreamsign {
            dreamsign_id,
            nightmare_count,
        } => {
            kind!(GainNightmareAndDreamsign);
            text!("dreamsign-id", dreamsign_id);
            int!("nightmare-count", nightmare_count);
        }
        ActionEffect::GainNightmareAndOfferedDreamsign {
            offer_count,
            nightmare_count,
        } => {
            kind!(GainNightmareAndOfferedDreamsign);
            int!("offer-count", offer_count);
            int!("nightmare-count", nightmare_count);
        }
        ActionEffect::GainEssencePerCard {
            predicate: value,
            essence_per_card,
        } => {
            kind!(GainEssencePerCard);
            predicate!(value);
            int!("essence-per-card", essence_per_card);
        }
        ActionEffect::GainEssence { essence } => {
            kind!(GainEssence);
            int!("essence", essence);
        }
        ActionEffect::GainRandomEssence {
            minimum_essence,
            maximum_essence,
        } => {
            kind!(GainRandomEssence);
            int!("minimum-essence", minimum_essence);
            int!("maximum-essence", maximum_essence);
        }
        ActionEffect::DoubleEssence => {
            kind!(DoubleEssence);
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
        ActionEffect::PurgeRandomSubtypeAndIncreaseSpark {
            subtype,
            spark_bonus,
        } => {
            kind!(PurgeRandomSubtypeAndIncreaseSpark);
            text!("subtype", subtype);
            int!("spark-bonus", spark_bonus);
        }
        ActionEffect::MakeFastAll => {
            kind!(MakeFastAll);
        }
        ActionEffect::MakePredicateFastAndGainNightmares {
            predicate: value,
            nightmare_count,
        } => {
            kind!(MakePredicateFastAndGainNightmares);
            predicate!(value);
            int!("nightmare-count", nightmare_count);
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
        ActionEffect::PurgeOneTransfigureAndCopyOthers {
            offer_count,
            transfiguration,
        } => {
            kind!(PurgeOneTransfigureAndCopyOthers);
            int!("offer-count", offer_count);
            text!("transfiguration", transfiguration.as_compat());
        }
        ActionEffect::TransfigureFixedSelected {
            predicate: value,
            transfiguration,
            target,
            count,
        } => {
            kind!(TransfigureFixedSelected);
            if let Some(value) = value {
                predicate!(value);
            }
            if let Some(value) = count {
                int!("count", value);
            }
            text!("transfiguration", transfiguration.as_compat());
            text!("deck-target", target.as_compat());
        }
        ActionEffect::TransfigureAllForEssence {
            essence,
            predicate: value,
            transfiguration,
        } => {
            kind!(TransfigureAllForEssence);
            int!("essence", essence);
            predicate!(value);
            text!("transfiguration", transfiguration.as_compat());
        }
        ActionEffect::PurgeDisclosedAndTransfigureSameType { transfiguration } => {
            kind!(PurgeDisclosedAndTransfigureSameType);
            text!("transfiguration", transfiguration.as_compat());
        }
        ActionEffect::GainRandomDreamsign => {
            kind!(GainRandomDreamsign);
        }
        ActionEffect::PurgeDreamsignForEssence { essence } => {
            kind!(PurgeDreamsignForEssence);
            int!("essence", essence);
        }
        ActionEffect::GainOfferedDreamsign { offer_count } => {
            kind!(GainOfferedDreamsign);
            int!("offer-count", offer_count);
        }
        ActionEffect::ReplaceSelectedDreamsignWithOffered { offer_count } => {
            kind!(ReplaceSelectedDreamsignWithOffered);
            int!("offer-count", offer_count);
        }
        ActionEffect::ReplaceAllDreamsignsRandom => {
            kind!(ReplaceAllDreamsignsRandom);
        }
        ActionEffect::PurgeSelectedDreamsignAndGainRandom { count } => {
            kind!(PurgeSelectedDreamsignAndGainRandom);
            int!("count", count);
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
        ActionEffect::CopyRandomCards {
            predicate: value,
            count,
        } => {
            kind!(CopyRandomCards);
            predicate!(value);
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
        ActionEffect::ChooseAvatar { offer_count } => {
            kind!(ChooseAvatar);
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
        ActionEffect::TakeTransfiguredCardsAndGainNightmares {
            predicate: value,
            offer_count,
            transfiguration,
            nightmare_count,
        } => {
            kind!(TakeTransfiguredCardsAndGainNightmares);
            predicate!(value);
            int!("offer-count", offer_count);
            text!("transfiguration", transfiguration.as_compat());
            int!("nightmare-count", nightmare_count);
        }
        ActionEffect::ReplaceSelectedWithCard { card_id } => {
            kind!(ReplaceSelectedWithCard);
            text!("card-id", card_id);
        }
        ActionEffect::ReplaceRandomWithCard {
            predicate: value,
            card_id,
        } => {
            kind!(ReplaceRandomWithCard);
            predicate!(value);
            text!("card-id", card_id);
        }
        ActionEffect::ReplaceSelected {
            predicate: value,
            count,
        } => {
            kind!(ReplaceSelected);
            predicate!(value);
            if let Some(value) = count {
                int!("count", value);
            }
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
        ActionEffect::AddFixedSite { site_type } => {
            kind!(AddFixedSite);
            text!("site-type", site_type.as_compat());
        }
        ActionEffect::ChooseSiteType { offer_count } => {
            kind!(ChooseSiteType);
            int!("offer-count", offer_count);
        }
        ActionEffect::AddSite => {
            kind!(AddSite);
        }
        ActionEffect::FreeNextShop => {
            kind!(FreeNextShop);
        }
        ActionEffect::LoseHalfEssenceAndFreePurchases { count } => {
            kind!(LoseHalfEssenceAndFreePurchases);
            int!("count", count);
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
    prose: Tx("A synthetic encounter."),
    actions: [
      ActionDefinition(
        label: Tx("Take the named card"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Gain {{fixed_card}}"), followup: None),
        effect: GainNamedCard(card_id: "22222222-2222-4222-8222-222222222222"),
      ),
      ActionDefinition(
        label: Tx("Take the generated card"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Gain {{offered_card}}"), followup: None),
        effect: GainGeneratedCard(predicate: Character, count: None),
      ),
      ActionDefinition(
        label: Tx("Swear a synthetic oath"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Purge a random Warrior and strengthen the rest."), followup: None),
        effect: PurgeRandomSubtypeAndIncreaseSpark(subtype: "Warrior", spark_bonus: 1),
      ),
      ActionDefinition(
        label: Tx("Enter synthetic light"),
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Spend essence to transfigure Events."), followup: None),
        effect: TransfigureAllForEssence(essence: 100, predicate: Event, transfiguration: Inspired),
      ),
    ],
  ),
]
"###;

    const PURGE_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("A synthetic escort waits in the rain."),
    actions: [
      ActionDefinition(
        label: Tx("Stand Down the Escort"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(
          effect_text: Tx("Purge up to 2 chosen Warrior cards"),
          followup: FollowupOverride(
            subtitle: Tx("Choose up to two Warrior cards to purge."),
          ),
        ),
        effect: PurgeSelected(predicate: Warrior, count: 2),
      ),
    ],
  ),
]
"###;

    const ESSENCE_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Synthetic essence refracts through three mirrors."),
    actions: [
      ActionDefinition(
        label: Tx("Gather the Light"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Gain 100 essence"), followup: None),
        effect: GainEssence(essence: 100),
      ),
      ActionDefinition(
        label: Tx("Chance the Light"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Gain 50 to 150 essence"), followup: None),
        effect: GainRandomEssence(minimum_essence: 50, maximum_essence: 150),
      ),
      ActionDefinition(
        label: Tx("Reflect the Light"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Double your essence"), followup: None),
        effect: DoubleEssence,
      ),
    ],
  ),
]
"###;

    const DREAMSIGN_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Four synthetic Dreamsign offers wait in the mist."),
    actions: [
      ActionDefinition(
        label: Tx("Accept an Offered Sign"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Gain an offered Dreamsign"), followup: None),
        effect: GainOfferedDreamsign(offer_count: 3),
      ),
      ActionDefinition(
        label: Tx("Replace a Chosen Sign"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Replace a chosen Dreamsign"), followup: None),
        effect: ReplaceSelectedDreamsignWithOffered(offer_count: 4),
      ),
      ActionDefinition(
        label: Tx("Replace Every Sign"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Replace all Dreamsigns"), followup: None),
        effect: ReplaceAllDreamsignsRandom,
      ),
      ActionDefinition(
        label: Tx("Purge and Replace a Sign"),
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Purge and replace a Dreamsign"), followup: None),
        effect: PurgeSelectedDreamsignAndGainRandom(count: 2),
      ),
    ],
  ),
]
"###;

    const NIGHTMARE_DREAMSIGN_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Two synthetic bargains gather in the dark."),
    actions: [
      ActionDefinition(
        label: Tx("Accept the Marked Sign"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Gain a Dreamsign and a Nightmare"), followup: None),
        effect: GainNightmareAndDreamsign(
          dreamsign_id: "00000000-0000-4000-8000-000000000002",
          nightmare_count: 1,
        ),
      ),
      ActionDefinition(
        label: Tx("Choose Among Dark Signs"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Choose a Dreamsign and gain two Nightmares"), followup: None),
        effect: GainNightmareAndOfferedDreamsign(
          offer_count: 3,
          nightmare_count: 2,
        ),
      ),
    ],
  ),
]
"###;

    const STARTER_CARD_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Four synthetic paths lead away from familiar beginnings."),
    actions: [
      ActionDefinition(
        label: Tx("Release the Disclosed Beginning"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Purge {{starter_card}}"), followup: None),
        effect: PurgeStarterCard,
      ),
      ActionDefinition(
        label: Tx("Release a Hidden Beginning"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Purge a random starter card"), followup: None),
        effect: PurgeRandomStarterCard,
      ),
      ActionDefinition(
        label: Tx("Trade One Beginning"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Purge a random starter card and gain a Character"), followup: None),
        effect: PurgeRandomStarterAndGainCard(predicate: Character),
      ),
      ActionDefinition(
        label: Tx("Trade Every Beginning"),
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Replace all starter cards with Events"), followup: None),
        effect: ReplaceAllStarterCards(predicate: Event),
      ),
    ],
  ),
]
"###;

    const STARTER_CARD_TRANSFIGURATION_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Two synthetic paths reshape familiar beginnings."),
    actions: [
      ActionDefinition(
        label: Tx("Reshape Two Beginnings"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Transfigure 2 random starter cards"), followup: None),
        effect: TransfigureRandomStarterCards(count: 2),
      ),
      ActionDefinition(
        label: Tx("Reshape Every Beginning"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Transfigure all starter cards"), followup: None),
        effect: TransfigureAllStarterCards,
      ),
    ],
  ),
]
"###;

    const MULTI_CARD_TRANSFIGURATION_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Four synthetic paths reshape a deck."),
    actions: [
      ActionDefinition(
        label: Tx("Reshape One Chosen Card"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Transfigure a chosen card"), followup: None),
        effect: TransfigureSelected(count: 1),
      ),
      ActionDefinition(
        label: Tx("Reshape Two Chosen Events"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Transfigure 2 chosen Events"), followup: None),
        effect: TransfigureSelected(predicate: Event, count: 2),
      ),
      ActionDefinition(
        label: Tx("Reshape Two Random Events"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Transfigure 2 random Events"), followup: None),
        effect: TransfigureRandomCards(predicate: Event, count: 2),
      ),
      ActionDefinition(
        label: Tx("Kindle Two Random Events"),
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Kindle 2 random Events"), followup: None),
        effect: TransfigureFixedRandomCards(
          predicate: Event,
          count: 2,
          transfiguration: Kindled,
        ),
      ),
    ],
  ),
]
"###;

    const DECK_MUTATION_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Four synthetic paths alter multiple deck entries."),
    actions: [
      ActionDefinition(
        label: Tx("Replace Two Events"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Replace up to 2 Events"), followup: None),
        effect: ReplaceSelected(predicate: Event, count: 2),
      ),
      ActionDefinition(
        label: Tx("Kindle Two Events"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Kindle 2 chosen Events"), followup: None),
        effect: TransfigureFixedSelected(
          predicate: Event,
          transfiguration: Kindled,
          target: Chosen,
          count: 2,
        ),
      ),
      ActionDefinition(
        label: Tx("Copy Two Events"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Copy 2 random Events"), followup: None),
        effect: CopyRandomCards(predicate: Event, count: 2),
      ),
      ActionDefinition(
        label: Tx("Make Two Characters"),
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Make 2 random cards Characters"), followup: None),
        effect: ChangeRandomCardType(count: 2, card_type: Character),
      ),
    ],
  ),
]
"###;

    const WAVE7_DECK_MUTATION_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Three synthetic paths alter individual deck entries."),
    actions: [
      ActionDefinition(
        label: Tx("Replace a Legend"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Replace a random legendary card"), followup: None),
        effect: ReplaceRandomWithCard(
          predicate: Legendary,
          card_id: "00000000-0000-4000-8000-000000000001",
        ),
      ),
      ActionDefinition(
        label: Tx("Change an Offered Card"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Change {{deck_card}} into an Event"), followup: None),
        effect: ChangeCardTypeSelected(card_type: Event, target: Offered),
      ),
      ActionDefinition(
        label: Tx("Change a Chosen Card"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Change a chosen card into a Character"), followup: None),
        effect: ChangeCardTypeSelected(card_type: Character, target: Chosen),
      ),
    ],
  ),
]
"###;

    const FIXED_SITE_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("A synthetic passage opens toward a disclosed destination."),
    actions: [
      ActionDefinition(
        label: Tx("Open a Duplication Site"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Add a duplication site"), followup: None),
        effect: AddFixedSite(site_type: Duplication),
      ),
    ],
  ),
]
"###;

    const CHOOSE_SITE_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("A synthetic passage offers several disclosed destinations."),
    actions: [
      ActionDefinition(
        label: Tx("Choose a Site"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Choose 1 of 3 sites to add"), followup: None),
        effect: ChooseSiteType(offer_count: 3),
      ),
    ],
  ),
]
"###;

    const SHOP_PURCHASE_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("A synthetic augury writes two promises in silver ink."),
    actions: [
      ActionDefinition(
        label: Tx("Claim the Open Market"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("The next shop is free"), followup: None),
        effect: FreeNextShop,
      ),
      ActionDefinition(
        label: Tx("Pay Half the Price"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Lose half your essence; the next 3 purchases are free"), followup: None),
        effect: LoseHalfEssenceAndFreePurchases(count: 3),
      ),
    ],
  ),
]
"###;

    const WAVE8_DECK_TRANSFORMATION_SOURCE: &str = r###"#![enable(implicit_some)]
[
  EncounterDefinition(
    card_id: "11111111-1111-4111-8111-111111111111",
    prose: Tx("Synthetic compound deck transformations."),
    actions: [
      ActionDefinition(
        label: Tx("Transfigure all"),
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Transfigure all cards"), followup: None),
        effect: TransfigureAllCards,
      ),
      ActionDefinition(
        label: Tx("Purge the disclosed card"),
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Purge and transfigure its peers"), followup: None),
        effect: PurgeDisclosedAndTransfigureSameType(transfiguration: Inspired),
      ),
      ActionDefinition(
        label: Tx("Hasten events"),
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Make events fast and gain 2 Nightmares"), followup: None),
        effect: MakePredicateFastAndGainNightmares(predicate: Event, nightmare_count: 2),
      ),
    ],
  ),
  EncounterDefinition(
    card_id: "22222222-2222-4222-8222-222222222222",
    prose: Tx("Synthetic offered-card transformations."),
    actions: [
      ActionDefinition(
        label: Tx("Take transformed cards"),
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Take transformed cards and gain a Nightmare"), followup: None),
        effect: TakeTransfiguredCardsAndGainNightmares(
          predicate: Character,
          offer_count: 4,
          transfiguration: Kindled,
          nightmare_count: 1,
        ),
      ),
      ActionDefinition(
        label: Tx("Choose one to purge"),
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        presentation_override: ActionPresentationOverride(effect_text: Tx("Purge one, transfigure and copy the others"), followup: None),
        effect: PurgeOneTransfigureAndCopyOthers(
          offer_count: 4,
          transfiguration: Perfected,
        ),
      ),
    ],
  ),
]
"###;

    #[test]
    fn lowers_wave8_compound_deck_transformations_with_exact_fields_and_metadata() {
        let catalog: ExplorationCatalog = ron::from_str(WAVE8_DECK_TRANSFORMATION_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let first = lowered["encounter"][0]["action"].as_array().unwrap();
        let second = lowered["encounter"][1]["action"].as_array().unwrap();

        assert_eq!(
            first[0]["effect-kind"].as_str(),
            Some("transfigure-all-cards")
        );
        assert_eq!(
            first[0]["canonical-mechanic-id"].as_str(),
            Some("transfigure-deck-entry")
        );
        assert_eq!(first[0]["selection-policy-id"].as_str(), Some("uniform"));
        assert!(first[0].get("transfiguration").is_none());

        assert_eq!(
            first[1]["effect-kind"].as_str(),
            Some("purge-disclosed-and-transfigure-same-type")
        );
        assert_eq!(first[1]["transfiguration"].as_str(), Some("Inspired"));
        assert_eq!(
            first[1]["canonical-mechanic-id"].as_str(),
            Some("purge-deck-entry")
        );
        assert_eq!(
            first[1]["selection-policy-id"].as_str(),
            Some("purge-misfit")
        );

        assert_eq!(
            first[2]["effect-kind"].as_str(),
            Some("make-predicate-fast-and-gain-nightmares")
        );
        assert_eq!(first[2]["predicate"].as_str(), Some("event"));
        assert_eq!(first[2]["nightmare-count"].as_integer(), Some(2));
        assert_eq!(
            first[2]["canonical-mechanic-id"].as_str(),
            Some("make-deck-fast")
        );
        assert!(first[2].get("selection-policy-id").is_none());

        assert_eq!(
            second[0]["effect-kind"].as_str(),
            Some("take-transfigured-cards-and-gain-nightmares")
        );
        assert_eq!(second[0]["predicate"].as_str(), Some("character"));
        assert_eq!(second[0]["offer-count"].as_integer(), Some(4));
        assert_eq!(second[0]["transfiguration"].as_str(), Some("Kindled"));
        assert_eq!(second[0]["nightmare-count"].as_integer(), Some(1));
        assert_eq!(
            second[0]["canonical-mechanic-id"].as_str(),
            Some("transfigured-card-chooser")
        );
        assert_eq!(second[0]["selection-policy-id"].as_str(), Some("card-fit"));

        assert_eq!(
            second[1]["effect-kind"].as_str(),
            Some("purge-one-transfigure-and-copy-others")
        );
        assert_eq!(second[1]["offer-count"].as_integer(), Some(4));
        assert_eq!(second[1]["transfiguration"].as_str(), Some("Perfected"));
        assert_eq!(
            second[1]["canonical-mechanic-id"].as_str(),
            Some("transfigure-deck-entry")
        );
        assert_eq!(second[1]["selection-policy-id"].as_str(), Some("uniform"));
    }

    #[test]
    fn wave8_compound_deck_transformations_reject_invalid_counts_and_foreign_fields() {
        for malformed in [
            WAVE8_DECK_TRANSFORMATION_SOURCE.replace("nightmare_count: 2", "nightmare_count: 0"),
            WAVE8_DECK_TRANSFORMATION_SOURCE.replace("nightmare_count: 1", "nightmare_count: 0"),
            WAVE8_DECK_TRANSFORMATION_SOURCE.replace("offer_count: 4", "offer_count: 3"),
        ] {
            let catalog: ExplorationCatalog = ron::from_str(&malformed).unwrap();
            assert!(lower(catalog).is_err());
        }

        for (from, to) in [
            (
                "effect: TransfigureAllCards,",
                "effect: TransfigureAllCards(count: 1),",
            ),
            (
                "transfiguration: Inspired",
                "transfiguration: Inspired, count: 1",
            ),
            ("nightmare_count: 2", "nightmare_count: 2, count: 1"),
            ("nightmare_count: 1", "nightmare_count: 1, count: 1"),
            (
                "transfiguration: Perfected",
                "transfiguration: Perfected, count: 1",
            ),
        ] {
            assert!(
                ron::from_str::<ExplorationCatalog>(
                    &WAVE8_DECK_TRANSFORMATION_SOURCE.replace(from, to)
                )
                .is_err()
            );
        }
    }

    #[test]
    fn wave8_effect_kinds_keep_semantic_registry_adjacency() {
        let kinds = EffectKind::ALL.map(EffectKind::as_compat);
        for (before, after) in [
            ("transfigure-all-starter-cards", "transfigure-all-cards"),
            (
                "transfigure-all-for-essence",
                "purge-disclosed-and-transfigure-same-type",
            ),
            ("make-fast-all", "make-predicate-fast-and-gain-nightmares"),
            ("purge-and-copy", "purge-one-transfigure-and-copy-others"),
            ("take-cards", "take-transfigured-cards-and-gain-nightmares"),
        ] {
            let index = kinds.iter().position(|kind| *kind == before).unwrap();
            assert_eq!(kinds[index + 1], after);
        }
    }

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
        assert!(matches!(
            catalog[0].actions[2].effect,
            ActionEffect::PurgeRandomSubtypeAndIncreaseSpark { .. }
        ));
        assert!(matches!(
            catalog[0].actions[3].effect,
            ActionEffect::TransfigureAllForEssence { .. }
        ));
    }

    #[test]
    fn transfiguration_references_use_ron_enum_variants() {
        let bare =
            "TransfigureAllForEssence(essence: 10, predicate: Event, transfiguration: Inspired)";
        assert!(ron::from_str::<ActionEffect>(bare).is_ok());
        assert!(ron::from_str::<ActionEffect>(&bare.replace("Inspired", r#""Inspired""#)).is_err());
        assert!(ron::from_str::<ActionEffect>(&bare.replace("Inspired", "Unknown")).is_err());
    }

    #[test]
    fn lowers_every_fixed_site_type_with_fixed_metadata_and_preserves_effect_order() {
        for (source_variant, compat_value) in [
            ("Duplication", "Duplication"),
            ("Shop", "Shop"),
            ("DreamsignBazaar", "DreamsignBazaar"),
            ("Transfiguration", "Transfiguration"),
            ("Purge", "Purge"),
        ] {
            let source = FIXED_SITE_SOURCE.replace("Duplication", source_variant);
            let catalog: ExplorationCatalog = ron::from_str(&source).unwrap();
            let lowered = lower(catalog).unwrap();
            let action = &lowered["encounter"][0]["action"][0];

            assert_eq!(action["effect-kind"].as_str(), Some("add-fixed-site"));
            assert_eq!(action["site-type"].as_str(), Some(compat_value));
            assert_eq!(action["canonical-mechanic-id"].as_str(), Some("add-site"));
            assert_eq!(action["selection-policy-id"].as_str(), Some("fixed"));

            let kinds = lowered["effect-kinds"].as_array().unwrap();
            let fixed = kinds
                .iter()
                .position(|kind| kind.as_str() == Some("add-fixed-site"))
                .unwrap();
            assert_eq!(kinds[fixed + 1].as_str(), Some("choose-site-type"));
            assert_eq!(kinds[fixed + 2].as_str(), Some("add-site"));
        }
    }

    #[test]
    fn lowers_site_type_chooser_with_uniform_metadata_and_offer_count() {
        let catalog: ExplorationCatalog = ron::from_str(CHOOSE_SITE_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let action = &lowered["encounter"][0]["action"][0];

        assert_eq!(action["effect-kind"].as_str(), Some("choose-site-type"));
        assert_eq!(action["offer-count"].as_integer(), Some(3));
        assert_eq!(action["canonical-mechanic-id"].as_str(), Some("add-site"));
        assert_eq!(action["selection-policy-id"].as_str(), Some("site-uniform"));
    }

    #[test]
    fn site_type_chooser_requires_a_positive_offer_count_and_rejects_foreign_fields() {
        for invalid_count in [0, -1] {
            let source = CHOOSE_SITE_SOURCE
                .replace("offer_count: 3", &format!("offer_count: {invalid_count}"));
            let catalog: ExplorationCatalog = ron::from_str(&source).unwrap();
            assert!(
                lower(catalog)
                    .unwrap_err()
                    .to_string()
                    .contains("must have a positive offer count")
            );
        }
        assert!(
            ron::from_str::<ExplorationCatalog>(
                &CHOOSE_SITE_SOURCE.replace("ChooseSiteType(offer_count: 3)", "ChooseSiteType")
            )
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(
                &CHOOSE_SITE_SOURCE.replace("offer_count: 3", "offer_count: 3, site_type: Shop")
            )
            .is_err()
        );
    }

    #[test]
    fn parses_and_lowers_shop_purchase_modifiers_with_exact_metadata_fields_and_order() {
        let catalog: ExplorationCatalog = ron::from_str(SHOP_PURCHASE_SOURCE).unwrap();
        assert!(matches!(
            catalog[0].actions[0].effect,
            ActionEffect::FreeNextShop
        ));
        assert!(matches!(
            catalog[0].actions[1].effect,
            ActionEffect::LoseHalfEssenceAndFreePurchases { count: 3 }
        ));

        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();
        assert_eq!(actions[0]["effect-kind"].as_str(), Some("free-next-shop"));
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("shop-purchase-modifier")
        );
        assert!(actions[0].get("selection-policy-id").is_none());
        assert!(actions[0].get("count").is_none());

        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("lose-half-essence-and-free-purchases")
        );
        assert_eq!(actions[1]["count"].as_integer(), Some(3));
        assert_eq!(
            actions[1]["canonical-mechanic-id"].as_str(),
            Some("shop-purchase-modifier")
        );
        assert!(actions[1].get("selection-policy-id").is_none());

        let kinds = lowered["effect-kinds"].as_array().unwrap();
        assert_eq!(
            kinds[kinds.len() - 3..]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "add-site",
                "free-next-shop",
                "lose-half-essence-and-free-purchases",
            ]
        );
    }

    #[test]
    fn shop_purchase_modifier_source_rejects_foreign_fields_and_nonpositive_counts() {
        assert!(
            ron::from_str::<ExplorationCatalog>(
                &SHOP_PURCHASE_SOURCE
                    .replace("effect: FreeNextShop,", "effect: FreeNextShop(count: 1),")
            )
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(&SHOP_PURCHASE_SOURCE.replace(
                "LoseHalfEssenceAndFreePurchases(count: 3)",
                "LoseHalfEssenceAndFreePurchases"
            ))
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(
                &SHOP_PURCHASE_SOURCE.replace("count: 3", "count: 3, essence: 10")
            )
            .is_err()
        );

        for count in [0, -1] {
            let catalog: ExplorationCatalog = ron::from_str(
                &SHOP_PURCHASE_SOURCE.replace("count: 3", &format!("count: {count}")),
            )
            .unwrap();
            assert!(
                lower(catalog)
                    .unwrap_err()
                    .to_string()
                    .contains("must have a positive count")
            );
        }
    }

    #[test]
    fn fixed_site_source_rejects_missing_foreign_and_unknown_site_types() {
        assert!(
            ron::from_str::<ExplorationCatalog>(
                &FIXED_SITE_SOURCE.replace("AddFixedSite(site_type: Duplication)", "AddFixedSite")
            )
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(
                &FIXED_SITE_SOURCE
                    .replace("site_type: Duplication", "site_type: Duplication, count: 1")
            )
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(
                &FIXED_SITE_SOURCE.replace("Duplication", "Battle")
            )
            .is_err()
        );
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
        assert_eq!(
            actions[2]["effect-kind"].as_str(),
            Some("purge-random-subtype-and-increase-spark")
        );
        assert_eq!(actions[2]["subtype"].as_str(), Some("Warrior"));
        assert_eq!(actions[2]["spark-bonus"].as_integer(), Some(1));
        assert_eq!(
            actions[2]["canonical-mechanic-id"].as_str(),
            Some("purge-deck-entry")
        );
        assert_eq!(actions[2]["selection-policy-id"].as_str(), Some("uniform"));
        assert_eq!(
            actions[3]["effect-kind"].as_str(),
            Some("transfigure-all-for-essence")
        );
        assert_eq!(actions[3]["essence"].as_integer(), Some(100));
        assert_eq!(actions[3]["predicate"].as_str(), Some("event"));
        assert_eq!(actions[3]["transfiguration"].as_str(), Some("Inspired"));
        assert_eq!(
            actions[3]["canonical-mechanic-id"].as_str(),
            Some("transfigure-deck-for-essence")
        );
        assert!(actions[3].get("selection-policy-id").is_none());
    }

    #[test]
    fn lowers_starter_card_effects_with_exact_metadata_and_fields() {
        let catalog: ExplorationCatalog = ron::from_str(STARTER_CARD_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(
            actions[0]["effect-kind"].as_str(),
            Some("purge-starter-card")
        );
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("purge-deck-entry")
        );
        assert_eq!(actions[0]["selection-policy-id"].as_str(), Some("uniform"));
        assert!(actions[0].get("predicate").is_none());

        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("purge-random-starter-card")
        );
        assert_eq!(actions[1]["selection-policy-id"].as_str(), Some("uniform"));

        assert_eq!(
            actions[2]["effect-kind"].as_str(),
            Some("purge-random-starter-and-gain-card")
        );
        assert_eq!(actions[2]["predicate"].as_str(), Some("character"));
        assert_eq!(
            actions[2]["canonical-mechanic-id"].as_str(),
            Some("replace-deck-entry")
        );
        assert!(actions[2].get("selection-policy-id").is_none());

        assert_eq!(
            actions[3]["effect-kind"].as_str(),
            Some("replace-all-starter-cards")
        );
        assert_eq!(actions[3]["predicate"].as_str(), Some("event"));
        assert_eq!(
            actions[3]["canonical-mechanic-id"].as_str(),
            Some("replace-deck-entry")
        );
        assert!(actions[3].get("selection-policy-id").is_none());

        let kinds = lowered["effect-kinds"].as_array().unwrap();
        let purge_selected = kinds
            .iter()
            .position(|kind| kind.as_str() == Some("purge-selected"))
            .unwrap();
        assert_eq!(
            kinds[purge_selected + 1..purge_selected + 5]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "purge-starter-card",
                "purge-random-starter-card",
                "purge-random-starter-and-gain-card",
                "replace-all-starter-cards",
            ]
        );
    }

    #[test]
    fn lowers_starter_card_transfigurations_with_exact_metadata_fields_and_order() {
        let catalog: ExplorationCatalog =
            ron::from_str(STARTER_CARD_TRANSFIGURATION_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(
            actions[0]["effect-kind"].as_str(),
            Some("transfigure-random-starter-cards")
        );
        assert_eq!(actions[0]["count"].as_integer(), Some(2));
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("transfigure-deck-entry")
        );
        assert_eq!(actions[0]["selection-policy-id"].as_str(), Some("uniform"));

        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("transfigure-all-starter-cards")
        );
        assert!(actions[1].get("count").is_none());
        assert_eq!(
            actions[1]["canonical-mechanic-id"].as_str(),
            Some("transfigure-deck-entry")
        );
        assert_eq!(actions[1]["selection-policy-id"].as_str(), Some("uniform"));

        let kinds = lowered["effect-kinds"].as_array().unwrap();
        let starter = kinds
            .iter()
            .position(|kind| kind.as_str() == Some("purge-starter-card"))
            .unwrap();
        assert_eq!(
            kinds[starter..starter + 6]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "purge-starter-card",
                "purge-random-starter-card",
                "purge-random-starter-and-gain-card",
                "replace-all-starter-cards",
                "transfigure-random-starter-cards",
                "transfigure-all-starter-cards",
            ]
        );
    }

    #[test]
    fn starter_card_transfigurations_reject_invalid_source_fields_and_counts() {
        assert!(
            ron::from_str::<ExplorationCatalog>(&STARTER_CARD_TRANSFIGURATION_SOURCE.replace(
                "effect: TransfigureAllStarterCards,",
                "effect: TransfigureAllStarterCards(count: 1),"
            ))
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(&STARTER_CARD_TRANSFIGURATION_SOURCE.replace(
                "TransfigureRandomStarterCards(count: 2)",
                "TransfigureRandomStarterCards()"
            ))
            .is_err()
        );

        let malformed: ExplorationCatalog =
            ron::from_str(&STARTER_CARD_TRANSFIGURATION_SOURCE.replace("count: 2", "count: 0"))
                .unwrap();
        assert!(
            lower(malformed)
                .unwrap_err()
                .to_string()
                .contains("must have a positive count")
        );
    }

    #[test]
    fn lowers_multi_card_transfigurations_with_exact_metadata_fields_and_order() {
        let catalog: ExplorationCatalog = ron::from_str(MULTI_CARD_TRANSFIGURATION_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(
            actions[0]["effect-kind"].as_str(),
            Some("transfigure-selected")
        );
        assert!(actions[0].get("predicate").is_none());
        assert_eq!(actions[0]["count"].as_integer(), Some(1));
        assert_eq!(
            actions[0]["selection-policy-id"].as_str(),
            Some("transfiguration-value")
        );

        assert_eq!(actions[1]["predicate"].as_str(), Some("event"));
        assert_eq!(actions[1]["count"].as_integer(), Some(2));

        assert_eq!(
            actions[2]["effect-kind"].as_str(),
            Some("transfigure-random-cards")
        );
        assert_eq!(actions[2]["predicate"].as_str(), Some("event"));
        assert_eq!(actions[2]["count"].as_integer(), Some(2));
        assert_eq!(
            actions[2]["canonical-mechanic-id"].as_str(),
            Some("transfigure-deck-entry")
        );
        assert_eq!(actions[2]["selection-policy-id"].as_str(), Some("uniform"));

        assert_eq!(
            actions[3]["effect-kind"].as_str(),
            Some("transfigure-fixed-random-cards")
        );
        assert_eq!(actions[3]["predicate"].as_str(), Some("event"));
        assert_eq!(actions[3]["count"].as_integer(), Some(2));
        assert_eq!(actions[3]["transfiguration"].as_str(), Some("Kindled"));
        assert_eq!(actions[3]["selection-policy-id"].as_str(), Some("uniform"));

        let kinds = lowered["effect-kinds"].as_array().unwrap();
        let selected = kinds
            .iter()
            .position(|kind| kind.as_str() == Some("transfigure-selected"))
            .unwrap();
        assert_eq!(
            kinds[selected..selected + 4]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "transfigure-selected",
                "transfigure-random-cards",
                "transfigure-fixed-random-cards",
                "purge-selected",
            ]
        );
    }

    #[test]
    fn multi_card_transfigurations_reject_invalid_counts_and_missing_predicates() {
        let missing_selected_predicate: ExplorationCatalog =
            ron::from_str(&MULTI_CARD_TRANSFIGURATION_SOURCE.replace(
                "effect: TransfigureSelected(predicate: Event, count: 2)",
                "effect: TransfigureSelected(count: 2)",
            ))
            .unwrap();
        assert!(
            lower(missing_selected_predicate)
                .unwrap_err()
                .to_string()
                .contains("requires a predicate when count exceeds one")
        );

        for (from, to) in [
            (
                "TransfigureRandomCards(predicate: Event, count: 2)",
                "TransfigureRandomCards(count: 2)",
            ),
            (
                "TransfigureFixedRandomCards(\n          predicate: Event,",
                "TransfigureFixedRandomCards(",
            ),
        ] {
            let missing_predicate = MULTI_CARD_TRANSFIGURATION_SOURCE.replace(from, to);
            assert!(ron::from_str::<ExplorationCatalog>(&missing_predicate).is_err());
        }

        for (from, to) in [
            (
                "TransfigureRandomCards(predicate: Event, count: 2)",
                "TransfigureRandomCards(predicate: Event, count: 0)",
            ),
            (
                "count: 2,\n          transfiguration: Kindled",
                "count: 0,\n          transfiguration: Kindled",
            ),
        ] {
            let malformed: ExplorationCatalog =
                ron::from_str(&MULTI_CARD_TRANSFIGURATION_SOURCE.replace(from, to)).unwrap();
            assert!(
                lower(malformed)
                    .unwrap_err()
                    .to_string()
                    .contains("must have a positive count")
            );
        }
    }

    #[test]
    fn lowers_multi_entry_deck_mutations_with_exact_metadata_fields_and_order() {
        let catalog: ExplorationCatalog = ron::from_str(DECK_MUTATION_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(actions[0]["effect-kind"].as_str(), Some("replace-selected"));
        assert_eq!(actions[0]["predicate"].as_str(), Some("event"));
        assert_eq!(actions[0]["count"].as_integer(), Some(2));
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("replace-deck-entry")
        );
        assert_eq!(
            actions[0]["selection-policy-id"].as_str(),
            Some("card-fit-quality")
        );

        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("transfigure-fixed-selected")
        );
        assert_eq!(actions[1]["predicate"].as_str(), Some("event"));
        assert_eq!(actions[1]["count"].as_integer(), Some(2));
        assert_eq!(actions[1]["transfiguration"].as_str(), Some("Kindled"));
        assert_eq!(actions[1]["deck-target"].as_str(), Some("chosen"));

        assert_eq!(
            actions[2]["effect-kind"].as_str(),
            Some("copy-random-cards")
        );
        assert_eq!(actions[2]["predicate"].as_str(), Some("event"));
        assert_eq!(actions[2]["count"].as_integer(), Some(2));
        assert_eq!(
            actions[2]["canonical-mechanic-id"].as_str(),
            Some("duplicate-deck-entry")
        );
        assert_eq!(actions[2]["selection-policy-id"].as_str(), Some("uniform"));

        assert_eq!(
            actions[3]["effect-kind"].as_str(),
            Some("change-random-card-type")
        );
        assert_eq!(actions[3]["count"].as_integer(), Some(2));
        assert_eq!(actions[3]["card-type"].as_str(), Some("Character"));
        assert_eq!(
            actions[3]["canonical-mechanic-id"].as_str(),
            Some("change-entry-card-type")
        );
        assert_eq!(actions[3]["selection-policy-id"].as_str(), Some("uniform"));

        let kinds = lowered["effect-kinds"].as_array().unwrap();
        let change = kinds
            .iter()
            .position(|kind| kind.as_str() == Some("change-subtype-selected"))
            .unwrap();
        assert_eq!(
            kinds[change..change + 4]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "change-subtype-selected",
                "change-card-type-selected",
                "change-random-card-type",
                "change-subtype-all",
            ]
        );
        let copy = kinds
            .iter()
            .position(|kind| kind.as_str() == Some("copy-selected-card"))
            .unwrap();
        assert_eq!(
            kinds[copy..copy + 4]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "copy-selected-card",
                "copy-selected-cards",
                "copy-random-cards",
                "copy-offered-deck-card",
            ]
        );
    }

    #[test]
    fn lowers_wave7_deck_mutations_with_exact_fields_metadata_and_registry_order() {
        let catalog: ExplorationCatalog = ron::from_str(WAVE7_DECK_MUTATION_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(
            actions[0]["effect-kind"].as_str(),
            Some("replace-random-with-card")
        );
        assert_eq!(actions[0]["predicate"].as_str(), Some("legendary"));
        assert_eq!(
            actions[0]["card-id"].as_str(),
            Some("00000000-0000-4000-8000-000000000001")
        );
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("replace-deck-entry")
        );
        assert_eq!(actions[0]["selection-policy-id"].as_str(), Some("uniform"));
        assert!(actions[0].get("count").is_none());
        assert!(actions[0].get("deck-target").is_none());

        for (action, card_type, target) in [
            (&actions[1], "Event", "offered"),
            (&actions[2], "Character", "chosen"),
        ] {
            assert_eq!(
                action["effect-kind"].as_str(),
                Some("change-card-type-selected")
            );
            assert_eq!(action["card-type"].as_str(), Some(card_type));
            assert_eq!(action["deck-target"].as_str(), Some(target));
            assert_eq!(
                action["canonical-mechanic-id"].as_str(),
                Some("change-entry-card-type")
            );
            assert_eq!(
                action["selection-policy-id"].as_str(),
                Some("deck-entry-centrality")
            );
            assert!(action.get("predicate").is_none());
            assert!(action.get("count").is_none());
            assert!(action.get("card-id").is_none());
        }

        let kinds = lowered["effect-kinds"].as_array().unwrap();
        let change = kinds
            .iter()
            .position(|kind| kind.as_str() == Some("change-subtype-selected"))
            .unwrap();
        assert_eq!(
            kinds[change..change + 4]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "change-subtype-selected",
                "change-card-type-selected",
                "change-random-card-type",
                "change-subtype-all",
            ]
        );
        let replacement = kinds
            .iter()
            .position(|kind| kind.as_str() == Some("replace-selected-with-card"))
            .unwrap();
        assert_eq!(
            kinds[replacement..replacement + 3]
                .iter()
                .filter_map(toml::Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "replace-selected-with-card",
                "replace-random-with-card",
                "replace-selected",
            ]
        );
    }

    #[test]
    fn wave7_deck_mutation_source_rejects_missing_and_foreign_fields() {
        for malformed in [
            WAVE7_DECK_MUTATION_SOURCE.replace("          predicate: Legendary,\n", ""),
            WAVE7_DECK_MUTATION_SOURCE.replace(
                "          card_id: \"00000000-0000-4000-8000-000000000001\",\n",
                "",
            ),
            WAVE7_DECK_MUTATION_SOURCE.replace(
                "          predicate: Legendary,",
                "          predicate: Legendary, count: 1,",
            ),
            WAVE7_DECK_MUTATION_SOURCE.replace(
                "ChangeCardTypeSelected(card_type: Event, target: Offered)",
                "ChangeCardTypeSelected(target: Offered)",
            ),
            WAVE7_DECK_MUTATION_SOURCE.replace(
                "ChangeCardTypeSelected(card_type: Event, target: Offered)",
                "ChangeCardTypeSelected(card_type: Event)",
            ),
            WAVE7_DECK_MUTATION_SOURCE.replace(
                "ChangeCardTypeSelected(card_type: Event, target: Offered)",
                "ChangeCardTypeSelected(card_type: Event, target: Offered, predicate: Legendary)",
            ),
        ] {
            assert!(ron::from_str::<ExplorationCatalog>(&malformed).is_err());
        }
    }

    #[test]
    fn deck_mutation_counts_preserve_legacy_omission_and_reject_invalid_contracts() {
        let legacy_source = DECK_MUTATION_SOURCE
            .replace(
                "ReplaceSelected(predicate: Event, count: 2)",
                "ReplaceSelected(predicate: Event)",
            )
            .replace("          count: 2,\n        ),", "        ),");
        let lowered = lower(ron::from_str::<ExplorationCatalog>(&legacy_source).unwrap()).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();
        assert!(actions[0].get("count").is_none());
        assert!(actions[1].get("count").is_none());

        for (from, to) in [
            (
                "ReplaceSelected(predicate: Event, count: 2)",
                "ReplaceSelected(predicate: Event, count: 0)",
            ),
            (
                "CopyRandomCards(predicate: Event, count: 2)",
                "CopyRandomCards(predicate: Event, count: 0)",
            ),
            (
                "ChangeRandomCardType(count: 2, card_type: Character)",
                "ChangeRandomCardType(count: 0, card_type: Character)",
            ),
        ] {
            let malformed: ExplorationCatalog =
                ron::from_str(&DECK_MUTATION_SOURCE.replace(from, to)).unwrap();
            assert!(
                lower(malformed)
                    .unwrap_err()
                    .to_string()
                    .contains("positive count")
            );
        }

        for malformed in [
            DECK_MUTATION_SOURCE.replace("target: Chosen", "target: Offered"),
            DECK_MUTATION_SOURCE.replace(
                "          predicate: Event,\n          transfiguration",
                "          transfiguration",
            ),
        ] {
            let catalog: ExplorationCatalog = ron::from_str(&malformed).unwrap();
            assert!(
                lower(catalog)
                    .unwrap_err()
                    .to_string()
                    .contains("requires a chosen target and predicate")
            );
        }

        assert!(
            ron::from_str::<ExplorationCatalog>(
                &DECK_MUTATION_SOURCE.replace("card_type: Character", "card_type: Warrior")
            )
            .is_err()
        );
    }

    #[test]
    fn starter_card_effects_reject_foreign_fields_and_unsupported_predicates() {
        assert!(
            ron::from_str::<ExplorationCatalog>(&STARTER_CARD_SOURCE.replace(
                "effect: PurgeStarterCard,",
                "effect: PurgeStarterCard(predicate: Character),"
            ))
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(&STARTER_CARD_SOURCE.replace(
                "effect: PurgeRandomStarterCard,",
                "effect: PurgeRandomStarterCard(count: 1),"
            ))
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(&STARTER_CARD_SOURCE.replace(
                "PurgeRandomStarterAndGainCard(predicate: Character)",
                "PurgeRandomStarterAndGainCard(predicate: Any)"
            ))
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(&STARTER_CARD_SOURCE.replace(
                "ReplaceAllStarterCards(predicate: Event)",
                "ReplaceAllStarterCards(predicate: Any)"
            ))
            .is_err()
        );
    }

    #[test]
    fn lowers_bounded_predicate_purges_and_rejects_nonpositive_counts() {
        let catalog: ExplorationCatalog = ron::from_str(PURGE_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let action = &lowered["encounter"][0]["action"][0];

        assert_eq!(action["effect-kind"].as_str(), Some("purge-selected"));
        assert_eq!(action["predicate"].as_str(), Some("warrior"));
        assert_eq!(action["count"].as_integer(), Some(2));
        assert!(action.get("followup-title").is_none());

        let malformed: ExplorationCatalog =
            ron::from_str(&PURGE_SOURCE.replace("count: 2", "count: 0")).unwrap();
        assert!(
            lower(malformed)
                .unwrap_err()
                .to_string()
                .contains("must have a positive count")
        );
    }

    #[test]
    fn lowers_essence_mutations_with_uniform_policy_only_for_random_amounts() {
        let catalog: ExplorationCatalog = ron::from_str(ESSENCE_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(actions[0]["effect-kind"].as_str(), Some("gain-essence"));
        assert_eq!(actions[0]["essence"].as_integer(), Some(100));
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("essence-mutation")
        );
        assert!(actions[0].get("selection-policy-id").is_none());

        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("gain-random-essence")
        );
        assert_eq!(actions[1]["minimum-essence"].as_integer(), Some(50));
        assert_eq!(actions[1]["maximum-essence"].as_integer(), Some(150));
        assert_eq!(actions[1]["selection-policy-id"].as_str(), Some("uniform"));

        assert_eq!(actions[2]["effect-kind"].as_str(), Some("double-essence"));
        assert_eq!(
            actions[2]["canonical-mechanic-id"].as_str(),
            Some("essence-mutation")
        );
        assert!(actions[2].get("selection-policy-id").is_none());
        assert!(actions[2].get("essence").is_none());
    }

    #[test]
    fn validates_positive_fixed_essence_and_positive_ordered_random_bounds() {
        let fixed_zero: ExplorationCatalog =
            ron::from_str(&ESSENCE_SOURCE.replace("essence: 100", "essence: 0")).unwrap();
        assert!(
            lower(fixed_zero)
                .unwrap_err()
                .to_string()
                .contains("must have positive essence")
        );

        let minimum_zero: ExplorationCatalog =
            ron::from_str(&ESSENCE_SOURCE.replace("minimum_essence: 50", "minimum_essence: 0"))
                .unwrap();
        assert!(
            lower(minimum_zero)
                .unwrap_err()
                .to_string()
                .contains("must have positive bounds")
        );

        let maximum_zero: ExplorationCatalog =
            ron::from_str(&ESSENCE_SOURCE.replace("maximum_essence: 150", "maximum_essence: 0"))
                .unwrap();
        assert!(
            lower(maximum_zero)
                .unwrap_err()
                .to_string()
                .contains("must have positive bounds")
        );

        let reversed: ExplorationCatalog =
            ron::from_str(&ESSENCE_SOURCE.replace("minimum_essence: 50", "minimum_essence: 151"))
                .unwrap();
        assert!(
            lower(reversed)
                .unwrap_err()
                .to_string()
                .contains("minimum must not exceed maximum")
        );

        let equal_bounds: ExplorationCatalog =
            ron::from_str(&ESSENCE_SOURCE.replace("maximum_essence: 150", "maximum_essence: 50"))
                .unwrap();
        assert!(lower(equal_bounds).is_ok());

        assert!(
            ron::from_str::<ExplorationCatalog>(&ESSENCE_SOURCE.replace(
                "effect: DoubleEssence,",
                "effect: DoubleEssence(essence: 1),"
            ))
            .is_err()
        );
    }

    #[test]
    fn lowers_explicit_dreamsign_mutations_with_their_selection_policies() {
        let catalog: ExplorationCatalog = ron::from_str(DREAMSIGN_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(
            actions[0]["effect-kind"].as_str(),
            Some("gain-offered-dreamsign")
        );
        assert_eq!(actions[0]["offer-count"].as_integer(), Some(3));
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("gain-dreamsign")
        );
        assert_eq!(
            actions[0]["selection-policy-id"].as_str(),
            Some("dreamsign-match")
        );

        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("replace-selected-dreamsign-with-offered")
        );
        assert_eq!(actions[1]["offer-count"].as_integer(), Some(4));
        assert_eq!(
            actions[1]["selection-policy-id"].as_str(),
            Some("dreamsign-match")
        );

        assert_eq!(
            actions[2]["effect-kind"].as_str(),
            Some("replace-all-dreamsigns-random")
        );
        assert_eq!(actions[2]["selection-policy-id"].as_str(), Some("uniform"));
        assert!(actions[2].get("offer-count").is_none());
        assert!(actions[2].get("count").is_none());

        assert_eq!(
            actions[3]["effect-kind"].as_str(),
            Some("purge-selected-dreamsign-and-gain-random")
        );
        assert_eq!(actions[3]["count"].as_integer(), Some(2));
        assert_eq!(actions[3]["selection-policy-id"].as_str(), Some("uniform"));
    }

    #[test]
    fn rejects_invalid_explicit_dreamsign_mutation_fields() {
        let zero_offer: ExplorationCatalog =
            ron::from_str(&DREAMSIGN_SOURCE.replace("offer_count: 3", "offer_count: 0")).unwrap();
        assert!(
            lower(zero_offer)
                .unwrap_err()
                .to_string()
                .contains("must have a positive offer count")
        );

        let zero_replacement_offer: ExplorationCatalog =
            ron::from_str(&DREAMSIGN_SOURCE.replace("offer_count: 4", "offer_count: 0")).unwrap();
        assert!(
            lower(zero_replacement_offer)
                .unwrap_err()
                .to_string()
                .contains("must have a positive offer count")
        );

        let zero_count: ExplorationCatalog =
            ron::from_str(&DREAMSIGN_SOURCE.replace("count: 2", "count: 0")).unwrap();
        assert!(
            lower(zero_count)
                .unwrap_err()
                .to_string()
                .contains("must have a positive count")
        );

        assert!(
            ron::from_str::<ExplorationCatalog>(&DREAMSIGN_SOURCE.replace(
                "effect: GainOfferedDreamsign(offer_count: 3),",
                "effect: GainOfferedDreamsign(offer_count: 3, count: 1),"
            ))
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(&DREAMSIGN_SOURCE.replace(
                "effect: ReplaceAllDreamsignsRandom,",
                "effect: ReplaceAllDreamsignsRandom(count: 1),"
            ))
            .is_err()
        );
    }

    #[test]
    fn lowers_nightmare_dreamsign_effects_with_exact_metadata_and_fields() {
        let catalog: ExplorationCatalog = ron::from_str(NIGHTMARE_DREAMSIGN_SOURCE).unwrap();
        let lowered = lower(catalog).unwrap();
        let actions = lowered["encounter"][0]["action"].as_array().unwrap();

        assert_eq!(
            actions[0]["effect-kind"].as_str(),
            Some("gain-nightmare-and-dreamsign")
        );
        assert_eq!(
            actions[0]["dreamsign-id"].as_str(),
            Some("00000000-0000-4000-8000-000000000002")
        );
        assert_eq!(actions[0]["nightmare-count"].as_integer(), Some(1));
        assert_eq!(
            actions[0]["canonical-mechanic-id"].as_str(),
            Some("gain-dreamsign")
        );
        assert_eq!(actions[0]["selection-policy-id"].as_str(), Some("fixed"));
        assert!(actions[0].get("offer-count").is_none());

        assert_eq!(
            actions[1]["effect-kind"].as_str(),
            Some("gain-nightmare-and-offered-dreamsign")
        );
        assert_eq!(actions[1]["offer-count"].as_integer(), Some(3));
        assert_eq!(actions[1]["nightmare-count"].as_integer(), Some(2));
        assert_eq!(
            actions[1]["canonical-mechanic-id"].as_str(),
            Some("gain-dreamsign")
        );
        assert_eq!(
            actions[1]["selection-policy-id"].as_str(),
            Some("dreamsign-match")
        );
        assert!(actions[1].get("dreamsign-id").is_none());
    }

    #[test]
    fn rejects_nonpositive_or_foreign_nightmare_dreamsign_fields() {
        for malformed in [
            NIGHTMARE_DREAMSIGN_SOURCE.replace("nightmare_count: 1", "nightmare_count: 0"),
            NIGHTMARE_DREAMSIGN_SOURCE.replace("offer_count: 3", "offer_count: 0"),
            NIGHTMARE_DREAMSIGN_SOURCE.replace("nightmare_count: 2", "nightmare_count: 0"),
        ] {
            let catalog: ExplorationCatalog = ron::from_str(&malformed).unwrap();
            assert!(lower(catalog).is_err());
        }

        assert!(
            ron::from_str::<ExplorationCatalog>(
                &NIGHTMARE_DREAMSIGN_SOURCE
                    .replace("nightmare_count: 1,", "nightmare_count: 1, offer_count: 3,")
            )
            .is_err()
        );
        assert!(
            ron::from_str::<ExplorationCatalog>(&NIGHTMARE_DREAMSIGN_SOURCE.replace(
                "offer_count: 3,",
                "offer_count: 3, dreamsign_id: \"00000000-0000-4000-8000-000000000002\","
            ))
            .is_err()
        );
    }
}

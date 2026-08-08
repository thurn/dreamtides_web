use std::collections::BTreeSet;
use std::fmt;

use anyhow::{Context, Result, ensure};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::atlas::SiteType;

const SITE_TYPES: [SiteType; 14] = [
    SiteType::Battle,
    SiteType::Draft,
    SiteType::Shop,
    SiteType::Purge,
    SiteType::Essence,
    SiteType::Transfiguration,
    SiteType::Duplication,
    SiteType::Reward,
    SiteType::Augury,
    SiteType::DreamsignMarket,
    SiteType::DreamsignRevelation,
    SiteType::RandomSite,
    SiteType::Gamble,
    SiteType::Exploration,
];

const LEGACY_GLOSSARY_ID_MAP: [(&str, &str); 14] = [
    ("site-battle", "6827ba8b-a226-4c01-9a22-1b72a4d7767c"),
    ("site-draft", "1fb39b08-bcb7-4e5d-a831-9ed64f56dd9c"),
    ("site-shop", "4b691029-0cf2-4dbe-a0e2-6f6b112e52c4"),
    ("site-purge", "c617c6de-bd1b-43bb-bf8a-7f7acbb15979"),
    ("site-essence", "ea9cb1b4-853a-4eec-aeb8-9c0215ec7edf"),
    (
        "site-transfiguration",
        "d7587a2f-e72f-41d3-92cd-f14280b87509",
    ),
    ("site-duplication", "3da7fde7-66c7-4af9-ae62-0598ce94050a"),
    ("site-reward", "b9ae4351-e23e-47d4-aec8-03b942dafd54"),
    ("site-augury", "3447ccd7-60c8-4770-8bcd-7f67e7b5bbef"),
    (
        "site-dreamsign-market",
        "49bb5066-5403-4ae0-a911-84a377e7c9ce",
    ),
    (
        "site-dreamsign-revelation",
        "b685e2a2-66ee-49cb-830a-f43c20268470",
    ),
    ("site-random-site", "3fc1d43a-151e-4acc-b3be-44bdb015f9bb"),
    ("site-gamble", "85d54d2c-86d9-495b-8698-59123f3bfe08"),
    ("site-exploration", "fa6c9553-2485-48ef-9fac-1514688c3a34"),
];

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SitesCatalog {
    pub site_types: Vec<SiteMetadata>,
    pub fallback_site_type: FallbackSiteType,
    pub random_site: RandomSiteRules,
    pub card_choices: CardChoiceRules,
    pub gamble: GambleRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SiteMetadata {
    pub site: SiteType,
    pub icon: String,
    pub glossary_id: GlossaryId,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FallbackSiteType {
    pub icon: String,
    pub name: String,
    pub description: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RandomSiteRules {
    pub destinations: Vec<SiteType>,
    pub home_choice_count: u32,
    pub away_choice_count: u32,
    pub insufficient_destinations: InsufficientDestinations,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum InsufficientDestinations {
    Fail,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardChoiceRules {
    pub transfiguration: CardChoiceLimits,
    pub duplication: CardChoiceLimits,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CardChoiceLimits {
    pub standard: ChoiceLimit,
    pub enhanced: ChoiceLimit,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum ChoiceLimit {
    Count(u32),
    All,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GambleRules {
    pub standard_deck_size: u32,
    pub selection: GambleSelection,
    pub three_gate: ThreeGateRules,
    pub ladder_climb: LadderClimbRules,
    pub starway_stairs: StarwayStairsRules,
    pub four_suit_reprise: FourSuitRepriseRules,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GambleSelection {
    pub fallback_game: GambleGame,
    pub games: Vec<WeightedGame>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum RelativeWeight {
    Integer(u32),
    Float(f64),
}

impl RelativeWeight {
    fn is_positive_finite(self) -> bool {
        match self {
            Self::Integer(value) => value > 0,
            Self::Float(value) => value.is_finite() && value > 0.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct WeightedGame {
    pub game: GambleGame,
    pub weight: RelativeWeight,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
pub enum GambleGame {
    GravokThreeGateWager,
    TidemarkLadderClimb,
    StarwayStairs,
    FourSuitReprise,
    Blackjack,
}

impl GambleGame {
    const ALL: [Self; 5] = [
        Self::GravokThreeGateWager,
        Self::TidemarkLadderClimb,
        Self::StarwayStairs,
        Self::FourSuitReprise,
        Self::Blackjack,
    ];

    fn as_compat(self) -> &'static str {
        match self {
            Self::GravokThreeGateWager => "gravok-three-gate-wager",
            Self::TidemarkLadderClimb => "tidemark-ladder-climb",
            Self::StarwayStairs => "starway-stairs",
            Self::FourSuitReprise => "four-suit-reprise",
            Self::Blackjack => "blackjack",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ThreeGateRules {
    pub max_retries: u32,
    pub gates: Vec<GateDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GateDefinition {
    pub gate: Gate,
    pub name: String,
    pub threshold: PlayingCardRank,
    pub winning_card_count: u32,
    pub awards_dreamsign: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Gate {
    Six,
    Nine,
    Jack,
}

impl Gate {
    const ALL: [Self; 3] = [Self::Six, Self::Nine, Self::Jack];

    fn as_compat(self) -> &'static str {
        match self {
            Self::Six => "six",
            Self::Nine => "nine",
            Self::Jack => "jack",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LadderClimbRules {
    pub strong_pool_limit: u32,
    pub attempts: Vec<LadderAttempt>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LadderAttempt {
    pub attempt: Attempt,
    pub threshold: PlayingCardRank,
    pub winning_card_count: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Attempt {
    One,
    Two,
    Three,
    Four,
}

impl Attempt {
    const ALL: [Self; 4] = [Self::One, Self::Two, Self::Three, Self::Four];

    fn number(self) -> u32 {
        match self {
            Self::One => 1,
            Self::Two => 2,
            Self::Three => 3,
            Self::Four => 4,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StarwayStairsRules {
    pub max_retries: u32,
    pub tiers: Vec<StarwayTier>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StarwayTier {
    pub tier: Tier,
    pub highest_bust_rank: PlayingCardRank,
    pub bust_card_count: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Tier {
    One,
    Two,
    Three,
}

impl Tier {
    const ALL: [Self; 3] = [Self::One, Self::Two, Self::Three];

    fn number(self) -> u32 {
        match self {
            Self::One => 1,
            Self::Two => 2,
            Self::Three => 3,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FourSuitRepriseRules {
    pub max_rounds: u32,
    pub matching_suit_card_count: u32,
    pub outcomes: Vec<SuitOutcome>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SuitOutcome {
    pub suit: PlayingCardSuit,
    pub outcome: FourSuitOutcome,
    pub label: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum PlayingCardSuit {
    Spades,
    Diamonds,
    Hearts,
    Clubs,
}

impl PlayingCardSuit {
    const ALL: [Self; 4] = [Self::Spades, Self::Diamonds, Self::Hearts, Self::Clubs];

    fn as_compat(self) -> &'static str {
        match self {
            Self::Spades => "spades",
            Self::Diamonds => "diamonds",
            Self::Hearts => "hearts",
            Self::Clubs => "clubs",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum FourSuitOutcome {
    Transfiguration,
    Essence,
    Duplication,
    Purge,
}

impl FourSuitOutcome {
    const ALL: [Self; 4] = [
        Self::Transfiguration,
        Self::Essence,
        Self::Duplication,
        Self::Purge,
    ];

    fn as_compat(self) -> &'static str {
        match self {
            Self::Transfiguration => "transfiguration",
            Self::Essence => "essence",
            Self::Duplication => "duplication",
            Self::Purge => "purge",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum PlayingCardRank {
    Ace,
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Nine,
    Ten,
    Jack,
    Queen,
    King,
}

impl PlayingCardRank {
    fn as_compat(self) -> &'static str {
        match self {
            Self::Ace => "A",
            Self::Two => "2",
            Self::Three => "3",
            Self::Four => "4",
            Self::Five => "5",
            Self::Six => "6",
            Self::Seven => "7",
            Self::Eight => "8",
            Self::Nine => "9",
            Self::Ten => "10",
            Self::Jack => "J",
            Self::Queen => "Q",
            Self::King => "K",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct GlossaryId(Uuid);

impl GlossaryId {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("glossary identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("glossary identifier must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for GlossaryId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for GlossaryId {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for GlossaryId {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

#[derive(Serialize)]
struct CompatibilityCatalog {
    #[serde(rename = "schema-version")]
    schema_version: u32,
    #[serde(rename = "site-types")]
    site_types: Vec<CompatibilitySiteMetadata>,
    #[serde(rename = "fallback-site-type")]
    fallback_site_type: FallbackSiteType,
    #[serde(rename = "random-site")]
    random_site: CompatibilityRandomSiteRules,
    #[serde(rename = "card-choices")]
    card_choices: CompatibilityCardChoiceRules,
    gamble: CompatibilityGambleRules,
}

#[derive(Serialize)]
struct CompatibilitySiteMetadata {
    #[serde(rename = "type")]
    site_type: &'static str,
    icon: String,
    #[serde(rename = "glossary-id")]
    glossary_id: &'static str,
}

#[derive(Serialize)]
struct CompatibilityRandomSiteRules {
    destinations: Vec<&'static str>,
    #[serde(rename = "home-choice-count")]
    home_choice_count: u32,
    #[serde(rename = "away-choice-count")]
    away_choice_count: u32,
    #[serde(rename = "insufficient-destinations")]
    insufficient_destinations: &'static str,
}

#[derive(Serialize)]
struct CompatibilityCardChoiceRules {
    transfiguration: CompatibilityCardChoiceLimits,
    duplication: CompatibilityCardChoiceLimits,
}

#[derive(Serialize)]
struct CompatibilityCardChoiceLimits {
    #[serde(rename = "standard-limit")]
    standard_limit: CompatibilityChoiceLimit,
    #[serde(rename = "enhanced-limit")]
    enhanced_limit: CompatibilityChoiceLimit,
}

#[derive(Serialize)]
#[serde(untagged)]
enum CompatibilityChoiceLimit {
    Count(u32),
    All(&'static str),
}

#[derive(Serialize)]
struct CompatibilityGambleRules {
    selection: CompatibilityGambleSelection,
    #[serde(rename = "three-gate")]
    three_gate: CompatibilityThreeGateRules,
    #[serde(rename = "ladder-climb")]
    ladder_climb: CompatibilityLadderClimbRules,
    #[serde(rename = "starway-stairs")]
    starway_stairs: CompatibilityStarwayStairsRules,
    #[serde(rename = "four-suit-reprise")]
    four_suit_reprise: CompatibilityFourSuitRepriseRules,
}

#[derive(Serialize)]
struct CompatibilityGambleSelection {
    #[serde(rename = "fallback-game")]
    fallback_game: &'static str,
    games: Vec<CompatibilityWeightedGame>,
}

#[derive(Serialize)]
struct CompatibilityWeightedGame {
    id: &'static str,
    weight: RelativeWeight,
}

#[derive(Serialize)]
struct CompatibilityThreeGateRules {
    #[serde(rename = "max-retries")]
    max_retries: u32,
    gates: Vec<CompatibilityGateDefinition>,
}

#[derive(Serialize)]
struct CompatibilityGateDefinition {
    id: &'static str,
    name: String,
    threshold: &'static str,
    #[serde(rename = "odds-numerator")]
    odds_numerator: u32,
    #[serde(rename = "odds-denominator")]
    odds_denominator: u32,
    #[serde(rename = "awards-dreamsign")]
    awards_dreamsign: bool,
}

#[derive(Serialize)]
struct CompatibilityLadderClimbRules {
    #[serde(rename = "strong-pool-limit")]
    strong_pool_limit: u32,
    attempts: Vec<CompatibilityLadderAttempt>,
}

#[derive(Serialize)]
struct CompatibilityLadderAttempt {
    attempt: u32,
    threshold: &'static str,
    #[serde(rename = "odds-numerator")]
    odds_numerator: u32,
    #[serde(rename = "odds-denominator")]
    odds_denominator: u32,
}

#[derive(Serialize)]
struct CompatibilityStarwayStairsRules {
    #[serde(rename = "max-retries")]
    max_retries: u32,
    tiers: Vec<CompatibilityStarwayTier>,
}

#[derive(Serialize)]
struct CompatibilityStarwayTier {
    tier: u32,
    #[serde(rename = "highest-bust-rank")]
    highest_bust_rank: &'static str,
    #[serde(rename = "bust-odds-numerator")]
    bust_odds_numerator: u32,
    #[serde(rename = "odds-denominator")]
    odds_denominator: u32,
}

#[derive(Serialize)]
struct CompatibilityFourSuitRepriseRules {
    #[serde(rename = "max-rounds")]
    max_rounds: u32,
    #[serde(rename = "odds-numerator")]
    odds_numerator: u32,
    #[serde(rename = "odds-denominator")]
    odds_denominator: u32,
    outcomes: Vec<CompatibilitySuitOutcome>,
}

#[derive(Serialize)]
struct CompatibilitySuitOutcome {
    suit: &'static str,
    outcome: &'static str,
    label: String,
}

pub fn lower(source: SitesCatalog) -> Result<toml::Value> {
    lower_with_glossary_map(source, &LEGACY_GLOSSARY_ID_MAP)
}

fn lower_with_glossary_map(
    source: SitesCatalog,
    glossary_ids: &[(&'static str, &'static str)],
) -> Result<toml::Value> {
    validate(&source)?;
    let deck_size = source.gamble.standard_deck_size;
    let site_types = source
        .site_types
        .into_iter()
        .map(|metadata| {
            Ok(CompatibilitySiteMetadata {
                site_type: metadata.site.as_compat(),
                icon: metadata.icon,
                glossary_id: compatibility_glossary_id(glossary_ids, metadata.glossary_id)?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let random_site = CompatibilityRandomSiteRules {
        destinations: source
            .random_site
            .destinations
            .into_iter()
            .map(SiteType::as_compat)
            .collect(),
        home_choice_count: source.random_site.home_choice_count,
        away_choice_count: source.random_site.away_choice_count,
        insufficient_destinations: match source.random_site.insufficient_destinations {
            InsufficientDestinations::Fail => "fail",
        },
    };
    let card_choices = CompatibilityCardChoiceRules {
        transfiguration: lower_choice_limits(source.card_choices.transfiguration),
        duplication: lower_choice_limits(source.card_choices.duplication),
    };
    let gamble = source.gamble;
    let selection = CompatibilityGambleSelection {
        fallback_game: gamble.selection.fallback_game.as_compat(),
        games: gamble
            .selection
            .games
            .into_iter()
            .map(|game| CompatibilityWeightedGame {
                id: game.game.as_compat(),
                weight: game.weight,
            })
            .collect(),
    };
    let three_gate = CompatibilityThreeGateRules {
        max_retries: gamble.three_gate.max_retries,
        gates: gamble
            .three_gate
            .gates
            .into_iter()
            .map(|gate| CompatibilityGateDefinition {
                id: gate.gate.as_compat(),
                name: gate.name,
                threshold: gate.threshold.as_compat(),
                odds_numerator: gate.winning_card_count,
                odds_denominator: deck_size,
                awards_dreamsign: gate.awards_dreamsign,
            })
            .collect(),
    };
    let ladder_climb = CompatibilityLadderClimbRules {
        strong_pool_limit: gamble.ladder_climb.strong_pool_limit,
        attempts: gamble
            .ladder_climb
            .attempts
            .into_iter()
            .map(|attempt| CompatibilityLadderAttempt {
                attempt: attempt.attempt.number(),
                threshold: attempt.threshold.as_compat(),
                odds_numerator: attempt.winning_card_count,
                odds_denominator: deck_size,
            })
            .collect(),
    };
    let starway_stairs = CompatibilityStarwayStairsRules {
        max_retries: gamble.starway_stairs.max_retries,
        tiers: gamble
            .starway_stairs
            .tiers
            .into_iter()
            .map(|tier| CompatibilityStarwayTier {
                tier: tier.tier.number(),
                highest_bust_rank: tier.highest_bust_rank.as_compat(),
                bust_odds_numerator: tier.bust_card_count,
                odds_denominator: deck_size,
            })
            .collect(),
    };
    let four_suit_reprise = CompatibilityFourSuitRepriseRules {
        max_rounds: gamble.four_suit_reprise.max_rounds,
        odds_numerator: gamble.four_suit_reprise.matching_suit_card_count,
        odds_denominator: deck_size,
        outcomes: gamble
            .four_suit_reprise
            .outcomes
            .into_iter()
            .map(|outcome| CompatibilitySuitOutcome {
                suit: outcome.suit.as_compat(),
                outcome: outcome.outcome.as_compat(),
                label: outcome.label,
            })
            .collect(),
    };
    Ok(toml::Value::try_from(CompatibilityCatalog {
        schema_version: 1,
        site_types,
        fallback_site_type: source.fallback_site_type,
        random_site,
        card_choices,
        gamble: CompatibilityGambleRules {
            selection,
            three_gate,
            ladder_climb,
            starway_stairs,
            four_suit_reprise,
        },
    })?)
}

fn lower_choice_limits(source: CardChoiceLimits) -> CompatibilityCardChoiceLimits {
    CompatibilityCardChoiceLimits {
        standard_limit: lower_choice_limit(source.standard),
        enhanced_limit: lower_choice_limit(source.enhanced),
    }
}

fn lower_choice_limit(source: ChoiceLimit) -> CompatibilityChoiceLimit {
    match source {
        ChoiceLimit::Count(value) => CompatibilityChoiceLimit::Count(value),
        ChoiceLimit::All => CompatibilityChoiceLimit::All("all"),
    }
}

fn compatibility_glossary_id(
    mapping: &[(&'static str, &'static str)],
    id: GlossaryId,
) -> Result<&'static str> {
    let canonical = id.to_string();
    mapping
        .iter()
        .find_map(|(legacy, mapped)| (*mapped == canonical).then_some(*legacy))
        .with_context(|| format!("unmapped canonical glossary identifier {id}"))
}

fn validate(source: &SitesCatalog) -> Result<()> {
    let mut sites = BTreeSet::new();
    let mut glossary_ids = BTreeSet::new();
    for metadata in &source.site_types {
        ensure!(
            sites.insert(metadata.site.as_compat()),
            "duplicate site metadata for {}",
            metadata.site.as_compat()
        );
        ensure!(
            glossary_ids.insert(metadata.glossary_id),
            "site metadata repeats glossary identifier {}",
            metadata.glossary_id
        );
        validate_text("site metadata icon", &metadata.icon)?;
    }
    ensure!(
        sites == SITE_TYPES.map(SiteType::as_compat).into_iter().collect(),
        "site metadata must cover every site type exactly once"
    );
    validate_text("fallback site icon", &source.fallback_site_type.icon)?;
    validate_text("fallback site name", &source.fallback_site_type.name)?;
    validate_text(
        "fallback site description",
        &source.fallback_site_type.description,
    )?;

    let allowed_destinations = BTreeSet::from([
        "Shop",
        "Purge",
        "Transfiguration",
        "Duplication",
        "Augury",
        "DreamsignMarket",
        "DreamsignRevelation",
        "Gamble",
        "Exploration",
    ]);
    let mut destinations = BTreeSet::new();
    for destination in &source.random_site.destinations {
        let name = destination.as_compat();
        ensure!(
            allowed_destinations.contains(name),
            "Random Site destination {name} cannot be materialized"
        );
        ensure!(
            destinations.insert(name),
            "duplicate Random Site destination {name}"
        );
    }
    ensure!(
        source.random_site.home_choice_count == 3,
        "Random Site home choice count must be 3"
    );
    ensure!(
        source.random_site.away_choice_count == 1,
        "Random Site away choice count must be 1"
    );
    ensure!(
        source.random_site.home_choice_count as usize <= destinations.len(),
        "Random Site home choice count exceeds its destinations"
    );
    validate_choice_limits(&source.card_choices.transfiguration)?;
    validate_choice_limits(&source.card_choices.duplication)?;

    let gamble = &source.gamble;
    ensure!(
        gamble.standard_deck_size > 0,
        "standard deck size must be positive"
    );
    ensure!(
        matches!(
            gamble.selection.fallback_game,
            GambleGame::GravokThreeGateWager | GambleGame::StarwayStairs
        ),
        "fallback Gamble game must be available without deck or Dreamsign candidates"
    );
    let observed_games: Vec<_> = gamble
        .selection
        .games
        .iter()
        .map(|game| game.game)
        .collect();
    ensure!(
        observed_games == GambleGame::ALL,
        "Gamble selection must cover every game in structural order"
    );
    for game in &gamble.selection.games {
        ensure!(
            game.weight.is_positive_finite(),
            "Gamble weights must be positive and finite"
        );
    }
    let observed_gates: Vec<_> = gamble
        .three_gate
        .gates
        .iter()
        .map(|gate| gate.gate)
        .collect();
    ensure!(
        observed_gates == Gate::ALL,
        "Three Gate definitions must be in structural order"
    );
    for gate in &gamble.three_gate.gates {
        validate_text("Three Gate name", &gate.name)?;
        validate_card_count(
            "Three Gate winning card count",
            gate.winning_card_count,
            gamble.standard_deck_size,
        )?;
    }
    ensure!(
        gamble.ladder_climb.strong_pool_limit > 0,
        "Ladder Climb strong pool limit must be positive"
    );
    let observed_attempts: Vec<_> = gamble
        .ladder_climb
        .attempts
        .iter()
        .map(|attempt| attempt.attempt)
        .collect();
    ensure!(
        observed_attempts == Attempt::ALL,
        "Ladder Climb attempts must be in structural order"
    );
    for attempt in &gamble.ladder_climb.attempts {
        validate_card_count(
            "Ladder Climb winning card count",
            attempt.winning_card_count,
            gamble.standard_deck_size,
        )?;
    }
    let observed_tiers: Vec<_> = gamble
        .starway_stairs
        .tiers
        .iter()
        .map(|tier| tier.tier)
        .collect();
    ensure!(
        observed_tiers == Tier::ALL,
        "Starway Stairs tiers must be in structural order"
    );
    for tier in &gamble.starway_stairs.tiers {
        validate_card_count(
            "Starway Stairs bust card count",
            tier.bust_card_count,
            gamble.standard_deck_size,
        )?;
    }
    ensure!(
        (1..=3).contains(&gamble.four_suit_reprise.max_rounds),
        "Four Suit Reprise max rounds must be between 1 and 3"
    );
    validate_card_count(
        "Four Suit Reprise matching suit card count",
        gamble.four_suit_reprise.matching_suit_card_count,
        gamble.standard_deck_size,
    )?;
    let observed_outcomes: Vec<_> = gamble
        .four_suit_reprise
        .outcomes
        .iter()
        .map(|outcome| (outcome.suit, outcome.outcome))
        .collect();
    let expected_outcomes: Vec<_> = PlayingCardSuit::ALL
        .into_iter()
        .zip(FourSuitOutcome::ALL)
        .collect();
    ensure!(
        observed_outcomes == expected_outcomes,
        "Four Suit Reprise outcomes must match every suit in structural order"
    );
    for outcome in &gamble.four_suit_reprise.outcomes {
        validate_text("Four Suit Reprise outcome label", &outcome.label)?;
    }
    Ok(())
}

fn validate_choice_limits(limits: &CardChoiceLimits) -> Result<()> {
    for limit in [limits.standard, limits.enhanced] {
        if let ChoiceLimit::Count(value) = limit {
            ensure!(value > 0, "card choice count must be positive");
        }
    }
    Ok(())
}

fn validate_card_count(label: &str, count: u32, deck_size: u32) -> Result<()> {
    ensure!(
        count <= deck_size,
        "{label} cannot exceed the standard deck size"
    );
    Ok(())
}

fn validate_text(label: &str, value: &str) -> Result<()> {
    ensure!(!value.trim().is_empty(), "{label} must be non-empty");
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use pretty_assertions::assert_eq;

    use super::*;
    use crate::models::compat::CompatDocument;

    const SYNTHETIC_GLOSSARY_ID_MAP: [(&str, &str); 14] = [
        ("glossary-battle", "00000000-0000-4000-8000-000000000001"),
        ("glossary-draft", "00000000-0000-4000-8000-000000000002"),
        ("glossary-shop", "00000000-0000-4000-8000-000000000003"),
        ("glossary-purge", "00000000-0000-4000-8000-000000000004"),
        ("glossary-essence", "00000000-0000-4000-8000-000000000005"),
        (
            "glossary-transfiguration",
            "00000000-0000-4000-8000-000000000006",
        ),
        (
            "glossary-duplication",
            "00000000-0000-4000-8000-000000000007",
        ),
        ("glossary-reward", "00000000-0000-4000-8000-000000000008"),
        ("glossary-augury", "00000000-0000-4000-8000-000000000009"),
        (
            "glossary-dreamsign-market",
            "00000000-0000-4000-8000-000000000010",
        ),
        (
            "glossary-dreamsign-revelation",
            "00000000-0000-4000-8000-000000000011",
        ),
        (
            "glossary-random-site",
            "00000000-0000-4000-8000-000000000012",
        ),
        ("glossary-gamble", "00000000-0000-4000-8000-000000000013"),
        (
            "glossary-exploration",
            "00000000-0000-4000-8000-000000000014",
        ),
    ];

    fn synthetic_catalog() -> SitesCatalog {
        let site_types = SITE_TYPES
            .into_iter()
            .zip(SYNTHETIC_GLOSSARY_ID_MAP)
            .map(|(site, (_legacy, canonical))| SiteMetadata {
                site,
                icon: format!("icon-{}", site.as_compat()),
                glossary_id: GlossaryId::parse(canonical).unwrap(),
            })
            .collect();
        SitesCatalog {
            site_types,
            fallback_site_type: FallbackSiteType {
                icon: "fallback-icon".into(),
                name: "Unknöwn Site".into(),
                description: "First line\nsecond line".into(),
            },
            random_site: RandomSiteRules {
                destinations: vec![
                    SiteType::Shop,
                    SiteType::Purge,
                    SiteType::Transfiguration,
                    SiteType::Duplication,
                    SiteType::Augury,
                    SiteType::DreamsignMarket,
                    SiteType::DreamsignRevelation,
                    SiteType::Gamble,
                    SiteType::Exploration,
                ],
                home_choice_count: 3,
                away_choice_count: 1,
                insufficient_destinations: InsufficientDestinations::Fail,
            },
            card_choices: CardChoiceRules {
                transfiguration: CardChoiceLimits {
                    standard: ChoiceLimit::Count(2),
                    enhanced: ChoiceLimit::All,
                },
                duplication: CardChoiceLimits {
                    standard: ChoiceLimit::Count(4),
                    enhanced: ChoiceLimit::Count(7),
                },
            },
            gamble: GambleRules {
                standard_deck_size: 99,
                selection: GambleSelection {
                    fallback_game: GambleGame::StarwayStairs,
                    games: GambleGame::ALL
                        .into_iter()
                        .enumerate()
                        .map(|(index, game)| WeightedGame {
                            game,
                            weight: if index == 1 {
                                RelativeWeight::Float(1.5)
                            } else {
                                RelativeWeight::Integer(index as u32 + 1)
                            },
                        })
                        .collect(),
                },
                three_gate: ThreeGateRules {
                    max_retries: 5,
                    gates: vec![
                        GateDefinition {
                            gate: Gate::Six,
                            name: "Six".into(),
                            threshold: PlayingCardRank::Ace,
                            winning_card_count: 11,
                            awards_dreamsign: false,
                        },
                        GateDefinition {
                            gate: Gate::Nine,
                            name: "Nine".into(),
                            threshold: PlayingCardRank::Nine,
                            winning_card_count: 22,
                            awards_dreamsign: false,
                        },
                        GateDefinition {
                            gate: Gate::Jack,
                            name: "Jack".into(),
                            threshold: PlayingCardRank::King,
                            winning_card_count: 33,
                            awards_dreamsign: true,
                        },
                    ],
                },
                ladder_climb: LadderClimbRules {
                    strong_pool_limit: 77,
                    attempts: Attempt::ALL
                        .into_iter()
                        .enumerate()
                        .map(|(index, attempt)| LadderAttempt {
                            attempt,
                            threshold: [
                                PlayingCardRank::Queen,
                                PlayingCardRank::Ten,
                                PlayingCardRank::Eight,
                                PlayingCardRank::Six,
                            ][index],
                            winning_card_count: 10 + index as u32,
                        })
                        .collect(),
                },
                starway_stairs: StarwayStairsRules {
                    max_retries: 6,
                    tiers: Tier::ALL
                        .into_iter()
                        .enumerate()
                        .map(|(index, tier)| StarwayTier {
                            tier,
                            highest_bust_rank: [
                                PlayingCardRank::Two,
                                PlayingCardRank::Four,
                                PlayingCardRank::Seven,
                            ][index],
                            bust_card_count: 20 + index as u32,
                        })
                        .collect(),
                },
                four_suit_reprise: FourSuitRepriseRules {
                    max_rounds: 2,
                    matching_suit_card_count: 25,
                    outcomes: PlayingCardSuit::ALL
                        .into_iter()
                        .zip(FourSuitOutcome::ALL)
                        .enumerate()
                        .map(|(index, (suit, outcome))| SuitOutcome {
                            suit,
                            outcome,
                            label: format!("Outcome {index}"),
                        })
                        .collect(),
                },
            },
        }
    }

    #[test]
    fn lowers_every_structural_variant_ordered_keys_and_compatibility_sentinel() {
        let lowered =
            lower_with_glossary_map(synthetic_catalog(), &SYNTHETIC_GLOSSARY_ID_MAP).unwrap();

        assert_eq!(lowered["schema-version"].as_integer(), Some(1));
        let site_types = lowered["site-types"].as_array().unwrap();
        assert_eq!(site_types.len(), 14);
        assert_eq!(site_types[0]["type"].as_str(), Some("Battle"));
        assert_eq!(site_types[13]["type"].as_str(), Some("Exploration"));
        assert_eq!(
            site_types[0]["glossary-id"].as_str(),
            Some("glossary-battle")
        );
        assert_eq!(
            lowered["fallback-site-type"]["name"].as_str(),
            Some("Unknöwn Site")
        );
        assert_eq!(
            lowered["fallback-site-type"]["description"].as_str(),
            Some("First line\nsecond line")
        );
        assert_eq!(
            lowered["card-choices"]["transfiguration"]["enhanced-limit"].as_str(),
            Some("all")
        );
        assert_eq!(
            lowered["card-choices"]["duplication"]["enhanced-limit"].as_integer(),
            Some(7)
        );
        let games = lowered["gamble"]["selection"]["games"].as_array().unwrap();
        assert_eq!(games[0]["id"].as_str(), Some("gravok-three-gate-wager"));
        assert_eq!(games[1]["weight"].as_float(), Some(1.5));
        assert_eq!(games[2]["weight"].as_integer(), Some(3));
        assert_eq!(
            lowered["gamble"]["three-gate"]["gates"][0]["id"].as_str(),
            Some("six")
        );
        assert_eq!(
            lowered["gamble"]["ladder-climb"]["attempts"][3]["attempt"].as_integer(),
            Some(4)
        );
        assert_eq!(
            lowered["gamble"]["starway-stairs"]["tiers"][2]["tier"].as_integer(),
            Some(3)
        );
        assert_eq!(
            lowered["gamble"]["four-suit-reprise"]["outcomes"][3]["suit"].as_str(),
            Some("clubs")
        );
    }

    #[test]
    fn expands_the_authored_deck_size_into_every_compatibility_denominator() {
        let lowered =
            lower_with_glossary_map(synthetic_catalog(), &SYNTHETIC_GLOSSARY_ID_MAP).unwrap();
        for gate in lowered["gamble"]["three-gate"]["gates"].as_array().unwrap() {
            assert_eq!(gate["odds-denominator"].as_integer(), Some(99));
        }
        for attempt in lowered["gamble"]["ladder-climb"]["attempts"]
            .as_array()
            .unwrap()
        {
            assert_eq!(attempt["odds-denominator"].as_integer(), Some(99));
        }
        for tier in lowered["gamble"]["starway-stairs"]["tiers"]
            .as_array()
            .unwrap()
        {
            assert_eq!(tier["odds-denominator"].as_integer(), Some(99));
        }
        assert_eq!(
            lowered["gamble"]["four-suit-reprise"]["odds-denominator"].as_integer(),
            Some(99)
        );
    }

    #[test]
    fn lowers_every_playing_card_rank_exactly() {
        let ranks = [
            PlayingCardRank::Ace,
            PlayingCardRank::Two,
            PlayingCardRank::Three,
            PlayingCardRank::Four,
            PlayingCardRank::Five,
            PlayingCardRank::Six,
            PlayingCardRank::Seven,
            PlayingCardRank::Eight,
            PlayingCardRank::Nine,
            PlayingCardRank::Ten,
            PlayingCardRank::Jack,
            PlayingCardRank::Queen,
            PlayingCardRank::King,
        ]
        .map(PlayingCardRank::as_compat);
        assert_eq!(
            ranks,
            [
                "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"
            ]
        );
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_glossary_identifiers() {
        let serialized = ron::to_string(&synthetic_catalog()).unwrap();
        let unknown = serialized.replacen("(site_types:", "(surprise:true,site_types:", 1);
        assert!(ron::from_str::<SitesCatalog>(&unknown).is_err());
        let nested_unknown = serialized.replacen("(site:", "(surprise:true,site:", 1);
        assert!(ron::from_str::<SitesCatalog>(&nested_unknown).is_err());

        for invalid in [
            "legacy_slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-c000-000000000001",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        ] {
            assert!(ron::from_str::<GlossaryId>(&format!("\"{invalid}\"")).is_err());
        }
    }

    #[test]
    fn rejects_identity_reference_and_cross_field_invariant_violations() {
        let mut duplicate_site = synthetic_catalog();
        duplicate_site.site_types[1].site = duplicate_site.site_types[0].site;
        assert_error_contains(duplicate_site, "duplicate site metadata");

        let mut duplicate_glossary = synthetic_catalog();
        duplicate_glossary.site_types[1].glossary_id = duplicate_glossary.site_types[0].glossary_id;
        assert_error_contains(duplicate_glossary, "repeats glossary identifier");

        let mut duplicate_destination = synthetic_catalog();
        duplicate_destination.random_site.destinations[1] = SiteType::Shop;
        assert_error_contains(duplicate_destination, "duplicate Random Site destination");

        let mut invalid_choice_count = synthetic_catalog();
        invalid_choice_count.card_choices.transfiguration.standard = ChoiceLimit::Count(0);
        assert_error_contains(invalid_choice_count, "card choice count must be positive");

        let mut invalid_weight = synthetic_catalog();
        invalid_weight.gamble.selection.games[0].weight = RelativeWeight::Float(f64::NAN);
        assert_error_contains(invalid_weight, "weights must be positive and finite");

        let mut reordered_games = synthetic_catalog();
        reordered_games.gamble.selection.games.swap(0, 1);
        assert_error_contains(reordered_games, "structural order");

        let mut excessive_probability = synthetic_catalog();
        excessive_probability.gamble.three_gate.gates[0].winning_card_count = 100;
        assert_error_contains(
            excessive_probability,
            "cannot exceed the standard deck size",
        );

        let mut invalid_rounds = synthetic_catalog();
        invalid_rounds.gamble.four_suit_reprise.max_rounds = 4;
        assert_error_contains(invalid_rounds, "max rounds must be between 1 and 3");

        let mut mismatched_outcome = synthetic_catalog();
        mismatched_outcome.gamble.four_suit_reprise.outcomes[0].outcome = FourSuitOutcome::Purge;
        assert_error_contains(mismatched_outcome, "match every suit in structural order");

        let mut unmapped = synthetic_catalog();
        unmapped.site_types[0].glossary_id =
            GlossaryId::parse("00000000-0000-4000-8000-000000000099").unwrap();
        assert!(
            lower_with_glossary_map(unmapped, &SYNTHETIC_GLOSSARY_ID_MAP)
                .unwrap_err()
                .to_string()
                .contains("unmapped canonical glossary identifier")
        );
    }

    fn assert_error_contains(source: SitesCatalog, expected: &str) {
        assert!(
            lower_with_glossary_map(source, &SYNTHETIC_GLOSSARY_ID_MAP)
                .unwrap_err()
                .to_string()
                .contains(expected),
            "error did not contain {expected}"
        );
    }

    #[test]
    #[ignore = "real-catalog parity probe retained for canonical Sites review"]
    fn canonical_candidate_matches_current_compatibility_sources() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let current_ron: CompatDocument =
            ron::from_str(&fs::read_to_string(root.join("data/sites.ron")).unwrap()).unwrap();
        let current_toml: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/sites.toml")).unwrap()).unwrap();
        assert_eq!(current_ron.data, current_toml);

        let canonical: SitesCatalog =
            ron::from_str(&fs::read_to_string(root.join("data/sites_canonical.ron")).unwrap())
                .unwrap();
        assert_eq!(lower(canonical.clone()).unwrap(), current_ron.data);

        let canonical_ids: BTreeSet<_> = canonical
            .site_types
            .iter()
            .map(|metadata| metadata.glossary_id.to_string())
            .collect();
        let mapped_ids: BTreeSet<_> = LEGACY_GLOSSARY_ID_MAP
            .iter()
            .map(|(_legacy, canonical)| (*canonical).to_owned())
            .collect();
        assert_eq!(canonical_ids.len(), canonical.site_types.len());
        assert_eq!(canonical_ids, mapped_ids);
        for id in canonical_ids {
            let parsed = Uuid::parse_str(&id).unwrap();
            assert_eq!(parsed.get_version(), Some(Version::Random));
            assert_eq!(parsed.get_variant(), Variant::RFC4122);
            assert_eq!(parsed.hyphenated().to_string(), id);
        }

        let compatibility_glossary_ids: BTreeSet<_> = current_toml["site-types"]
            .as_array()
            .unwrap()
            .iter()
            .map(|metadata| metadata["glossary-id"].as_str().unwrap().to_owned())
            .collect();
        let mapped_legacy_ids: BTreeSet<_> = LEGACY_GLOSSARY_ID_MAP
            .iter()
            .map(|(legacy, _canonical)| (*legacy).to_owned())
            .collect();
        assert_eq!(compatibility_glossary_ids, mapped_legacy_ids);

        let glossary: CompatDocument =
            ron::from_str(&fs::read_to_string(root.join("data/glossary.ron")).unwrap()).unwrap();
        let glossary_ids: BTreeSet<_> = glossary.data["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["id"].as_str().unwrap().to_owned())
            .collect();
        assert!(mapped_legacy_ids.is_subset(&glossary_ids));

        assert_eq!(
            canonical
                .site_types
                .iter()
                .map(|metadata| metadata.site.as_compat())
                .collect::<Vec<_>>(),
            SITE_TYPES.map(SiteType::as_compat)
        );
        assert_eq!(
            canonical
                .gamble
                .selection
                .games
                .iter()
                .map(|game| game.game)
                .collect::<Vec<_>>(),
            GambleGame::ALL
        );
        assert_eq!(
            canonical
                .gamble
                .three_gate
                .gates
                .iter()
                .map(|gate| gate.gate)
                .collect::<Vec<_>>(),
            Gate::ALL
        );
        assert_eq!(
            canonical
                .gamble
                .ladder_climb
                .attempts
                .iter()
                .map(|attempt| attempt.attempt)
                .collect::<Vec<_>>(),
            Attempt::ALL
        );
        assert_eq!(
            canonical
                .gamble
                .starway_stairs
                .tiers
                .iter()
                .map(|tier| tier.tier)
                .collect::<Vec<_>>(),
            Tier::ALL
        );
        assert_eq!(
            canonical
                .gamble
                .four_suit_reprise
                .outcomes
                .iter()
                .map(|outcome| (outcome.suit, outcome.outcome))
                .collect::<Vec<_>>(),
            PlayingCardSuit::ALL
                .into_iter()
                .zip(FourSuitOutcome::ALL)
                .collect::<Vec<_>>()
        );
    }
}

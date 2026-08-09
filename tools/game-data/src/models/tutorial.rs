use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use anyhow::{Context, Result, ensure};
use indexmap::IndexMap;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialCatalog {
    pub journey_guidance: JourneyGuidance,
    pub battle: BattleConfiguration,
    pub actions: Vec<ActionDefinition>,
    pub triggers: Vec<TriggerDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct JourneyGuidance {
    pub journey_start: PersistentSpeechBubble,
    pub dreamscape: PersistentSpeechBubble,
    pub atlas: PersistentSpeechBubble,
    pub draft: PersistentSpeechBubble,
    pub purge: PersistentSpeechBubble,
    pub dreamsign_revelation: PersistentSpeechBubble,
    pub first_battle: PersistentSpeechBubble,
    pub second_battle: PersistentSpeechBubble,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PersistentSpeechBubble {
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub delay_seconds: Scalar,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub horizontal_offset_pixels: Scalar,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub vertical_offset_pixels: Scalar,
    pub maximum_width_pixels: u32,
    pub text: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SpeechBubble {
    #[serde(default, skip_serializing_if = "is_mira")]
    pub speaker: Speaker,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub delay_seconds: Scalar,
    pub duration_seconds: Scalar,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub horizontal_offset_pixels: Scalar,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub vertical_offset_pixels: Scalar,
    pub maximum_width_pixels: u32,
    pub text: String,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum Speaker {
    #[default]
    Mira,
    Player,
    Enemy,
}

fn is_mira(value: &Speaker) -> bool {
    *value == Speaker::Mira
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum Scalar {
    Integer(i64),
    Float(f64),
}

impl Default for Scalar {
    fn default() -> Self {
        Self::Integer(0)
    }
}

impl Scalar {
    fn as_f64(self) -> f64 {
        match self {
            Self::Integer(value) => value as f64,
            Self::Float(value) => value,
        }
    }

    fn is_zero(value: &Self) -> bool {
        value.as_f64() == 0.0
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct EntityId(Uuid);

impl EntityId {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("identifier must use lowercase hyphenated UUID formatting".into());
        }
        Ok(Self(uuid))
    }
}

impl fmt::Display for EntityId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.hyphenated().fmt(formatter)
    }
}

impl Serialize for EntityId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for EntityId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).map_err(D::Error::custom)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BattleConfiguration {
    pub player_dream_avatar_id: EntityId,
    pub enemy_dream_avatar_id: EntityId,
    pub starting_energy: u32,
    pub score_to_win: u32,
    pub starter_deck: Vec<StarterDeckEntry>,
    pub player_draws: Vec<EntityId>,
    pub enemy_draws: Vec<EntityId>,
    /// Complete shared Dreamwell prefix, including pre-handoff scripted draws.
    pub dreamwell_draws: Vec<EntityId>,
    pub featured_cards: FeaturedCards,
    pub scripted_board: ScriptedBoard,
    pub handoff: BattleHandoff,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ai_action_overrides: Vec<AiActionOverride>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StarterDeckEntry {
    pub card_id: EntityId,
    pub copies: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FeaturedCards {
    pub player_card_id: EntityId,
    pub opponent_card_id: EntityId,
    pub enemy_starter_card_id: EntityId,
    pub loading_event_card_id: EntityId,
    pub dreamwell_card_id: EntityId,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ScriptedBoard {
    pub player_back_rank_index: u32,
    pub player_front_rank_index: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BattleHandoff {
    pub active_side: Side,
    pub turn_number: u32,
    pub phase: BattlePhase,
    pub dreamwell_deck_index: u32,
    pub player: HandoffSide,
    pub enemy: HandoffSide,
    pub placements: Vec<HandoffPlacement>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct HandoffSide {
    pub current_energy: u32,
    pub maximum_energy: u32,
    pub score: u32,
    pub dreamwell_card_index: u32,
    pub dreamwell_drawn_turn: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum HandoffPlacement {
    Rank {
        card: FeaturedCardRole,
        side: Side,
        source: PlacementSource,
        rank: Rank,
        slot_id: String,
    },
    Void {
        card: FeaturedCardRole,
        side: Side,
        source: PlacementSource,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum FeaturedCardRole {
    Player,
    Opponent,
    EnemyStarter,
    LoadingEvent,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Side {
    Player,
    Enemy,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum PlacementSource {
    Deck,
    Created,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum Rank {
    Front,
    Back,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum BattlePhase {
    Dreamwell,
    Draw,
    Dawn,
    Day,
    Dusk,
    Night,
    Challenge,
    Ending,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AiActionOverride {
    pub id: EntityId,
    pub trigger: AiTrigger,
    pub action: AiAction,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum AiTrigger {
    AfterEnemyDreamwell { card_id: EntityId },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum AiAction {
    PlayCard { card_id: EntityId },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ActionDefinition {
    pub id: EntityId,
    pub wait_seconds: Scalar,
    pub behavior: TutorialAction,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum TutorialAction {
    DisplaySpeechBubble {
        speech_bubble: SpeechBubble,
    },
    DisplayHowToPlay {
        trigger: HowToPlayTrigger,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        companion: Option<HowToPlayCompanion>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        card_width_pixels: Option<u32>,
        text: String,
    },
    AnimateDreamAvatarPortrait {
        owner: Side,
        pause_seconds: Scalar,
        duration_seconds: Scalar,
    },
    DrawCard {
        owner: Side,
        card_id: EntityId,
        reason: CardDrawReason,
    },
    DrawOpponentCard {
        card_id: EntityId,
    },
    RevealAndPlayOpponentCard {
        card_id: EntityId,
        reveal_duration_seconds: Scalar,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        speech_bubble: Option<SpeechBubble>,
    },
    RepositionOpponentCharacter {
        card_id: EntityId,
    },
    RepositionPlayerCharacter {
        card_id: EntityId,
        opposing_card_id: EntityId,
    },
    ResolveChallenge {
        challenger_card_id: EntityId,
        blocker_card_id: EntityId,
    },
    DrawDreamwellCard {
        owner: Side,
        card_id: EntityId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reveal_duration_seconds: Option<Scalar>,
    },
    EndTurn {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        speech_bubble: Option<SpeechBubble>,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum HowToPlayTrigger {
    Immediate,
    PlayerTurnAnnouncementComplete,
    EnemyTurnAnnouncementComplete,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum HowToPlayCompanion {
    DreamwellCard,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum CardDrawReason {
    DreamwellEffect,
    TurnDraw,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TriggerDefinition {
    pub id: EntityId,
    pub on: Vec<TriggerEvent>,
    pub priority: Scalar,
    #[serde(default, skip_serializing_if = "IndexMap::is_empty")]
    pub delay_seconds: IndexMap<TriggerEvent, Scalar>,
    pub duration_seconds: Scalar,
    pub maximum_width_pixels: u32,
    pub matcher: TriggerMatcher,
    pub text: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum TriggerEvent {
    CardSeen,
    CardPlay,
    CardNoValidTargets,
    ChallengeResolved,
    DreamwellResolve,
    FigmentCreated,
    OpponentRepositionOpportunity,
    PlayerNightPhase,
    TransfigurationSeen,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum TriggerMatcher {
    Glossary { glossary_id: EntityId },
    EventCard,
    Card { card_id: EntityId },
    Any,
}

pub fn lower(source: TutorialCatalog) -> Result<toml::Value> {
    validate(&source)?;
    let compatibility = CompatibilityCatalog::try_from(source)?;
    Ok(toml::Value::try_from(compatibility)?)
}

pub(crate) fn validate(source: &TutorialCatalog) -> Result<()> {
    let mut entity_ids = BTreeSet::new();
    for action in &source.actions {
        ensure!(
            entity_ids.insert(action.id),
            "duplicate Tutorial entity id {}",
            action.id
        );
        validate_nonnegative(action.wait_seconds, "action wait")?;
        validate_action(action)?;
    }
    for trigger in &source.triggers {
        ensure!(
            entity_ids.insert(trigger.id),
            "duplicate Tutorial entity id {}",
            trigger.id
        );
        ensure!(
            !trigger.on.is_empty(),
            "Tutorial trigger {} has no events",
            trigger.id
        );
        ensure!(
            trigger.duration_seconds.as_f64() > 0.0,
            "Tutorial trigger {} must have a positive duration",
            trigger.id
        );
        validate_finite(trigger.priority, "trigger priority")?;
        validate_width(trigger.maximum_width_pixels)?;
        validate_text(&trigger.text, "trigger text")?;
        let events: BTreeSet<_> = trigger.on.iter().map(|event| *event as u8).collect();
        ensure!(
            events.len() == trigger.on.len(),
            "Tutorial trigger {} repeats an event",
            trigger.id
        );
        for (event, delay) in &trigger.delay_seconds {
            ensure!(
                trigger.on.contains(event),
                "Tutorial trigger {} delays an event it does not observe",
                trigger.id
            );
            validate_nonnegative(*delay, "trigger delay")?;
        }
        if let TriggerMatcher::Any = trigger.matcher {
            ensure!(
                trigger.on.len() == 1
                    && matches!(
                        trigger.on[0],
                        TriggerEvent::ChallengeResolved
                            | TriggerEvent::FigmentCreated
                            | TriggerEvent::OpponentRepositionOpportunity
                            | TriggerEvent::PlayerNightPhase
                            | TriggerEvent::TransfigurationSeen
                    ),
                "Tutorial trigger {} uses Any for an unsupported event",
                trigger.id
            );
        }
    }
    for action_override in &source.battle.ai_action_overrides {
        ensure!(
            entity_ids.insert(action_override.id),
            "duplicate Tutorial entity id {}",
            action_override.id
        );
    }
    validate_battle(&source.battle)?;
    validate_guidance(&source.journey_guidance)?;
    Ok(())
}

fn validate_guidance(guidance: &JourneyGuidance) -> Result<()> {
    for bubble in [
        &guidance.journey_start,
        &guidance.dreamscape,
        &guidance.atlas,
        &guidance.draft,
        &guidance.purge,
        &guidance.dreamsign_revelation,
        &guidance.first_battle,
        &guidance.second_battle,
    ] {
        validate_nonnegative(bubble.delay_seconds, "persistent bubble delay")?;
        validate_finite(
            bubble.horizontal_offset_pixels,
            "persistent bubble horizontal offset",
        )?;
        validate_finite(
            bubble.vertical_offset_pixels,
            "persistent bubble vertical offset",
        )?;
        validate_width(bubble.maximum_width_pixels)?;
        validate_text(&bubble.text, "persistent bubble text")?;
    }
    Ok(())
}

fn validate_action(action: &ActionDefinition) -> Result<()> {
    match &action.behavior {
        TutorialAction::DisplaySpeechBubble { speech_bubble } => {
            validate_speech_bubble(speech_bubble)
        }
        TutorialAction::DisplayHowToPlay {
            card_width_pixels,
            text,
            ..
        } => {
            if let Some(width) = card_width_pixels {
                ensure!(
                    *width >= 300,
                    "How to Play width must be at least 300 pixels"
                );
            }
            validate_text(text, "How to Play text")
        }
        TutorialAction::AnimateDreamAvatarPortrait {
            pause_seconds,
            duration_seconds,
            ..
        } => {
            validate_nonnegative(*pause_seconds, "portrait pause")?;
            validate_nonnegative(*duration_seconds, "portrait duration")
        }
        TutorialAction::RevealAndPlayOpponentCard {
            reveal_duration_seconds,
            speech_bubble,
            ..
        } => {
            validate_nonnegative(*reveal_duration_seconds, "card reveal duration")?;
            if let Some(bubble) = speech_bubble {
                validate_speech_bubble(bubble)?;
            }
            Ok(())
        }
        TutorialAction::RepositionPlayerCharacter {
            card_id,
            opposing_card_id,
        } => {
            ensure!(
                card_id != opposing_card_id,
                "reposition action must identify two cards"
            );
            Ok(())
        }
        TutorialAction::ResolveChallenge {
            challenger_card_id,
            blocker_card_id,
        } => {
            ensure!(
                challenger_card_id != blocker_card_id,
                "challenge must identify two cards"
            );
            Ok(())
        }
        TutorialAction::DrawDreamwellCard {
            reveal_duration_seconds,
            ..
        } => {
            if let Some(duration) = reveal_duration_seconds {
                validate_nonnegative(*duration, "Dreamwell reveal duration")?;
            }
            Ok(())
        }
        TutorialAction::EndTurn { speech_bubble } => {
            if let Some(bubble) = speech_bubble {
                validate_speech_bubble(bubble)?;
            }
            Ok(())
        }
        TutorialAction::DrawCard { .. }
        | TutorialAction::DrawOpponentCard { .. }
        | TutorialAction::RepositionOpponentCharacter { .. } => Ok(()),
    }
}

fn validate_speech_bubble(bubble: &SpeechBubble) -> Result<()> {
    validate_nonnegative(bubble.delay_seconds, "speech bubble delay")?;
    validate_nonnegative(bubble.duration_seconds, "speech bubble duration")?;
    validate_finite(
        bubble.horizontal_offset_pixels,
        "speech bubble horizontal offset",
    )?;
    validate_finite(
        bubble.vertical_offset_pixels,
        "speech bubble vertical offset",
    )?;
    validate_width(bubble.maximum_width_pixels)?;
    validate_text(&bubble.text, "speech bubble text")
}

fn validate_battle(battle: &BattleConfiguration) -> Result<()> {
    ensure!(
        battle.score_to_win > 0,
        "Tutorial score_to_win must be positive"
    );
    ensure!(
        !battle.starter_deck.is_empty(),
        "Tutorial starter deck must not be empty"
    );
    let mut starter_ids = BTreeSet::new();
    for entry in &battle.starter_deck {
        ensure!(
            entry.copies > 0,
            "Tutorial starter deck copies must be positive"
        );
        ensure!(
            starter_ids.insert(entry.card_id),
            "Tutorial starter deck repeats {}",
            entry.card_id
        );
    }
    ensure!(
        battle.scripted_board.player_back_rank_index < 3,
        "player back-rank index is outside the compact board"
    );
    ensure!(
        battle.scripted_board.player_front_rank_index < 2,
        "player front-rank index is outside the compact board"
    );
    ensure!(
        battle.handoff.turn_number > 0,
        "Tutorial handoff turn must be positive"
    );
    for side in [&battle.handoff.player, &battle.handoff.enemy] {
        ensure!(
            side.current_energy <= side.maximum_energy,
            "Tutorial handoff energy exceeds maximum"
        );
    }
    let dreamwell_ids: BTreeSet<_> = battle.dreamwell_draws.iter().copied().collect();
    ensure!(
        dreamwell_ids.len() == battle.dreamwell_draws.len(),
        "Tutorial Dreamwell draw list repeats a card"
    );
    let mut occupied = BTreeSet::new();
    ensure!(
        !battle.handoff.placements.is_empty(),
        "Tutorial handoff placements must not be empty"
    );
    for placement in &battle.handoff.placements {
        if let HandoffPlacement::Rank {
            side,
            rank,
            slot_id,
            ..
        } = placement
        {
            ensure!(
                !slot_id.trim().is_empty(),
                "Tutorial handoff rank placement has a blank slot"
            );
            ensure!(
                occupied.insert((*side as u8, *rank as u8, slot_id)),
                "Tutorial handoff repeats a slot"
            );
        }
    }
    for action_override in &battle.ai_action_overrides {
        let AiTrigger::AfterEnemyDreamwell { card_id } = action_override.trigger;
        ensure!(
            dreamwell_ids.contains(&card_id),
            "Tutorial AI override {} references a Dreamwell card outside the draw list",
            action_override.id
        );
    }
    Ok(())
}

fn validate_width(width: u32) -> Result<()> {
    ensure!(
        (300..=700).contains(&width),
        "speech bubble width must be from 300 to 700 pixels"
    );
    Ok(())
}

fn validate_text(text: &str, field: &str) -> Result<()> {
    ensure!(!text.trim().is_empty(), "{field} must not be blank");
    Ok(())
}

fn validate_nonnegative(value: Scalar, field: &str) -> Result<()> {
    validate_finite(value, field)?;
    ensure!(value.as_f64() >= 0.0, "{field} must be nonnegative");
    Ok(())
}

fn validate_finite(value: Scalar, field: &str) -> Result<()> {
    ensure!(value.as_f64().is_finite(), "{field} must be finite");
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityCatalog {
    journey_start: CompatibilityGuidance,
    dreamscape: CompatibilityGuidance,
    atlas: CompatibilityGuidance,
    draft: CompatibilityGuidance,
    purge: CompatibilityGuidance,
    dreamsign_revelation: CompatibilityGuidance,
    battle_start: CompatibilityBattleStart,
    battle: CompatibilityBattle,
    actions: Vec<CompatibilityAction>,
    triggers: Vec<CompatibilityTrigger>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityGuidance {
    speech_bubble: CompatibilityPersistentSpeechBubble,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityBattleStart {
    first_battle: CompatibilityGuidance,
    second_battle: CompatibilityGuidance,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityPersistentSpeechBubble {
    speaker: &'static str,
    #[serde(skip_serializing_if = "Scalar::is_zero")]
    delay: Scalar,
    horizontal_offset: Scalar,
    vertical_offset: Scalar,
    bubble_width: u32,
    text: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilitySpeechBubble {
    speaker: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Scalar::is_zero")]
    delay: Scalar,
    duration: Scalar,
    #[serde(skip_serializing_if = "Scalar::is_zero")]
    horizontal_offset: Scalar,
    vertical_offset: Scalar,
    bubble_width: u32,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityBattle {
    player_dream_avatar_id: String,
    enemy_dream_avatar_id: String,
    starting_energy: u32,
    score_to_win: u32,
    player_draws: Vec<String>,
    enemy_draws: Vec<String>,
    dreamwell_draws: Vec<String>,
    starter_deck: Vec<CompatibilityStarterDeckEntry>,
    featured_cards: CompatibilityFeaturedCards,
    scripted_board: CompatibilityScriptedBoard,
    handoff: CompatibilityHandoff,
    ai_action_overrides: Vec<CompatibilityAiActionOverride>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityStarterDeckEntry {
    card_id: String,
    copies: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityFeaturedCards {
    player_card_id: String,
    opponent_card_id: String,
    enemy_starter_card_id: String,
    loading_event_card_id: String,
    dreamwell_card_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityScriptedBoard {
    player_back_rank_index: u32,
    player_front_rank_index: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityHandoff {
    active_side: &'static str,
    turn_number: u32,
    phase: &'static str,
    dreamwell_deck_index: u32,
    player: CompatibilityHandoffSide,
    enemy: CompatibilityHandoffSide,
    placements: Vec<CompatibilityPlacement>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityHandoffSide {
    current_energy: u32,
    max_energy: u32,
    score: u32,
    dreamwell_card_index: u32,
    dreamwell_drawn_turn: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityPlacement {
    card_role: &'static str,
    side: &'static str,
    source: &'static str,
    zone: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    slot_id: Option<String>,
}

#[derive(Serialize)]
struct CompatibilityAiActionOverride {
    id: String,
    trigger: CompatibilityAiTrigger,
    action: CompatibilityAiAction,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityAiTrigger {
    kind: &'static str,
    side: &'static str,
    card_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityAiAction {
    kind: &'static str,
    card_id: String,
}

#[derive(Deserialize, Serialize)]
struct CompatibilityAction {
    id: String,
    #[serde(flatten)]
    behavior: CompatibilityActionBehavior,
    wait: Scalar,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
enum CompatibilityActionBehavior {
    DisplaySpeechBubble {
        #[serde(rename = "speechBubble")]
        speech_bubble: CompatibilitySpeechBubble,
    },
    DisplayHowToPlay {
        trigger: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        companion: Option<String>,
        #[serde(rename = "cardWidth", skip_serializing_if = "Option::is_none")]
        card_width: Option<u32>,
        text: String,
    },
    AnimateDreamAvatarPortrait {
        owner: String,
        pause: Scalar,
        duration: Scalar,
    },
    DrawCard {
        owner: String,
        #[serde(rename = "cardId")]
        card_id: String,
        reason: String,
    },
    DrawOpponentCard {
        #[serde(rename = "cardId")]
        card_id: String,
    },
    RevealAndPlayOpponentCard {
        #[serde(rename = "cardId")]
        card_id: String,
        #[serde(rename = "revealDuration")]
        reveal_duration: Scalar,
        #[serde(rename = "speechBubble", skip_serializing_if = "Option::is_none")]
        speech_bubble: Option<CompatibilitySpeechBubble>,
    },
    RepositionOpponentCharacter {
        #[serde(rename = "cardId")]
        card_id: String,
    },
    RepositionPlayerCharacter {
        #[serde(rename = "cardId")]
        card_id: String,
        #[serde(rename = "opposingCardId")]
        opposing_card_id: String,
    },
    ResolveChallenge {
        #[serde(rename = "challengerCardId")]
        challenger_card_id: String,
        #[serde(rename = "blockerCardId")]
        blocker_card_id: String,
    },
    DrawDreamwellCard {
        owner: String,
        #[serde(rename = "cardId")]
        card_id: String,
        #[serde(rename = "revealDuration", skip_serializing_if = "Option::is_none")]
        reveal_duration: Option<Scalar>,
    },
    EndTurn {
        #[serde(rename = "speechBubble", skip_serializing_if = "Option::is_none")]
        speech_bubble: Option<CompatibilitySpeechBubble>,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatibilityTrigger {
    id: String,
    on: Vec<&'static str>,
    priority: Scalar,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    delay: BTreeMap<&'static str, Scalar>,
    duration: Scalar,
    bubble_width: u32,
    #[serde(rename = "match")]
    matcher: CompatibilityMatcher,
    text: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum CompatibilityMatcher {
    Glossary {
        id: String,
    },
    CardType {
        #[serde(rename = "cardType")]
        card_type: &'static str,
    },
    CardId {
        #[serde(rename = "cardId")]
        card_id: String,
    },
    Any,
}

impl TryFrom<TutorialCatalog> for CompatibilityCatalog {
    type Error = anyhow::Error;

    fn try_from(source: TutorialCatalog) -> Result<Self> {
        let JourneyGuidance {
            journey_start,
            dreamscape,
            atlas,
            draft,
            purge,
            dreamsign_revelation,
            first_battle,
            second_battle,
        } = source.journey_guidance;
        Ok(Self {
            journey_start: guidance(journey_start),
            dreamscape: guidance(dreamscape),
            atlas: guidance(atlas),
            draft: guidance(draft),
            purge: guidance(purge),
            dreamsign_revelation: guidance(dreamsign_revelation),
            battle_start: CompatibilityBattleStart {
                first_battle: guidance(first_battle),
                second_battle: guidance(second_battle),
            },
            battle: lower_battle(source.battle)?,
            actions: source
                .actions
                .into_iter()
                .map(lower_action)
                .collect::<Result<_>>()?,
            triggers: source
                .triggers
                .into_iter()
                .map(lower_trigger)
                .collect::<Result<_>>()?,
        })
    }
}

fn guidance(value: PersistentSpeechBubble) -> CompatibilityGuidance {
    CompatibilityGuidance {
        speech_bubble: CompatibilityPersistentSpeechBubble {
            speaker: "mira",
            delay: value.delay_seconds,
            horizontal_offset: value.horizontal_offset_pixels,
            vertical_offset: value.vertical_offset_pixels,
            bubble_width: value.maximum_width_pixels,
            text: value.text,
        },
    }
}

fn lower_battle(value: BattleConfiguration) -> Result<CompatibilityBattle> {
    Ok(CompatibilityBattle {
        player_dream_avatar_id: value.player_dream_avatar_id.to_string(),
        enemy_dream_avatar_id: value.enemy_dream_avatar_id.to_string(),
        starting_energy: value.starting_energy,
        score_to_win: value.score_to_win,
        player_draws: ids(value.player_draws),
        enemy_draws: ids(value.enemy_draws),
        dreamwell_draws: ids(value.dreamwell_draws),
        starter_deck: value
            .starter_deck
            .into_iter()
            .map(|entry| CompatibilityStarterDeckEntry {
                card_id: entry.card_id.to_string(),
                copies: entry.copies,
            })
            .collect(),
        featured_cards: CompatibilityFeaturedCards {
            player_card_id: value.featured_cards.player_card_id.to_string(),
            opponent_card_id: value.featured_cards.opponent_card_id.to_string(),
            enemy_starter_card_id: value.featured_cards.enemy_starter_card_id.to_string(),
            loading_event_card_id: value.featured_cards.loading_event_card_id.to_string(),
            dreamwell_card_id: value.featured_cards.dreamwell_card_id.to_string(),
        },
        scripted_board: CompatibilityScriptedBoard {
            player_back_rank_index: value.scripted_board.player_back_rank_index,
            player_front_rank_index: value.scripted_board.player_front_rank_index,
        },
        handoff: CompatibilityHandoff {
            active_side: side(value.handoff.active_side),
            turn_number: value.handoff.turn_number,
            phase: phase(value.handoff.phase),
            dreamwell_deck_index: value.handoff.dreamwell_deck_index,
            player: lower_handoff_side(value.handoff.player),
            enemy: lower_handoff_side(value.handoff.enemy),
            placements: value
                .handoff
                .placements
                .into_iter()
                .map(lower_placement)
                .collect(),
        },
        ai_action_overrides: value
            .ai_action_overrides
            .into_iter()
            .map(|entry| {
                let AiTrigger::AfterEnemyDreamwell {
                    card_id: trigger_card_id,
                } = entry.trigger;
                let AiAction::PlayCard {
                    card_id: action_card_id,
                } = entry.action;
                Ok(CompatibilityAiActionOverride {
                    id: compatibility_id(entry.id, AI_OVERRIDE_IDS)?,
                    trigger: CompatibilityAiTrigger {
                        kind: "after-dreamwell",
                        side: "enemy",
                        card_id: trigger_card_id.to_string(),
                    },
                    action: CompatibilityAiAction {
                        kind: "play-card",
                        card_id: action_card_id.to_string(),
                    },
                })
            })
            .collect::<Result<_>>()?,
    })
}

fn lower_handoff_side(value: HandoffSide) -> CompatibilityHandoffSide {
    CompatibilityHandoffSide {
        current_energy: value.current_energy,
        max_energy: value.maximum_energy,
        score: value.score,
        dreamwell_card_index: value.dreamwell_card_index,
        dreamwell_drawn_turn: value.dreamwell_drawn_turn,
    }
}

fn lower_placement(value: HandoffPlacement) -> CompatibilityPlacement {
    match value {
        HandoffPlacement::Rank {
            card,
            side: placement_side,
            source,
            rank,
            slot_id,
        } => CompatibilityPlacement {
            card_role: featured_role(card),
            side: side(placement_side),
            source: placement_source(source),
            zone: rank_name(rank),
            slot_id: Some(slot_id),
        },
        HandoffPlacement::Void {
            card,
            side: placement_side,
            source,
        } => CompatibilityPlacement {
            card_role: featured_role(card),
            side: side(placement_side),
            source: placement_source(source),
            zone: "void",
            slot_id: None,
        },
    }
}

fn lower_action(value: ActionDefinition) -> Result<CompatibilityAction> {
    let behavior = match value.behavior {
        TutorialAction::DisplaySpeechBubble { speech_bubble } => {
            CompatibilityActionBehavior::DisplaySpeechBubble {
                speech_bubble: lower_speech_bubble(speech_bubble),
            }
        }
        TutorialAction::DisplayHowToPlay {
            trigger,
            companion,
            card_width_pixels,
            text,
        } => CompatibilityActionBehavior::DisplayHowToPlay {
            trigger: how_to_play_trigger(trigger).into(),
            companion: companion.map(|_| "dreamwell-card".into()),
            card_width: card_width_pixels,
            text,
        },
        TutorialAction::AnimateDreamAvatarPortrait {
            owner,
            pause_seconds,
            duration_seconds,
        } => CompatibilityActionBehavior::AnimateDreamAvatarPortrait {
            owner: side(owner).into(),
            pause: pause_seconds,
            duration: duration_seconds,
        },
        TutorialAction::DrawCard {
            owner,
            card_id,
            reason,
        } => CompatibilityActionBehavior::DrawCard {
            owner: side(owner).into(),
            card_id: card_id.to_string(),
            reason: draw_reason(reason).into(),
        },
        TutorialAction::DrawOpponentCard { card_id } => {
            CompatibilityActionBehavior::DrawOpponentCard {
                card_id: card_id.to_string(),
            }
        }
        TutorialAction::RevealAndPlayOpponentCard {
            card_id,
            reveal_duration_seconds,
            speech_bubble,
        } => CompatibilityActionBehavior::RevealAndPlayOpponentCard {
            card_id: card_id.to_string(),
            reveal_duration: reveal_duration_seconds,
            speech_bubble: speech_bubble.map(lower_speech_bubble),
        },
        TutorialAction::RepositionOpponentCharacter { card_id } => {
            CompatibilityActionBehavior::RepositionOpponentCharacter {
                card_id: card_id.to_string(),
            }
        }
        TutorialAction::RepositionPlayerCharacter {
            card_id,
            opposing_card_id,
        } => CompatibilityActionBehavior::RepositionPlayerCharacter {
            card_id: card_id.to_string(),
            opposing_card_id: opposing_card_id.to_string(),
        },
        TutorialAction::ResolveChallenge {
            challenger_card_id,
            blocker_card_id,
        } => CompatibilityActionBehavior::ResolveChallenge {
            challenger_card_id: challenger_card_id.to_string(),
            blocker_card_id: blocker_card_id.to_string(),
        },
        TutorialAction::DrawDreamwellCard {
            owner,
            card_id,
            reveal_duration_seconds,
        } => CompatibilityActionBehavior::DrawDreamwellCard {
            owner: side(owner).into(),
            card_id: card_id.to_string(),
            reveal_duration: reveal_duration_seconds,
        },
        TutorialAction::EndTurn { speech_bubble } => CompatibilityActionBehavior::EndTurn {
            speech_bubble: speech_bubble.map(lower_speech_bubble),
        },
    };
    Ok(CompatibilityAction {
        id: compatibility_id(value.id, ACTION_IDS)?,
        behavior,
        wait: value.wait_seconds,
    })
}

fn lower_speech_bubble(value: SpeechBubble) -> CompatibilitySpeechBubble {
    CompatibilitySpeechBubble {
        speaker: speaker(value.speaker).into(),
        delay: value.delay_seconds,
        duration: value.duration_seconds,
        horizontal_offset: value.horizontal_offset_pixels,
        vertical_offset: value.vertical_offset_pixels,
        bubble_width: value.maximum_width_pixels,
        text: value.text,
    }
}

fn lower_trigger(value: TriggerDefinition) -> Result<CompatibilityTrigger> {
    let matcher = match value.matcher {
        TriggerMatcher::Glossary { glossary_id } => CompatibilityMatcher::Glossary {
            id: glossary_id.to_string(),
        },
        TriggerMatcher::EventCard => CompatibilityMatcher::CardType { card_type: "event" },
        TriggerMatcher::Card { card_id } => CompatibilityMatcher::CardId {
            card_id: card_id.to_string(),
        },
        TriggerMatcher::Any => CompatibilityMatcher::Any,
    };
    Ok(CompatibilityTrigger {
        id: compatibility_id(value.id, TRIGGER_IDS)?,
        on: value.on.into_iter().map(trigger_event).collect(),
        priority: value.priority,
        delay: value
            .delay_seconds
            .into_iter()
            .map(|(event, delay)| (trigger_event(event), delay))
            .collect(),
        duration: value.duration_seconds,
        bubble_width: value.maximum_width_pixels,
        matcher,
        text: value.text,
    })
}

fn ids(values: Vec<EntityId>) -> Vec<String> {
    values.into_iter().map(|id| id.to_string()).collect()
}
fn speaker(value: Speaker) -> &'static str {
    match value {
        Speaker::Mira => "mira",
        Speaker::Player => "player",
        Speaker::Enemy => "enemy",
    }
}
fn side(value: Side) -> &'static str {
    match value {
        Side::Player => "player",
        Side::Enemy => "enemy",
    }
}
fn featured_role(value: FeaturedCardRole) -> &'static str {
    match value {
        FeaturedCardRole::Player => "player",
        FeaturedCardRole::Opponent => "opponent",
        FeaturedCardRole::EnemyStarter => "enemyStarter",
        FeaturedCardRole::LoadingEvent => "loadingEvent",
    }
}
fn placement_source(value: PlacementSource) -> &'static str {
    match value {
        PlacementSource::Deck => "deck",
        PlacementSource::Created => "created",
    }
}
fn rank_name(value: Rank) -> &'static str {
    match value {
        Rank::Front => "frontRank",
        Rank::Back => "backRank",
    }
}
fn phase(value: BattlePhase) -> &'static str {
    match value {
        BattlePhase::Dreamwell => "dreamwell",
        BattlePhase::Draw => "draw",
        BattlePhase::Dawn => "dawn",
        BattlePhase::Day => "day",
        BattlePhase::Dusk => "dusk",
        BattlePhase::Night => "night",
        BattlePhase::Challenge => "challenge",
        BattlePhase::Ending => "ending",
    }
}
fn how_to_play_trigger(value: HowToPlayTrigger) -> &'static str {
    match value {
        HowToPlayTrigger::Immediate => "immediate",
        HowToPlayTrigger::PlayerTurnAnnouncementComplete => "player-turn-announcement-complete",
        HowToPlayTrigger::EnemyTurnAnnouncementComplete => "enemy-turn-announcement-complete",
    }
}
fn draw_reason(value: CardDrawReason) -> &'static str {
    match value {
        CardDrawReason::DreamwellEffect => "dreamwell-effect",
        CardDrawReason::TurnDraw => "turn-draw",
    }
}
fn trigger_event(value: TriggerEvent) -> &'static str {
    match value {
        TriggerEvent::CardSeen => "card-seen",
        TriggerEvent::CardPlay => "card-play",
        TriggerEvent::CardNoValidTargets => "card-no-valid-targets",
        TriggerEvent::ChallengeResolved => "challenge-resolved",
        TriggerEvent::DreamwellResolve => "dreamwell-resolve",
        TriggerEvent::FigmentCreated => "figment-created",
        TriggerEvent::OpponentRepositionOpportunity => "opponent-reposition-opportunity",
        TriggerEvent::PlayerNightPhase => "player-night-phase",
        TriggerEvent::TransfigurationSeen => "transfiguration-seen",
    }
}

fn compatibility_id(id: EntityId, mapping: &[(&str, &str)]) -> Result<String> {
    Ok(mapping
        .iter()
        .find_map(|(legacy, uuid)| (*uuid == id.to_string()).then(|| (*legacy).to_owned()))
        .unwrap_or_else(|| id.to_string()))
}

pub(crate) fn actions_from_compatibility_json(
    value: serde_json::Value,
) -> Result<Vec<ActionDefinition>> {
    let actions: Vec<CompatibilityAction> = serde_json::from_value(value)
        .context("Tutorial actions must match the compatibility action schema")?;
    actions
        .into_iter()
        .map(ActionDefinition::try_from)
        .collect()
}

fn entity_id_from_compatibility(value: &str, mapping: &[(&str, &str)]) -> Result<EntityId> {
    let canonical = mapping
        .iter()
        .find_map(|(legacy, uuid)| (*legacy == value).then_some(*uuid))
        .unwrap_or(value);
    EntityId::parse(canonical).map_err(anyhow::Error::msg)
}

impl TryFrom<CompatibilityAction> for ActionDefinition {
    type Error = anyhow::Error;

    fn try_from(value: CompatibilityAction) -> Result<Self> {
        let behavior = match value.behavior {
            CompatibilityActionBehavior::DisplaySpeechBubble { speech_bubble } => {
                TutorialAction::DisplaySpeechBubble {
                    speech_bubble: speech_bubble.try_into()?,
                }
            }
            CompatibilityActionBehavior::DisplayHowToPlay {
                trigger,
                companion,
                card_width,
                text,
            } => TutorialAction::DisplayHowToPlay {
                trigger: match trigger.as_str() {
                    "immediate" => HowToPlayTrigger::Immediate,
                    "player-turn-announcement-complete" => {
                        HowToPlayTrigger::PlayerTurnAnnouncementComplete
                    }
                    "enemy-turn-announcement-complete" => {
                        HowToPlayTrigger::EnemyTurnAnnouncementComplete
                    }
                    _ => anyhow::bail!("unsupported How to Play trigger {trigger}"),
                },
                companion: match companion.as_deref() {
                    None => None,
                    Some("dreamwell-card") => Some(HowToPlayCompanion::DreamwellCard),
                    Some(other) => anyhow::bail!("unsupported How to Play companion {other}"),
                },
                card_width_pixels: card_width,
                text,
            },
            CompatibilityActionBehavior::AnimateDreamAvatarPortrait {
                owner,
                pause,
                duration,
            } => TutorialAction::AnimateDreamAvatarPortrait {
                owner: parse_side(&owner)?,
                pause_seconds: pause,
                duration_seconds: duration,
            },
            CompatibilityActionBehavior::DrawCard {
                owner,
                card_id,
                reason,
            } => TutorialAction::DrawCard {
                owner: parse_side(&owner)?,
                card_id: EntityId::parse(&card_id).map_err(anyhow::Error::msg)?,
                reason: match reason.as_str() {
                    "dreamwell-effect" => CardDrawReason::DreamwellEffect,
                    "turn-draw" => CardDrawReason::TurnDraw,
                    _ => anyhow::bail!("unsupported card draw reason {reason}"),
                },
            },
            CompatibilityActionBehavior::DrawOpponentCard { card_id } => {
                TutorialAction::DrawOpponentCard {
                    card_id: EntityId::parse(&card_id).map_err(anyhow::Error::msg)?,
                }
            }
            CompatibilityActionBehavior::RevealAndPlayOpponentCard {
                card_id,
                reveal_duration,
                speech_bubble,
            } => TutorialAction::RevealAndPlayOpponentCard {
                card_id: EntityId::parse(&card_id).map_err(anyhow::Error::msg)?,
                reveal_duration_seconds: reveal_duration,
                speech_bubble: speech_bubble.map(TryInto::try_into).transpose()?,
            },
            CompatibilityActionBehavior::RepositionOpponentCharacter { card_id } => {
                TutorialAction::RepositionOpponentCharacter {
                    card_id: EntityId::parse(&card_id).map_err(anyhow::Error::msg)?,
                }
            }
            CompatibilityActionBehavior::RepositionPlayerCharacter {
                card_id,
                opposing_card_id,
            } => TutorialAction::RepositionPlayerCharacter {
                card_id: EntityId::parse(&card_id).map_err(anyhow::Error::msg)?,
                opposing_card_id: EntityId::parse(&opposing_card_id).map_err(anyhow::Error::msg)?,
            },
            CompatibilityActionBehavior::ResolveChallenge {
                challenger_card_id,
                blocker_card_id,
            } => TutorialAction::ResolveChallenge {
                challenger_card_id: EntityId::parse(&challenger_card_id)
                    .map_err(anyhow::Error::msg)?,
                blocker_card_id: EntityId::parse(&blocker_card_id).map_err(anyhow::Error::msg)?,
            },
            CompatibilityActionBehavior::DrawDreamwellCard {
                owner,
                card_id,
                reveal_duration,
            } => TutorialAction::DrawDreamwellCard {
                owner: parse_side(&owner)?,
                card_id: EntityId::parse(&card_id).map_err(anyhow::Error::msg)?,
                reveal_duration_seconds: reveal_duration,
            },
            CompatibilityActionBehavior::EndTurn { speech_bubble } => TutorialAction::EndTurn {
                speech_bubble: speech_bubble.map(TryInto::try_into).transpose()?,
            },
        };
        let action = Self {
            id: entity_id_from_compatibility(&value.id, ACTION_IDS)?,
            wait_seconds: value.wait,
            behavior,
        };
        validate_action(&action)?;
        Ok(action)
    }
}

impl TryFrom<CompatibilitySpeechBubble> for SpeechBubble {
    type Error = anyhow::Error;

    fn try_from(value: CompatibilitySpeechBubble) -> Result<Self> {
        Ok(Self {
            speaker: match value.speaker.as_str() {
                "mira" => Speaker::Mira,
                "player" => Speaker::Player,
                "enemy" => Speaker::Enemy,
                other => anyhow::bail!("unsupported speech bubble speaker {other}"),
            },
            delay_seconds: value.delay,
            duration_seconds: value.duration,
            horizontal_offset_pixels: value.horizontal_offset,
            vertical_offset_pixels: value.vertical_offset,
            maximum_width_pixels: value.bubble_width,
            text: value.text,
        })
    }
}

fn parse_side(value: &str) -> Result<Side> {
    match value {
        "player" => Ok(Side::Player),
        "enemy" => Ok(Side::Enemy),
        _ => anyhow::bail!("unsupported Tutorial side {value}"),
    }
}

const ACTION_IDS: &[(&str, &str)] = &[
    ("welcome", "3f7f1086-8a50-4bc9-a7d2-6bf68fde992f"),
    (
        "dream-avatar-arrival",
        "c06dbc13-a48c-499e-83b3-b24e555ed008",
    ),
    ("nightmare-call", "8bae0625-6f94-472b-8752-1719166d0fb4"),
    ("vrakmoth-arrival", "548ef8f2-44d2-4af8-ae92-b13f089a42e1"),
    ("vrakmoth-taunt", "54325d07-bf55-4709-bb4a-fbfe098c81f5"),
    ("vrakmoth-draw", "f94ec9e9-c558-45b8-a6ba-69a8d9bb3c71"),
    (
        "vrakmoth-reveal-and-play",
        "d641f65f-8d2d-4d3c-a572-b12dbf5d1490",
    ),
    ("how-to-play", "08519d56-96a5-49f9-a508-4a604fe11fe0"),
    ("end-turn", "0afd72f6-ec5f-4ebb-a5c7-5975af025576"),
    ("autumn-glade", "35292d09-7eac-4f14-8777-48787d217405"),
    (
        "dreamwell-how-to-play",
        "597d8b4e-a424-4ea7-8919-a8194b82fcaa",
    ),
    (
        "runebound-champion-draw",
        "64f80a9f-9eaa-4247-ab2c-2bc278c292d0",
    ),
    (
        "runebound-champion-reveal-and-play",
        "fbf90344-247a-4d8f-81cd-9324c3761fcd",
    ),
    ("vrakmoth-challenge", "c2953e09-b017-486f-a315-a8fce33c38f3"),
    (
        "opponent-character-advance",
        "42bf48ce-4fa8-48ed-8458-dfd83df03679",
    ),
    (
        "challenge-positioning-how-to-play",
        "eca0ebe7-208a-4c7b-9153-d051418b29d6",
    ),
    (
        "block-twilight-troubadour",
        "876b59d1-cc76-4086-bdaf-3fb106c283c5",
    ),
    (
        "resolve-twilight-challenge",
        "c9ead9e0-bef7-41e2-aef6-206be4b9971e",
    ),
    (
        "challenge-resolution-dissolved",
        "01109c14-02cb-449c-86e0-0915d6119c10",
    ),
    (
        "challenge-resolution-points",
        "37a8690c-08f8-4aac-8285-f3e7c6c66740",
    ),
    ("player-voltsurge", "a5abd23e-f92e-4dd7-80bb-fcb760eacba5"),
    (
        "voltsurge-player-draw-nocturne",
        "d36e30f6-59e6-46a7-a214-3cfa3668d5e0",
    ),
    (
        "voltsurge-player-draw-witness",
        "04d04c5e-89d8-4544-a806-1231895000b8",
    ),
    (
        "voltsurge-enemy-draw-troubadour",
        "8dd10d24-4723-4630-919c-c4a6c97d50fc",
    ),
    (
        "voltsurge-enemy-draw-flashpoint",
        "4773ed9a-44d3-41c7-970b-7a40766d7360",
    ),
    (
        "player-turn-draw-glimpse",
        "c41035f0-4bd1-4835-bc0e-25fc0d01fba4",
    ),
    (
        "event-cards-explained",
        "b42ce692-bcc4-41a7-bc86-da62000ab350",
    ),
];

const TRIGGER_IDS: &[(&str, &str)] = &[
    (
        "opponent-reposition-opportunity",
        "9a5b5f0b-8e0b-437e-b04c-d12ab6e6071c",
    ),
    ("player-night-phase", "abe76c76-63ad-481e-9f22-559f33f845b8"),
    (
        "flashpoint-no-valid-targets",
        "277d95c1-e7a7-4d5a-9ee7-a5d26869bf75",
    ),
    ("spark-tie", "a0d61b83-d347-41ab-87ac-34842b3562d6"),
    ("transfiguration", "bdbcfb47-8a5d-4649-b2fd-1f1c4ca74fe5"),
    ("support", "8dccf13b-3883-4a30-acda-80743a9b6f94"),
    ("foresee", "1acc7803-e2a8-4628-a1b7-2b530d4faf89"),
    ("dissolved-trigger", "d6867701-d59d-448e-9b3e-93851861c53b"),
    ("discover", "85df10e7-cf05-4c7a-aa7a-cb29f9f072b8"),
    ("erode", "93327f3c-8c77-4947-8fca-6b4f4e51e528"),
    ("figment-created", "243537f6-acf7-4446-8599-87b1bb1789a5"),
    ("banish", "57b57322-62e5-48db-9de9-e2bca9e5600d"),
    ("dissolve", "2f67b4c7-9edd-49e9-8e26-c310eca409fe"),
    ("prevent", "5d43c5d4-c8e0-4492-9ae8-743e7f381161"),
    ("rematerialize", "cd804ef3-924f-4564-bd1e-48ca7261273e"),
    ("ephemeral", "53a5e9fc-2b77-47f3-b5f3-83767cd53f05"),
    ("awakened", "8274a79d-0688-4d48-80a0-c1da28f63c01"),
    ("phasing", "c45d78e2-3e5b-43e0-bd2a-8b99ae3e75b3"),
    ("veil", "f6e80279-f1ea-495b-a2b9-55b5fa83e669"),
    ("reclaim", "0a6ac735-0711-4137-9974-100d9b5c6e02"),
    ("offering", "f6f4623a-9dde-45ba-b829-91df183fc07d"),
    ("vengeful", "9393955c-f726-4ba3-9c70-bb0d61298bc2"),
];

const AI_OVERRIDE_IDS: &[(&str, &str)] = &[(
    "play-twilight-after-nomads-verge",
    "2fd657e4-02d2-412e-acad-4b063504a188",
)];

#[cfg(test)]
const GLOSSARY_IDS: &[(&str, &str)] = &[
    ("support", "59f426ac-b9cb-47af-a00a-8cbab941c6c4"),
    ("foresee", "21e9a392-3983-49ba-8072-aa950c63ebad"),
    ("dissolved-trigger", "abef45fb-8c3f-4d63-9408-0eed1b7283bb"),
    ("discover", "5bda4696-32f9-4df2-a784-80120d76578b"),
    ("erode", "23526f6e-f17e-4496-bf96-1875858d023d"),
    ("banish", "f7b481e7-5130-45fe-9a34-a9b54a620d44"),
    ("dissolve", "3b83d2c9-5fc4-4d75-8b61-3518eebdc39e"),
    ("prevent", "4244a386-8cd0-4e90-b80b-c3ae98a7df6b"),
    ("rematerialize", "cf383187-e594-41ee-98c5-039a9402b2f8"),
    ("ephemeral", "d455fe46-9ddb-4241-addd-52d40db4a4ac"),
    ("awakened", "75aae855-4ddc-41f3-9732-dd5922b897b8"),
    ("phasing", "ab7a9b1e-3603-4321-88e7-d79619435ef7"),
    ("veil", "c5c7ca5b-03ed-4665-8a3b-405ec6eed011"),
    ("reclaim", "374c29e9-deb1-4e3d-8410-b81bacc8588b"),
    ("offering", "04ffd85d-956e-4194-bdae-3d61ce3c584d"),
    ("vengeful", "ee732697-b9fc-4a89-942a-2778442810dd"),
];

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    fn entity(value: &str) -> EntityId {
        EntityId::parse(value).unwrap()
    }

    fn mapped_id(mapping: &[(&str, &str)], index: usize) -> EntityId {
        entity(mapping[index].1)
    }

    fn bubble(text: &str) -> SpeechBubble {
        SpeechBubble {
            speaker: Speaker::Mira,
            delay_seconds: Scalar::Integer(0),
            duration_seconds: Scalar::Float(2.5),
            horizontal_offset_pixels: Scalar::Integer(0),
            vertical_offset_pixels: Scalar::Integer(-7),
            maximum_width_pixels: 444,
            text: text.into(),
        }
    }

    fn synthetic_catalog() -> TutorialCatalog {
        let persistent = PersistentSpeechBubble {
            delay_seconds: Scalar::Float(1.25),
            horizontal_offset_pixels: Scalar::Integer(-12),
            vertical_offset_pixels: Scalar::Integer(8),
            maximum_width_pixels: 456,
            text: "Persistent Unicode ✦".into(),
        };
        let actions = vec![
            TutorialAction::DisplaySpeechBubble {
                speech_bubble: bubble("Line one\nline two"),
            },
            TutorialAction::DisplayHowToPlay {
                trigger: HowToPlayTrigger::EnemyTurnAnnouncementComplete,
                companion: Some(HowToPlayCompanion::DreamwellCard),
                card_width_pixels: Some(480),
                text: "How to play".into(),
            },
            TutorialAction::AnimateDreamAvatarPortrait {
                owner: Side::Enemy,
                pause_seconds: Scalar::Integer(1),
                duration_seconds: Scalar::Float(0.75),
            },
            TutorialAction::DrawCard {
                owner: Side::Player,
                card_id: entity("00000000-0000-4000-8000-000000000101"),
                reason: CardDrawReason::TurnDraw,
            },
            TutorialAction::DrawOpponentCard {
                card_id: entity("00000000-0000-4000-8000-000000000102"),
            },
            TutorialAction::RevealAndPlayOpponentCard {
                card_id: entity("00000000-0000-4000-8000-000000000102"),
                reveal_duration_seconds: Scalar::Integer(2),
                speech_bubble: Some(bubble("Reveal")),
            },
            TutorialAction::RepositionOpponentCharacter {
                card_id: entity("00000000-0000-4000-8000-000000000102"),
            },
            TutorialAction::RepositionPlayerCharacter {
                card_id: entity("00000000-0000-4000-8000-000000000101"),
                opposing_card_id: entity("00000000-0000-4000-8000-000000000102"),
            },
            TutorialAction::ResolveChallenge {
                challenger_card_id: entity("00000000-0000-4000-8000-000000000102"),
                blocker_card_id: entity("00000000-0000-4000-8000-000000000101"),
            },
            TutorialAction::DrawDreamwellCard {
                owner: Side::Enemy,
                card_id: entity("00000000-0000-4000-8000-000000000201"),
                reveal_duration_seconds: None,
            },
            TutorialAction::EndTurn {
                speech_bubble: None,
            },
        ]
        .into_iter()
        .enumerate()
        .map(|(index, behavior)| ActionDefinition {
            id: mapped_id(ACTION_IDS, index),
            wait_seconds: if index == 0 {
                Scalar::Float(0.5)
            } else {
                Scalar::Integer(0)
            },
            behavior,
        })
        .collect();

        TutorialCatalog {
            journey_guidance: JourneyGuidance {
                journey_start: persistent.clone(),
                dreamscape: persistent.clone(),
                atlas: persistent.clone(),
                draft: persistent.clone(),
                purge: persistent.clone(),
                dreamsign_revelation: persistent.clone(),
                first_battle: persistent.clone(),
                second_battle: persistent,
            },
            battle: BattleConfiguration {
                player_dream_avatar_id: entity("00000000-0000-4000-8000-000000000301"),
                enemy_dream_avatar_id: entity("00000000-0000-4000-8000-000000000302"),
                starting_energy: 7,
                score_to_win: 19,
                starter_deck: vec![StarterDeckEntry {
                    card_id: entity("00000000-0000-4000-8000-000000000101"),
                    copies: 2,
                }],
                player_draws: vec![],
                enemy_draws: vec![entity("00000000-0000-4000-8000-000000000102")],
                dreamwell_draws: vec![entity("00000000-0000-4000-8000-000000000201")],
                featured_cards: FeaturedCards {
                    player_card_id: entity("00000000-0000-4000-8000-000000000101"),
                    opponent_card_id: entity("00000000-0000-4000-8000-000000000102"),
                    enemy_starter_card_id: entity("00000000-0000-4000-8000-000000000103"),
                    loading_event_card_id: entity("00000000-0000-4000-8000-000000000104"),
                    dreamwell_card_id: entity("00000000-0000-4000-8000-000000000201"),
                },
                scripted_board: ScriptedBoard {
                    player_back_rank_index: 2,
                    player_front_rank_index: 1,
                },
                handoff: BattleHandoff {
                    active_side: Side::Enemy,
                    turn_number: 3,
                    phase: BattlePhase::Night,
                    dreamwell_deck_index: 1,
                    player: HandoffSide {
                        current_energy: 3,
                        maximum_energy: 4,
                        score: 5,
                        dreamwell_card_index: 0,
                        dreamwell_drawn_turn: 2,
                    },
                    enemy: HandoffSide {
                        current_energy: 2,
                        maximum_energy: 2,
                        score: 6,
                        dreamwell_card_index: 0,
                        dreamwell_drawn_turn: 2,
                    },
                    placements: vec![
                        HandoffPlacement::Rank {
                            card: FeaturedCardRole::LoadingEvent,
                            side: Side::Player,
                            source: PlacementSource::Deck,
                            rank: Rank::Back,
                            slot_id: "B1".into(),
                        },
                        HandoffPlacement::Void {
                            card: FeaturedCardRole::Opponent,
                            side: Side::Enemy,
                            source: PlacementSource::Created,
                        },
                    ],
                },
                ai_action_overrides: vec![AiActionOverride {
                    id: mapped_id(AI_OVERRIDE_IDS, 0),
                    trigger: AiTrigger::AfterEnemyDreamwell {
                        card_id: entity("00000000-0000-4000-8000-000000000201"),
                    },
                    action: AiAction::PlayCard {
                        card_id: entity("00000000-0000-4000-8000-000000000102"),
                    },
                }],
            },
            actions,
            triggers: vec![
                TriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 0),
                    on: vec![
                        TriggerEvent::CardSeen,
                        TriggerEvent::CardPlay,
                        TriggerEvent::CardNoValidTargets,
                        TriggerEvent::DreamwellResolve,
                    ],
                    priority: Scalar::Float(7.5),
                    delay_seconds: [(TriggerEvent::CardSeen, Scalar::Float(0.25))]
                        .into_iter()
                        .collect(),
                    duration_seconds: Scalar::Integer(3),
                    maximum_width_pixels: 500,
                    matcher: TriggerMatcher::Glossary {
                        glossary_id: mapped_id(GLOSSARY_IDS, 0),
                    },
                    text: "Glossary".into(),
                },
                TriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 1),
                    on: vec![TriggerEvent::ChallengeResolved],
                    priority: Scalar::Integer(2),
                    delay_seconds: IndexMap::new(),
                    duration_seconds: Scalar::Integer(4),
                    maximum_width_pixels: 501,
                    matcher: TriggerMatcher::EventCard,
                    text: "Card type".into(),
                },
                TriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 2),
                    on: vec![TriggerEvent::PlayerNightPhase],
                    priority: Scalar::Integer(3),
                    delay_seconds: IndexMap::new(),
                    duration_seconds: Scalar::Integer(5),
                    maximum_width_pixels: 502,
                    matcher: TriggerMatcher::Card {
                        card_id: entity("00000000-0000-4000-8000-000000000101"),
                    },
                    text: "Card".into(),
                },
                TriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 3),
                    on: vec![TriggerEvent::FigmentCreated],
                    priority: Scalar::Integer(4),
                    delay_seconds: IndexMap::new(),
                    duration_seconds: Scalar::Integer(6),
                    maximum_width_pixels: 503,
                    matcher: TriggerMatcher::Any,
                    text: "Any".into(),
                },
            ],
        }
    }

    #[test]
    fn rejects_unknown_fields_and_non_uuidv4_identity() {
        let unknown = r#"TutorialCatalog(journey_guidance: JourneyGuidance(journey_start: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), dreamscape: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), atlas: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), draft: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), purge: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), dreamsign_revelation: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), first_battle: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), second_battle: PersistentSpeechBubble(maximum_width_pixels: 500, text: \"x\"), surprise: true), battle: ( ))"#;
        assert!(ron::from_str::<TutorialCatalog>(unknown).is_err());
        for invalid in [
            "legacy-id",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
        ] {
            assert!(EntityId::parse(invalid).is_err());
        }
    }

    #[test]
    fn exhaustively_lowers_closed_vocabularies() {
        assert_eq!([Side::Player, Side::Enemy].map(side), ["player", "enemy"]);
        assert_eq!(
            [Rank::Front, Rank::Back].map(rank_name),
            ["frontRank", "backRank"]
        );
        assert_eq!(
            [
                HowToPlayTrigger::Immediate,
                HowToPlayTrigger::PlayerTurnAnnouncementComplete,
                HowToPlayTrigger::EnemyTurnAnnouncementComplete
            ]
            .map(how_to_play_trigger),
            [
                "immediate",
                "player-turn-announcement-complete",
                "enemy-turn-announcement-complete"
            ]
        );
        assert_eq!(
            [CardDrawReason::DreamwellEffect, CardDrawReason::TurnDraw].map(draw_reason),
            ["dreamwell-effect", "turn-draw"]
        );
        assert_eq!(
            [
                BattlePhase::Dreamwell,
                BattlePhase::Draw,
                BattlePhase::Dawn,
                BattlePhase::Day,
                BattlePhase::Dusk,
                BattlePhase::Night,
                BattlePhase::Challenge,
                BattlePhase::Ending,
            ]
            .map(phase),
            [
                "dreamwell",
                "draw",
                "dawn",
                "day",
                "dusk",
                "night",
                "challenge",
                "ending",
            ]
        );
        assert_eq!(
            [Speaker::Mira, Speaker::Player, Speaker::Enemy].map(speaker),
            ["mira", "player", "enemy"]
        );
        assert_eq!(
            [
                TriggerEvent::CardSeen,
                TriggerEvent::CardPlay,
                TriggerEvent::CardNoValidTargets,
                TriggerEvent::ChallengeResolved,
                TriggerEvent::DreamwellResolve,
                TriggerEvent::FigmentCreated,
                TriggerEvent::OpponentRepositionOpportunity,
                TriggerEvent::PlayerNightPhase,
                TriggerEvent::TransfigurationSeen,
            ]
            .map(trigger_event),
            [
                "card-seen",
                "card-play",
                "card-no-valid-targets",
                "challenge-resolved",
                "dreamwell-resolve",
                "figment-created",
                "opponent-reposition-opportunity",
                "player-night-phase",
                "transfiguration-seen",
            ]
        );
    }

    #[test]
    fn validates_duplicate_ids_cross_field_invariants_and_defaults() {
        assert!(Scalar::is_zero(&Scalar::Integer(0)));
        assert!(Scalar::is_zero(&Scalar::Float(0.0)));
        assert!(validate_width(299).is_err());
        assert!(validate_nonnegative(Scalar::Float(-0.5), "test").is_err());
        assert!(validate_finite(Scalar::Float(f64::INFINITY), "test").is_err());

        let mut duplicate = synthetic_catalog();
        duplicate.actions[1].id = duplicate.actions[0].id;
        assert!(
            lower(duplicate)
                .unwrap_err()
                .to_string()
                .contains("duplicate")
        );

        let mut invalid_reference = synthetic_catalog();
        invalid_reference.battle.ai_action_overrides[0].trigger = AiTrigger::AfterEnemyDreamwell {
            card_id: entity("00000000-0000-4000-8000-000000000299"),
        };
        assert!(
            lower(invalid_reference)
                .unwrap_err()
                .to_string()
                .contains("outside the draw list")
        );
    }

    #[test]
    fn lowers_every_action_and_matcher_variant_with_exact_compatibility_keys() {
        let lowered = lower(synthetic_catalog()).unwrap();
        let actions = lowered["actions"].as_array().unwrap();
        assert_eq!(actions.len(), 11);
        assert_eq!(
            actions
                .iter()
                .map(|entry| entry["action"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec![
                "display-speech-bubble",
                "display-how-to-play",
                "animate-dream-avatar-portrait",
                "draw-card",
                "draw-opponent-card",
                "reveal-and-play-opponent-card",
                "reposition-opponent-character",
                "reposition-player-character",
                "resolve-challenge",
                "draw-dreamwell-card",
                "end-turn",
            ]
        );
        assert!(actions[0].get("behavior").is_none());
        assert_eq!(actions[0]["wait"].as_float(), Some(0.5));
        assert_eq!(
            actions[0]["speechBubble"]["verticalOffset"].as_integer(),
            Some(-7)
        );
        assert!(actions[0]["speechBubble"].get("horizontalOffset").is_none());
        assert!(actions[9].get("revealDuration").is_none());
        assert!(actions[10].get("speechBubble").is_none());

        let triggers = lowered["triggers"].as_array().unwrap();
        assert_eq!(triggers[0]["match"]["kind"].as_str(), Some("glossary"));
        assert_eq!(
            triggers[0]["match"]["id"].as_str(),
            Some("59f426ac-b9cb-47af-a00a-8cbab941c6c4")
        );
        assert_eq!(triggers[1]["match"]["kind"].as_str(), Some("card-type"));
        assert_eq!(triggers[2]["match"]["kind"].as_str(), Some("card-id"));
        assert_eq!(triggers[3]["match"]["kind"].as_str(), Some("any"));
        assert!(triggers[1].get("delay").is_none());
        assert!(
            lowered["battle"]["playerDraws"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            lowered["battle"]["handoff"]["placements"][0]["zone"].as_str(),
            Some("backRank")
        );
        assert!(
            lowered["battle"]["handoff"]["placements"][1]
                .get("slotId")
                .is_none()
        );
    }
}

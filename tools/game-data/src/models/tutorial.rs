use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use trox::LocalizedString;

use anyhow::{Context, Result, ensure};
use indexmap::IndexMap;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::{localized_source, source_text};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialCatalog {
    pub default_maximum_width_pixels: u32,
    pub scripted_tutorial_sequence: Vec<TutorialActionDefinition>,
    pub battle: TutorialBattleConfiguration,
    pub journey_guidance: TutorialJourneyGuidance,
    pub triggers: Vec<TutorialTriggerDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialJourneyGuidance {
    pub journey_start: TutorialSpeechBubble,
    pub dreamscape: TutorialSpeechBubble,
    pub atlas: TutorialSpeechBubble,
    pub draft: TutorialSpeechBubble,
    pub purge: TutorialSpeechBubble,
    pub dreamsign_revelation: TutorialSpeechBubble,
    pub first_battle: TutorialSpeechBubble,
    pub second_battle: TutorialSpeechBubble,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialSpeechBubble {
    #[serde(default, skip_serializing_if = "is_mira")]
    pub speaker: TutorialSpeaker,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub delay_seconds: Scalar,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<Scalar>,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub horizontal_offset_pixels: Scalar,
    #[serde(default, skip_serializing_if = "Scalar::is_zero")]
    pub vertical_offset_pixels: Scalar,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum_width_pixels: Option<u32>,
    pub text: LocalizedString,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialSpeaker {
    #[default]
    Mira,
    Player,
    Enemy,
}

fn is_mira(value: &TutorialSpeaker) -> bool {
    *value == TutorialSpeaker::Mira
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
pub struct TutorialBattleConfiguration {
    pub player_avatar_id: EntityId,
    pub enemy_avatar_id: EntityId,
    pub starting_energy: u32,
    pub score_to_win: u32,
    #[serde(deserialize_with = "super::card_counts::deserialize")]
    pub starter_deck: IndexMap<EntityId, u32>,
    pub forced_player_draws: Vec<EntityId>,
    pub forced_enemy_draws: Vec<EntityId>,
    /// Complete shared Dreamwell prefix, including pre-handoff scripted draws.
    pub dreamwell_draws: Vec<EntityId>,
    pub tutorial_card_constants: TutorialCardConstants,
    pub handoff: TutorialBattleHandoff,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ai_action_overrides: Vec<TutorialAiActionOverride>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialCardConstants {
    pub tutorial_player_character_card_id: EntityId,
    pub tutorial_opponent_character_card_id: EntityId,
    pub loading_screen_character_card_id: EntityId,
    pub loading_screen_event_card_id: EntityId,
    pub handoff_enemy_character_card_id: EntityId,
    pub tutorial_dreamwell_card_id: EntityId,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialBattleHandoff {
    pub active_side: TutorialSide,
    pub turn_number: u32,
    pub phase: TutorialBattlePhase,
    pub dreamwell_deck_index: u32,
    pub player: TutorialHandoffSide,
    pub enemy: TutorialHandoffSide,
    pub card_placements: Vec<TutorialHandoffPlacement>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialHandoffSide {
    pub current_energy: u32,
    pub maximum_energy: u32,
    pub score: u32,
    pub dreamwell_card_index: u32,
    pub dreamwell_drawn_turn: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum TutorialHandoffPlacement {
    Rank {
        card: TutorialScriptedCardRole,
        side: TutorialSide,
        source: TutorialPlacementSource,
        slot: TutorialRankSlot,
    },
    Void {
        card: TutorialScriptedCardRole,
        side: TutorialSide,
        source: TutorialPlacementSource,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialScriptedCardRole {
    TutorialPlayerCharacter,
    TutorialOpponentCharacter,
    HandoffEnemyCharacter,
    LoadingScreenEvent,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialSide {
    Player,
    Enemy,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialPlacementSource {
    Deck,
    Created,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialRankSlot {
    Front(u32),
    Back(u32),
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialBattlePhase {
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
pub struct TutorialAiActionOverride {
    pub id: EntityId,
    pub trigger: TutorialAiTrigger,
    pub action: TutorialAiAction,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum TutorialAiTrigger {
    AfterEnemyDreamwell { card_id: EntityId },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum TutorialAiAction {
    PlayCard { card_id: EntityId },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialActionDefinition {
    pub id: EntityId,
    pub wait_seconds: Scalar,
    pub behavior: TutorialAction,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub enum TutorialAction {
    DisplaySpeechBubble {
        speech_bubble: TutorialSpeechBubble,
    },
    DisplayHowToPlay {
        trigger: TutorialHowToPlayTrigger,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        companion: Option<TutorialHowToPlayCompanion>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        card_width_pixels: Option<u32>,
        text: LocalizedString,
    },
    AnimateAvatarPortrait {
        owner: TutorialSide,
        pause_seconds: Scalar,
        duration_seconds: Scalar,
    },
    DrawCard {
        owner: TutorialSide,
        card_id: EntityId,
        reason: TutorialCardDrawReason,
    },
    DrawOpponentCard {
        card_id: EntityId,
    },
    RevealAndPlayOpponentCard {
        card_id: EntityId,
        reveal_duration_seconds: Scalar,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        speech_bubble: Option<TutorialSpeechBubble>,
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
        owner: TutorialSide,
        card_id: EntityId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reveal_duration_seconds: Option<Scalar>,
    },
    EndTurn {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        speech_bubble: Option<TutorialSpeechBubble>,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialHowToPlayTrigger {
    Immediate,
    PlayerTurnAnnouncementComplete,
    EnemyTurnAnnouncementComplete,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialHowToPlayCompanion {
    DreamwellCard,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum TutorialCardDrawReason {
    DreamwellEffect,
    TurnDraw,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TutorialTriggerDefinition {
    pub id: EntityId,
    pub on: Vec<TutorialTriggerEvent>,
    pub priority: Scalar,
    #[serde(default, skip_serializing_if = "IndexMap::is_empty")]
    pub delay_seconds: IndexMap<TutorialTriggerEvent, Scalar>,
    pub duration_seconds: Scalar,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maximum_width_pixels: Option<u32>,
    pub matcher: TutorialTriggerMatcher,
    pub text: LocalizedString,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum TutorialTriggerEvent {
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
pub enum TutorialTriggerMatcher {
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
    validate_width(source.default_maximum_width_pixels)?;
    let mut entity_ids = BTreeSet::new();
    for action in &source.scripted_tutorial_sequence {
        ensure!(
            entity_ids.insert(action.id),
            "duplicate Tutorial entity id {}",
            action.id
        );
        validate_nonnegative(action.wait_seconds, "action wait")?;
        validate_action(action, source.default_maximum_width_pixels)?;
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
        validate_width(
            trigger
                .maximum_width_pixels
                .unwrap_or(source.default_maximum_width_pixels),
        )?;
        validate_text(&source_text(&trigger.text)?, "trigger text")?;
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
        if let TutorialTriggerMatcher::Any = trigger.matcher {
            ensure!(
                trigger.on.len() == 1
                    && matches!(
                        trigger.on[0],
                        TutorialTriggerEvent::ChallengeResolved
                            | TutorialTriggerEvent::FigmentCreated
                            | TutorialTriggerEvent::OpponentRepositionOpportunity
                            | TutorialTriggerEvent::PlayerNightPhase
                            | TutorialTriggerEvent::TransfigurationSeen
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
    validate_guidance(
        &source.journey_guidance,
        source.default_maximum_width_pixels,
    )?;
    Ok(())
}

fn validate_guidance(
    guidance: &TutorialJourneyGuidance,
    default_maximum_width_pixels: u32,
) -> Result<()> {
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
        ensure!(
            bubble.speaker == TutorialSpeaker::Mira,
            "persistent Tutorial guidance must use Mira as its speaker"
        );
        ensure!(
            bubble.duration_seconds.is_none(),
            "persistent Tutorial guidance must not set a duration"
        );
        validate_nonnegative(bubble.delay_seconds, "persistent bubble delay")?;
        validate_finite(
            bubble.horizontal_offset_pixels,
            "persistent bubble horizontal offset",
        )?;
        validate_finite(
            bubble.vertical_offset_pixels,
            "persistent bubble vertical offset",
        )?;
        validate_width(
            bubble
                .maximum_width_pixels
                .unwrap_or(default_maximum_width_pixels),
        )?;
        validate_text(&source_text(&bubble.text)?, "persistent bubble text")?;
    }
    Ok(())
}

fn validate_action(
    action: &TutorialActionDefinition,
    default_maximum_width_pixels: u32,
) -> Result<()> {
    match &action.behavior {
        TutorialAction::DisplaySpeechBubble { speech_bubble } => {
            validate_timed_speech_bubble(speech_bubble, default_maximum_width_pixels)
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
            validate_text(&source_text(text)?, "How to Play text")
        }
        TutorialAction::AnimateAvatarPortrait {
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
                validate_timed_speech_bubble(bubble, default_maximum_width_pixels)?;
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
                validate_timed_speech_bubble(bubble, default_maximum_width_pixels)?;
            }
            Ok(())
        }
        TutorialAction::DrawCard { .. }
        | TutorialAction::DrawOpponentCard { .. }
        | TutorialAction::RepositionOpponentCharacter { .. } => Ok(()),
    }
}

fn validate_timed_speech_bubble(
    bubble: &TutorialSpeechBubble,
    default_maximum_width_pixels: u32,
) -> Result<()> {
    validate_nonnegative(bubble.delay_seconds, "speech bubble delay")?;
    let duration = bubble
        .duration_seconds
        .context("timed Tutorial speech bubbles must set duration_seconds")?;
    validate_nonnegative(duration, "speech bubble duration")?;
    validate_finite(
        bubble.horizontal_offset_pixels,
        "speech bubble horizontal offset",
    )?;
    validate_finite(
        bubble.vertical_offset_pixels,
        "speech bubble vertical offset",
    )?;
    validate_width(
        bubble
            .maximum_width_pixels
            .unwrap_or(default_maximum_width_pixels),
    )?;
    validate_text(&source_text(&bubble.text)?, "speech bubble text")
}

fn validate_battle(battle: &TutorialBattleConfiguration) -> Result<()> {
    ensure!(
        battle.score_to_win > 0,
        "Tutorial score_to_win must be positive"
    );
    ensure!(
        !battle.starter_deck.is_empty(),
        "Tutorial starter deck must not be empty"
    );
    ensure!(
        battle
            .tutorial_card_constants
            .loading_screen_character_card_id
            != battle
                .tutorial_card_constants
                .handoff_enemy_character_card_id,
        "Tutorial loading-screen and handoff enemy characters must use different card UUIDs"
    );
    for copies in battle.starter_deck.values() {
        ensure!(*copies > 0, "Tutorial starter deck copies must be positive");
    }
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
        !battle.handoff.card_placements.is_empty(),
        "Tutorial handoff placements must not be empty"
    );
    for placement in &battle.handoff.card_placements {
        if let TutorialHandoffPlacement::Rank { side, slot, .. } = placement {
            let (rank, index, maximum_index) = match (*side, *slot) {
                (_, TutorialRankSlot::Front(index)) => (0_u8, index, 8),
                (TutorialSide::Player, TutorialRankSlot::Back(index)) => (1, index, 4),
                (TutorialSide::Enemy, TutorialRankSlot::Back(index)) => (1, index, 9),
            };
            ensure!(
                index <= maximum_index,
                "Tutorial handoff rank slot is outside the {side:?} board"
            );
            ensure!(
                occupied.insert((*side as u8, rank, index)),
                "Tutorial handoff repeats a slot"
            );
        }
    }
    for action_override in &battle.ai_action_overrides {
        let TutorialAiTrigger::AfterEnemyDreamwell { card_id } = action_override.trigger;
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
    player_avatar_id: String,
    enemy_avatar_id: String,
    starting_energy: u32,
    score_to_win: u32,
    forced_player_draws: Vec<String>,
    forced_enemy_draws: Vec<String>,
    dreamwell_draws: Vec<String>,
    starter_deck: Vec<CompatibilityStarterDeckEntry>,
    tutorial_card_constants: CompatibilityTutorialCardConstants,
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
struct CompatibilityTutorialCardConstants {
    tutorial_player_character_card_id: String,
    tutorial_opponent_character_card_id: String,
    loading_screen_character_card_id: String,
    loading_screen_event_card_id: String,
    handoff_enemy_character_card_id: String,
    tutorial_dreamwell_card_id: String,
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
    AnimateAvatarPortrait {
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
        let default_maximum_width_pixels = source.default_maximum_width_pixels;
        let TutorialJourneyGuidance {
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
            journey_start: guidance(journey_start, default_maximum_width_pixels)?,
            dreamscape: guidance(dreamscape, default_maximum_width_pixels)?,
            atlas: guidance(atlas, default_maximum_width_pixels)?,
            draft: guidance(draft, default_maximum_width_pixels)?,
            purge: guidance(purge, default_maximum_width_pixels)?,
            dreamsign_revelation: guidance(dreamsign_revelation, default_maximum_width_pixels)?,
            battle_start: CompatibilityBattleStart {
                first_battle: guidance(first_battle, default_maximum_width_pixels)?,
                second_battle: guidance(second_battle, default_maximum_width_pixels)?,
            },
            battle: lower_battle(source.battle)?,
            actions: source
                .scripted_tutorial_sequence
                .into_iter()
                .map(|action| lower_action(action, default_maximum_width_pixels))
                .collect::<Result<_>>()?,
            triggers: source
                .triggers
                .into_iter()
                .map(|trigger| lower_trigger(trigger, default_maximum_width_pixels))
                .collect::<Result<_>>()?,
        })
    }
}

fn guidance(
    value: TutorialSpeechBubble,
    default_maximum_width_pixels: u32,
) -> Result<CompatibilityGuidance> {
    Ok(CompatibilityGuidance {
        speech_bubble: CompatibilityPersistentSpeechBubble {
            speaker: "mira",
            delay: value.delay_seconds,
            horizontal_offset: value.horizontal_offset_pixels,
            vertical_offset: value.vertical_offset_pixels,
            bubble_width: value
                .maximum_width_pixels
                .unwrap_or(default_maximum_width_pixels),
            text: source_text(&value.text)?,
        },
    })
}

fn lower_battle(value: TutorialBattleConfiguration) -> Result<CompatibilityBattle> {
    Ok(CompatibilityBattle {
        player_avatar_id: value.player_avatar_id.to_string(),
        enemy_avatar_id: value.enemy_avatar_id.to_string(),
        starting_energy: value.starting_energy,
        score_to_win: value.score_to_win,
        forced_player_draws: ids(value.forced_player_draws),
        forced_enemy_draws: ids(value.forced_enemy_draws),
        dreamwell_draws: ids(value.dreamwell_draws),
        starter_deck: value
            .starter_deck
            .into_iter()
            .map(|(card_id, copies)| CompatibilityStarterDeckEntry {
                card_id: card_id.to_string(),
                copies,
            })
            .collect(),
        tutorial_card_constants: CompatibilityTutorialCardConstants {
            tutorial_player_character_card_id: value
                .tutorial_card_constants
                .tutorial_player_character_card_id
                .to_string(),
            tutorial_opponent_character_card_id: value
                .tutorial_card_constants
                .tutorial_opponent_character_card_id
                .to_string(),
            loading_screen_character_card_id: value
                .tutorial_card_constants
                .loading_screen_character_card_id
                .to_string(),
            loading_screen_event_card_id: value
                .tutorial_card_constants
                .loading_screen_event_card_id
                .to_string(),
            handoff_enemy_character_card_id: value
                .tutorial_card_constants
                .handoff_enemy_character_card_id
                .to_string(),
            tutorial_dreamwell_card_id: value
                .tutorial_card_constants
                .tutorial_dreamwell_card_id
                .to_string(),
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
                .card_placements
                .into_iter()
                .map(lower_placement)
                .collect(),
        },
        ai_action_overrides: value
            .ai_action_overrides
            .into_iter()
            .map(|entry| {
                let TutorialAiTrigger::AfterEnemyDreamwell {
                    card_id: trigger_card_id,
                } = entry.trigger;
                let TutorialAiAction::PlayCard {
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

fn lower_handoff_side(value: TutorialHandoffSide) -> CompatibilityHandoffSide {
    CompatibilityHandoffSide {
        current_energy: value.current_energy,
        max_energy: value.maximum_energy,
        score: value.score,
        dreamwell_card_index: value.dreamwell_card_index,
        dreamwell_drawn_turn: value.dreamwell_drawn_turn,
    }
}

fn lower_placement(value: TutorialHandoffPlacement) -> CompatibilityPlacement {
    match value {
        TutorialHandoffPlacement::Rank {
            card,
            side: placement_side,
            source,
            slot,
        } => {
            let (zone, prefix, index) = match slot {
                TutorialRankSlot::Front(index) => ("frontRank", 'F', index),
                TutorialRankSlot::Back(index) => ("backRank", 'B', index),
            };
            CompatibilityPlacement {
                card_role: featured_role(card),
                side: side(placement_side),
                source: placement_source(source),
                zone,
                slot_id: Some(format!("{prefix}{index}")),
            }
        }
        TutorialHandoffPlacement::Void {
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

fn lower_action(
    value: TutorialActionDefinition,
    default_maximum_width_pixels: u32,
) -> Result<CompatibilityAction> {
    let behavior = match value.behavior {
        TutorialAction::DisplaySpeechBubble { speech_bubble } => {
            CompatibilityActionBehavior::DisplaySpeechBubble {
                speech_bubble: lower_speech_bubble(speech_bubble, default_maximum_width_pixels)?,
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
            text: source_text(&text)?,
        },
        TutorialAction::AnimateAvatarPortrait {
            owner,
            pause_seconds,
            duration_seconds,
        } => CompatibilityActionBehavior::AnimateAvatarPortrait {
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
            speech_bubble: speech_bubble
                .map(|bubble| lower_speech_bubble(bubble, default_maximum_width_pixels))
                .transpose()?,
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
            speech_bubble: speech_bubble
                .map(|bubble| lower_speech_bubble(bubble, default_maximum_width_pixels))
                .transpose()?,
        },
    };
    Ok(CompatibilityAction {
        id: compatibility_id(value.id, ACTION_IDS)?,
        behavior,
        wait: value.wait_seconds,
    })
}

fn lower_speech_bubble(
    value: TutorialSpeechBubble,
    default_maximum_width_pixels: u32,
) -> Result<CompatibilitySpeechBubble> {
    Ok(CompatibilitySpeechBubble {
        speaker: speaker(value.speaker).into(),
        delay: value.delay_seconds,
        duration: value
            .duration_seconds
            .context("timed Tutorial speech bubbles must set duration_seconds")?,
        horizontal_offset: value.horizontal_offset_pixels,
        vertical_offset: value.vertical_offset_pixels,
        bubble_width: value
            .maximum_width_pixels
            .unwrap_or(default_maximum_width_pixels),
        text: source_text(&value.text)?,
    })
}

fn lower_trigger(
    value: TutorialTriggerDefinition,
    default_maximum_width_pixels: u32,
) -> Result<CompatibilityTrigger> {
    let matcher = match value.matcher {
        TutorialTriggerMatcher::Glossary { glossary_id } => CompatibilityMatcher::Glossary {
            id: glossary_id.to_string(),
        },
        TutorialTriggerMatcher::EventCard => CompatibilityMatcher::CardType { card_type: "event" },
        TutorialTriggerMatcher::Card { card_id } => CompatibilityMatcher::CardId {
            card_id: card_id.to_string(),
        },
        TutorialTriggerMatcher::Any => CompatibilityMatcher::Any,
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
        bubble_width: value
            .maximum_width_pixels
            .unwrap_or(default_maximum_width_pixels),
        matcher,
        text: source_text(&value.text)?,
    })
}

fn ids(values: Vec<EntityId>) -> Vec<String> {
    values.into_iter().map(|id| id.to_string()).collect()
}
fn speaker(value: TutorialSpeaker) -> &'static str {
    match value {
        TutorialSpeaker::Mira => "mira",
        TutorialSpeaker::Player => "player",
        TutorialSpeaker::Enemy => "enemy",
    }
}
fn side(value: TutorialSide) -> &'static str {
    match value {
        TutorialSide::Player => "player",
        TutorialSide::Enemy => "enemy",
    }
}
fn featured_role(value: TutorialScriptedCardRole) -> &'static str {
    match value {
        TutorialScriptedCardRole::TutorialPlayerCharacter => "tutorialPlayerCharacter",
        TutorialScriptedCardRole::TutorialOpponentCharacter => "tutorialOpponentCharacter",
        TutorialScriptedCardRole::HandoffEnemyCharacter => "handoffEnemyCharacter",
        TutorialScriptedCardRole::LoadingScreenEvent => "loadingScreenEvent",
    }
}
fn placement_source(value: TutorialPlacementSource) -> &'static str {
    match value {
        TutorialPlacementSource::Deck => "deck",
        TutorialPlacementSource::Created => "created",
    }
}
fn phase(value: TutorialBattlePhase) -> &'static str {
    match value {
        TutorialBattlePhase::Dreamwell => "dreamwell",
        TutorialBattlePhase::Draw => "draw",
        TutorialBattlePhase::Dawn => "dawn",
        TutorialBattlePhase::Day => "day",
        TutorialBattlePhase::Dusk => "dusk",
        TutorialBattlePhase::Night => "night",
        TutorialBattlePhase::Challenge => "challenge",
        TutorialBattlePhase::Ending => "ending",
    }
}
fn how_to_play_trigger(value: TutorialHowToPlayTrigger) -> &'static str {
    match value {
        TutorialHowToPlayTrigger::Immediate => "immediate",
        TutorialHowToPlayTrigger::PlayerTurnAnnouncementComplete => {
            "player-turn-announcement-complete"
        }
        TutorialHowToPlayTrigger::EnemyTurnAnnouncementComplete => {
            "enemy-turn-announcement-complete"
        }
    }
}
fn draw_reason(value: TutorialCardDrawReason) -> &'static str {
    match value {
        TutorialCardDrawReason::DreamwellEffect => "dreamwell-effect",
        TutorialCardDrawReason::TurnDraw => "turn-draw",
    }
}
fn trigger_event(value: TutorialTriggerEvent) -> &'static str {
    match value {
        TutorialTriggerEvent::CardSeen => "card-seen",
        TutorialTriggerEvent::CardPlay => "card-play",
        TutorialTriggerEvent::CardNoValidTargets => "card-no-valid-targets",
        TutorialTriggerEvent::ChallengeResolved => "challenge-resolved",
        TutorialTriggerEvent::DreamwellResolve => "dreamwell-resolve",
        TutorialTriggerEvent::FigmentCreated => "figment-created",
        TutorialTriggerEvent::OpponentRepositionOpportunity => "opponent-reposition-opportunity",
        TutorialTriggerEvent::PlayerNightPhase => "player-night-phase",
        TutorialTriggerEvent::TransfigurationSeen => "transfiguration-seen",
    }
}

fn compatibility_id(id: EntityId, _mapping: &[(&str, &str)]) -> Result<String> {
    Ok(id.to_string())
}

pub(crate) fn actions_from_compatibility_json(
    value: serde_json::Value,
) -> Result<Vec<TutorialActionDefinition>> {
    let actions: Vec<CompatibilityAction> = serde_json::from_value(value)
        .context("Tutorial actions must match the compatibility action schema")?;
    actions
        .into_iter()
        .map(TutorialActionDefinition::try_from)
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TutorialSpeechBubbleOwner {
    Display,
    RevealAndPlayOpponentCard,
    EndTurn,
}

fn action_speech_bubble(
    action: &TutorialActionDefinition,
) -> Option<(TutorialSpeechBubbleOwner, &TutorialSpeechBubble)> {
    match &action.behavior {
        TutorialAction::DisplaySpeechBubble { speech_bubble } => {
            Some((TutorialSpeechBubbleOwner::Display, speech_bubble))
        }
        TutorialAction::RevealAndPlayOpponentCard {
            speech_bubble: Some(speech_bubble),
            ..
        } => Some((
            TutorialSpeechBubbleOwner::RevealAndPlayOpponentCard,
            speech_bubble,
        )),
        TutorialAction::EndTurn {
            speech_bubble: Some(speech_bubble),
        } => Some((TutorialSpeechBubbleOwner::EndTurn, speech_bubble)),
        _ => None,
    }
}

fn action_speech_bubble_mut(
    action: &mut TutorialActionDefinition,
) -> Option<(TutorialSpeechBubbleOwner, &mut TutorialSpeechBubble)> {
    match &mut action.behavior {
        TutorialAction::DisplaySpeechBubble { speech_bubble } => {
            Some((TutorialSpeechBubbleOwner::Display, speech_bubble))
        }
        TutorialAction::RevealAndPlayOpponentCard {
            speech_bubble: Some(speech_bubble),
            ..
        } => Some((
            TutorialSpeechBubbleOwner::RevealAndPlayOpponentCard,
            speech_bubble,
        )),
        TutorialAction::EndTurn {
            speech_bubble: Some(speech_bubble),
        } => Some((TutorialSpeechBubbleOwner::EndTurn, speech_bubble)),
        _ => None,
    }
}

pub(crate) fn preserve_default_bubble_width_omissions(
    before: &[TutorialActionDefinition],
    after: &mut [TutorialActionDefinition],
    default_maximum_width_pixels: u32,
) {
    for edited_action in after {
        let edited_id = edited_action.id;
        let Some((edited_owner, edited_bubble)) = action_speech_bubble_mut(edited_action) else {
            continue;
        };
        if edited_bubble.maximum_width_pixels != Some(default_maximum_width_pixels) {
            continue;
        }
        let width_was_explicit = before
            .iter()
            .find(|action| action.id == edited_id)
            .and_then(action_speech_bubble)
            .is_some_and(|(owner, bubble)| {
                owner == edited_owner && bubble.maximum_width_pixels.is_some()
            });
        if !width_was_explicit {
            edited_bubble.maximum_width_pixels = None;
        }
    }
}

fn entity_id_from_compatibility(value: &str, mapping: &[(&str, &str)]) -> Result<EntityId> {
    let canonical = mapping
        .iter()
        .find_map(|(legacy, uuid)| (*legacy == value).then_some(*uuid))
        .unwrap_or(value);
    EntityId::parse(canonical).map_err(anyhow::Error::msg)
}

impl TryFrom<CompatibilityAction> for TutorialActionDefinition {
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
                    "immediate" => TutorialHowToPlayTrigger::Immediate,
                    "player-turn-announcement-complete" => {
                        TutorialHowToPlayTrigger::PlayerTurnAnnouncementComplete
                    }
                    "enemy-turn-announcement-complete" => {
                        TutorialHowToPlayTrigger::EnemyTurnAnnouncementComplete
                    }
                    _ => anyhow::bail!("unsupported How to Play trigger {trigger}"),
                },
                companion: match companion.as_deref() {
                    None => None,
                    Some("dreamwell-card") => Some(TutorialHowToPlayCompanion::DreamwellCard),
                    Some(other) => anyhow::bail!("unsupported How to Play companion {other}"),
                },
                card_width_pixels: card_width,
                text: localized_source(text)?,
            },
            CompatibilityActionBehavior::AnimateAvatarPortrait {
                owner,
                pause,
                duration,
            } => TutorialAction::AnimateAvatarPortrait {
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
                    "dreamwell-effect" => TutorialCardDrawReason::DreamwellEffect,
                    "turn-draw" => TutorialCardDrawReason::TurnDraw,
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
        validate_action(&action, 500)?;
        Ok(action)
    }
}

impl TryFrom<CompatibilitySpeechBubble> for TutorialSpeechBubble {
    type Error = anyhow::Error;

    fn try_from(value: CompatibilitySpeechBubble) -> Result<Self> {
        Ok(Self {
            speaker: match value.speaker.as_str() {
                "mira" => TutorialSpeaker::Mira,
                "player" => TutorialSpeaker::Player,
                "enemy" => TutorialSpeaker::Enemy,
                other => anyhow::bail!("unsupported speech bubble speaker {other}"),
            },
            delay_seconds: value.delay,
            duration_seconds: Some(value.duration),
            horizontal_offset_pixels: value.horizontal_offset,
            vertical_offset_pixels: value.vertical_offset,
            maximum_width_pixels: Some(value.bubble_width),
            text: localized_source(value.text)?,
        })
    }
}

fn parse_side(value: &str) -> Result<TutorialSide> {
    match value {
        "player" => Ok(TutorialSide::Player),
        "enemy" => Ok(TutorialSide::Enemy),
        _ => anyhow::bail!("unsupported Tutorial side {value}"),
    }
}

const ACTION_IDS: &[(&str, &str)] = &[
    ("welcome", "3f7f1086-8a50-4bc9-a7d2-6bf68fde992f"),
    ("avatar-arrival", "c06dbc13-a48c-499e-83b3-b24e555ed008"),
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

    fn ls(text: impl Into<String>) -> LocalizedString {
        super::super::localization::localized_source(text.into()).unwrap()
    }

    fn entity(value: &str) -> EntityId {
        EntityId::parse(value).unwrap()
    }

    fn mapped_id(mapping: &[(&str, &str)], index: usize) -> EntityId {
        entity(mapping[index].1)
    }

    fn bubble(text: &str) -> TutorialSpeechBubble {
        TutorialSpeechBubble {
            speaker: TutorialSpeaker::Mira,
            delay_seconds: Scalar::Integer(0),
            duration_seconds: Some(Scalar::Float(2.5)),
            horizontal_offset_pixels: Scalar::Integer(0),
            vertical_offset_pixels: Scalar::Integer(-7),
            maximum_width_pixels: Some(444),
            text: ls(text),
        }
    }

    fn synthetic_catalog() -> TutorialCatalog {
        let persistent = TutorialSpeechBubble {
            speaker: TutorialSpeaker::Mira,
            delay_seconds: Scalar::Float(1.25),
            duration_seconds: None,
            horizontal_offset_pixels: Scalar::Integer(-12),
            vertical_offset_pixels: Scalar::Integer(8),
            maximum_width_pixels: Some(456),
            text: ls("Persistent Unicode ✦"),
        };
        let actions = vec![
            TutorialAction::DisplaySpeechBubble {
                speech_bubble: bubble("Line one\nline two"),
            },
            TutorialAction::DisplayHowToPlay {
                trigger: TutorialHowToPlayTrigger::EnemyTurnAnnouncementComplete,
                companion: Some(TutorialHowToPlayCompanion::DreamwellCard),
                card_width_pixels: Some(480),
                text: ls("How to play"),
            },
            TutorialAction::AnimateAvatarPortrait {
                owner: TutorialSide::Enemy,
                pause_seconds: Scalar::Integer(1),
                duration_seconds: Scalar::Float(0.75),
            },
            TutorialAction::DrawCard {
                owner: TutorialSide::Player,
                card_id: entity("00000000-0000-4000-8000-000000000101"),
                reason: TutorialCardDrawReason::TurnDraw,
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
                owner: TutorialSide::Enemy,
                card_id: entity("00000000-0000-4000-8000-000000000201"),
                reveal_duration_seconds: None,
            },
            TutorialAction::EndTurn {
                speech_bubble: None,
            },
        ]
        .into_iter()
        .enumerate()
        .map(|(index, behavior)| TutorialActionDefinition {
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
            default_maximum_width_pixels: 500,
            journey_guidance: TutorialJourneyGuidance {
                journey_start: persistent.clone(),
                dreamscape: persistent.clone(),
                atlas: persistent.clone(),
                draft: persistent.clone(),
                purge: persistent.clone(),
                dreamsign_revelation: persistent.clone(),
                first_battle: persistent.clone(),
                second_battle: persistent,
            },
            battle: TutorialBattleConfiguration {
                player_avatar_id: entity("00000000-0000-4000-8000-000000000301"),
                enemy_avatar_id: entity("00000000-0000-4000-8000-000000000302"),
                starting_energy: 7,
                score_to_win: 19,
                starter_deck: IndexMap::from_iter([(
                    entity("00000000-0000-4000-8000-000000000101"),
                    2,
                )]),
                forced_player_draws: vec![],
                forced_enemy_draws: vec![entity("00000000-0000-4000-8000-000000000102")],
                dreamwell_draws: vec![entity("00000000-0000-4000-8000-000000000201")],
                tutorial_card_constants: TutorialCardConstants {
                    tutorial_player_character_card_id: entity(
                        "00000000-0000-4000-8000-000000000101",
                    ),
                    tutorial_opponent_character_card_id: entity(
                        "00000000-0000-4000-8000-000000000102",
                    ),
                    loading_screen_character_card_id: entity(
                        "00000000-0000-4000-8000-000000000105",
                    ),
                    loading_screen_event_card_id: entity("00000000-0000-4000-8000-000000000104"),
                    handoff_enemy_character_card_id: entity("00000000-0000-4000-8000-000000000103"),
                    tutorial_dreamwell_card_id: entity("00000000-0000-4000-8000-000000000201"),
                },
                handoff: TutorialBattleHandoff {
                    active_side: TutorialSide::Enemy,
                    turn_number: 3,
                    phase: TutorialBattlePhase::Night,
                    dreamwell_deck_index: 1,
                    player: TutorialHandoffSide {
                        current_energy: 3,
                        maximum_energy: 4,
                        score: 5,
                        dreamwell_card_index: 0,
                        dreamwell_drawn_turn: 2,
                    },
                    enemy: TutorialHandoffSide {
                        current_energy: 2,
                        maximum_energy: 2,
                        score: 6,
                        dreamwell_card_index: 0,
                        dreamwell_drawn_turn: 2,
                    },
                    card_placements: vec![
                        TutorialHandoffPlacement::Rank {
                            card: TutorialScriptedCardRole::LoadingScreenEvent,
                            side: TutorialSide::Player,
                            source: TutorialPlacementSource::Deck,
                            slot: TutorialRankSlot::Back(1),
                        },
                        TutorialHandoffPlacement::Void {
                            card: TutorialScriptedCardRole::TutorialOpponentCharacter,
                            side: TutorialSide::Enemy,
                            source: TutorialPlacementSource::Created,
                        },
                    ],
                },
                ai_action_overrides: vec![TutorialAiActionOverride {
                    id: mapped_id(AI_OVERRIDE_IDS, 0),
                    trigger: TutorialAiTrigger::AfterEnemyDreamwell {
                        card_id: entity("00000000-0000-4000-8000-000000000201"),
                    },
                    action: TutorialAiAction::PlayCard {
                        card_id: entity("00000000-0000-4000-8000-000000000102"),
                    },
                }],
            },
            scripted_tutorial_sequence: actions,
            triggers: vec![
                TutorialTriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 0),
                    on: vec![
                        TutorialTriggerEvent::CardSeen,
                        TutorialTriggerEvent::CardPlay,
                        TutorialTriggerEvent::CardNoValidTargets,
                        TutorialTriggerEvent::DreamwellResolve,
                    ],
                    priority: Scalar::Float(7.5),
                    delay_seconds: [(TutorialTriggerEvent::CardSeen, Scalar::Float(0.25))]
                        .into_iter()
                        .collect(),
                    duration_seconds: Scalar::Integer(3),
                    maximum_width_pixels: None,
                    matcher: TutorialTriggerMatcher::Glossary {
                        glossary_id: mapped_id(GLOSSARY_IDS, 0),
                    },
                    text: ls("Glossary"),
                },
                TutorialTriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 1),
                    on: vec![TutorialTriggerEvent::ChallengeResolved],
                    priority: Scalar::Integer(2),
                    delay_seconds: IndexMap::new(),
                    duration_seconds: Scalar::Integer(4),
                    maximum_width_pixels: Some(501),
                    matcher: TutorialTriggerMatcher::EventCard,
                    text: ls("Card type"),
                },
                TutorialTriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 2),
                    on: vec![TutorialTriggerEvent::PlayerNightPhase],
                    priority: Scalar::Integer(3),
                    delay_seconds: IndexMap::new(),
                    duration_seconds: Scalar::Integer(5),
                    maximum_width_pixels: Some(502),
                    matcher: TutorialTriggerMatcher::Card {
                        card_id: entity("00000000-0000-4000-8000-000000000101"),
                    },
                    text: ls("Card"),
                },
                TutorialTriggerDefinition {
                    id: mapped_id(TRIGGER_IDS, 3),
                    on: vec![TutorialTriggerEvent::FigmentCreated],
                    priority: Scalar::Integer(4),
                    delay_seconds: IndexMap::new(),
                    duration_seconds: Scalar::Integer(6),
                    maximum_width_pixels: Some(503),
                    matcher: TutorialTriggerMatcher::Any,
                    text: ls("Any"),
                },
            ],
        }
    }

    #[test]
    fn rejects_unknown_fields_and_non_uuidv4_identity() {
        let unknown = r#"TutorialCatalog(default_maximum_width_pixels: 500, journey_guidance: TutorialJourneyGuidance(journey_start: TutorialSpeechBubble(text: \"x\"), dreamscape: TutorialSpeechBubble(text: \"x\"), atlas: TutorialSpeechBubble(text: \"x\"), draft: TutorialSpeechBubble(text: \"x\"), purge: TutorialSpeechBubble(text: \"x\"), dreamsign_revelation: TutorialSpeechBubble(text: \"x\"), first_battle: TutorialSpeechBubble(text: \"x\"), second_battle: TutorialSpeechBubble(text: \"x\"), surprise: true), battle: ( ))"#;
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
        assert_eq!(
            [TutorialSide::Player, TutorialSide::Enemy].map(side),
            ["player", "enemy"]
        );
        assert_eq!(
            [
                TutorialHowToPlayTrigger::Immediate,
                TutorialHowToPlayTrigger::PlayerTurnAnnouncementComplete,
                TutorialHowToPlayTrigger::EnemyTurnAnnouncementComplete
            ]
            .map(how_to_play_trigger),
            [
                "immediate",
                "player-turn-announcement-complete",
                "enemy-turn-announcement-complete"
            ]
        );
        assert_eq!(
            [
                TutorialCardDrawReason::DreamwellEffect,
                TutorialCardDrawReason::TurnDraw
            ]
            .map(draw_reason),
            ["dreamwell-effect", "turn-draw"]
        );
        assert_eq!(
            [
                TutorialBattlePhase::Dreamwell,
                TutorialBattlePhase::Draw,
                TutorialBattlePhase::Dawn,
                TutorialBattlePhase::Day,
                TutorialBattlePhase::Dusk,
                TutorialBattlePhase::Night,
                TutorialBattlePhase::Challenge,
                TutorialBattlePhase::Ending,
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
            [
                TutorialSpeaker::Mira,
                TutorialSpeaker::Player,
                TutorialSpeaker::Enemy
            ]
            .map(speaker),
            ["mira", "player", "enemy"]
        );
        assert_eq!(
            [
                TutorialTriggerEvent::CardSeen,
                TutorialTriggerEvent::CardPlay,
                TutorialTriggerEvent::CardNoValidTargets,
                TutorialTriggerEvent::ChallengeResolved,
                TutorialTriggerEvent::DreamwellResolve,
                TutorialTriggerEvent::FigmentCreated,
                TutorialTriggerEvent::OpponentRepositionOpportunity,
                TutorialTriggerEvent::PlayerNightPhase,
                TutorialTriggerEvent::TransfigurationSeen,
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
        duplicate.scripted_tutorial_sequence[1].id = duplicate.scripted_tutorial_sequence[0].id;
        assert!(
            lower(duplicate)
                .unwrap_err()
                .to_string()
                .contains("duplicate")
        );

        let mut invalid_reference = synthetic_catalog();
        invalid_reference.battle.ai_action_overrides[0].trigger =
            TutorialAiTrigger::AfterEnemyDreamwell {
                card_id: entity("00000000-0000-4000-8000-000000000299"),
            };
        assert!(
            lower(invalid_reference)
                .unwrap_err()
                .to_string()
                .contains("outside the draw list")
        );

        let mut reused_loading_character = synthetic_catalog();
        reused_loading_character
            .battle
            .tutorial_card_constants
            .loading_screen_character_card_id = reused_loading_character
            .battle
            .tutorial_card_constants
            .handoff_enemy_character_card_id;
        assert!(
            lower(reused_loading_character)
                .unwrap_err()
                .to_string()
                .contains("loading-screen and handoff enemy characters")
        );
    }

    #[test]
    fn tutorial_editor_preserves_inherited_widths_and_explicit_width_edits() {
        let mut before = synthetic_catalog().scripted_tutorial_sequence;
        let TutorialAction::DisplaySpeechBubble { speech_bubble } = &mut before[0].behavior else {
            panic!("synthetic first action must be a speech bubble");
        };
        speech_bubble.maximum_width_pixels = None;

        let edited_json = serde_json::json!([{
            "id": "welcome",
            "action": "display-speech-bubble",
            "speechBubble": {
                "speaker": "mira",
                "duration": 2.5,
                "horizontalOffset": 0,
                "verticalOffset": -7,
                "bubbleWidth": 500,
                "text": "Edited"
            },
            "wait": 0.5
        }]);
        let mut inherited_edit = actions_from_compatibility_json(edited_json.clone()).unwrap();
        preserve_default_bubble_width_omissions(&before, &mut inherited_edit, 500);
        assert_eq!(
            action_speech_bubble(&inherited_edit[0])
                .unwrap()
                .1
                .maximum_width_pixels,
            None
        );

        let TutorialAction::DisplaySpeechBubble { speech_bubble } = &mut before[0].behavior else {
            unreachable!();
        };
        speech_bubble.maximum_width_pixels = Some(444);
        let mut explicit_edit = actions_from_compatibility_json(edited_json).unwrap();
        preserve_default_bubble_width_omissions(&before, &mut explicit_edit, 500);
        assert_eq!(
            action_speech_bubble(&explicit_edit[0])
                .unwrap()
                .1
                .maximum_width_pixels,
            Some(500)
        );
    }

    #[test]
    fn lowers_every_action_and_matcher_variant_with_exact_compatibility_keys() {
        let mut catalog = synthetic_catalog();
        let TutorialAction::DisplaySpeechBubble { speech_bubble } =
            &mut catalog.scripted_tutorial_sequence[0].behavior
        else {
            panic!("synthetic first action must be a speech bubble");
        };
        speech_bubble.maximum_width_pixels = None;
        let lowered = lower(catalog).unwrap();
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
                "animate-avatar-portrait",
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
        assert_eq!(
            actions[0]["speechBubble"]["bubbleWidth"].as_integer(),
            Some(500)
        );
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
        assert_eq!(triggers[0]["bubbleWidth"].as_integer(), Some(500));
        assert!(
            lowered["battle"]["forcedPlayerDraws"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            lowered["battle"]["handoff"]["placements"][0]["zone"].as_str(),
            Some("backRank")
        );
        assert_eq!(
            lowered["battle"]["handoff"]["placements"][0]["slotId"].as_str(),
            Some("B1")
        );
        assert!(lowered["battle"].get("scriptedBoard").is_none());
        assert!(
            lowered["battle"]["handoff"]["placements"][1]
                .get("slotId")
                .is_none()
        );
    }
}

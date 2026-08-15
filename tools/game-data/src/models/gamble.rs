use std::collections::BTreeSet;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GambleCatalog {
    pub games: Vec<GambleGameDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GambleGameDefinition {
    pub id: GambleGameId,
    pub selection: GambleSelection,
    pub economy: GambleEconomy,
    pub rules: GambleGameRules,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
pub enum GambleGameId {
    GravokThreeGateWager,
    TidemarkLadderClimb,
    StarwayStairs,
    FourSuitReprise,
    Blackjack,
}

#[cfg(test)]
impl GambleGameId {
    const ALL: [Self; 5] = [
        Self::GravokThreeGateWager,
        Self::TidemarkLadderClimb,
        Self::StarwayStairs,
        Self::FourSuitReprise,
        Self::Blackjack,
    ];
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GambleSelection {
    pub weight: f64,
}

const FALLBACK_GAME_ID: GambleGameId = GambleGameId::GravokThreeGateWager;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum GambleEconomy {
    ThreeGate {
        standard_wager: u32,
        enhanced_wager: u32,
        rewards: Vec<GateReward>,
    },
    LadderClimb {
        win_essence: u32,
        attempts: Vec<AttemptPrice>,
    },
    StarwayStairs {
        standard_wager: u32,
        enhanced_wager: u32,
        rewards: Vec<TierReward>,
    },
    FourSuitReprise {
        standard_draw_price: u32,
        enhanced_draw_price: u32,
        essence_reward: u32,
    },
    Blackjack {
        standard_wager: u32,
        enhanced_wager: u32,
        prize_essence: u32,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GateReward {
    pub gate: GateId,
    pub essence: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AttemptPrice {
    pub attempt: u32,
    pub standard_cost: u32,
    pub enhanced_cost: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TierReward {
    pub tier: u32,
    pub essence: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum GambleGameRules {
    ThreeGate {
        standard_deck_size: u32,
        max_retries: u32,
        gates: Vec<GateDefinition>,
    },
    LadderClimb {
        standard_deck_size: u32,
        strong_pool_limit: u32,
        attempts: Vec<LadderAttempt>,
    },
    StarwayStairs {
        standard_deck_size: u32,
        max_retries: u32,
        tiers: Vec<StarwayTier>,
    },
    FourSuitReprise {
        standard_deck_size: u32,
        max_rounds: u32,
        matching_suit_card_count: u32,
        outcomes: Vec<SuitOutcome>,
    },
    Blackjack {
        standard_deck_size: u32,
        max_attempts: u32,
        target: u32,
        dealer_stand_threshold: u32,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GateDefinition {
    pub gate: GateId,
    pub threshold: CardRank,
    pub winning_card_count: u32,
    pub awards_dreamsign: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum GateId {
    Six,
    Nine,
    Jack,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LadderAttempt {
    pub attempt: u32,
    pub threshold: CardRank,
    pub winning_card_count: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StarwayTier {
    pub tier: u32,
    pub highest_bust_rank: CardRank,
    pub bust_card_count: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SuitOutcome {
    pub suit: CardSuit,
    pub outcome: FourSuitOutcome,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum CardRank {
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
    Ace,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum CardSuit {
    Spades,
    Diamonds,
    Hearts,
    Clubs,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Ord, PartialOrd)]
#[serde(rename_all = "kebab-case")]
pub enum FourSuitOutcome {
    Transfiguration,
    Essence,
    Duplication,
    Purge,
}

pub fn lower(source: GambleCatalog) -> Result<toml::Value> {
    validate(&source)?;
    Ok(toml::Value::try_from(source)?)
}

pub(crate) fn validate(source: &GambleCatalog) -> Result<()> {
    let ids = source
        .games
        .iter()
        .map(|game| game.id)
        .collect::<BTreeSet<_>>();
    ensure!(
        !source.games.is_empty() && ids.len() == source.games.len(),
        "gamble.games must contain at least one game and must not repeat stable ids"
    );
    ensure!(
        ids.contains(&FALLBACK_GAME_ID),
        "gamble.games must include GravokThreeGateWager"
    );
    for (index, game) in source.games.iter().enumerate() {
        let path = format!("games[{index}]");
        ensure!(
            game.selection.weight.is_finite() && game.selection.weight > 0.0,
            "{path}.selection.weight must be positive and finite"
        );
        validate_variant_pairing(&path, game)?;
        validate_rules(&path, &game.rules)?;
        validate_economy(&path, &game.economy)?;
        validate_rules_economy_alignment(&path, &game.rules, &game.economy)?;
    }
    Ok(())
}

fn validate_variant_pairing(path: &str, game: &GambleGameDefinition) -> Result<()> {
    let valid = matches!(
        (game.id, &game.rules, &game.economy),
        (
            GambleGameId::GravokThreeGateWager,
            GambleGameRules::ThreeGate { .. },
            GambleEconomy::ThreeGate { .. }
        ) | (
            GambleGameId::TidemarkLadderClimb,
            GambleGameRules::LadderClimb { .. },
            GambleEconomy::LadderClimb { .. }
        ) | (
            GambleGameId::StarwayStairs,
            GambleGameRules::StarwayStairs { .. },
            GambleEconomy::StarwayStairs { .. }
        ) | (
            GambleGameId::FourSuitReprise,
            GambleGameRules::FourSuitReprise { .. },
            GambleEconomy::FourSuitReprise { .. }
        ) | (
            GambleGameId::Blackjack,
            GambleGameRules::Blackjack { .. },
            GambleEconomy::Blackjack { .. }
        )
    );
    ensure!(
        valid,
        "{path} has a rules/economy variant that does not match its stable game id"
    );
    Ok(())
}

fn validate_rules(path: &str, rules: &GambleGameRules) -> Result<()> {
    match rules {
        GambleGameRules::ThreeGate {
            standard_deck_size,
            max_retries: _,
            gates,
        } => {
            ensure!(
                *standard_deck_size > 0,
                "{path}.rules.standard_deck_size must be positive"
            );
            ensure!(
                gates.iter().map(|gate| gate.gate).collect::<Vec<_>>()
                    == [GateId::Six, GateId::Nine, GateId::Jack],
                "{path}.rules.gates must contain six, nine, and jack in order"
            );
            let counts = gates
                .iter()
                .map(|gate| gate.winning_card_count)
                .collect::<Vec<_>>();
            ensure!(
                counts
                    .iter()
                    .all(|count| *count > 0 && *count <= *standard_deck_size)
                    && counts.windows(2).all(|pair| pair[0] > pair[1]),
                "{path}.rules.gates winning ranges must be reachable and strictly nested"
            );
        }
        GambleGameRules::LadderClimb {
            standard_deck_size,
            strong_pool_limit,
            attempts,
        } => {
            ensure!(
                *standard_deck_size > 0 && *strong_pool_limit > 0,
                "{path}.rules deck and pool sizes must be positive"
            );
            validate_numbered_counts(
                path,
                attempts
                    .iter()
                    .map(|attempt| (attempt.attempt, attempt.winning_card_count)),
                *standard_deck_size,
            )?;
        }
        GambleGameRules::StarwayStairs {
            standard_deck_size,
            tiers,
            ..
        } => {
            ensure!(
                *standard_deck_size > 0,
                "{path}.rules.standard_deck_size must be positive"
            );
            validate_numbered_counts(
                path,
                tiers.iter().map(|tier| (tier.tier, tier.bust_card_count)),
                *standard_deck_size,
            )?;
            ensure!(
                tiers.len() <= 3,
                "{path}.rules.tiers supports between one and three rendered tiers"
            );
        }
        GambleGameRules::FourSuitReprise {
            standard_deck_size,
            max_rounds,
            matching_suit_card_count,
            outcomes,
        } => {
            ensure!(*max_rounds > 0, "{path}.rules.max_rounds must be positive");
            ensure!(
                *matching_suit_card_count > 0
                    && *matching_suit_card_count * 4 == *standard_deck_size,
                "{path}.rules matching suit ranges must partition the deck"
            );
            let expected = BTreeSet::from([
                (CardSuit::Spades, FourSuitOutcome::Transfiguration),
                (CardSuit::Diamonds, FourSuitOutcome::Essence),
                (CardSuit::Hearts, FourSuitOutcome::Duplication),
                (CardSuit::Clubs, FourSuitOutcome::Purge),
            ]);
            ensure!(
                outcomes
                    .iter()
                    .map(|entry| (entry.suit, entry.outcome))
                    .collect::<BTreeSet<_>>()
                    == expected
                    && outcomes.len() == expected.len(),
                "{path}.rules.outcomes must cover every suit and outcome exactly once"
            );
        }
        GambleGameRules::Blackjack {
            standard_deck_size,
            max_attempts,
            target,
            dealer_stand_threshold,
        } => {
            ensure!(
                *standard_deck_size > 0 && *max_attempts > 0,
                "{path}.rules deck size and attempt count must be positive"
            );
            ensure!(
                *dealer_stand_threshold > 0 && *dealer_stand_threshold < *target,
                "{path}.rules.dealer_stand_threshold must be below target"
            );
        }
    }
    Ok(())
}

fn validate_numbered_counts(
    path: &str,
    values: impl Iterator<Item = (u32, u32)>,
    deck_size: u32,
) -> Result<()> {
    let values = values.collect::<Vec<_>>();
    ensure!(
        !values.is_empty()
            && values
                .iter()
                .enumerate()
                .all(|(index, value)| value.0 == index as u32 + 1),
        "{path}.rules boundaries must use deterministic consecutive numbering"
    );
    ensure!(
        values
            .iter()
            .all(|(_, count)| *count > 0 && *count < deck_size)
            && values.windows(2).all(|pair| pair[0].1 < pair[1].1),
        "{path}.rules outcome ranges must be reachable, unique, and ordered"
    );
    Ok(())
}

fn validate_economy(path: &str, economy: &GambleEconomy) -> Result<()> {
    match economy {
        GambleEconomy::ThreeGate { rewards, .. } => {
            ensure!(
                rewards
                    .iter()
                    .map(|reward| reward.gate)
                    .collect::<BTreeSet<_>>()
                    == BTreeSet::from([GateId::Six, GateId::Nine, GateId::Jack])
                    && rewards.len() == 3,
                "{path}.economy.rewards must cover every gate exactly once"
            );
        }
        GambleEconomy::LadderClimb {
            win_essence: _,
            attempts,
        } => {
            ensure!(
                !attempts.is_empty()
                    && attempts
                        .iter()
                        .enumerate()
                        .all(|(index, attempt)| attempt.attempt == index as u32 + 1),
                "{path}.economy.attempts must use consecutive numbering from one"
            );
        }
        GambleEconomy::StarwayStairs { rewards, .. } => {
            ensure!(
                !rewards.is_empty()
                    && rewards.len() <= 3
                    && rewards
                        .iter()
                        .enumerate()
                        .all(|(index, reward)| reward.tier == index as u32 + 1),
                "{path}.economy.rewards must define between one and three consecutive tiers from one"
            );
        }
        GambleEconomy::FourSuitReprise { .. } | GambleEconomy::Blackjack { .. } => {}
    }
    Ok(())
}

fn validate_rules_economy_alignment(
    path: &str,
    rules: &GambleGameRules,
    economy: &GambleEconomy,
) -> Result<()> {
    match (rules, economy) {
        (
            GambleGameRules::LadderClimb {
                attempts: rules, ..
            },
            GambleEconomy::LadderClimb {
                attempts: economy, ..
            },
        ) => ensure!(
            rules
                .iter()
                .map(|entry| entry.attempt)
                .eq(economy.iter().map(|entry| entry.attempt)),
            "{path} ladder rules and economy must define the same attempts"
        ),
        (
            GambleGameRules::StarwayStairs { tiers, .. },
            GambleEconomy::StarwayStairs { rewards, .. },
        ) => ensure!(
            tiers
                .iter()
                .map(|entry| entry.tier)
                .eq(rewards.iter().map(|entry| entry.tier)),
            "{path} Starway rules and economy must define the same tiers"
        ),
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(id: GambleGameId) -> GambleGameDefinition {
        let (rules, economy) = match id {
            GambleGameId::GravokThreeGateWager => (
                GambleGameRules::ThreeGate {
                    standard_deck_size: 52,
                    max_retries: 2,
                    gates: vec![
                        GateDefinition {
                            gate: GateId::Six,
                            threshold: CardRank::Six,
                            winning_card_count: 36,
                            awards_dreamsign: false,
                        },
                        GateDefinition {
                            gate: GateId::Nine,
                            threshold: CardRank::Nine,
                            winning_card_count: 24,
                            awards_dreamsign: false,
                        },
                        GateDefinition {
                            gate: GateId::Jack,
                            threshold: CardRank::Jack,
                            winning_card_count: 16,
                            awards_dreamsign: true,
                        },
                    ],
                },
                GambleEconomy::ThreeGate {
                    standard_wager: 50,
                    enhanced_wager: 45,
                    rewards: vec![
                        GateReward {
                            gate: GateId::Six,
                            essence: 100,
                        },
                        GateReward {
                            gate: GateId::Nine,
                            essence: 150,
                        },
                        GateReward {
                            gate: GateId::Jack,
                            essence: 200,
                        },
                    ],
                },
            ),
            GambleGameId::TidemarkLadderClimb => (
                GambleGameRules::LadderClimb {
                    standard_deck_size: 52,
                    strong_pool_limit: 50,
                    attempts: vec![
                        (1, CardRank::Queen, 12),
                        (2, CardRank::Ten, 20),
                        (3, CardRank::Eight, 28),
                        (4, CardRank::Six, 36),
                    ]
                    .into_iter()
                    .map(|(attempt, threshold, winning_card_count)| LadderAttempt {
                        attempt,
                        threshold,
                        winning_card_count,
                    })
                    .collect(),
                },
                GambleEconomy::LadderClimb {
                    win_essence: 25,
                    attempts: (1..=4)
                        .map(|attempt| AttemptPrice {
                            attempt,
                            standard_cost: attempt * 5,
                            enhanced_cost: 0,
                        })
                        .collect(),
                },
            ),
            GambleGameId::StarwayStairs => (
                GambleGameRules::StarwayStairs {
                    standard_deck_size: 52,
                    max_retries: 2,
                    tiers: vec![
                        (1, CardRank::Two, 4),
                        (2, CardRank::Four, 12),
                        (3, CardRank::Seven, 24),
                    ]
                    .into_iter()
                    .map(|(tier, highest_bust_rank, bust_card_count)| StarwayTier {
                        tier,
                        highest_bust_rank,
                        bust_card_count,
                    })
                    .collect(),
                },
                GambleEconomy::StarwayStairs {
                    standard_wager: 30,
                    enhanced_wager: 20,
                    rewards: vec![
                        TierReward {
                            tier: 1,
                            essence: 60,
                        },
                        TierReward {
                            tier: 2,
                            essence: 140,
                        },
                        TierReward {
                            tier: 3,
                            essence: 300,
                        },
                    ],
                },
            ),
            GambleGameId::FourSuitReprise => (
                GambleGameRules::FourSuitReprise {
                    standard_deck_size: 52,
                    max_rounds: 3,
                    matching_suit_card_count: 13,
                    outcomes: vec![
                        (CardSuit::Spades, FourSuitOutcome::Transfiguration),
                        (CardSuit::Diamonds, FourSuitOutcome::Essence),
                        (CardSuit::Hearts, FourSuitOutcome::Duplication),
                        (CardSuit::Clubs, FourSuitOutcome::Purge),
                    ]
                    .into_iter()
                    .map(|(suit, outcome)| SuitOutcome { suit, outcome })
                    .collect(),
                },
                GambleEconomy::FourSuitReprise {
                    standard_draw_price: 25,
                    enhanced_draw_price: 15,
                    essence_reward: 100,
                },
            ),
            GambleGameId::Blackjack => (
                GambleGameRules::Blackjack {
                    standard_deck_size: 52,
                    max_attempts: 3,
                    target: 21,
                    dealer_stand_threshold: 17,
                },
                GambleEconomy::Blackjack {
                    standard_wager: 90,
                    enhanced_wager: 40,
                    prize_essence: 300,
                },
            ),
        };
        GambleGameDefinition {
            id,
            selection: GambleSelection { weight: 1.0 },
            economy,
            rules,
        }
    }
    fn catalog() -> GambleCatalog {
        GambleCatalog {
            games: GambleGameId::ALL.into_iter().map(game).collect(),
        }
    }

    #[test]
    fn lowers_all_rule_variants_deterministically() {
        assert_eq!(lower(catalog()).unwrap(), lower(catalog()).unwrap());
    }

    #[test]
    fn accepts_configured_subsets_and_rejects_duplicates_invalid_values_pairings_and_outcomes() {
        let mut subset = catalog();
        subset.games.pop();
        validate(&subset).unwrap();
        let mut missing_fallback = catalog();
        missing_fallback.games.remove(0);
        assert!(
            validate(&missing_fallback)
                .unwrap_err()
                .to_string()
                .contains("must include GravokThreeGateWager")
        );
        let mut duplicate = catalog();
        duplicate.games[1].id = duplicate.games[0].id;
        assert!(
            validate(&duplicate)
                .unwrap_err()
                .to_string()
                .contains("must not repeat stable ids")
        );
        let mut weight = catalog();
        weight.games[0].selection.weight = -1.0;
        assert!(
            validate(&weight)
                .unwrap_err()
                .to_string()
                .contains("selection.weight")
        );
        let mut pairing = catalog();
        pairing.games[0].economy = GambleEconomy::Blackjack {
            standard_wager: 1,
            enhanced_wager: 1,
            prize_essence: 1,
        };
        assert!(
            validate(&pairing)
                .unwrap_err()
                .to_string()
                .contains("does not match")
        );
        let mut overlap = catalog();
        if let GambleGameRules::ThreeGate { gates, .. } = &mut overlap.games[0].rules {
            gates[1].winning_card_count = gates[0].winning_card_count;
        }
        assert!(
            validate(&overlap)
                .unwrap_err()
                .to_string()
                .contains("winning ranges")
        );
    }

    #[test]
    fn accepts_variable_stage_counts_and_reordered_total_mappings() {
        let mut source = catalog();
        for game in &mut source.games {
            match (&mut game.rules, &mut game.economy) {
                (
                    GambleGameRules::LadderClimb {
                        attempts: rules, ..
                    },
                    GambleEconomy::LadderClimb {
                        attempts: economy, ..
                    },
                ) => {
                    rules.truncate(2);
                    economy.truncate(2);
                }
                (
                    GambleGameRules::StarwayStairs { tiers, .. },
                    GambleEconomy::StarwayStairs { rewards, .. },
                ) => {
                    tiers.truncate(2);
                    rewards.truncate(2);
                }
                (GambleGameRules::ThreeGate { .. }, GambleEconomy::ThreeGate { rewards, .. }) => {
                    rewards.reverse()
                }
                (
                    GambleGameRules::FourSuitReprise { outcomes, .. },
                    GambleEconomy::FourSuitReprise { .. },
                ) => outcomes.reverse(),
                _ => {}
            }
        }
        validate(&source).unwrap();
    }
}

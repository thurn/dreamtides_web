use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct JourneyCatalog {
    pub presentation: JourneyPresentation,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct JourneyPresentation {
    pub start: JourneyStartPresentation,
    pub starting_deck: StartingDeckPresentation,
    pub dreamsign_replacement: DreamsignReplacementPresentation,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct JourneyStartPresentation {
    pub title: String,
    pub choose_action: String,
    pub reroll_action: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StartingDeckPresentation {
    pub title: String,
    pub subtitle: String,
    pub empty_state: String,
    pub begin_action: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DreamsignReplacementPresentation {
    pub title: String,
    pub new_dreamsign_label: String,
    pub replace_action: String,
    pub keep_current_action: String,
}

pub fn lower(source: JourneyCatalog) -> Result<toml::Value> {
    for (label, value) in [
        ("journey start title", &source.presentation.start.title),
        (
            "journey start choose action",
            &source.presentation.start.choose_action,
        ),
        (
            "journey start reroll action",
            &source.presentation.start.reroll_action,
        ),
        (
            "starting deck title",
            &source.presentation.starting_deck.title,
        ),
        (
            "starting deck subtitle",
            &source.presentation.starting_deck.subtitle,
        ),
        (
            "starting deck empty state",
            &source.presentation.starting_deck.empty_state,
        ),
        (
            "starting deck begin action",
            &source.presentation.starting_deck.begin_action,
        ),
        (
            "dreamsign replacement title",
            &source.presentation.dreamsign_replacement.title,
        ),
        (
            "new Dreamsign label",
            &source
                .presentation
                .dreamsign_replacement
                .new_dreamsign_label,
        ),
        (
            "dreamsign replace action",
            &source.presentation.dreamsign_replacement.replace_action,
        ),
        (
            "keep-current action",
            &source
                .presentation
                .dreamsign_replacement
                .keep_current_action,
        ),
    ] {
        ensure!(!value.trim().is_empty(), "{label} must be non-empty");
    }
    let mut root = toml::map::Map::new();
    root.insert("schema-version".into(), 1_i64.into());
    root.insert(
        "presentation".into(),
        toml::Value::try_from(source.presentation)?,
    );
    Ok(toml::Value::Table(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lowers_authored_presentation() {
        let source = JourneyCatalog {
            presentation: JourneyPresentation {
                start: JourneyStartPresentation {
                    title: "Start".into(),
                    choose_action: "Choose".into(),
                    reroll_action: "Reroll".into(),
                },
                starting_deck: StartingDeckPresentation {
                    title: "Deck".into(),
                    subtitle: "Cards".into(),
                    empty_state: "Empty".into(),
                    begin_action: "Begin".into(),
                },
                dreamsign_replacement: DreamsignReplacementPresentation {
                    title: "Replace".into(),
                    new_dreamsign_label: "New".into(),
                    replace_action: "Replace".into(),
                    keep_current_action: "Keep".into(),
                },
            },
        };
        let output = lower(source).unwrap();
        assert_eq!(output["schema-version"].as_integer(), Some(1));
        assert_eq!(
            output["presentation"]["start"]["title"].as_str(),
            Some("Start")
        );
    }
}

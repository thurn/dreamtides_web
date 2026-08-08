use std::collections::{BTreeSet, HashMap};
use std::fmt;

use anyhow::{Result, bail};
use regex::{Regex, RegexBuilder};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GlossaryDefinition {
    pub id: GlossaryId,
    pub category: GlossaryCategory,
    pub term: String,
    pub definition: String,
    pub priority: i64,
    #[serde(default, skip_serializing_if = "is_false")]
    pub matches_rules_text: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variants: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules_text_forms: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub definition_uses_rules_text: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definition_symbol: Option<DefinitionSymbol>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub term_presentation: Option<TermPresentation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub contexts: Vec<GlossaryContext>,
}

fn is_false(value: &bool) -> bool {
    !value
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub enum GlossaryCategory {
    CardTypes,
    TriggersAndTiming,
    Resources,
    Keywords,
    BattleStatus,
    Verbs,
    JourneyTerms,
    Transfigurations,
    Sites,
    Actions,
}

impl GlossaryCategory {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::CardTypes => "Card Types",
            Self::TriggersAndTiming => "Triggers & Timing",
            Self::Resources => "Resources",
            Self::Keywords => "Keywords",
            Self::BattleStatus => "Battle Status",
            Self::Verbs => "Verbs",
            Self::JourneyTerms => "Journey Terms",
            Self::Transfigurations => "Transfigurations",
            Self::Sites => "Sites",
            Self::Actions => "Actions",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GlossaryContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<ContextOwner>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub term: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definition: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub singular: Option<SingularProjection>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SingularProjection {
    pub capture: u32,
    pub definition: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub enum ContextOwner {
    Card,
    DreamAvatar,
}

impl ContextOwner {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Card => "card",
            Self::DreamAvatar => "dreamAvatar",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub enum DefinitionSymbol {
    Fast,
    Interrupt,
    Exhaust,
    Trigger,
}

impl DefinitionSymbol {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Fast => "fast",
            Self::Interrupt => "interrupt",
            Self::Exhaust => "exhaust",
            Self::Trigger => "trigger",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub enum TermPresentation {
    SymbolOnly,
    DefinitionOnly,
}

impl TermPresentation {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::SymbolOnly => "symbol-only",
            Self::DefinitionOnly => "definition-only",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct GlossaryId(Uuid);

impl GlossaryId {
    pub(crate) fn parse(value: &str) -> std::result::Result<Self, String> {
        let uuid = Uuid::parse_str(value).map_err(|error| error.to_string())?;
        if uuid.get_version() != Some(Version::Random) || uuid.get_variant() != Variant::RFC4122 {
            return Err("Glossary identifier must be an RFC 4122 UUIDv4".into());
        }
        if uuid.hyphenated().to_string() != value {
            return Err("Glossary identifier must use lowercase hyphenated UUID formatting".into());
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
    entries: Vec<CompatibilityEntry>,
}

#[derive(Serialize)]
struct CompatibilityEntry {
    id: String,
    category: &'static str,
    term: String,
    definition: String,
    priority: i64,
    #[serde(rename = "matches-rules-text")]
    matches_rules_text: bool,
    variants: Vec<String>,
    #[serde(rename = "rules-text-forms", skip_serializing_if = "Option::is_none")]
    rules_text_forms: Option<Vec<String>>,
    #[serde(
        rename = "definition-uses-rules-text",
        skip_serializing_if = "is_false"
    )]
    definition_uses_rules_text: bool,
    #[serde(rename = "definition-symbol", skip_serializing_if = "Option::is_none")]
    definition_symbol: Option<&'static str>,
    #[serde(rename = "term-presentation", skip_serializing_if = "Option::is_none")]
    term_presentation: Option<&'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    contexts: Vec<CompatibilityContext>,
}

#[derive(Serialize)]
struct CompatibilityContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    owner: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    term: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    definition: Option<String>,
    #[serde(rename = "singular-capture", skip_serializing_if = "Option::is_none")]
    singular_capture: Option<u32>,
    #[serde(
        rename = "singular-definition",
        skip_serializing_if = "Option::is_none"
    )]
    singular_definition: Option<String>,
}

pub fn lower(source: Vec<GlossaryDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let entries = source
        .into_iter()
        .map(|entry| CompatibilityEntry {
            id: entry.id.to_string(),
            category: entry.category.compatibility_name(),
            term: entry.term,
            definition: entry.definition,
            priority: entry.priority,
            matches_rules_text: entry.matches_rules_text,
            variants: entry.variants,
            rules_text_forms: entry.rules_text_forms,
            definition_uses_rules_text: entry.definition_uses_rules_text,
            definition_symbol: entry
                .definition_symbol
                .map(DefinitionSymbol::compatibility_name),
            term_presentation: entry
                .term_presentation
                .map(TermPresentation::compatibility_name),
            contexts: entry
                .contexts
                .into_iter()
                .map(|context| {
                    let (singular_capture, singular_definition) = context
                        .singular
                        .map(|singular| (Some(singular.capture), Some(singular.definition)))
                        .unwrap_or((None, None));
                    CompatibilityContext {
                        owner: context.owner.map(ContextOwner::compatibility_name),
                        pattern: context.pattern,
                        term: context.term,
                        definition: context.definition,
                        singular_capture,
                        singular_definition,
                    }
                })
                .collect(),
        })
        .collect();
    Ok(toml::Value::try_from(CompatibilityCatalog { entries })?)
}

fn validate(source: &[GlossaryDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    let mut matched_forms = HashMap::new();
    let template_capture = Regex::new(r"\{(\d+)\}").expect("static capture-reference regex");
    for entry in source {
        if !ids.insert(entry.id) {
            bail!("duplicate Glossary id: {}", entry.id);
        }
        require_non_blank(&entry.term, entry.id, "term")?;
        require_non_blank(&entry.definition, entry.id, "definition")?;
        for variant in &entry.variants {
            require_non_blank(variant, entry.id, "variant")?;
        }
        if let Some(forms) = &entry.rules_text_forms {
            for form in forms {
                require_non_blank(form, entry.id, "rules-text form")?;
            }
        }

        let forms: Vec<&str> = match &entry.rules_text_forms {
            Some(forms) => forms.iter().map(String::as_str).collect(),
            None if entry.matches_rules_text => std::iter::once(entry.term.as_str())
                .chain(entry.variants.iter().map(String::as_str))
                .collect(),
            None => Vec::new(),
        };
        for form in forms {
            let key = form.to_lowercase();
            if let Some(owner) = matched_forms.insert(key, entry.id) {
                bail!(
                    "rules-text form {form:?} is claimed by both {owner} and {}",
                    entry.id
                );
            }
        }

        for context in &entry.contexts {
            if context.term.is_none() && context.definition.is_none() {
                bail!(
                    "Glossary {} has a context without a term or definition projection",
                    entry.id
                );
            }
            let capture_count = if let Some(pattern) = &context.pattern {
                let regex = RegexBuilder::new(pattern)
                    .case_insensitive(true)
                    .unicode(true)
                    .build()
                    .map_err(|error| {
                        anyhow::anyhow!(
                            "Glossary {} has an invalid context pattern: {error}",
                            entry.id
                        )
                    })?;
                Some(regex.captures_len() - 1)
            } else {
                None
            };
            if let Some(term) = &context.term {
                require_non_blank(term, entry.id, "context term")?;
                validate_template_captures(term, capture_count, &template_capture, entry.id)?;
            }
            if let Some(definition) = &context.definition {
                require_non_blank(definition, entry.id, "context definition")?;
                validate_template_captures(definition, capture_count, &template_capture, entry.id)?;
            }
            if let Some(singular) = &context.singular {
                if singular.capture == 0 {
                    bail!("Glossary {} has a zero singular capture", entry.id);
                }
                let capture_count = capture_count.ok_or_else(|| {
                    anyhow::anyhow!(
                        "Glossary {} has a singular capture without a context pattern",
                        entry.id
                    )
                })?;
                if singular.capture as usize > capture_count {
                    bail!(
                        "Glossary {} singular capture {} exceeds the context pattern's {capture_count} capture groups",
                        entry.id,
                        singular.capture
                    );
                }
                require_non_blank(&singular.definition, entry.id, "singular definition")?;
                validate_template_captures(
                    &singular.definition,
                    Some(capture_count),
                    &template_capture,
                    entry.id,
                )?;
            }
        }
    }
    Ok(())
}

fn validate_template_captures(
    template: &str,
    capture_count: Option<usize>,
    capture_reference: &Regex,
    id: GlossaryId,
) -> Result<()> {
    for captures in capture_reference.captures_iter(template) {
        let reference = captures[1].parse::<usize>().map_err(|error| {
            anyhow::anyhow!("Glossary {id} has an invalid template capture reference: {error}")
        })?;
        let Some(capture_count) = capture_count else {
            bail!("Glossary {id} has a template capture reference without a context pattern");
        };
        if reference == 0 || reference > capture_count {
            bail!(
                "Glossary {id} template capture {reference} exceeds the context pattern's {capture_count} capture groups"
            );
        }
    }
    Ok(())
}

fn require_non_blank(value: &str, id: GlossaryId, field: &str) -> Result<()> {
    if value.trim().is_empty() {
        bail!("Glossary {id} has a blank {field}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    const FIRST_ID: &str = "00000000-0000-4000-8000-000000000001";
    const SECOND_ID: &str = "00000000-0000-4000-8000-000000000002";

    fn synthetic_source() -> &'static str {
        r##"#![enable(implicit_some)]
[
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000001",
    category: CardTypes,
    term: "Echo",
    definition: "Create an echo ✦.",
    priority: 17,
    matches_rules_text: true,
    variants: ["echoes"],
    definition_uses_rules_text: true,
    definition_symbol: Fast,
    term_presentation: SymbolOnly,
    contexts: [
      GlossaryContext(
        owner: Card,
        pattern: "\\becho\\s+(\\d+)\\b",
        term: "{term} {1}",
        singular: SingularProjection(capture: 1, definition: "Create one echo."),
      ),
    ],
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000002",
    category: Actions,
    term: "Moon",
    definition: "A multiline\nUnicode definition.",
    priority: -3,
    rules_text_forms: ["☾"],
    contexts: [GlossaryContext(owner: DreamAvatar, definition: "Avatar moon." )],
  ),
]
"##
    }

    #[test]
    fn lowers_compound_contexts_defaults_and_optional_fields_in_order() {
        let source: Vec<GlossaryDefinition> = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let entries = lowered["entries"].as_array().unwrap();

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(entries[0]["category"].as_str(), Some("Card Types"));
        assert_eq!(entries[0]["matches-rules-text"].as_bool(), Some(true));
        assert_eq!(entries[0]["definition-symbol"].as_str(), Some("fast"));
        assert_eq!(
            entries[0]["term-presentation"].as_str(),
            Some("symbol-only")
        );
        assert_eq!(entries[0]["contexts"][0]["owner"].as_str(), Some("card"));
        assert_eq!(
            entries[0]["contexts"][0]["singular-capture"].as_integer(),
            Some(1)
        );
        assert_eq!(
            entries[0]["contexts"][0]["singular-definition"].as_str(),
            Some("Create one echo.")
        );

        assert_eq!(entries[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(entries[1]["matches-rules-text"].as_bool(), Some(false));
        assert_eq!(entries[1]["variants"].as_array().unwrap().len(), 0);
        assert_eq!(entries[1]["rules-text-forms"][0].as_str(), Some("☾"));
        assert!(entries[1].get("definition-uses-rules-text").is_none());
        assert!(entries[1].get("definition-symbol").is_none());
        assert!(entries[1].get("term-presentation").is_none());
        assert_eq!(
            entries[1]["contexts"][0]["owner"].as_str(),
            Some("dreamAvatar")
        );
    }

    #[test]
    fn exhaustively_lowers_closed_compatibility_vocabularies() {
        assert_eq!(
            [
                GlossaryCategory::CardTypes,
                GlossaryCategory::TriggersAndTiming,
                GlossaryCategory::Resources,
                GlossaryCategory::Keywords,
                GlossaryCategory::BattleStatus,
                GlossaryCategory::Verbs,
                GlossaryCategory::JourneyTerms,
                GlossaryCategory::Transfigurations,
                GlossaryCategory::Sites,
                GlossaryCategory::Actions,
            ]
            .map(GlossaryCategory::compatibility_name),
            [
                "Card Types",
                "Triggers & Timing",
                "Resources",
                "Keywords",
                "Battle Status",
                "Verbs",
                "Journey Terms",
                "Transfigurations",
                "Sites",
                "Actions",
            ]
        );
        assert_eq!(
            [
                DefinitionSymbol::Fast,
                DefinitionSymbol::Interrupt,
                DefinitionSymbol::Exhaust,
                DefinitionSymbol::Trigger
            ]
            .map(DefinitionSymbol::compatibility_name),
            ["fast", "interrupt", "exhaust", "trigger"]
        );
        assert_eq!(
            [
                TermPresentation::SymbolOnly,
                TermPresentation::DefinitionOnly
            ]
            .map(TermPresentation::compatibility_name),
            ["symbol-only", "definition-only"]
        );
        assert_eq!(
            [ContextOwner::Card, ContextOwner::DreamAvatar].map(ContextOwner::compatibility_name),
            ["card", "dreamAvatar"]
        );
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown =
            synthetic_source().replace("term: \"Echo\",", "term: \"Echo\", surprise: true,");
        assert!(ron::from_str::<Vec<GlossaryDefinition>>(&unknown).is_err());

        for invalid in [
            "legacy-slug",
            "00000000-0000-3000-8000-000000000001",
            "00000000-0000-4000-C000-000000000001",
            "00000000-0000-4000-c000-000000000001",
        ] {
            let source = synthetic_source().replacen(FIRST_ID, invalid, 1);
            assert!(
                ron::from_str::<Vec<GlossaryDefinition>>(&source).is_err(),
                "accepted {invalid}"
            );
        }
    }

    #[test]
    fn rejects_duplicate_ids_forms_blank_copy_and_invalid_contexts() {
        assert_error_contains(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            "duplicate Glossary id",
        );
        assert_error_contains(
            &synthetic_source().replace("term: \"Echo\"", "term: \" \""),
            "blank term",
        );
        assert_error_contains(
            &synthetic_source()
                .replace("rules_text_forms: [\"☾\"]", "rules_text_forms: [\"echo\"]"),
            "claimed by both",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "pattern: \"\\\\becho\\\\s+(\\\\d+)\\\\b\"",
                "pattern: \"[\"",
            ),
            "invalid context pattern",
        );
        assert_error_contains(
            &synthetic_source().replace("capture: 1", "capture: 0"),
            "zero singular capture",
        );
        assert_error_contains(
            &synthetic_source().replace("capture: 1", "capture: 2"),
            "singular capture 2 exceeds",
        );
        assert_error_contains(
            &synthetic_source().replace("term: \"{term} {1}\"", "term: \"{term} {2}\""),
            "template capture 2 exceeds",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "definition: \"Avatar moon.\"",
                "definition: \"Avatar {1}.\"",
            ),
            "template capture reference without a context pattern",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "owner: DreamAvatar, definition: \"Avatar moon.\"",
                "owner: DreamAvatar",
            ),
            "without a term or definition",
        );
    }

    fn assert_error_contains(source: &str, expected: &str) {
        let parsed: Vec<GlossaryDefinition> = ron::from_str(source).unwrap();
        assert!(
            lower(parsed).unwrap_err().to_string().contains(expected),
            "error did not contain {expected}"
        );
    }

}

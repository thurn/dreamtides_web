use std::collections::{BTreeSet, HashMap};
use std::fmt;
use trox::LocalizedString;

use anyhow::{Result, bail, ensure};
use regex::{Regex, RegexBuilder};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::{Uuid, Variant, Version};

use super::localization::{source_text, source_transport_value};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GlossaryDefinition {
    pub id: GlossaryId,
    pub category: GlossaryCategory,
    pub term: LocalizedString,
    pub definition: LocalizedString,
    pub priority: i64,
    #[serde(default, skip_serializing_if = "is_false")]
    pub matches_term_in_rules_text: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variants: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definition_symbol: Option<DefinitionSymbol>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub term_presentation: Option<TermPresentation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub projections: Vec<GlossaryProjection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules_symbol: Option<RulesSymbol>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RulesSymbol {
    pub token: RulesSymbolToken,
    pub glyph: RulesSymbolGlyph,
    pub accessible_label: LocalizedString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub semantic_color_role: Option<RulesSymbolColorRole>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum RulesSymbolToken {
    Essence,
    Points,
    Lunar,
    Store,
    Energy,
    Spark,
}

impl RulesSymbolToken {
    const ALL: [Self; 6] = [
        Self::Essence,
        Self::Points,
        Self::Lunar,
        Self::Store,
        Self::Energy,
        Self::Spark,
    ];

    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Essence => "essence",
            Self::Points => "points",
            Self::Lunar => "lunar",
            Self::Store => "store",
            Self::Energy => "energy",
            Self::Spark => "spark",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum RulesSymbolGlyph {
    Essence,
    Points,
    Exhaust,
    Memory,
    Energy,
    Spark,
}

impl RulesSymbolGlyph {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Essence => "essence",
            Self::Points => "points",
            Self::Exhaust => "exhaust",
            Self::Memory => "memory",
            Self::Energy => "energy",
            Self::Spark => "sparkInline",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum RulesSymbolColorRole {
    Essence,
    Energy,
    Spark,
}

impl RulesSymbolColorRole {
    fn compatibility_name(self) -> &'static str {
        match self {
            Self::Essence => "essence",
            Self::Energy => "energy",
            Self::Spark => "spark",
        }
    }
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
pub struct GlossaryProjection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<ProjectionOwner>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub term: Option<LocalizedString>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub definition: Option<LocalizedString>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
pub enum ProjectionOwner {
    Card,
    DreamAvatar,
}

impl ProjectionOwner {
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
    #[serde(rename = "matches-term-in-rules-text")]
    matches_term_in_rules_text: bool,
    variants: Vec<String>,
    #[serde(rename = "definition-symbol", skip_serializing_if = "Option::is_none")]
    definition_symbol: Option<&'static str>,
    #[serde(rename = "term-presentation", skip_serializing_if = "Option::is_none")]
    term_presentation: Option<&'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    projections: Vec<CompatibilityProjection>,
    #[serde(rename = "rules-symbol", skip_serializing_if = "Option::is_none")]
    rules_symbol: Option<CompatibilityRulesSymbol>,
}

#[derive(Serialize)]
struct CompatibilityRulesSymbol {
    token: &'static str,
    glyph: &'static str,
    #[serde(rename = "accessible-label")]
    accessible_label: String,
    #[serde(
        rename = "semantic-color-role",
        skip_serializing_if = "Option::is_none"
    )]
    semantic_color_role: Option<&'static str>,
}

#[derive(Serialize)]
struct CompatibilityProjection {
    #[serde(skip_serializing_if = "Option::is_none")]
    owner: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    term: Option<toml::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    definition: Option<toml::Value>,
}

pub fn lower(source: Vec<GlossaryDefinition>) -> Result<toml::Value> {
    validate(&source)?;
    let entries = source
        .into_iter()
        .map(|entry| {
            Ok(CompatibilityEntry {
                id: entry.id.to_string(),
                category: entry.category.compatibility_name(),
                term: source_text(&entry.term)?,
                definition: source_text(&entry.definition)?,
                priority: entry.priority,
                matches_term_in_rules_text: entry.matches_term_in_rules_text,
                variants: entry.variants,
                definition_symbol: entry
                    .definition_symbol
                    .map(DefinitionSymbol::compatibility_name),
                term_presentation: entry
                    .term_presentation
                    .map(TermPresentation::compatibility_name),
                projections: entry
                    .projections
                    .into_iter()
                    .map(|projection| {
                        Ok(CompatibilityProjection {
                            owner: projection.owner.map(ProjectionOwner::compatibility_name),
                            pattern: projection.pattern,
                            term: projection
                                .term
                                .as_ref()
                                .map(source_transport_value)
                                .transpose()?,
                            definition: projection
                                .definition
                                .as_ref()
                                .map(source_transport_value)
                                .transpose()?,
                        })
                    })
                    .collect::<Result<Vec<_>>>()?,
                rules_symbol: entry
                    .rules_symbol
                    .map(|symbol| {
                        Ok::<CompatibilityRulesSymbol, anyhow::Error>(CompatibilityRulesSymbol {
                            token: symbol.token.compatibility_name(),
                            glyph: symbol.glyph.compatibility_name(),
                            accessible_label: source_text(&symbol.accessible_label)?,
                            semantic_color_role: symbol
                                .semantic_color_role
                                .map(RulesSymbolColorRole::compatibility_name),
                        })
                    })
                    .transpose()?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(toml::Value::try_from(CompatibilityCatalog { entries })?)
}

pub(crate) fn validate(source: &[GlossaryDefinition]) -> Result<()> {
    let mut ids = BTreeSet::new();
    let mut matched_forms = HashMap::new();
    let mut rules_symbol_tokens = BTreeSet::new();
    let template_capture = Regex::new(r"\{(\d+)\}").expect("static capture-reference regex");
    for entry in source {
        if !ids.insert(entry.id) {
            bail!("duplicate Glossary id: {}", entry.id);
        }
        let term = source_text(&entry.term)?;
        let definition = source_text(&entry.definition)?;
        require_non_blank(&term, entry.id, "term")?;
        require_non_blank(&definition, entry.id, "definition")?;
        for variant in &entry.variants {
            require_non_blank(variant, entry.id, "variant")?;
        }
        let forms: Vec<&str> = entry
            .matches_term_in_rules_text
            .then_some(term.as_str())
            .into_iter()
            .chain(entry.variants.iter().map(String::as_str))
            .collect();
        for form in forms {
            let key = form.to_lowercase();
            if let Some(owner) = matched_forms.insert(key, entry.id) {
                bail!(
                    "rules-text form {form:?} is claimed by both {owner} and {}",
                    entry.id
                );
            }
        }

        for projection in &entry.projections {
            if projection.term.is_none() && projection.definition.is_none() {
                bail!(
                    "Glossary {} has a projection without a term or definition",
                    entry.id
                );
            }
            let capture_count = if let Some(pattern) = &projection.pattern {
                let regex = RegexBuilder::new(pattern)
                    .case_insensitive(true)
                    .unicode(true)
                    .build()
                    .map_err(|error| {
                        anyhow::anyhow!(
                            "Glossary {} has an invalid projection pattern: {error}",
                            entry.id
                        )
                    })?;
                Some(regex.captures_len() - 1)
            } else {
                None
            };
            if let Some(term) = &projection.term {
                let term = source_text(term)?;
                require_non_blank(&term, entry.id, "projection term")?;
                validate_template_captures(&term, capture_count, &template_capture, entry.id)?;
            }
            if let Some(definition) = &projection.definition {
                let definition = source_text(definition)?;
                require_non_blank(&definition, entry.id, "projection definition")?;
                validate_template_captures(
                    &definition,
                    capture_count,
                    &template_capture,
                    entry.id,
                )?;
            }
        }
        if let Some(symbol) = &entry.rules_symbol {
            ensure!(
                !source_text(&symbol.accessible_label)?.trim().is_empty(),
                "Glossary {} rules_symbol.accessible_label must not be blank",
                entry.id
            );
            ensure!(
                rules_symbol_tokens.insert(symbol.token),
                "rules symbol token {} has more than one Glossary owner",
                symbol.token.compatibility_name()
            );
            let valid_glyph = matches!(
                (symbol.token, symbol.glyph),
                (RulesSymbolToken::Essence, RulesSymbolGlyph::Essence)
                    | (RulesSymbolToken::Points, RulesSymbolGlyph::Points)
                    | (RulesSymbolToken::Lunar, RulesSymbolGlyph::Exhaust)
                    | (RulesSymbolToken::Store, RulesSymbolGlyph::Memory)
                    | (RulesSymbolToken::Energy, RulesSymbolGlyph::Energy)
                    | (RulesSymbolToken::Spark, RulesSymbolGlyph::Spark)
            );
            ensure!(
                valid_glyph,
                "Glossary {} rules_symbol glyph is unsupported for token {}",
                entry.id,
                symbol.token.compatibility_name()
            );
        }
    }
    ensure!(
        rules_symbol_tokens == BTreeSet::from(RulesSymbolToken::ALL),
        "glossary rules symbols must cover every supported token exactly once"
    );
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
            bail!("Glossary {id} has a template capture reference without a projection pattern");
        };
        if reference == 0 || reference > capture_count {
            bail!(
                "Glossary {id} template capture {reference} exceeds the projection pattern's {capture_count} capture groups"
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
    use std::collections::{BTreeMap, BTreeSet};
    use std::fs;
    use std::path::Path;

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
    term: Tx("Echo"),
    definition: Tx("Create an echo ✦."),
    priority: 17,
    matches_term_in_rules_text: true,
    variants: ["echoes"],
    definition_symbol: Fast,
    term_presentation: SymbolOnly,
    rules_symbol: RulesSymbol(
      token: spark,
      glyph: Spark,
      accessible_label: Tx("spark"),
      semantic_color_role: Spark,
    ),
    projections: [
      GlossaryProjection(
        owner: Card,
        pattern: r"\becho\s+(\d+)\b",
        term: Tx("{{term}} {{1}}"),
        definition: Tx("Create {{1}} echoes."),
      ),
    ],
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000002",
    category: Actions,
    term: Tx("Moon"),
    definition: Tx("A multiline\nUnicode definition."),
    priority: -3,
    variants: ["☾"],
    rules_symbol: RulesSymbol(token: lunar, glyph: Exhaust, accessible_label: Tx("lunar")),
    projections: [GlossaryProjection(owner: DreamAvatar, definition: Tx("Avatar moon.") )],
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000003",
    category: Resources,
    term: Tx("Essence"),
    definition: Tx("Essence."),
    priority: 0,
    rules_symbol: RulesSymbol(token: essence, glyph: Essence, accessible_label: Tx("essence")),
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000004",
    category: Resources,
    term: Tx("Points"),
    definition: Tx("Points."),
    priority: 0,
    rules_symbol: RulesSymbol(token: points, glyph: Points, accessible_label: Tx("points")),
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000005",
    category: Resources,
    term: Tx("Memory"),
    definition: Tx("Memory."),
    priority: 0,
    rules_symbol: RulesSymbol(token: store, glyph: Memory, accessible_label: Tx("memory")),
  ),
  GlossaryDefinition(
    id: "00000000-0000-4000-8000-000000000006",
    category: Resources,
    term: Tx("Energy"),
    definition: Tx("Energy."),
    priority: 0,
    rules_symbol: RulesSymbol(token: energy, glyph: Energy, accessible_label: Tx("energy")),
  ),
]
"##
    }

    #[test]
    fn lowers_compound_projections_defaults_and_optional_fields_in_order() {
        let source: Vec<GlossaryDefinition> = ron::from_str(synthetic_source()).unwrap();
        let lowered = lower(source).unwrap();
        let entries = lowered["entries"].as_array().unwrap();

        assert_eq!(entries.len(), 6);
        assert_eq!(entries[0]["id"].as_str(), Some(FIRST_ID));
        assert_eq!(entries[0]["category"].as_str(), Some("Card Types"));
        assert_eq!(
            entries[0]["matches-term-in-rules-text"].as_bool(),
            Some(true)
        );
        assert_eq!(entries[0]["definition-symbol"].as_str(), Some("fast"));
        assert_eq!(
            entries[0]["term-presentation"].as_str(),
            Some("symbol-only")
        );
        assert_eq!(entries[0]["projections"][0]["owner"].as_str(), Some("card"));
        assert_eq!(
            entries[0]["projections"][0]["pattern"].as_str(),
            Some(r"\becho\s+(\d+)\b")
        );
        assert_eq!(entries[0]["rules-symbol"]["token"].as_str(), Some("spark"));
        assert_eq!(
            entries[0]["rules-symbol"]["glyph"].as_str(),
            Some("sparkInline")
        );
        assert_eq!(
            entries[0]["rules-symbol"]["accessible-label"].as_str(),
            Some("spark")
        );

        assert_eq!(entries[1]["id"].as_str(), Some(SECOND_ID));
        assert_eq!(
            entries[1]["matches-term-in-rules-text"].as_bool(),
            Some(false)
        );
        assert_eq!(entries[1]["variants"][0].as_str(), Some("☾"));
        assert!(entries[1].get("definition-symbol").is_none());
        assert!(entries[1].get("term-presentation").is_none());
        assert_eq!(
            entries[1]["projections"][0]["owner"].as_str(),
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
            [ProjectionOwner::Card, ProjectionOwner::DreamAvatar]
                .map(ProjectionOwner::compatibility_name),
            ["card", "dreamAvatar"]
        );
    }

    #[test]
    fn rejects_unknown_fields_and_noncanonical_identifiers() {
        let unknown = synthetic_source()
            .replace("term: Tx(\"Echo\"),", "term: Tx(\"Echo\"), surprise: true,");
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
    fn rejects_duplicate_ids_forms_blank_copy_and_invalid_projections() {
        assert_error_contains(
            &synthetic_source().replace(SECOND_ID, FIRST_ID),
            "duplicate Glossary id",
        );
        assert_error_contains(
            &synthetic_source().replace("term: Tx(\"Echo\")", "term: Tx(\" \")"),
            "blank term",
        );
        assert_error_contains(
            &synthetic_source().replace("variants: [\"☾\"]", "variants: [\"echo\"]"),
            "claimed by both",
        );
        assert_error_contains(
            &synthetic_source().replace("pattern: r\"\\becho\\s+(\\d+)\\b\"", "pattern: \"[\""),
            "invalid projection pattern",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "term: Tx(\"{{term}} {{1}}\")",
                "term: Tx(\"{{term}} {{2}}\")",
            ),
            "template capture 2 exceeds",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "definition: Tx(\"Avatar moon.\")",
                "definition: Tx(\"Avatar {{1}}.\")",
            ),
            "template capture reference without a projection pattern",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "owner: DreamAvatar, definition: Tx(\"Avatar moon.\")",
                "owner: DreamAvatar",
            ),
            "without a term or definition",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "token: lunar, glyph: Exhaust, accessible_label: Tx(\"lunar\")",
                "token: spark, glyph: Spark, accessible_label: Tx(\"spark\")",
            ),
            "more than one Glossary owner",
        );
        assert_error_contains(
            &synthetic_source().replace("glyph: Spark", "glyph: Energy"),
            "glyph is unsupported",
        );
        assert_error_contains(
            &synthetic_source().replace(
                "rules_symbol: RulesSymbol(token: energy, glyph: Energy, accessible_label: Tx(\"energy\")),",
                "",
            ),
            "cover every supported token exactly once",
        );
    }

    fn assert_error_contains(source: &str, expected: &str) {
        let parsed: Vec<GlossaryDefinition> = ron::from_str(source).unwrap();
        assert!(
            lower(parsed).unwrap_err().to_string().contains(expected),
            "error did not contain {expected}"
        );
    }

    const LEGACY_IDS: [(&str, &str); 66] = [
        ("figment", "7ece2571-4681-4be3-aad6-76503bd77523"),
        (
            "materialized-trigger",
            "a70ebef7-797a-491b-a888-382a0d7a7656",
        ),
        ("dawn-trigger", "c8a29383-b5bd-4971-98e7-e89e9edae648"),
        ("challenge-trigger", "3411c9fa-6606-4d69-ba30-d52637957cf7"),
        ("night-trigger", "12789839-a665-4195-925a-3229b857cf48"),
        ("day", "9183292b-112f-43c7-88ac-a41c4dd358c3"),
        ("rematerialize", "cf383187-e594-41ee-98c5-039a9402b2f8"),
        ("dissolved-trigger", "abef45fb-8c3f-4d63-9408-0eed1b7283bb"),
        ("dissolve", "3b83d2c9-5fc4-4d75-8b61-3518eebdc39e"),
        ("banish", "f7b481e7-5130-45fe-9a34-a9b54a620d44"),
        ("abandon", "6efaf17e-7838-484e-9f29-cf7c249c9b5e"),
        ("points", "f7e1f058-74fe-46db-bb12-f5f887e6a298"),
        ("memory", "0dd0f69f-3879-40dd-82b8-6be0274f763d"),
        ("reclaim", "374c29e9-deb1-4e3d-8410-b81bacc8588b"),
        ("foresee", "21e9a392-3983-49ba-8072-aa950c63ebad"),
        ("discover", "5bda4696-32f9-4df2-a784-80120d76578b"),
        ("erode", "23526f6e-f17e-4496-bf96-1875858d023d"),
        ("fast", "63a9d425-f7f2-4acf-a7ff-57fd58ad34fc"),
        ("interrupt", "c7ec2870-5c8b-43ad-bcb0-d603bba12dea"),
        ("exhaust-cost", "a5fe9cb8-1162-44f3-9634-99839eecbb1a"),
        ("awakened", "75aae855-4ddc-41f3-9732-dd5922b897b8"),
        ("exhausted", "10e82210-de89-4266-8f98-d9764ab3807e"),
        ("veil", "c5c7ca5b-03ed-4665-8a3b-405ec6eed011"),
        ("vengeful", "ee732697-b9fc-4a89-942a-2778442810dd"),
        ("support", "59f426ac-b9cb-47af-a00a-8cbab941c6c4"),
        ("challenger", "1ea8f8f0-fadf-499a-9fe9-91d8e79a1d2e"),
        ("blocker", "dead0ce0-353c-475b-aa8f-dcaf727bf920"),
        ("unpaired", "7c5416d7-5933-4c45-b8c8-7d403f0fdf7d"),
        ("prevent", "4244a386-8cd0-4e90-b80b-c3ae98a7df6b"),
        ("offering", "04ffd85d-956e-4194-bdae-3d61ce3c584d"),
        ("phasing", "ab7a9b1e-3603-4321-88e7-d79619435ef7"),
        ("ephemeral", "d455fe46-9ddb-4241-addd-52d40db4a4ac"),
        ("transfigure", "9c2606e6-1b15-45ce-b737-281b9dbe729b"),
        ("purge", "4587769f-e718-485e-833b-0ef5803a30e0"),
        ("duplicate", "978999b1-37af-4187-b568-92af6a1e0ab5"),
        ("bane", "a9799416-d2d4-4f1b-a3b5-fec790119fae"),
        ("essence", "3d708c8b-2153-47b8-821e-284f36e1ec9e"),
        ("enhanced", "affc1dd5-706d-4d60-a85f-cec2a1cd8a98"),
        ("transfiguration", "9dd3fbac-7aac-478b-bd95-e3a277c76a12"),
        ("empowered", "a66c513e-500b-4891-8c09-9641ae300ba4"),
        ("amplified", "a2c070ca-eacd-4cca-b69d-3d48f0787a16"),
        ("kindled", "f40df441-0e44-4122-b4d4-cdc4085a9ffb"),
        ("resonant", "c3fa83af-ee3b-47cd-8112-5e5cc38821de"),
        ("inspired", "f0ff63b4-424b-4ae9-81d5-a4f6546afa3f"),
        ("enduring", "eb4cfc5f-237a-47cd-9215-7cce3f15583f"),
        ("attuned", "980d283a-9558-4b66-84a0-fcb91fdf4ceb"),
        ("perfected", "22adf539-d2c9-4f33-9416-159d03a220ad"),
        ("energy-cost", "4c7b92d2-31f5-4e74-aa00-88525e242afc"),
        ("spark", "bf95777e-d1a3-4c08-b027-3407e380eb00"),
        ("starting-essence", "bdae3633-0f98-4cbf-829e-89d557c24e83"),
        ("tides", "62bfc165-306b-4ebd-9aac-a1a51f9bc75c"),
        ("site-battle", "85ffab8d-f972-4340-9b45-99f6aff6ccec"),
        ("site-draft", "1ee13681-1ff5-431c-94a1-3390d45e1717"),
        ("site-shop", "25f28ed1-5729-4240-a352-80f92fce530c"),
        ("site-purge", "4873bddf-7bf5-41e8-979e-36eb193db5a6"),
        ("site-essence", "ba8ea132-f636-4fed-be27-e8eff0c9cb07"),
        (
            "site-transfiguration",
            "7ae25c1a-76c5-4aed-9e1c-a2d5ec160bd7",
        ),
        ("site-duplication", "8222c5e2-a3ce-4caf-bd13-5c77ff15d7cf"),
        ("site-reward", "28925242-3799-4faa-b4bd-b8aac52ca442"),
        ("site-augury", "ffd3977a-a463-4326-bdf2-5b1b8c3d9160"),
        (
            "site-dreamsign-bazaar",
            "5b5b47d6-c858-4b42-af96-a520c84666eb",
        ),
        (
            "site-dreamsign-revelation",
            "ac70fd6b-a91a-407f-b7b7-255668cd6bec",
        ),
        ("site-random-site", "1aeb05bc-53e1-4ea4-9e73-9239160799dc"),
        ("site-gamble", "f1ff2fb5-3d77-4eb8-b492-78cbe11fd265"),
        ("site-exploration", "46059d35-cb9e-4c4b-8635-087b6239f308"),
        ("dreamsign-restock", "a213b7b2-1e9d-4e6e-b599-19f858ba898d"),
    ];

    #[test]
    fn production_catalog_preserves_reviewed_identity_contract() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let canonical: Vec<GlossaryDefinition> =
            ron::from_str(&fs::read_to_string(root.join("data/glossary.ron")).unwrap()).unwrap();
        let current_toml: toml::Value =
            toml::from_str(&fs::read_to_string(root.join("data/glossary.toml")).unwrap()).unwrap();
        assert_eq!(lower(canonical.clone()).unwrap(), current_toml);
        let mapping: BTreeMap<_, _> = LEGACY_IDS.into_iter().collect();
        assert_eq!(mapping.len(), LEGACY_IDS.len());

        let canonical_ids: BTreeSet<_> =
            canonical.iter().map(|entry| entry.id.to_string()).collect();
        let mapped_ids: BTreeSet<_> = mapping.values().map(|id| (*id).to_owned()).collect();
        assert_eq!(canonical_ids.len(), canonical.len());
        assert_eq!(canonical_ids, mapped_ids);
        for id in canonical_ids {
            let parsed = Uuid::parse_str(&id).unwrap();
            assert_eq!(parsed.get_version(), Some(Version::Random));
            assert_eq!(parsed.get_variant(), Variant::RFC4122);
            assert_eq!(parsed.hyphenated().to_string(), id);
        }

        let categories: BTreeSet<_> = canonical.iter().map(|entry| entry.category).collect();
        assert_eq!(categories.len(), 10);
        let owners: BTreeSet<_> = canonical
            .iter()
            .flat_map(|entry| {
                entry
                    .projections
                    .iter()
                    .filter_map(|projection| projection.owner)
            })
            .collect();
        assert_eq!(owners, [ProjectionOwner::DreamAvatar].into_iter().collect());
        let symbols: BTreeSet<_> = canonical
            .iter()
            .filter_map(|entry| entry.definition_symbol)
            .collect();
        assert_eq!(symbols, [DefinitionSymbol::Exhaust].into_iter().collect());
        let presentations: BTreeSet<_> = canonical
            .iter()
            .filter_map(|entry| entry.term_presentation)
            .collect();
        assert_eq!(
            presentations,
            [TermPresentation::DefinitionOnly].into_iter().collect()
        );

        let mut foreign_ids = BTreeSet::new();
        for path in ["data/sites.toml", "data/tutorial.toml"] {
            let document: toml::Value =
                toml::from_str(&fs::read_to_string(root.join(path)).unwrap()).unwrap();
            collect_glossary_references(&document, &mut foreign_ids);
        }
        assert!(!foreign_ids.is_empty());
        for id in foreign_ids {
            assert!(
                mapping.contains_key(id.as_str()) || mapping.values().any(|value| *value == id),
                "unmapped foreign Glossary reference {id}"
            );
        }
    }

    fn collect_glossary_references(value: &toml::Value, references: &mut BTreeSet<String>) {
        match value {
            toml::Value::Array(values) => {
                for value in values {
                    collect_glossary_references(value, references);
                }
            }
            toml::Value::Table(table) => {
                if let Some(id) = table.get("glossary-id").and_then(toml::Value::as_str) {
                    references.insert(id.to_owned());
                }
                if table.get("kind").and_then(toml::Value::as_str) == Some("glossary") {
                    if let Some(id) = table.get("id").and_then(toml::Value::as_str) {
                        references.insert(id.to_owned());
                    }
                }
                for value in table.values() {
                    collect_glossary_references(value, references);
                }
            }
            _ => {}
        }
    }
}

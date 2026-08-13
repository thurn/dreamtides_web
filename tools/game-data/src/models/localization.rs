use std::collections::BTreeMap;

use anyhow::{Result, bail};
use trox::{LocalizedString, Pattern, RonPlaceholder, RonTx, SourceMessageRef};

pub fn source_message(value: &LocalizedString) -> Result<SourceMessageRef> {
    value.source_message_ref().map_err(Into::into)
}

pub fn source_value(value: &LocalizedString) -> Result<toml::Value> {
    toml::Value::try_from(source_message(value)?).map_err(Into::into)
}

pub fn source_transport_value(value: &LocalizedString) -> Result<toml::Value> {
    source_value(value)
}

pub fn source_text(value: &LocalizedString) -> Result<String> {
    if !value.arguments().is_empty() || !value.selectors().is_empty() {
        bail!("canonical game-data text must be a static Trox value");
    }
    let Pattern::Text { text } = &value.identity().pattern else {
        bail!("canonical game-data text must be a static Trox text pattern");
    };
    Ok(text.replace("{{", "{").replace("}}", "}"))
}

pub fn source_texts(values: Vec<LocalizedString>) -> Result<Vec<String>> {
    values.iter().map(source_text).collect()
}

pub fn source_transport_values(values: Vec<LocalizedString>) -> Result<Vec<toml::Value>> {
    values.iter().map(source_transport_value).collect()
}

pub fn joined_source_text(values: Vec<LocalizedString>, separator: &str) -> Result<String> {
    Ok(source_texts(values)?.join(separator))
}

pub fn localized_source(text: String) -> Result<LocalizedString> {
    let escaped = text.replace('{', "{{").replace('}', "}}");
    trox::tx_owned(escaped, None).map_err(Into::into)
}

pub fn localized_template_source(
    text: String,
    placeholder_contract: &BTreeMap<&str, RonPlaceholder>,
) -> Result<LocalizedString> {
    let placeholders = placeholder_contract
        .iter()
        .filter(|(name, _)| text.contains(&format!("{{{name}}}")))
        .map(|(name, schema)| ((*name).to_owned(), schema.clone()))
        .collect();
    RonTx {
        text,
        description: None,
        meaning: None,
        placeholders,
    }
    .into_localized_string()
    .map_err(Into::into)
}
